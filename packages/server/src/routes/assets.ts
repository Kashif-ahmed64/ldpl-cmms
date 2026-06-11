import { Router } from 'express';
import { AssetCategory, AssetStatus, Criticality } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  assetInclude,
  calculateCurrentValue,
  generateAssetTagNo,
  serializeAsset,
} from '../lib/assets.js';
import { writeAuditLog } from '../lib/audit.js';
import { requirePermission, HIERARCHY_LEVELS } from '../lib/permissions.js';
import { authenticate, getClientIp, type AuthRequest } from '../middleware/auth.js';

const router = Router();

const assetSchema = z.object({
  assetTagNo: z.string().optional(),
  name: z.string().min(2),
  category: z.nativeEnum(AssetCategory),
  parentId: z.string().uuid().nullable().optional(),
  hierarchyLevel: z.number().int().min(1).max(5),
  make: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  purchaseDate: z.string().optional().nullable(),
  purchaseCost: z.number().optional().nullable(),
  locationPath: z.string().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  status: z.nativeEnum(AssetStatus).optional(),
  criticality: z.nativeEnum(Criticality).optional(),
  warrantyExpiry: z.string().optional().nullable(),
  meterReading: z.number().optional().nullable(),
  meterUnit: z.string().optional(),
  notes: z.string().optional(),
});

const transferSchema = z.object({
  departmentId: z.string().uuid(),
  reason: z.string().min(3),
});

const decommissionSchema = z.object({
  reason: z.string().min(5),
});

router.use(authenticate);

function checkAssetPermission(req: AuthRequest, action: 'read' | 'create' | 'edit' | 'delete' | 'export') {
  if (!req.user || !requirePermission(req.user.role, 'assets', action)) {
    return false;
  }
  return true;
}

router.get('/meta', (_req, res) => {
  res.json({
    hierarchyLevels: HIERARCHY_LEVELS,
    categories: Object.values(AssetCategory),
    statuses: Object.values(AssetStatus),
    criticalityLevels: Object.values(Criticality),
  });
});

router.get('/tree', async (req: AuthRequest, res) => {
  if (!checkAssetPermission(req, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const roots = await prisma.asset.findMany({
    where: { deletedAt: null, parentId: null },
    include: {
      children: {
        where: { deletedAt: null },
        include: {
          children: {
            where: { deletedAt: null },
            select: { id: true, assetTagNo: true, name: true, hierarchyLevel: true, status: true },
          },
        },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  res.json({ tree: roots });
});

router.get('/lookup/:tag', async (req: AuthRequest, res) => {
  if (!checkAssetPermission(req, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const tag = req.params.tag.trim();
  const asset = await prisma.asset.findFirst({
    where: {
      deletedAt: null,
      OR: [{ assetTagNo: tag }, { assetTagNo: tag.toUpperCase() }],
    },
    include: assetInclude,
  });

  if (!asset) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }

  res.json({ asset: serializeAsset(asset) });
});

router.get('/staff', async (req: AuthRequest, res) => {
  if (!checkAssetPermission(req, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const staff = await prisma.user.findMany({
    where: { deletedAt: null, isActive: true, role: { in: ['engineer', 'technician', 'supervisor'] } },
    select: { id: true, fullName: true, username: true, role: true, designation: true },
    orderBy: { fullName: 'asc' },
  });

  res.json({ staff });
});

router.get('/', async (req: AuthRequest, res) => {
  if (!checkAssetPermission(req, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const { search, category, status, departmentId, hierarchyLevel, parentId } = req.query;

  const assets = await prisma.asset.findMany({
    where: {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: String(search), mode: 'insensitive' } },
              { assetTagNo: { contains: String(search), mode: 'insensitive' } },
              { serialNumber: { contains: String(search), mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(category ? { category: category as AssetCategory } : {}),
      ...(status ? { status: status as AssetStatus } : {}),
      ...(departmentId ? { departmentId: String(departmentId) } : {}),
      ...(hierarchyLevel ? { hierarchyLevel: Number(hierarchyLevel) } : {}),
      ...(parentId === 'null' ? { parentId: null } : parentId ? { parentId: String(parentId) } : {}),
    },
    include: assetInclude,
    orderBy: [{ hierarchyLevel: 'asc' }, { name: 'asc' }],
    take: 500,
  });

  res.json({ assets: assets.map(serializeAsset) });
});

router.get('/next-tag', async (req: AuthRequest, res) => {
  if (!checkAssetPermission(req, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const tag = await generateAssetTagNo();
  res.json({ assetTagNo: tag });
});

router.get('/:id', async (req: AuthRequest, res) => {
  if (!checkAssetPermission(req, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const asset = await prisma.asset.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: assetInclude,
  });

  if (!asset) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }

  res.json({ asset: serializeAsset(asset) });
});

router.post('/', async (req: AuthRequest, res) => {
  if (!checkAssetPermission(req, 'create')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const parsed = assetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const data = parsed.data;
  const assetTagNo = data.assetTagNo?.trim() || (await generateAssetTagNo());

  const existing = await prisma.asset.findUnique({ where: { assetTagNo } });
  if (existing) {
    res.status(409).json({ error: 'Asset tag number already exists' });
    return;
  }

  if (data.parentId) {
    const parent = await prisma.asset.findFirst({ where: { id: data.parentId, deletedAt: null } });
    if (!parent) {
      res.status(400).json({ error: 'Parent asset not found' });
      return;
    }
    if (data.hierarchyLevel <= parent.hierarchyLevel) {
      res.status(400).json({ error: 'Child hierarchy level must be greater than parent' });
      return;
    }
  }

  const purchaseDate = data.purchaseDate ? new Date(data.purchaseDate) : null;
  const purchaseCost = data.purchaseCost ?? null;
  const currentValue = calculateCurrentValue(
    purchaseCost != null ? purchaseCost : null,
    purchaseDate,
  );

  const asset = await prisma.asset.create({
    data: {
      assetTagNo,
      name: data.name,
      category: data.category,
      parentId: data.parentId ?? null,
      hierarchyLevel: data.hierarchyLevel,
      make: data.make,
      model: data.model,
      serialNumber: data.serialNumber,
      purchaseDate,
      purchaseCost,
      currentValue,
      locationPath: data.locationPath,
      departmentId: data.departmentId ?? null,
      assignedToId: data.assignedToId ?? null,
      status: data.status ?? AssetStatus.active,
      criticality: data.criticality ?? Criticality.medium,
      warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null,
      meterReading: data.meterReading,
      meterUnit: data.meterUnit,
      notes: data.notes,
      createdById: req.user!.userId,
    },
    include: assetInclude,
  });

  await writeAuditLog({
    userId: req.user!.userId,
    module: 'assets',
    action: 'CREATE',
    recordId: asset.id,
    ipAddress: getClientIp(req),
    newValue: serializeAsset(asset),
  });

  res.status(201).json({ asset: serializeAsset(asset) });
});

router.patch('/:id', async (req: AuthRequest, res) => {
  if (!checkAssetPermission(req, 'edit')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const parsed = assetSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.asset.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: assetInclude,
  });

  if (!existing) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }

  const data = parsed.data;
  const purchaseDate =
    data.purchaseDate !== undefined
      ? data.purchaseDate
        ? new Date(data.purchaseDate)
        : null
      : existing.purchaseDate;
  const purchaseCost = data.purchaseCost !== undefined ? data.purchaseCost : existing.purchaseCost;

  const asset = await prisma.asset.update({
    where: { id: req.params.id },
    data: {
      ...data,
      purchaseDate,
      purchaseCost,
      currentValue: calculateCurrentValue(
        purchaseCost != null ? Number(purchaseCost) : null,
        purchaseDate,
      ),
      warrantyExpiry:
        data.warrantyExpiry !== undefined
          ? data.warrantyExpiry
            ? new Date(data.warrantyExpiry)
            : null
          : undefined,
    },
    include: assetInclude,
  });

  await writeAuditLog({
    userId: req.user!.userId,
    module: 'assets',
    action: 'UPDATE',
    recordId: asset.id,
    ipAddress: getClientIp(req),
    oldValue: serializeAsset(existing),
    newValue: serializeAsset(asset),
  });

  res.json({ asset: serializeAsset(asset) });
});

router.post('/:id/transfer', async (req: AuthRequest, res) => {
  if (!checkAssetPermission(req, 'edit')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.asset.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: assetInclude,
  });

  if (!existing) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }

  const asset = await prisma.asset.update({
    where: { id: req.params.id },
    data: { departmentId: parsed.data.departmentId },
    include: assetInclude,
  });

  await writeAuditLog({
    userId: req.user!.userId,
    module: 'assets',
    action: 'UPDATE',
    recordId: asset.id,
    ipAddress: getClientIp(req),
    oldValue: { departmentId: existing.departmentId, action: 'transfer' },
    newValue: { departmentId: parsed.data.departmentId, reason: parsed.data.reason },
  });

  res.json({ asset: serializeAsset(asset), message: 'Asset transferred successfully' });
});

router.post('/:id/decommission', async (req: AuthRequest, res) => {
  if (!checkAssetPermission(req, 'edit')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const parsed = decommissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.asset.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: assetInclude,
  });

  if (!existing) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }

  const asset = await prisma.asset.update({
    where: { id: req.params.id },
    data: {
      status: AssetStatus.decommissioned,
      decommissionReason: parsed.data.reason,
    },
    include: assetInclude,
  });

  await writeAuditLog({
    userId: req.user!.userId,
    module: 'assets',
    action: 'UPDATE',
    recordId: asset.id,
    ipAddress: getClientIp(req),
    oldValue: { status: existing.status },
    newValue: { status: 'decommissioned', reason: parsed.data.reason },
  });

  res.json({ asset: serializeAsset(asset), message: 'Asset decommissioned' });
});

export default router;

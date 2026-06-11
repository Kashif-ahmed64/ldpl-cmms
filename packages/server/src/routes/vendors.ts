import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { generateVendorCode, serializeVendor, vendorInclude } from '../lib/purchasing.js';
import { writeAuditLog } from '../lib/audit.js';
import { authenticate, getClientIp, type AuthRequest } from '../middleware/auth.js';
import type { UserRole } from '@prisma/client';

const router = Router();

const vendorSchema = z.object({
  name: z.string().min(2),
  code: z.string().optional(),
  address: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  ntn: z.string().optional(),
  bankDetails: z.string().optional(),
  category: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  isBlacklisted: z.boolean().optional(),
  blacklistReason: z.string().optional(),
});

router.use(authenticate);

function canVendor(role: UserRole, action: 'read' | 'create' | 'edit') {
  const map: Record<string, UserRole[]> = {
    read: ['admin', 'manager', 'engineer', 'supervisor', 'storekeeper', 'viewer', 'hod'],
    create: ['admin', 'storekeeper'],
    edit: ['admin', 'storekeeper'],
  };
  return map[action]?.includes(role) ?? false;
}

router.get('/', async (req: AuthRequest, res) => {
  if (!canVendor(req.user!.role, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const vendors = await prisma.vendor.findMany({
    where: { deletedAt: null },
    include: vendorInclude,
    orderBy: { name: 'asc' },
  });
  res.json({ vendors: vendors.map((v) => serializeVendor(v as unknown as Record<string, unknown>)) });
});

router.get('/:id', async (req: AuthRequest, res) => {
  if (!canVendor(req.user!.role, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const vendor = await prisma.vendor.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { ...vendorInclude, purchaseOrders: { take: 10, orderBy: { createdAt: 'desc' } } },
  });
  if (!vendor) {
    res.status(404).json({ error: 'Vendor not found' });
    return;
  }
  res.json({ vendor: serializeVendor(vendor as unknown as Record<string, unknown>) });
});

router.post('/', async (req: AuthRequest, res) => {
  if (!canVendor(req.user!.role, 'create')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const parsed = vendorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const code = data.code?.trim() || (await generateVendorCode());
  const vendor = await prisma.vendor.create({
    data: {
      name: data.name,
      code,
      address: data.address,
      contactName: data.contactName,
      contactPhone: data.contactPhone,
      contactEmail: data.contactEmail || null,
      ntn: data.ntn,
      bankDetails: data.bankDetails,
      category: data.category,
      rating: data.rating,
      isBlacklisted: data.isBlacklisted ?? false,
      blacklistReason: data.blacklistReason,
    },
    include: vendorInclude,
  });
  await writeAuditLog({
    userId: req.user!.userId,
    module: 'vendors',
    action: 'CREATE',
    recordId: vendor.id,
    ipAddress: getClientIp(req),
    newValue: vendor,
  });
  res.status(201).json({ vendor: serializeVendor(vendor as unknown as Record<string, unknown>) });
});

router.patch('/:id', async (req: AuthRequest, res) => {
  if (!canVendor(req.user!.role, 'edit')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const parsed = vendorSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const vendor = await prisma.vendor.update({
    where: { id: req.params.id },
    data: { ...parsed.data, contactEmail: parsed.data.contactEmail || undefined },
    include: vendorInclude,
  });
  res.json({ vendor: serializeVendor(vendor as unknown as Record<string, unknown>) });
});

router.delete('/:id', async (req: AuthRequest, res) => {
  if (!canVendor(req.user!.role, 'edit')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const vendor = await prisma.vendor.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
    include: vendorInclude,
  });
  res.json({ message: 'Vendor deactivated', vendor: serializeVendor(vendor as unknown as Record<string, unknown>) });
});

export default router;

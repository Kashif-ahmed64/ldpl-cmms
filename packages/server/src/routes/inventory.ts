import { Router } from 'express';
import { InventoryCategory, InventoryTransactionType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  generateItemCode,
  itemInclude,
  INVENTORY_CATEGORIES,
  serializeItem,
  serializeTransaction,
  TRANSACTION_TYPES,
  UNITS_OF_MEASURE,
} from '../lib/inventory.js';
import { writeAuditLog } from '../lib/audit.js';
import { notifyRoles } from '../lib/notifications.js';
import { recalculateWoCost } from '../lib/workOrders.js';
import { authenticate, getClientIp, type AuthRequest } from '../middleware/auth.js';
import type { UserRole } from '@prisma/client';

const router = Router();

const itemSchema = z.object({
  itemCode: z.string().optional(),
  name: z.string().min(2),
  category: z.nativeEnum(InventoryCategory),
  unitOfMeasure: z.string().min(1),
  currentStock: z.number().min(0).optional(),
  minimumStock: z.number().min(0).optional(),
  maximumStock: z.number().min(0).optional().nullable(),
  reorderQuantity: z.number().min(0).optional().nullable(),
  unitCost: z.number().min(0).optional(),
  storeLocation: z.string().optional(),
  preferredVendorId: z.string().uuid().optional().nullable(),
  leadTimeDays: z.number().int().optional().nullable(),
  barcode: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  isCritical: z.boolean().optional(),
});

const transactionSchema = z.object({
  type: z.enum(['receipt', 'issue', 'return', 'adjustment', 'scrap', 'transfer']),
  quantity: z.number().min(0),
  unitCost: z.number().optional(),
  workOrderId: z.string().uuid().optional().nullable(),
  referenceNo: z.string().optional(),
  reason: z.string().optional(),
  newStoreLocation: z.string().optional(),
});

router.use(authenticate);

function canInv(role: UserRole, action: 'read' | 'create' | 'edit' | 'delete' | 'transact') {
  const map: Record<string, UserRole[]> = {
    read: ['admin', 'manager', 'engineer', 'supervisor', 'storekeeper', 'technician', 'viewer', 'hod'],
    create: ['admin', 'storekeeper'],
    edit: ['admin', 'storekeeper'],
    delete: ['admin', 'storekeeper'],
    transact: ['admin', 'storekeeper'],
  };
  return map[action]?.includes(role) ?? false;
}

router.get('/meta', (_req, res) => {
  res.json({
    categories: INVENTORY_CATEGORIES,
    unitsOfMeasure: UNITS_OF_MEASURE,
    transactionTypes: TRANSACTION_TYPES,
  });
});

router.get('/alerts', async (req: AuthRequest, res) => {
  if (!canInv(req.user!.role, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const items = await prisma.inventoryItem.findMany({
    where: { deletedAt: null },
    include: itemInclude,
  });

  const alerts = items
    .map(serializeItem)
    .filter((i) => i.stockStatus !== 'ok')
    .map((i) => ({
      itemId: i.id,
      itemCode: i.itemCode,
      name: i.name,
      currentStock: i.currentStock,
      minimumStock: i.minimumStock,
      status: i.stockStatus,
      isCritical: i.isCritical,
    }));

  res.json({ alerts });
});

router.get('/lookup/:code', async (req: AuthRequest, res) => {
  if (!canInv(req.user!.role, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const code = req.params.code.trim();
  const item = await prisma.inventoryItem.findFirst({
    where: {
      deletedAt: null,
      OR: [{ itemCode: code }, { barcode: code }],
    },
    include: itemInclude,
  });

  if (!item) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  res.json({ item: serializeItem(item) });
});

router.get('/next-code', async (req: AuthRequest, res) => {
  if (!canInv(req.user!.role, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const itemCode = await generateItemCode();
  res.json({ itemCode });
});

router.get('/', async (req: AuthRequest, res) => {
  if (!canInv(req.user!.role, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const { search, category, lowStock } = req.query;

  const items = await prisma.inventoryItem.findMany({
    where: {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: String(search), mode: 'insensitive' } },
              { itemCode: { contains: String(search), mode: 'insensitive' } },
              { barcode: { contains: String(search), mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(category ? { category: category as InventoryCategory } : {}),
    },
    include: itemInclude,
    orderBy: { name: 'asc' },
    take: 500,
  });

  let result = items.map(serializeItem);
  if (lowStock === 'true') {
    result = result.filter((i) => i.stockStatus === 'low' || i.stockStatus === 'zero' || i.stockStatus === 'critical_zero');
  }

  const totalValue = result.reduce((sum, i) => sum + i.totalStockValue, 0);

  res.json({ items: result, totalInventoryValue: Math.round(totalValue * 100) / 100 });
});

router.get('/vendors/list', async (req: AuthRequest, res) => {
  if (!canInv(req.user!.role, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const vendors = await prisma.vendor.findMany({
    where: { deletedAt: null, isBlacklisted: false },
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });
  res.json({ vendors });
});

router.get('/:id', async (req: AuthRequest, res) => {
  if (!canInv(req.user!.role, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const item = await prisma.inventoryItem.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: {
      ...itemInclude,
      transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });

  if (!item) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  res.json({
    item: serializeItem(item),
    transactions: item.transactions.map(serializeTransaction),
  });
});

router.post('/', async (req: AuthRequest, res) => {
  if (!canInv(req.user!.role, 'create')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const data = parsed.data;
  const itemCode = data.itemCode?.trim() || (await generateItemCode());

  const existing = await prisma.inventoryItem.findUnique({ where: { itemCode } });
  if (existing) {
    res.status(409).json({ error: 'Item code already exists' });
    return;
  }

  const item = await prisma.inventoryItem.create({
    data: {
      itemCode,
      name: data.name,
      category: data.category,
      unitOfMeasure: data.unitOfMeasure,
      currentStock: data.currentStock ?? 0,
      minimumStock: data.minimumStock ?? 0,
      maximumStock: data.maximumStock,
      reorderQuantity: data.reorderQuantity,
      unitCost: data.unitCost ?? 0,
      storeLocation: data.storeLocation,
      preferredVendorId: data.preferredVendorId ?? null,
      leadTimeDays: data.leadTimeDays,
      barcode: data.barcode || itemCode,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
      isCritical: data.isCritical ?? false,
    },
    include: itemInclude,
  });

  await writeAuditLog({
    userId: req.user!.userId,
    module: 'inventory',
    action: 'CREATE',
    recordId: item.id,
    ipAddress: getClientIp(req),
    newValue: serializeItem(item),
  });

  res.status(201).json({ item: serializeItem(item) });
});

router.patch('/:id', async (req: AuthRequest, res) => {
  if (!canInv(req.user!.role, 'edit')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const parsed = itemSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.inventoryItem.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: itemInclude,
  });

  if (!existing) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  const data = parsed.data;
  const item = await prisma.inventoryItem.update({
    where: { id: req.params.id },
    data: {
      ...data,
      expiryDate: data.expiryDate !== undefined
        ? data.expiryDate ? new Date(data.expiryDate) : null
        : undefined,
    },
    include: itemInclude,
  });

  await writeAuditLog({
    userId: req.user!.userId,
    module: 'inventory',
    action: 'UPDATE',
    recordId: item.id,
    ipAddress: getClientIp(req),
    oldValue: serializeItem(existing),
    newValue: serializeItem(item),
  });

  res.json({ item: serializeItem(item) });
});

router.post('/:id/transactions', async (req: AuthRequest, res) => {
  if (!canInv(req.user!.role, 'transact')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const parsed = transactionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const item = await prisma.inventoryItem.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: itemInclude,
  });

  if (!item) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  const { type, quantity, unitCost, workOrderId, referenceNo, reason, newStoreLocation } = parsed.data;

  if (type !== 'adjustment' && quantity <= 0) {
    res.status(400).json({ error: 'Quantity must be greater than zero' });
    return;
  }

  const current = Number(item.currentStock);
  let newStock = current;

  switch (type) {
    case 'receipt':
    case 'return':
      newStock = current + quantity;
      break;
    case 'issue':
    case 'scrap':
      if (current < quantity) {
        res.status(400).json({ error: `Insufficient stock. Available: ${current}` });
        return;
      }
      newStock = current - quantity;
      break;
    case 'adjustment':
      newStock = quantity;
      break;
    case 'transfer':
      if (!newStoreLocation) {
        res.status(400).json({ error: 'New store location required for transfer' });
        return;
      }
      break;
  }

  const txUnitCost = unitCost ?? Number(item.unitCost);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.inventoryTransaction.create({
      data: {
        inventoryItemId: item.id,
        type: type as InventoryTransactionType,
        quantity: type === 'adjustment' ? Math.abs(newStock - current) : quantity,
        unitCost: txUnitCost,
        workOrderId: workOrderId ?? null,
        referenceNo,
        reason,
        performedById: req.user!.userId,
      },
    });

    const updateData: Record<string, unknown> = {
      currentStock: newStock,
      unitCost: type === 'receipt' && unitCost ? unitCost : item.unitCost,
    };

    if (type === 'receipt') updateData.lastReceivedAt = now;
    if (type === 'issue') updateData.lastIssuedAt = now;
    if (type === 'transfer' && newStoreLocation) updateData.storeLocation = newStoreLocation;

    const updatedItem = await tx.inventoryItem.update({
      where: { id: item.id },
      data: updateData,
      include: itemInclude,
    });

    if (type === 'issue' && workOrderId) {
      const totalCost = quantity * txUnitCost;
      await tx.woPart.create({
        data: {
          workOrderId,
          inventoryItemId: item.id,
          quantity,
          unitCost: txUnitCost,
          totalCost,
        },
      });
    }

    if (type === 'return' && workOrderId) {
      await tx.woPart.deleteMany({
        where: { workOrderId, inventoryItemId: item.id },
      });
    }

    return { transaction, updatedItem };
  });

  if (workOrderId && (type === 'issue' || type === 'return')) {
    await recalculateWoCost(workOrderId);
  }

  const serialized = serializeItem(result.updatedItem);
  const io = req.app.get('io');

  if (serialized.stockStatus === 'low') {
    await notifyRoles(['storekeeper', 'hod'], {
      title: 'Low Stock Alert',
      message: `${item.itemCode} — ${item.name}: ${serialized.currentStock} remaining (min: ${serialized.minimumStock})`,
      type: 'warning',
      module: 'inventory',
      recordId: item.id,
      io,
    });
  }

  if (serialized.stockStatus === 'critical_zero') {
    await notifyRoles(['storekeeper', 'manager'], {
      title: 'Critical Item Out of Stock',
      message: `${item.itemCode} — ${item.name} is at zero stock`,
      type: 'critical',
      module: 'inventory',
      recordId: item.id,
      io,
    });
  }

  await writeAuditLog({
    userId: req.user!.userId,
    module: 'inventory',
    action: 'UPDATE',
    recordId: item.id,
    ipAddress: getClientIp(req),
    newValue: { transaction: type, quantity, newStock: serialized.currentStock },
  });

  res.status(201).json({
    item: serialized,
    transaction: serializeTransaction(result.transaction),
  });
});

router.delete('/:id', async (req: AuthRequest, res) => {
  if (!canInv(req.user!.role, 'delete')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const item = await prisma.inventoryItem.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
    include: itemInclude,
  });

  res.json({ message: 'Item deactivated', item: serializeItem(item) });
});

export default router;

import { Router } from 'express';
import { InventoryTransactionType, PurchaseOrderStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  generatePoNumber,
  generateGrnNumber,
  poInclude,
  serializePo,
} from '../lib/purchasing.js';
import { notifyRoles } from '../lib/notifications.js';
import { writeAuditLog } from '../lib/audit.js';
import { authenticate, getClientIp, type AuthRequest } from '../middleware/auth.js';
import type { UserRole } from '@prisma/client';

const router = Router();

const lineItemSchema = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  unitRate: z.number().min(0),
});

const poSchema = z.object({
  vendorId: z.string().uuid(),
  requisitionId: z.string().uuid().optional().nullable(),
  deliveryDate: z.string().optional().nullable(),
  terms: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1),
});

const receiveSchema = z.object({
  notes: z.string().optional(),
  items: z.array(
    z.object({
      poLineItemId: z.string().uuid(),
      quantityReceived: z.number().positive(),
    }),
  ).min(1),
});

router.use(authenticate);

function canPo(role: UserRole, action: 'read' | 'create' | 'approve' | 'receive') {
  const map: Record<string, UserRole[]> = {
    read: ['admin', 'manager', 'engineer', 'supervisor', 'storekeeper', 'viewer', 'hod'],
    create: ['admin', 'storekeeper'],
    approve: ['admin', 'manager'],
    receive: ['admin', 'storekeeper'],
  };
  return map[action]?.includes(role) ?? false;
}

router.get('/', async (req: AuthRequest, res) => {
  if (!canPo(req.user!.role, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const { status } = req.query;
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      deletedAt: null,
      ...(status ? { status: status as PurchaseOrderStatus } : {}),
    },
    include: poInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json({ orders: orders.map((po) => serializePo(po as unknown as Record<string, unknown>)) });
});

router.get('/:id', async (req: AuthRequest, res) => {
  if (!canPo(req.user!.role, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const order = await prisma.purchaseOrder.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: poInclude,
  });
  if (!order) {
    res.status(404).json({ error: 'Purchase order not found' });
    return;
  }
  res.json({ order: serializePo(order as unknown as Record<string, unknown>) });
});

router.post('/', async (req: AuthRequest, res) => {
  if (!canPo(req.user!.role, 'create')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const parsed = poSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const vendor = await prisma.vendor.findFirst({ where: { id: data.vendorId, deletedAt: null, isBlacklisted: false } });
  if (!vendor) {
    res.status(400).json({ error: 'Vendor not found or blacklisted' });
    return;
  }

  const poNumber = await generatePoNumber();
  const lineItemsData = data.lineItems.map((li) => ({
    inventoryItemId: li.inventoryItemId,
    quantity: li.quantity,
    unit: li.unit,
    unitRate: li.unitRate,
    totalAmount: li.quantity * li.unitRate,
  }));
  const totalAmount = lineItemsData.reduce((s, li) => s + li.totalAmount, 0);

  const order = await prisma.purchaseOrder.create({
    data: {
      poNumber,
      vendorId: data.vendorId,
      requisitionId: data.requisitionId ?? null,
      deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : null,
      terms: data.terms,
      status: PurchaseOrderStatus.draft,
      totalAmount,
      lineItems: { create: lineItemsData },
    },
    include: poInclude,
  });
  res.status(201).json({ order: serializePo(order as unknown as Record<string, unknown>) });
});

router.post('/:id/submit', async (req: AuthRequest, res) => {
  if (!canPo(req.user!.role, 'create')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const order = await prisma.purchaseOrder.update({
    where: { id: req.params.id },
    data: { status: PurchaseOrderStatus.submitted },
    include: poInclude,
  });
  const io = req.app.get('io');
  await notifyRoles(['manager'], {
    title: 'Purchase Order Submitted',
    message: `${order.poNumber} awaiting approval`,
    type: 'approval',
    module: 'purchase_orders',
    recordId: order.id,
    io,
  });
  res.json({ order: serializePo(order as unknown as Record<string, unknown>) });
});

router.post('/:id/approve', async (req: AuthRequest, res) => {
  if (!canPo(req.user!.role, 'approve')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const order = await prisma.purchaseOrder.update({
    where: { id: req.params.id },
    data: {
      status: PurchaseOrderStatus.approved,
      approvedById: req.user!.userId,
      approvedAt: new Date(),
    },
    include: poInclude,
  });
  res.json({ order: serializePo(order as unknown as Record<string, unknown>) });
});

router.post('/:id/order', async (req: AuthRequest, res) => {
  if (!canPo(req.user!.role, 'create')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const order = await prisma.purchaseOrder.update({
    where: { id: req.params.id },
    data: { status: PurchaseOrderStatus.ordered },
    include: poInclude,
  });
  res.json({ order: serializePo(order as unknown as Record<string, unknown>) });
});

router.post('/:id/receive', async (req: AuthRequest, res) => {
  if (!canPo(req.user!.role, 'receive')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const parsed = receiveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const order = await prisma.purchaseOrder.findFirst({
    where: {
      id: req.params.id,
      deletedAt: null,
      status: { in: [PurchaseOrderStatus.approved, PurchaseOrderStatus.ordered, PurchaseOrderStatus.partially_received] },
    },
    include: { lineItems: true },
  });

  if (!order) {
    res.status(400).json({ error: 'PO not found or not receivable' });
    return;
  }

  const grnNumber = await generateGrnNumber();

  await prisma.$transaction(async (tx) => {
    await tx.goodsReceivedNote.create({
      data: {
        grnNumber,
        purchaseOrderId: order.id,
        receivedById: req.user!.userId,
        notes: parsed.data.notes,
      },
    });

    for (const item of parsed.data.items) {
      const line = order.lineItems.find((l) => l.id === item.poLineItemId);
      if (!line) continue;

      await tx.inventoryTransaction.create({
        data: {
          inventoryItemId: line.inventoryItemId,
          type: InventoryTransactionType.receipt,
          quantity: item.quantityReceived,
          unitCost: line.unitRate,
          referenceNo: grnNumber,
          reason: `GRN receipt from ${order.poNumber}`,
          performedById: req.user!.userId,
        },
      });

      const invItem = await tx.inventoryItem.findUnique({ where: { id: line.inventoryItemId } });
      if (invItem) {
        await tx.inventoryItem.update({
          where: { id: line.inventoryItemId },
          data: {
            currentStock: Number(invItem.currentStock) + item.quantityReceived,
            unitCost: line.unitRate,
            lastReceivedAt: new Date(),
          },
        });
      }
    }

    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: { status: PurchaseOrderStatus.closed },
    });
  });

  const updated = await prisma.purchaseOrder.findUnique({
    where: { id: order.id },
    include: poInclude,
  });

  await writeAuditLog({
    userId: req.user!.userId,
    module: 'purchase_orders',
    action: 'UPDATE',
    recordId: order.id,
    ipAddress: getClientIp(req),
    newValue: { grnNumber, action: 'goods_received' },
  });

  res.json({ order: serializePo(updated as unknown as Record<string, unknown>), grnNumber });
});

export default router;

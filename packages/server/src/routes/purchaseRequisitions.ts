import { Router } from 'express';
import { PurchaseRequisitionStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { generatePrNumber, prInclude, serializePr } from '../lib/purchasing.js';
import { notifyRoles } from '../lib/notifications.js';
import { writeAuditLog } from '../lib/audit.js';
import { authenticate, getClientIp, type AuthRequest } from '../middleware/auth.js';
import type { UserRole } from '@prisma/client';

const router = Router();

const lineItemSchema = z.object({
  inventoryItemId: z.string().uuid().optional().nullable(),
  description: z.string().optional(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  estimatedUnitCost: z.number().optional(),
});

const prSchema = z.object({
  departmentId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1),
});

router.use(authenticate);

function canPr(role: UserRole, action: 'read' | 'create' | 'approve' | 'edit') {
  const map: Record<string, UserRole[]> = {
    read: ['admin', 'manager', 'engineer', 'supervisor', 'storekeeper', 'viewer', 'hod'],
    create: ['admin', 'storekeeper', 'engineer'],
    approve: ['admin', 'manager', 'hod', 'supervisor'],
    edit: ['admin', 'storekeeper'],
  };
  return map[action]?.includes(role) ?? false;
}

router.get('/', async (req: AuthRequest, res) => {
  if (!canPr(req.user!.role, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const { status } = req.query;
  const requisitions = await prisma.purchaseRequisition.findMany({
    where: {
      deletedAt: null,
      ...(status ? { status: status as PurchaseRequisitionStatus } : {}),
    },
    include: prInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json({ requisitions: requisitions.map((pr) => serializePr(pr as unknown as Record<string, unknown>)) });
});

router.get('/:id', async (req: AuthRequest, res) => {
  if (!canPr(req.user!.role, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const pr = await prisma.purchaseRequisition.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: prInclude,
  });
  if (!pr) {
    res.status(404).json({ error: 'Requisition not found' });
    return;
  }
  res.json({ requisition: serializePr(pr as unknown as Record<string, unknown>) });
});

router.post('/', async (req: AuthRequest, res) => {
  if (!canPr(req.user!.role, 'create')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const parsed = prSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const prNumber = await generatePrNumber();
  const pr = await prisma.purchaseRequisition.create({
    data: {
      prNumber,
      requestedById: req.user!.userId,
      departmentId: data.departmentId ?? null,
      notes: data.notes,
      status: PurchaseRequisitionStatus.draft,
      lineItems: {
        create: data.lineItems.map((li) => ({
          inventoryItemId: li.inventoryItemId ?? null,
          description: li.description,
          quantity: li.quantity,
          unit: li.unit,
          estimatedUnitCost: li.estimatedUnitCost,
        })),
      },
    },
    include: prInclude,
  });
  res.status(201).json({ requisition: serializePr(pr as unknown as Record<string, unknown>) });
});

router.post('/:id/submit', async (req: AuthRequest, res) => {
  if (!canPr(req.user!.role, 'create')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const pr = await prisma.purchaseRequisition.update({
    where: { id: req.params.id },
    data: { status: PurchaseRequisitionStatus.submitted },
    include: prInclude,
  });
  const io = req.app.get('io');
  await notifyRoles(['hod', 'supervisor', 'manager'], {
    title: 'Purchase Requisition Submitted',
    message: `${pr.prNumber} awaiting approval`,
    type: 'approval',
    module: 'purchase_requisitions',
    recordId: pr.id,
    io,
  });
  res.json({ requisition: serializePr(pr as unknown as Record<string, unknown>) });
});

router.post('/:id/approve', async (req: AuthRequest, res) => {
  if (!canPr(req.user!.role, 'approve')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const existing = await prisma.purchaseRequisition.findFirst({
    where: { id: req.params.id, status: PurchaseRequisitionStatus.submitted },
  });
  if (!existing) {
    res.status(400).json({ error: 'Requisition not found or not submitted' });
    return;
  }
  const pr = await prisma.purchaseRequisition.update({
    where: { id: req.params.id },
    data: {
      status: PurchaseRequisitionStatus.approved,
      approvedById: req.user!.userId,
      approvedAt: new Date(),
    },
    include: prInclude,
  });
  await writeAuditLog({
    userId: req.user!.userId,
    module: 'purchase_requisitions',
    action: 'UPDATE',
    recordId: pr.id,
    ipAddress: getClientIp(req),
    newValue: { status: 'approved' },
  });
  res.json({ requisition: serializePr(pr as unknown as Record<string, unknown>) });
});

router.post('/:id/reject', async (req: AuthRequest, res) => {
  if (!canPr(req.user!.role, 'approve')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const pr = await prisma.purchaseRequisition.update({
    where: { id: req.params.id },
    data: { status: PurchaseRequisitionStatus.rejected },
    include: prInclude,
  });
  res.json({ requisition: serializePr(pr as unknown as Record<string, unknown>) });
});

export default router;

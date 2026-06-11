import { Router } from 'express';
import {
  WorkOrderPriority,
  WorkOrderStatus,
  WorkOrderType,
  AssetStatus,
} from '@prisma/client';
import { z } from 'zod';
import type { Server } from 'socket.io';
import { prisma } from '../lib/prisma.js';
import {
  generateWoNumber,
  woInclude,
  serializeWorkOrder,
  recalculateWoCost,
} from '../lib/workOrders.js';
import { onPmWorkOrderCompleted } from '../lib/pmSchedule.js';
import { writeAuditLog } from '../lib/audit.js';
import { notifyUser, notifyRoles } from '../lib/notifications.js';
import { requirePermission, WO_TYPES, WO_PRIORITIES, WO_STATUSES } from '../lib/permissions.js';
import { authenticate, getClientIp, type AuthRequest } from '../middleware/auth.js';

const router = Router();

const createSchema = z.object({
  type: z.nativeEnum(WorkOrderType),
  priority: z.nativeEnum(WorkOrderPriority).optional(),
  assetId: z.string().uuid(),
  problemDescription: z.string().min(5),
  assignedToId: z.string().uuid().optional().nullable(),
  estimatedHours: z.number().optional(),
  plannedStartDate: z.string().optional().nullable(),
  plannedEndDate: z.string().optional().nullable(),
});

const assignSchema = z.object({
  assignedToId: z.string().uuid(),
  estimatedHours: z.number().optional(),
  plannedStartDate: z.string().optional().nullable(),
  plannedEndDate: z.string().optional().nullable(),
});

const completeSchema = z.object({
  rootCause: z.string().min(3),
  correctiveAction: z.string().min(3),
});

const laborSchema = z.object({
  startTime: z.string(),
  endTime: z.string().optional().nullable(),
  hours: z.number().optional(),
  description: z.string().optional(),
  isOvertime: z.boolean().optional(),
});

router.use(authenticate);

function getIo(req: AuthRequest): Server | undefined {
  return req.app.get('io') as Server | undefined;
}

function canReadAll(role: string) {
  return ['admin', 'manager', 'engineer', 'supervisor', 'storekeeper', 'viewer', 'hod'].includes(role);
}

function checkWoPermission(req: AuthRequest, action: Parameters<typeof requirePermission>[2]) {
  return req.user && requirePermission(req.user.role, 'work_orders', action);
}

router.get('/meta', (_req, res) => {
  res.json({
    types: WO_TYPES,
    priorities: WO_PRIORITIES,
    statuses: WO_STATUSES,
  });
});

router.get('/assignees', async (req: AuthRequest, res) => {
  if (!checkWoPermission(req, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const staff = await prisma.user.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      role: { in: ['technician', 'engineer', 'supervisor'] },
    },
    select: { id: true, fullName: true, username: true, role: true, designation: true },
    orderBy: { fullName: 'asc' },
  });

  res.json({ assignees: staff });
});

router.get('/', async (req: AuthRequest, res) => {
  if (!checkWoPermission(req, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const { search, status, type, priority, assetId, assignedToId, my } = req.query;
  const role = req.user!.role;
  const userId = req.user!.userId;

  const technicianFilter =
    role === 'technician' && my !== 'false'
      ? { OR: [{ assignedToId: userId }, { reportedById: userId }] }
      : {};

  const workOrders = await prisma.workOrder.findMany({
    where: {
      deletedAt: null,
      ...technicianFilter,
      ...(canReadAll(role) || role === 'technician' ? {} : { assignedToId: userId }),
      ...(search
        ? {
            OR: [
              { woNumber: { contains: String(search), mode: 'insensitive' } },
              { problemDescription: { contains: String(search), mode: 'insensitive' } },
              { asset: { name: { contains: String(search), mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(status ? { status: status as WorkOrderStatus } : {}),
      ...(type ? { type: type as WorkOrderType } : {}),
      ...(priority ? { priority: priority as WorkOrderPriority } : {}),
      ...(assetId ? { assetId: String(assetId) } : {}),
      ...(assignedToId ? { assignedToId: String(assignedToId) } : {}),
    },
    include: woInclude,
    orderBy: [{ priority: 'asc' }, { reportedAt: 'desc' }],
    take: 200,
  });

  res.json({ workOrders: workOrders.map(serializeWorkOrder) });
});

router.get('/:id', async (req: AuthRequest, res) => {
  if (!checkWoPermission(req, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const wo = await prisma.workOrder.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: woInclude,
  });

  if (!wo) {
    res.status(404).json({ error: 'Work order not found' });
    return;
  }

  if (
    req.user!.role === 'technician' &&
    wo.assignedToId !== req.user!.userId &&
    wo.reportedById !== req.user!.userId
  ) {
    res.status(403).json({ error: 'Not authorized to view this work order' });
    return;
  }

  res.json({ workOrder: serializeWorkOrder(wo) });
});

router.post('/', async (req: AuthRequest, res) => {
  if (!checkWoPermission(req, 'create')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const data = parsed.data;
  const asset = await prisma.asset.findFirst({ where: { id: data.assetId, deletedAt: null } });
  if (!asset) {
    res.status(400).json({ error: 'Asset not found' });
    return;
  }

  const woNumber = await generateWoNumber();
  const hasAssignee = !!data.assignedToId;

  const wo = await prisma.workOrder.create({
    data: {
      woNumber,
      type: data.type,
      priority: data.priority ?? WorkOrderPriority.medium,
      assetId: data.assetId,
      problemDescription: data.problemDescription,
      reportedById: req.user!.userId,
      assignedToId: data.assignedToId ?? null,
      assignedById: hasAssignee ? req.user!.userId : null,
      estimatedHours: data.estimatedHours,
      plannedStartDate: data.plannedStartDate ? new Date(data.plannedStartDate) : null,
      plannedEndDate: data.plannedEndDate ? new Date(data.plannedEndDate) : null,
      status: hasAssignee ? WorkOrderStatus.assigned : WorkOrderStatus.open,
    },
    include: woInclude,
  });

  if (asset.status === AssetStatus.active) {
    await prisma.asset.update({
      where: { id: asset.id },
      data: { status: AssetStatus.under_maintenance },
    });
  }

  const io = getIo(req);

  if (data.priority === WorkOrderPriority.critical) {
    await notifyRoles(['supervisor', 'engineer', 'manager'], {
      title: 'Critical Work Order Created',
      message: `${woNumber} — ${asset.name}: ${data.problemDescription.slice(0, 80)}`,
      type: 'critical',
      module: 'work_orders',
      recordId: wo.id,
      io,
    });
  }

  if (data.assignedToId) {
    await notifyUser({
      recipientId: data.assignedToId,
      title: 'Work Order Assigned',
      message: `You have been assigned ${woNumber}`,
      module: 'work_orders',
      recordId: wo.id,
      io,
    });
  }

  await writeAuditLog({
    userId: req.user!.userId,
    module: 'work_orders',
    action: 'CREATE',
    recordId: wo.id,
    ipAddress: getClientIp(req),
    newValue: serializeWorkOrder(wo),
  });

  res.status(201).json({ workOrder: serializeWorkOrder(wo) });
});

router.post('/:id/assign', async (req: AuthRequest, res) => {
  if (!checkWoPermission(req, 'assign')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.workOrder.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: woInclude,
  });

  if (!existing || !['open', 'assigned', 'on_hold'].includes(existing.status)) {
    res.status(400).json({ error: 'Work order cannot be assigned in current status' });
    return;
  }

  const wo = await prisma.workOrder.update({
    where: { id: req.params.id },
    data: {
      assignedToId: parsed.data.assignedToId,
      assignedById: req.user!.userId,
      estimatedHours: parsed.data.estimatedHours ?? existing.estimatedHours,
      plannedStartDate: parsed.data.plannedStartDate
        ? new Date(parsed.data.plannedStartDate)
        : existing.plannedStartDate,
      plannedEndDate: parsed.data.plannedEndDate
        ? new Date(parsed.data.plannedEndDate)
        : existing.plannedEndDate,
      status: WorkOrderStatus.assigned,
    },
    include: woInclude,
  });

  await notifyUser({
    recipientId: parsed.data.assignedToId,
    title: 'Work Order Assigned',
    message: `You have been assigned ${wo.woNumber}`,
    module: 'work_orders',
    recordId: wo.id,
    io: getIo(req),
  });

  await writeAuditLog({
    userId: req.user!.userId,
    module: 'work_orders',
    action: 'UPDATE',
    recordId: wo.id,
    ipAddress: getClientIp(req),
    oldValue: { status: existing.status, assignedToId: existing.assignedToId },
    newValue: { status: 'assigned', assignedToId: parsed.data.assignedToId },
  });

  res.json({ workOrder: serializeWorkOrder(wo) });
});

router.post('/:id/start', async (req: AuthRequest, res) => {
  const existing = await prisma.workOrder.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: woInclude,
  });

  if (!existing) {
    res.status(404).json({ error: 'Work order not found' });
    return;
  }

  const isAssignee = existing.assignedToId === req.user!.userId;
  const canStart =
    (checkWoPermission(req, 'update_assigned') && isAssignee) ||
    checkWoPermission(req, 'assign');

  if (!canStart) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  if (!['assigned', 'on_hold'].includes(existing.status)) {
    res.status(400).json({ error: 'Work order must be assigned or on hold to start' });
    return;
  }

  const wo = await prisma.workOrder.update({
    where: { id: req.params.id },
    data: {
      status: WorkOrderStatus.in_progress,
      actualStartAt: existing.actualStartAt ?? new Date(),
    },
    include: woInclude,
  });

  res.json({ workOrder: serializeWorkOrder(wo) });
});

router.post('/:id/hold', async (req: AuthRequest, res) => {
  const existing = await prisma.workOrder.findFirst({
    where: { id: req.params.id, deletedAt: null },
  });

  if (!existing || existing.status !== WorkOrderStatus.in_progress) {
    res.status(400).json({ error: 'Only in-progress work orders can be put on hold' });
    return;
  }

  const isAssignee = existing.assignedToId === req.user!.userId;
  if (!checkWoPermission(req, 'assign') && !(checkWoPermission(req, 'update_assigned') && isAssignee)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const wo = await prisma.workOrder.update({
    where: { id: req.params.id },
    data: { status: WorkOrderStatus.on_hold },
    include: woInclude,
  });

  res.json({ workOrder: serializeWorkOrder(wo) });
});

router.post('/:id/complete', async (req: AuthRequest, res) => {
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.workOrder.findFirst({
    where: { id: req.params.id, deletedAt: null },
  });

  if (!existing || !['in_progress', 'on_hold', 'assigned'].includes(existing.status)) {
    res.status(400).json({ error: 'Work order cannot be completed in current status' });
    return;
  }

  const isAssignee = existing.assignedToId === req.user!.userId;
  if (!checkWoPermission(req, 'assign') && !(checkWoPermission(req, 'update_assigned') && isAssignee)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const wo = await prisma.workOrder.update({
    where: { id: req.params.id },
    data: {
      status: WorkOrderStatus.pending_approval,
      actualEndAt: new Date(),
      rootCause: parsed.data.rootCause,
      correctiveAction: parsed.data.correctiveAction,
    },
    include: woInclude,
  });

  await recalculateWoCost(wo.id);

  await notifyRoles(['supervisor'], {
    title: 'Work Order Awaiting Approval',
    message: `${wo.woNumber} completed and needs supervisor sign-off`,
    type: 'approval',
    module: 'work_orders',
    recordId: wo.id,
    io: getIo(req),
  });

  const refreshed = await prisma.workOrder.findUnique({
    where: { id: wo.id },
    include: woInclude,
  });

  res.json({ workOrder: serializeWorkOrder(refreshed!) });
});

router.post('/:id/approve', async (req: AuthRequest, res) => {
  if (!checkWoPermission(req, 'approve')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const existing = await prisma.workOrder.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { asset: true },
  });

  if (!existing || existing.status !== WorkOrderStatus.pending_approval) {
    res.status(400).json({ error: 'Work order is not pending approval' });
    return;
  }

  const cost = await recalculateWoCost(existing.id);

  const wo = await prisma.workOrder.update({
    where: { id: req.params.id },
    data: {
      status: WorkOrderStatus.completed,
      supervisorSignOffAt: new Date(),
      supervisorSignOffBy: req.user!.userId,
      workOrderCost: cost,
    },
    include: woInclude,
  });

  await prisma.asset.update({
    where: { id: existing.assetId },
    data: {
      status: AssetStatus.active,
      lastMaintenanceAt: new Date(),
    },
  });

  if (existing.pmTemplateId && existing.type === WorkOrderType.PM) {
    await onPmWorkOrderCompleted(existing.pmTemplateId, new Date(), existing.assetId);
  }

  if (existing.assignedToId) {
    await notifyUser({
      recipientId: existing.assignedToId,
      title: 'Work Order Closed',
      message: `${wo.woNumber} has been approved and closed`,
      module: 'work_orders',
      recordId: wo.id,
      io: getIo(req),
    });
  }

  res.json({ workOrder: serializeWorkOrder(wo) });
});

router.post('/:id/reject', async (req: AuthRequest, res) => {
  if (!checkWoPermission(req, 'approve')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const existing = await prisma.workOrder.findFirst({
    where: { id: req.params.id, deletedAt: null },
  });

  if (!existing || existing.status !== WorkOrderStatus.pending_approval) {
    res.status(400).json({ error: 'Work order is not pending approval' });
    return;
  }

  const wo = await prisma.workOrder.update({
    where: { id: req.params.id },
    data: { status: WorkOrderStatus.in_progress, actualEndAt: null },
    include: woInclude,
  });

  if (existing.assignedToId) {
    await notifyUser({
      recipientId: existing.assignedToId,
      title: 'Work Order Sent Back',
      message: `${wo.woNumber} requires additional work`,
      type: 'warning',
      module: 'work_orders',
      recordId: wo.id,
      io: getIo(req),
    });
  }

  res.json({ workOrder: serializeWorkOrder(wo) });
});

router.post('/:id/cancel', async (req: AuthRequest, res) => {
  if (!checkWoPermission(req, 'edit') && !checkWoPermission(req, 'delete')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const existing = await prisma.workOrder.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { asset: true },
  });

  if (!existing || existing.status === WorkOrderStatus.completed) {
    res.status(400).json({ error: 'Work order cannot be cancelled' });
    return;
  }

  const wo = await prisma.workOrder.update({
    where: { id: req.params.id },
    data: { status: WorkOrderStatus.cancelled },
    include: woInclude,
  });

  const openWos = await prisma.workOrder.count({
    where: {
      assetId: existing.assetId,
      deletedAt: null,
      status: { notIn: [WorkOrderStatus.completed, WorkOrderStatus.cancelled] },
      id: { not: existing.id },
    },
  });

  if (openWos === 0 && existing.asset.status === AssetStatus.under_maintenance) {
    await prisma.asset.update({
      where: { id: existing.assetId },
      data: { status: AssetStatus.active },
    });
  }

  res.json({ workOrder: serializeWorkOrder(wo) });
});

router.post('/:id/labor', async (req: AuthRequest, res) => {
  const parsed = laborSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.workOrder.findFirst({
    where: { id: req.params.id, deletedAt: null },
  });

  if (!existing) {
    res.status(404).json({ error: 'Work order not found' });
    return;
  }

  const isAssignee = existing.assignedToId === req.user!.userId;
  if (!checkWoPermission(req, 'assign') && !(checkWoPermission(req, 'update_assigned') && isAssignee)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const startTime = new Date(parsed.data.startTime);
  const endTime = parsed.data.endTime ? new Date(parsed.data.endTime) : null;
  let hours = parsed.data.hours;
  if (!hours && endTime) {
    hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    hours = Math.round(hours * 100) / 100;
  }

  await prisma.woLabor.create({
    data: {
      workOrderId: existing.id,
      userId: req.user!.userId,
      startTime,
      endTime,
      hours,
      description: parsed.data.description,
      isOvertime: parsed.data.isOvertime ?? false,
    },
  });

  await recalculateWoCost(existing.id);

  const wo = await prisma.workOrder.findUnique({
    where: { id: existing.id },
    include: woInclude,
  });

  res.status(201).json({ workOrder: serializeWorkOrder(wo!) });
});

export default router;

import { Router } from 'express';
import type { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { computeKpis, parseDateRange } from '../lib/reports.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

function canReadReports(_role: UserRole) {
  return true;
}

function fmtDate(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : '';
}

function fmtDateTime(d: Date | null | undefined) {
  return d ? d.toISOString().replace('T', ' ').slice(0, 19) : '';
}

router.get('/kpis', async (req: AuthRequest, res) => {
  if (!canReadReports(req.user!.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  const kpis = await computeKpis();
  res.json({ kpis });
});

router.get('/work-orders', async (req: AuthRequest, res) => {
  const { from, to, type, status, assetId } = req.query;
  const range = parseDateRange(from as string, to as string);

  const wos = await prisma.workOrder.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: range.from, lte: range.to },
      ...(type ? { type: type as never } : {}),
      ...(status ? { status: status as never } : {}),
      ...(assetId ? { assetId: assetId as string } : {}),
    },
    include: {
      asset: { select: { assetTagNo: true, name: true } },
      assignedTo: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const columns = [
    { key: 'woNumber', label: 'WO Number' },
    { key: 'type', label: 'Type' },
    { key: 'priority', label: 'Priority' },
    { key: 'status', label: 'Status' },
    { key: 'asset', label: 'Asset' },
    { key: 'assignee', label: 'Assignee' },
    { key: 'reportedAt', label: 'Reported' },
    { key: 'completedAt', label: 'Completed' },
    { key: 'cost', label: 'Cost (PKR)' },
  ];

  const rows = wos.map((wo) => ({
    woNumber: wo.woNumber,
    type: wo.type,
    priority: wo.priority,
    status: wo.status,
    asset: `${wo.asset.assetTagNo} — ${wo.asset.name}`,
    assignee: wo.assignedTo?.fullName ?? '—',
    reportedAt: fmtDate(wo.reportedAt),
    completedAt: fmtDate(wo.actualEndAt),
    cost: wo.workOrderCost ? Number(wo.workOrderCost) : '',
  }));

  res.json({ report: 'work-orders', columns, rows, filters: { from: range.from, to: range.to } });
});

router.get('/pm-compliance', async (req: AuthRequest, res) => {
  const range = parseDateRange(req.query.from as string, req.query.to as string);

  const wos = await prisma.workOrder.findMany({
    where: {
      deletedAt: null,
      type: 'PM',
      status: 'completed',
      actualEndAt: { gte: range.from, lte: range.to },
    },
    include: {
      asset: { select: { assetTagNo: true, name: true, category: true } },
      pmTemplate: { select: { name: true } },
    },
    orderBy: { actualEndAt: 'desc' },
    take: 500,
  });

  const columns = [
    { key: 'woNumber', label: 'WO Number' },
    { key: 'asset', label: 'Asset' },
    { key: 'category', label: 'Category' },
    { key: 'pmTemplate', label: 'PM Template' },
    { key: 'plannedEnd', label: 'Planned End' },
    { key: 'actualEnd', label: 'Actual End' },
    { key: 'onTime', label: 'On Time' },
  ];

  const rows = wos.map((wo) => {
    const onTime =
      wo.plannedEndDate && wo.actualEndAt ? wo.actualEndAt <= wo.plannedEndDate : true;
    return {
      woNumber: wo.woNumber,
      asset: `${wo.asset.assetTagNo} — ${wo.asset.name}`,
      category: wo.asset.category,
      pmTemplate: wo.pmTemplate?.name ?? '—',
      plannedEnd: fmtDate(wo.plannedEndDate),
      actualEnd: fmtDate(wo.actualEndAt),
      onTime: onTime ? 'Yes' : 'No',
    };
  });

  const onTimeCount = rows.filter((r) => r.onTime === 'Yes').length;
  res.json({
    report: 'pm-compliance',
    columns,
    rows,
    summary: {
      total: rows.length,
      onTime: onTimeCount,
      complianceRate: rows.length ? Math.round((onTimeCount / rows.length) * 1000) / 10 : 100,
    },
  });
});

router.get('/maintenance-cost', async (req: AuthRequest, res) => {
  const range = parseDateRange(req.query.from as string, req.query.to as string);

  const wos = await prisma.workOrder.findMany({
    where: {
      deletedAt: null,
      status: 'completed',
      actualEndAt: { gte: range.from, lte: range.to },
    },
    include: {
      asset: { select: { assetTagNo: true, name: true, department: { select: { name: true } } } },
    },
    orderBy: { actualEndAt: 'desc' },
    take: 500,
  });

  const columns = [
    { key: 'woNumber', label: 'WO Number' },
    { key: 'type', label: 'Type' },
    { key: 'asset', label: 'Asset' },
    { key: 'department', label: 'Department' },
    { key: 'completedAt', label: 'Completed' },
    { key: 'cost', label: 'Cost (PKR)' },
  ];

  const rows = wos.map((wo) => ({
    woNumber: wo.woNumber,
    type: wo.type,
    asset: `${wo.asset.assetTagNo} — ${wo.asset.name}`,
    department: wo.asset.department?.name ?? '—',
    completedAt: fmtDate(wo.actualEndAt),
    cost: Number(wo.workOrderCost ?? 0),
  }));

  const totalCost = rows.reduce((s, r) => s + (r.cost as number), 0);
  res.json({ report: 'maintenance-cost', columns, rows, summary: { totalCost } });
});

router.get('/inventory-valuation', async (req: AuthRequest, res) => {
  const category = req.query.category as string | undefined;

  const items = await prisma.inventoryItem.findMany({
    where: { deletedAt: null, ...(category ? { category: category as never } : {}) },
    include: { preferredVendor: { select: { name: true } } },
    orderBy: { itemCode: 'asc' },
  });

  const columns = [
    { key: 'itemCode', label: 'Item Code' },
    { key: 'name', label: 'Name' },
    { key: 'category', label: 'Category' },
    { key: 'stock', label: 'Stock' },
    { key: 'unit', label: 'Unit' },
    { key: 'unitCost', label: 'Unit Cost' },
    { key: 'totalValue', label: 'Total Value' },
    { key: 'location', label: 'Location' },
  ];

  const rows = items.map((i) => ({
    itemCode: i.itemCode,
    name: i.name,
    category: i.category,
    stock: Number(i.currentStock),
    unit: i.unitOfMeasure,
    unitCost: Number(i.unitCost),
    totalValue: Math.round(Number(i.currentStock) * Number(i.unitCost) * 100) / 100,
    location: i.storeLocation ?? '—',
  }));

  const totalValue = rows.reduce((s, r) => s + (r.totalValue as number), 0);
  res.json({ report: 'inventory-valuation', columns, rows, summary: { totalValue } });
});

router.get('/stock-movement', async (req: AuthRequest, res) => {
  const range = parseDateRange(req.query.from as string, req.query.to as string);
  const txType = req.query.type as string | undefined;

  const txs = await prisma.inventoryTransaction.findMany({
    where: {
      createdAt: { gte: range.from, lte: range.to },
      ...(txType ? { type: txType as never } : {}),
    },
    include: { inventoryItem: { select: { itemCode: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const columns = [
    { key: 'date', label: 'Date' },
    { key: 'item', label: 'Item' },
    { key: 'type', label: 'Type' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'unitCost', label: 'Unit Cost' },
    { key: 'reference', label: 'Reference' },
    { key: 'reason', label: 'Reason' },
  ];

  const rows = txs.map((tx) => ({
    date: fmtDateTime(tx.createdAt),
    item: `${tx.inventoryItem.itemCode} — ${tx.inventoryItem.name}`,
    type: tx.type,
    quantity: Number(tx.quantity),
    unitCost: tx.unitCost ? Number(tx.unitCost) : '',
    reference: tx.referenceNo ?? '—',
    reason: tx.reason ?? '—',
  }));

  res.json({ report: 'stock-movement', columns, rows });
});

router.get('/purchase-orders', async (req: AuthRequest, res) => {
  const range = parseDateRange(req.query.from as string, req.query.to as string);
  const status = req.query.status as string | undefined;

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: range.from, lte: range.to },
      ...(status ? { status: status as never } : {}),
    },
    include: { vendor: { select: { name: true, code: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const columns = [
    { key: 'poNumber', label: 'PO Number' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'status', label: 'Status' },
    { key: 'orderDate', label: 'Order Date' },
    { key: 'totalAmount', label: 'Amount (PKR)' },
  ];

  const rows = orders.map((po) => ({
    poNumber: po.poNumber,
    vendor: po.vendor.name,
    status: po.status,
    orderDate: fmtDate(po.orderDate),
    totalAmount: Number(po.totalAmount),
  }));

  const totalAmount = rows.reduce((s, r) => s + (r.totalAmount as number), 0);
  res.json({ report: 'purchase-orders', columns, rows, summary: { totalAmount } });
});

router.get('/labor-hours', async (req: AuthRequest, res) => {
  const range = parseDateRange(req.query.from as string, req.query.to as string);

  const entries = await prisma.woLabor.findMany({
    where: { startTime: { gte: range.from, lte: range.to } },
    include: {
      user: { select: { fullName: true, employeeId: true } },
      workOrder: { select: { woNumber: true, type: true } },
    },
    orderBy: { startTime: 'desc' },
    take: 500,
  });

  const columns = [
    { key: 'technician', label: 'Technician' },
    { key: 'woNumber', label: 'WO Number' },
    { key: 'woType', label: 'WO Type' },
    { key: 'startTime', label: 'Start' },
    { key: 'hours', label: 'Hours' },
    { key: 'overtime', label: 'Overtime' },
    { key: 'description', label: 'Description' },
  ];

  const rows = entries.map((e) => ({
    technician: e.user.fullName,
    woNumber: e.workOrder.woNumber,
    woType: e.workOrder.type,
    startTime: fmtDateTime(e.startTime),
    hours: e.hours ? Number(e.hours) : '',
    overtime: e.isOvertime ? 'Yes' : 'No',
    description: e.description ?? '—',
  }));

  const totalHours = entries.reduce((s, e) => s + Number(e.hours ?? 0), 0);
  res.json({ report: 'labor-hours', columns, rows, summary: { totalHours: Math.round(totalHours * 10) / 10 } });
});

router.get('/audit-trail', async (req: AuthRequest, res) => {
  if (!['admin', 'manager'].includes(req.user!.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const range = parseDateRange(req.query.from as string, req.query.to as string);
  const module = req.query.module as string | undefined;

  const logs = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: range.from, lte: range.to },
      ...(module ? { module } : {}),
    },
    include: { user: { select: { fullName: true, username: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const columns = [
    { key: 'timestamp', label: 'Timestamp' },
    { key: 'user', label: 'User' },
    { key: 'module', label: 'Module' },
    { key: 'action', label: 'Action' },
    { key: 'recordId', label: 'Record ID' },
    { key: 'result', label: 'Result' },
  ];

  const rows = logs.map((l) => ({
    timestamp: fmtDateTime(l.createdAt),
    user: l.user?.fullName ?? 'System',
    module: l.module,
    action: l.action,
    recordId: l.recordId ?? '—',
    result: l.result,
  }));

  res.json({ report: 'audit-trail', columns, rows });
});

router.get('/warranty-expiry', async (_req: AuthRequest, res) => {
  const now = new Date();
  const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const assets = await prisma.asset.findMany({
    where: {
      deletedAt: null,
      warrantyExpiry: { gte: now, lte: in90 },
    },
    include: { department: { select: { name: true } } },
    orderBy: { warrantyExpiry: 'asc' },
  });

  const columns = [
    { key: 'assetTag', label: 'Asset Tag' },
    { key: 'name', label: 'Name' },
    { key: 'category', label: 'Category' },
    { key: 'department', label: 'Department' },
    { key: 'warrantyExpiry', label: 'Warranty Expiry' },
    { key: 'daysRemaining', label: 'Days Remaining' },
  ];

  const rows = assets.map((a) => {
    const days = a.warrantyExpiry
      ? Math.ceil((a.warrantyExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    return {
      assetTag: a.assetTagNo,
      name: a.name,
      category: a.category,
      department: a.department?.name ?? '—',
      warrantyExpiry: fmtDate(a.warrantyExpiry),
      daysRemaining: days,
    };
  });

  res.json({ report: 'warranty-expiry', columns, rows });
});

router.get('/pm-forecast', async (_req: AuthRequest, res) => {
  const now = new Date();
  const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const templates = await prisma.pmTemplate.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      nextDueDate: { gte: now, lte: in90 },
    },
    include: { asset: { select: { assetTagNo: true, name: true } } },
    orderBy: { nextDueDate: 'asc' },
  });

  const columns = [
    { key: 'template', label: 'PM Template' },
    { key: 'asset', label: 'Asset' },
    { key: 'frequency', label: 'Frequency' },
    { key: 'nextDueDate', label: 'Next Due' },
    { key: 'daysUntil', label: 'Days Until Due' },
  ];

  const rows = templates.map((t) => {
    const days = t.nextDueDate
      ? Math.ceil((t.nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    return {
      template: t.name,
      asset: t.asset ? `${t.asset.assetTagNo} — ${t.asset.name}` : 'Category-wide',
      frequency: t.frequency,
      nextDueDate: fmtDate(t.nextDueDate),
      daysUntil: days,
    };
  });

  res.json({ report: 'pm-forecast', columns, rows });
});

export default router;

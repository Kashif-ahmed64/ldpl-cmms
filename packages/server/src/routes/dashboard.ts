import { Router } from 'express';
import { authenticate, authorize, type AuthRequest } from '../middleware/auth.js';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.use(authenticate);

router.get('/', authorize(UserRole.admin), async (_req, res) => {
  const logs = await prisma.auditLog.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, fullName: true, username: true, role: true } },
    },
  });
  res.json({ logs });
});

router.get('/stats', async (req: AuthRequest, res) => {
  const role = req.user!.role;

  const [
    userCount,
    departmentCount,
    auditCount,
    assetCount,
    openWoCount,
    pmTemplateCount,
    inventoryCount,
    inventoryValue,
    vendorCount,
    pendingPrCount,
    openPoCount,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null, isActive: true } }),
    prisma.department.count({ where: { deletedAt: null, isActive: true } }),
    prisma.auditLog.count(),
    prisma.asset.count({ where: { deletedAt: null } }),
    prisma.workOrder.count({
      where: { deletedAt: null, status: { notIn: ['completed', 'cancelled'] } },
    }),
    prisma.pmTemplate.count({ where: { deletedAt: null, isActive: true } }),
    prisma.inventoryItem.count({ where: { deletedAt: null } }),
    prisma.inventoryItem.findMany({ where: { deletedAt: null }, select: { currentStock: true, unitCost: true } }),
    prisma.vendor.count({ where: { deletedAt: null } }),
    prisma.purchaseRequisition.count({
      where: { deletedAt: null, status: { in: ['draft', 'submitted'] } },
    }),
    prisma.purchaseOrder.count({
      where: { deletedAt: null, status: { notIn: ['closed', 'cancelled'] } },
    }),
  ]);

  const totalInvValue = inventoryValue.reduce(
    (sum, i) => sum + Number(i.currentStock) * Number(i.unitCost),
    0,
  );

  res.json({
    stats: {
      activeUsers: userCount,
      departments: departmentCount,
      auditLogEntries: auditCount,
      assets: assetCount,
      openWorkOrders: openWoCount,
      activePmTemplates: pmTemplateCount,
      inventoryItems: inventoryCount,
      inventoryValue: Math.round(totalInvValue * 100) / 100,
      vendors: vendorCount,
      pendingRequisitions: pendingPrCount,
      openPurchaseOrders: openPoCount,
      role,
      phase: 'Phase 9 — Production Ready',
    },
  });
});

export default router;

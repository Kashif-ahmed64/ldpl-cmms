import { prisma } from './prisma.js';

export interface DateRange {
  from: Date;
  to: Date;
}

export function parseDateRange(fromStr?: string, toStr?: string): DateRange {
  const now = new Date();
  const from = fromStr ? new Date(fromStr) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = toStr ? new Date(toStr) : now;
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export function monthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const header = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(',');
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const val = row[c.key];
        if (val == null) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(','),
  );
  return [header, ...lines].join('\n');
}

export async function computeKpis() {
  const now = new Date();
  const monthFrom = monthStart();

  const [
    openWOs,
    completedThisMonth,
    createdThisMonth,
    completedCM,
    pmCompleted,
    maintenanceCosts,
    inventoryItems,
    openPOs,
    overdueWOs,
    topAssetsRaw,
  ] = await Promise.all([
    prisma.workOrder.groupBy({
      by: ['priority', 'type'],
      where: { deletedAt: null, status: { notIn: ['completed', 'cancelled'] } },
      _count: true,
    }),
    prisma.workOrder.count({
      where: {
        deletedAt: null,
        status: 'completed',
        actualEndAt: { gte: monthFrom },
      },
    }),
    prisma.workOrder.count({
      where: { deletedAt: null, createdAt: { gte: monthFrom } },
    }),
    prisma.workOrder.findMany({
      where: {
        deletedAt: null,
        type: 'CM',
        status: 'completed',
        actualStartAt: { not: null },
        actualEndAt: { not: null },
      },
      select: {
        actualStartAt: true,
        actualEndAt: true,
        asset: { select: { category: true, id: true, assetTagNo: true, name: true } },
      },
    }),
    prisma.workOrder.count({
      where: {
        deletedAt: null,
        type: 'PM',
        status: 'completed',
        actualEndAt: { gte: monthFrom },
      },
    }),
    prisma.workOrder.aggregate({
      where: {
        deletedAt: null,
        status: 'completed',
        actualEndAt: { gte: monthFrom },
      },
      _sum: { workOrderCost: true },
    }),
    prisma.inventoryItem.findMany({
      where: { deletedAt: null },
      select: { currentStock: true, unitCost: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { deletedAt: null, status: { notIn: ['closed', 'cancelled'] } },
      select: { totalAmount: true },
    }),
    prisma.workOrder.count({
      where: {
        deletedAt: null,
        status: { notIn: ['completed', 'cancelled'] },
        plannedEndDate: { lt: now },
      },
    }),
    prisma.workOrder.groupBy({
      by: ['assetId'],
      where: { deletedAt: null, type: 'CM' },
      _count: true,
      orderBy: { _count: { assetId: 'desc' } },
      take: 10,
    }),
  ]);

  const openByPriority: Record<string, number> = {};
  const openByType: Record<string, number> = {};
  for (const row of openWOs) {
    openByPriority[row.priority] = (openByPriority[row.priority] ?? 0) + row._count;
    openByType[row.type] = (openByType[row.type] ?? 0) + row._count;
  }

  const mttrByCategory: Record<string, { totalHours: number; count: number }> = {};
  for (const wo of completedCM) {
    if (!wo.actualStartAt || !wo.actualEndAt) continue;
    const cat = wo.asset.category;
    const hrs = hoursBetween(wo.actualStartAt, wo.actualEndAt);
    if (!mttrByCategory[cat]) mttrByCategory[cat] = { totalHours: 0, count: 0 };
    mttrByCategory[cat].totalHours += hrs;
    mttrByCategory[cat].count += 1;
  }

  const mttrChart = Object.entries(mttrByCategory).map(([category, v]) => ({
    category,
    mttrHours: Math.round((v.totalHours / v.count) * 10) / 10,
  }));

  const cmByAsset = await prisma.workOrder.findMany({
    where: { deletedAt: null, type: 'CM', status: 'completed' },
    select: {
      assetId: true,
      reportedAt: true,
      actualEndAt: true,
      asset: { select: { assetTagNo: true, name: true } },
    },
    orderBy: { reportedAt: 'asc' },
  });

  const assetCmMap: Record<string, { tag: string; name: string; dates: Date[] }> = {};
  for (const wo of cmByAsset) {
    if (!assetCmMap[wo.assetId]) {
      assetCmMap[wo.assetId] = { tag: wo.asset.assetTagNo, name: wo.asset.name, dates: [] };
    }
    assetCmMap[wo.assetId].dates.push(wo.reportedAt);
  }

  const mtbfChart = Object.values(assetCmMap)
    .map((a) => {
      if (a.dates.length < 2) return null;
      let totalDays = 0;
      for (let i = 1; i < a.dates.length; i++) {
        totalDays += (a.dates[i].getTime() - a.dates[i - 1].getTime()) / (1000 * 60 * 60 * 24);
      }
      return {
        assetTag: a.tag,
        assetName: a.name,
        mtbfDays: Math.round((totalDays / (a.dates.length - 1)) * 10) / 10,
        failureCount: a.dates.length,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b!.mtbfDays - a!.mtbfDays))
    .slice(0, 10) as { assetTag: string; assetName: string; mtbfDays: number; failureCount: number }[];

  const topAssetIds = topAssetsRaw.map((a) => a.assetId);
  const topAssetDetails = topAssetIds.length
    ? await prisma.asset.findMany({
        where: { id: { in: topAssetIds } },
        select: { id: true, assetTagNo: true, name: true },
      })
    : [];
  const assetMap = Object.fromEntries(topAssetDetails.map((a) => [a.id, a]));

  const topMaintainedAssets = topAssetsRaw.map((a) => ({
    assetTag: assetMap[a.assetId]?.assetTagNo ?? '—',
    assetName: assetMap[a.assetId]?.name ?? '—',
    cmCount: a._count,
  }));

  const inventoryValue = inventoryItems.reduce(
    (sum, i) => sum + Number(i.currentStock) * Number(i.unitCost),
    0,
  );
  const pendingPoValue = openPOs.reduce((sum, po) => sum + Number(po.totalAmount), 0);

  const pmOnTimeCount = await prisma.workOrder.count({
    where: {
      deletedAt: null,
      type: 'PM',
      status: 'completed',
      actualEndAt: { gte: monthFrom },
      plannedEndDate: { not: null },
    },
  });

  let pmOnTimeActual = 0;
  if (pmOnTimeCount > 0) {
    const pmWos = await prisma.workOrder.findMany({
      where: {
        deletedAt: null,
        type: 'PM',
        status: 'completed',
        actualEndAt: { gte: monthFrom },
        plannedEndDate: { not: null },
      },
      select: { actualEndAt: true, plannedEndDate: true },
    });
    pmOnTimeActual = pmWos.filter(
      (wo) => wo.actualEndAt && wo.plannedEndDate && wo.actualEndAt <= wo.plannedEndDate,
    ).length;
  }

  const completionRate =
    createdThisMonth > 0 ? Math.round((completedThisMonth / createdThisMonth) * 1000) / 10 : 0;
  const pmComplianceRate =
    pmCompleted > 0 ? Math.round((pmOnTimeActual / pmCompleted) * 1000) / 10 : 100;

  const totalOpen = Object.values(openByPriority).reduce((s, n) => s + n, 0);

  return {
    totalOpenWorkOrders: totalOpen,
    openByPriority,
    openByType,
    completionRateThisMonth: completionRate,
    completedThisMonth,
    createdThisMonth,
    mttrByCategory: mttrChart,
    mtbfByAsset: mtbfChart,
    pmComplianceRate,
    pmCompletedThisMonth: pmCompleted,
    maintenanceCostThisMonth: Number(maintenanceCosts._sum.workOrderCost ?? 0),
    topMaintainedAssets,
    inventoryValue: Math.round(inventoryValue * 100) / 100,
    pendingPoValue: Math.round(pendingPoValue * 100) / 100,
    overdueWorkOrders: overdueWOs,
  };
}

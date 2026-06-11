import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export async function generateWoNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `WO-${year}-`;

  const last = await prisma.workOrder.findFirst({
    where: { woNumber: { startsWith: prefix } },
    orderBy: { woNumber: 'desc' },
  });

  let nextNum = 1;
  if (last) {
    const match = last.woNumber.match(/-(\d+)$/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }

  return `${prefix}${String(nextNum).padStart(5, '0')}`;
}

export const woInclude = {
  asset: { select: { id: true, assetTagNo: true, name: true, locationPath: true, status: true } },
  reportedBy: { select: { id: true, fullName: true, username: true, role: true } },
  assignedTo: { select: { id: true, fullName: true, username: true, role: true } },
  laborEntries: {
    include: { user: { select: { id: true, fullName: true, hourlyRate: true } } },
    orderBy: { startTime: 'desc' as const },
  },
  partsUsed: {
    include: { inventoryItem: { select: { id: true, itemCode: true, name: true } } },
  },
  _count: { select: { laborEntries: true, partsUsed: true, attachments: true } },
};

export type WoWithRelations = Prisma.WorkOrderGetPayload<{ include: typeof woInclude }>;

export function serializeWorkOrder(wo: WoWithRelations) {
  const laborCost = wo.laborEntries.reduce((sum, entry) => {
    const hours = entry.hours ? Number(entry.hours) : 0;
    const rate = entry.user.hourlyRate ? Number(entry.user.hourlyRate) : 0;
    return sum + hours * rate;
  }, 0);

  const partsCost = wo.partsUsed.reduce((sum, p) => sum + Number(p.totalCost), 0);

  return {
    ...wo,
    estimatedHours: wo.estimatedHours ? Number(wo.estimatedHours) : null,
    workOrderCost: wo.workOrderCost ? Number(wo.workOrderCost) : laborCost + partsCost,
    laborCost,
    partsCost,
    laborEntries: wo.laborEntries.map((e) => ({
      ...e,
      hours: e.hours ? Number(e.hours) : null,
    })),
    partsUsed: wo.partsUsed.map((p) => ({
      ...p,
      quantity: Number(p.quantity),
      unitCost: Number(p.unitCost),
      totalCost: Number(p.totalCost),
    })),
  };
}

export async function recalculateWoCost(workOrderId: string): Promise<number> {
  const wo = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: {
      laborEntries: { include: { user: { select: { hourlyRate: true } } } },
      partsUsed: true,
    },
  });

  if (!wo) return 0;

  const laborCost = wo.laborEntries.reduce((sum, entry) => {
    const hours = entry.hours ? Number(entry.hours) : 0;
    const rate = entry.user.hourlyRate ? Number(entry.user.hourlyRate) : 500;
    return sum + hours * rate;
  }, 0);

  const partsCost = wo.partsUsed.reduce((sum, p) => sum + Number(p.totalCost), 0);
  const total = laborCost + partsCost;

  await prisma.workOrder.update({
    where: { id: workOrderId },
    data: { workOrderCost: total },
  });

  return total;
}

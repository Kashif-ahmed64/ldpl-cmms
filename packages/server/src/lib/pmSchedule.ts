import type { PmTemplate } from '@prisma/client';
import type { Server } from 'socket.io';
import { prisma } from './prisma.js';
import { generateWoNumber } from './workOrders.js';
import { notifyRoles } from './notifications.js';
import { AssetStatus, WorkOrderStatus } from '@prisma/client';

export const PM_FREQUENCIES = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'annually',
  'by_hours',
  'by_km',
] as const;

export type PmFrequency = (typeof PM_FREQUENCIES)[number];

export const PM_FREQUENCY_LABELS: Record<PmFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
  by_hours: 'By Hours',
  by_km: 'By KM',
};

export function calculateNextDueDate(
  from: Date,
  frequency: string,
  intervalValue: number,
): Date {
  const d = new Date(from);
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + intervalValue);
      break;
    case 'weekly':
      d.setDate(d.getDate() + intervalValue * 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + intervalValue);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + intervalValue * 3);
      break;
    case 'annually':
      d.setFullYear(d.getFullYear() + intervalValue);
      break;
    case 'by_hours':
    case 'by_km':
      d.setMonth(d.getMonth() + 1);
      break;
    default:
      d.setMonth(d.getMonth() + intervalValue);
  }
  return d;
}

export const pmTemplateInclude = {
  asset: { select: { id: true, assetTagNo: true, name: true } },
  tasks: { orderBy: { sequence: 'asc' as const } },
  _count: { select: { workOrders: true } },
};

export function serializePmTemplate(template: PmTemplate & {
  asset?: { id: string; assetTagNo: string; name: string } | null;
  tasks?: { id: string; sequence: number; description: string; isRequired: boolean }[];
  _count?: { workOrders: number };
}) {
  return {
    ...template,
    estimatedDuration: template.estimatedDuration ? Number(template.estimatedDuration) : null,
  };
}

function buildChecklistDescription(
  templateName: string,
  tasks: { sequence: number; description: string }[],
): string {
  const lines = tasks.map((t) => `${t.sequence}. ${t.description}`).join('\n');
  return `Scheduled PM: ${templateName}\n\nChecklist:\n${lines || 'No checklist items defined.'}`;
}

export async function runPmScheduler(systemUserId: string, io?: Server) {
  const now = new Date();
  const created: { woNumber: string; assetName: string; templateName: string }[] = [];

  const templates = await prisma.pmTemplate.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      nextDueDate: { not: null },
    },
    include: { tasks: { orderBy: { sequence: 'asc' } }, asset: true },
  });

  for (const template of templates) {
    if (!template.nextDueDate) continue;

    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + template.leadTimeDays);

    if (template.nextDueDate > windowEnd) continue;

    let assets: { id: string; name: string }[] = [];

    if (template.assetId && template.asset) {
      assets = [{ id: template.asset.id, name: template.asset.name }];
    } else if (template.assetCategory) {
      const matches = await prisma.asset.findMany({
        where: {
          deletedAt: null,
          status: AssetStatus.active,
          category: template.assetCategory,
          hierarchyLevel: { gte: 4 },
        },
        select: { id: true, name: true },
      });
      assets = matches;
    }

    for (const asset of assets) {
      const existingWo = await prisma.workOrder.findFirst({
        where: {
          assetId: asset.id,
          type: 'PM',
          deletedAt: null,
          status: { notIn: [WorkOrderStatus.completed, WorkOrderStatus.cancelled] },
        },
      });

      if (existingWo) continue;

      const woNumber = await generateWoNumber();
      const wo = await prisma.workOrder.create({
        data: {
          woNumber,
          type: 'PM',
          priority: 'medium',
          assetId: asset.id,
          problemDescription: buildChecklistDescription(template.name, template.tasks),
          reportedById: systemUserId,
          estimatedHours: template.estimatedDuration,
          pmTemplateId: template.id,
          status: WorkOrderStatus.open,
          plannedStartDate: now,
          plannedEndDate: template.nextDueDate,
        },
      });

      await prisma.asset.update({
        where: { id: asset.id },
        data: { status: AssetStatus.under_maintenance, nextMaintenanceDue: template.nextDueDate },
      });

      created.push({ woNumber, assetName: asset.name, templateName: template.name });

      await notifyRoles(['supervisor', 'engineer'], {
        title: 'PM Work Order Generated',
        message: `${woNumber} — ${template.name} for ${asset.name}`,
        type: 'info',
        module: 'pm_templates',
        recordId: wo.id,
        io,
      });
    }
  }

  return created;
}

export async function onPmWorkOrderCompleted(pmTemplateId: string, completedAt: Date, assetId: string) {
  const template = await prisma.pmTemplate.findUnique({ where: { id: pmTemplateId } });
  if (!template) return;

  const nextDue = calculateNextDueDate(completedAt, template.frequency, template.intervalValue);

  await prisma.pmTemplate.update({
    where: { id: pmTemplateId },
    data: {
      lastDoneDate: completedAt,
      nextDueDate: nextDue,
    },
  });

  await prisma.asset.update({
    where: { id: assetId },
    data: {
      lastMaintenanceAt: completedAt,
      nextMaintenanceDue: nextDue,
    },
  });
}

export function startPmSchedulerCron(systemUserId: string, io?: Server) {
  const MS_DAY = 24 * 60 * 60 * 1000;

  const run = () => {
    runPmScheduler(systemUserId, io).then((created) => {
      if (created.length > 0) {
        console.log(`PM Scheduler: generated ${created.length} work order(s)`);
      }
    }).catch((err) => console.error('PM Scheduler error:', err));
  };

  run();

  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = midnight.getTime() - now.getTime();

  setTimeout(() => {
    run();
    setInterval(run, MS_DAY);
  }, msUntilMidnight);
}

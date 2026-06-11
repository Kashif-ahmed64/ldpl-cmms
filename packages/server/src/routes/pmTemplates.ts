import { Router } from 'express';
import { AssetCategory } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  calculateNextDueDate,
  PM_FREQUENCIES,
  PM_FREQUENCY_LABELS,
  pmTemplateInclude,
  runPmScheduler,
  serializePmTemplate,
} from '../lib/pmSchedule.js';
import { writeAuditLog } from '../lib/audit.js';
import { authenticate, getClientIp, type AuthRequest } from '../middleware/auth.js';
import type { UserRole } from '@prisma/client';

const router = Router();

const taskSchema = z.object({
  sequence: z.number().int(),
  description: z.string().min(1),
  isRequired: z.boolean().optional(),
});

const templateSchema = z.object({
  name: z.string().min(3),
  assetId: z.string().uuid().nullable().optional(),
  assetCategory: z.nativeEnum(AssetCategory).nullable().optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annually', 'by_hours', 'by_km']),
  intervalValue: z.number().int().min(1),
  estimatedDuration: z.number().optional(),
  requiredSkills: z.array(z.string()).optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  assignedDeptId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  tasks: z.array(taskSchema).optional(),
  nextDueDate: z.string().optional().nullable(),
});

router.use(authenticate);

function canPm(role: UserRole, action: 'read' | 'create' | 'edit' | 'schedule') {
  const map: Record<string, UserRole[]> = {
    read: ['admin', 'manager', 'engineer', 'supervisor', 'storekeeper', 'technician', 'viewer', 'hod'],
    create: ['admin', 'engineer'],
    edit: ['admin', 'engineer'],
    schedule: ['admin', 'engineer'],
  };
  return map[action]?.includes(role) ?? false;
}

router.get('/meta', (_req, res) => {
  res.json({
    frequencies: PM_FREQUENCIES.map((f) => ({ value: f, label: PM_FREQUENCY_LABELS[f] })),
    skills: ['Electrical', 'Mechanical', 'Civil', 'Instrumentation', 'Welding'],
  });
});

router.get('/forecast', async (req: AuthRequest, res) => {
  if (!canPm(req.user!.role, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const days = Number(req.query.days ?? 30);
  const until = new Date();
  until.setDate(until.getDate() + days);

  const templates = await prisma.pmTemplate.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      nextDueDate: { lte: until },
    },
    include: pmTemplateInclude,
    orderBy: { nextDueDate: 'asc' },
  });

  res.json({ forecast: templates.map(serializePmTemplate) });
});

router.post('/run-scheduler', async (req: AuthRequest, res) => {
  if (!canPm(req.user!.role, 'schedule')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const io = req.app.get('io');
  const created = await runPmScheduler(req.user!.userId, io);

  await writeAuditLog({
    userId: req.user!.userId,
    module: 'pm_templates',
    action: 'CREATE',
    ipAddress: getClientIp(req),
    newValue: { action: 'run_scheduler', generated: created.length },
  });

  res.json({ message: `Generated ${created.length} PM work order(s)`, created });
});

router.get('/', async (req: AuthRequest, res) => {
  if (!canPm(req.user!.role, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const templates = await prisma.pmTemplate.findMany({
    where: { deletedAt: null },
    include: pmTemplateInclude,
    orderBy: { name: 'asc' },
  });

  res.json({ templates: templates.map(serializePmTemplate) });
});

router.get('/:id', async (req: AuthRequest, res) => {
  if (!canPm(req.user!.role, 'read')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const template = await prisma.pmTemplate.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: pmTemplateInclude,
  });

  if (!template) {
    res.status(404).json({ error: 'PM template not found' });
    return;
  }

  res.json({ template: serializePmTemplate(template) });
});

router.post('/', async (req: AuthRequest, res) => {
  if (!canPm(req.user!.role, 'create')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const data = parsed.data;
  if (!data.assetId && !data.assetCategory) {
    res.status(400).json({ error: 'Either asset or asset category is required' });
    return;
  }

  const startDate = data.nextDueDate ? new Date(data.nextDueDate) : calculateNextDueDate(new Date(), data.frequency, data.intervalValue);

  const template = await prisma.pmTemplate.create({
    data: {
      name: data.name,
      assetId: data.assetId ?? null,
      assetCategory: data.assetCategory ?? null,
      frequency: data.frequency,
      intervalValue: data.intervalValue,
      estimatedDuration: data.estimatedDuration,
      requiredSkills: data.requiredSkills ?? [],
      leadTimeDays: data.leadTimeDays ?? 7,
      assignedDeptId: data.assignedDeptId ?? null,
      isActive: data.isActive ?? true,
      nextDueDate: startDate,
      checklist: data.tasks ?? [],
      tasks: data.tasks
        ? {
            create: data.tasks.map((t) => ({
              sequence: t.sequence,
              description: t.description,
              isRequired: t.isRequired ?? true,
            })),
          }
        : undefined,
    },
    include: pmTemplateInclude,
  });

  await writeAuditLog({
    userId: req.user!.userId,
    module: 'pm_templates',
    action: 'CREATE',
    recordId: template.id,
    ipAddress: getClientIp(req),
    newValue: serializePmTemplate(template),
  });

  res.status(201).json({ template: serializePmTemplate(template) });
});

router.patch('/:id', async (req: AuthRequest, res) => {
  if (!canPm(req.user!.role, 'edit')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const parsed = templateSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.pmTemplate.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: pmTemplateInclude,
  });

  if (!existing) {
    res.status(404).json({ error: 'PM template not found' });
    return;
  }

  const data = parsed.data;

  if (data.tasks) {
    await prisma.pmTask.deleteMany({ where: { pmTemplateId: req.params.id } });
    await prisma.pmTask.createMany({
      data: data.tasks.map((t) => ({
        pmTemplateId: req.params.id,
        sequence: t.sequence,
        description: t.description,
        isRequired: t.isRequired ?? true,
      })),
    });
  }

  const template = await prisma.pmTemplate.update({
    where: { id: req.params.id },
    data: {
      name: data.name,
      assetId: data.assetId,
      assetCategory: data.assetCategory,
      frequency: data.frequency,
      intervalValue: data.intervalValue,
      estimatedDuration: data.estimatedDuration,
      requiredSkills: data.requiredSkills,
      leadTimeDays: data.leadTimeDays,
      assignedDeptId: data.assignedDeptId,
      isActive: data.isActive,
      nextDueDate: data.nextDueDate !== undefined
        ? data.nextDueDate ? new Date(data.nextDueDate) : null
        : undefined,
      checklist: data.tasks ?? undefined,
    },
    include: pmTemplateInclude,
  });

  res.json({ template: serializePmTemplate(template) });
});

router.delete('/:id', async (req: AuthRequest, res) => {
  if (!canPm(req.user!.role, 'edit')) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const template = await prisma.pmTemplate.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date(), isActive: false },
    include: pmTemplateInclude,
  });

  res.json({ message: 'PM template deactivated', template: serializePmTemplate(template) });
});

export default router;

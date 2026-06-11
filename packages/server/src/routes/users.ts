import { Router } from 'express';
import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { writeAuditLog, sanitizeUser } from '../lib/audit.js';
import { authenticate, authorize, getClientIp, type AuthRequest } from '../middleware/auth.js';

const router = Router();

const userRoles = Object.values(UserRole);

const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  fullName: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')),
  employeeId: z.string().optional(),
  role: z.enum(userRoles as [UserRole, ...UserRole[]]),
  departmentId: z.string().uuid().optional().nullable(),
  phone: z.string().optional(),
  designation: z.string().optional(),
  hourlyRate: z.number().optional(),
});

const updateUserSchema = createUserSchema.partial().omit({ password: true }).extend({
  password: z.string().min(8).optional(),
  isActive: z.boolean().optional(),
});

router.use(authenticate);
router.use(authorize(UserRole.admin));

router.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    include: { department: true },
    orderBy: { fullName: 'asc' },
  });

  res.json({
    users: users.map((u) => sanitizeUser(u as unknown as Record<string, unknown>)),
  });
});

router.get('/:id', async (req, res) => {
  const user = await prisma.user.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { department: true },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user: sanitizeUser(user as unknown as Record<string, unknown>) });
});

router.post('/', async (req: AuthRequest, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const data = parsed.data;
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ username: data.username.toLowerCase() }, ...(data.email ? [{ email: data.email }] : [])],
      deletedAt: null,
    },
  });

  if (existing) {
    res.status(409).json({ error: 'Username or email already exists' });
    return;
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: {
      username: data.username.toLowerCase(),
      passwordHash,
      fullName: data.fullName,
      email: data.email || null,
      employeeId: data.employeeId,
      role: data.role,
      departmentId: data.departmentId ?? null,
      phone: data.phone,
      designation: data.designation,
      hourlyRate: data.hourlyRate,
      createdById: req.user!.userId,
    },
    include: { department: true },
  });

  await writeAuditLog({
    userId: req.user!.userId,
    module: 'users',
    action: 'CREATE',
    recordId: user.id,
    ipAddress: getClientIp(req),
    newValue: sanitizeUser(user as unknown as Record<string, unknown>),
  });

  res.status(201).json({ user: sanitizeUser(user as unknown as Record<string, unknown>) });
});

router.patch('/:id', async (req: AuthRequest, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.user.findFirst({
    where: { id: req.params.id, deletedAt: null },
  });

  if (!existing) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const data = parsed.data;
  const updateData: Record<string, unknown> = { ...data };
  delete updateData.password;

  if (data.password) {
    updateData.passwordHash = await bcrypt.hash(data.password, 12);
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: updateData,
    include: { department: true },
  });

  await writeAuditLog({
    userId: req.user!.userId,
    module: 'users',
    action: 'UPDATE',
    recordId: user.id,
    ipAddress: getClientIp(req),
    oldValue: sanitizeUser(existing as unknown as Record<string, unknown>),
    newValue: sanitizeUser(user as unknown as Record<string, unknown>),
  });

  res.json({ user: sanitizeUser(user as unknown as Record<string, unknown>) });
});

router.delete('/:id', async (req: AuthRequest, res) => {
  if (req.params.id === req.user!.userId) {
    res.status(400).json({ error: 'Cannot delete your own account' });
    return;
  }

  const existing = await prisma.user.findFirst({
    where: { id: req.params.id, deletedAt: null },
  });

  if (!existing) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date(), isActive: false },
    include: { department: true },
  });

  await writeAuditLog({
    userId: req.user!.userId,
    module: 'users',
    action: 'DELETE',
    recordId: user.id,
    ipAddress: getClientIp(req),
    oldValue: sanitizeUser(existing as unknown as Record<string, unknown>),
  });

  res.json({ message: 'User deactivated successfully' });
});

export default router;

import { Router } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getTokenExpiryMs,
} from '../lib/jwt.js';
import { writeAuditLog, sanitizeUser } from '../lib/audit.js';
import { authenticate, getClientIp, type AuthRequest } from '../middleware/auth.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Try again later.' },
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const { username, password } = parsed.data;
  const ip = getClientIp(req);

  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    include: { department: true },
  });

  if (!user || user.deletedAt || !user.isActive) {
    await writeAuditLog({
      module: 'auth',
      action: 'LOGIN',
      ipAddress: ip,
      result: 'failed',
      newValue: { username },
    });
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await writeAuditLog({
      userId: user.id,
      module: 'auth',
      action: 'LOGIN',
      ipAddress: ip,
      result: 'blocked',
    });
    res.status(423).json({ error: 'Account locked. Try again later.' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const failedCount = user.failedLoginCount + 1;
    const lockedUntil =
      failedCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: failedCount, lockedUntil },
    });

    await writeAuditLog({
      userId: user.id,
      module: 'auth',
      action: 'LOGIN',
      ipAddress: ip,
      result: 'failed',
    });

    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const payload = { userId: user.id, username: user.username, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await writeAuditLog({
    userId: user.id,
    module: 'auth',
    action: 'LOGIN',
    ipAddress: ip,
    result: 'success',
  });

  res.json({
    accessToken,
    refreshToken,
    expiresIn: getTokenExpiryMs(),
    user: sanitizeUser(user as unknown as Record<string, unknown>),
  });
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token required' });
    return;
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });

    if (!stored || stored.expiresAt < new Date()) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    await prisma.refreshToken.delete({ where: { id: stored.id } });

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    const newPayload = { userId: user.id, username: user.username, role: user.role };
    const accessToken = signAccessToken(newPayload);
    const newRefreshToken = signRefreshToken(newPayload);

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({ accessToken, refreshToken: newRefreshToken, expiresIn: getTokenExpiryMs() });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.post('/logout', authenticate, async (req: AuthRequest, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (refreshToken) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  }

  await writeAuditLog({
    userId: req.user?.userId,
    module: 'auth',
    action: 'LOGOUT',
    ipAddress: getClientIp(req),
    result: 'success',
  });

  res.json({ message: 'Logged out successfully' });
});

router.get('/me', authenticate, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { department: true },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user: sanitizeUser(user as unknown as Record<string, unknown>) });
});

export default router;

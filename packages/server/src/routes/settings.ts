import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { authenticate, authorize, getClientIp, type AuthRequest } from '../middleware/auth.js';
import { getSecurityStatus } from '../middleware/security.js';
import {
  DEFAULT_CONFIG,
  getSystemConfig,
  setSystemConfig,
  listBackups,
  runDatabaseBackup,
  getBackupDir,
} from '../lib/backup.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.use(authenticate);
router.use(authorize(UserRole.admin));

const configPatchSchema = z.object({
  company_name: z.string().min(1).optional(),
  plant_name: z.string().min(1).optional(),
  backup_enabled: z.boolean().optional(),
  backup_retention_days: z.number().int().min(1).max(365).optional(),
  backup_schedule_hour: z.number().int().min(0).max(23).optional(),
  session_timeout_hours: z.number().int().min(1).max(24).optional(),
  max_login_attempts: z.number().int().min(3).max(10).optional(),
  lockout_minutes: z.number().int().min(5).max(60).optional(),
  maintenance_mode: z.boolean().optional(),
});

router.get('/', async (_req, res) => {
  const config = await getSystemConfig();
  const security = getSecurityStatus();
  const backups = await listBackups();
  const backupDir = getBackupDir();

  const [userCount, auditCount, activeSessions] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null, isActive: true } }),
    prisma.auditLog.count(),
    prisma.refreshToken.count({ where: { expiresAt: { gt: new Date() } } }),
  ]);

  res.json({
    config,
    defaults: DEFAULT_CONFIG,
    security,
    backup: {
      directory: backupDir,
      count: backups.length,
      latest: backups[0] ?? null,
      encryptionEnabled: security.backupEncryption,
    },
    stats: {
      activeUsers: userCount,
      auditLogEntries: auditCount,
      activeSessions,
    },
  });
});

router.get('/backups', async (_req, res) => {
  const backups = await listBackups();
  res.json({ backups, directory: getBackupDir() });
});

router.post('/backups/run', async (req: AuthRequest, res) => {
  try {
    const backup = await runDatabaseBackup(req.user!.userId);
    const today = new Date().toISOString().slice(0, 10);
    await setSystemConfig('last_backup_date', today);
    await setSystemConfig('last_backup_file', backup.filename);
    res.json({ message: 'Backup completed', backup });
  } catch (err) {
    res.status(500).json({
      error: 'Backup failed',
      detail: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

router.patch('/config', async (req: AuthRequest, res) => {
  const parsed = configPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      await setSystemConfig(key, value, req.user!.userId);
    }
  }

  const config = await getSystemConfig();
  res.json({ config, message: 'Configuration updated' });
});

router.get('/audit-summary', async (req: AuthRequest, res) => {
  const recentAuth = await prisma.auditLog.findMany({
    where: { module: 'auth' },
    take: 20,
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { fullName: true, username: true, role: true } } },
  });

  const failedLogins = await prisma.auditLog.count({
    where: {
      module: 'auth',
      action: 'LOGIN',
      result: 'failed',
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  res.json({
    recentAuthEvents: recentAuth.map((l) => ({
      id: l.id,
      action: l.action,
      result: l.result,
      user: l.user?.fullName ?? 'Unknown',
      username: l.user?.username,
      ipAddress: l.ipAddress,
      createdAt: l.createdAt,
    })),
    failedLoginsLast24h: failedLogins,
    requestedBy: getClientIp(req),
  });
});

export default router;

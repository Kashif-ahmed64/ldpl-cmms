import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './prisma.js';
import { writeAuditLog } from './audit.js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_CONFIG = {
  company_name: 'Liberty Daharki Powers Ltd',
  plant_name: '235 MW Power Plant — Daharki',
  backup_enabled: true,
  backup_retention_days: 30,
  backup_schedule_hour: 2,
  session_timeout_hours: 8,
  max_login_attempts: 5,
  lockout_minutes: 15,
  maintenance_mode: false,
};

export function getBackupDir(): string {
  return process.env.BACKUP_DIR ?? path.join(__dirname, '../../backups');
}

/** pg_dump does not accept Prisma's ?schema= query param — strip it. */
export function getPgDumpConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not configured');
  return url.replace(/\?.*$/, '');
}

export interface BackupFile {
  filename: string;
  size: number;
  createdAt: string;
  encrypted: boolean;
}

export async function getSystemConfig(): Promise<Record<string, unknown>> {
  const rows = await prisma.systemConfig.findMany();
  const config: Record<string, unknown> = { ...DEFAULT_CONFIG };
  for (const row of rows) {
    config[row.key] = row.value;
  }
  return config;
}

export async function setSystemConfig(key: string, value: unknown, userId?: string): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { key },
    update: { value: value as never },
    create: { key, value: value as never },
  });
  if (userId) {
    await writeAuditLog({
      userId,
      module: 'system_config',
      action: 'UPDATE',
      recordId: key,
      newValue: { key, value },
    });
  }
}

export async function listBackups(): Promise<BackupFile[]> {
  const dir = getBackupDir();
  try {
    const files = await fs.readdir(dir);
    const backups: BackupFile[] = [];
    for (const filename of files) {
      if (!filename.startsWith('ldpl_cmms_')) continue;
      const stat = await fs.stat(path.join(dir, filename));
      if (!stat.isFile()) continue;
      backups.push({
        filename,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
        encrypted: filename.endsWith('.enc'),
      });
    }
    return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

async function cleanupOldBackups(retentionDays: number): Promise<number> {
  const backups = await listBackups();
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const b of backups) {
    if (new Date(b.createdAt).getTime() < cutoff) {
      await fs.unlink(path.join(getBackupDir(), b.filename));
      removed++;
    }
  }
  return removed;
}

export async function runDatabaseBackup(userId?: string): Promise<BackupFile> {
  const config = await getSystemConfig();
  const retentionDays = Number(config.backup_retention_days ?? 30);
  const dir = getBackupDir();
  await fs.mkdir(dir, { recursive: true });

  const dbUrl = getPgDumpConnectionString();
  if (!dbUrl) throw new Error('DATABASE_URL not configured');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const encryptKey = process.env.BACKUP_ENCRYPTION_KEY;
  const baseName = `ldpl_cmms_${timestamp}.sql.gz`;
  const filename = encryptKey ? `${baseName}.enc` : baseName;
  const filepath = path.join(dir, filename);
  const tmpGz = path.join(dir, `.tmp_${baseName}`);

  try {
    await execFileAsync('pg_dump', ['--dbname', dbUrl, '--no-owner', '--no-acl'], {
      maxBuffer: 100 * 1024 * 1024,
    }).then(async ({ stdout }) => {
      const { gzipSync } = await import('node:zlib');
      const compressed = gzipSync(Buffer.from(stdout));
      await fs.writeFile(tmpGz, compressed);
    });

    if (encryptKey) {
      await execFileAsync('openssl', [
        'enc', '-aes-256-cbc', '-salt', '-pbkdf2',
        '-in', tmpGz,
        '-out', filepath,
        '-pass', `pass:${encryptKey}`,
      ]);
      await fs.unlink(tmpGz);
    } else {
      await fs.rename(tmpGz, filepath);
    }

    const stat = await fs.stat(filepath);
    const backup: BackupFile = {
      filename,
      size: stat.size,
      createdAt: stat.mtime.toISOString(),
      encrypted: Boolean(encryptKey),
    };

    await cleanupOldBackups(retentionDays);

    if (userId) {
      await writeAuditLog({
        userId,
        module: 'backups',
        action: 'CREATE',
        recordId: filename,
        newValue: { filename, size: backup.size, encrypted: backup.encrypted },
      });
    }

    return backup;
  } catch (err) {
    try { await fs.unlink(tmpGz); } catch { /* ignore */ }
    throw err;
  }
}

let backupCronStarted = false;

export function startBackupCron(): void {
  if (backupCronStarted) return;
  backupCronStarted = true;

  const checkAndRun = async () => {
    try {
      const config = await getSystemConfig();
      if (!config.backup_enabled) return;

      const scheduleHour = Number(config.backup_schedule_hour ?? 2);
      const now = new Date();
      if (now.getHours() !== scheduleHour || now.getMinutes() > 5) return;

      const today = now.toISOString().slice(0, 10);
      const lastRun = config.last_backup_date as string | undefined;
      if (lastRun === today) return;

      console.log('Backup cron: starting nightly database backup...');
      const backup = await runDatabaseBackup();
      await setSystemConfig('last_backup_date', today);
      await setSystemConfig('last_backup_file', backup.filename);
      console.log(`Backup cron: completed — ${backup.filename} (${backup.size} bytes)`);
    } catch (err) {
      console.error('Backup cron error:', err instanceof Error ? err.message : err);
    }
  };

  setInterval(checkAndRun, 60 * 1000);
  console.log('Backup scheduler: checking hourly for nightly backup window');
}

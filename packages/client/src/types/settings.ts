export interface SecurityStatus {
  bcryptCostFactor: number;
  jwtExpiry: string;
  refreshTokenRotation: boolean;
  loginLockoutAttempts: number;
  loginLockoutMinutes: number;
  rateLimitLogin: string;
  rateLimitApi: string;
  sqlInjectionProtection: string;
  inputValidation: string;
  jwtSecretConfigured: boolean;
  productionMode: boolean;
  httpsRecommended: string;
  backupEncryption: boolean;
}

export interface SystemConfig {
  company_name: string;
  plant_name: string;
  backup_enabled: boolean;
  backup_retention_days: number;
  backup_schedule_hour: number;
  session_timeout_hours: number;
  max_login_attempts: number;
  lockout_minutes: number;
  maintenance_mode: boolean;
  last_backup_date?: string;
  last_backup_file?: string;
}

export interface BackupFile {
  filename: string;
  size: number;
  createdAt: string;
  encrypted: boolean;
}

export interface SettingsData {
  config: SystemConfig;
  defaults: SystemConfig;
  security: SecurityStatus;
  backup: {
    directory: string;
    count: number;
    latest: BackupFile | null;
    encryptionEnabled: boolean;
  };
  stats: {
    activeUsers: number;
    auditLogEntries: number;
    activeSessions: number;
  };
}

export interface AuthAuditEvent {
  id: string;
  action: string;
  result: string;
  user: string;
  username?: string;
  ipAddress: string | null;
  createdAt: string;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

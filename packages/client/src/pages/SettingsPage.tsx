import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Shield,
  Database,
  Settings,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import type { AuthAuditEvent, BackupFile, SettingsData, SystemConfig } from '@/types/settings';
import { formatBytes } from '@/types/settings';

type Tab = 'security' | 'backups' | 'config';

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('security');
  const [data, setData] = useState<SettingsData | null>(null);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [authEvents, setAuthEvents] = useState<AuthAuditEvent[]>([]);
  const [failedLogins, setFailedLogins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningBackup, setRunningBackup] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [configForm, setConfigForm] = useState<SystemConfig | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settings, backupList, audit] = await Promise.all([
        apiFetch<SettingsData>('/api/settings'),
        apiFetch<{ backups: BackupFile[] }>('/api/settings/backups'),
        apiFetch<{ recentAuthEvents: AuthAuditEvent[]; failedLoginsLast24h: number }>(
          '/api/settings/audit-summary',
        ),
      ]);
      setData(settings);
      setConfigForm(settings.config);
      setBackups(backupList.backups);
      setAuthEvents(audit.recentAuthEvents);
      setFailedLogins(audit.failedLoginsLast24h);
    } catch {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleConfigSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!configForm) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch('/api/settings/config', {
        method: 'PATCH',
        body: JSON.stringify(configForm),
      });
      setSuccess('Configuration saved');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRunBackup = async () => {
    setRunningBackup(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch<{ message: string; backup: BackupFile }>('/api/settings/backups/run', {
        method: 'POST',
      });
      setSuccess(`${res.message}: ${res.backup.filename} (${formatBytes(res.backup.size)})`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Backup failed — ensure pg_dump is installed');
    } finally {
      setRunningBackup(false);
    }
  };

  if (loading) {
    return <p className="text-gray-500 text-center py-12">Loading settings...</p>;
  }

  if (!data || !configForm) {
    return <p className="text-red-500 text-center py-12">Failed to load settings</p>;
  }

  const tabs = [
    { id: 'security' as Tab, label: 'Security', icon: Shield },
    { id: 'backups' as Tab, label: 'Backups', icon: Database },
    { id: 'config' as Tab, label: 'System Config', icon: Settings },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">System Configuration</h1>
        <p className="text-gray-500 mt-1">Security settings, database backups, and system parameters</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{success}</div>
      )}

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'security' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">Active Users</p>
              <p className="text-2xl font-bold mt-1">{data.stats.activeUsers}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">Active Sessions</p>
              <p className="text-2xl font-bold mt-1">{data.stats.activeSessions}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">Failed Logins (24h)</p>
              <p className={`text-2xl font-bold mt-1 ${failedLogins > 0 ? 'text-red-600' : ''}`}>
                {failedLogins}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Shield size={18} className="text-blue-600" />
              Security Measures
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {[
                { label: 'Password Hashing', value: `bcrypt (cost factor ${data.security.bcryptCostFactor})` },
                { label: 'JWT Token Expiry', value: data.security.jwtExpiry },
                { label: 'Refresh Token Rotation', value: data.security.refreshTokenRotation ? 'Enabled' : 'Disabled' },
                { label: 'Login Lockout', value: `${data.security.loginLockoutAttempts} attempts / ${data.security.loginLockoutMinutes} min` },
                { label: 'Login Rate Limit', value: data.security.rateLimitLogin },
                { label: 'API Rate Limit', value: data.security.rateLimitApi },
                { label: 'SQL Injection Protection', value: data.security.sqlInjectionProtection },
                { label: 'Input Validation', value: data.security.inputValidation },
                { label: 'JWT Secret', value: data.security.jwtSecretConfigured ? 'Configured' : 'Using default (change in production!)', warn: !data.security.jwtSecretConfigured },
                { label: 'Environment', value: data.security.productionMode ? 'Production' : 'Development' },
                { label: 'Backup Encryption', value: data.security.backupEncryption ? 'AES-256 enabled' : 'Not configured' },
                { label: 'HTTPS', value: data.security.httpsRecommended },
              ].map((item) => (
                <div key={item.label} className="flex justify-between p-2 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">{item.label}</span>
                  <span className={`font-medium text-right ${item.warn ? 'text-amber-600' : 'text-gray-900'}`}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold mb-4">Recent Authentication Events</h3>
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-gray-500">
                  <th className="pb-2 font-medium">Time</th>
                  <th className="pb-2 font-medium">User</th>
                  <th className="pb-2 font-medium">Action</th>
                  <th className="pb-2 font-medium">Result</th>
                  <th className="pb-2 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {authEvents.map((ev) => (
                  <tr key={ev.id} className="border-b last:border-0">
                    <td className="py-2 text-gray-500">{new Date(ev.createdAt).toLocaleString()}</td>
                    <td className="py-2">{ev.user}</td>
                    <td className="py-2">{ev.action}</td>
                    <td className="py-2">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                        ev.result === 'success' ? 'bg-green-100 text-green-700' :
                        ev.result === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {ev.result === 'success' ? <CheckCircle size={12} /> :
                         ev.result === 'failed' ? <XCircle size={12} /> :
                         <AlertTriangle size={12} />}
                        {ev.result}
                      </span>
                    </td>
                    <td className="py-2 font-mono text-xs">{ev.ipAddress ?? '—'}</td>
                  </tr>
                ))}
                {authEvents.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-gray-400">No auth events</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'backups' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-semibold">Database Backups</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Directory: <code className="text-xs bg-gray-100 px-1 rounded">{data.backup.directory}</code>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={load}
                  className="flex items-center gap-1 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <RefreshCw size={14} /> Refresh
                </button>
                <button
                  onClick={handleRunBackup}
                  disabled={runningBackup}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <Play size={16} />
                  {runningBackup ? 'Running...' : 'Run Backup Now'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500">Total Backups</p>
                <p className="font-bold text-lg">{data.backup.count}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500">Retention</p>
                <p className="font-bold text-lg">{configForm.backup_retention_days} days</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500">Schedule</p>
                <p className="font-bold text-lg">{String(configForm.backup_schedule_hour).padStart(2, '0')}:00 daily</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500">Encryption</p>
                <p className="font-bold text-lg">{data.backup.encryptionEnabled ? 'AES-256' : 'Off'}</p>
              </div>
            </div>

            {data.config.last_backup_file && (
              <p className="text-sm text-gray-600 mb-4">
                Last backup: <strong>{data.config.last_backup_file}</strong>
                {data.config.last_backup_date && ` on ${data.config.last_backup_date}`}
              </p>
            )}

            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Filename</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Size</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Encrypted</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.filename} className="border-b last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{b.filename}</td>
                    <td className="px-4 py-3">{formatBytes(b.size)}</td>
                    <td className="px-4 py-3">{new Date(b.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">{b.encrypted ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
                {backups.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      No backups yet — click "Run Backup Now" or configure nightly cron
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">Nightly Cron Setup (Production Server)</p>
            <code className="block bg-white/60 p-2 rounded text-xs mt-2">
              0 2 * * * /path/to/LIBERTY Tool MGT/scripts/backup-db.sh
            </code>
            <p className="mt-2 text-xs">Copy backups to external HDD. Set BACKUP_ENCRYPTION_KEY in .env for AES-256 encryption.</p>
          </div>
        </div>
      )}

      {tab === 'config' && (
        <form onSubmit={handleConfigSave} className="bg-white rounded-xl border border-gray-200 p-5 max-w-2xl">
          <h3 className="font-semibold mb-4">System Parameters</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
              <input
                value={configForm.company_name}
                onChange={(e) => setConfigForm({ ...configForm, company_name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plant Name</label>
              <input
                value={configForm.plant_name}
                onChange={(e) => setConfigForm({ ...configForm, plant_name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="backup_enabled"
                checked={configForm.backup_enabled}
                onChange={(e) => setConfigForm({ ...configForm, backup_enabled: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="backup_enabled" className="text-sm">Enable automatic nightly backups</label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Backup Retention (days)</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={configForm.backup_retention_days}
                  onChange={(e) => setConfigForm({ ...configForm, backup_retention_days: parseInt(e.target.value, 10) })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Backup Hour (0–23)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={configForm.backup_schedule_hour}
                  onChange={(e) => setConfigForm({ ...configForm, backup_schedule_hour: parseInt(e.target.value, 10) })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Session Timeout (hours)</label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={configForm.session_timeout_hours}
                  onChange={(e) => setConfigForm({ ...configForm, session_timeout_hours: parseInt(e.target.value, 10) })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Login Attempts</label>
                <input
                  type="number"
                  min={3}
                  max={10}
                  value={configForm.max_login_attempts}
                  onChange={(e) => setConfigForm({ ...configForm, max_login_attempts: parseInt(e.target.value, 10) })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="maintenance_mode"
                checked={configForm.maintenance_mode}
                onChange={(e) => setConfigForm({ ...configForm, maintenance_mode: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="maintenance_mode" className="text-sm text-amber-700 font-medium">
                Maintenance Mode (restrict non-admin access)
              </label>
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </form>
      )}
    </div>
  );
}

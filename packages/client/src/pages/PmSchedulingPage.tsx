import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, Play, Pencil, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch, ApiError } from '@/lib/api';
import type { Asset } from '@/types/asset';
import type { Department } from '@/types';
import type { PmFrequency, PmTask, PmTemplate } from '@/types/pm';
import { PM_FREQUENCY_LABELS, daysUntil, dueStatus } from '@/types/pm';
import { CATEGORY_LABELS, type AssetCategory } from '@/types/asset';

interface TemplateForm {
  name: string;
  assetId: string;
  assetCategory: string;
  applyTo: 'asset' | 'category';
  frequency: PmFrequency;
  intervalValue: string;
  estimatedDuration: string;
  leadTimeDays: string;
  requiredSkills: string;
  assignedDeptId: string;
  nextDueDate: string;
  tasks: PmTask[];
}

const emptyForm = (): TemplateForm => ({
  name: '',
  assetId: '',
  assetCategory: '',
  applyTo: 'asset',
  frequency: 'monthly',
  intervalValue: '1',
  estimatedDuration: '2',
  leadTimeDays: '7',
  requiredSkills: 'Mechanical',
  assignedDeptId: '',
  nextDueDate: '',
  tasks: [{ sequence: 1, description: '', isRequired: true }],
});

function canEdit(role: string) {
  return role === 'admin' || role === 'engineer';
}

export function PmSchedulingPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<PmTemplate[]>([]);
  const [forecast, setForecast] = useState<PmTemplate[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'templates' | 'forecast'>('templates');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PmTemplate | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [schedulerResult, setSchedulerResult] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, fRes] = await Promise.all([
        apiFetch<{ templates: PmTemplate[] }>('/api/pm-templates'),
        apiFetch<{ forecast: PmTemplate[] }>('/api/pm-templates/forecast?days=60'),
      ]);
      setTemplates(tRes.templates);
      setForecast(fRes.forecast);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    apiFetch<{ assets: Asset[] }>('/api/assets?hierarchyLevel=4').then((d) => setAssets(d.assets));
    apiFetch<{ departments: Department[] }>('/api/departments').then((d) => setDepartments(d.departments));
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setError('');
    setShowForm(true);
  };

  const openEdit = (t: PmTemplate) => {
    setEditing(t);
    setForm({
      name: t.name,
      assetId: t.assetId ?? '',
      assetCategory: t.assetCategory ?? '',
      applyTo: t.assetId ? 'asset' : 'category',
      frequency: t.frequency,
      intervalValue: String(t.intervalValue),
      estimatedDuration: t.estimatedDuration?.toString() ?? '',
      leadTimeDays: String(t.leadTimeDays),
      requiredSkills: t.requiredSkills.join(', '),
      assignedDeptId: t.assignedDeptId ?? '',
      nextDueDate: t.nextDueDate?.slice(0, 10) ?? '',
      tasks: t.tasks?.length ? t.tasks : [{ sequence: 1, description: '', isRequired: true }],
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        assetId: form.applyTo === 'asset' ? form.assetId : null,
        assetCategory: form.applyTo === 'category' ? form.assetCategory : null,
        frequency: form.frequency,
        intervalValue: parseInt(form.intervalValue, 10),
        estimatedDuration: form.estimatedDuration ? parseFloat(form.estimatedDuration) : undefined,
        leadTimeDays: parseInt(form.leadTimeDays, 10),
        requiredSkills: form.requiredSkills.split(',').map((s) => s.trim()).filter(Boolean),
        assignedDeptId: form.assignedDeptId || null,
        nextDueDate: form.nextDueDate || null,
        tasks: form.tasks.filter((t) => t.description.trim()).map((t, i) => ({
          sequence: i + 1,
          description: t.description,
          isRequired: t.isRequired,
        })),
      };

      if (editing) {
        await apiFetch(`/api/pm-templates/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/api/pm-templates', { method: 'POST', body: JSON.stringify(payload) });
      }

      setShowForm(false);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const runScheduler = async () => {
    setSaving(true);
    setSchedulerResult(null);
    try {
      const res = await apiFetch<{ message: string; created: { woNumber: string }[] }>(
        '/api/pm-templates/run-scheduler',
        { method: 'POST' },
      );
      setSchedulerResult(res.message);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Scheduler failed');
    } finally {
      setSaving(false);
    }
  };

  const addTask = () => {
    setForm({ ...form, tasks: [...form.tasks, { sequence: form.tasks.length + 1, description: '', isRequired: true }] });
  };

  const DueBadge = ({ date }: { date: string | null }) => {
    const status = dueStatus(date);
    const days = daysUntil(date);
    const cls =
      status === 'overdue' ? 'bg-red-100 text-red-700' :
      status === 'due_soon' ? 'bg-amber-100 text-amber-700' :
      'bg-green-100 text-green-700';
    return (
      <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>
        {days === null ? '—' : days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d`}
      </span>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Preventive Maintenance</h1>
          <p className="text-gray-500 mt-1">PM templates, schedules, and auto work order generation</p>
        </div>
        <div className="flex gap-2">
          {canEdit(user!.role) && (
            <>
              <button
                onClick={runScheduler}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Play size={16} />
                Run Scheduler
              </button>
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2 bg-ldpl-accent text-white rounded-lg hover:bg-blue-700"
              >
                <Plus size={18} />
                New PM Template
              </button>
            </>
          )}
        </div>
      </div>

      {schedulerResult && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg flex items-center gap-2">
          <CheckCircle2 size={16} />
          {schedulerResult}
          <button onClick={() => setSchedulerResult(null)} className="ml-auto underline text-xs">dismiss</button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">dismiss</button>
        </div>
      )}

      <div className="flex gap-2 mb-4 border-b border-gray-200">
        {(['templates', 'forecast'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t ? 'border-ldpl-accent text-ldpl-accent' : 'border-transparent text-gray-500'
            }`}
          >
            {t === 'templates' ? 'PM Templates' : 'Due / Forecast (60 days)'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">Loading...</div>
      ) : tab === 'templates' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.length === 0 ? (
            <div className="col-span-2 p-8 text-center text-gray-500 bg-white rounded-xl border">No PM templates yet.</div>
          ) : templates.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{t.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t.asset ? `${t.asset.assetTagNo} — ${t.asset.name}` :
                      t.assetCategory ? `All ${CATEGORY_LABELS[t.assetCategory as AssetCategory]} assets` : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <DueBadge date={t.nextDueDate} />
                  {canEdit(user!.role) && (
                    <button onClick={() => openEdit(t)} className="p-1 text-gray-400 hover:text-ldpl-accent">
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs mb-3">
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                  Every {t.intervalValue} {PM_FREQUENCY_LABELS[t.frequency].toLowerCase()}
                </span>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                  Lead: {t.leadTimeDays}d
                </span>
                <span className={`px-2 py-0.5 rounded ${t.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                  {t.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              {t.tasks && t.tasks.length > 0 && (
                <ul className="text-xs text-gray-600 space-y-1 border-t pt-3">
                  {t.tasks.slice(0, 4).map((task) => (
                    <li key={task.sequence} className="flex gap-2">
                      <span className="text-gray-400">{task.sequence}.</span>
                      {task.description}
                    </li>
                  ))}
                  {t.tasks.length > 4 && <li className="text-gray-400">+{t.tasks.length - 4} more...</li>}
                </ul>
              )}
              <div className="mt-3 pt-3 border-t text-xs text-gray-400 flex justify-between">
                <span>Last done: {t.lastDoneDate?.slice(0, 10) ?? 'Never'}</span>
                <span>Next: {t.nextDueDate?.slice(0, 10) ?? '—'}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {forecast.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No PMs due in the next 60 days.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Template</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Applies To</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Next Due</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {forecast.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{t.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {t.asset?.name ?? (t.assetCategory ? `All ${t.assetCategory}` : '—')}
                    </td>
                    <td className="px-4 py-3">{t.nextDueDate?.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <DueBadge date={t.nextDueDate} />
                      {dueStatus(t.nextDueDate) === 'overdue' && (
                        <AlertTriangle size={14} className="inline ml-1 text-red-500" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">{editing ? 'Edit PM Template' : 'New PM Template'}</h2>
              <button onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Template Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Apply To</label>
                  <select value={form.applyTo} onChange={(e) => setForm({ ...form, applyTo: e.target.value as 'asset' | 'category' })} className="w-full px-3 py-2 border rounded-lg">
                    <option value="asset">Single Asset</option>
                    <option value="category">Asset Category</option>
                  </select>
                </div>
                <div>
                  {form.applyTo === 'asset' ? (
                    <>
                      <label className="block text-sm font-medium mb-1">Asset *</label>
                      <select value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} required className="w-full px-3 py-2 border rounded-lg">
                        <option value="">— Select —</option>
                        {assets.map((a) => <option key={a.id} value={a.id}>{a.assetTagNo} — {a.name}</option>)}
                      </select>
                    </>
                  ) : (
                    <>
                      <label className="block text-sm font-medium mb-1">Category *</label>
                      <select value={form.assetCategory} onChange={(e) => setForm({ ...form, assetCategory: e.target.value })} required className="w-full px-3 py-2 border rounded-lg">
                        <option value="">— Select —</option>
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Frequency *</label>
                  <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as PmFrequency })} className="w-full px-3 py-2 border rounded-lg">
                    {Object.entries(PM_FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Interval *</label>
                  <input type="number" min="1" value={form.intervalValue} onChange={(e) => setForm({ ...form, intervalValue: e.target.value })} required className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Est. Duration (hrs)</label>
                  <input type="number" step="0.5" value={form.estimatedDuration} onChange={(e) => setForm({ ...form, estimatedDuration: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Lead Time (days)</label>
                  <input type="number" min="0" value={form.leadTimeDays} onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">First / Next Due Date</label>
                  <input type="date" value={form.nextDueDate} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Assigned Department</label>
                  <select
                    value={form.assignedDeptId}
                    onChange={(e) => setForm({ ...form, assignedDeptId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">— Select —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Required Skills (comma-separated)</label>
                  <input value={form.requiredSkills} onChange={(e) => setForm({ ...form, requiredSkills: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Task Checklist</label>
                  <button type="button" onClick={addTask} className="text-xs text-ldpl-accent hover:underline">+ Add task</button>
                </div>
                {form.tasks.map((task, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <span className="text-sm text-gray-400 pt-2 w-6">{i + 1}.</span>
                    <input
                      value={task.description}
                      onChange={(e) => {
                        const tasks = [...form.tasks];
                        tasks[i] = { ...tasks[i], description: e.target.value };
                        setForm({ ...form, tasks });
                      }}
                      placeholder="Task description..."
                      className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-ldpl-accent text-white rounded-lg disabled:opacity-60">
                  {saving ? 'Saving...' : editing ? 'Update' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

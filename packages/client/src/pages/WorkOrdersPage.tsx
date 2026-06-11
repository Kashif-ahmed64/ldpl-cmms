import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Plus,
  Search,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  UserPlus,
  Clock,
  ClipboardList,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch, ApiError } from '@/lib/api';
import type { Asset } from '@/types/asset';
import type {
  Assignee,
  WorkOrder,
  WorkOrderPriority,
  WorkOrderType,
} from '@/types/workOrder';
import {
  WO_PRIORITY_LABELS,
  WO_STATUS_LABELS,
  WO_TYPE_LABELS,
  priorityColor,
  statusColor,
} from '@/types/workOrder';

interface CreateForm {
  type: WorkOrderType;
  priority: WorkOrderPriority;
  assetId: string;
  problemDescription: string;
  assignedToId: string;
  estimatedHours: string;
  plannedStartDate: string;
  plannedEndDate: string;
}

const emptyCreate = (): CreateForm => ({
  type: 'CM',
  priority: 'medium',
  assetId: '',
  problemDescription: '',
  assignedToId: '',
  estimatedHours: '',
  plannedStartDate: '',
  plannedEndDate: '',
});

function canCreate(role: string) {
  return ['admin', 'manager', 'engineer', 'supervisor', 'technician'].includes(role);
}

function canAssign(role: string) {
  return ['admin', 'manager', 'engineer', 'supervisor'].includes(role);
}

function canApprove(role: string) {
  return ['admin', 'manager', 'engineer', 'supervisor'].includes(role);
}

export function WorkOrdersPage() {
  const { user } = useAuth();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selected, setSelected] = useState<WorkOrder | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [showLabor, setShowLabor] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate());
  const [assignToId, setAssignToId] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [laborHours, setLaborHours] = useState('');
  const [laborDesc, setLaborDesc] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadWorkOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      const data = await apiFetch<{ workOrders: WorkOrder[] }>(`/api/work-orders?${params}`);
      setWorkOrders(data.workOrders);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter]);

  useEffect(() => {
    loadWorkOrders();
    apiFetch<{ assets: Asset[] }>('/api/assets?hierarchyLevel=4').then((d) =>
      setAssets(d.assets),
    );
    apiFetch<{ assignees: Assignee[] }>('/api/work-orders/assignees').then((d) =>
      setAssignees(d.assignees),
    );
  }, [loadWorkOrders]);

  const refreshSelected = async (id: string) => {
    const data = await apiFetch<{ workOrder: WorkOrder }>(`/api/work-orders/${id}`);
    setSelected(data.workOrder);
    await loadWorkOrders();
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/work-orders', {
        method: 'POST',
        body: JSON.stringify({
          ...createForm,
          assignedToId: createForm.assignedToId || null,
          estimatedHours: createForm.estimatedHours ? parseFloat(createForm.estimatedHours) : undefined,
          plannedStartDate: createForm.plannedStartDate || null,
          plannedEndDate: createForm.plannedEndDate || null,
        }),
      });
      setShowCreate(false);
      setCreateForm(emptyCreate());
      await loadWorkOrders();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create work order');
    } finally {
      setSaving(false);
    }
  };

  const workflowAction = async (action: string, body?: object) => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/work-orders/${selected.id}/${action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      setShowAssign(false);
      setShowComplete(false);
      setShowLabor(false);
      setRootCause('');
      setCorrectiveAction('');
      setLaborHours('');
      setLaborDesc('');
      await refreshSelected(selected.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  const isAssignee = selected?.assignedToId === user?.id;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Work Orders</h1>
          <p className="text-gray-500 mt-1">Maintenance tasks — corrective, preventive, and inspections</p>
        </div>
        {canCreate(user!.role) && (
          <button
            onClick={() => { setCreateForm(emptyCreate()); setShowCreate(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-ldpl-accent text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={18} />
            New Work Order
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search WO number, asset, description..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
          <option value="">All Statuses</option>
          {Object.entries(WO_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
          <option value="">All Types</option>
          {Object.entries(WO_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{k} — {v}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading work orders...</div>
          ) : workOrders.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No work orders found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">WO #</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Asset</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Assigned</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {workOrders.map((wo) => (
                  <tr
                    key={wo.id}
                    onClick={() => setSelected(wo)}
                    className={`cursor-pointer hover:bg-blue-50 ${selected?.id === wo.id ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-ldpl-accent">{wo.woNumber}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{wo.asset.name}</div>
                      <div className="text-xs text-gray-400">{wo.asset.assetTagNo}</div>
                    </td>
                    <td className="px-4 py-3">{wo.type}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${priorityColor(wo.priority)}`}>
                        {WO_PRIORITY_LABELS[wo.priority]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${statusColor(wo.status)}`}>
                        {WO_STATUS_LABELS[wo.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{wo.assignedTo?.fullName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          {selected ? (
            <>
              <div className="mb-4">
                <p className="font-mono text-sm text-ldpl-accent">{selected.woNumber}</p>
                <h2 className="text-lg font-bold">{selected.asset.name}</h2>
                <div className="flex gap-2 mt-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${priorityColor(selected.priority)}`}>
                    {WO_PRIORITY_LABELS[selected.priority]}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs ${statusColor(selected.status)}`}>
                    {WO_STATUS_LABELS[selected.status]}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs bg-gray-100">{selected.type}</span>
                </div>
              </div>

              <p className="text-sm text-gray-700 mb-4">{selected.problemDescription}</p>

              <dl className="space-y-2 text-sm mb-4">
                {[
                  ['Reported By', selected.reportedBy.fullName],
                  ['Assigned To', selected.assignedTo?.fullName ?? 'Unassigned'],
                  ['Est. Hours', selected.estimatedHours ?? '—'],
                  ['Labor Cost', selected.laborCost ? `PKR ${selected.laborCost.toLocaleString()}` : '—'],
                  ['Total Cost', selected.workOrderCost ? `PKR ${selected.workOrderCost.toLocaleString()}` : '—'],
                  ['Planned End', selected.plannedEndDate?.slice(0, 10) ?? '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="font-medium text-right">{value}</dd>
                  </div>
                ))}
              </dl>

              {selected.laborEntries.length > 0 && (
                <div className="mb-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-2 flex items-center gap-1">
                    <Clock size={14} /> Labor Entries
                  </p>
                  {selected.laborEntries.map((e) => (
                    <div key={e.id} className="text-xs bg-gray-50 rounded p-2 mb-1">
                      {e.user.fullName} — {e.hours}h {e.description && `· ${e.description}`}
                    </div>
                  ))}
                </div>
              )}

              {selected.rootCause && (
                <div className="mb-4 pt-4 border-t text-sm">
                  <p className="text-gray-500">Root Cause</p>
                  <p>{selected.rootCause}</p>
                  <p className="text-gray-500 mt-2">Corrective Action</p>
                  <p>{selected.correctiveAction}</p>
                </div>
              )}

              <div className="pt-4 border-t flex flex-wrap gap-2">
                {canAssign(user!.role) && ['open', 'assigned', 'on_hold'].includes(selected.status) && (
                  <button onClick={() => { setAssignToId(selected.assignedToId ?? ''); setShowAssign(true); }} className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
                    <UserPlus size={14} /> Assign
                  </button>
                )}
                {(['assigned', 'on_hold'].includes(selected.status) && (isAssignee || canAssign(user!.role))) && (
                  <button onClick={() => workflowAction('start')} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
                    <Play size={14} /> Start Work
                  </button>
                )}
                {selected.status === 'in_progress' && (isAssignee || canAssign(user!.role)) && (
                  <>
                    <button onClick={() => workflowAction('hold')} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
                      <Pause size={14} /> Hold
                    </button>
                    <button onClick={() => setShowLabor(true)} className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
                      <Clock size={14} /> Log Hours
                    </button>
                    <button onClick={() => setShowComplete(true)} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg">
                      <ClipboardList size={14} /> Complete
                    </button>
                  </>
                )}
                {canApprove(user!.role) && selected.status === 'pending_approval' && (
                  <>
                    <button onClick={() => workflowAction('approve')} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg">
                      <CheckCircle size={14} /> Approve & Close
                    </button>
                    <button onClick={() => workflowAction('reject')} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg">
                      Send Back
                    </button>
                  </>
                )}
                {canAssign(user!.role) && !['completed', 'cancelled'].includes(selected.status) && (
                  <button onClick={() => workflowAction('cancel')} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-sm border border-red-200 text-red-500 rounded-lg">
                    <XCircle size={14} /> Cancel
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="text-center text-gray-400 py-12">
              Select a work order to view details and take action
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b font-semibold">Create Work Order</div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Type *</label>
                  <select value={createForm.type} onChange={(e) => setCreateForm({ ...createForm, type: e.target.value as WorkOrderType })} className="w-full px-3 py-2 border rounded-lg">
                    {Object.entries(WO_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Priority *</label>
                  <select value={createForm.priority} onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value as WorkOrderPriority })} className="w-full px-3 py-2 border rounded-lg">
                    {Object.entries(WO_PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Asset *</label>
                  <select value={createForm.assetId} onChange={(e) => setCreateForm({ ...createForm, assetId: e.target.value })} required className="w-full px-3 py-2 border rounded-lg">
                    <option value="">— Select equipment —</option>
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.assetTagNo} — {a.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Problem / Task Description *</label>
                  <textarea value={createForm.problemDescription} onChange={(e) => setCreateForm({ ...createForm, problemDescription: e.target.value })} required rows={3} minLength={5} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Assign To</label>
                  <select value={createForm.assignedToId} onChange={(e) => setCreateForm({ ...createForm, assignedToId: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                    <option value="">— Unassigned —</option>
                    {assignees.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Est. Hours</label>
                  <input type="number" step="0.5" value={createForm.estimatedHours} onChange={(e) => setCreateForm({ ...createForm, estimatedHours: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Planned Start</label>
                  <input type="date" value={createForm.plannedStartDate} onChange={(e) => setCreateForm({ ...createForm, plannedStartDate: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Planned End</label>
                  <input type="date" value={createForm.plannedEndDate} onChange={(e) => setCreateForm({ ...createForm, plannedEndDate: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-ldpl-accent text-white rounded-lg disabled:opacity-60">{saving ? 'Creating...' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAssign && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <h3 className="font-semibold mb-4">Assign {selected.woNumber}</h3>
            <select value={assignToId} onChange={(e) => setAssignToId(e.target.value)} className="w-full px-3 py-2 border rounded-lg mb-4">
              <option value="">Select technician</option>
              {assignees.map((a) => <option key={a.id} value={a.id}>{a.fullName} ({a.role})</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAssign(false)} className="px-4 py-2 text-gray-600 rounded-lg">Cancel</button>
              <button onClick={() => workflowAction('assign', { assignedToId: assignToId })} disabled={!assignToId || saving} className="px-4 py-2 bg-ldpl-accent text-white rounded-lg">Assign</button>
            </div>
          </div>
        </div>
      )}

      {showComplete && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <h3 className="font-semibold mb-4">Complete {selected.woNumber}</h3>
            <textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} placeholder="Root cause..." rows={2} className="w-full px-3 py-2 border rounded-lg mb-3" />
            <textarea value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} placeholder="Corrective action taken..." rows={2} className="w-full px-3 py-2 border rounded-lg mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowComplete(false)} className="px-4 py-2 text-gray-600 rounded-lg">Cancel</button>
              <button onClick={() => workflowAction('complete', { rootCause, correctiveAction })} disabled={rootCause.length < 3 || correctiveAction.length < 3 || saving} className="px-4 py-2 bg-ldpl-accent text-white rounded-lg">Submit for Approval</button>
            </div>
          </div>
        </div>
      )}

      {showLabor && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <h3 className="font-semibold mb-4">Log Labor — {selected.woNumber}</h3>
            <input type="number" step="0.25" value={laborHours} onChange={(e) => setLaborHours(e.target.value)} placeholder="Hours worked" className="w-full px-3 py-2 border rounded-lg mb-3" />
            <textarea value={laborDesc} onChange={(e) => setLaborDesc(e.target.value)} placeholder="Task description..." rows={2} className="w-full px-3 py-2 border rounded-lg mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowLabor(false)} className="px-4 py-2 text-gray-600 rounded-lg">Cancel</button>
              <button
                onClick={() => workflowAction('labor', {
                  startTime: new Date(Date.now() - parseFloat(laborHours || '1') * 3600000).toISOString(),
                  endTime: new Date().toISOString(),
                  hours: parseFloat(laborHours),
                  description: laborDesc,
                })}
                disabled={!laborHours || saving}
                className="px-4 py-2 bg-ldpl-accent text-white rounded-lg"
              >
                Log Hours
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

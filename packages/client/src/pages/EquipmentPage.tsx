import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Plus,
  Search,
  ScanLine,
  Printer,
  Pencil,
  ArrowRightLeft,
  Ban,
  ChevronRight,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch, ApiError } from '@/lib/api';
import { BarcodeLabel, printBarcodeLabel } from '@/components/BarcodeLabel';
import type { Department } from '@/types';
import type {
  Asset,
  AssetCategory,
  AssetStatus,
  Criticality,
  StaffMember,
} from '@/types/asset';
import {
  CATEGORY_LABELS,
  CRITICALITY_LABELS,
  HIERARCHY_LABELS,
  STATUS_LABELS,
} from '@/types/asset';

interface AssetForm {
  name: string;
  category: AssetCategory;
  parentId: string;
  hierarchyLevel: number;
  assetTagNo: string;
  make: string;
  model: string;
  serialNumber: string;
  purchaseDate: string;
  purchaseCost: string;
  locationPath: string;
  departmentId: string;
  assignedToId: string;
  status: AssetStatus;
  criticality: Criticality;
  warrantyExpiry: string;
  meterReading: string;
  meterUnit: string;
  notes: string;
}

const emptyForm = (): AssetForm => ({
  name: '',
  category: 'mechanical',
  parentId: '',
  hierarchyLevel: 4,
  assetTagNo: '',
  make: '',
  model: '',
  serialNumber: '',
  purchaseDate: '',
  purchaseCost: '',
  locationPath: '',
  departmentId: '',
  assignedToId: '',
  status: 'active',
  criticality: 'medium',
  warrantyExpiry: '',
  meterReading: '',
  meterUnit: 'Hours',
  notes: '',
});

function canEdit(role: string) {
  return role === 'admin' || role === 'engineer';
}

export function EquipmentPage() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [parentOptions, setParentOptions] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Asset | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState<AssetForm>(emptyForm());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [scanTag, setScanTag] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferDept, setTransferDept] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [showDecommission, setShowDecommission] = useState(false);
  const [decommissionReason, setDecommissionReason] = useState('');

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (categoryFilter) params.set('category', categoryFilter);
      if (statusFilter) params.set('status', statusFilter);
      const data = await apiFetch<{ assets: Asset[] }>(`/api/assets?${params}`);
      setAssets(data.assets);
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, statusFilter]);

  useEffect(() => {
    loadAssets();
    apiFetch<{ departments: Department[] }>('/api/departments').then((d) =>
      setDepartments(d.departments),
    );
    apiFetch<{ staff: StaffMember[] }>('/api/assets/staff').then((d) => setStaff(d.staff));
    apiFetch<{ assets: Asset[] }>('/api/assets?hierarchyLevel=3').then((d) => {
      apiFetch<{ assets: Asset[] }>('/api/assets?hierarchyLevel=2').then((d2) => {
        apiFetch<{ assets: Asset[] }>('/api/assets?hierarchyLevel=1').then((d1) => {
          setParentOptions([...d1.assets, ...d2.assets, ...d.assets]);
        });
      });
    });
  }, [loadAssets]);

  const openCreate = async () => {
    setEditing(null);
    setForm(emptyForm());
    setError('');
    try {
      const tagRes = await apiFetch<{ assetTagNo: string }>('/api/assets/next-tag');
      setForm({ ...emptyForm(), assetTagNo: tagRes.assetTagNo });
    } catch {
      setForm(emptyForm());
    }
    setShowForm(true);
  };

  const openEdit = (asset: Asset) => {
    setEditing(asset);
    setForm({
      name: asset.name,
      category: asset.category,
      parentId: asset.parentId ?? '',
      hierarchyLevel: asset.hierarchyLevel,
      assetTagNo: asset.assetTagNo,
      make: asset.make ?? '',
      model: asset.model ?? '',
      serialNumber: asset.serialNumber ?? '',
      purchaseDate: asset.purchaseDate?.slice(0, 10) ?? '',
      purchaseCost: asset.purchaseCost?.toString() ?? '',
      locationPath: asset.locationPath ?? '',
      departmentId: asset.departmentId ?? '',
      assignedToId: asset.assignedToId ?? '',
      status: asset.status,
      criticality: asset.criticality,
      warrantyExpiry: asset.warrantyExpiry?.slice(0, 10) ?? '',
      meterReading: asset.meterReading?.toString() ?? '',
      meterUnit: asset.meterUnit ?? 'Hours',
      notes: asset.notes ?? '',
    });
    setError('');
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        category: form.category,
        parentId: form.parentId || null,
        hierarchyLevel: form.hierarchyLevel,
        assetTagNo: form.assetTagNo || undefined,
        make: form.make || undefined,
        model: form.model || undefined,
        serialNumber: form.serialNumber || undefined,
        purchaseDate: form.purchaseDate || null,
        purchaseCost: form.purchaseCost ? parseFloat(form.purchaseCost) : null,
        locationPath: form.locationPath || undefined,
        departmentId: form.departmentId || null,
        assignedToId: form.assignedToId || null,
        status: form.status,
        criticality: form.criticality,
        warrantyExpiry: form.warrantyExpiry || null,
        meterReading: form.meterReading ? parseFloat(form.meterReading) : null,
        meterUnit: form.meterUnit || undefined,
        notes: form.notes || undefined,
      };

      if (editing) {
        await apiFetch(`/api/assets/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/assets', { method: 'POST', body: JSON.stringify(payload) });
      }

      setShowForm(false);
      await loadAssets();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save asset');
    } finally {
      setSaving(false);
    }
  };

  const handleScan = async () => {
    if (!scanTag.trim()) return;
    try {
      const data = await apiFetch<{ asset: Asset }>(`/api/assets/lookup/${encodeURIComponent(scanTag.trim())}`);
      setSelected(data.asset);
      setScanTag('');
    } catch {
      setError(`No asset found for tag: ${scanTag}`);
    }
  };

  const handleTransfer = async () => {
    if (!selected || !transferDept || !transferReason) return;
    await apiFetch(`/api/assets/${selected.id}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ departmentId: transferDept, reason: transferReason }),
    });
    setShowTransfer(false);
    setTransferReason('');
    await loadAssets();
    const updated = await apiFetch<{ asset: Asset }>(`/api/assets/${selected.id}`);
    setSelected(updated.asset);
  };

  const handleDecommission = async () => {
    if (!selected || decommissionReason.length < 5) return;
    await apiFetch(`/api/assets/${selected.id}/decommission`, {
      method: 'POST',
      body: JSON.stringify({ reason: decommissionReason }),
    });
    setShowDecommission(false);
    setDecommissionReason('');
    await loadAssets();
    const updated = await apiFetch<{ asset: Asset }>(`/api/assets/${selected.id}`);
    setSelected(updated.asset);
  };

  const statusColor = (status: AssetStatus) => {
    const map: Record<AssetStatus, string> = {
      active: 'bg-green-100 text-green-700',
      under_maintenance: 'bg-amber-100 text-amber-700',
      decommissioned: 'bg-gray-200 text-gray-600',
      spare: 'bg-blue-100 text-blue-700',
    };
    return map[status];
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Equipment Registry</h1>
          <p className="text-gray-500 mt-1">
            Plant → System → Sub-System → Equipment → Component
          </p>
        </div>
        {canEdit(user!.role) && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-ldpl-accent text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={18} />
            Add Asset
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, tag, serial..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none"
        >
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none"
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            value={scanTag}
            onChange={(e) => setScanTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            placeholder="Scan asset tag..."
            className="px-3 py-2 border border-gray-300 rounded-lg w-40 focus:ring-2 focus:ring-ldpl-accent focus:outline-none"
          />
          <button
            onClick={handleScan}
            className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <ScanLine size={16} />
            Lookup
          </button>
        </div>
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
            <div className="p-8 text-center text-gray-500">Loading assets...</div>
          ) : assets.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No assets found. Add your first asset.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Tag / Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Level</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Department</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {assets.map((asset) => (
                  <tr
                    key={asset.id}
                    onClick={() => setSelected(asset)}
                    className={`cursor-pointer hover:bg-blue-50 ${selected?.id === asset.id ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-ldpl-accent">{asset.assetTagNo}</div>
                      <div className="font-medium">{asset.name}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {HIERARCHY_LABELS[asset.hierarchyLevel] ?? asset.hierarchyLevel}
                    </td>
                    <td className="px-4 py-3">{CATEGORY_LABELS[asset.category]}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${statusColor(asset.status)}`}>
                        {STATUS_LABELS[asset.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{asset.department?.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          {selected ? (
            <>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-mono text-sm text-ldpl-accent">{selected.assetTagNo}</p>
                  <h2 className="text-lg font-bold">{selected.name}</h2>
                  <p className="text-sm text-gray-500">
                    {HIERARCHY_LABELS[selected.hierarchyLevel]} · {CATEGORY_LABELS[selected.category]}
                  </p>
                </div>
                <div className="flex gap-1">
                  {canEdit(user!.role) && selected.status !== 'decommissioned' && (
                    <button onClick={() => openEdit(selected)} className="p-2 text-gray-500 hover:text-ldpl-accent rounded" title="Edit">
                      <Pencil size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => printBarcodeLabel(selected.assetTagNo, selected.name)}
                    className="p-2 text-gray-500 hover:text-ldpl-accent rounded"
                    title="Print Label"
                  >
                    <Printer size={16} />
                  </button>
                </div>
              </div>

              <BarcodeLabel tag={selected.assetTagNo} name={selected.name} className="mb-4 p-3 bg-gray-50 rounded-lg" />

              <dl className="space-y-2 text-sm">
                {[
                  ['Status', STATUS_LABELS[selected.status]],
                  ['Criticality', CRITICALITY_LABELS[selected.criticality]],
                  ['Make / Model', [selected.make, selected.model].filter(Boolean).join(' / ') || '—'],
                  ['Serial No', selected.serialNumber ?? '—'],
                  ['Location', selected.locationPath ?? '—'],
                  ['Department', selected.department?.name ?? '—'],
                  ['Assigned To', selected.assignedTo?.fullName ?? '—'],
                  ['Purchase Cost', selected.purchaseCost ? `PKR ${selected.purchaseCost.toLocaleString()}` : '—'],
                  ['Current Value', selected.currentValue ? `PKR ${selected.currentValue.toLocaleString()}` : '—'],
                  ['Meter', selected.meterReading ? `${selected.meterReading} ${selected.meterUnit}` : '—'],
                  ['Warranty Expiry', selected.warrantyExpiry?.slice(0, 10) ?? '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="font-medium text-right">{value}</dd>
                  </div>
                ))}
              </dl>

              {selected.parent && (
                <div className="mt-4 pt-4 border-t text-sm">
                  <p className="text-gray-500 mb-1">Parent Asset</p>
                  <button
                    onClick={() => apiFetch<{ asset: Asset }>(`/api/assets/${selected.parent!.id}`).then((d) => setSelected(d.asset))}
                    className="flex items-center gap-1 text-ldpl-accent hover:underline"
                  >
                    {selected.parent.assetTagNo} — {selected.parent.name}
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}

              {selected.notes && (
                <div className="mt-4 pt-4 border-t text-sm">
                  <p className="text-gray-500 mb-1">Notes</p>
                  <p>{selected.notes}</p>
                </div>
              )}

              {canEdit(user!.role) && selected.status !== 'decommissioned' && (
                <div className="mt-4 pt-4 border-t flex gap-2">
                  <button
                    onClick={() => { setTransferDept(selected.departmentId ?? ''); setShowTransfer(true); }}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
                  >
                    <ArrowRightLeft size={14} /> Transfer
                  </button>
                  <button
                    onClick={() => setShowDecommission(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    <Ban size={14} /> Decommission
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-gray-400 py-12">
              Select an asset to view details, barcode, and actions
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">{editing ? 'Edit Asset' : 'Add New Asset'}</h2>
              <button onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Asset Name *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Asset Tag</label>
                  <input value={form.assetTagNo} onChange={(e) => setForm({ ...form, assetTagNo: e.target.value })} placeholder="Auto-generated if blank" disabled={!!editing} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none disabled:bg-gray-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Hierarchy Level *</label>
                  <select value={form.hierarchyLevel} onChange={(e) => setForm({ ...form, hierarchyLevel: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none">
                    {Object.entries(HIERARCHY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Category *</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as AssetCategory })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none">
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Parent Asset</label>
                  <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none">
                    <option value="">— None (root) —</option>
                    {parentOptions.filter((p) => p.hierarchyLevel < form.hierarchyLevel && p.id !== editing?.id).map((p) => (
                      <option key={p.id} value={p.id}>{p.assetTagNo} — {p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Department</label>
                  <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none">
                    <option value="">— Select —</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Assigned To</label>
                  <select value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none">
                    <option value="">— None —</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Make</label>
                  <input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Model</label>
                  <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Serial Number</label>
                  <input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Location</label>
                  <input value={form.locationPath} onChange={(e) => setForm({ ...form, locationPath: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AssetStatus })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Criticality</label>
                  <select value={form.criticality} onChange={(e) => setForm({ ...form, criticality: e.target.value as Criticality })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none">
                    {Object.entries(CRITICALITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Purchase Date</label>
                  <input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Purchase Cost (PKR)</label>
                  <input type="number" value={form.purchaseCost} onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Meter Reading</label>
                  <input type="number" value={form.meterReading} onChange={(e) => setForm({ ...form, meterReading: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Meter Unit</label>
                  <select value={form.meterUnit} onChange={(e) => setForm({ ...form, meterUnit: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none">
                    <option value="Hours">Hours</option>
                    <option value="KM">KM</option>
                    <option value="Cycles">Cycles</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-ldpl-accent text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
                  {saving ? 'Saving...' : editing ? 'Update Asset' : 'Create Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTransfer && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <h3 className="font-semibold mb-4">Transfer Asset — {selected.name}</h3>
            <select value={transferDept} onChange={(e) => setTransferDept(e.target.value)} className="w-full px-3 py-2 border rounded-lg mb-3">
              <option value="">Select department</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <textarea value={transferReason} onChange={(e) => setTransferReason(e.target.value)} placeholder="Transfer reason..." rows={2} className="w-full px-3 py-2 border rounded-lg mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowTransfer(false)} className="px-4 py-2 text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={handleTransfer} className="px-4 py-2 bg-ldpl-accent text-white rounded-lg">Transfer</button>
            </div>
          </div>
        </div>
      )}

      {showDecommission && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <h3 className="font-semibold mb-4 text-red-700">Decommission — {selected.name}</h3>
            <textarea value={decommissionReason} onChange={(e) => setDecommissionReason(e.target.value)} placeholder="Reason for decommission (required)..." rows={3} className="w-full px-3 py-2 border rounded-lg mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDecommission(false)} className="px-4 py-2 text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={handleDecommission} className="px-4 py-2 bg-red-600 text-white rounded-lg">Decommission</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, Search, Truck, FileText, ShoppingCart, CheckCircle, X, PackageCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch, ApiError } from '@/lib/api';
import type { InventoryItemRef, PoStatus, PrStatus, PurchaseOrder, PurchaseRequisition, VendorDetail } from '@/types/purchasing';
import {
  PO_STATUS_LABELS,
  PR_STATUS_LABELS,
  poStatusColor,
  prStatusColor,
} from '@/types/purchasing';

type Tab = 'vendors' | 'requisitions' | 'orders';

interface VendorForm {
  name: string;
  code: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  category: string;
  rating: string;
}

interface PrLineForm {
  inventoryItemId: string;
  description: string;
  quantity: string;
  unit: string;
  estimatedUnitCost: string;
}

interface PoLineForm {
  inventoryItemId: string;
  quantity: string;
  unit: string;
  unitRate: string;
}

const emptyVendorForm = (): VendorForm => ({
  name: '',
  code: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  category: 'mechanical',
  rating: '',
});

const emptyPrLine = (): PrLineForm => ({
  inventoryItemId: '',
  description: '',
  quantity: '1',
  unit: 'Nos',
  estimatedUnitCost: '',
});

const emptyPoLine = (): PoLineForm => ({
  inventoryItemId: '',
  quantity: '1',
  unit: 'Nos',
  unitRate: '',
});

function canManageVendors(role: string) {
  return role === 'admin' || role === 'storekeeper';
}

function canCreatePr(role: string) {
  return ['admin', 'storekeeper', 'engineer'].includes(role);
}

function canApprovePr(role: string) {
  return ['admin', 'manager', 'hod', 'supervisor'].includes(role);
}

function canManagePo(role: string) {
  return role === 'admin' || role === 'storekeeper';
}

function canApprovePo(role: string) {
  return role === 'admin' || role === 'manager';
}

function canReceive(role: string) {
  return role === 'admin' || role === 'storekeeper';
}

export function PurchasingPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('requisitions');
  const [vendors, setVendors] = useState<VendorDetail[]>([]);
  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [prStatusFilter, setPrStatusFilter] = useState('');
  const [poStatusFilter, setPoStatusFilter] = useState('');
  const [selectedPr, setSelectedPr] = useState<PurchaseRequisition | null>(null);
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [showPrForm, setShowPrForm] = useState(false);
  const [showPoForm, setShowPoForm] = useState(false);
  const [vendorForm, setVendorForm] = useState<VendorForm>(emptyVendorForm());
  const [prNotes, setPrNotes] = useState('');
  const [prLines, setPrLines] = useState<PrLineForm[]>([emptyPrLine()]);
  const [poVendorId, setPoVendorId] = useState('');
  const [poRequisitionId, setPoRequisitionId] = useState('');
  const [poTerms, setPoTerms] = useState('');
  const [poLines, setPoLines] = useState<PoLineForm[]>([emptyPoLine()]);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadVendors = useCallback(async () => {
    const data = await apiFetch<{ vendors: VendorDetail[] }>('/api/vendors');
    setVendors(data.vendors);
  }, []);

  const loadRequisitions = useCallback(async () => {
    const params = new URLSearchParams();
    if (prStatusFilter) params.set('status', prStatusFilter);
    const data = await apiFetch<{ requisitions: PurchaseRequisition[] }>(
      `/api/purchase-requisitions?${params}`,
    );
    setRequisitions(data.requisitions);
  }, [prStatusFilter]);

  const loadOrders = useCallback(async () => {
    const params = new URLSearchParams();
    if (poStatusFilter) params.set('status', poStatusFilter);
    const data = await apiFetch<{ orders: PurchaseOrder[] }>(`/api/purchase-orders?${params}`);
    setOrders(data.orders);
  }, [poStatusFilter]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadVendors(), loadRequisitions(), loadOrders()]);
    } finally {
      setLoading(false);
    }
  }, [loadVendors, loadRequisitions, loadOrders]);

  useEffect(() => {
    loadAll();
    apiFetch<{ items: InventoryItemRef[] }>('/api/inventory').then((d) =>
      setInventoryItems(
        d.items.map((i) => ({
          id: i.id,
          itemCode: i.itemCode,
          name: i.name,
          unitOfMeasure: i.unitOfMeasure,
        })),
      ),
    );
  }, [loadAll]);

  const filteredVendors = vendors.filter(
    (v) =>
      !search ||
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.code.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredPrs = requisitions.filter(
    (pr) =>
      !search ||
      pr.prNumber.toLowerCase().includes(search.toLowerCase()) ||
      pr.notes?.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredPos = orders.filter(
    (po) =>
      !search ||
      po.poNumber.toLowerCase().includes(search.toLowerCase()) ||
      po.vendor?.name.toLowerCase().includes(search.toLowerCase()),
  );

  const refreshPr = async (id: string) => {
    const data = await apiFetch<{ requisition: PurchaseRequisition }>(`/api/purchase-requisitions/${id}`);
    setSelectedPr(data.requisition);
    await loadRequisitions();
  };

  const refreshPo = async (id: string) => {
    const data = await apiFetch<{ order: PurchaseOrder }>(`/api/purchase-orders/${id}`);
    setSelectedPo(data.order);
    const qtys: Record<string, string> = {};
    for (const li of data.order.lineItems) {
      qtys[li.id] = String(li.quantity);
    }
    setReceiveQtys(qtys);
    await loadOrders();
  };

  const handleVendorSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/vendors', {
        method: 'POST',
        body: JSON.stringify({
          ...vendorForm,
          code: vendorForm.code || undefined,
          rating: vendorForm.rating ? parseFloat(vendorForm.rating) : undefined,
          contactEmail: vendorForm.contactEmail || undefined,
        }),
      });
      setShowVendorForm(false);
      setVendorForm(emptyVendorForm());
      await loadVendors();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save vendor');
    } finally {
      setSaving(false);
    }
  };

  const handlePrSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/purchase-requisitions', {
        method: 'POST',
        body: JSON.stringify({
          notes: prNotes || undefined,
          lineItems: prLines.map((li) => ({
            inventoryItemId: li.inventoryItemId || null,
            description: li.description || undefined,
            quantity: parseFloat(li.quantity),
            unit: li.unit,
            estimatedUnitCost: li.estimatedUnitCost ? parseFloat(li.estimatedUnitCost) : undefined,
          })),
        }),
      });
      setShowPrForm(false);
      setPrNotes('');
      setPrLines([emptyPrLine()]);
      await loadRequisitions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create requisition');
    } finally {
      setSaving(false);
    }
  };

  const handlePoSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          vendorId: poVendorId,
          requisitionId: poRequisitionId || null,
          terms: poTerms || undefined,
          lineItems: poLines.map((li) => ({
            inventoryItemId: li.inventoryItemId,
            quantity: parseFloat(li.quantity),
            unit: li.unit,
            unitRate: parseFloat(li.unitRate) || 0,
          })),
        }),
      });
      setShowPoForm(false);
      setPoVendorId('');
      setPoRequisitionId('');
      setPoTerms('');
      setPoLines([emptyPoLine()]);
      await loadOrders();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create purchase order');
    } finally {
      setSaving(false);
    }
  };

  const prAction = async (id: string, action: string) => {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/purchase-requisitions/${id}/${action}`, { method: 'POST' });
      await refreshPr(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action}`);
    } finally {
      setSaving(false);
    }
  };

  const poAction = async (id: string, action: string, body?: object) => {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/purchase-orders/${id}/${action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      await refreshPo(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReceive = async () => {
    if (!selectedPo) return;
    const items = selectedPo.lineItems
      .filter((li) => parseFloat(receiveQtys[li.id] || '0') > 0)
      .map((li) => ({
        poLineItemId: li.id,
        quantityReceived: parseFloat(receiveQtys[li.id]),
      }));
    if (items.length === 0) {
      setError('Enter quantity to receive');
      return;
    }
    await poAction(selectedPo.id, 'receive', { items });
  };

  const onInventorySelect = (idx: number, itemId: string, target: 'pr' | 'po') => {
    const item = inventoryItems.find((i) => i.id === itemId);
    if (!item) return;
    if (target === 'pr') {
      const lines = [...prLines];
      lines[idx] = {
        ...lines[idx],
        inventoryItemId: itemId,
        unit: item.unitOfMeasure,
        description: item.name,
      };
      setPrLines(lines);
    } else {
      const lines = [...poLines];
      lines[idx] = { ...lines[idx], inventoryItemId: itemId, unit: item.unitOfMeasure };
      setPoLines(lines);
    }
  };

  const approvedPrs = requisitions.filter((pr) => pr.status === 'approved');

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchasing & Procurement</h1>
          <p className="text-gray-500 mt-1">Requisitions, purchase orders, GRN, and vendors</p>
        </div>
        <div className="flex gap-2">
          {tab === 'vendors' && canManageVendors(user!.role) && (
            <button
              onClick={() => {
                setVendorForm(emptyVendorForm());
                setError('');
                setShowVendorForm(true);
              }}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <Plus size={16} /> Add Vendor
            </button>
          )}
          {tab === 'requisitions' && canCreatePr(user!.role) && (
            <button
              onClick={() => {
                setPrNotes('');
                setPrLines([emptyPrLine()]);
                setError('');
                setShowPrForm(true);
              }}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <Plus size={16} /> New Requisition
            </button>
          )}
          {tab === 'orders' && canManagePo(user!.role) && (
            <button
              onClick={() => {
                setPoVendorId('');
                setPoRequisitionId('');
                setPoTerms('');
                setPoLines([emptyPoLine()]);
                setError('');
                setShowPoForm(true);
              }}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <Plus size={16} /> New PO
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(
          [
            { id: 'requisitions' as Tab, label: 'Requisitions', icon: FileText },
            { id: 'orders' as Tab, label: 'Purchase Orders', icon: ShoppingCart },
            { id: 'vendors' as Tab, label: 'Vendors', icon: Truck },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              setSearch('');
              setSelectedPr(null);
              setSelectedPo(null);
            }}
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

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm"
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <p className="text-gray-500 text-center py-12">Loading...</p>
      ) : (
        <>
          {tab === 'vendors' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Code</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Rating</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">POs</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVendors.map((v) => (
                    <tr key={v.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs">{v.code}</td>
                      <td className="px-4 py-3 font-medium">
                        {v.name}
                        {v.isBlacklisted && (
                          <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Blacklisted</span>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize">{v.category ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{v.contactPhone ?? '—'}</td>
                      <td className="px-4 py-3">{v.rating ?? '—'}</td>
                      <td className="px-4 py-3">{v._count?.purchaseOrders ?? 0}</td>
                    </tr>
                  ))}
                  {filteredVendors.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        No vendors found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'requisitions' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b flex gap-2">
                  <select
                    value={prStatusFilter}
                    onChange={(e) => setPrStatusFilter(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1"
                  >
                    <option value="">All statuses</option>
                    {(Object.keys(PR_STATUS_LABELS) as PrStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {PR_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">PR #</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Items</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPrs.map((pr) => (
                      <tr
                        key={pr.id}
                        onClick={() => {
                          setSelectedPr(pr);
                          setSelectedPo(null);
                        }}
                        className={`border-b last:border-0 cursor-pointer hover:bg-gray-50 ${
                          selectedPr?.id === pr.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-xs">{pr.prNumber}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${prStatusColor(pr.status)}`}>
                            {PR_STATUS_LABELS[pr.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3">{pr.lineItems.length}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(pr.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                    {filteredPrs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                          No requisitions found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                {selectedPr ? (
                  <>
                    <h3 className="font-semibold text-lg mb-1">{selectedPr.prNumber}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${prStatusColor(selectedPr.status)}`}>
                      {PR_STATUS_LABELS[selectedPr.status]}
                    </span>
                    {selectedPr.notes && <p className="text-sm text-gray-600 mt-3">{selectedPr.notes}</p>}
                    <ul className="mt-4 space-y-2 text-sm">
                      {selectedPr.lineItems.map((li) => (
                        <li key={li.id} className="p-2 bg-gray-50 rounded-lg">
                          <p className="font-medium">
                            {li.inventoryItem?.itemCode ?? '—'} — {li.description ?? li.inventoryItem?.name}
                          </p>
                          <p className="text-gray-500">
                            {li.quantity} {li.unit}
                            {li.estimatedUnitCost ? ` @ PKR ${li.estimatedUnitCost.toLocaleString()}` : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedPr.status === 'draft' && canCreatePr(user!.role) && (
                        <button
                          onClick={() => prAction(selectedPr.id, 'submit')}
                          disabled={saving}
                          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
                        >
                          Submit for Approval
                        </button>
                      )}
                      {selectedPr.status === 'submitted' && canApprovePr(user!.role) && (
                        <>
                          <button
                            onClick={() => prAction(selectedPr.id, 'approve')}
                            disabled={saving}
                            className="flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
                          >
                            <CheckCircle size={14} /> Approve
                          </button>
                          <button
                            onClick={() => prAction(selectedPr.id, 'reject')}
                            disabled={saving}
                            className="text-sm bg-red-100 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-200"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-gray-500 text-sm text-center py-8">Select a requisition to view details</p>
                )}
              </div>
            </div>
          )}

          {tab === 'orders' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b flex gap-2">
                  <select
                    value={poStatusFilter}
                    onChange={(e) => setPoStatusFilter(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1"
                  >
                    <option value="">All statuses</option>
                    {(Object.keys(PO_STATUS_LABELS) as PoStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {PO_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">PO #</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Vendor</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPos.map((po) => (
                      <tr
                        key={po.id}
                        onClick={() => {
                          setSelectedPo(po);
                          setSelectedPr(null);
                          const qtys: Record<string, string> = {};
                          for (const li of po.lineItems) qtys[li.id] = String(li.quantity);
                          setReceiveQtys(qtys);
                        }}
                        className={`border-b last:border-0 cursor-pointer hover:bg-gray-50 ${
                          selectedPo?.id === po.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-xs">{po.poNumber}</td>
                        <td className="px-4 py-3">{po.vendor?.name ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${poStatusColor(po.status)}`}>
                            {PO_STATUS_LABELS[po.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">PKR {po.totalAmount.toLocaleString()}</td>
                      </tr>
                    ))}
                    {filteredPos.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                          No purchase orders found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                {selectedPo ? (
                  <>
                    <h3 className="font-semibold text-lg mb-1">{selectedPo.poNumber}</h3>
                    <p className="text-sm text-gray-600">{selectedPo.vendor?.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${poStatusColor(selectedPo.status)}`}>
                      {PO_STATUS_LABELS[selectedPo.status]}
                    </span>
                    <ul className="mt-4 space-y-2 text-sm">
                      {selectedPo.lineItems.map((li) => (
                        <li key={li.id} className="p-2 bg-gray-50 rounded-lg">
                          <p className="font-medium">
                            {li.inventoryItem?.itemCode} — {li.inventoryItem?.name}
                          </p>
                          <p className="text-gray-500">
                            {li.quantity} {li.unit} @ PKR {li.unitRate.toLocaleString()} = PKR{' '}
                            {li.totalAmount.toLocaleString()}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 font-semibold">Total: PKR {selectedPo.totalAmount.toLocaleString()}</p>
                    {selectedPo.grns && selectedPo.grns.length > 0 && (
                      <div className="mt-3 text-sm text-gray-600">
                        GRN: {selectedPo.grns.map((g) => g.grnNumber).join(', ')}
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedPo.status === 'draft' && canManagePo(user!.role) && (
                        <button
                          onClick={() => poAction(selectedPo.id, 'submit')}
                          disabled={saving}
                          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
                        >
                          Submit for Approval
                        </button>
                      )}
                      {selectedPo.status === 'submitted' && canApprovePo(user!.role) && (
                        <button
                          onClick={() => poAction(selectedPo.id, 'approve')}
                          disabled={saving}
                          className="flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
                        >
                          <CheckCircle size={14} /> Approve
                        </button>
                      )}
                      {selectedPo.status === 'approved' && canManagePo(user!.role) && (
                        <button
                          onClick={() => poAction(selectedPo.id, 'order')}
                          disabled={saving}
                          className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
                        >
                          Mark as Ordered
                        </button>
                      )}
                      {['approved', 'ordered', 'partially_received'].includes(selectedPo.status) &&
                        canReceive(user!.role) && (
                          <div className="w-full mt-2 pt-2 border-t">
                            <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                              <PackageCheck size={14} /> Receive Goods (GRN)
                            </p>
                            {selectedPo.lineItems.map((li) => (
                              <div key={li.id} className="flex items-center gap-2 mb-2 text-sm">
                                <span className="flex-1 truncate">{li.inventoryItem?.name}</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  value={receiveQtys[li.id] ?? ''}
                                  onChange={(e) =>
                                    setReceiveQtys({ ...receiveQtys, [li.id]: e.target.value })
                                  }
                                  className="w-20 border border-gray-200 rounded px-2 py-1 text-right"
                                />
                              </div>
                            ))}
                            <button
                              onClick={handleReceive}
                              disabled={saving}
                              className="text-sm bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700"
                            >
                              Create GRN & Update Stock
                            </button>
                          </div>
                        )}
                    </div>
                  </>
                ) : (
                  <p className="text-gray-500 text-sm text-center py-8">Select a purchase order to view details</p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {showVendorForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Add Vendor</h2>
              <button onClick={() => setShowVendorForm(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleVendorSubmit} className="space-y-3">
              <input
                required
                placeholder="Vendor name"
                value={vendorForm.name}
                onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <input
                placeholder="Code (auto-generated if blank)"
                value={vendorForm.code}
                onChange={(e) => setVendorForm({ ...vendorForm, code: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <input
                placeholder="Contact name"
                value={vendorForm.contactName}
                onChange={(e) => setVendorForm({ ...vendorForm, contactName: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <input
                placeholder="Phone"
                value={vendorForm.contactPhone}
                onChange={(e) => setVendorForm({ ...vendorForm, contactPhone: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <select
                value={vendorForm.category}
                onChange={(e) => setVendorForm({ ...vendorForm, category: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="mechanical">Mechanical</option>
                <option value="electrical">Electrical</option>
                <option value="instrumentation">Instrumentation</option>
                <option value="consumable">Consumable</option>
              </select>
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
              >
                {saving ? 'Saving...' : 'Save Vendor'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showPrForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">New Purchase Requisition</h2>
              <button onClick={() => setShowPrForm(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handlePrSubmit} className="space-y-3">
              <textarea
                placeholder="Notes / justification"
                value={prNotes}
                onChange={(e) => setPrNotes(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                rows={2}
              />
              {prLines.map((line, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg space-y-2">
                  <select
                    value={line.inventoryItemId}
                    onChange={(e) => onInventorySelect(idx, e.target.value, 'pr')}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Select inventory item (optional)</option>
                    {inventoryItems.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.itemCode} — {i.name}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Description"
                    value={line.description}
                    onChange={(e) => {
                      const lines = [...prLines];
                      lines[idx].description = e.target.value;
                      setPrLines(lines);
                    }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <input
                      required
                      type="number"
                      min="0.001"
                      step="0.001"
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={(e) => {
                        const lines = [...prLines];
                        lines[idx].quantity = e.target.value;
                        setPrLines(lines);
                      }}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      required
                      placeholder="Unit"
                      value={line.unit}
                      onChange={(e) => {
                        const lines = [...prLines];
                        lines[idx].unit = e.target.value;
                        setPrLines(lines);
                      }}
                      className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Est. cost"
                      value={line.estimatedUnitCost}
                      onChange={(e) => {
                        const lines = [...prLines];
                        lines[idx].estimatedUnitCost = e.target.value;
                        setPrLines(lines);
                      }}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setPrLines([...prLines, emptyPrLine()])}
                className="text-sm text-blue-600 hover:underline"
              >
                + Add line item
              </button>
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
              >
                {saving ? 'Creating...' : 'Create Requisition (Draft)'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showPoForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">New Purchase Order</h2>
              <button onClick={() => setShowPoForm(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handlePoSubmit} className="space-y-3">
              <select
                required
                value={poVendorId}
                onChange={(e) => setPoVendorId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select vendor</option>
                {vendors.filter((v) => !v.isBlacklisted).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code} — {v.name}
                  </option>
                ))}
              </select>
              <select
                value={poRequisitionId}
                onChange={(e) => setPoRequisitionId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Link to PR (optional)</option>
                {approvedPrs.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.prNumber}
                  </option>
                ))}
              </select>
              <input
                placeholder="Payment / delivery terms"
                value={poTerms}
                onChange={(e) => setPoTerms(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              {poLines.map((line, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg space-y-2">
                  <select
                    required
                    value={line.inventoryItemId}
                    onChange={(e) => onInventorySelect(idx, e.target.value, 'po')}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Select inventory item</option>
                    {inventoryItems.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.itemCode} — {i.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input
                      required
                      type="number"
                      min="0.001"
                      step="0.001"
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={(e) => {
                        const lines = [...poLines];
                        lines[idx].quantity = e.target.value;
                        setPoLines(lines);
                      }}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      required
                      placeholder="Unit"
                      value={line.unit}
                      onChange={(e) => {
                        const lines = [...poLines];
                        lines[idx].unit = e.target.value;
                        setPoLines(lines);
                      }}
                      className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      required
                      type="number"
                      min="0"
                      placeholder="Unit rate"
                      value={line.unitRate}
                      onChange={(e) => {
                        const lines = [...poLines];
                        lines[idx].unitRate = e.target.value;
                        setPoLines(lines);
                      }}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setPoLines([...poLines, emptyPoLine()])}
                className="text-sm text-blue-600 hover:underline"
              >
                + Add line item
              </button>
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
              >
                {saving ? 'Creating...' : 'Create PO (Draft)'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

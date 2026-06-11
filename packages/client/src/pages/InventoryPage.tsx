import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Plus,
  Search,
  ScanLine,
  Pencil,
  ArrowDownUp,
  AlertTriangle,
  Package,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch, ApiError } from '@/lib/api';
import type {
  InventoryCategory,
  InventoryItem,
  StockAlert,
  TransactionType,
  Vendor,
} from '@/types/inventory';
import {
  CATEGORY_LABELS,
  TRANSACTION_LABELS,
  stockStatusColor,
  stockStatusLabel,
} from '@/types/inventory';
import type { WorkOrder } from '@/types/workOrder';

interface ItemForm {
  name: string;
  category: InventoryCategory;
  unitOfMeasure: string;
  itemCode: string;
  currentStock: string;
  minimumStock: string;
  maximumStock: string;
  reorderQuantity: string;
  unitCost: string;
  storeLocation: string;
  preferredVendorId: string;
  leadTimeDays: string;
  barcode: string;
  isCritical: boolean;
}

interface TxForm {
  type: TransactionType;
  quantity: string;
  unitCost: string;
  workOrderId: string;
  referenceNo: string;
  reason: string;
  newStoreLocation: string;
}

const emptyItemForm = (): ItemForm => ({
  name: '',
  category: 'mechanical',
  unitOfMeasure: 'Nos',
  itemCode: '',
  currentStock: '0',
  minimumStock: '0',
  maximumStock: '',
  reorderQuantity: '',
  unitCost: '0',
  storeLocation: '',
  preferredVendorId: '',
  leadTimeDays: '',
  barcode: '',
  isCritical: false,
});

const emptyTxForm = (): TxForm => ({
  type: 'receipt',
  quantity: '',
  unitCost: '',
  workOrderId: '',
  referenceNo: '',
  reason: '',
  newStoreLocation: '',
});

function canManage(role: string) {
  return role === 'admin' || role === 'storekeeper';
}

export function InventoryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [showTxForm, setShowTxForm] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm());
  const [txForm, setTxForm] = useState<TxForm>(emptyTxForm());
  const [scanCode, setScanCode] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (categoryFilter) params.set('category', categoryFilter);
      if (lowStockOnly) params.set('lowStock', 'true');
      const [itemsRes, alertsRes] = await Promise.all([
        apiFetch<{ items: InventoryItem[]; totalInventoryValue: number }>(`/api/inventory?${params}`),
        apiFetch<{ alerts: StockAlert[] }>('/api/inventory/alerts'),
      ]);
      setItems(itemsRes.items);
      setTotalValue(itemsRes.totalInventoryValue);
      setAlerts(alertsRes.alerts);
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, lowStockOnly]);

  useEffect(() => {
    loadItems();
    apiFetch<{ vendors: Vendor[] }>('/api/inventory/vendors/list').then((d) => setVendors(d.vendors));
    apiFetch<{ workOrders: WorkOrder[] }>('/api/work-orders?status=in_progress').then((d) =>
      setWorkOrders(d.workOrders),
    );
  }, [loadItems]);

  const openCreate = async () => {
    setEditing(null);
    setItemForm(emptyItemForm());
    try {
      const res = await apiFetch<{ itemCode: string }>('/api/inventory/next-code');
      setItemForm({ ...emptyItemForm(), itemCode: res.itemCode, barcode: res.itemCode });
    } catch {
      setItemForm(emptyItemForm());
    }
    setError('');
    setShowItemForm(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setItemForm({
      name: item.name,
      category: item.category,
      unitOfMeasure: item.unitOfMeasure,
      itemCode: item.itemCode,
      currentStock: String(item.currentStock),
      minimumStock: String(item.minimumStock),
      maximumStock: item.maximumStock?.toString() ?? '',
      reorderQuantity: item.reorderQuantity?.toString() ?? '',
      unitCost: String(item.unitCost),
      storeLocation: item.storeLocation ?? '',
      preferredVendorId: item.preferredVendorId ?? '',
      leadTimeDays: item.leadTimeDays?.toString() ?? '',
      barcode: item.barcode ?? '',
      isCritical: item.isCritical,
    });
    setShowItemForm(true);
  };

  const handleItemSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: itemForm.name,
        category: itemForm.category,
        unitOfMeasure: itemForm.unitOfMeasure,
        itemCode: itemForm.itemCode || undefined,
        currentStock: parseFloat(itemForm.currentStock) || 0,
        minimumStock: parseFloat(itemForm.minimumStock) || 0,
        maximumStock: itemForm.maximumStock ? parseFloat(itemForm.maximumStock) : null,
        reorderQuantity: itemForm.reorderQuantity ? parseFloat(itemForm.reorderQuantity) : null,
        unitCost: parseFloat(itemForm.unitCost) || 0,
        storeLocation: itemForm.storeLocation || undefined,
        preferredVendorId: itemForm.preferredVendorId || null,
        leadTimeDays: itemForm.leadTimeDays ? parseInt(itemForm.leadTimeDays, 10) : null,
        barcode: itemForm.barcode || undefined,
        isCritical: itemForm.isCritical,
      };

      if (editing) {
        const { currentStock: _, ...updatePayload } = payload;
        await apiFetch(`/api/inventory/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(updatePayload),
        });
      } else {
        await apiFetch('/api/inventory', { method: 'POST', body: JSON.stringify(payload) });
      }

      setShowItemForm(false);
      await loadItems();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  const handleTxSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/inventory/${selected.id}/transactions`, {
        method: 'POST',
        body: JSON.stringify({
          type: txForm.type,
          quantity: parseFloat(txForm.quantity),
          unitCost: txForm.unitCost ? parseFloat(txForm.unitCost) : undefined,
          workOrderId: txForm.workOrderId || null,
          referenceNo: txForm.referenceNo || undefined,
          reason: txForm.reason || undefined,
          newStoreLocation: txForm.newStoreLocation || undefined,
        }),
      });
      setShowTxForm(false);
      setTxForm(emptyTxForm());
      await loadItems();
      const detail = await apiFetch<{ item: InventoryItem }>(`/api/inventory/${selected.id}`);
      setSelected(detail.item);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Transaction failed');
    } finally {
      setSaving(false);
    }
  };

  const handleScan = async () => {
    if (!scanCode.trim()) return;
    try {
      const data = await apiFetch<{ item: InventoryItem }>(
        `/api/inventory/lookup/${encodeURIComponent(scanCode.trim())}`,
      );
      setSelected(data.item);
      setScanCode('');
    } catch {
      setError(`No item found for: ${scanCode}`);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory & Spare Parts</h1>
          <p className="text-gray-500 mt-1">
            Store stock — total value: PKR {totalValue.toLocaleString()}
          </p>
        </div>
        {canManage(user!.role) && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-ldpl-accent text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={18} />
            Add Item
          </button>
        )}
      </div>

      {alerts.length > 0 && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center gap-2 text-amber-800 font-medium mb-2">
            <AlertTriangle size={16} />
            Stock Alerts ({alerts.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {alerts.slice(0, 5).map((a) => (
              <span key={a.itemId} className={`text-xs px-2 py-1 rounded ${stockStatusColor(a.status)}`}>
                {a.itemCode}: {a.currentStock}/{a.minimumStock}
              </span>
            ))}
            {alerts.length > 5 && (
              <span className="text-xs text-amber-700">+{alerts.length - 5} more</span>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, name, barcode..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ldpl-accent focus:outline-none"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer">
          <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
          Low stock only
        </label>
        <div className="flex gap-2">
          <input
            value={scanCode}
            onChange={(e) => setScanCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            placeholder="Scan barcode..."
            className="px-3 py-2 border border-gray-300 rounded-lg w-36"
          />
          <button onClick={handleScan} className="flex items-center gap-1 px-3 py-2 border rounded-lg hover:bg-gray-50">
            <ScanLine size={16} /> Lookup
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
        <div className="lg:col-span-2 bg-white rounded-xl border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading inventory...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No items found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Code / Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Stock</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Value</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={`cursor-pointer hover:bg-blue-50 ${selected?.id === item.id ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-ldpl-accent">{item.itemCode}</div>
                      <div className="font-medium">{item.name}</div>
                    </td>
                    <td className="px-4 py-3">{CATEGORY_LABELS[item.category]}</td>
                    <td className="px-4 py-3 text-right">
                      {item.currentStock} {item.unitOfMeasure}
                    </td>
                    <td className="px-4 py-3 text-right">
                      PKR {item.totalStockValue.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${stockStatusColor(item.stockStatus)}`}>
                        {stockStatusLabel(item.stockStatus)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl border p-5">
          {selected ? (
            <>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-mono text-sm text-ldpl-accent">{selected.itemCode}</p>
                  <h2 className="text-lg font-bold">{selected.name}</h2>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs ${stockStatusColor(selected.stockStatus)}`}>
                    {stockStatusLabel(selected.stockStatus)}
                  </span>
                </div>
                {canManage(user!.role) && (
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(selected)} className="p-2 text-gray-500 hover:text-ldpl-accent rounded">
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => { setTxForm(emptyTxForm()); setShowTxForm(true); }}
                      className="p-2 text-gray-500 hover:text-ldpl-accent rounded"
                      title="Stock transaction"
                    >
                      <ArrowDownUp size={16} />
                    </button>
                  </div>
                )}
              </div>

              <dl className="space-y-2 text-sm">
                {[
                  ['Category', CATEGORY_LABELS[selected.category]],
                  ['Location', selected.storeLocation ?? '—'],
                  ['Stock', `${selected.currentStock} ${selected.unitOfMeasure}`],
                  ['Min / Max', `${selected.minimumStock} / ${selected.maximumStock ?? '—'}`],
                  ['Unit Cost', `PKR ${selected.unitCost.toLocaleString()}`],
                  ['Total Value', `PKR ${selected.totalStockValue.toLocaleString()}`],
                  ['Vendor', selected.preferredVendor?.name ?? '—'],
                  ['Lead Time', selected.leadTimeDays ? `${selected.leadTimeDays} days` : '—'],
                  ['Critical Item', selected.isCritical ? 'Yes' : 'No'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="font-medium text-right">{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <div className="text-center text-gray-400 py-12">
              <Package size={32} className="mx-auto mb-3 opacity-40" />
              Select an item to view details and transactions
            </div>
          )}
        </div>
      </div>

      {showItemForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">{editing ? 'Edit Item' : 'Add Inventory Item'}</h2>
              <button onClick={() => setShowItemForm(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleItemSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Item Name *</label>
                  <input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} required className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Item Code</label>
                  <input value={itemForm.itemCode} disabled={!!editing} onChange={(e) => setItemForm({ ...itemForm, itemCode: e.target.value })} className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Category *</label>
                  <select value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value as InventoryCategory })} className="w-full px-3 py-2 border rounded-lg">
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Unit of Measure *</label>
                  <select value={itemForm.unitOfMeasure} onChange={(e) => setItemForm({ ...itemForm, unitOfMeasure: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                    {['Nos', 'Kg', 'Litre', 'Metres', 'Set', 'Box'].map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Unit Cost (PKR)</label>
                  <input type="number" min="0" value={itemForm.unitCost} onChange={(e) => setItemForm({ ...itemForm, unitCost: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                {!editing && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Opening Stock</label>
                    <input type="number" min="0" value={itemForm.currentStock} onChange={(e) => setItemForm({ ...itemForm, currentStock: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">Minimum Stock</label>
                  <input type="number" min="0" value={itemForm.minimumStock} onChange={(e) => setItemForm({ ...itemForm, minimumStock: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Maximum Stock</label>
                  <input type="number" min="0" value={itemForm.maximumStock} onChange={(e) => setItemForm({ ...itemForm, maximumStock: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Store Location</label>
                  <input value={itemForm.storeLocation} onChange={(e) => setItemForm({ ...itemForm, storeLocation: e.target.value })} placeholder="Shelf A-12" className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Preferred Vendor</label>
                  <select value={itemForm.preferredVendorId} onChange={(e) => setItemForm({ ...itemForm, preferredVendorId: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                    <option value="">— None —</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="critical" checked={itemForm.isCritical} onChange={(e) => setItemForm({ ...itemForm, isCritical: e.target.checked })} />
                  <label htmlFor="critical" className="text-sm">Critical item (zero-stock alerts to Manager)</label>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowItemForm(false)} className="px-4 py-2 text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-ldpl-accent text-white rounded-lg disabled:opacity-60">
                  {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTxForm && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <h3 className="font-semibold mb-1">Stock Transaction</h3>
            <p className="text-sm text-gray-500 mb-4">{selected.itemCode} — {selected.name}</p>
            <form onSubmit={handleTxSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Transaction Type *</label>
                <select value={txForm.type} onChange={(e) => setTxForm({ ...txForm, type: e.target.value as TransactionType })} className="w-full px-3 py-2 border rounded-lg">
                  {Object.entries(TRANSACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {txForm.type === 'adjustment' ? 'New Stock Level *' : 'Quantity *'}
                </label>
                <input type="number" min="0" step="0.001" value={txForm.quantity} onChange={(e) => setTxForm({ ...txForm, quantity: e.target.value })} required className="w-full px-3 py-2 border rounded-lg" />
                <p className="text-xs text-gray-400 mt-1">Current: {selected.currentStock} {selected.unitOfMeasure}</p>
              </div>
              {(txForm.type === 'receipt' || txForm.type === 'issue') && (
                <div>
                  <label className="block text-sm font-medium mb-1">Unit Cost (PKR)</label>
                  <input type="number" min="0" value={txForm.unitCost} onChange={(e) => setTxForm({ ...txForm, unitCost: e.target.value })} placeholder={String(selected.unitCost)} className="w-full px-3 py-2 border rounded-lg" />
                </div>
              )}
              {(txForm.type === 'issue' || txForm.type === 'return') && (
                <div>
                  <label className="block text-sm font-medium mb-1">Work Order</label>
                  <select value={txForm.workOrderId} onChange={(e) => setTxForm({ ...txForm, workOrderId: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                    <option value="">— None —</option>
                    {workOrders.map((wo) => <option key={wo.id} value={wo.id}>{wo.woNumber} — {wo.asset.name}</option>)}
                  </select>
                </div>
              )}
              {txForm.type === 'transfer' && (
                <div>
                  <label className="block text-sm font-medium mb-1">New Location *</label>
                  <input value={txForm.newStoreLocation} onChange={(e) => setTxForm({ ...txForm, newStoreLocation: e.target.value })} required className="w-full px-3 py-2 border rounded-lg" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Reason / Reference</label>
                <input value={txForm.reason} onChange={(e) => setTxForm({ ...txForm, reason: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTxForm(false)} className="px-4 py-2 text-gray-600 rounded-lg">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-ldpl-accent text-white rounded-lg disabled:opacity-60">Submit</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

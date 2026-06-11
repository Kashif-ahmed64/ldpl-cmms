export type InventoryCategory =
  | 'mechanical'
  | 'electrical'
  | 'instrumentation'
  | 'consumable'
  | 'civil'
  | 'it';

export type TransactionType = 'receipt' | 'issue' | 'return' | 'adjustment' | 'scrap' | 'transfer';

export type StockStatus = 'ok' | 'low' | 'zero' | 'critical_zero';

export interface InventoryItem {
  id: string;
  itemCode: string;
  name: string;
  category: InventoryCategory;
  unitOfMeasure: string;
  currentStock: number;
  minimumStock: number;
  maximumStock: number | null;
  reorderQuantity: number | null;
  unitCost: number;
  totalStockValue: number;
  storeLocation: string | null;
  preferredVendorId: string | null;
  leadTimeDays: number | null;
  barcode: string | null;
  lastReceivedAt: string | null;
  lastIssuedAt: string | null;
  expiryDate: string | null;
  isCritical: boolean;
  stockStatus: StockStatus;
  preferredVendor?: { id: string; name: string; code: string } | null;
}

export interface InventoryTransaction {
  id: string;
  inventoryItemId: string;
  type: TransactionType;
  quantity: number;
  unitCost: number | null;
  workOrderId: string | null;
  referenceNo: string | null;
  reason: string | null;
  createdAt: string;
}

export interface StockAlert {
  itemId: string;
  itemCode: string;
  name: string;
  currentStock: number;
  minimumStock: number;
  status: StockStatus;
  isCritical: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  code: string;
}

export const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  mechanical: 'Mechanical',
  electrical: 'Electrical',
  instrumentation: 'Instrumentation',
  consumable: 'Consumable',
  civil: 'Civil',
  it: 'IT',
};

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  receipt: 'Stock Receipt',
  issue: 'Issue to WO',
  return: 'Return to Store',
  adjustment: 'Stock Adjustment',
  scrap: 'Scrap / Write-off',
  transfer: 'Inter-store Transfer',
};

export function stockStatusColor(status: StockStatus) {
  const map: Record<StockStatus, string> = {
    ok: 'bg-green-100 text-green-700',
    low: 'bg-amber-100 text-amber-700',
    zero: 'bg-red-100 text-red-700',
    critical_zero: 'bg-red-200 text-red-800 font-semibold',
  };
  return map[status];
}

export function stockStatusLabel(status: StockStatus) {
  const map: Record<StockStatus, string> = {
    ok: 'In Stock',
    low: 'Low Stock',
    zero: 'Out of Stock',
    critical_zero: 'Critical — Zero',
  };
  return map[status];
}

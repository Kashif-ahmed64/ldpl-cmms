export type PrStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';
export type PoStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'ordered'
  | 'partially_received'
  | 'closed'
  | 'cancelled';

export interface VendorDetail {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  ntn?: string | null;
  bankDetails?: string | null;
  category?: string | null;
  rating?: number | null;
  isBlacklisted: boolean;
  blacklistReason?: string | null;
  _count?: { purchaseOrders: number; inventoryItems: number };
}

export interface PrLineItem {
  id: string;
  inventoryItemId?: string | null;
  description?: string | null;
  quantity: number;
  unit: string;
  estimatedUnitCost?: number | null;
  inventoryItem?: { id: string; itemCode: string; name: string; unitOfMeasure: string } | null;
}

export interface PurchaseRequisition {
  id: string;
  prNumber: string;
  requestedById: string;
  departmentId?: string | null;
  status: PrStatus;
  notes?: string | null;
  approvedById?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  lineItems: PrLineItem[];
  purchaseOrders?: { id: string; poNumber: string; status: PoStatus }[];
}

export interface PoLineItem {
  id: string;
  inventoryItemId: string;
  quantity: number;
  unit: string;
  unitRate: number;
  totalAmount: number;
  inventoryItem?: { id: string; itemCode: string; name: string; unitOfMeasure: string };
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendorId: string;
  requisitionId?: string | null;
  orderDate: string;
  deliveryDate?: string | null;
  status: PoStatus;
  totalAmount: number;
  terms?: string | null;
  approvedById?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  vendor?: VendorDetail;
  requisition?: { id: string; prNumber: string } | null;
  lineItems: PoLineItem[];
  grns?: { id: string; grnNumber: string; receivedAt: string }[];
}

export interface InventoryItemRef {
  id: string;
  itemCode: string;
  name: string;
  unitOfMeasure: string;
}

export const PR_STATUS_LABELS: Record<PrStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  ordered: 'Ordered',
  partially_received: 'Partially Received',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export function prStatusColor(status: PrStatus) {
  const map: Record<PrStatus, string> = {
    draft: 'bg-gray-100 text-gray-700',
    submitted: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-200 text-gray-600',
  };
  return map[status];
}

export function poStatusColor(status: PoStatus) {
  const map: Record<PoStatus, string> = {
    draft: 'bg-gray-100 text-gray-700',
    submitted: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    ordered: 'bg-indigo-100 text-indigo-700',
    partially_received: 'bg-amber-100 text-amber-700',
    closed: 'bg-gray-200 text-gray-600',
    cancelled: 'bg-red-100 text-red-700',
  };
  return map[status];
}

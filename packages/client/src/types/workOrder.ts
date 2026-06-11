export type WorkOrderType = 'CM' | 'PM' | 'PdM' | 'INS' | 'MOD' | 'SDW';
export type WorkOrderPriority = 'critical' | 'high' | 'medium' | 'low';
export type WorkOrderStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'on_hold'
  | 'pending_approval'
  | 'completed'
  | 'cancelled';

export interface WoLaborEntry {
  id: string;
  userId: string;
  startTime: string;
  endTime: string | null;
  hours: number | null;
  description: string | null;
  isOvertime: boolean;
  user: { id: string; fullName: string; hourlyRate: string | null };
}

export interface WorkOrder {
  id: string;
  woNumber: string;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  assetId: string;
  problemDescription: string;
  reportedById: string;
  reportedAt: string;
  assignedToId: string | null;
  assignedById: string | null;
  estimatedHours: number | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  status: WorkOrderStatus;
  rootCause: string | null;
  correctiveAction: string | null;
  workOrderCost: number | null;
  laborCost?: number;
  partsCost?: number;
  supervisorSignOffAt: string | null;
  asset: {
    id: string;
    assetTagNo: string;
    name: string;
    locationPath: string | null;
    status: string;
  };
  reportedBy: { id: string; fullName: string; username: string; role: string };
  assignedTo: { id: string; fullName: string; username: string; role: string } | null;
  laborEntries: WoLaborEntry[];
  _count?: { laborEntries: number; partsUsed: number; attachments: number };
}

export interface Assignee {
  id: string;
  fullName: string;
  username: string;
  role: string;
  designation: string | null;
}

export const WO_TYPE_LABELS: Record<WorkOrderType, string> = {
  CM: 'Corrective Maintenance',
  PM: 'Preventive Maintenance',
  PdM: 'Predictive Maintenance',
  INS: 'Inspection',
  MOD: 'Modification / Improvement',
  SDW: 'Shutdown Work',
};

export const WO_PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const WO_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  pending_approval: 'Pending Approval',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function priorityColor(p: WorkOrderPriority) {
  const map: Record<WorkOrderPriority, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-gray-100 text-gray-600',
  };
  return map[p];
}

export function statusColor(s: WorkOrderStatus) {
  const map: Record<WorkOrderStatus, string> = {
    open: 'bg-blue-100 text-blue-700',
    assigned: 'bg-indigo-100 text-indigo-700',
    in_progress: 'bg-amber-100 text-amber-700',
    on_hold: 'bg-gray-200 text-gray-700',
    pending_approval: 'bg-purple-100 text-purple-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-50 text-red-500',
  };
  return map[s];
}

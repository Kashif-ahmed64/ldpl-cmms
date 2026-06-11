export type PmFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'by_hours' | 'by_km';

export interface PmTask {
  id?: string;
  sequence: number;
  description: string;
  isRequired: boolean;
}

export interface PmTemplate {
  id: string;
  name: string;
  assetId: string | null;
  assetCategory: string | null;
  frequency: PmFrequency;
  intervalValue: number;
  estimatedDuration: number | null;
  requiredSkills: string[];
  leadTimeDays: number;
  assignedDeptId: string | null;
  lastDoneDate: string | null;
  nextDueDate: string | null;
  isActive: boolean;
  asset?: { id: string; assetTagNo: string; name: string } | null;
  tasks?: PmTask[];
  _count?: { workOrders: number };
}

export const PM_FREQUENCY_LABELS: Record<PmFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
  by_hours: 'By Hours',
  by_km: 'By KM',
};

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function dueStatus(dateStr: string | null): 'overdue' | 'due_soon' | 'ok' | 'unknown' {
  const days = daysUntil(dateStr);
  if (days === null) return 'unknown';
  if (days < 0) return 'overdue';
  if (days <= 7) return 'due_soon';
  return 'ok';
}

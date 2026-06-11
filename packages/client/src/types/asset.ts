export type AssetCategory =
  | 'electrical'
  | 'mechanical'
  | 'civil'
  | 'instrumentation'
  | 'vehicle'
  | 'it';

export type AssetStatus = 'active' | 'under_maintenance' | 'decommissioned' | 'spare';

export type Criticality = 'critical' | 'high' | 'medium' | 'low';

export interface Asset {
  id: string;
  assetTagNo: string;
  name: string;
  category: AssetCategory;
  parentId: string | null;
  hierarchyLevel: number;
  make: string | null;
  model: string | null;
  serialNumber: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  currentValue: number | null;
  locationPath: string | null;
  departmentId: string | null;
  assignedToId: string | null;
  status: AssetStatus;
  criticality: Criticality;
  warrantyExpiry: string | null;
  lastMaintenanceAt: string | null;
  nextMaintenanceDue: string | null;
  meterReading: number | null;
  meterUnit: string | null;
  photoPath: string | null;
  notes: string | null;
  decommissionReason: string | null;
  department?: { id: string; name: string; code: string } | null;
  assignedTo?: { id: string; fullName: string; username: string } | null;
  parent?: { id: string; assetTagNo: string; name: string; hierarchyLevel: number } | null;
  children?: { id: string; assetTagNo: string; name: string; hierarchyLevel: number; status: string }[];
  _count?: { workOrders: number; children: number };
}

export const HIERARCHY_LABELS: Record<number, string> = {
  1: 'Plant',
  2: 'System',
  3: 'Sub-System',
  4: 'Equipment',
  5: 'Component',
};

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  electrical: 'Electrical',
  mechanical: 'Mechanical',
  civil: 'Civil',
  instrumentation: 'Instrumentation',
  vehicle: 'Vehicle',
  it: 'IT',
};

export const STATUS_LABELS: Record<AssetStatus, string> = {
  active: 'Active',
  under_maintenance: 'Under Maintenance',
  decommissioned: 'Decommissioned',
  spare: 'Spare',
};

export const CRITICALITY_LABELS: Record<Criticality, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export interface StaffMember {
  id: string;
  fullName: string;
  username: string;
  role: string;
  designation: string | null;
}

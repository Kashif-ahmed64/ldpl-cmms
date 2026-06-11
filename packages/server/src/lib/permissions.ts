import type { UserRole } from '@prisma/client';

type Permission = 'read' | 'create' | 'edit' | 'delete' | 'export' | 'assign' | 'approve' | 'update_assigned';

type Module = 'assets' | 'work_orders' | 'inventory' | 'purchasing' | 'reports';

const PERMISSIONS: Record<Module, Record<UserRole, Permission[]>> = {
  assets: {
    admin: ['read', 'create', 'edit', 'delete', 'export'],
    manager: ['read', 'export'],
    engineer: ['read', 'create', 'edit'],
    supervisor: ['read'],
    storekeeper: ['read'],
    technician: ['read'],
    viewer: ['read'],
    hod: ['read'],
  },
  work_orders: {
    admin: ['read', 'create', 'edit', 'delete', 'export', 'assign', 'approve', 'update_assigned'],
    manager: ['read', 'create', 'edit', 'export', 'assign', 'approve'],
    engineer: ['read', 'create', 'edit', 'assign', 'approve', 'update_assigned'],
    supervisor: ['read', 'create', 'edit', 'assign', 'approve'],
    storekeeper: ['read'],
    technician: ['read', 'create', 'update_assigned'],
    viewer: ['read'],
    hod: ['read'],
  },
  inventory: {
    admin: ['read', 'create', 'edit', 'delete', 'export'],
    manager: ['read', 'export'],
    engineer: ['read'],
    supervisor: ['read'],
    storekeeper: ['read', 'create', 'edit', 'delete'],
    technician: ['read'],
    viewer: ['read'],
    hod: ['read'],
  },
  purchasing: {
    admin: ['read', 'create', 'edit', 'delete', 'export', 'approve'],
    manager: ['read', 'export', 'approve'],
    engineer: ['read', 'create'],
    supervisor: ['read', 'approve'],
    storekeeper: ['read', 'create', 'edit'],
    technician: ['read'],
    viewer: ['read'],
    hod: ['read', 'approve'],
  },
  reports: {
    admin: ['read', 'export'],
    manager: ['read', 'export'],
    engineer: ['read', 'export'],
    supervisor: ['read', 'export'],
    storekeeper: ['read'],
    technician: ['read'],
    viewer: ['read'],
    hod: ['read', 'export'],
  },
};

export function hasPermission(role: UserRole, module: Module, action: Permission): boolean {
  return PERMISSIONS[module]?.[role]?.includes(action) ?? false;
}

export function requirePermission(role: UserRole, module: Module, action: Permission): boolean {
  return hasPermission(role, module, action);
}

export const HIERARCHY_LEVELS: Record<number, string> = {
  1: 'Plant',
  2: 'System',
  3: 'Sub-System',
  4: 'Equipment',
  5: 'Component',
};

export const ASSET_CATEGORIES = [
  'electrical',
  'mechanical',
  'civil',
  'instrumentation',
  'vehicle',
  'it',
] as const;

export const ASSET_STATUSES = ['active', 'under_maintenance', 'decommissioned', 'spare'] as const;

export const CRITICALITY_LEVELS = ['critical', 'high', 'medium', 'low'] as const;

export const WO_TYPES = ['CM', 'PM', 'PdM', 'INS', 'MOD', 'SDW'] as const;

export const WO_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

export const WO_STATUSES = [
  'open',
  'assigned',
  'in_progress',
  'on_hold',
  'pending_approval',
  'completed',
  'cancelled',
] as const;

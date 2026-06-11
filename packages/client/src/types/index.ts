export type UserRole =
  | 'admin'
  | 'manager'
  | 'engineer'
  | 'supervisor'
  | 'storekeeper'
  | 'technician'
  | 'viewer'
  | 'hod';

export interface Department {
  id: string;
  name: string;
  code: string;
}

export interface User {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  employeeId: string | null;
  role: UserRole;
  departmentId: string | null;
  department?: Department | null;
  phone: string | null;
  designation: string | null;
  hourlyRate: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'System Administrator',
  manager: 'Plant Manager / GM',
  engineer: 'Maintenance Engineer',
  supervisor: 'Maintenance Supervisor',
  storekeeper: 'Storekeeper',
  technician: 'Technician',
  viewer: 'Viewer / Auditor',
  hod: 'HOD (Dept Head)',
};

export const ALL_ROLES: UserRole[] = [
  'admin',
  'manager',
  'engineer',
  'supervisor',
  'storekeeper',
  'technician',
  'viewer',
  'hod',
];

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Wrench,
  ClipboardList,
  Calendar,
  Package,
  ShoppingCart,
  BarChart3,
  Settings,
  BookOpen,
  LogOut,
  Bell,
} from 'lucide-react';
import { assetUrl } from '@/lib/desktop';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS, type UserRole } from '@/types';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles?: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  {
    to: '/dashboard/users',
    label: 'User Management',
    icon: <Users size={18} />,
    roles: ['admin'],
  },
  {
    to: '/dashboard/equipment',
    label: 'Equipment Registry',
    icon: <Wrench size={18} />,
    roles: ['admin', 'manager', 'engineer', 'supervisor', 'storekeeper', 'technician', 'viewer', 'hod'],
  },
  {
    to: '/dashboard/work-orders',
    label: 'Work Orders',
    icon: <ClipboardList size={18} />,
    roles: ['admin', 'manager', 'engineer', 'supervisor', 'storekeeper', 'technician', 'viewer', 'hod'],
  },
  {
    to: '/dashboard/pm',
    label: 'PM Scheduling',
    icon: <Calendar size={18} />,
    roles: ['admin', 'manager', 'engineer', 'supervisor', 'storekeeper', 'technician', 'viewer', 'hod'],
  },
  {
    to: '/dashboard/inventory',
    label: 'Inventory',
    icon: <Package size={18} />,
    roles: ['admin', 'manager', 'engineer', 'supervisor', 'storekeeper', 'viewer', 'hod'],
  },
  {
    to: '/dashboard/purchasing',
    label: 'Purchasing',
    icon: <ShoppingCart size={18} />,
    roles: ['admin', 'manager', 'engineer', 'supervisor', 'storekeeper', 'viewer', 'hod'],
  },
  {
    to: '/dashboard/reports',
    label: 'Reports',
    icon: <BarChart3 size={18} />,
    roles: ['admin', 'manager', 'engineer', 'supervisor', 'storekeeper', 'technician', 'viewer', 'hod'],
  },
  {
    to: '/dashboard/help',
    label: 'Help & Training',
    icon: <BookOpen size={18} />,
    roles: ['admin', 'manager', 'engineer', 'supervisor', 'storekeeper', 'technician', 'viewer', 'hod'],
  },
  {
    to: '/dashboard/settings',
    label: 'System Config',
    icon: <Settings size={18} />,
    roles: ['admin'],
  },
];

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role)),
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-ldpl-light">
      <aside className="w-64 bg-ldpl-navy text-white flex flex-col shrink-0">
        <div className="p-5 border-b border-white/10">
          <img src={assetUrl('ldpl-logo.svg')} alt="LDPL" className="h-10 mb-3" />
          <h1 className="text-sm font-semibold tracking-wide">LDPL CMMS</h1>
          <p className="text-xs text-white/60 mt-1">235 MW Power Plant</p>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-ldpl-accent text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="text-xs text-white/50 mb-1">{ROLE_LABELS[user!.role]}</div>
          <div className="text-sm font-medium truncate">{user!.fullName}</div>
          <button
            onClick={handleLogout}
            className="mt-3 flex items-center gap-2 text-xs text-white/60 hover:text-white transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <div className="text-sm text-gray-500">
            Liberty Daharki Powers Ltd — Maintenance Management
          </div>
          <button className="relative p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <Bell size={20} />
          </button>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

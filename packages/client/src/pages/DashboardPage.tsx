import { useEffect, useState } from 'react';
import { Users, Wrench, ClipboardList, Calendar } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { ROLE_LABELS } from '@/types';

interface DashboardStats {
  activeUsers: number;
  departments: number;
  auditLogEntries: number;
  assets: number;
  openWorkOrders: number;
  activePmTemplates: number;
  phase: string;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    apiFetch<{ stats: DashboardStats }>('/api/dashboard/stats')
      .then((data) => setStats(data.stats))
      .catch(() => {});
  }, []);

  const cards = [
    { label: 'Registered Assets', value: stats?.assets ?? '—', icon: Wrench, color: 'bg-blue-500' },
    { label: 'Open Work Orders', value: stats?.openWorkOrders ?? '—', icon: ClipboardList, color: 'bg-amber-500' },
    { label: 'Active PM Templates', value: stats?.activePmTemplates ?? '—', icon: Calendar, color: 'bg-emerald-500' },
    { label: 'Active Users', value: stats?.activeUsers ?? '—', icon: Users, color: 'bg-violet-500' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Welcome, {user?.fullName} — {ROLE_LABELS[user!.role]}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-2xl font-bold mt-1 text-gray-900">{card.value}</p>
              </div>
              <div className={`${card.color} p-3 rounded-lg text-white`}>
                <card.icon size={20} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs font-medium px-3 py-1 rounded-full bg-green-100 text-green-700">
            Production Ready
          </span>
          <h2 className="text-lg font-semibold">System Status — All Phases Complete</h2>
        </div>
        <div className="space-y-3">
          {[
            { phase: 'Phase 1 — Foundation', status: 'Complete', desc: 'Auth, User Management, DB Schema, Electron Shell' },
            { phase: 'Phase 2 — Assets', status: 'Complete', desc: 'Equipment Registry, Hierarchy, Barcode labels' },
            { phase: 'Phase 3 — Work Orders', status: 'Complete', desc: 'WO lifecycle, assignment, labor logging' },
            { phase: 'Phase 4 — PM Scheduling', status: 'Complete', desc: 'PM templates, scheduler, auto-WO generation' },
            { phase: 'Phase 5 — Inventory', status: 'Complete', desc: 'Spare parts, stock transactions, alerts' },
            { phase: 'Phase 6 — Purchasing', status: 'Complete', desc: 'PR, PO, GRN, vendor management' },
            { phase: 'Phase 7 — Reports', status: 'Complete', desc: 'KPI dashboards, MTTR/MTBF, exportable reports' },
            { phase: 'Phase 8 — Security', status: 'Complete', desc: 'Security hardening, backups, system config' },
            { phase: 'Phase 9 — Testing & Training', status: 'Complete', desc: 'API tests, smoke tests, user training guides' },
          ].map((item) => (
            <div key={item.phase} className="flex items-start gap-4 p-3 rounded-lg bg-gray-50">
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${
                  item.status === 'Complete'
                    ? 'bg-green-100 text-green-700'
                    : item.status === 'In Progress'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-200 text-gray-600'
                }`}
              >
                {item.status}
              </span>
              <div>
                <p className="font-medium text-gray-900">{item.phase}</p>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

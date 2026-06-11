import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, HelpCircle, Monitor, Shield, Wrench } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS, type UserRole } from '@/types';

interface GuideSection {
  id: string;
  title: string;
  steps: string[];
  roles?: UserRole[];
}

const MODULE_GUIDES: GuideSection[] = [
  {
    id: 'login',
    title: 'Logging In & Navigation',
    steps: [
      'Open LDPL CMMS from the desktop application installed on your workstation.',
      'Enter your username and password provided by IT (default demo password: Admin@123).',
      'After 5 failed attempts, your account locks for 15 minutes — contact admin if locked.',
      'Use the left sidebar to navigate between modules. Menu items vary by your role.',
      'Click the bell icon for notifications (approvals, critical WOs, low stock).',
      'Sign out from the bottom of the sidebar when leaving your workstation.',
    ],
  },
  {
    id: 'equipment',
    title: 'Equipment Registry',
    roles: ['admin', 'manager', 'engineer', 'supervisor', 'storekeeper', 'technician', 'viewer', 'hod'],
    steps: [
      'Browse the asset hierarchy: Plant → System → Sub-System → Equipment → Component.',
      'Search by tag number, name, or location using the search bar.',
      'Engineers/Admin: click "Add Asset" to register new equipment with tag LDPL-XXXXX.',
      'Print barcode labels from the asset detail panel for physical tagging.',
      'Transfer assets between departments or decommission when retired.',
    ],
  },
  {
    id: 'work-orders',
    title: 'Work Orders',
    roles: ['admin', 'manager', 'engineer', 'supervisor', 'technician'],
    steps: [
      'Create a WO: select type (CM/PM/INS), priority, asset, and description.',
      'Supervisors assign WOs to technicians; technicians see assigned WOs on their list.',
      'Workflow: Open → Assigned → In Progress → On Hold → Pending Approval → Completed.',
      'Log labor hours from the WO detail panel while work is in progress.',
      'Issue spare parts from Inventory to link costs to the WO automatically.',
      'Supervisors/Managers approve completed WOs before they close.',
    ],
  },
  {
    id: 'pm',
    title: 'PM Scheduling',
    roles: ['admin', 'manager', 'engineer', 'supervisor'],
    steps: [
      'PM Templates define recurring maintenance tasks (daily, weekly, monthly, etc.).',
      'The scheduler auto-generates PM work orders when due dates arrive.',
      'View the PM forecast to see upcoming maintenance in the next 30/60/90 days.',
      'When a PM WO is approved/completed, the next due date updates automatically.',
      'Run "Generate Now" from PM page to manually trigger the scheduler.',
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory & Stores',
    roles: ['admin', 'storekeeper', 'manager', 'engineer', 'supervisor'],
    steps: [
      'View all spare parts with stock levels, locations, and reorder points.',
      'Storekeeper: receive stock, issue to WO, return, adjust, or scrap items.',
      'Low stock and critical-zero alerts appear on the Inventory dashboard.',
      'Scan barcode (ITM-XXXXX) to quickly find items.',
      'Issue parts to an open WO — stock deducts and WO cost recalculates.',
    ],
  },
  {
    id: 'purchasing',
    title: 'Purchasing & Procurement',
    roles: ['admin', 'storekeeper', 'engineer', 'supervisor', 'hod', 'manager'],
    steps: [
      'Create Purchase Requisition (PR) when stock falls below minimum — add line items.',
      'Submit PR for HOD/Supervisor approval.',
      'After PR approval, create Purchase Order (PO) linked to a vendor.',
      'Manager approves PO; storekeeper marks as Ordered when sent to vendor.',
      'On delivery, create GRN (Goods Received Note) — stock updates automatically.',
    ],
  },
  {
    id: 'reports',
    title: 'Reports & Analytics',
    roles: ['admin', 'manager', 'engineer', 'supervisor', 'hod'],
    steps: [
      'KPI Dashboard: open WOs, MTTR, MTBF, PM compliance, maintenance costs.',
      'Standard Reports tab: select report type, set date filters, click Apply.',
      'Export to Excel (CSV) or PDF (print dialog) for management meetings.',
      'Key reports: WO History, PM Compliance, Maintenance Cost, Inventory Valuation.',
    ],
  },
  {
    id: 'admin',
    title: 'System Administration',
    roles: ['admin'],
    steps: [
      'User Management: create users, assign roles, deactivate accounts.',
      'System Config: company settings, backup schedule, security parameters.',
      'Run manual database backup from Backups tab; verify files in backup directory.',
      'Configure nightly cron: 0 2 * * * npm run backup — copy to external HDD.',
      'Set JWT_SECRET and BACKUP_ENCRYPTION_KEY in .env before production.',
      'Review Audit Trail report for security events and failed logins.',
    ],
  },
];

const ROLE_TIPS: Record<UserRole, string[]> = {
  admin: ['Full system access', 'Manage users and backups', 'Review audit logs'],
  manager: ['Approve WOs and POs', 'View all reports and KPIs', 'Cannot delete records'],
  engineer: ['Create/edit assets and WOs', 'Create purchase requisitions', 'Approve WOs'],
  supervisor: ['Assign WOs to technicians', 'Approve PRs and WOs', 'View team reports'],
  storekeeper: ['Manage inventory transactions', 'Create PRs and POs', 'Process GRN receipts'],
  technician: ['View assigned WOs only', 'Update WO status and log labor', 'Read-only elsewhere'],
  viewer: ['Read-only access to all modules', 'Export reports'],
  hod: ['Approve purchase requisitions', 'View department reports'],
};

const FAQ = [
  { q: 'I forgot my password', a: 'Contact the System Administrator (IT). Admin can reset your password from User Management.' },
  { q: 'Account is locked', a: 'Wait 15 minutes after 5 failed login attempts, or ask admin to unlock your account.' },
  { q: 'Cannot see a menu item', a: 'Menu visibility is role-based. Your role determines which modules you can access.' },
  { q: 'WO will not complete', a: 'Ensure all required fields are filled, labor is logged, and supervisor approval is obtained.' },
  { q: 'Stock not updating after GRN', a: 'Verify PO status is Approved/Ordered and quantities entered in GRN receive form.' },
  { q: 'Reports show no data', a: 'Adjust date range filters. Ensure WOs/assets exist for the selected period.' },
];

function GuideCard({ section, defaultOpen }: { section: GuideSection; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
      >
        <span className="font-medium text-gray-900">{section.title}</span>
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>
      {open && (
        <ol className="px-4 py-3 space-y-2 list-decimal list-inside text-sm text-gray-700">
          {section.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function HelpPage() {
  const { user } = useAuth();
  const role = user!.role;

  const visibleGuides = MODULE_GUIDES.filter(
    (g) => !g.roles || g.roles.includes(role),
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen size={24} className="text-blue-600" />
          Help & User Training
        </h1>
        <p className="text-gray-500 mt-1">
          Quick-start guides for {ROLE_LABELS[role]} — LDPL CMMS v1.0
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Monitor size={18} className="text-blue-600" />
            <h3 className="font-semibold text-blue-900">Your Role</h3>
          </div>
          <p className="text-sm text-blue-800 font-medium">{ROLE_LABELS[role]}</p>
          <ul className="mt-2 space-y-1 text-sm text-blue-700">
            {ROLE_TIPS[role].map((tip) => (
              <li key={tip}>• {tip}</li>
            ))}
          </ul>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wrench size={18} className="text-emerald-600" />
            <h3 className="font-semibold text-emerald-900">Daily Workflow</h3>
          </div>
          <p className="text-sm text-emerald-800">
            {role === 'technician'
              ? 'Check assigned WOs → Start work → Log labor → Request completion.'
              : role === 'storekeeper'
                ? 'Review stock alerts → Process issues/receipts → Create PRs for low stock.'
                : role === 'engineer'
                  ? 'Review open WOs → Create CM WOs → Update asset records → Approve completions.'
                  : 'Review dashboard KPIs → Approve pending items → Monitor PM compliance.'}
          </p>
        </div>

        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={18} className="text-violet-600" />
            <h3 className="font-semibold text-violet-900">Security Reminders</h3>
          </div>
          <ul className="text-sm text-violet-800 space-y-1">
            <li>• Never share your password</li>
            <li>• Sign out when leaving desk</li>
            <li>• Report suspicious activity to IT</li>
            <li>• Sessions expire after 8 hours</li>
          </ul>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Module Guides</h2>
        <div className="space-y-2">
          {visibleGuides.map((section, i) => (
            <GuideCard key={section.id} section={section} defaultOpen={i === 0} />
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <HelpCircle size={20} className="text-gray-500" />
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {FAQ.map((item) => (
            <div key={item.q}>
              <p className="font-medium text-gray-900 text-sm">{item.q}</p>
              <p className="text-sm text-gray-600 mt-0.5">{item.a}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-6 text-center">
        LDPL CMMS — Liberty Daharki Powers Ltd — For support contact IT Administration (admin@ldpl.local)
      </p>
    </div>
  );
}

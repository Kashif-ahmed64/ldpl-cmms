import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Download,
  FileText,
  Printer,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  ClipboardList,
  Package,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import type { KpiData, ReportData, ReportId } from '@/types/reports';
import {
  REPORT_CATALOG,
  PRIORITY_COLORS,
  TYPE_COLORS,
  downloadCsv,
  printReport,
  toCsv,
} from '@/types/reports';

type View = 'dashboard' | 'reports';

function canExport(role: string) {
  return ['admin', 'manager', 'engineer', 'supervisor', 'hod'].includes(role);
}

function defaultFromDate() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function defaultToDate() {
  return new Date().toISOString().slice(0, 10);
}

export function ReportsPage() {
  const { user } = useAuth();
  const [view, setView] = useState<View>('dashboard');
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ReportId>('work-orders');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [fromDate, setFromDate] = useState(defaultFromDate());
  const [toDate, setToDate] = useState(defaultToDate());

  const visibleReports = REPORT_CATALOG.filter(
    (r) => !r.adminOnly || user!.role === 'admin' || user!.role === 'manager',
  );

  useEffect(() => {
    setLoadingKpis(true);
    apiFetch<{ kpis: KpiData }>('/api/reports/kpis')
      .then((d) => setKpis(d.kpis))
      .catch(() => {})
      .finally(() => setLoadingKpis(false));
  }, []);

  const loadReport = useCallback(async () => {
    setLoadingReport(true);
    try {
      const params = new URLSearchParams({ from: fromDate, to: toDate });
      const data = await apiFetch<ReportData>(`/api/reports/${selectedReport}?${params}`);
      setReportData(data);
    } catch {
      setReportData(null);
    } finally {
      setLoadingReport(false);
    }
  }, [selectedReport, fromDate, toDate]);

  useEffect(() => {
    if (view === 'reports') loadReport();
  }, [view, loadReport]);

  const priorityChart = kpis
    ? Object.entries(kpis.openByPriority).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
        fill: PRIORITY_COLORS[name] ?? '#6b7280',
      }))
    : [];

  const typeChart = kpis
    ? Object.entries(kpis.openByType).map(([name, value]) => ({
        name,
        value,
        fill: TYPE_COLORS[name] ?? '#6b7280',
      }))
    : [];

  const handleExportCsv = () => {
    if (!reportData) return;
    const csv = toCsv(reportData.columns, reportData.rows);
    downloadCsv(`${reportData.report}-${toDate}.csv`, csv);
  };

  const handlePrintPdf = () => {
    if (!reportData) return;
    const label = visibleReports.find((r) => r.id === selectedReport)?.label ?? selectedReport;
    printReport(label, reportData.columns, reportData.rows);
  };

  const kpiCards = kpis
    ? [
        {
          label: 'Open Work Orders',
          value: kpis.totalOpenWorkOrders,
          icon: ClipboardList,
          color: 'bg-blue-500',
        },
        {
          label: 'WO Completion (Month)',
          value: `${kpis.completionRateThisMonth}%`,
          icon: TrendingUp,
          color: 'bg-emerald-500',
        },
        {
          label: 'PM Compliance',
          value: `${kpis.pmComplianceRate}%`,
          icon: BarChart3,
          color: 'bg-violet-500',
        },
        {
          label: 'Maint. Cost (Month)',
          value: `PKR ${kpis.maintenanceCostThisMonth.toLocaleString()}`,
          icon: DollarSign,
          color: 'bg-amber-500',
        },
        {
          label: 'Overdue WOs',
          value: kpis.overdueWorkOrders,
          icon: AlertTriangle,
          color: 'bg-red-500',
        },
        {
          label: 'Inventory Value',
          value: `PKR ${kpis.inventoryValue.toLocaleString()}`,
          icon: Package,
          color: 'bg-indigo-500',
        },
        {
          label: 'Pending PO Value',
          value: `PKR ${kpis.pendingPoValue.toLocaleString()}`,
          icon: FileText,
          color: 'bg-teal-500',
        },
        {
          label: 'PMs Done (Month)',
          value: kpis.pmCompletedThisMonth,
          icon: ClipboardList,
          color: 'bg-cyan-500',
        },
      ]
    : [];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-500 mt-1">KPI dashboards, MTTR/MTBF, and exportable reports</p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {(['dashboard', 'reports'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {v === 'dashboard' ? 'KPI Dashboard' : 'Standard Reports'}
            </button>
          ))}
        </div>
      </div>

      {view === 'dashboard' && (
        <>
          {loadingKpis ? (
            <p className="text-gray-500 text-center py-12">Loading KPIs...</p>
          ) : kpis ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {kpiCards.map((card) => (
                  <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">{card.label}</p>
                        <p className="text-xl font-bold mt-1 text-gray-900">{card.value}</p>
                      </div>
                      <div className={`${card.color} p-2.5 rounded-lg text-white`}>
                        <card.icon size={18} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold mb-4">Open WOs by Priority</h3>
                  {priorityChart.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={priorityChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                          {priorityChart.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-gray-400 text-sm text-center py-8">No open work orders</p>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold mb-4">Open WOs by Type</h3>
                  {typeChart.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={typeChart}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="value" name="Count">
                          {typeChart.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-gray-400 text-sm text-center py-8">No open work orders</p>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold mb-4">MTTR by Asset Category (hours)</h3>
                  {kpis.mttrByCategory.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={kpis.mttrByCategory}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="category" />
                        <YAxis />
                        <Tooltip formatter={(v: number) => [`${v} hrs`, 'MTTR']} />
                        <Bar dataKey="mttrHours" fill="#3b82f6" name="MTTR (hrs)" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-gray-400 text-sm text-center py-8">No completed CM work orders yet</p>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold mb-4">MTBF by Asset (days between failures)</h3>
                  {kpis.mtbfByAsset.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={kpis.mtbfByAsset} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis type="category" dataKey="assetTag" width={80} />
                        <Tooltip formatter={(v: number) => [`${v} days`, 'MTBF']} />
                        <Bar dataKey="mtbfDays" fill="#10b981" name="MTBF (days)" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-gray-400 text-sm text-center py-8">Need 2+ CM events per asset</p>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold mb-4">Top 10 Most Maintained Assets (CM count)</h3>
                {kpis.topMaintainedAssets.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="pb-2 font-medium">Asset Tag</th>
                        <th className="pb-2 font-medium">Name</th>
                        <th className="pb-2 font-medium text-right">CM Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kpis.topMaintainedAssets.map((a) => (
                        <tr key={a.assetTag} className="border-b last:border-0">
                          <td className="py-2 font-mono text-xs">{a.assetTag}</td>
                          <td className="py-2">{a.assetName}</td>
                          <td className="py-2 text-right font-semibold">{a.cmCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-gray-400 text-sm">No corrective maintenance records</p>
                )}
              </div>
            </>
          ) : (
            <p className="text-red-500 text-center py-12">Failed to load KPIs</p>
          )}
        </>
      )}

      {view === 'reports' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-sm mb-3">Select Report</h3>
            <div className="space-y-1">
              {visibleReports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedReport(r.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedReport === r.id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b flex flex-wrap items-center gap-3">
              <p className="font-semibold text-sm flex-1">
                {visibleReports.find((r) => r.id === selectedReport)?.label}
              </p>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1"
              />
              <span className="text-gray-400 text-sm">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1"
              />
              <button
                onClick={loadReport}
                className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-lg"
              >
                Apply
              </button>
              {canExport(user!.role) && reportData && (
                <>
                  <button
                    onClick={handleExportCsv}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                  >
                    <Download size={14} /> Excel (CSV)
                  </button>
                  <button
                    onClick={handlePrintPdf}
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800"
                  >
                    <Printer size={14} /> PDF
                  </button>
                </>
              )}
            </div>

            {reportData?.summary && (
              <div className="px-4 py-2 bg-gray-50 border-b text-sm text-gray-600 flex gap-4">
                {Object.entries(reportData.summary).map(([k, v]) => (
                  <span key={k}>
                    {k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}:{' '}
                    <strong>{typeof v === 'number' ? v.toLocaleString() : String(v)}</strong>
                  </span>
                ))}
              </div>
            )}

            {loadingReport ? (
              <p className="text-gray-500 text-center py-12">Loading report...</p>
            ) : reportData && reportData.rows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {reportData.columns.map((c) => (
                        <th key={c.key} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((row, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                        {reportData.columns.map((c) => (
                          <td key={c.key} className="px-4 py-2.5 whitespace-nowrap">
                            {row[c.key] != null ? String(row[c.key]) : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-12">No data for selected filters</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export interface ReportColumn {
  key: string;
  label: string;
}

export interface ReportData {
  report: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary?: Record<string, unknown>;
  filters?: Record<string, unknown>;
}

export interface KpiData {
  totalOpenWorkOrders: number;
  openByPriority: Record<string, number>;
  openByType: Record<string, number>;
  completionRateThisMonth: number;
  completedThisMonth: number;
  createdThisMonth: number;
  mttrByCategory: { category: string; mttrHours: number }[];
  mtbfByAsset: { assetTag: string; assetName: string; mtbfDays: number; failureCount: number }[];
  pmComplianceRate: number;
  pmCompletedThisMonth: number;
  maintenanceCostThisMonth: number;
  topMaintainedAssets: { assetTag: string; assetName: string; cmCount: number }[];
  inventoryValue: number;
  pendingPoValue: number;
  overdueWorkOrders: number;
}

export type ReportId =
  | 'work-orders'
  | 'pm-compliance'
  | 'maintenance-cost'
  | 'inventory-valuation'
  | 'stock-movement'
  | 'purchase-orders'
  | 'labor-hours'
  | 'audit-trail'
  | 'warranty-expiry'
  | 'pm-forecast';

export const REPORT_CATALOG: { id: ReportId; label: string; description: string; adminOnly?: boolean }[] = [
  { id: 'work-orders', label: 'Work Order History', description: 'All work orders in date range' },
  { id: 'pm-compliance', label: 'PM Compliance', description: 'Preventive maintenance on-time performance' },
  { id: 'maintenance-cost', label: 'Maintenance Cost', description: 'Completed WO costs by period' },
  { id: 'inventory-valuation', label: 'Inventory Valuation', description: 'Stock value by item' },
  { id: 'stock-movement', label: 'Stock Movement', description: 'Inventory transactions log' },
  { id: 'purchase-orders', label: 'Purchase Orders', description: 'PO summary by vendor and status' },
  { id: 'labor-hours', label: 'Labor Hours', description: 'Technician time logged on WOs' },
  { id: 'audit-trail', label: 'Audit Trail', description: 'System activity log', adminOnly: true },
  { id: 'warranty-expiry', label: 'Asset Warranty Expiry', description: 'Assets with warranty expiring in 90 days' },
  { id: 'pm-forecast', label: 'PM Schedule Forecast', description: 'Upcoming PM due dates (90 days)' },
];

export function toCsv(columns: ReportColumn[], rows: Record<string, unknown>[]): string {
  const header = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(',');
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const val = row[c.key];
        if (val == null) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(','),
  );
  return [header, ...lines].join('\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function printReport(title: string, columns: ReportColumn[], rows: Record<string, unknown>[]) {
  const html = `<!DOCTYPE html><html><head><title>${title}</title>
<style>
body{font-family:Arial,sans-serif;font-size:11px;margin:20px}
h1{font-size:16px;margin-bottom:4px}
p{color:#666;font-size:10px;margin-bottom:16px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
th{background:#f0f0f0}
</style></head><body>
<h1>LDPL CMMS — ${title}</h1>
<p>Generated: ${new Date().toLocaleString()}</p>
<table><thead><tr>${columns.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${r[c.key] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>
</table></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.print();
}

export const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#3b82f6',
  low: '#6b7280',
};

export const TYPE_COLORS: Record<string, string> = {
  CM: '#ef4444',
  PM: '#10b981',
  PdM: '#8b5cf6',
  INS: '#3b82f6',
  MOD: '#f59e0b',
  SDW: '#6b7280',
};

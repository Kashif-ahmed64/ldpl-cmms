#!/usr/bin/env node
/**
 * LDPL CMMS — Smoke test script
 * Run against a live API server: npm run smoke-test
 * Requires: server running on PORT (default 3001), seeded database
 */
const BASE = process.env.API_URL ?? 'http://localhost:3001';

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

async function apiJson(res) {
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function login(username) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'Admin@123' }),
  });
  if (!res.ok) throw new Error(`Login failed for ${username}: ${res.status}`);
  const data = await apiJson(res);
  return data.accessToken;
}

async function apiGet(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return apiJson(res);
}

async function main() {
  console.log(`\nLDPL CMMS Smoke Test — ${BASE}\n`);

  let adminToken = '';

  await check('Health endpoint', async () => {
    const res = await fetch(`${BASE}/api/health`);
    const data = await apiJson(res);
    if (data.status !== 'ok') throw new Error('Health not ok');
  });

  await check('Admin login', async () => {
    adminToken = await login('admin');
    if (!adminToken) throw new Error('No token');
  });

  await check('Dashboard stats', async () => {
    const data = await apiGet('/api/dashboard/stats', adminToken);
    if (data.stats.assets < 1) throw new Error('No assets');
  });

  await check('Assets list', async () => {
    const data = await apiGet('/api/assets', adminToken);
    if (!data.assets.length) throw new Error('Empty assets');
  });

  await check('Work orders list', async () => {
    const data = await apiGet('/api/work-orders', adminToken);
    if (!Array.isArray(data.workOrders)) throw new Error('Invalid response');
  });

  await check('Inventory list', async () => {
    const data = await apiGet('/api/inventory', adminToken);
    if (!data.items.length) throw new Error('Empty inventory');
  });

  await check('PM templates', async () => {
    const data = await apiGet('/api/pm-templates', adminToken);
    if (!data.templates.length) throw new Error('No PM templates');
  });

  await check('Vendors list', async () => {
    const data = await apiGet('/api/vendors', adminToken);
    if (!data.vendors.length) throw new Error('No vendors');
  });

  await check('Reports KPIs', async () => {
    const data = await apiGet('/api/reports/kpis', adminToken);
    if (typeof data.kpis.totalOpenWorkOrders !== 'number') throw new Error('Invalid KPIs');
  });

  await check('Settings (admin)', async () => {
    const data = await apiGet('/api/settings', adminToken);
    if (!data.config.company_name) throw new Error('No config');
  });

  await check('Role restriction (technician → users)', async () => {
    const techToken = await login('technician');
    const res = await fetch(`${BASE}/api/users`, {
      headers: { Authorization: `Bearer ${techToken}` },
    });
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err.message);
  process.exit(1);
});

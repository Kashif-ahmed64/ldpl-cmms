import 'dotenv/config';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../src/app.js';

let baseUrl = '';
let httpServer: Server;
let adminToken = '';
let storekeeperToken = '';

async function api<T = Record<string, unknown>>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

async function login(username: string, password = 'Admin@123') {
  const res = await api<{ accessToken: string }>('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  assert.equal(res.status, 200, `Login failed for ${username}`);
  return res.body.accessToken;
}

describe('LDPL CMMS API — Integration Tests', () => {
  before(async () => {
    const bundle = createApp();
    httpServer = bundle.httpServer;
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const addr = httpServer.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    adminToken = await login('admin');
    storekeeperToken = await login('storekeeper');
  });

  after(() => {
    httpServer?.close();
  });

  describe('Health & Auth', () => {
    it('GET /api/health returns ok', async () => {
      const res = await api('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
      assert.equal(res.body.app, 'LDPL CMMS API');
    });

    it('POST /api/auth/login rejects invalid credentials', async () => {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: 'wrong' },
      });
      assert.equal(res.status, 401);
    });

    it('GET /api/auth/me returns user profile', async () => {
      const res = await api<{ user: { username: string; role: string } }>('/api/auth/me', {
        token: adminToken,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.user.username, 'admin');
      assert.equal(res.body.user.role, 'admin');
    });

    it('GET /api/auth/me rejects unauthenticated requests', async () => {
      const res = await api('/api/auth/me');
      assert.equal(res.status, 401);
    });
  });

  describe('Dashboard', () => {
    it('GET /api/dashboard/stats returns counts', async () => {
      const res = await api<{ stats: { assets: number; activeUsers: number } }>(
        '/api/dashboard/stats',
        { token: adminToken },
      );
      assert.equal(res.status, 200);
      assert.ok(res.body.stats.assets > 0);
      assert.ok(res.body.stats.activeUsers > 0);
    });
  });

  describe('Equipment Registry', () => {
    it('GET /api/assets returns seeded assets', async () => {
      const res = await api<{ assets: { assetTagNo: string }[] }>('/api/assets', {
        token: adminToken,
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.assets.length > 0);
      assert.match(res.body.assets[0].assetTagNo, /^LDPL-/);
    });

    it('GET /api/assets/lookup/:tag finds by tag', async () => {
      const list = await api<{ assets: { assetTagNo: string }[] }>('/api/assets', {
        token: adminToken,
      });
      const tag = list.body.assets[0].assetTagNo;
      const res = await api<{ asset: { assetTagNo: string } }>(`/api/assets/lookup/${tag}`, {
        token: adminToken,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.asset.assetTagNo, tag);
    });
  });

  describe('Work Orders', () => {
    it('GET /api/work-orders returns work orders', async () => {
      const res = await api<{ workOrders: unknown[] }>('/api/work-orders', { token: adminToken });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.workOrders));
    });

    it('GET /api/work-orders/assignees returns users', async () => {
      const res = await api<{ assignees: unknown[] }>('/api/work-orders/assignees', {
        token: adminToken,
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.assignees.length > 0);
    });
  });

  describe('PM Scheduling', () => {
    it('GET /api/pm-templates returns templates', async () => {
      const res = await api<{ templates: unknown[] }>('/api/pm-templates', { token: adminToken });
      assert.equal(res.status, 200);
      assert.ok(res.body.templates.length > 0);
    });
  });

  describe('Inventory', () => {
    it('GET /api/inventory returns items', async () => {
      const res = await api<{ items: unknown[] }>('/api/inventory', { token: storekeeperToken });
      assert.equal(res.status, 200);
      assert.ok(res.body.items.length > 0);
    });

    it('GET /api/inventory/alerts returns stock alerts', async () => {
      const res = await api<{ alerts: unknown[] }>('/api/inventory/alerts', {
        token: storekeeperToken,
      });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.alerts));
    });
  });

  describe('Purchasing', () => {
    it('GET /api/vendors returns vendors', async () => {
      const res = await api<{ vendors: unknown[] }>('/api/vendors', { token: storekeeperToken });
      assert.equal(res.status, 200);
      assert.ok(res.body.vendors.length > 0);
    });

    it('GET /api/purchase-requisitions returns PRs', async () => {
      const res = await api<{ requisitions: unknown[] }>('/api/purchase-requisitions', {
        token: storekeeperToken,
      });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.requisitions));
    });

    it('GET /api/purchase-orders returns POs', async () => {
      const res = await api<{ orders: unknown[] }>('/api/purchase-orders', {
        token: storekeeperToken,
      });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.orders));
    });
  });

  describe('Reports', () => {
    it('GET /api/reports/kpis returns KPI data', async () => {
      const res = await api<{ kpis: { totalOpenWorkOrders: number } }>('/api/reports/kpis', {
        token: adminToken,
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.kpis);
      assert.equal(typeof res.body.kpis.totalOpenWorkOrders, 'number');
    });

    it('GET /api/reports/inventory-valuation returns report', async () => {
      const res = await api<{ rows: unknown[] }>('/api/reports/inventory-valuation', {
        token: adminToken,
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.rows.length > 0);
    });
  });

  describe('Settings (admin only)', () => {
    it('GET /api/settings returns config for admin', async () => {
      const res = await api<{ config: { company_name: string } }>('/api/settings', {
        token: adminToken,
      });
      assert.equal(res.status, 200);
      assert.match(res.body.config.company_name, /Liberty/);
    });

    it('GET /api/settings rejects non-admin', async () => {
      const res = await api('/api/settings', { token: storekeeperToken });
      assert.equal(res.status, 403);
    });
  });

  describe('Role-based access', () => {
    it('technician cannot access user management', async () => {
      const techToken = await login('technician');
      const res = await api('/api/users', { token: techToken });
      assert.equal(res.status, 403);
    });
  });
});

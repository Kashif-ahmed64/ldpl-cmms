import 'dotenv/config';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasPermission } from '../src/lib/permissions.js';
import { getPgDumpConnectionString } from '../src/lib/backup.js';
import { parseDateRange, hoursBetween, toCsv } from '../src/lib/reports.js';

describe('permissions', () => {
  it('grants admin full asset access', () => {
    assert.equal(hasPermission('admin', 'assets', 'delete'), true);
    assert.equal(hasPermission('admin', 'purchasing', 'approve'), true);
    assert.equal(hasPermission('admin', 'reports', 'export'), true);
  });

  it('restricts technician from creating assets', () => {
    assert.equal(hasPermission('technician', 'assets', 'create'), false);
    assert.equal(hasPermission('technician', 'work_orders', 'update_assigned'), true);
  });

  it('allows storekeeper inventory management', () => {
    assert.equal(hasPermission('storekeeper', 'inventory', 'edit'), true);
    assert.equal(hasPermission('storekeeper', 'purchasing', 'create'), true);
  });

  it('allows manager report export', () => {
    assert.equal(hasPermission('manager', 'reports', 'export'), true);
    assert.equal(hasPermission('viewer', 'reports', 'export'), false);
  });
});

describe('backup utilities', () => {
  it('strips Prisma schema query param from DATABASE_URL', () => {
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/ldpl_cmms_db?schema=public';
    assert.equal(
      getPgDumpConnectionString(),
      'postgresql://user:pass@localhost:5432/ldpl_cmms_db',
    );
    process.env.DATABASE_URL = original;
  });
});

describe('reports utilities', () => {
  it('parses date range with defaults', () => {
    const { from, to } = parseDateRange();
    assert.ok(from instanceof Date);
    assert.ok(to instanceof Date);
    assert.ok(from.getTime() <= to.getTime());
  });

  it('calculates hours between dates', () => {
    const start = new Date('2026-01-01T08:00:00Z');
    const end = new Date('2026-01-01T12:00:00Z');
    assert.equal(hoursBetween(start, end), 4);
  });

  it('generates valid CSV', () => {
    const csv = toCsv(
      [
        { key: 'name', label: 'Name' },
        { key: 'qty', label: 'Qty' },
      ],
      [
        { name: 'Bearing', qty: 5 },
        { name: 'Test "quoted"', qty: 1 },
      ],
    );
    assert.match(csv, /"Name","Qty"/);
    assert.match(csv, /"Test ""quoted""","1"/);
  });
});

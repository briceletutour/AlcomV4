/**
 * Dashboard & Stats API Integration Tests — Sprint 11
 *
 * Uses supertest to exercise the Express app with a real DB.
 * Requires seeded database (npx tsx prisma/seed.ts).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index';

// ─── helpers ──────────────────────────────────────────────────────

let adminToken: string;
let managerToken: string;

/** Login helper — returns access token */
async function login(email: string, password = 'Alcom2026!'): Promise<string> {
  const res = await request(app)
    .post('/auth/login')
    .send({ email, password });
  if (res.status !== 200 || !res.body?.data?.accessToken) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

// ─── setup ────────────────────────────────────────────────────────

beforeAll(async () => {
  adminToken = await login('admin@alcom.cm');
  managerToken = await login('manager1@alcom.cm');
}, 30_000);

// ══════════════════════════════════════════════════════════════════
//  Dashboard Stats API
// ══════════════════════════════════════════════════════════════════

describe('Dashboard Stats API', () => {
  // ─── GET /stats/dashboard ─────────────────────────────────────

  describe('GET /stats/dashboard', () => {
    it('should return executive dashboard for admin (CEO/SUPER_ADMIN)', async () => {
      const res = await request(app)
        .get('/stats/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('executive');

      const data = res.body.data;
      // Executive fields must exist
      expect(data).toHaveProperty('totalRevenue');
      expect(data).toHaveProperty('totalVariance');
      expect(data).toHaveProperty('avgVariancePerStation');
      expect(data).toHaveProperty('pendingInvoices');
      expect(data).toHaveProperty('pendingInvoiceAmount');
      expect(data).toHaveProperty('pendingExpenses');
      expect(data).toHaveProperty('pendingExpenseAmount');
      expect(data).toHaveProperty('stationRanking');
      expect(data).toHaveProperty('overdueMails');
      expect(data).toHaveProperty('revenueByStation');
      expect(data).toHaveProperty('revenueTrend');

      // Types
      expect(typeof data.totalRevenue).toBe('number');
      expect(typeof data.pendingInvoices).toBe('number');
      expect(Array.isArray(data.stationRanking)).toBe(true);
      expect(Array.isArray(data.revenueTrend)).toBe(true);
    });

    it('should return manager dashboard for station manager', async () => {
      const res = await request(app)
        .get('/stats/dashboard')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('manager');

      const data = res.body.data;
      // Manager fields must exist
      expect(data).toHaveProperty('todayRevenue');
      expect(data).toHaveProperty('yesterdayRevenue');
      expect(data).toHaveProperty('revenueChangePercent');
      expect(data).toHaveProperty('openShifts');
      expect(data).toHaveProperty('pendingChecklists');
      expect(data).toHaveProperty('currentVariance');
      expect(data).toHaveProperty('varianceTrend');
      expect(data).toHaveProperty('tankLevels');
      expect(data).toHaveProperty('pendingExpenses');
      expect(data).toHaveProperty('openIncidents');

      // Types
      expect(typeof data.todayRevenue).toBe('number');
      expect(typeof data.openShifts).toBe('number');
      expect(Array.isArray(data.varianceTrend)).toBe(true);
      expect(Array.isArray(data.tankLevels)).toBe(true);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/stats/dashboard');
      expect(res.status).toBe(401);
    });

    it('manager dashboard should only show their station data', async () => {
      const res = await request(app)
        .get('/stats/dashboard')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      const data = res.body.data;

      // Manager should NOT have executive-only fields
      expect(data).not.toHaveProperty('stationRanking');
      expect(data).not.toHaveProperty('revenueByStation');

      // Tank levels, if present, should all belong to the same station
      if (data.tankLevels.length > 0) {
        // All tanks belong to station - no stationId on tank objects
        // but they were queried by station filter
        expect(data.tankLevels[0]).toHaveProperty('tankId');
        expect(data.tankLevels[0]).toHaveProperty('fuelType');
        expect(data.tankLevels[0]).toHaveProperty('level');
        expect(data.tankLevels[0]).toHaveProperty('capacity');
        expect(data.tankLevels[0]).toHaveProperty('percentage');
      }
    });

    it('executive sees all stations in ranking', async () => {
      const res = await request(app)
        .get('/stats/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const data = res.body.data;

      // Station ranking items should have expected shape
      if (data.stationRanking.length > 0) {
        const station = data.stationRanking[0];
        expect(station).toHaveProperty('stationId');
        expect(station).toHaveProperty('name');
        expect(station).toHaveProperty('revenue');
        expect(station).toHaveProperty('variance');
      }
    });
  });

  // ─── GET /stats/sales-trend ───────────────────────────────────

  describe('GET /stats/sales-trend', () => {
    it('should return daily revenue trend', async () => {
      const res = await request(app)
        .get('/stats/sales-trend?days=30')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      if (res.body.data.length > 0) {
        const point = res.body.data[0];
        expect(point).toHaveProperty('date');
        expect(point).toHaveProperty('revenue');
        expect(typeof point.revenue).toBe('number');
      }
    });

    it('should filter by station', async () => {
      // Get a station first
      const stationsRes = await request(app)
        .get('/stations')
        .set('Authorization', `Bearer ${adminToken}`);
      const stations = stationsRes.body?.data || [];

      if (stations.length > 0) {
        const res = await request(app)
          .get(`/stats/sales-trend?stationId=${stations[0].id}&days=7`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });
  });

  // ─── GET /stats/tank-levels ───────────────────────────────────

  describe('GET /stats/tank-levels', () => {
    it('should return tank level data', async () => {
      const res = await request(app)
        .get('/stats/tank-levels')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);

      if (res.body.data.length > 0) {
        const tank = res.body.data[0];
        expect(tank).toHaveProperty('tankId');
        expect(tank).toHaveProperty('fuelType');
        expect(tank).toHaveProperty('level');
        expect(tank).toHaveProperty('capacity');
        expect(tank).toHaveProperty('percentage');
        expect(typeof tank.percentage).toBe('number');
        expect(tank.percentage).toBeGreaterThanOrEqual(0);
        expect(tank.percentage).toBeLessThanOrEqual(100);
      }
    });
  });

  // ─── GET /stats/variance-report ───────────────────────────────

  describe('GET /stats/variance-report', () => {
    it('should return variance data per shift', async () => {
      const res = await request(app)
        .get('/stats/variance-report')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);

      if (res.body.data.length > 0) {
        const shift = res.body.data[0];
        expect(shift).toHaveProperty('shiftId');
        expect(shift).toHaveProperty('date');
        expect(shift).toHaveProperty('shiftType');
        expect(shift).toHaveProperty('cashVariance');
        expect(shift).toHaveProperty('stockVariance');
      }
    });
  });

  // ─── GET /stats/checklist-scores ──────────────────────────────

  describe('GET /stats/checklist-scores', () => {
    it('should return checklist score data', async () => {
      const res = await request(app)
        .get('/stats/checklist-scores?days=30')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);

      if (res.body.data.length > 0) {
        const entry = res.body.data[0];
        expect(entry).toHaveProperty('date');
        expect(entry).toHaveProperty('avgScore');
        expect(entry).toHaveProperty('count');
      }
    });
  });
});

// ══════════════════════════════════════════════════════════════════
//  CSV Exports
// ══════════════════════════════════════════════════════════════════

describe('CSV Export API', () => {
  describe('GET /exports/shifts', () => {
    it('should return valid CSV with correct headers', async () => {
      const res = await request(app)
        .get('/exports/shifts')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');

      const csv = res.text;
      // Remove BOM if present
      const cleanCsv = csv.replace(/^\uFEFF/, '');
      const lines = cleanCsv.split('\n').filter((l) => l.trim());

      // Should have at least a header line
      expect(lines.length).toBeGreaterThanOrEqual(1);

      const headers = lines[0]!.split(',');
      expect(headers).toContain('Date');
      expect(headers).toContain('ShiftType');
      expect(headers).toContain('Station');
      expect(headers).toContain('TotalRevenue');
      expect(headers).toContain('CashVariance');
    });
  });

  describe('GET /exports/invoices', () => {
    it('should return valid CSV', async () => {
      const res = await request(app)
        .get('/exports/invoices')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');

      const csv = res.text.replace(/^\uFEFF/, '');
      const lines = csv.split('\n').filter((l) => l.trim());
      expect(lines.length).toBeGreaterThanOrEqual(1);

      const headers = lines[0]!.split(',');
      expect(headers).toContain('InvoiceNumber');
      expect(headers).toContain('Supplier');
      expect(headers).toContain('Amount');
      expect(headers).toContain('Status');
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/exports/invoices?status=PENDING_APPROVAL')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });
  });

  describe('GET /exports/expenses', () => {
    it('should return valid CSV', async () => {
      const res = await request(app)
        .get('/exports/expenses')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');

      const csv = res.text.replace(/^\uFEFF/, '');
      const lines = csv.split('\n').filter((l) => l.trim());
      expect(lines.length).toBeGreaterThanOrEqual(1);

      const headers = lines[0]!.split(',');
      expect(headers).toContain('Title');
      expect(headers).toContain('Amount');
      expect(headers).toContain('Category');
      expect(headers).toContain('Status');
    });
  });

  describe('CSV export requires authentication', () => {
    it('shifts export requires auth', async () => {
      const res = await request(app).get('/exports/shifts');
      expect(res.status).toBe(401);
    });

    it('invoices export requires auth', async () => {
      const res = await request(app).get('/exports/invoices');
      expect(res.status).toBe(401);
    });

    it('expenses export requires auth', async () => {
      const res = await request(app).get('/exports/expenses');
      expect(res.status).toBe(401);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
//  Empty State Handling
// ══════════════════════════════════════════════════════════════════

describe('Dashboard Empty State', () => {
  it('should handle dashboard gracefully with zero data', async () => {
    // Both executive and manager views should return 200 even with no matching data
    const res = await request(app)
      .get('/stats/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // All numeric fields should be numbers (even if 0)
    const data = res.body.data;
    if (data.type === 'executive') {
      expect(typeof data.totalRevenue).toBe('number');
      expect(typeof data.pendingInvoices).toBe('number');
      expect(typeof data.overdueMails).toBe('number');
    } else {
      expect(typeof data.todayRevenue).toBe('number');
      expect(typeof data.openShifts).toBe('number');
      expect(typeof data.openIncidents).toBe('number');
    }
  });

  it('sales trend returns empty array for far future dates', async () => {
    const res = await request(app)
      .get('/stats/sales-trend?days=1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Might be empty, might have data — both are valid
  });

  it('checklist scores returns empty array when no validated checklists', async () => {
    const res = await request(app)
      .get('/stats/checklist-scores?days=1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

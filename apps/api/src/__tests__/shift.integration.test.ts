/**
 * Shift API Integration Tests — Sprint 3
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

/** Get a station ID the user has access to (first available) */
async function getFirstStation(token: string): Promise<string> {
  const res = await request(app)
    .get('/stations')
    .set('Authorization', `Bearer ${token}`);
  const stations = res.body?.data || [];
  if (stations.length === 0) throw new Error('No stations found');
  return stations[0].id;
}

/** Clean up any open shifts for a station so tests start clean */
async function closeAllOpenShifts(token: string, stationId: string) {
  const res = await request(app)
    .get('/shifts/current')
    .query({ stationId })
    .set('Authorization', `Bearer ${token}`);
  const shift = res.body?.data;
  if (!shift) return;

  // Get nozzle IDs and tank IDs from the open shift
  const sales = (shift.sales || []).map((s: any) => ({
    nozzleId: s.nozzleId,
    closingIndex: Number(s.openingIndex) + 100, // add 100L for dummy close
  }));

  const tankDips = (shift.tankDips || []).map((d: any) => ({
    tankId: d.tankId,
    physicalLevel: Number(d.openingLevel) - 50, // dummy
  }));

  const totalRevenue = sales.reduce((sum: number, s: any) => {
    const vol = s.closingIndex - Number(shift.sales.find((x: any) => x.nozzleId === s.nozzleId).openingIndex);
    return sum + vol * 750; // ~750 FCFA/L
  }, 0);

  await request(app)
    .post(`/shifts/${shift.id}/close`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      sales,
      tankDips,
      cash: { counted: totalRevenue, card: 0, expenses: 0 },
      justification: 'Test cleanup — automated close',
    });
}

// ─── setup ────────────────────────────────────────────────────────

beforeAll(async () => {
  adminToken = await login('admin@alcom.cm');
  managerToken = await login('manager1@alcom.cm');
}, 30_000);

// ══════════════════════════════════════════════════════════════════
//  Tests
// ══════════════════════════════════════════════════════════════════

describe('Shift API', () => {
  // ───── Open shift ──────────────────────────────────────────────

  describe('POST /shifts/open', () => {
    let stationId: string;
    let createdShiftId: string;
    // Use a unique random offset so tests don't collide with previous runs
    const dateOffset = 200 + Math.floor(Math.random() * 100);

    beforeAll(async () => {
      stationId = await getFirstStation(adminToken);
      await closeAllOpenShifts(adminToken, stationId);
    }, 30_000);

    it('should open a new shift', async () => {
      const d = new Date();
      d.setDate(d.getDate() + dateOffset);
      const dateStr = d.toISOString().slice(0, 10);

      const res = await request(app)
        .post('/shifts/open')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stationId,
          shiftDate: dateStr,
          shiftType: 'MORNING',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('OPEN');
      expect(res.body.data.stationId).toBe(stationId);
      expect(res.body.data.sales).toBeDefined();
      expect(res.body.data.tankDips).toBeDefined();
      expect(res.body.data.appliedPriceSnapshot).toBeDefined();

      createdShiftId = res.body.data.id;
    });

    it('should reject duplicate shift (same station/date/type)', async () => {
      const d = new Date();
      d.setDate(d.getDate() + dateOffset);
      const dateStr = d.toISOString().slice(0, 10);

      const res = await request(app)
        .post('/shifts/open')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stationId,
          shiftDate: dateStr,
          shiftType: 'MORNING',
        });

      // Either 409 (duplicate) or 400 (previous still open)
      expect([400, 409]).toContain(res.status);
    });

    it('should reject opening when previous shift is still open', async () => {
      const d = new Date();
      d.setDate(d.getDate() + dateOffset + 1);
      const dateStr = d.toISOString().slice(0, 10);

      const res = await request(app)
        .post('/shifts/open')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stationId,
          shiftDate: dateStr,
          shiftType: 'MORNING',
        });

      // 400 if previous open, 409 if a shift already exists at this date
      expect([400, 409]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error.code).toBe('BIZ_PREVIOUS_SHIFT_OPEN');
      }
    });

    it('should require authentication', async () => {
      const res = await request(app).post('/shifts/open').send({
        stationId,
        shiftDate: '2026-04-01',
        shiftType: 'MORNING',
      });

      expect(res.status).toBe(401);
    });

    // Cleanup: close that test shift so it doesn't block other tests
    afterAll(async () => {
      if (createdShiftId) {
        await closeAllOpenShifts(adminToken, stationId);
      }
    }, 30_000);
  });

  // ───── Close shift ──────────────────────────────────────────────

  describe('POST /shifts/:id/close', () => {
    let stationId: string;
    let openShift: any;
    const closeOffset = 400 + Math.floor(Math.random() * 100);

    beforeAll(async () => {
      stationId = await getFirstStation(adminToken);
      await closeAllOpenShifts(adminToken, stationId);

      // Open a fresh shift for closing tests — use unique timestamp-based date
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + closeOffset);
      const dateStr = futureDate.toISOString().slice(0, 10);

      const openRes = await request(app)
        .post('/shifts/open')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stationId, shiftDate: dateStr, shiftType: 'EVENING' });

      expect(openRes.status).toBe(201);
      openShift = openRes.body.data;
    }, 30_000);

    it('should close a shift successfully', async () => {
      const sales = openShift.sales.map((s: any) => ({
        nozzleId: s.nozzleId,
        closingIndex: Number(s.openingIndex) + 200,
      }));

      const tankDips = openShift.tankDips.map((d: any) => ({
        tankId: d.tankId,
        physicalLevel: Number(d.openingLevel) - 50,
      }));

      // Calculate expected revenue to match theoretical cash
      const priceSnapshot = openShift.appliedPriceSnapshot || {};
      let expectedRevenue = 0;
      for (const s of openShift.sales) {
        const vol = 200; // closingIndex - openingIndex
        const fuelType = s.nozzle?.pump?.tank?.fuelType;
        const price = priceSnapshot[fuelType] || Number(s.unitPrice);
        expectedRevenue += vol * price;
      }

      const res = await request(app)
        .post(`/shifts/${openShift.id}/close`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sales,
          tankDips,
          cash: {
            counted: expectedRevenue,
            card: 0,
            expenses: 0,
          },
          justification: 'Integration test — stock variance expected due to tank level approximation',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CLOSED');
      expect(res.body.data.totalRevenue).toBeDefined();
    });

    it('should reject closing an already-closed shift', async () => {
      const sales = openShift.sales.map((s: any) => ({
        nozzleId: s.nozzleId,
        closingIndex: Number(s.openingIndex) + 200,
      }));

      const tankDips = openShift.tankDips.map((d: any) => ({
        tankId: d.tankId,
        physicalLevel: Number(d.openingLevel) - 50,
      }));

      const res = await request(app)
        .post(`/shifts/${openShift.id}/close`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sales,
          tankDips,
          cash: { counted: 100000, card: 0, expenses: 0 },
          justification: 'test',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('BIZ_SHIFT_NOT_OPEN');
    });

    it('should require justification when variance exists', async () => {
      // Open another shift with unique date
      const futureDate2 = new Date();
      futureDate2.setDate(futureDate2.getDate() + closeOffset + 1);
      const dateStr2 = futureDate2.toISOString().slice(0, 10);

      await closeAllOpenShifts(adminToken, stationId);

      const openRes2 = await request(app)
        .post('/shifts/open')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stationId, shiftDate: dateStr2, shiftType: 'MORNING' });

      if (openRes2.status !== 201) return; // skip if can't open

      const shift2 = openRes2.body.data;

      const sales = shift2.sales.map((s: any) => ({
        nozzleId: s.nozzleId,
        closingIndex: Number(s.openingIndex) + 100,
      }));

      const tankDips = shift2.tankDips.map((d: any) => ({
        tankId: d.tankId,
        physicalLevel: Number(d.openingLevel) - 25,
      }));

      // Intentionally wrong cash to create variance
      const res = await request(app)
        .post(`/shifts/${shift2.id}/close`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sales,
          tankDips,
          cash: { counted: 1, card: 0, expenses: 0 },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BIZ_JUSTIFICATION_REQUIRED');

      // Now close with justification
      const res2 = await request(app)
        .post(`/shifts/${shift2.id}/close`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sales,
          tankDips,
          cash: { counted: 1, card: 0, expenses: 0 },
          justification: 'Écart détecté — vol de carburant suspecté',
        });

      expect(res2.status).toBe(200);
      expect(res2.body.data.justification).toBeTruthy();
    });
  });

  // ───── List shifts ──────────────────────────────────────────────

  describe('GET /shifts', () => {
    it('should list shifts with pagination', async () => {
      const res = await request(app)
        .get('/shifts')
        .query({ page: 1, limit: 5 })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(5);
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/shifts')
        .query({ page: 1, limit: 50, status: 'CLOSED' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      for (const shift of res.body.data) {
        expect(shift.status).toBe('CLOSED');
      }
    });

    it('should require auth', async () => {
      const res = await request(app).get('/shifts').query({ page: 1, limit: 5 });
      expect(res.status).toBe(401);
    });
  });

  // ───── Current shift ───────────────────────────────────────────

  describe('GET /shifts/current', () => {
    it('should return null when no shift is open', async () => {
      const stationId = await getFirstStation(adminToken);
      await closeAllOpenShifts(adminToken, stationId);

      const res = await request(app)
        .get('/shifts/current')
        .query({ stationId })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });

    it('should return the open shift when one exists', async () => {
      const stationId = await getFirstStation(adminToken);
      await closeAllOpenShifts(adminToken, stationId);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 600 + Math.floor(Math.random() * 50));
      const dateStr = futureDate.toISOString().slice(0, 10);

      const openRes = await request(app)
        .post('/shifts/open')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stationId, shiftDate: dateStr, shiftType: 'MORNING' });

      if (openRes.status === 201) {
        const res = await request(app)
          .get('/shifts/current')
          .query({ stationId })
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data).not.toBeNull();
        expect(res.body.data.status).toBe('OPEN');

        // Cleanup
        await closeAllOpenShifts(adminToken, stationId);
      }
    });
  });

  // ───── Shift detail ────────────────────────────────────────────

  describe('GET /shifts/:id', () => {
    it('should return shift details', async () => {
      // Get any closed shift
      const listRes = await request(app)
        .get('/shifts')
        .query({ page: 1, limit: 1, status: 'CLOSED' })
        .set('Authorization', `Bearer ${adminToken}`);

      if (listRes.body.data.length === 0) return; // skip if none

      const shiftId = listRes.body.data[0].id;

      const res = await request(app)
        .get(`/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(shiftId);
      expect(res.body.data.sales).toBeDefined();
      expect(res.body.data.tankDips).toBeDefined();
      expect(res.body.data.station).toBeDefined();
    });

    it('should return 404 for non-existent shift', async () => {
      const res = await request(app)
        .get('/shifts/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ───── Idempotency ─────────────────────────────────────────────

  describe('Idempotency', () => {
    it('should return same result for duplicate close with idempotency key', async () => {
      const stationId = await getFirstStation(adminToken);
      await closeAllOpenShifts(adminToken, stationId);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 700 + Math.floor(Math.random() * 50));
      const dateStr = futureDate.toISOString().slice(0, 10);

      const openRes = await request(app)
        .post('/shifts/open')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stationId, shiftDate: dateStr, shiftType: 'EVENING' });

      if (openRes.status !== 201) return;

      const shift = openRes.body.data;
      const idempotencyKey = `test-idem-${Date.now()}`;

      const sales = shift.sales.map((s: any) => ({
        nozzleId: s.nozzleId,
        closingIndex: Number(s.openingIndex) + 50,
      }));

      const tankDips = shift.tankDips.map((d: any) => ({
        tankId: d.tankId,
        physicalLevel: Number(d.openingLevel) - 10,
      }));

      const priceSnapshot = shift.appliedPriceSnapshot || {};
      let expectedRevenue = 0;
      for (const s of shift.sales) {
        const vol = 50;
        const fuelType = s.nozzle?.pump?.tank?.fuelType;
        const price = priceSnapshot[fuelType] || Number(s.unitPrice);
        expectedRevenue += vol * price;
      }

      // First close
      const res1 = await request(app)
        .post(`/shifts/${shift.id}/close`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          sales,
          tankDips,
          cash: { counted: expectedRevenue, card: 0, expenses: 0 },
          justification: 'Idempotency test — minor stock variance expected',
        });

      expect(res1.status).toBe(200);

      // Second close with same key — should return the same shift, not error
      const res2 = await request(app)
        .post(`/shifts/${shift.id}/close`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          sales,
          tankDips,
          cash: { counted: expectedRevenue, card: 0, expenses: 0 },
          justification: 'Idempotency test — minor stock variance expected',
        });

      expect(res2.status).toBe(200);
      expect(res2.body.data.id).toBe(shift.id);
    });
  });
});

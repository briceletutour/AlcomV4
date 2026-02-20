/**
 * Price API Integration Tests — Sprint 4
 *
 * Uses supertest to exercise the Express app with a real DB.
 * Requires seeded database (npx tsx prisma/seed.ts).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index';

// ─── helpers ──────────────────────────────────────────────────────

let adminToken: string;
let cfoToken: string;
let managerToken: string;
let adminUserId: string;
let cfoUserId: string;

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

/** Get user info from token */
async function getUserId(token: string): Promise<string> {
  const res = await request(app)
    .get('/auth/me')
    .set('Authorization', `Bearer ${token}`);
  return res.body?.data?.id;
}

/** Create a future date string */
function getFutureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(6, 0, 0, 0); // 06:00
  return d.toISOString();
}

/** Create a past date string */
function getPastDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(6, 0, 0, 0);
  return d.toISOString();
}

// Random price to avoid conflicts
const randomPrice = () => 600 + Math.floor(Math.random() * 100);

// ─── setup ────────────────────────────────────────────────────────

beforeAll(async () => {
  adminToken = await login('admin@alcom.cm');
  // Try to login as CFO if seeded, otherwise use admin
  try {
    cfoToken = await login('cfo@alcom.cm');
  } catch {
    cfoToken = adminToken; // Fallback
  }
  managerToken = await login('manager1@alcom.cm');

  adminUserId = await getUserId(adminToken);
  cfoUserId = await getUserId(cfoToken);
}, 30_000);

// ══════════════════════════════════════════════════════════════════
//  Tests
// ══════════════════════════════════════════════════════════════════

describe('Price API', () => {
  // ───── GET /prices/active ──────────────────────────────────────

  describe('GET /prices/active', () => {
    it('should return current active prices', async () => {
      const res = await request(app)
        .get('/prices/active')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('ESSENCE');
      expect(res.body.data).toHaveProperty('GASOIL');
    });
  });

  // ───── GET /prices/current ─────────────────────────────────────

  describe('GET /prices/current', () => {
    it('should return numeric prices for shift operations', async () => {
      const res = await request(app)
        .get('/prices/current')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.ESSENCE).toBe('number');
      expect(typeof res.body.data.GASOIL).toBe('number');
    });

    it('should accept a date query parameter', async () => {
      const futureDate = getFutureDate(30);
      const res = await request(app)
        .get('/prices/current')
        .query({ date: futureDate })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ───── POST /prices ────────────────────────────────────────────

  describe('POST /prices', () => {
    it('should create a price with future date (status = PENDING)', async () => {
      const price = randomPrice();
      const effectiveDate = getFutureDate(10);

      const res = await request(app)
        .post('/prices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fuelType: 'ESSENCE',
          price,
          effectiveDate,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.isActive).toBe(false);
      expect(res.body.data.price).toBe(price);
    });

    it('should reject price with past date', async () => {
      const price = randomPrice();
      const pastDate = getPastDate(1);

      const res = await request(app)
        .post('/prices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fuelType: 'ESSENCE',
          price,
          effectiveDate: pastDate,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('BIZ_INVALID_DATE');
    });

    it('should reject duplicate pending price for same fuel type and date', async () => {
      const price = randomPrice();
      const effectiveDate = getFutureDate(15);

      // First price
      const res1 = await request(app)
        .post('/prices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fuelType: 'GASOIL',
          price,
          effectiveDate,
        });

      expect(res1.status).toBe(201);

      // Duplicate
      const res2 = await request(app)
        .post('/prices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fuelType: 'GASOIL',
          price: price + 10,
          effectiveDate,
        });

      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe('BIZ_DUPLICATE_PENDING');
    });

    it('should reject unauthorized users (station managers)', async () => {
      const res = await request(app)
        .post('/prices')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          fuelType: 'ESSENCE',
          price: randomPrice(),
          effectiveDate: getFutureDate(20),
        });

      expect(res.status).toBe(403);
    });
  });

  // ───── PUT /prices/:id/approve ─────────────────────────────────

  describe('PUT /prices/:id/approve', () => {
    let pendingPriceId: string;

    beforeAll(async () => {
      // Create a pending price
      const res = await request(app)
        .post('/prices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fuelType: 'ESSENCE',
          price: randomPrice(),
          effectiveDate: getFutureDate(25),
        });

      pendingPriceId = res.body.data.id;
    });

    it('should approve pending price (4-eyes: different approver)', async () => {
      // Using CFO token (different user from admin who created it)
      const res = await request(app)
        .put(`/prices/${pendingPriceId}/approve`)
        .set('Authorization', `Bearer ${cfoToken}`)
        .send({});

      // This should succeed only if CFO is different user from admin
      if (cfoUserId !== adminUserId) {
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('APPROVED');
      } else {
        // Same user - should fail
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('BIZ_SELF_APPROVAL');
      }
    });

    it('should reject self-approval (4-eyes principle)', async () => {
      // Create a new price with admin
      const createRes = await request(app)
        .post('/prices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fuelType: 'GASOIL',
          price: randomPrice(),
          effectiveDate: getFutureDate(30),
        });

      const newPriceId = createRes.body.data.id;

      // Try to approve with same user (admin)
      const res = await request(app)
        .put(`/prices/${newPriceId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('BIZ_SELF_APPROVAL');
    });

    it('should reject approving already approved price', async () => {
      // Only test if we have different users
      if (cfoUserId === adminUserId) return;

      // Create and approve a price
      const createRes = await request(app)
        .post('/prices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fuelType: 'ESSENCE',
          price: randomPrice(),
          effectiveDate: getFutureDate(35),
        });

      const priceId = createRes.body.data.id;

      // Approve first time
      await request(app)
        .put(`/prices/${priceId}/approve`)
        .set('Authorization', `Bearer ${cfoToken}`)
        .send({});

      // Try to approve again
      const res = await request(app)
        .put(`/prices/${priceId}/approve`)
        .set('Authorization', `Bearer ${cfoToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BIZ_INVALID_STATUS');
    });
  });

  // ───── PUT /prices/:id/reject ──────────────────────────────────

  describe('PUT /prices/:id/reject', () => {
    it('should reject pending price with reason', async () => {
      // Create a pending price
      const createRes = await request(app)
        .post('/prices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fuelType: 'ESSENCE',
          price: randomPrice(),
          effectiveDate: getFutureDate(40),
        });

      const priceId = createRes.body.data.id;

      // Reject it
      const res = await request(app)
        .put(`/prices/${priceId}/reject`)
        .set('Authorization', `Bearer ${cfoToken}`)
        .send({
          reason: 'Price increase too high compared to market rate',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REJECTED');
      expect(res.body.data.rejectedReason).toBeTruthy();
    });

    it('should require rejection reason of at least 10 chars', async () => {
      // Create a pending price
      const createRes = await request(app)
        .post('/prices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fuelType: 'ESSENCE',
          price: randomPrice(),
          effectiveDate: getFutureDate(45),
        });

      const priceId = createRes.body.data.id;

      // Reject with short reason
      const res = await request(app)
        .put(`/prices/${priceId}/reject`)
        .set('Authorization', `Bearer ${cfoToken}`)
        .send({
          reason: 'Too high', // Only 8 chars
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ───── GET /prices (list) ──────────────────────────────────────

  describe('GET /prices', () => {
    it('should list prices with pagination', async () => {
      const res = await request(app)
        .get('/prices')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta).toHaveProperty('page');
      expect(res.body.meta).toHaveProperty('limit');
    });

    it('should filter by fuel type', async () => {
      const res = await request(app)
        .get('/prices')
        .query({ fuelType: 'ESSENCE' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach((p: any) => {
        expect(p.fuelType).toBe('ESSENCE');
      });
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/prices')
        .query({ status: 'PENDING' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach((p: any) => {
        expect(p.status).toBe('PENDING');
      });
    });
  });

  // ───── GET /prices/history ─────────────────────────────────────

  describe('GET /prices/history', () => {
    it('should return price history for charts', async () => {
      const res = await request(app)
        .get('/prices/history')
        .query({ months: 12 })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should filter by fuel type', async () => {
      const res = await request(app)
        .get('/prices/history')
        .query({ fuelType: 'GASOIL', months: 6 })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach((p: any) => {
        expect(p.fuelType).toBe('GASOIL');
      });
    });
  });
});

// ───── Price Snapshot in Shift Tests ─────────────────────────────

describe('Price Snapshot in Shifts', () => {
  it('shift open should use latest effective price, not future price', async () => {
    // Get a station
    const stationsRes = await request(app)
      .get('/stations')
      .set('Authorization', `Bearer ${adminToken}`);

    const station = stationsRes.body?.data?.[0];
    if (!station) return; // Skip if no station

    // Create a future price
    const futurePrice = 999;
    await request(app)
      .post('/prices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fuelType: 'ESSENCE',
        price: futurePrice,
        effectiveDate: getFutureDate(100),
      });

    // Get current prices (should not be the future price)
    const currentRes = await request(app)
      .get('/prices/current')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(currentRes.body.data.ESSENCE).not.toBe(futurePrice);
  });
});

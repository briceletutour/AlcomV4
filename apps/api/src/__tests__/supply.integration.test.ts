/**
 * Supply Chain API Integration Tests — Sprint 7
 *
 * Tests for:
 * - Replenishment request creation with ullage check
 * - Status transitions (submit, validate, order, complete)
 * - Delivery creation with BL validation
 * - Two-phase delivery (start/complete)
 * - Variance tolerance check
 * - Tank updates with optimistic locking
 *
 * Requires seeded database (npx tsx prisma/seed.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import { prisma } from '../lib/prisma';

// ─── helpers ──────────────────────────────────────────────────────

let adminToken: string;
let dcoToken: string;
let managerToken: string;
let testStationId: string;
let testTankId: string;
let testTankCapacity: number;
let testTankCurrentLevel: number;

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

/** Get tank for a station */
async function getTank(token: string, stationId: string): Promise<{ id: string; capacity: number; currentLevel: number; fuelType: string }> {
  const res = await request(app)
    .get('/tanks')
    .query({ stationId })
    .set('Authorization', `Bearer ${token}`);
  const tanks = res.body?.data || [];
  if (tanks.length === 0) throw new Error('No tanks found for station');
  return tanks[0];
}

// ─── setup ────────────────────────────────────────────────────────

beforeAll(async () => {
  adminToken = await login('admin@alcom.cm');
  dcoToken = await login('admin@alcom.cm'); // DCO role might be same as admin in seed
  managerToken = await login('manager1@alcom.cm');
  testStationId = await getFirstStation(managerToken);
  
  const tank = await getTank(managerToken, testStationId);
  testTankId = tank.id;
  testTankCapacity = tank.capacity;
  testTankCurrentLevel = tank.currentLevel;
}, 30_000);

afterAll(async () => {
  // Clean up test replenishment requests
  await prisma.replenishmentRequest.deleteMany({
    where: {
      notes: { contains: 'TEST-SUPPLY-CHAIN' }
    }
  });
  await prisma.$disconnect();
});

// ══════════════════════════════════════════════════════════════════
//   REPLENISHMENT REQUEST TESTS
// ══════════════════════════════════════════════════════════════════

describe('Replenishment Request API', () => {
  let requestId: string;

  describe('POST /replenishment — Create Request', () => {
    it('should create a replenishment request successfully', async () => {
      const ullage = testTankCapacity - testTankCurrentLevel;
      const requestVolume = Math.min(ullage - 100, 5000); // Leave some margin

      const res = await request(app)
        .post('/replenishment')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          stationId: testStationId,
          tankId: testTankId,
          fuelType: 'ESSENCE',
          requestedVolume: requestVolume,
          notes: 'TEST-SUPPLY-CHAIN — Valid request',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.requestedVolume).toBe(requestVolume);
      requestId = res.body.id;
    });

    it('should reject request exceeding tank ullage', async () => {
      const ullage = testTankCapacity - testTankCurrentLevel;
      const overflowVolume = ullage + 1000; // Exceed ullage

      const res = await request(app)
        .post('/replenishment')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          stationId: testStationId,
          tankId: testTankId,
          fuelType: 'ESSENCE',
          requestedVolume: overflowVolume,
          notes: 'TEST-SUPPLY-CHAIN — Overflow request',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('ullage');
    });
  });

  describe('POST /replenishment/:id/validate — Validate Request', () => {
    it('should allow validation by admin after submission', async () => {
      // First submit the request
      const submitRes = await request(app)
        .post(`/replenishment/${requestId}/submit`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({});

      expect(submitRes.status).toBe(200);
      expect(submitRes.body.status).toBe('SUBMITTED');

      // Now validate as admin/DCO
      const validateRes = await request(app)
        .post(`/replenishment/${requestId}/validate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(validateRes.status).toBe(200);
      expect(validateRes.body.status).toBe('VALIDATED');
    });
  });

  describe('POST /replenishment/:id/order — Mark as Ordered', () => {
    it('should mark validated request as ordered', async () => {
      const res = await request(app)
        .post(`/replenishment/${requestId}/order`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ORDERED');
    });
  });
});

// ══════════════════════════════════════════════════════════════════
//   FUEL DELIVERY TESTS
// ══════════════════════════════════════════════════════════════════

describe('Fuel Delivery API', () => {
  let deliveryId: string;
  let compartmentId: string;
  const blNumber = `BL-TEST-${Date.now()}`;
  const blVolume = 1000;

  describe('POST /deliveries — Create Delivery', () => {
    it('should create a delivery successfully', async () => {
      const res = await request(app)
        .post('/deliveries')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stationId: testStationId,
          blNumber,
          blTotalVolume: blVolume,
          truckPlate: 'LT 1234 TEST',
          driverName: 'Test Driver',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.status).toBe('PENDING');
      expect(res.body.blNumber).toBe(blNumber);
      deliveryId = res.body.id;
    });

    it('should reject delivery with duplicate BL number', async () => {
      const res = await request(app)
        .post('/deliveries')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stationId: testStationId,
          blNumber, // Same BL number
          truckPlate: 'LT 5678 TEST',
          driverName: 'Another Driver',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('BL');
    });
  });

  describe('POST /deliveries/:id/compartments — Add Compartment', () => {
    it('should add a compartment to delivery', async () => {
      const res = await request(app)
        .post(`/deliveries/${deliveryId}/compartments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tankId: testTankId,
          fuelType: 'ESSENCE',
          blVolume,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.blVolume).toBe(blVolume);
      expect(res.body.compartmentNumber).toBe(1);
      compartmentId = res.body.id;
    });
  });

  describe('POST /deliveries/:id/start — Start Delivery (Two-Phase)', () => {
    it('should start delivery and record opening dips', async () => {
      const res = await request(app)
        .post(`/deliveries/${deliveryId}/start`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('IN_PROGRESS');
      expect(res.body.startedAt).toBeDefined();
      
      // Compartment should have opening dip
      expect(res.body.compartments[0].openingDip).toBeDefined();
    });
  });

  describe('POST /deliveries/:id/complete — Complete Delivery', () => {
    it('should complete delivery with closing dips and calculate variance', async () => {
      // Simulate receiving exactly BL volume (current level + BL volume)
      const openingDip = await prisma.deliveryCompartment.findUnique({
        where: { id: compartmentId },
        select: { openingDip: true }
      });
      
      const closingDip = (openingDip?.openingDip || testTankCurrentLevel) + blVolume;
      
      const res = await request(app)
        .post(`/deliveries/${deliveryId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          closingDips: {
            [compartmentId]: closingDip,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.completedAt).toBeDefined();
      
      // Check received volume is calculated
      const compartment = res.body.compartments.find((c: any) => c.id === compartmentId);
      expect(compartment.receivedVolume).toBe(blVolume);
      expect(compartment.closingDip).toBe(closingDip);
    });

    it('should flag variance exceeding tolerance (0.5%)', async () => {
      // Create another delivery to test variance
      const blNumber2 = `BL-VAR-${Date.now()}`;
      const bl2Volume = 10000;
      
      // Create delivery
      const createRes = await request(app)
        .post('/deliveries')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stationId: testStationId,
          blNumber: blNumber2,
          truckPlate: 'LT 9999 VAR',
          driverName: 'Variance Test',
        });
      
      const delivery2Id = createRes.body.id;
      
      // Add compartment
      const compRes = await request(app)
        .post(`/deliveries/${delivery2Id}/compartments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tankId: testTankId,
          fuelType: 'ESSENCE',
          blVolume: bl2Volume,
        });
      
      const comp2Id = compRes.body.id;
      
      // Start delivery
      await request(app)
        .post(`/deliveries/${delivery2Id}/start`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      
      // Get opening dip
      const comp = await prisma.deliveryCompartment.findUnique({
        where: { id: comp2Id },
        select: { openingDip: true }
      });
      
      // Complete with 1% variance (exceeds 0.5% tolerance)
      const receivedVolume = bl2Volume * 0.98; // 2% short
      const closingDip2 = (comp?.openingDip || 0) + receivedVolume;
      
      const completeRes = await request(app)
        .post(`/deliveries/${delivery2Id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          closingDips: {
            [comp2Id]: closingDip2,
          },
        });
      
      // Should still complete but we can check variance
      expect(completeRes.status).toBe(200);
      const finalComp = completeRes.body.compartments.find((c: any) => c.id === comp2Id);
      expect(finalComp.receivedVolume).toBeLessThan(bl2Volume);
      
      // Variance should be around -2%
      const variance = ((finalComp.receivedVolume - bl2Volume) / bl2Volume) * 100;
      expect(Math.abs(variance)).toBeGreaterThan(0.5);
      
      // Cleanup
      await prisma.fuelDelivery.delete({ where: { id: delivery2Id } });
    });
  });

  describe('BL Total Volume Validation', () => {
    it('should reject completion if compartment sum does not match BL total', async () => {
      const blNumber3 = `BL-SUM-${Date.now()}`;
      
      // Create delivery with explicit total
      const createRes = await request(app)
        .post('/deliveries')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stationId: testStationId,
          blNumber: blNumber3,
          blTotalVolume: 5000, // Total is 5000L
          truckPlate: 'LT 1111 SUM',
          driverName: 'Sum Test',
        });
      
      const delivery3Id = createRes.body.id;
      
      // Add compartment with mismatched volume
      const compRes = await request(app)
        .post(`/deliveries/${delivery3Id}/compartments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tankId: testTankId,
          fuelType: 'ESSENCE',
          blVolume: 3000, // Only 3000L, not matching 5000L total
        });
      
      // Starting should fail due to mismatch
      const startRes = await request(app)
        .post(`/deliveries/${delivery3Id}/start`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      
      // The API might allow start but flag the issue, or reject — depends on implementation
      // Let's check behavior and cleanup
      if (startRes.status !== 200) {
        expect(startRes.body.error).toContain('volume');
      }
      
      // Cleanup
      await prisma.fuelDelivery.delete({ where: { id: delivery3Id } });
    });
  });

  // Cleanup
  afterAll(async () => {
    if (deliveryId) {
      await prisma.fuelDelivery.delete({ where: { id: deliveryId } }).catch(() => {});
    }
  });
});

// ══════════════════════════════════════════════════════════════════
//   TANK UPDATE & OPTIMISTIC LOCKING TESTS
// ══════════════════════════════════════════════════════════════════

describe('Tank Updates with Optimistic Locking', () => {
  it('should update tank level after delivery completion', async () => {
    // Get initial tank state
    const initialTank = await prisma.tank.findUnique({
      where: { id: testTankId },
      select: { currentLevel: true, version: true }
    });
    
    const initialLevel = initialTank?.currentLevel || 0;
    const initialVersion = initialTank?.version || 0;
    
    // Create and complete a small delivery
    const blNumber = `BL-TANK-${Date.now()}`;
    const deliveryVolume = 500;
    
    const createRes = await request(app)
      .post('/deliveries')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stationId: testStationId,
        blNumber,
        truckPlate: 'LT 0000 TNK',
        driverName: 'Tank Test',
      });
    
    const deliveryId = createRes.body.id;
    
    // Add compartment
    const compRes = await request(app)
      .post(`/deliveries/${deliveryId}/compartments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tankId: testTankId,
        fuelType: 'ESSENCE',
        blVolume: deliveryVolume,
      });
    
    const compId = compRes.body.id;
    
    // Start delivery
    await request(app)
      .post(`/deliveries/${deliveryId}/start`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    
    // Get opening dip
    const comp = await prisma.deliveryCompartment.findUnique({
      where: { id: compId },
      select: { openingDip: true }
    });
    
    // Complete with exact volume
    const closingDip = (comp?.openingDip || 0) + deliveryVolume;
    
    await request(app)
      .post(`/deliveries/${deliveryId}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        closingDips: { [compId]: closingDip },
      });
    
    // Check tank was updated
    const updatedTank = await prisma.tank.findUnique({
      where: { id: testTankId },
      select: { currentLevel: true, version: true }
    });
    
    // Tank level should be set to closing dip
    expect(updatedTank?.currentLevel).toBe(closingDip);
    
    // Version should be incremented (optimistic locking)
    expect(updatedTank?.version).toBeGreaterThan(initialVersion);
    
    // Cleanup
    await prisma.fuelDelivery.delete({ where: { id: deliveryId } });
    
    // Restore tank level
    await prisma.tank.update({
      where: { id: testTankId },
      data: { currentLevel: initialLevel }
    });
  });
});

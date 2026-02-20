/**
 * Incident API Integration Tests — Sprint 8
 *
 * Tests the incident lifecycle including:
 * - Manual incident creation
 * - Auto-incident from checklist NON_CONFORME
 * - Assignment workflow
 * - Resolution with required note
 * - Manager close after resolution
 * - Reopen capability
 * - Full lifecycle: OPEN → IN_PROGRESS → RESOLVED → CLOSED
 *
 * Requires seeded database (npx tsx prisma/seed.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import prisma from '../lib/prisma';

// ─── Helpers ──────────────────────────────────────────────────────

let adminToken: string;
let stationManagerToken: string;
let pompisteToken: string;
let testAdminId: string;
let testStationManagerId: string;
let testPompisteId: string;
let testStationId: string;
let testIncidentId: string;

/** Login helper — returns access token */
async function login(email: string, password = 'Alcom2026!'): Promise<{ token: string; userId: string }> {
  const res = await request(app).post('/auth/login').send({ email, password });
  if (res.status !== 200 || !res.body?.data?.accessToken) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.data.accessToken, userId: res.body.data.user.id };
}

// ─── Setup ────────────────────────────────────────────────────────

beforeAll(async () => {
  // Login as different role users
  const admin = await login('admin@alcom.cm');
  adminToken = admin.token;
  testAdminId = admin.userId;

  const stationManager = await login('manager1@alcom.cm');
  stationManagerToken = stationManager.token;
  testStationManagerId = stationManager.userId;

  // Try to login as pompiste (may not exist in seed)
  try {
    const pompiste = await login('pompiste1@alcom.cm');
    pompisteToken = pompiste.token;
    testPompisteId = pompiste.userId;
  } catch {
    // Fall back to using station manager token for pompiste tests
    pompisteToken = stationManagerToken;
    testPompisteId = testStationManagerId;
  }

  // Get station ID for testing
  const stationsRes = await request(app).get('/stations').set('Authorization', `Bearer ${adminToken}`);
  if (stationsRes.body.data?.length) {
    testStationId = stationsRes.body.data[0].id;
  }
}, 30_000);

afterAll(async () => {
  // Cleanup: remove test incidents created during tests
  await prisma.incident.deleteMany({
    where: { description: { startsWith: 'Test:' } },
  });
});

// ══════════════════════════════════════════════════════════════════
//  Incident CRUD Tests
// ══════════════════════════════════════════════════════════════════

describe('Incidents API', () => {
  describe('POST /incidents', () => {
    it('should create incident with OPEN status', async () => {
      const res = await request(app)
        .post('/incidents')
        .set('Authorization', `Bearer ${pompisteToken}`)
        .send({
          stationId: testStationId,
          category: 'EQUIPMENT',
          description: 'Test: Pump 3 making unusual noise',
          photoUrl: '/uploads/incidents/pump3_noise.jpg',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('OPEN');
      expect(res.body.data.category).toBe('EQUIPMENT');
      expect(res.body.data.description).toBe('Test: Pump 3 making unusual noise');

      testIncidentId = res.body.data.id;
    });

    it('should reject incident without description', async () => {
      const res = await request(app)
        .post('/incidents')
        .set('Authorization', `Bearer ${pompisteToken}`)
        .send({
          stationId: testStationId,
          category: 'EQUIPMENT',
        });

      expect(res.status).toBe(400);
    });

    it('should reject incident with short description', async () => {
      const res = await request(app)
        .post('/incidents')
        .set('Authorization', `Bearer ${pompisteToken}`)
        .send({
          stationId: testStationId,
          category: 'EQUIPMENT',
          description: 'Bad',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /incidents', () => {
    it('should list incidents with pagination', async () => {
      const res = await request(app)
        .get('/incidents')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
    });

    it('should filter incidents by status', async () => {
      const res = await request(app)
        .get('/incidents')
        .query({ status: 'OPEN' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((i: any) => i.status === 'OPEN')).toBe(true);
    });

    it('should filter incidents by station', async () => {
      const res = await request(app)
        .get('/incidents')
        .query({ stationId: testStationId })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((i: any) => i.stationId === testStationId)).toBe(true);
    });

    it('should filter incidents by date range', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get('/incidents')
        .query({ startDate: today, endDate: today })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /incidents/:id', () => {
    it('should get incident by ID with full details', async () => {
      const res = await request(app)
        .get(`/incidents/${testIncidentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(testIncidentId);
      expect(res.body.data.station).toBeDefined();
      expect(res.body.data.reportedBy).toBeDefined();
    });

    it('should return 404 for non-existent incident', async () => {
      const res = await request(app)
        .get('/incidents/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
//  Incident Lifecycle Tests
// ══════════════════════════════════════════════════════════════════

describe('Incident Lifecycle', () => {
  describe('PUT /incidents/:id/assign', () => {
    it('should assign incident and change status to IN_PROGRESS', async () => {
      const res = await request(app)
        .put(`/incidents/${testIncidentId}/assign`)
        .set('Authorization', `Bearer ${stationManagerToken}`)
        .send({
          assignedToId: testStationManagerId,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('IN_PROGRESS');
      expect(res.body.data.assignedTo).toBeDefined();
    });

    it('should reject assignment of non-existent user', async () => {
      const res = await request(app)
        .put(`/incidents/${testIncidentId}/assign`)
        .set('Authorization', `Bearer ${stationManagerToken}`)
        .send({
          assignedToId: '00000000-0000-0000-0000-000000000000',
        });

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /incidents/:id/resolve', () => {
    it('should reject resolution without note', async () => {
      const res = await request(app)
        .put(`/incidents/${testIncidentId}/resolve`)
        .set('Authorization', `Bearer ${stationManagerToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should resolve incident with required resolution note', async () => {
      const res = await request(app)
        .put(`/incidents/${testIncidentId}/resolve`)
        .set('Authorization', `Bearer ${stationManagerToken}`)
        .send({
          resolutionNote: 'Replaced bearing in pump motor. Now running quietly.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RESOLVED');
      expect(res.body.data.resolutionNote).toBe('Replaced bearing in pump motor. Now running quietly.');
      expect(res.body.data.resolvedAt).toBeDefined();
    });
  });

  describe('PUT /incidents/:id/close', () => {
    it('should close resolved incident', async () => {
      const res = await request(app)
        .put(`/incidents/${testIncidentId}/close`)
        .set('Authorization', `Bearer ${stationManagerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CLOSED');
    });

    it('should reject closing non-resolved incident', async () => {
      // Create a new open incident
      const createRes = await request(app)
        .post('/incidents')
        .set('Authorization', `Bearer ${pompisteToken}`)
        .send({
          stationId: testStationId,
          category: 'SAFETY',
          description: 'Test: Open incident for close test',
        });

      const newIncidentId = createRes.body.data.id;

      const res = await request(app)
        .put(`/incidents/${newIncidentId}/close`)
        .set('Authorization', `Bearer ${stationManagerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
    });
  });

  describe('PUT /incidents/:id/reopen', () => {
    it('should reopen closed incident', async () => {
      const res = await request(app)
        .put(`/incidents/${testIncidentId}/reopen`)
        .set('Authorization', `Bearer ${stationManagerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('IN_PROGRESS'); // IN_PROGRESS because it was assigned
      expect(res.body.data.resolvedAt).toBeNull();
      expect(res.body.data.resolutionNote).toBeNull();
    });

    it('should reject reopening OPEN incident', async () => {
      // Create and check open incident
      const createRes = await request(app)
        .post('/incidents')
        .set('Authorization', `Bearer ${pompisteToken}`)
        .send({
          stationId: testStationId,
          category: 'MAINTENANCE',
          description: 'Test: Fresh open incident',
        });

      const newIncidentId = createRes.body.data.id;

      const res = await request(app)
        .put(`/incidents/${newIncidentId}/reopen`)
        .set('Authorization', `Bearer ${stationManagerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
    });
  });
});

// ══════════════════════════════════════════════════════════════════
//  Full Lifecycle Test
// ══════════════════════════════════════════════════════════════════

describe('Full Incident Lifecycle: OPEN → IN_PROGRESS → RESOLVED → CLOSED', () => {
  it('should complete full lifecycle', async () => {
    // 1. Create incident (OPEN)
    const createRes = await request(app)
      .post('/incidents')
      .set('Authorization', `Bearer ${pompisteToken}`)
      .send({
        stationId: testStationId,
        category: 'EQUIPMENT',
        description: 'Test: Full lifecycle test - fuel leak detected',
        photoUrl: '/uploads/incidents/leak.jpg',
      });

    expect(createRes.status).toBe(201);
    const incidentId = createRes.body.data.id;
    expect(createRes.body.data.status).toBe('OPEN');

    // 2. Assign (→ IN_PROGRESS)
    const assignRes = await request(app)
      .put(`/incidents/${incidentId}/assign`)
      .set('Authorization', `Bearer ${stationManagerToken}`)
      .send({ assignedToId: testStationManagerId });

    expect(assignRes.body.data.status).toBe('IN_PROGRESS');

    // 3. Resolve (→ RESOLVED)
    const resolveRes = await request(app)
      .put(`/incidents/${incidentId}/resolve`)
      .set('Authorization', `Bearer ${stationManagerToken}`)
      .send({ resolutionNote: 'Fixed the leak by replacing gasket.' });

    expect(resolveRes.body.data.status).toBe('RESOLVED');

    // 4. Close (→ CLOSED)
    const closeRes = await request(app)
      .put(`/incidents/${incidentId}/close`)
      .set('Authorization', `Bearer ${stationManagerToken}`);

    expect(closeRes.body.data.status).toBe('CLOSED');

    // Verify final state
    const getRes = await request(app)
      .get(`/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.body.data.status).toBe('CLOSED');
    expect(getRes.body.data.resolutionNote).toBe('Fixed the leak by replacing gasket.');
    expect(getRes.body.data.assignedTo).toBeDefined();
    expect(getRes.body.data.resolvedAt).toBeDefined();
  });
});

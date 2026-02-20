/**
 * Checklist API Integration Tests — Sprint 8
 *
 * Tests the checklist submission workflow including:
 * - Checklist template CRUD operations
 * - Checklist submission with score calculation
 * - NON_CONFORME without photo → error
 * - Auto-incident creation for NON_CONFORME items
 * - Duplicate submission prevention
 * - Validation/rejection workflow
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
let testStationId: string;
let testTemplateId: string;

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

  const stationManager = await login('manager1@alcom.cm');
  stationManagerToken = stationManager.token;

  // Try to login as pompiste (may not exist in seed)
  try {
    const pompiste = await login('pompiste1@alcom.cm');
    pompisteToken = pompiste.token;
  } catch {
    // Fall back to using station manager token for pompiste tests
    pompisteToken = stationManagerToken;
  }

  // Get station ID for testing
  const stationsRes = await request(app).get('/stations').set('Authorization', `Bearer ${adminToken}`);
  if (stationsRes.body.data?.length) {
    testStationId = stationsRes.body.data[0].id;
  }
}, 30_000);

afterAll(async () => {
  // Cleanup: remove test templates and dependent submissions/incidents created during tests
  const testTemplates = await prisma.checklistTemplate.findMany({
    where: { name: { startsWith: 'Test Template' } },
    select: { id: true },
  });

  const templateIds = testTemplates.map((t) => t.id);

  if (templateIds.length > 0) {
    await prisma.incident.deleteMany({
      where: { checklistSubmission: { templateId: { in: templateIds } } },
    });

    await prisma.checklistSubmission.deleteMany({
      where: { templateId: { in: templateIds } },
    });

    await prisma.checklistTemplate.deleteMany({
      where: { id: { in: templateIds } },
    });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Checklist Template Tests
// ══════════════════════════════════════════════════════════════════

describe('Checklist Templates API', () => {
  describe('POST /checklist-templates', () => {
    it('should create a new checklist template', async () => {
      const res = await request(app)
        .post('/checklist-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Template Station Checklist',
          categories: [
            {
              name: 'SAFETY',
              items: [
                { id: 's1', label: 'Fire Extinguishers OK', labelFr: 'Extincteurs OK' },
                { id: 's2', label: 'Emergency exits clear', labelFr: 'Sorties de secours dégagées' },
              ],
            },
            {
              name: 'BRANDING',
              items: [
                { id: 'b1', label: 'Signage visible', labelFr: 'Signalétique visible' },
              ],
            },
          ],
        });

      testTemplateId = res.body.data?.id;

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Template Station Checklist');
      expect(res.body.data.version).toBeGreaterThanOrEqual(1);
      expect(res.body.data.isActive).toBe(true);
      expect(res.body.data.categories).toHaveLength(2);
      expect(testTemplateId).toBeTruthy();
    });

    it('should reject template without categories', async () => {
      const res = await request(app)
        .post('/checklist-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Empty Template',
          categories: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject template with empty items in category', async () => {
      const res = await request(app)
        .post('/checklist-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Bad Template',
          categories: [
            {
              name: 'EMPTY',
              items: [],
            },
          ],
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /checklist-templates', () => {
    it('should list active templates', async () => {
      const res = await request(app)
        .get('/checklist-templates')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.total).toBeGreaterThan(0);
    });

    it('should get template by ID', async () => {
      const res = await request(app)
        .get(`/checklist-templates/${testTemplateId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(testTemplateId);
    });
  });

  describe('PUT /checklist-templates/:id', () => {
    it('should create new version when updating template', async () => {
      const previousTemplateId = testTemplateId;

      const res = await request(app)
        .put(`/checklist-templates/${previousTemplateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Template Station Checklist',
          categories: [
            {
              name: 'SAFETY',
              items: [
                { id: 's1', label: 'Fire Extinguishers OK', labelFr: 'Extincteurs OK' },
                { id: 's2', label: 'Emergency exits clear', labelFr: 'Sorties de secours dégagées' },
                { id: 's3', label: 'First aid kit available', labelFr: 'Trousse de secours disponible' },
              ],
            },
          ],
        });

      // Update testTemplateId to new version for further tests
      testTemplateId = res.body.data?.id;

      expect(res.status).toBe(200);
      expect(res.body.data.version).toBeGreaterThan(1);
      expect(res.body.data.isActive).toBe(true);
      expect(testTemplateId).toBeTruthy();

      // Old template should be deactivated
      const oldRes = await request(app)
        .get(`/checklist-templates/${previousTemplateId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(oldRes.body.data.isActive).toBe(false);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
//  Checklist Submission Tests
// ══════════════════════════════════════════════════════════════════

describe('Checklists API', () => {
  const today = new Date().toISOString().split('T')[0];

  describe('POST /checklists', () => {
    it('should submit checklist with all CONFORME items → score 100%', async () => {
      const res = await request(app)
        .post('/checklists')
        .set('Authorization', `Bearer ${pompisteToken}`)
        .send({
          stationId: testStationId,
          templateId: testTemplateId,
          shiftDate: today,
          shiftType: 'MORNING',
          items: [
            { itemId: 's1', status: 'CONFORME' },
            { itemId: 's2', status: 'CONFORME' },
            { itemId: 's3', status: 'CONFORME' },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.computedScore).toBe(100);
      expect(res.body.data.status).toBe('PENDING_VALIDATION');
      expect(res.body.data.incidentsCreated).toBe(0);
    });

    it('should reject NON_CONFORME without photo', async () => {
      const res = await request(app)
        .post('/checklists')
        .set('Authorization', `Bearer ${pompisteToken}`)
        .send({
          stationId: testStationId,
          templateId: testTemplateId,
          shiftDate: today,
          shiftType: 'EVENING',
          items: [
            { itemId: 's1', status: 'CONFORME' },
            { itemId: 's2', status: 'NON_CONFORME', comment: 'Door blocked' },
            { itemId: 's3', status: 'CONFORME' },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EVIDENCE_REQUIRED');
      expect(res.body.error.details.itemsWithoutPhoto).toContain('s2');
    });

    it('should create incident for NON_CONFORME with photo', async () => {
      const res = await request(app)
        .post('/checklists')
        .set('Authorization', `Bearer ${pompisteToken}`)
        .send({
          stationId: testStationId,
          templateId: testTemplateId,
          shiftDate: today,
          shiftType: 'EVENING',
          items: [
            { itemId: 's1', status: 'CONFORME' },
            { itemId: 's2', status: 'NON_CONFORME', comment: 'Door blocked', photoUrl: '/uploads/evidence/s2.jpg' },
            { itemId: 's3', status: 'CONFORME' },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.computedScore).toBe(67); // 2/3 = 66.67% rounded to 67%
      expect(res.body.data.incidentsCreated).toBe(1);
      expect(res.body.data.incidents).toHaveLength(1);
    });

    it('should reject duplicate checklist for same station/shift/day', async () => {
      const res = await request(app)
        .post('/checklists')
        .set('Authorization', `Bearer ${pompisteToken}`)
        .send({
          stationId: testStationId,
          templateId: testTemplateId,
          shiftDate: today,
          shiftType: 'MORNING', // Same as first submission
          items: [
            { itemId: 's1', status: 'CONFORME' },
            { itemId: 's2', status: 'CONFORME' },
            { itemId: 's3', status: 'CONFORME' },
          ],
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_SUBMISSION');
    });
  });

  describe('GET /checklists', () => {
    it('should list checklists with filters', async () => {
      const res = await request(app)
        .get('/checklists')
        .query({ stationId: testStationId, status: 'PENDING_VALIDATION' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('PUT /checklists/:id/validate', () => {
    it('should validate checklist → status VALIDATED', async () => {
      // Get the first pending checklist
      const listRes = await request(app)
        .get('/checklists')
        .query({ stationId: testStationId, status: 'PENDING_VALIDATION' })
        .set('Authorization', `Bearer ${adminToken}`);

      const checklistId = listRes.body.data[0]?.id;
      if (!checklistId) {
        // Skip if no checklist found
        return;
      }

      const res = await request(app)
        .put(`/checklists/${checklistId}/validate`)
        .set('Authorization', `Bearer ${stationManagerToken}`)
        .send({
          action: 'approve',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('VALIDATED');
    });

    it('should reject checklist with comment → status REJECTED', async () => {
      // Create a new checklist to reject
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const submitRes = await request(app)
        .post('/checklists')
        .set('Authorization', `Bearer ${pompisteToken}`)
        .send({
          stationId: testStationId,
          templateId: testTemplateId,
          shiftDate: tomorrowStr,
          shiftType: 'MORNING',
          items: [
            { itemId: 's1', status: 'CONFORME' },
            { itemId: 's2', status: 'CONFORME' },
            { itemId: 's3', status: 'CONFORME' },
          ],
        });

      const checklistId = submitRes.body.data?.id;
      if (!checklistId) return;

      const res = await request(app)
        .put(`/checklists/${checklistId}/validate`)
        .set('Authorization', `Bearer ${stationManagerToken}`)
        .send({
          action: 'reject',
          comment: 'Incomplete inspection, missing areas',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REJECTED');
    });

    it('should require a rejection comment when rejecting checklist', async () => {
      // Create a new checklist to reject without comment
      const nextDay = new Date();
      nextDay.setDate(nextDay.getDate() + 2);
      const nextDayStr = nextDay.toISOString().split('T')[0];

      const submitRes = await request(app)
        .post('/checklists')
        .set('Authorization', `Bearer ${pompisteToken}`)
        .send({
          stationId: testStationId,
          templateId: testTemplateId,
          shiftDate: nextDayStr,
          shiftType: 'MORNING',
          items: [
            { itemId: 's1', status: 'CONFORME' },
            { itemId: 's2', status: 'CONFORME' },
            { itemId: 's3', status: 'CONFORME' },
          ],
        });

      const checklistId = submitRes.body.data?.id;
      if (!checklistId) return;

      const res = await request(app)
        .put(`/checklists/${checklistId}/validate`)
        .set('Authorization', `Bearer ${stationManagerToken}`)
        .send({
          action: 'reject',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should allow resubmission after rejection', async () => {
      // Find a rejected checklist
      const listRes = await request(app)
        .get('/checklists')
        .query({ status: 'REJECTED' })
        .set('Authorization', `Bearer ${adminToken}`);

      const rejectedChecklist = listRes.body.data[0];
      if (!rejectedChecklist) return;

      // Resubmit for same station/date/shift
      const res = await request(app)
        .post('/checklists')
        .set('Authorization', `Bearer ${pompisteToken}`)
        .send({
          stationId: rejectedChecklist.stationId,
          templateId: testTemplateId,
          shiftDate: rejectedChecklist.shiftDate.split('T')[0],
          shiftType: rejectedChecklist.shiftType,
          items: [
            { itemId: 's1', status: 'CONFORME' },
            { itemId: 's2', status: 'CONFORME' },
            { itemId: 's3', status: 'CONFORME' },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING_VALIDATION');
    });
  });
});

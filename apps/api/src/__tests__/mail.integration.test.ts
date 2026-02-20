/**
 * Incoming Mail API Integration Tests — Sprint 9
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import prisma from '../lib/prisma';

let adminToken: string;
let managerToken: string;
let managerUserId: string;
let createdMailId: string;

async function login(email: string, password = 'Alcom2026!'): Promise<{ token: string; userId: string }> {
  const res = await request(app).post('/auth/login').send({ email, password });
  if (res.status !== 200 || !res.body?.data?.accessToken) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return {
    token: res.body.data.accessToken,
    userId: res.body.data.user.id,
  };
}

beforeAll(async () => {
  const admin = await login('admin@alcom.cm');
  adminToken = admin.token;

  const manager = await login('manager1@alcom.cm');
  managerToken = manager.token;
  managerUserId = manager.userId;
}, 30_000);

afterAll(async () => {
  await prisma.incomingMail.deleteMany({
    where: {
      subject: { startsWith: 'Test Mail:' },
    },
  });
});

describe('Incoming Mail API', () => {
  it('should create normal mail with deadline +5 days', async () => {
    const nowIso = new Date().toISOString();

    const res = await request(app)
      .post('/mails')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sender: 'SCDP',
        subject: 'Test Mail: Normal deadline',
        receivedAt: nowIso,
        priority: 'NORMAL',
        recipientDepartment: 'Finance',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.priority).toBe('NORMAL');

    const receivedAt = new Date(res.body.data.receivedAt).getTime();
    const deadline = new Date(res.body.data.deadline).getTime();
    const diffHours = (deadline - receivedAt) / (1000 * 60 * 60);

    // allow minor timezone/serialization drift
    expect(diffHours).toBeGreaterThanOrEqual(119.9);
    expect(diffHours).toBeLessThanOrEqual(120.1);

    createdMailId = res.body.data.id;
  });

  it('should create urgent mail with deadline +24h', async () => {
    const nowIso = new Date().toISOString();

    const res = await request(app)
      .post('/mails')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sender: 'MINFI',
        subject: 'Test Mail: Urgent deadline',
        receivedAt: nowIso,
        priority: 'URGENT',
        recipientDepartment: 'Direction',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.priority).toBe('URGENT');

    const receivedAt = new Date(res.body.data.receivedAt).getTime();
    const deadline = new Date(res.body.data.deadline).getTime();
    const diffHours = (deadline - receivedAt) / (1000 * 60 * 60);

    expect(diffHours).toBeGreaterThanOrEqual(23.9);
    expect(diffHours).toBeLessThanOrEqual(24.1);
  });

  it('should assign mail and update status to IN_PROGRESS', async () => {
    const res = await request(app)
      .put(`/mails/${createdMailId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignedToId: managerUserId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.assignedToId).toBe(managerUserId);
    expect(res.body.data.status).toBe('IN_PROGRESS');
  });

  it('should detect overdue SLA for expired mail', async () => {
    // received 7 days ago => NORMAL deadline was 2 days ago
    const oldDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const createRes = await request(app)
      .post('/mails')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sender: 'Prefecture',
        subject: 'Test Mail: Overdue check',
        receivedAt: oldDate,
        priority: 'NORMAL',
        recipientDepartment: 'Administration',
      });

    expect(createRes.status).toBe(201);
    const id = createRes.body.data.id;

    const getRes = await request(app)
      .get(`/mails/${id}`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.slaState).toBe('OVERDUE');
  });

  it('should mark mail as responded', async () => {
    const res = await request(app)
      .put(`/mails/${createdMailId}/respond`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ note: 'Response sent by email and phone.' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('RESPONDED');
  });

  it('should archive mail', async () => {
    const res = await request(app)
      .put(`/mails/${createdMailId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ARCHIVED');
  });
});

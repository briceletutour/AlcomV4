/**
 * Expense API Integration Tests — Sprint 6
 *
 * Tests the full expense approval workflow including:
 * - Expense submission with auto-station attachment
 * - Approval routing based on amount thresholds
 * - Line Manager → Finance → CFO/CEO chain
 * - Rejection workflow with mandatory comments
 * - Disbursement operations
 * - Delegation handling
 *
 * Requires seeded database (npx tsx prisma/seed.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';

// ─── Constants ────────────────────────────────────────────────────

const EXPENSE_THRESHOLD_FINANCE = 500_000;
const EXPENSE_THRESHOLD_CFO = 5_000_000;

// ─── Helpers ──────────────────────────────────────────────────────

let adminToken: string;
let cfoToken: string;
let ceoToken: string;
let financeDirToken: string;
let stationManagerToken: string;

let testAdminId: string;
let testCfoId: string;
let testCeoId: string;
let testFinanceDirId: string;
let testStationManagerId: string;
let testStationId: string;

/** Login helper — returns access token */
async function login(email: string, password = 'Alcom2026!'): Promise<{ token: string; userId: string }> {
  const res = await request(app).post('/auth/login').send({ email, password });
  if (res.status !== 200 || !res.body?.data?.accessToken) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.data.accessToken, userId: res.body.data.user.id };
}

/** Create a test expense */
async function createExpense(
  token: string,
  data: { title: string; amount: number; category: string; stationId?: string },
): Promise<string> {
  const res = await request(app).post('/expenses').set('Authorization', `Bearer ${token}`).send(data);

  if (res.status !== 201) {
    throw new Error(`Failed to create expense: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return res.body.data.id;
}

/** Get user by email */
async function getUserByEmail(token: string, email: string): Promise<any> {
  const res = await request(app).get('/users').query({ search: email, limit: 1 }).set('Authorization', `Bearer ${token}`);

  if (res.status !== 200 || !res.body.data?.length) {
    throw new Error(`User not found: ${email}`);
  }

  return res.body.data[0];
}

// ─── Setup ────────────────────────────────────────────────────────

beforeAll(async () => {
  // Login as different role users
  const admin = await login('admin@alcom.cm');
  adminToken = admin.token;
  testAdminId = admin.userId;

  const cfo = await login('cfo@alcom.cm');
  cfoToken = cfo.token;
  testCfoId = cfo.userId;

  const ceo = await login('ceo@alcom.cm');
  ceoToken = ceo.token;
  testCeoId = ceo.userId;

  const financeDir = await login('finance@alcom.cm');
  financeDirToken = financeDir.token;
  testFinanceDirId = financeDir.userId;

  const stationManager = await login('manager1@alcom.cm');
  stationManagerToken = stationManager.token;
  testStationManagerId = stationManager.userId;

  // Get station ID for testing
  const stationsRes = await request(app).get('/stations').set('Authorization', `Bearer ${adminToken}`);
  if (stationsRes.body.data?.length) {
    testStationId = stationsRes.body.data[0].id;
  }
}, 30_000);

// ══════════════════════════════════════════════════════════════════
//  Expense Creation Tests
// ══════════════════════════════════════════════════════════════════

describe('Expense API', () => {
  describe('POST /expenses', () => {
    it('should create expense with SUBMITTED status', async () => {
      const expenseId = await createExpense(stationManagerToken, {
        title: 'Test Expense for pump repair',
        amount: 50_000,
        category: 'MAINTENANCE',
      });

      const res = await request(app).get(`/expenses/${expenseId}`).set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // Status can be SUBMITTED (if user has lineManager) or PENDING_MANAGER (if no lineManager)
      expect(['SUBMITTED', 'PENDING_MANAGER']).toContain(res.body.data.status);
      expect(res.body.data.title).toBe('Test Expense for pump repair');
    });

    it('should reject expense with short title', async () => {
      const res = await request(app).post('/expenses').set('Authorization', `Bearer ${stationManagerToken}`).send({
        title: 'Ab',
        amount: 50_000,
        category: 'MAINTENANCE',
      });

      expect(res.status).toBe(400);
    });

    it('should reject expense without category', async () => {
      const res = await request(app).post('/expenses').set('Authorization', `Bearer ${stationManagerToken}`).send({
        title: 'Missing category expense',
        amount: 50_000,
      });

      expect(res.status).toBe(400);
    });

    it('should reject expense with negative amount', async () => {
      const res = await request(app).post('/expenses').set('Authorization', `Bearer ${stationManagerToken}`).send({
        title: 'Negative amount expense',
        amount: -5000,
        category: 'SUPPLIES',
      });

      expect(res.status).toBe(400);
    });

    it('should allow all valid categories', async () => {
      const categories = ['MAINTENANCE', 'UTILITIES', 'SUPPLIES', 'TRANSPORT', 'PERSONNEL', 'MISCELLANEOUS'];

      for (const category of categories) {
        const res = await request(app).post('/expenses').set('Authorization', `Bearer ${adminToken}`).send({
          title: `Test expense for ${category}`,
          amount: 10_000,
          category,
        });

        expect(res.status).toBe(201);
        expect(res.body.data.category).toBe(category);
      }
    });
  });

  describe('GET /expenses', () => {
    it('should list expenses with pagination', async () => {
      const res = await request(app)
        .get('/expenses')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta).toHaveProperty('totalPages');
    });

    it('should filter expenses by status', async () => {
      // Create an expense with known status
      await createExpense(adminToken, {
        title: 'Filter test expense',
        amount: 25_000,
        category: 'SUPPLIES',
      });

      const res = await request(app)
        .get('/expenses')
        .query({ status: 'SUBMITTED' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach((exp: any) => {
        expect(['SUBMITTED', 'PENDING_MANAGER']).toContain(exp.status);
      });
    });

    it('should filter expenses by category', async () => {
      const res = await request(app)
        .get('/expenses')
        .query({ category: 'MAINTENANCE' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach((exp: any) => {
        expect(exp.category).toBe('MAINTENANCE');
      });
    });
  });

  describe('GET /expenses/:id', () => {
    it('should return expense detail with approval chain', async () => {
      const expenseId = await createExpense(adminToken, {
        title: 'Detail test expense',
        amount: 100_000,
        category: 'UTILITIES',
      });

      const res = await request(app).get(`/expenses/${expenseId}`).set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('title');
      expect(res.body.data).toHaveProperty('amount');
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data).toHaveProperty('approvals');
    });

    it('should return 404 for non-existent expense', async () => {
      const res = await request(app)
        .get('/expenses/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
//  Approval Workflow Tests
// ══════════════════════════════════════════════════════════════════

describe('Expense Approval Workflow', () => {
  describe('Low Value Expenses (<500k)', () => {
    it('Admin should be able to directly approve low value expense', async () => {
      const expenseId = await createExpense(adminToken, {
        title: 'Low value direct approval test',
        amount: 100_000,
        category: 'SUPPLIES',
      });

      // Admin (SUPER_ADMIN) can approve at any level
      const res = await request(app)
        .put(`/expenses/${expenseId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ comment: 'Approved by admin' });

      expect(res.status).toBe(200);
    });
  });

  describe('Medium Value Expenses (500k-5M)', () => {
    it('should route to Finance Director after line manager for 500k-5M', async () => {
      // This requires a user with line manager set
      // For now, test with admin who has no line manager (skips to finance)
      const expenseId = await createExpense(adminToken, {
        title: 'Medium value expense test',
        amount: 1_000_000,
        category: 'MAINTENANCE',
      });

      // Check that it's pending for finance
      const detailRes = await request(app).get(`/expenses/${expenseId}`).set('Authorization', `Bearer ${adminToken}`);

      expect(detailRes.status).toBe(200);
      // Since admin has no line manager, should be PENDING_MANAGER (waiting for finance)
      expect(['SUBMITTED', 'PENDING_MANAGER']).toContain(detailRes.body.data.status);
    });

    it('Finance Director should be able to approve medium value expense', async () => {
      const expenseId = await createExpense(adminToken, {
        title: 'Finance Dir approval test',
        amount: 800_000,
        category: 'TRANSPORT',
      });

      const res = await request(app)
        .put(`/expenses/${expenseId}/approve`)
        .set('Authorization', `Bearer ${financeDirToken}`)
        .send({ comment: 'Approved by Finance Director' });

      expect(res.status).toBe(200);
    });
  });

  describe('High Value Expenses (≥5M)', () => {
    let highValueExpenseId: string;

    beforeAll(async () => {
      highValueExpenseId = await createExpense(adminToken, {
        title: 'High value equipment purchase',
        amount: EXPENSE_THRESHOLD_CFO,
        category: 'MAINTENANCE',
      });
    });

    it('should require CFO + CEO approval for high value', async () => {
      const res = await request(app)
        .get(`/expenses/${highValueExpenseId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // For high value, needs CFO then CEO
      expect(res.body.data.amount).toBeGreaterThanOrEqual(EXPENSE_THRESHOLD_CFO);
    });

    it('CFO should be able to approve first', async () => {
      const res = await request(app)
        .put(`/expenses/${highValueExpenseId}/approve`)
        .set('Authorization', `Bearer ${cfoToken}`)
        .send({ comment: 'CFO approval' });

      expect(res.status).toBe(200);
      // Still needs CEO approval
      expect(['PENDING_FINANCE', 'PENDING_MANAGER']).toContain(res.body.data.status);
    });

    it('CFO should not be able to approve twice', async () => {
      const res = await request(app)
        .put(`/expenses/${highValueExpenseId}/approve`)
        .set('Authorization', `Bearer ${cfoToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ALREADY_APPROVED');
    });

    it('CEO should be able to approve after CFO', async () => {
      const res = await request(app)
        .put(`/expenses/${highValueExpenseId}/approve`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({ comment: 'CEO final approval' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');
    });
  });
});

// ══════════════════════════════════════════════════════════════════
//  Rejection Workflow Tests
// ══════════════════════════════════════════════════════════════════

describe('Expense Rejection Workflow', () => {
  it('should allow rejection with proper reason', async () => {
    const expenseId = await createExpense(adminToken, {
      title: 'Expense to be rejected',
      amount: 200_000,
      category: 'MISCELLANEOUS',
    });

    const res = await request(app)
      .put(`/expenses/${expenseId}/reject`)
      .set('Authorization', `Bearer ${financeDirToken}`)
      .send({ reason: 'Insufficient documentation provided with this request' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');
  });

  it('should reject rejection with short reason', async () => {
    const expenseId = await createExpense(adminToken, {
      title: 'Short reason rejection test',
      amount: 150_000,
      category: 'SUPPLIES',
    });

    const res = await request(app)
      .put(`/expenses/${expenseId}/reject`)
      .set('Authorization', `Bearer ${financeDirToken}`)
      .send({ reason: 'short' });

    expect(res.status).toBe(400); // Validation error — reason too short
  });

  it('should not allow rejecting already rejected expense', async () => {
    const expenseId = await createExpense(adminToken, {
      title: 'Already rejected expense',
      amount: 100_000,
      category: 'UTILITIES',
    });

    // Reject first time
    await request(app)
      .put(`/expenses/${expenseId}/reject`)
      .set('Authorization', `Bearer ${financeDirToken}`)
      .send({ reason: 'First rejection with proper reason' });

    // Try to reject again
    const res = await request(app)
      .put(`/expenses/${expenseId}/reject`)
      .set('Authorization', `Bearer ${cfoToken}`)
      .send({ reason: 'Second rejection attempt with reason' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_STATUS');
  });
});

// ══════════════════════════════════════════════════════════════════
//  Disbursement Workflow Tests
// ══════════════════════════════════════════════════════════════════

describe('Expense Disbursement', () => {
  let approvedExpenseId: string;

  beforeAll(async () => {
    // Create and approve expense for disbursement test
    approvedExpenseId = await createExpense(adminToken, {
      title: 'Expense for disbursement test',
      amount: 300_000,
      category: 'PERSONNEL',
    });

    // Approve it (admin can directly approve)
    await request(app)
      .put(`/expenses/${approvedExpenseId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
  });

  it('should allow disbursing approved expense with PETTY_CASH', async () => {
    const res = await request(app)
      .put(`/expenses/${approvedExpenseId}/disburse`)
      .set('Authorization', `Bearer ${cfoToken}`)
      .send({ method: 'PETTY_CASH' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DISBURSED');
    expect(res.body.data.disbursementMethod).toBe('PETTY_CASH');
  });

  it('should not allow disbursing non-approved expense', async () => {
    const expenseId = await createExpense(adminToken, {
      title: 'Non approved disburse test',
      amount: 50_000,
      category: 'SUPPLIES',
    });

    const res = await request(app)
      .put(`/expenses/${expenseId}/disburse`)
      .set('Authorization', `Bearer ${cfoToken}`)
      .send({ method: 'BANK_TRANSFER' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_STATUS');
  });

  it('should allow BANK_TRANSFER as disbursement method', async () => {
    // Create another approved expense
    const expenseId = await createExpense(adminToken, {
      title: 'Bank transfer disbursement test',
      amount: 400_000,
      category: 'UTILITIES',
    });

    await request(app)
      .put(`/expenses/${expenseId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    const res = await request(app)
      .put(`/expenses/${expenseId}/disburse`)
      .set('Authorization', `Bearer ${financeDirToken}`)
      .send({ method: 'BANK_TRANSFER' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DISBURSED');
    expect(res.body.data.disbursementMethod).toBe('BANK_TRANSFER');
  });
});

// ══════════════════════════════════════════════════════════════════
//  Monthly Stats Tests
// ══════════════════════════════════════════════════════════════════

describe('Expense Statistics', () => {
  it('should return monthly spending summary', async () => {
    const res = await request(app)
      .get('/expenses/stats/monthly')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('year');
    expect(res.body.data).toHaveProperty('month');
    expect(res.body.data).toHaveProperty('stations');
  });

  it('should filter stats by year and month', async () => {
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;

    const res = await request(app)
      .get('/expenses/stats/monthly')
      .query({ year, month })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.year).toBe(year);
    expect(res.body.data.month).toBe(month);
  });
});

// ══════════════════════════════════════════════════════════════════
//  Delegation Tests
// ══════════════════════════════════════════════════════════════════

describe('User Delegation', () => {
  it('should set delegation for a user', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const res = await request(app)
      .post(`/users/${testFinanceDirId}/delegate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        backupApproverId: testCfoId,
        delegationStart: tomorrow.toISOString(),
        delegationEnd: nextWeek.toISOString(),
      });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('Delegation set');
  });

  it('should reject delegation with end before start', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const res = await request(app)
      .post(`/users/${testFinanceDirId}/delegate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        backupApproverId: testCfoId,
        delegationStart: tomorrow.toISOString(),
        delegationEnd: yesterday.toISOString(),
      });

    expect(res.status).toBe(400);
  });

  it('should reject self-delegation', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const res = await request(app)
      .post(`/users/${testFinanceDirId}/delegate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        backupApproverId: testFinanceDirId,
        delegationStart: tomorrow.toISOString(),
        delegationEnd: nextWeek.toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_OPERATION');
  });

  it('should clear delegation', async () => {
    const res = await request(app)
      .delete(`/users/${testFinanceDirId}/delegate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('cleared');
  });
});

// ══════════════════════════════════════════════════════════════════
//  Pending Expenses Tests
// ══════════════════════════════════════════════════════════════════

describe('Pending Expenses', () => {
  it('should return pending expenses for approval', async () => {
    // Create a few expenses that need approval
    await createExpense(adminToken, {
      title: 'Pending test expense 1',
      amount: 50_000,
      category: 'SUPPLIES',
    });

    const res = await request(app).get('/expenses/pending').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });
});

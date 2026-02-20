/**
 * Invoice API Integration Tests — Sprint 5
 *
 * Tests the full invoice approval workflow including:
 * - Invoice creation
 * - Approval routing based on amount thresholds
 * - Multi-step approval (CFO + CEO for ≥5M XAF)
 * - Rejection workflow
 * - Payment marking
 *
 * Requires seeded database (npx tsx prisma/seed.ts).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index';

// ─── Constants ────────────────────────────────────────────────────

const INVOICE_THRESHOLD_CFO = 5_000_000;

// ─── Helpers ──────────────────────────────────────────────────────

let adminToken: string;
let cfoToken: string;
let ceoToken: string;
let financeDirToken: string;

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

/** Create a test supplier */
async function createSupplier(token: string, name: string): Promise<string> {
  const res = await request(app)
    .post('/suppliers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name,
      taxId: `NIU-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      email: `${name.toLowerCase().replace(/\s+/g, '')}@test.cm`,
      phone: '+237 699 999 999',
      category: 'FUEL_SUPPLY',
    });
  if (res.status !== 201) {
    throw new Error(`Failed to create supplier: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.id;
}

/** Create a test invoice */
async function createInvoice(
  token: string,
  supplierId: string,
  amount: number,
): Promise<{ id: string; invoiceNumber: string }> {
  const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const res = await request(app)
    .post('/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      supplierId,
      invoiceNumber,
      amount,
      dueDate: dueDate.toISOString().split('T')[0],
      fileUrl: '/test/invoice.pdf',
    });
  
  if (res.status !== 201) {
    throw new Error(`Failed to create invoice: ${res.status} ${JSON.stringify(res.body)}`);
  }
  
  return { id: res.body.data.id, invoiceNumber };
}

// ─── Setup ────────────────────────────────────────────────────────

beforeAll(async () => {
  // Login as different role users
  adminToken = await login('admin@alcom.cm');
  cfoToken = await login('cfo@alcom.cm');
  ceoToken = await login('ceo@alcom.cm');
  financeDirToken = await login('financedir@alcom.cm');
}, 30_000);

// ══════════════════════════════════════════════════════════════════
//  Supplier Tests
// ══════════════════════════════════════════════════════════════════

describe('Supplier API', () => {
  describe('POST /suppliers', () => {
    it('should create a new supplier', async () => {
      const res = await request(app)
        .post('/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Supplier Integration',
          taxId: `NIU-TEST-${Date.now()}`,
          email: 'testsupplier@integration.cm',
          phone: '+237 688 888 888',
          category: 'MAINTENANCE',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe('Test Supplier Integration');
      expect(res.body.data.isActive).toBe(true);
    });

    it('should reject duplicate NIU', async () => {
      const taxId = `NIU-DUP-${Date.now()}`;

      // Create first supplier
      await request(app)
        .post('/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'First Supplier',
          taxId,
          email: 'first@test.cm',
          phone: '+237 677 777 777',
          category: 'EQUIPMENT',
        });

      // Try to create second with same NIU
      const res = await request(app)
        .post('/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Second Supplier',
          taxId,
          email: 'second@test.cm',
          phone: '+237 666 666 666',
          category: 'OTHER',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_TAX_ID');
    });
  });

  describe('GET /suppliers', () => {
    it('should list suppliers with pagination', async () => {
      const res = await request(app)
        .get('/suppliers')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta).toHaveProperty('totalPages');
    });

    it('should search suppliers by name', async () => {
      // Create a supplier with a unique name
      const uniqueName = `SearchTest-${Date.now()}`;
      await createSupplier(adminToken, uniqueName);

      const res = await request(app)
        .get('/suppliers')
        .query({ search: uniqueName })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].name).toBe(uniqueName);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
//  Invoice Tests
// ══════════════════════════════════════════════════════════════════

describe('Invoice API', () => {
  let testSupplierId: string;

  beforeAll(async () => {
    testSupplierId = await createSupplier(adminToken, `Invoice Test Supplier ${Date.now()}`);
  });

  describe('POST /invoices', () => {
    it('should create invoice with PENDING_APPROVAL status', async () => {
      const { id } = await createInvoice(adminToken, testSupplierId, 1_000_000);

      const res = await request(app)
        .get(`/invoices/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PENDING_APPROVAL');
    });

    it('should warn on duplicate invoice number', async () => {
      const invoiceNumber = `INV-DUP-${Date.now()}`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      // Create first invoice
      await request(app)
        .post('/invoices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplierId: testSupplierId,
          invoiceNumber,
          amount: 500_000,
          dueDate: dueDate.toISOString().split('T')[0],
          fileUrl: '/test/invoice1.pdf',
        });

      // Create second with same number — should warn but still create
      const res = await request(app)
        .post('/invoices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplierId: testSupplierId,
          invoiceNumber,
          amount: 600_000,
          dueDate: dueDate.toISOString().split('T')[0],
          fileUrl: '/test/invoice2.pdf',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.warning).toContain('Duplicate');
    });
  });

  describe('Approval Workflow — Low Value (<5M)', () => {
    let lowValueInvoiceId: string;

    beforeAll(async () => {
      const { id } = await createInvoice(adminToken, testSupplierId, 1_000_000);
      lowValueInvoiceId = id;
    });

    it('should require only FINANCE_DIR approval for low value', async () => {
      const res = await request(app)
        .get(`/invoices/${lowValueInvoiceId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.requiredApprovers).toEqual(['FINANCE_DIR']);
    });

    it('CFO should not be able to approve low value invoice directly', async () => {
      // For low value invoices, only FINANCE_DIR should approve
      // CFO can still approve (has higher authority) but it's not in requiredApprovers
      const res = await request(app)
        .put(`/invoices/${lowValueInvoiceId}/approve`)
        .set('Authorization', `Bearer ${cfoToken}`)
        .send({});

      // CFO has authority but isn't in the required approver list for low value
      // The behavior depends on implementation — CFO might be allowed or not
      // Based on our implementation, CFO should be forbidden for low-value invoices
      expect(res.status).toBe(403);
    });

    it('FINANCE_DIR should be able to approve low value invoice', async () => {
      const res = await request(app)
        .put(`/invoices/${lowValueInvoiceId}/approve`)
        .set('Authorization', `Bearer ${financeDirToken}`)
        .send({ comment: 'Approved by Finance Director' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');
    });
  });

  describe('Approval Workflow — High Value (≥5M)', () => {
    let highValueInvoiceId: string;

    beforeAll(async () => {
      const { id } = await createInvoice(adminToken, testSupplierId, INVOICE_THRESHOLD_CFO);
      highValueInvoiceId = id;
    });

    it('should require CFO + CEO approval for high value', async () => {
      const res = await request(app)
        .get(`/invoices/${highValueInvoiceId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.requiredApprovers).toEqual(['CFO', 'CEO']);
    });

    it('CEO should not be able to approve before CFO', async () => {
      const res = await request(app)
        .put(`/invoices/${highValueInvoiceId}/approve`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('cannot approve');
    });

    it('CFO should be able to approve first', async () => {
      const res = await request(app)
        .put(`/invoices/${highValueInvoiceId}/approve`)
        .set('Authorization', `Bearer ${cfoToken}`)
        .send({ comment: 'CFO approval' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PENDING_APPROVAL'); // Still pending CEO
      expect(res.body.data.message).toContain('Waiting for additional approvals');
    });

    it('CFO should not be able to approve twice', async () => {
      const res = await request(app)
        .put(`/invoices/${highValueInvoiceId}/approve`)
        .set('Authorization', `Bearer ${cfoToken}`)
        .send({});

      expect(res.status).toBe(403);
    });

    it('CEO should be able to approve after CFO', async () => {
      const res = await request(app)
        .put(`/invoices/${highValueInvoiceId}/approve`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({ comment: 'CEO final approval' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.message).toContain('fully approved');
    });
  });

  describe('Rejection Workflow', () => {
    it('should allow rejection with reason', async () => {
      const { id } = await createInvoice(adminToken, testSupplierId, 2_000_000);

      const res = await request(app)
        .put(`/invoices/${id}/reject`)
        .set('Authorization', `Bearer ${financeDirToken}`)
        .send({ reason: 'Invalid invoice details — missing documentation' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REJECTED');
    });

    it('should require minimum reason length', async () => {
      const { id } = await createInvoice(adminToken, testSupplierId, 3_000_000);

      const res = await request(app)
        .put(`/invoices/${id}/reject`)
        .set('Authorization', `Bearer ${financeDirToken}`)
        .send({ reason: 'short' });

      expect(res.status).toBe(400); // Validation error
    });
  });

  describe('Payment Workflow', () => {
    let approvedInvoiceId: string;

    beforeAll(async () => {
      const { id } = await createInvoice(adminToken, testSupplierId, 800_000);
      approvedInvoiceId = id;

      // Approve it (low value — single approval)
      await request(app)
        .put(`/invoices/${approvedInvoiceId}/approve`)
        .set('Authorization', `Bearer ${financeDirToken}`)
        .send({});
    });

    it('should not allow paying non-approved invoice', async () => {
      const { id } = await createInvoice(adminToken, testSupplierId, 700_000);

      const res = await request(app)
        .put(`/invoices/${id}/pay`)
        .set('Authorization', `Bearer ${cfoToken}`)
        .send({ proofOfPaymentUrl: '/payments/proof.pdf' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
    });

    it('should allow marking approved invoice as paid', async () => {
      const res = await request(app)
        .put(`/invoices/${approvedInvoiceId}/pay`)
        .set('Authorization', `Bearer ${cfoToken}`)
        .send({ proofOfPaymentUrl: '/payments/proof-of-payment.pdf' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PAID');
      expect(res.body.data.proofOfPaymentUrl).toBe('/payments/proof-of-payment.pdf');
    });

    it('should require proof of payment', async () => {
      const { id } = await createInvoice(adminToken, testSupplierId, 900_000);

      // Approve it first
      await request(app)
        .put(`/invoices/${id}/approve`)
        .set('Authorization', `Bearer ${financeDirToken}`)
        .send({});

      // Try to pay without proof
      const res = await request(app)
        .put(`/invoices/${id}/pay`)
        .set('Authorization', `Bearer ${cfoToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /invoices/pending', () => {
    it('should return invoices pending user approval', async () => {
      // Create a new invoice
      await createInvoice(adminToken, testSupplierId, 1_500_000);

      const res = await request(app)
        .get('/invoices/pending')
        .set('Authorization', `Bearer ${financeDirToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });
  });
});

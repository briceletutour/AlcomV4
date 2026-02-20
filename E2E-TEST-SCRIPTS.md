# ALCOM V3 — End-to-End Test Scripts

> Manual testing guide for the 5 critical flows  
> Sprint 14 — Integration Testing & Polish

---

## Prerequisites

- **Test URL:** `http://localhost:3000` (dev) or `https://app.alcom.cm` (prod)
- **API URL:** `http://localhost:4000` (dev) or via same domain (prod)
- **Test accounts:**

| Role | Email | Password |
|------|-------|----------|
| Super Admin / CEO | admin@alcom.cm | Alcom2026! |
| CFO | cfo@alcom.cm | Alcom2026! |
| Finance Director | financedir@alcom.cm | Alcom2026! |
| DCO (Supply Chain) | admin@alcom.cm | Alcom2026! |
| Station Manager | manager1@alcom.cm | Alcom2026! |
| Pompiste | pompiste1@alcom.cm | Alcom2026! |

---

## Flow 1: Shift Lifecycle

**Objective:** Verify the complete shift open → work → close cycle with price lock and variance calculation.

### Test Steps

| # | Action | Expected Result | ✓ |
|---|--------|-----------------|---|
| 1.1 | Login as **Station Manager** (manager1@alcom.cm) | Dashboard loads, shows station-specific KPIs | ☐ |
| 1.2 | Navigate to **Shifts** → **Open Shift** | Open shift form displays with date selector | ☐ |
| 1.3 | Select current date, morning shift | Form shows tank dip entry fields, nozzle opening indexes | ☐ |
| 1.4 | Verify **price is locked** from current active prices | Price field is read-only, shows current fuel prices | ☐ |
| 1.5 | Enter realistic opening tank dips (e.g., ESSENCE: 12,500L, GASOIL: 8,200L) | Values accept, no validation errors | ☐ |
| 1.6 | Enter nozzle opening indexes based on previous close | Values accept, indexes must be ≥ previous closing | ☐ |
| 1.7 | Click **Open Shift** | Success toast, redirects to shift detail page | ☐ |
| 1.8 | Verify shift appears in active shifts list with status **EN_COURS** | Shift card shows with correct date, period, price | ☐ |
| 1.9 | Navigate to **Checklists** → **New Checklist** | Checklist form available during open shift | ☐ |
| 1.10 | Complete morning checklist (see Flow 4) | Checklist saved, linked to current shift | ☐ |
| 1.11 | Navigate back to **Shifts** → select open shift → **Close Shift** | Close shift form displays | ☐ |
| 1.12 | Enter closing nozzle indexes (increment by realistic sales, e.g., +800L per nozzle) | Values accept, volume sold auto-calculates | ☐ |
| 1.13 | Enter closing tank dips (opening - sales + deliveries) | Tank dip variance calculates automatically | ☐ |
| 1.14 | Enter cash reconciliation: **Counted cash:** (matches expected from sales) | Cash variance displays | ☐ |
| 1.15 | Enter card payments (if any) and expenses (if any during shift) | Totals update | ☐ |
| 1.16 | Review calculations: **Total Revenue = Volume × Price** | Math is correct for each fuel type | ☐ |
| 1.17 | Review variance: **Variance = (Index sales) - (Dip loss) in liters** | Variance displayed with color indicator | ☐ |
| 1.18 | If variance > 0.5%: justification field becomes required | Field shows required asterisk | ☐ |
| 1.19 | Enter justification if required: "Temperature expansion / calibration" | Field accepts text | ☐ |
| 1.20 | Click **Close Shift** | Success toast, shift status → **CLOTURE** | ☐ |
| 1.21 | Navigate to **Shifts** list → find closed shift | Shift shows in list with CLOTURE badge | ☐ |
| 1.22 | Click shift to view detail page | All entered data displayed correctly, including variance report | ☐ |
| 1.23 | Verify **audit log** entry exists for shift close | Audit trail shows user, timestamp, action | ☐ |

### Expected Data Example

```
Station: YDE-BASTOS
Date: 17/02/2026
Period: MORNING

Opening (06:00):
- Tank ESSENCE T1: 12,500 L
- Tank GASOIL T2: 8,200 L
- Pump 1 Nozzle 1 (ESSENCE): 145,230.5 L
- Pump 1 Nozzle 2 (GASOIL): 89,102.0 L

Closing (14:00):
- Tank ESSENCE T1: 11,750 L  (loss: 750L)
- Tank GASOIL T2: 7,850 L   (loss: 350L)
- Pump 1 Nozzle 1 (ESSENCE): 145,980.5 L  (sold: 750L ✓)
- Pump 1 Nozzle 2 (GASOIL): 89,452.0 L    (sold: 350L ✓)

Revenue:
- ESSENCE: 750L × 750 XAF = 562,500 XAF
- GASOIL: 350L × 700 XAF = 245,000 XAF
- TOTAL: 807,500 XAF

Cash:
- Counted: 800,000 XAF
- Card: 0 XAF
- Shift Expenses: 7,500 XAF
- Expected: 807,500 XAF
- Variance: 0 XAF ✓
```

---

## Flow 2: Invoice Lifecycle

**Objective:** Verify invoice submission, multi-level approval workflow, and payment tracking.

### Test Steps — Small Invoice (<5M XAF)

| # | Action | Expected Result | ✓ |
|---|--------|-----------------|---|
| 2.1 | Login as **Station Manager** | Dashboard loads | ☐ |
| 2.2 | Navigate to **Finance** → **Invoices** → **New Invoice** | Invoice form displays | ☐ |
| 2.3 | Select supplier from dropdown | Suppliers load correctly | ☐ |
| 2.4 | Enter invoice number: **INV-2026-0001** | Field accepts alphanumeric | ☐ |
| 2.5 | Enter amount: **2,500,000 XAF** (< 5M threshold) | Field accepts number | ☐ |
| 2.6 | Set due date: **+30 days from today** | Date picker works | ☐ |
| 2.7 | Upload invoice PDF | File uploads, preview shows | ☐ |
| 2.8 | Click **Submit Invoice** | Success toast, status → PENDING | ☐ |
| 2.9 | Verify invoice appears in list with status **PENDING** | Invoice row visible | ☐ |
| 2.10 | **Logout**, login as **Finance Director** (financedir@alcom.cm) | Dashboard loads | ☐ |
| 2.11 | Navigate to **Finance** → **Invoices** → Filter: Pending Approval | Invoice appears in pending list | ☐ |
| 2.12 | Click invoice row → view detail page | Full invoice details displayed | ☐ |
| 2.13 | Click **Approve** button | Confirmation dialog appears | ☐ |
| 2.14 | Confirm approval | Status → **APPROVED**, approval trail updated | ☐ |
| 2.15 | **Logout**, login as **CFO** (cfo@alcom.cm) | Dashboard loads | ☐ |
| 2.16 | Verify invoice is NOT in CFO pending queue (amount < 5M) | Invoice not requiring CFO | ☐ |
| 2.17 | **Logout**, login as **admin@alcom.cm** (Treasurer role) | Dashboard loads | ☐ |
| 2.18 | Navigate to **Finance** → **Invoices** → Filter: Approved | Approved invoice appears | ☐ |
| 2.19 | Click invoice → **Mark Paid** | Payment form opens | ☐ |
| 2.20 | Upload payment proof (bank receipt) | File uploads | ☐ |
| 2.21 | Enter payment date and reference | Fields accept input | ☐ |
| 2.22 | Click **Confirm Payment** | Status → **PAID** | ☐ |
| 2.23 | Verify audit trail shows: Submit → Approve → Paid | All steps recorded with timestamps and users | ☐ |

### Test Steps — Large Invoice (≥5M XAF)

| # | Action | Expected Result | ✓ |
|---|--------|-----------------|---|
| 2.30 | Login as **Station Manager** | Dashboard loads | ☐ |
| 2.31 | Create invoice with amount: **7,500,000 XAF** | Invoice created, status PENDING | ☐ |
| 2.32 | **Logout**, login as **Finance Director** | See pending invoice | ☐ |
| 2.33 | Approve invoice | Status → **PENDING_CFO** (partial approval) | ☐ |
| 2.34 | **Logout**, login as **CFO** | Invoice appears in CFO pending queue | ☐ |
| 2.35 | Approve invoice | Status → **APPROVED** | ☐ |
| 2.36 | Complete payment flow as above | Status → **PAID** | ☐ |
| 2.37 | Verify audit trail shows: Submit → Finance Dir Approve → CFO Approve → Paid | All 4 steps recorded | ☐ |

### Test Steps — Rejection

| # | Action | Expected Result | ✓ |
|---|--------|-----------------|---|
| 2.40 | Create new invoice as Station Manager | Invoice pending | ☐ |
| 2.41 | Login as Finance Director → view invoice | Invoice detail page | ☐ |
| 2.42 | Click **Reject** → enter reason: "Duplicate invoice" | Rejection dialog opens | ☐ |
| 2.43 | Confirm rejection | Status → **REJECTED**, reason saved | ☐ |
| 2.44 | Login as Station Manager → view invoice | REJECTED badge, rejection reason visible | ☐ |

---

## Flow 3: Fuel Delivery

**Objective:** Verify supply chain from replenishment request to delivery completion with variance tracking.

### Test Steps

| # | Action | Expected Result | ✓ |
|---|--------|-----------------|---|
| 3.1 | Login as **Station Manager** | Dashboard loads | ☐ |
| 3.2 | Navigate to **Supply** → **Replenishment** → **New Request** | Request form displays | ☐ |
| 3.3 | Select tank: **ESSENCE T1** | Tank info loads (capacity, current level, ullage) | ☐ |
| 3.4 | Verify **ullage** displays (capacity - current level) | Ullage calculation correct | ☐ |
| 3.5 | Enter requested volume: **8,000 L** (within ullage) | Field accepts, no error | ☐ |
| 3.6 | Enter notes: "Low stock, request urgent" | Text field accepts | ☐ |
| 3.7 | Click **Save Draft** | Request saved with status DRAFT | ☐ |
| 3.8 | Click **Submit Request** | Status → SUBMITTED | ☐ |
| 3.9 | Try to enter volume > ullage (e.g., 20,000L) | Validation error: "Exceeds tank ullage" | ☐ |
| 3.10 | **Logout**, login as **DCO/Admin** (admin@alcom.cm) | Dashboard loads | ☐ |
| 3.11 | Navigate to **Supply** → **Replenishment** → Filter: Submitted | Request appears | ☐ |
| 3.12 | Click request → **Validate** | Status → VALIDATED | ☐ |
| 3.13 | Click **Create Order** → enter supplier, PO number | Order form opens | ☐ |
| 3.14 | Confirm order with supplier: **SONARA** | Status → ORDERED | ☐ |
| 3.15 | Navigate to **Supply** → **Deliveries** → **New Delivery** | Delivery form with replenishment link | ☐ |
| 3.16 | Select replenishment request from dropdown | Request details auto-fill | ☐ |
| 3.17 | Enter BL (Bill of Lading) number: **BL-2026-0452** | Field accepts | ☐ |
| 3.18 | Enter compartments: 3 × 3,000L = 9,000L total | Compartment form works | ☐ |
| 3.19 | Click **Start Delivery** | Delivery status → IN_PROGRESS | ☐ |
| 3.20 | Navigate to delivery → **Complete Delivery** | Completion form opens | ☐ |
| 3.21 | Enter actual dip reading after delivery | Field accepts | ☐ |
| 3.22 | System calculates: **Received = New dip - Old dip** | Auto-calculation correct | ☐ |
| 3.23 | System calculates: **Variance = BL quantity - Received** | Variance displays | ☐ |
| 3.24 | If variance > tolerance (0.5%): justification required | Field becomes required | ☐ |
| 3.25 | Enter justification if needed | Field accepts text | ☐ |
| 3.26 | Click **Complete Delivery** | Status → COMPLETED | ☐ |
| 3.27 | Verify tank level updated automatically | Current level = old + received | ☐ |
| 3.28 | Verify replenishment request status → COMPLETED | Request closed | ☐ |
| 3.29 | Check delivery history shows all variance data | History page accurate | ☐ |

### Expected Data Example

```
Tank: ESSENCE T1 (Capacity: 30,000L)
Before Delivery: 12,500L
Ullage: 17,500L

Replenishment Request: 8,000L
Supplier: SONARA
BL Number: BL-2026-0452
Compartments: 3 × 3,000L = 9,000L (BL quantity)

Delivery:
- Opening Dip: 12,500L
- Closing Dip: 21,350L
- Received: 8,850L

Variance: 9,000L - 8,850L = 150L (1.67%)
→ Within tolerance? No (>0.5%)
→ Justification required: "Temperature contraction during transport"
```

---

## Flow 4: Checklist + Incident

**Objective:** Verify checklist submission with auto-scoring, photo requirements, and auto-incident creation for non-conformities.

### Test Steps

| # | Action | Expected Result | ✓ |
|---|--------|-----------------|---|
| 4.1 | Login as **Station Manager** or **Pompiste** | Dashboard loads | ☐ |
| 4.2 | Navigate to **Checklists** → **New Checklist** | Template selection appears | ☐ |
| 4.3 | Select template: **Morning Station Checklist** | Checklist form loads with categories | ☐ |
| 4.4 | Verify categories display: SAFETY, CLEANLINESS, EQUIPMENT, INVENTORY | All categories visible | ☐ |
| 4.5 | For each item, select status: CONFORME, NON_CONFORME, or N/A | Radio buttons work | ☐ |
| 4.6 | Mark item as **NON_CONFORME** without photo | Validation error: "Photo required for non-conformity" | ☐ |
| 4.7 | Upload photo for NON_CONFORME item | Photo uploads, preview shows | ☐ |
| 4.8 | Add optional note: "Fire extinguisher expired - replacement ordered" | Text field accepts | ☐ |
| 4.9 | Complete all items in checklist | Progress indicator shows completion | ☐ |
| 4.10 | Click **Submit Checklist** | Success toast | ☐ |
| 4.11 | Verify **score** auto-calculates: (CONFORME / Total) × 100 | Score displays (e.g., 85%) | ☐ |
| 4.12 | Verify checklist cannot be submitted twice for same date/period | Error: "Checklist already exists for this period" | ☐ |
| 4.13 | Navigate to **Incidents** list | Auto-created incidents appear | ☐ |
| 4.14 | Verify one incident per NON_CONFORME item | Count matches non-conformities | ☐ |
| 4.15 | Click auto-incident → verify linked to checklist | Checklist reference visible | ☐ |
| 4.16 | Verify incident category matches checklist item category | SAFETY item → SAFETY incident | ☐ |

### Test Steps — Incident Resolution

| # | Action | Expected Result | ✓ |
|---|--------|-----------------|---|
| 4.20 | Login as **Station Manager** | Dashboard loads | ☐ |
| 4.21 | Navigate to **Incidents** → open incident | Incident detail page | ☐ |
| 4.22 | Click **Assign** → select assignee | Assignee dropdown works | ☐ |
| 4.23 | Confirm assignment | Status → IN_PROGRESS | ☐ |
| 4.24 | Click **Resolve** without entering resolution note | Validation error: "Resolution note required" | ☐ |
| 4.25 | Enter resolution note: "Replaced fire extinguisher, new expiry 02/2028" | Field accepts | ☐ |
| 4.26 | Click **Mark Resolved** | Status → RESOLVED | ☐ |
| 4.27 | As Manager, click **Close Incident** | Status → CLOSED | ☐ |
| 4.28 | Verify incident cannot be modified after closing | Edit buttons disabled | ☐ |
| 4.29 | Test **Reopen** functionality: click Reopen | Status → IN_PROGRESS, can edit again | ☐ |

### Expected Data Example

```
Checklist: Morning Station Checklist
Date: 17/02/2026
Submitted by: manager1@alcom.cm

Items:
✓ Fire extinguisher accessible - CONFORME
✓ Emergency exits clear - CONFORME
✗ Fire extinguisher valid - NON_CONFORME (photo attached)
  → Auto-incident created: "Fire extinguisher expired"
✓ Fuel spill kit available - CONFORME
✓ Ground cleanliness - CONFORME
✗ Pump calibration sticker - NON_CONFORME (photo attached)
  → Auto-incident created: "Pump calibration overdue"
✓ Price display correct - CONFORME
... (total 20 items)

Score: 18/20 = 90%
Auto-incidents created: 2
```

---

## Flow 5: Cross-Module Dashboard

**Objective:** Verify executive dashboard aggregates correct data from all modules.

### Test Steps — CEO/Executive View

| # | Action | Expected Result | ✓ |
|---|--------|-----------------|---|
| 5.1 | Login as **CEO/Admin** (admin@alcom.cm) | Executive dashboard loads | ☐ |
| 5.2 | Verify **Total Revenue** KPI shows | Sum of all station revenues for period | ☐ |
| 5.3 | Verify **Total Variance** KPI shows liters lost/gained | Aggregate variance across stations | ☐ |
| 5.4 | Verify **Avg Variance per Station** | Average of per-station variances | ☐ |
| 5.5 | Verify **Pending Invoices** count and amount | Count matches invoice list filter | ☐ |
| 5.6 | Verify **Pending Expenses** count and amount | Count matches expense list filter | ☐ |
| 5.7 | Verify **Station Ranking** shows all stations | Sorted by revenue or variance | ☐ |
| 5.8 | Verify **Overdue Mails** count | Count matches overdue mail filter | ☐ |
| 5.9 | Verify **Revenue by Station** chart | Bar/pie chart with station breakdown | ☐ |
| 5.10 | Verify **Revenue Trend** chart (7/30 days) | Line chart shows daily trend | ☐ |
| 5.11 | Click on a KPI card → drills down to detail | Navigation works | ☐ |
| 5.12 | Click **Pending Invoices** → navigates to invoice list with pending filter | Invoice list shows pending only | ☐ |
| 5.13 | Click **Station** in ranking → navigates to station detail | Station page loads | ☐ |

### Test Steps — Manager View

| # | Action | Expected Result | ✓ |
|---|--------|-----------------|---|
| 5.20 | Login as **Station Manager** (manager1@alcom.cm) | Manager dashboard loads | ☐ |
| 5.21 | Verify dashboard shows **own station only** | No other station data visible | ☐ |
| 5.22 | Verify **Today's Revenue** | Matches shifts closed today | ☐ |
| 5.23 | Verify **Yesterday's Revenue** with % change | Comparison correct | ☐ |
| 5.24 | Verify **Open Shifts** count | Matches currently open shifts | ☐ |
| 5.25 | Verify **Pending Checklists** count | Checklists awaiting validation | ☐ |
| 5.26 | Verify **Current Variance** for station | Variance from recent shifts | ☐ |
| 5.27 | Verify **Tank Levels** shows all tanks | Each tank with % fill, color indicator | ☐ |
| 5.28 | Verify tanks below 20% show **warning** | Red/orange indicator | ☐ |
| 5.29 | Verify **Pending Expenses** for station | Station-scoped expenses | ☐ |
| 5.30 | Verify **Open Incidents** count | Incidents not yet closed | ☐ |
| 5.31 | Verify **Variance Trend** chart | 7-day variance graph | ☐ |

### Verification Queries

Manually verify dashboard numbers against database:

```sql
-- Total revenue (last 30 days)
SELECT SUM(total_revenue) 
FROM shifts 
WHERE closed_at > NOW() - INTERVAL '30 days';

-- Pending invoices
SELECT COUNT(*), SUM(amount) 
FROM invoices 
WHERE status = 'PENDING';

-- Station variance
SELECT station_id, SUM(variance_liters) 
FROM shifts 
GROUP BY station_id;

-- Open incidents
SELECT COUNT(*) 
FROM incidents 
WHERE status NOT IN ('CLOSED', 'RESOLVED');
```

---

## Cross-Cutting Tests

### RBAC Verification

| Test | Steps | Expected | ✓ |
|------|-------|----------|---|
| Manager can't see other stations | Login as manager1, try to access Station B | 403 Forbidden or filtered out | ☐ |
| Pompiste can't approve invoices | Login as pompiste, navigate to invoice, no Approve button | Button not rendered | ☐ |
| Finance Dir can't create shifts | Login as financedir, navigate to Shifts | No "Open Shift" button | ☐ |
| CEO sees all stations | Login as CEO, station dropdown shows all | All stations in list | ☐ |

### Error Handling

| Test | Steps | Expected | ✓ |
|------|-------|----------|---|
| Network failure | Disconnect WiFi, try to load page | Toast: "Network error, retry?" with retry button | ☐ |
| Server error (500) | API returns 500 | Toast: "Server error occurred" | ☐ |
| Invalid input | Submit form with invalid data | Inline validation errors on fields | ☐ |
| 404 page | Navigate to /admin/nonexistent | Custom 404 page renders | ☐ |
| Session expired | Wait for token to expire, try action | Redirect to login with message | ☐ |

### Responsive Design

| Test | Device | Expected | ✓ |
|------|--------|----------|---|
| Dashboard | iPhone 12 (390px) | Cards stack vertically, charts resize | ☐ |
| Data tables | iPhone 12 | Horizontal scroll or card view | ☐ |
| Forms | iPhone 12 | Full-width inputs, touch-friendly | ☐ |
| Navigation | iPad (768px) | Sidebar collapses/expands | ☐ |
| Dashboard | Desktop (1920px) | Full layout, multi-column | ☐ |

### Performance

| Test | Target | How to Verify | ✓ |
|------|--------|---------------|---|
| Page load (cached) | < 2s | Chrome DevTools Network | ☐ |
| Page load (uncached) | < 5s | Hard refresh | ☐ |
| API response | < 500ms | Network tab timing | ☐ |
| Large list (100+ items) | No jank | Scroll through list smoothly | ☐ |
| 3G throttling | Usable | Chrome DevTools throttling | ☐ |

---

## Test Sign-Off

| Flow | Tester | Date | All Pass? | Notes |
|------|--------|------|-----------|-------|
| Flow 1: Shift Lifecycle | | | ☐ | |
| Flow 2: Invoice Lifecycle | | | ☐ | |
| Flow 3: Fuel Delivery | | | ☐ | |
| Flow 4: Checklist + Incident | | | ☐ | |
| Flow 5: Dashboard | | | ☐ | |
| RBAC | | | ☐ | |
| Error Handling | | | ☐ | |
| Responsive | | | ☐ | |
| Performance | | | ☐ | |

---

**Document Version:** 1.0  
**Created:** Sprint 14  
**Last Updated:** February 17, 2026

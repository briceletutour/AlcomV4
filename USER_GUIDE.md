# Alcom V4 - Comprehensive User Guide

This guide provides a detailed breakdown of all actions and workflows across the various modules of the Alcom V4 platform. Each module is documented in a **4-Step Workflow** to ensure clarity on how processes are initiated, executed, validated, and monitored.

---

## Table of Contents

1. [User Roles & Permissions](#user-roles--permissions)
2. [Module 1: Station & Infrastructure Management](#module-1-station--infrastructure-management)
3. [Module 2: Shift Management (Shift Reports)](#module-2-shift-management-shift-reports)
4. [Module 3: Price Management](#module-3-price-management)
5. [Module 4: Expenses Management](#module-4-expenses-management)
6. [Module 5: Supplier & Invoice Management](#module-5-supplier--invoice-management)
7. [Module 6: Supply Chain & Fuel Deliveries](#module-6-supply-chain--fuel-deliveries)
8. [Module 7: Checklists & Quality Control](#module-7-checklists--quality-control)
9. [Module 8: Incident Management](#module-8-incident-management)
10. [Module 9: Incoming Mails Management](#module-9-incoming-mails-management)
11. [Appendix: App Pages & Navigation Reference](#appendix-app-pages--navigation-reference)

---

## User Roles & Permissions

Workflows strictly depend on user roles:

- **POMPISTE / CHEF_PISTE:** Execution, shift operations, incident reporting.
- **STATION_MANAGER:** Shift validation, local approvals, supply requisition.
- **FINANCE_DIR / CFO:** Financial validations, pricing approval.
- **LOGISTICS / DCO:** Supply chain oversight, delivery validations.
- **CEO / SUPER_ADMIN:** Top-level approvals, platform configuration.

---

## Module 1: Station & Infrastructure Management

This module handles the core physical setup of your operations: Stations, Tanks, Pumps, and Nozzles.

- **Step 1: Configuration (Super Admin / DCO)**
  - Establish Station definitions, setting operational codes and basic settings.
  - Define Tanks, linking them to a station and establishing maximum capacities and `FuelType`.
- **Step 2: Equipment Setup**
  - Allocate Pumps to Tanks.
  - Configure Nozzles (Side A/B), assigning baseline `meterIndex` values for tracking fuel flow.
- **Step 3: Verification**
  - Station Managers cross-verify physical tank IDs and pump codes against the system to prevent dispatch errors.
- **Step 4: Active Monitoring**
  - Tanks track `currentLevel` continuously, which serves as the foundational data for shift variances and replenishments.

---

## Module 2: Shift Management (Shift Reports)

Captures operational activity daily (Morning / Evening shifts), tracking revenue, sales, and tank dips.

- **Step 1: Shift Opening (Chef Piste / Manager)**
  - Initiate a `ShiftReport` with `ShiftStatus.OPEN`.
  - The system records physical opening levels of tanks and opening indexes for nozzles.
- **Step 2: Sales & Dips Recording (During Shift)**
  - Record nozzle indexes continuously (`ShiftSale`), linking sales to active nozzles.
  - Enter physical tank dip measurements (`ShiftTankDip`), mapping observed levels to tank volumes.
- **Step 3: Shift Closure & Declaration**
  - Supervisor inputs total counted cash out, card payments, and recorded expenses.
  - The system automatically computes theoretical cash and stock variances.
- **Step 4: Validation & Archiving**
  - The shift is moved to `ShiftStatus.CLOSED` (and eventually `LOCKED` by the Station Manager or Finance), locking all data and snapshotting applied fuel prices to prevent retroactive alteration.

---

## Module 3: Price Management

Ensures all stations sell fuel at approved, synchronized prices.

- **Step 1: Price Proposal (Finance / DCO)**
  - A user creates a `FuelPrice` record for a specific fuel type, specifying a future `effectiveDate` and exact price.
  - Status is intuitively set to `PriceStatus.PENDING`.
- **Step 2: Review (CFO / CEO)**
  - Approvers are notified to review the proposed rate. They can check historical variations and market conditions.
- **Step 3: Approval / Rejection Workflow**
  - If rejected, a `rejectedReason` must be provided, and the rate is scrapped.
  - If approved, status becomes `PriceStatus.APPROVED`.
- **Step 4: Activation & Synchronization**
  - At the exact `effectiveDate`, the system automatically toggles `isActive` to true, instantly taking effect across all station Point-of-Sale calculations for future shifts.

---

## Module 4: Expenses Management

Local and central disbursement workflows to manage petty cash or vendor utility payouts.

- **Step 1: Submission (Station Manager / Requester)**
  - Submit an `Expense` request containing the Category, station scope, and amount.
  - Requires supporting attachments (invoices/receipts). Status: `SUBMITTED`.
- **Step 2: Initial Clearance (Line Manager)**
  - Status moves to `PENDING_MANAGER`. Local managers vet the operational necessity of the expense.
- **Step 3: Financial Approval (Finance Dept)**
  - Status moves to `PENDING_FINANCE`. The finance team validates the budget allocation.
  - Multi-tier approval mechanisms run based on predefined thresholds.
- **Step 4: Disbursement & Reconciliation**
  - Once `APPROVED`, cash is released via `PETTY_CASH` or `BANK_TRANSFER`.
  - The record is stamped with `disbursedAt` and mapped against station P&L and shift reports.

---

## Module 5: Supplier & Invoice Management

Complete oversight of third-party contracts, bills, and payment terms.

- **Step 1: Supplier / Vendor Onboarding**
  - Vendors are created, verifying their tax ID (`tax_id`) and contact info.
- **Step 2: Invoice Reception & Capture**
  - An operator digitizes a supplier bill creating an `Invoice`.
  - Details logged include Total Amount, Currency, Due Date, and physical file storage URL. Status is `DRAFT`.
- **Step 3: Multi-Level Approval Workflow**
  - Sequential validations are orchestrated via the `ApprovalStep` table.
  - Invoices undergo validation (`PENDING_APPROVAL`). If missing data, it is `REJECTED` back to draft.
- **Step 4: Payment Execution**
  - Finance issues payment, uploading a `proofOfPaymentUrl`.
  - The status is conclusively locked to `PAID`.

---

## Module 6: Supply Chain & Fuel Deliveries

Manages fuel restocking processes from initial request to truck offloading and variance analysis.

- **Step 1: Requisition (Station Manager)**
  - Creates a `ReplenishmentRequest` denoting `RequestedVolume` and `FuelType`.
  - DCO validates the request (Status: `VALIDATED` -> `ORDERED`).
- **Step 2: Dispatch / Delivery Initiation**
  - Logistics routes a truck, capturing Bill of Lading (BL), Truck Plate, and Driver Name.
  - A `FuelDelivery` object is generated with status `IN_PROGRESS`.
- **Step 3: Physical Offloading & Dipping**
  - Station evaluates `DeliveryCompartments`.
  - Captures `openingDip` and `closingDip` per tank. Calculates actual `physicalReceived` versus `blVolume`.
- **Step 4: Variance Validation**
  - If volumes inherently match, delivery is `VALIDATED`.
  - If `globalVariance` exceeds acceptable thresholds, the status is flagged as `DISPUTED` for further logistical auditing.

---

## Module 7: Checklists & Quality Control

Routine operational, safety, and hygiene checks enforced across the network.

- **Step 1: Template Definition (Management)**
  - HQ defines `ChecklistTemplates` with dynamically categorized Boolean and structural items (e.g. Pump hygiene, fire extinguishers).
- **Step 2: Submission Execution (Chef Piste)**
  - End-users submit a `ChecklistSubmission` linked to a designated shift.
  - Answers are stored as JSON, determining `CONFORME` or `NON_CONFORME` stats.
- **Step 3: Automated Scoring & Validation**
  - The system computes an automated Compliance Score.
  - A Supervisor or Station manager investigates, then alters status to `VALIDATED` or `REJECTED`.
- **Step 4: Remediation Setup**
  - Elements marked `NON_CONFORME` automatically bridge into the Incident module to force operational fixes.

---

## Module 8: Incident Management

Operational tracking of hardware failures, behavioral issues, or security elements.

- **Step 1: Incident Reporting**
  - Generated manually or automatically (via failed checklists).
  - Submits Category, Description, and photo evidence. Status set to `OPEN`.
- **Step 2: Assignment & Triaging**
  - An Administrator assigns the incident to a relevant internal team or external supplier (`assignedTo`).
  - Status updates to `IN_PROGRESS`.
- **Step 3: Resolution & Proof**
  - Assigned user provides a `resolutionNote` (e.g., pump recalibrated, part replaced).
- **Step 4: Closure**
  - The reporter or manager verifies the fix, and logically changes status to `RESOLVED` and then locked to `CLOSED`.

---

## Module 9: Incoming Mails Management

Mailroom and Document Management integration designed for corporate SLAs.

- **Step 1: Mail Registry**
  - Internal mail desk digitizes an `IncomingMail`, capturing sender, subject, and physical scans (`attachmentUrl`).
- **Step 2: Assignment & SLA Definition**
  - The mail is tagged to a `RecipientDepartment` and individual.
  - Priority (`NORMAL`, `URGENT`) assigns automated strict deadlines.
- **Step 3: Tracking & Response (Action Workflow)**
  - Operator sets status to `IN_PROGRESS`.
  - Notifications are generated automatically if `SlaState` hits `DUE_SOON` or `OVERDUE`.
- **Step 4: Archiving**
  - Responded mail is marked as `RESPONDED` and closed out into `ARCHIVED`.

---

## Appendix: App Pages & Navigation Reference

This section provides a structural map of the Alcom V4 web application pages and routes, so users know exactly where to execute the workflows described above.

### Authentication & Core Navigation

- **Login (`/auth/login`)**: The main gateway into the system. Access depends on User Role.
- **Forgot/Reset Password (`/auth/forgot-password`, `/auth/reset-password`)**: Self-service recovery flows.
- **Admin Dashboard (`/admin/dashboard`)**: The central landing page providing an overview of metrics, quick actions, and open alerts.

### 1. Operations & Station Setup Route Maps

- **Stations List (`/admin/stations`)**: View all available operational stations.
- **New Station (`/admin/stations/new`)**: Configure new infrastructure. HQ only.
- **Station Details (`/admin/stations/[id]`)**: Deep dive into a station's metrics, tanks, and pumps.
- **Station Settings (`/admin/stations/[id]/settings`)**: Configuration pane to alter station parameters.

### 2. Shift Route Maps

- **Shifts List (`/admin/shifts`)**: A complete historical log of all Shift Reports.
- **Open Shift (`/admin/shifts/open`)**: The initial interface to start a morning/evening shift and capture baseline nozzle volumes.
- **Shift Details (`/admin/shifts/[id]`)**: Active view for entering sales data and tank dips during the shift.
- **Close Shift (`/admin/shifts/[id]/close`)**: Final declaration pane to input cash and trigger variance calculations.

### 3. Pricing Route Maps

- **Prices Setup (`/admin/prices`)**: View currently active prices across the network.
- **New Price Proposal (`/admin/prices/new`)**: Form to suggest a price change for approval.
- **Price History (`/admin/prices/history`)**: Audit trail of old prices and scheduled effective rates.

### 4. Supply & Deliveries Route Maps

- **Replenishments (`/admin/supply/replenishment`)**: Track requests for fuel stock.
- **New Replenishment (`/admin/supply/replenishment/new`)**: Manager requisition form for fuel.
- **Replenishment Details (`/admin/supply/replenishment/[id]`)**: Details for a specific replenishment request.
- **Deliveries (`/admin/supply/deliveries`)**: Track dispatch and arrival of fuel trucks.
- **New Delivery (`/admin/supply/deliveries/new`)**: Form to log a new delivery dispatch.
- **Delivery Offload (`/admin/supply/deliveries/[id]`)**: Validate received fuel volumes and evaluate variances.

### 5. Finance Route Maps

- **Expenses Overview (`/admin/finance/expenses`)**: List of all internal cash disbursements.
- **New Expense (`/admin/finance/expenses/new`)**: Upload proof and declare requested funds.
- **Expense Details (`/admin/finance/expenses/[id]`)**: Details for a specific expense, including approval steps.
- **Invoices (`/admin/finance/invoices`)**: Track supplier bills waiting for sequence approvals.
- **New Invoice (`/admin/finance/invoices/new`)**: Submit a new invoice for approval.
- **Invoice Details (`/admin/finance/invoices/[id]`)**: Details for a specific invoice, including file attachments and approvals.
- **Suppliers (`/admin/finance/suppliers`)**: The vendor CRM interface.
- **New Supplier (`/admin/finance/suppliers/new`)**: Add a new supplier.
- **Supplier Details (`/admin/finance/suppliers/[id]`)**: Details for a specific supplier.

### 6. Control & QA Route Maps

- **Checklists Hub (`/admin/checklists`)**: Overview of submitted operational checks.
- **New Checklist (`/admin/checklists/new`)**: Execute a station check based on templates.
- **Checklist Details (`/admin/checklists/[id]`)**: Detailed view of a submitted checklist.
- **Checklist Templates (`/admin/checklists/templates`)**: Admin builder for forms and grading.
- **New Checklist Template (`/admin/checklists/templates/new`)**: Create a new operational checklist template.
- **Checklist Template Details (`/admin/checklists/templates/[id]`)**: Edit or view a checklist template.
- **Incidents Dashboard (`/admin/incidents`)**: Centralized issue tracker for operations.
- **New Incident (`/admin/incidents/new`)**: Form to upload photos and descriptions of issues.
- **Incident Details (`/admin/incidents/[id]`)**: Detailed view of a specific incident, its photo, and resolution.

### 7. Governance & Mails Route Maps

- **Incoming Mails (`/admin/mails`)**: The corporate mailroom digital hub.
- **New Mail (`/admin/mails/new`)**: Log a newly received mail document.
- **Mail Details (`/admin/mails/[id]`)**: Work pane for resolving and archiving incoming correspondence.
- **Global Notifications (`/admin/notifications`)**: Inbox for automated system alerts.
- **User Management (`/admin/users`)**: Internal directory to set up HR roles, managers, and access tags.
- **New User (`/admin/users/new`)**: Onboard a new employee onto the platform.
- **User Details (`/admin/users/[id]`)**: Edit employee details, associations, and permissions.

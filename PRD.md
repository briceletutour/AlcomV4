# Product Requirements Document (PRD) — Alcom V3

**Version:** 1.0  
**Status:** Approved (Sprint 14)  
**Last Updated:** February 17, 2026  
**Document Owner:** Product Team

---

## 1. Executive Summary

Alcom V3 is a comprehensive Station Management System designed to digitize and optimize the operations of gas stations. It serves as a centralized platform for managing shifts, fuel inventory, financial transactions (invoices, expenses), and compliance (checklists, incidents). The goal is to reduce manual errors, Prevent fraud through strict variance tracking, and provide real-time visibility into station performance for executives.

---

## 2. Product Vision & Goals

**Vision:** To become the operating system for gas station networks, enabling seamless, transparent, and efficient management from the pump to the headquarters.

**Key Goals:**

1. **Eliminate Paperwork:** digitize all shift reports, checklists, and invoices.
2. **Variance Control:** Real-time tracking of fuel losses (sales vs. dips) with strict tolerance thresholds.
3. **Financial Integrity:** Multi-level approval workflows for all financial outflows.
4. **Operational Excellence:** Standardized digital checklists to ensure safety and brand compliance.
5. **Executive Visibility:** Aggregated dashboards for network-wide performance montoring.

---

## 3. User Personas

| Role | Responsibility | Key Interactions |
|------|----------------|------------------|
| **Station Name (Pompiste)** | Front-line operations | Shift open/close, nozzle readings, cleaning checklists. |
| **Station Manager** | Station oversight | Validating shifts, managing inventory, submitting invoices, resolving incidents. |
| **Finance Director** | Financial control | Reviewing and approving invoices, monitoring station profitability. |
| **CFO** | Strategic finance | Final approval for large expenditures (>5M XAF), treasury management. |
| **DCO (Supply Chain)** | Logistics | Validate replenishment requests, manage supplier orders. |
| **CEO / Admin** | Executive oversight | Network-wide dashboard, performance ranking, strategic decision making. |

---

## 4. Technical Architecture

**Frontend:**

* **Framework:** Next.js 14 (App Router)
* **Language:** TypeScript
* **Styling:** Tailwind CSS
* **UI Library:** Shadcn UI (Radix Primitives + Lucide Icons)
* **State Management:** Zustand
* **Data Fetching:** TanStack Query (React Query) v5
* **Forms:** React Hook Form + Zod Schema Validation

**Backend:**

* **Runtime:** Node.js
* **Framework:** Express.js
* **Language:** TypeScript
* **ORM:** Prisma
* **Database:** PostgreSQL
* **Caching/Queues:** Redis (BullMQ)

**Infrastructure:**

* **Containerization:** Docker & Docker Compose
* **Hosting:** Railway / cloud agnostic
* **Monitoring:** Custom logging (Pino), Health checks

---

## 5. Functional Requirements

### 5.1 Authentication & RBAC

* **Login:** Email/Password authentication with rate limiting (5 attempts/15 mins).
* **RBAC:** Strict role-based access control.
  * Managers are scoped to their assigned station.
  * Executives have network-wide access.
* **Session Management:** JWT-based secure sessions with auto-expiry.

### 5.2 Shift Management (Core)

* **Shift Cycle:** Open Shift -> Record Sales -> Close Shift.
* **Price Locking:** Fuel prices are locked at shift opening to prevent manipulation.
* **Data Entry:**
  * Opening/Closing Tank Dips.
  * Opening/Closing Nozzle Indexes.
  * Cash Counts & Card Payments.
* **Calculations:**
  * `Volume Sold = Closing Index - Opening Index`
  * `Dip Loss = Opening Dip - Closing Dip (+ Deliveries)`
  * `Variance = Volume Sold - Dip Loss`
  * `Revenue = Volume Sold * Price`
* **Validation:** Justification required if variance exceeds 0.5%.

### 5.3 Inventory & Supply Chain

* **Real-time Tank Levels:** Calculated based on dips and sales.
* **Replenishment:**
  * Requests based on calculated ullage (capacity - current level).
  * Validation workflow (Manager Request -> DCO Validate -> Order).
* **Deliveries:**
  * Record BL (Bill of Lading) details and compartment volumes.
  * Variance calculation (BL Quantity vs. Received Quantity).
  * Strict tolerance checks (>0.5% requires justification).

### 5.4 Financial Management

* **Invoices:**
  * Digital submission with PDF attachment.
  * **Approval Workflow:**
    * < 5M XAF: Station Manager -> Finance Director.
    * \> 5M XAF: Station Manager -> Finance Director -> CFO.
  * Status tracking: PENDING -> APPROVED -> PAID (or REJECTED).
* **Expenses:** Petty cash management for station operations.

### 5.5 Compliance & Incidents

* **Checklists:**
  * Configurable templates (e.g., Morning Safety, Hygiene).
  * **Logic:** Non-conformity triggers mandatory photo upload.
* **Auto-Incidents:**
  * Any "Non-Conform" checklist item automatically creates an Incident.
  * Incident lifecycle: OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED.
  * Resolution tracking with mandatory notes.

### 5.6 Dashboards & Reporting

* **Station Dashboard:**
  * Live tank levels, daily revenue, open shifts, pending tasks.
* **Executive Dashboard:**
  * Network-wide revenue, total variance, station rankings.
  * Drill-down capability to individual stations.
* **Audit Trail:**
  * Immutable log of critical actions (Shift Close, Invoice Approve, Price Change).

---

## 6. Non-Functional Requirements

### 6.1 Performance

* **Response Time:** API response < 500ms for 95% of requests.
* **Database:** Indexed queries for high-volume tables (Shifts, AuditLogs).
* **N+1 Prevention:** Optimized Prisma queries ensuring single-roundtrip data fetching.

### 6.2 Security

* **Data Protecting:** All sensitive inputs sanitized; SQL injection protection via Prisma.
* **File Security:** Magic-byte validation for uploads; whitelist (PDF, JPG, PNG).
* **Network:** CORS restricted to frontend domain; Helmet.js security headers.

### 6.3 Reliability & Monitoring

* **Error Handling:** Global error boundaries in React; structured error responses from API.
* **Feedback:** Toast notifications for all user actions (Success/Error).
* **Availability:** Health check endpoints for uptime monitoring.

---

## 7. UI/UX Guidelines

* **Design System:** Clean, professional interface using Shadcn UI components.
* **Responsiveness:**
  * **Mobile:** Fully functional for Pompistes/Managers (Forms, Checklists).
  * **Desktop:** Optimized for heavy data grids and dashboards (Finance, Admin).
* **Feedback:** Immediate visual feedback (loaders, toasts) for all interactions.
* **Accessibility:** Semantic HTML; high contrast text; keyboard navigable forms.

---

## 8. Development Roadmap (Post-V3)

* **Mobile App:** Native mobile application for offline-first checklist capabilities.
* **IoT Integration:** Direct integration with Automatic Tank Gauges (ATG) to remove manual dips.
* **AI Analytics:** Predictive ordering models based on sales history.
* **Multi-Tenancy:** Architecture support for running multiple distinct networks on one instance.

# 🌟 Smart Roster Management System
### Datastraw Tech Internship Assessment — Complete Solution

> **An enterprise-grade, deterministic roster planning and operations copilot built for multi-brand D2C operations companies.**
> Handles complex multi-brand scheduling, single-resource dependencies, dynamic leave replanning, strict IDOR notification isolation, and AI-assisted operations management.

---

## 📑 Table of Contents
1. [Executive Summary & Problem Statement](#1-executive-summary--problem-statement)
2. [Tech Stack & Architecture](#2-tech-stack--architecture)
3. [Database Schema & Data Architecture (18 Neon Postgres Tables)](#3-database-schema--data-architecture)
4. [Dataset & Staffing Patterns (30 Employees, 12 Brands, 6 Pods)](#4-dataset--staffing-patterns)
5. [System Flow & Core Business Logic](#5-system-flow--core-business-logic)
   - [A. Roster Generation Engine (Deterministic, Scarcity-First)](#a-roster-generation-engine)
   - [B. Conflict Detection & Classification](#b-conflict-detection--classification)
   - [C. Real-Time Leave Approval & Roster Replan Synchronization](#c-real-time-leave-approval--replan)
   - [D. Direct Brand/Process Assignment Reflection](#d-direct-brandprocess-assignment-reflection)
   - [E. Strict Notification Isolation (IDOR Immunity)](#e-strict-notification-isolation)
6. [Web Application Views & User Experience](#6-web-application-views--user-experience)
7. [AI Operations Copilot (Architecture, 18 Tools & Prompt Catalog)](#7-ai-operations-copilot)
8. [Tell Us How You Think (Assessment Section 8 Answers)](#8-tell-us-how-you-think)
9. [Video Demonstration Walkthrough & Exact Script](#9-video-demonstration-walkthrough)
10. [Challenges & Difficulties Faced](#10-challenges--difficulties-faced)
11. [One-Week Improvement Plan & Future Scope](#11-one-week-improvement-plan--future-scope)
12. [Local Setup, Migrations & Verification](#12-local-setup-migrations--verification)

---

## 1. Executive Summary & Problem Statement

Modern customer experience and operational firms support multiple D2C brands simultaneously with cross-functional teams. Managing monthly rosters manually in spreadsheets presents severe operational risks:
- **Asymmetric Team Structure**: ~80% of brands are managed by a single dedicated employee handling all processes; remaining brands have 2–3 employees sharing or splitting processes.
- **Single Point of Failure (SPOF)**: A single day of uncoordinated leave or mandatory weekly off leaves a 365-day operating brand completely dark.
- **Client Operating Calendars**: Different brands require different coverage — 365-day 24/7 coverage (including Sundays & public holidays), Monday–Saturday excluding holidays, or standard weekday-only coverage.
- **Dynamic Unplanned Changes**: Mid-month leave requests, comp-offs, and unexpected absences require instant replanning without destroying previously pinned shifts or invalidating other client SLAs.

**Our Solution**: A full-stack Next.js 14 web application backed by Neon Serverless PostgreSQL and an AI Operations Copilot that solves the underlying scheduling problem using a **pure deterministic constraint satisfaction engine** combined with an **in-memory explainable conflict detector** and an **autonomous AI Assistant**.

---

## 2. Tech Stack & Architecture

| Layer | Technology | Key Capabilities & Architecture |
| :--- | :--- | :--- |
| **Frontend Framework** | **Next.js 14 (App Router)** | Server Components, Client Modals, React 18, Tailwind CSS, Lucide Icons |
| **Language & Typing** | **TypeScript 5 (Strict Mode)** | End-to-end type safety across database entities, scheduler types, and API payloads |
| **Database** | **Neon Serverless PostgreSQL (v18.6)** | HTTP-based serverless client (`@neondatabase/serverless`), connection pooling, custom DNS fallback patch |
| **ORM / Data Layer** | **Drizzle ORM + Parameterized SQL** | Schema definition, migrations, and high-performance parameterized SQL queries |
| **Authentication & RBAC** | **Auth.js (NextAuth v5 beta)** | Credentials provider, Bcrypt hashing, session JWTs, strict RBAC: `manager`, `pod_lead`, `employee` |
| **Real-Time Client Sync** | **SWR (Stale-While-Revalidate)** | Tiered polling (`liveSWR` 30s, `realtimeSWR` 15s), focus revalidation, optimistic mutation, broadcast events |
| **Scheduling Engine** | **Deterministic Greedy Pipeline** | Zero external black-box solvers; scarcity-sorted demand matching, cost scoring, tie-breaking |
| **AI Assistant** | **Groq / Anthropic Messages API** | Function calling across 18 PostgreSQL tools, grounding against live database records, context memory |
| **Testing Suite** | **Vitest** | 37 automated unit/integration tests verifying hard constraints, replan idempotency, and IDOR isolation |

---

## 3. Database Schema & Data Architecture

The application connects to **Neon Serverless PostgreSQL** containing **18 relational tables** designed with third normal form principles and strict foreign key integrity:

```mermaid
erDiagram
    users ||--o| employees : "authenticates"
    pods ||--o{ employees : "contains"
    pods ||--o| employees : "managed by lead"
    brands ||--o{ brand_processes : "defines"
    processes ||--o{ brand_processes : "specializes"
    brand_processes ||--o{ assignments : "staffed by"
    employees ||--o{ assignments : "assigned to"
    employees ||--o{ weekly_offs : "assigned rest day"
    employees ||--o{ leaves : "requests"
    roster_months ||--o{ roster_days : "contains daily shifts"
    roster_months ||--o{ conflicts : "tracks violations"
    employees ||--o{ roster_days : "scheduled for"
    brand_processes ||--o{ roster_days : "covers"
    employees ||--o{ notifications : "receives privately"
    users ||--o{ audit_log : "actions logged"
```

### Table Catalog & Purpose

1. **`users`**: Login credentials, bcrypt password hashes, email addresses, and roles (`manager`, `pod_lead`, `employee`).
2. **`employees`**: Workforce master records (`id`, `name`, `email`, `pod_id`, `active`).
3. **`pods`**: Operational business units (`id`, `name`, `lead_employee_id`).
4. **`brands`**: D2C client brands (`id`, `name`, `code`, `category`, `active`).
5. **`processes`**: Operational functions (`id`, `name`, `code` — `CS`, `ACC`, `RET`, `NDR`).
6. **`brand_processes`**: Junction table defining client operational requirements:
   - `operating_calendar`: `all_365` (every day), `daily_no_holidays`, `mon_sat_no_holidays`, `custom`
   - `weekday_headcount`, `sunday_headcount`, `holiday_headcount`, `min_staff_required`
7. **`assignments`**: Employee eligibility mapping for brand-processes (`priority`, `is_exclusive`, `valid_from`, `valid_to`).
8. **`weekly_offs`**: Designated weekly rest day (`MON` to `SUN`) for each employee.
9. **`holidays`**: Public calendar holidays with observance dates.
10. **`leaves`**: Time-off records with approval states (`pending`, `approved`, `rejected`) and date ranges.
11. **`roster_months`**: Monthly schedule master (`id`, `month`, `status`: `draft` or `published`).
12. **`roster_days`**: Individual daily shifts (`employee_id`, `date`, `status`, `brand_process_id`, `is_pinned`).
13. **`conflicts`**: Explainable discrepancies (`type`, `severity`: `blocking`/`warning`, `message`, `suggested_fix`).
14. **`notifications`**: Private employee messages with strict IDOR isolation.
15. **`audit_log`**: Immutable audit ledger recording overrides, replans, approvals, and assignments.
16. **`import_history`**: Audit trail of dynamic CSV/Excel imports (`filename`, `status`, `row_counts`).
17. **`roster_month_rules`**: Month-specific overrides for brand-process operating schedules.
18. **`comp_offs`**: Earned compensatory off credits accrued by employees working holidays.

---

## 4. Dataset & Staffing Patterns

The production database is seeded with a realistic operations dataset satisfying all Datastraw assessment requirements:

- **Workforce**: **30 active employees** distributed across **6 operational pods** (`POD_ALPHA` through `POD_ZETA`), each with a designated pod lead (`E002`, `E006`, `E011`, `E017`, `E022`, `E027`).
- **Clients**: **12 D2C brands** across Beauty, Fashion, Food, Health, and Home.
- **Processes**: 4 core workflows:
  - **CS**: Customer Support (often 365-day coverage)
  - **ACC**: Abandoned Cart Conversions (high sales impact)
  - **NDR**: Non-Delivery Report Management (logistics)
  - **RET**: Retention and Loyalty (outreach)
- **80/20 Staffing Distribution Rule**:
  - **~80% Single-Resource Brands** (e.g. *Lumora Skincare*, *Nestwell Home*, *Trekkr Outdoor*): A single dedicated employee manages all processes. These brands highlight Single Point of Failure (SPOF) risks when leave or weekly-offs occur.
  - **~20% Multi-Resource Brands** (e.g. *Aura Glow*, *Brewhaus Coffee*, *Pulse Nutrition*): 2 to 3 cross-trained employees share or partition CS, ACC, and NDR responsibilities with built-in internal redundancy.

---

## 5. System Flow & Core Business Logic

### A. Roster Generation Engine
The generation algorithm (`lib/scheduler/engine.ts`) runs as a pure, deterministic 6-step pipeline:

```mermaid
flowchart TD
    A[Step 1: Calendar & Demand Expansion] --> B[Step 2: Pre-Solve Capacity Analysis]
    B --> C[Step 3: Scarcity-First Demand Sorting]
    C --> D[Step 4: Cost-Scored Greedy Placement]
    D --> E[Step 5: Guaranteed Weekly-Off Reservation]
    E --> F[Step 6: Post-Solve Validation & Conflict Persistence]
```

1. **Demand Expansion**: Expands `brand_processes` into daily required headcounts based on operating calendar (`all_365`, `daily_no_holidays`, etc.), day of week, and holiday calendar.
2. **Pre-Solve Capacity Analysis**: Compares available eligible personnel against demand. Any absolute deficit immediately creates an explainable blocking conflict.
3. **Scarcity-First Sorting**: Slots with the fewest available eligible staff are scheduled first to prevent premature allocation of scarce cross-trained talent.
4. **Cost-Scored Placement**: Candidates are ranked by an objective cost function:
   $$\text{Cost} = 3.0 \cdot \text{ShiftCount} + 20.0 \cdot \text{ContextSwitch} + 15.0 \cdot \text{PrefOffViolation}$$
   Ties are broken deterministically by `employee_id`.
5. **Guaranteed Weekly-Offs**: Every employee is guaranteed at least 1 day of rest per 7-day period; consecutive working days are capped at 6.
6. **Conflict Persistence**: Records blocking and warning issues directly into the `conflicts` table.

### B. Conflict Detection & Classification
- **Blocking Conflicts** (Must be resolved before publishing):
  - `INSUFFICIENT_HEADCOUNT`: Zero eligible/available staff for a brand on an operating day.
  - `UNAVAILABLE_SOLE_RESOURCE`: Sole dedicated staff on leave or weekly off without coverage.
  - `OVERALLOCATED_EMPLOYEE`: Employee double-booked across conflicting brand processes.
- **Warning Conflicts**:
  - `CONSECUTIVE_DAYS_WARNING`: Working $> 6$ days without a rest day.
  - `PREFERRED_OFF_ADJUSTED`: Weekly-off moved to satisfy mandatory client coverage.

### C. Real-Time Leave Approval & Replan
When a leave request is approved (`lib/scheduler/approve-leave.ts`):
1. **Transaction Boundary**: Starts a transactional database update.
2. **Shift Erasure**: Deletes existing working shifts for the employee across the leave window.
3. **Leave Pinning**: Inserts explicit `roster_days` with `status = 'leave'` and `is_pinned = true`.
4. **Targeted Replan**: Unpinned future shifts are automatically replanned; historical shifts remain immutable.
5. **Conflict Re-computation**: Recalculates conflicts and finds cross-trained backup candidates.
6. **Event Broadcast**: Dispatches SWR mutate events (`leave:refresh`) updating Manager and Employee views instantly.

### D. Direct Brand/Process Assignment Reflection
Manual cell overrides (`/api/roster/[month]/cell`):
- Clears prior assignments for that day to avoid unique constraint violations (`roster_days_roster_month_id_employee_id_date_brand_process_id_key`).
- Atomically inserts the new working shift with `is_pinned = true`.
- Automatically executes `syncRosterConflicts` to resolve resolved shortages and recalculate remaining gaps.

### E. Strict Notification Isolation
- Notifications are strictly scoped to `employee_id = session.user.employeeId`.
- Prevents Insecure Direct Object References (IDOR): Employee A can never query or receive Employee B's alerts.
- Verified by automated test suite (`lib/notifications/isolation.test.ts`).

---

## 6. Web Application Views & User Experience

```
Manager Portal (/manager)
├── /manager ──────────── Master Dashboard (Health KPIs, Top Conflicts, Quick Actions)
├── /manager/roster/[m] ── Interactive Master Roster Grid (Color-coded shifts, cell editor, publish gate)
├── /manager/views ────── Multi-Dimensional Views:
│   ├── Pod View ──────── Filter by Pod Alpha–Zeta, lead oversight, pod workload
│   ├── Brand View ────── Brand coverage matrix (CS, ACC, NDR) against client SLAs
│   ├── Process View ──── Cross-brand staffing for CS, ACC, NDR, RET
│   └── Employee View ─── Individual employee breakdown
├── /manager/approvals ── Leave Queue with Replan Impact Simulation & Backup Suggestions
├── /manager/master ───── Dynamic Master Data Management (Employees, Brands, Pods, Rules)
└── /manager/import ───── Preview-first Excel/CSV Importer with referential integrity checks

Employee Portal (/me)
├── /me ───────────────── Personal Monthly Calendar (Working shifts, weekly offs, holidays, leaves)
├── /me/leaves ────────── Self-Service Leave Request Form & Real-Time Status Tracker
└── /me/notifications ─── Private Isolated Inbox for Shift Changes & Leave Decisions
```

---

## 7. AI Operations Copilot

The system features an autonomous AI Operations Assistant accessible via the drawer on any manager page. It connects to Groq / Anthropic Messages API with **18 live PostgreSQL-backed tools**:

```mermaid
flowchart LR
    User([Manager Query]) --> Copilot[AI Operations Copilot]
    Copilot --> ToolRouter{Function Calling Router}
    ToolRouter -->|Health| T1[get_system_health]
    ToolRouter -->|Conflicts| T2[get_conflicts]
    ToolRouter -->|Backups| T3[find_backups]
    ToolRouter -->|Impact| T4[check_leave_impact_and_conflicts]
    ToolRouter -->|Action| T5[assign_replacement_employee]
    ToolRouter -->|Approve| T6[approve_leave]
    ToolRouter -->|Alert| T7[notify_employee]
    T1 & T2 & T3 & T4 & T5 & T6 & T7 --> Neon[(Neon PostgreSQL)]
    Neon --> Response([Grounded Operational Response])
```

### Supported Prompt Catalog & Examples

| Use Case | Actual Prompt Example | Tool Invoked | Grounded Database Action |
| :--- | :--- | :--- | :--- |
| **System Health** | *"Give me an overview of system health and coverage for November 2026."* | `get_system_health` | Queries total shifts, coverage %, and blocking vs warning conflicts. |
| **SPOF Analysis** | *"Which brands are at single point of failure risk right now?"* | `get_spof_risks` | Identifies 1-staff brands with scheduled leave or high load. |
| **Conflict Inquiry** | *"What are the critical blocking conflicts for Lumora Skincare?"* | `get_conflicts` | Retrieves exact missing headcount, dates, and suggested fixes. |
| **Backup Search** | *"Who is eligible and available to back up Lumora Skincare CS on Nov 15?"* | `find_backups` | Checks active assignments, excludes staff on leave/weekly off/working. |
| **Leave Impact** | *"What happens if I approve Rohan Das's leave request?"* | `check_leave_impact_and_conflicts` | Simulates replan, flags resulting coverage gap, and lists backup candidates. |
| **Assignment** | *"Assign Kunal Kapoor to Lumora Skincare Customer Support on Nov 15."* | `assign_replacement_employee` | Writes shift to `roster_days`, re-runs conflict sync, and prompts for notification. |
| **Notification** | *"Notify Kunal Kapoor that he has been assigned backup shift for Lumora Skincare."* | `notify_employee` | Writes strictly isolated notification to `notifications` table for Kunal (`E003`). |
| **Pod Workload** | *"How is workload distributed across Alpha Pod members?"* | `get_pod_workload` | Calculates shift counts, off distribution, and flags overworked employees. |

---

## 8. Tell Us How You Think
*(Addressing Section 8 of Datastraw Assessment)*

### 1. How did you model employees, brands, processes, pods, and their relationships?
I decoupled business processes from client brands using an explicit junction entity:
- `brands` represents D2C clients; `processes` represents operations (`CS`, `ACC`, `RET`, `NDR`).
- `brand_processes` defines client-specific operating calendars (`all_365`, `daily_no_holidays`, etc.) and headcount requirements by day type.
- `assignments` links `employees` to `brand_processes` with priority, exclusivity, and date ranges.
- `pods` group employees under a `lead_employee_id` for managerial oversight and localized leave approvals.
This normalized model easily accommodates employees managing multiple brands or processes and multiple employees collaborating on a single brand.

### 2. How does your system generate a roster and determine whether it satisfies the required constraints?
The scheduler uses a **deterministic greedy pipeline** with zero black-box dependencies:
1. Expands brand operating rules into a day-by-day required headcount matrix.
2. Conducts pre-solve capacity analysis to flag mathematical deficits immediately.
3. Sorts demand slots by scarcity (fewest eligible candidates first).
4. Assigns shifts using a weighted cost function minimizing cumulative monthly workload, brand context-switching, and preferred rest day disruptions.
5. Enforces hard constraints: guaranteed weekly offs, maximum 6 consecutive working days, and mutual exclusivity between working, leave, and weekly-off states.
6. Reconciles fulfilled slots against requirements and generates categorized `conflicts`.

### 3. How did you handle the difference between single-resource brands and brands with multiple employees?
- **Multi-Resource Brands**: The scheduler dynamically balances workload across assigned staff. If Employee A is on leave, Employee B automatically absorbs coverage without manual intervention.
- **Single-Resource Brands (~80%)**: With zero internal redundancy, unavailability (leave or weekly-off) triggers a blocking conflict (`UNAVAILABLE_SOLE_RESOURCE`). The system queries cross-trained backup staff (employees in the same pod or assigned to the same process on other brands) and presents one-click replacement recommendations.

### 4. What happens when an employee manages all processes for a brand but is unavailable on a required working day?
1. The employee's availability is treated as a hard constraint: they are placed on `leave` or `weekly_off` and never illegally double-booked.
2. A blocking conflict is raised with date, brand, missing process, and required headcount.
3. The capacity engine calculates active, cross-trained backups who are not already on shift or leave.
4. The Operations Manager or AI Copilot can assign a backup employee with one click or command.

### 5. How does your system handle conflicting requirements or insufficient staffing?
We prioritize **explainability and operational transparency**:
- Mandatory client coverage strictly overrides soft employee preferences.
- If total workforce is strictly insufficient, the engine schedules all possible legal shifts and writes structured, explainable records to `conflicts`.
- The Roster Master Grid displays a locked "Publish" button with an explicit count of blocking conflicts, preventing accidental publishing of invalid rosters.

### 6. Which parts of the process did you automate, and which did you leave under human control? Why?
- **Automated**: Demand expansion, scarcity-first greedy scheduling, constraint checking, leave replanning, backup discovery, and conflict classification.
- **Human Controlled**: Final roster publication, manual cell overrides with audit justification, and leave approval sign-offs. Operations managers bear legal and client SLA accountability; the system empowers them with simulation and intelligence without removing human discretion.

### 7. If the company doubled its team and brand count, what would you change?
1. **Hierarchical Pod Partitioning**: Partition scheduling at the pod level before global reconciliation, reducing complexity from $O(N \log N)$ to $O(K \cdot n \log n)$.
2. **Database Read Replicas & Connection Pooling**: Route high-frequency SWR polling to read replicas or edge-cached key-value stores.
3. **Multi-Row SQL Batch Inserts**: Chunk daily shift inserts in batches of 500 to minimize network roundtrips.
4. **Explicit Competency Matrix**: Replace heuristic backup scanning with a normalized skills grading table (`skill_level: 1–5`).

### 8. If you had one additional week to work on this, what would you improve first?
I would prioritize improvements that reduce manual coordination and make operational changes reach employees reliably:

1. **Email Automation**: Integrate a transactional email provider through environment-based configuration. Automatically send emails when an employee submits a leave request, when a Pod Lead or Manager approves/rejects it, when a roster is published, and when an employee's shift is changed. Use reusable HTML email templates, secure links back to the relevant portal, delivery-status logging, retry handling, and duplicate-send protection. Keep in-app notifications as the primary application record; email is an additional delivery channel.
2. **Peer-to-Peer Shift Swapping**: Allow employees to request shift exchanges, validate staffing and rest constraints automatically, and route requests to the Pod Lead for approval.
3. **Real-Time Updates**: Evaluate Server-Sent Events (SSE) or WebSockets to reduce reliance on frequent polling and make roster changes visible without manual refreshes.
4. **Multi-Shift Time Bands**: Support morning, afternoon, and night shifts with configurable minimum rest periods and overlap validation.
5. **Calendar Integration**: Provide read-only iCal feeds first, followed by optional Google Calendar integration for employee schedules.
6. **Operational Analytics**: Add workload trends, leave patterns, coverage reliability, and email-delivery metrics for managers.

---

## 10. Challenges & Difficulties Faced

Building a roster system involved more than displaying shifts in a calendar. The main challenges were coordinating employee availability, client coverage rules, and changes that happen after a roster has already been generated.

### Key technical and product challenges

1. **Modelling complex relationships**: Employees can belong to pods, support multiple brands, and be eligible for different processes. A normalized relational model was needed to represent these relationships without duplicating data.
2. **Single-resource brand coverage**: Some brands depend on one dedicated employee. A leave day or weekly off can create a coverage gap, so the scheduler must detect the risk instead of silently assigning an ineligible person.
3. **Constraint-based scheduling**: The engine must balance client headcount requirements with employee availability, weekly offs, leave, assignment validity dates, and the maximum consecutive working-day rule. Resolving one shortage can create another conflict elsewhere.
4. **Dynamic leave replanning**: Approving leave in the middle of a month requires updating the affected shifts while preserving pinned or historical roster entries and recalculating remaining coverage.
5. **Database consistency**: Roster edits can involve removing an old assignment, inserting a replacement, and refreshing conflict records. These operations need carefully designed transaction boundaries so a partial failure does not leave inconsistent data.
6. **Authentication and employee identity mapping**: A valid login account must be associated with the correct employee record. Missing or ambiguous `users.employee_id` links can prevent the employee schedule API from identifying whose calendar to return.
7. **Role-based access and notification privacy**: Manager, Pod Lead, and Employee users require different data scopes. Notification and roster APIs must enforce authorization on the server, not rely only on frontend visibility.
8. **Date and timezone handling**: Date-only values, ISO date validation, and timezone conversions can cause off-by-one-day errors or reject valid leave requests if handled inconsistently.
9. **Production debugging**: Issues that do not appear locally can occur in serverless deployment because of environment configuration, database connectivity, session cookies, or runtime differences. Network responses and deployment logs are essential for diagnosing them.

### Lessons learned

- Treat employee identity, authorization, and data integrity as core domain logic.
- Validate scheduling rules in the backend even when the UI already validates them.
- Use transactions for related database writes and make retryable operations idempotent.
- Return actionable, sanitized API errors rather than hiding every failure behind a generic message.
- Separate confirmed behavior from planned features; a successful build alone does not prove that a production workflow works end to end.

> **Project status note:** The challenges above describe engineering areas encountered during development and debugging. They should not be interpreted as a claim that every production issue has been fully resolved. Authentication, account linking, roster editing, and live workflow behavior should be verified against the deployed environment.

---

## 11. One-Week Improvement Plan & Future Scope

The following is a proposed one-week plan, not a claim that these features are already implemented. The order prioritizes reliability before adding new functionality.

| Day | Focus | Planned deliverables |
| :--- | :--- | :--- |
| **Day 1** | Authentication & account integrity | Reproduce login/CSRF failures; verify role sessions; audit employee-to-user links; create a safe report for missing or ambiguous links. |
| **Day 2** | Roster editing & database safety | Trace roster-cell failures; make related writes transactional; verify assignment date rules, pinned shifts, and conflict recalculation. |
| **Day 3** | Leave & Pod Lead workflows | Test leave submission, approval/rejection, Pod Lead scope, and manager/Pod Lead notifications; verify date-only handling. |
| **Day 4** | Email automation | Integrate a transactional email provider; create templates for leave submitted, leave decision, roster published, and shift changed; add retries, delivery logs, and duplicate-send protection. |
| **Day 5** | Performance & usability | Profile slow APIs and database queries; review SWR polling; improve loading/error states and responsive navigation. |
| **Day 6** | Testing & security | Add regression tests for authentication, role permissions, schedule APIs, roster constraints, leave workflows, and notification isolation. |
| **Day 7** | Deployment & verification | Run typecheck, lint, tests, and production build; deploy to Vercel; perform manager, Pod Lead, and employee smoke tests; document remaining risks. |

### Future scope

- **Automated email notifications** with delivery tracking and configurable templates.
- **Shift swap workflow** with automatic constraint checks and approval.
- **Real-time roster collaboration** using SSE or WebSockets after evaluating the operational cost.
- **Employee calendar integration** through iCal and optional Google Calendar sync.
- **Advanced workforce analytics** for utilization, workload balance, leave trends, and SLA coverage.
- **Skills and competency matrix** to improve backup recommendations beyond current assignment eligibility.
- **Audit and reporting enhancements** with exportable change history and operational summaries.
- **Scalable scheduling** through pod-level planning, batched writes, and measured database query optimization.

## 12. Video Demonstration Walkthrough

### ⏱️ Video Structure (3–5 Minutes)

| Time | Scene / Focus | URL / Screen | Key Actions & Speaking Points |
| :--- | :--- | :--- | :--- |
| **0:00 - 0:45** | **Introduction & Architecture** | `/manager` | Introduce the Datastraw Smart Roster System. Show Neon Postgres connection (18 tables, 30 employees, 12 brands, 6 pods). Explain the 80/20 single vs multi-resource structure. |
| **0:45 - 1:30** | **Roster Generation & Grid** | `/manager/roster/2026-11` | Show the Master Roster Grid for November 2026. Explain color-coded shifts (`working`, `weekly_off`, `leave`). Demonstrate filtering by Pod (Alpha Pod) and Brand (Lumora Skincare). |
| **1:30 - 2:15** | **Different Brand Schedules** | `/manager/views` | Navigate to Brand View. Show *Lumora Skincare* requiring 365-day CS coverage vs *Brewhaus Coffee* requiring Mon–Sat coverage. Show Pod View and Process View. |
| **2:15 - 3:15** | **Handling Changes (Leave & Replan)** | `/manager/approvals` & `/me` | Demonstrate dynamic change handling: Rohan Das (`E005`) requests leave on Nov 15 for Lumora Skincare. Show replan simulation flagging coverage gap and suggesting backup Kunal Kapoor (`E003`). Approve leave; show instant roster sync. |
| **3:15 - 4:15** | **AI Operations Copilot** | Drawer (Right Side) | Open AI Assistant drawer. Enter actual prompts: query health, inspect conflicts, find backups, appoint Kunal Kapoor, and notify him. Show tool grounding in action. |
| **4:15 - 4:45** | **Employee Portal & Isolation** | `/me` | Log in as Rohan Das (`E005`): show approved leave on Nov 15. Log in as Kunal Kapoor (`E003`): show private notification and new shift assignment. Demonstrate strict IDOR isolation. |
| **4:45 - 5:00** | **Conclusion & Quality Checks** | Terminal / VS Code | Show clean `npm run typecheck` and 37 passing unit tests in `npm test`. Conclude with key design principles. |

---

## 13. Local Setup, Migrations & Verification

### 1. Prerequisites
- Node.js 18+ (tested on Node v20/v24)
- Neon PostgreSQL database instance

### 2. Environment Setup
Create a `.env` file in the project root:
```env
# Neon Serverless Postgres connection string
DATABASE_URL=postgresql://user:password@ep-sample-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require

# Auth.js secret for session encryption
AUTH_SECRET=generate_a_random_32_character_secret_string

# AI Assistant LLM Provider (Groq or Anthropic)
GROQ_API_KEY=gsk_your_groq_api_key_here
ANTHROPIC_API_KEY=sk-ant-your_anthropic_api_key_here

# Manager Bootstrap Credentials
BOOTSTRAP_MANAGER_EMAIL=manager@opscompany.com
BOOTSTRAP_MANAGER_PASSWORD=ManagerSecurePassword123!
```

### 3. Installation & Database Setup
```bash
# 1. Install dependencies
npm install

# 2. Run idempotent database migrations (creates 18 tables and indexes)
npm run db:migrate

# 3. Bootstrap initial Manager account
npm run db:bootstrap-manager
```

### 4. Running the Application
```bash
# Start Next.js development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the application.

### 5. Automated Verification & Testing
```bash
# Run TypeScript compilation check (0 errors)
npm run typecheck

# Run 37 Vitest unit & scenario tests (100% pass)
npm test
```

---

*Built with precision for the Datastraw Tech Internship Assessment.*

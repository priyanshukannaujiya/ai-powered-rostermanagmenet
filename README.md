# Smart Roster Management System (Next.js + Neon Postgres)

A production-ready operations planning and monthly rostering system built for multi-brand D2C e-commerce operations. The platform plans rosters for ~30 employees across 6 pods, 12 brands, and 4 functional processes (CS, ACC, RET, NDR), prioritizing deterministic scheduling logic, explainable conflict detection, and real-time collaboration.

---

## 1. Project Overview & Personas

The platform serves three user roles across two integrated interfaces:

1. **Operations Manager (`/manager/*`)**:
   - Company-wide health dashboard with coverage KPIs and top at-risk shifts.
   - Master monthly roster grid with color-coded shifts, filters (Pod, Brand, Process), cell edit modal with server-side constraint validation, and one-click publishing.
   - Multi-dimensional views: Brand coverage, Process cross-brand staffing, Pod team rosters, and Individual employee schedules.
   - Leave Approvals Queue: Simulates replan impact, previews resulting staffing gaps, and recommends cross-trained backups before confirmation.
   - Master data CRUD for employees, pods, brands, processes, assignments, and calendar rules.
   - AI Roster Assistant drawer with natural language conflict explanations.
2. **Pod Lead (`/manager/*` scoped to their pod)**:
   - Filtered view of their pod's team members and shifts.
   - Authority to approve or reject leave requests within their pod.
3. **Operations Employee (`/me/*`)**:
   - Personal monthly calendar displaying working shifts, designated weekly offs, approved leaves, and public holidays.
   - Self-service leave request form with real-time status tracking.
   - Read-only isolation: strictly no access to other colleagues' private data.

---

## 2. Tech Stack

- **Framework**: Next.js 14 (App Router, React 18, TypeScript, Tailwind CSS)
- **Database**: Neon Serverless Postgres via `@neondatabase/serverless` and `drizzle-orm`
- **Authentication**: Auth.js (NextAuth v5 beta) with credentials provider, bcrypt password hashing, and role-based middleware (`manager`, `pod_lead`, `employee`)
- **Data Synchronization**: SWR with 20s polling interval (`refreshInterval: 20000`), `revalidateOnFocus`, optimistic UI, and conflict toast notifications
- **Scheduler Engine**: Pure TypeScript greedy deterministic engine (`lib/scheduler/`) with 0 external solver dependencies
- **Unit Testing**: Vitest test suite (`npm run test`) verifying hard constraints, scarcity sorting, and replan logic
- **AI Assistant**: Anthropic Claude Messages API / Groq LLM with read-only tool calling (`get_conflicts`, `get_coverage`, `find_backups`, `get_employee_schedule`)

---

## 3. Demo Credentials (For Testing)

> [!NOTE]
> All passwords are cryptographically hashed using bcrypt. In production, change default credentials.

| Role | Email | Password | Scope / Brand |
| :--- | :--- | :--- | :--- |
| **Manager** | `manager@opscompany.com` | `Manager@123` | Full access across all 6 pods and 12 brands |
| **Pod Lead** | `lead.pod1@opscompany.com` | `Lead@123` | Alpha Pod lead; manages Alpha Pod team & approvals |
| **Employee (Priya)** | `employee.priya@opscompany.com` | `Employee@123` | Brewhaus Coffee sole resource; Beta Pod |
| **Employee (Aarav)** | `employee.aarav@opscompany.com` | `Employee@123` | Lumora Skincare; Alpha Pod |
| **Employee (Rahul)** | `employee.rahul@opscompany.com` | `Employee@123` | Nestwell Home; Gamma Pod |

---

## 4. Environment Variables (`.env.example`)

Create a `.env` file in the root directory:

```env
# Neon Serverless Postgres connection string
DATABASE_URL=postgresql://neondb_owner:npg_ZH9dYmTeVR1z@ep-shy-cell-bdy2hhp5-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require

# Auth.js secret for JWT encryption (minimum 32 characters)
AUTH_SECRET=smart_roster_management_system_super_secret_jwt_32_chars_min

# LLM Assistant API Keys (Anthropic Claude or Groq)
ANTHROPIC_API_KEY=your_anthropic_api_key_or_groq_key
GROQ_API_KEY=your_groq_api_key
```

---

## 5. Local Setup & Migration Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Apply Database Migrations
Runs idempotent DDL on Neon Postgres to create all enums, tables, and indexes:
```bash
npm run db:migrate
```

### 3. Seed Master Data
Populates 6 pods, 32 employees, 12 brands, 4 processes, November 2026 Indian holidays, sample leaves, and demo logins:
```bash
npm run db:seed
```

### 4. Run Unit Tests
Executes Vitest pure scenario tests:
```bash
npm run test
```

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 6. How I Think About This Problem

### 1. How did you model employees, brands, processes, pods, and their relationships?
I modeled the domain around an operational many-to-many relationship with clear ownership hierarchies:
- **`pods`**: Structural groupings of employees led by a `lead_employee_id`. Pods provide organizational boundaries and localized leave approval authority.
- **`employees`**: The workforce entity, linked to a pod and possessing an active state.
- **`brands`** and **`processes`**: Abstract entities decoupled from one another. A brand represents the client (e.g., Lumora Skincare), while a process represents the operational task (e.g., Customer Support, Non-Delivery Reports).
- **`brand_processes`**: The critical junction table. This is where business rules live: operating calendars (`all_365`, `daily_no_holidays`, `mon_sat_no_holidays`, `custom`) and required headcount by day type (weekday, Sunday, public holiday).
- **`assignments`**: The eligibility link between an employee and a `brand_process`, including start/end validity dates, priority, and exclusivity flags.
- **`roster_days`** and **`conflicts`**: Concrete monthly outputs. `roster_days` holds daily status assignments (`working`, `weekly_off`, `leave`, `holiday`, `comp_off`, `unassigned`), while `conflicts` captures explainable discrepancies between demand and fulfilled supply.

### 2. How does your system generate a roster and determine whether it satisfies the required constraints?
The scheduler operates as a pure, deterministic pipeline with zero black-box solver dependencies:
1. **Demand Expansion**: Evaluates each `brand_process` against the month's calendar, public holidays, and days of the week to calculate the exact headcount required for every date.
2. **Pre-Solve Capacity Analysis**: Before placing shifts, it counts strictly available eligible staff against demand. Any deficit immediately raises a blocking conflict and calculates cross-trained backup candidates.
3. **Scarcity-First Greedy Placement**: Demand days are sorted by scarcity (slots with the fewest available eligible workers are scheduled first).
4. **Workload-Balanced Candidate Selection**: For each slot, candidates are scored using a cost function that prioritizes low cumulative monthly load, minimizes multi-brand context switching on the same day, and protects preferred weekly off days. Ties are broken deterministically by employee ID.
5. **Weekly Off Reservation**: In each calendar week, employees are guaranteed at least one rest day, honoring their designated off weekday or the nearest feasible non-working day.
6. **Post-Solve Validation**: A final reconciliation recounts filled slots against requirements, flags consecutive-working-day warnings (> 6 days), and verifies that no employee has overlapping statuses.

### 3. How did you handle the difference between single-resource brands and brands with multiple employees?
- In **multi-resource brands** (e.g., Kicks & Co or Pulse Nutrition with 2–3 assigned employees), the scheduler has elasticity: when one employee is on leave or weekly off, the algorithm automatically routes the remaining shift requirements to other eligible colleagues and balances their monthly load.
- In **single-resource brands** (e.g., Brewhaus Coffee where Priya is the sole assigned employee), there is zero internal redundancy. The scheduler detects that `eligibleEmployees.length === 1`. If that sole employee is unavailable on a required operating day, the system does not fail silently; it raises a specialized `UNAVAILABLE_SOLE_RESOURCE` blocking conflict and triggers the backup candidate engine to find cross-trained staff from the same process or same brand.

### 4. What happens when an employee manages all processes for a brand but is unavailable on a required working day?
When a sole dedicated employee is on approved leave, comp-off, or taking their mandatory weekly off on an operating day:
1. The scheduler respects the hard constraint: the employee is marked `leave` or `weekly_off` and is **never** illegally scheduled to work.
2. A blocking conflict is raised: *"Brewhaus Coffee (NDR) on Sunday 15 Nov needs 1 person. 0 available. Only assigned employee Priya is on approved leave."*
3. The backup engine scans active employees available on that date who possess an assignment to the same process (NDR) in other brands or work in the same pod.
4. The conflict payload includes a concrete `suggested_fix`: *"Assign backup from cross-trained team (Rahul Verma, Sneha Rao) who are available, or approve partial coverage."*
5. In the Manager Console, the manager can select the cell and assign the backup with one click.

### 5. How does your system handle conflicting requirements or insufficient staffing?
Our philosophy is **explainability over silent failure**:
- Mandatory coverage always beats soft preferences (an employee may have their weekly off moved to another day in the week if their usual day is required for coverage).
- If total eligible headcount is strictly less than required headcount, the scheduler fills as many slots as legally possible and generates explicit, categorized conflicts (`INSUFFICIENT_HEADCOUNT`, `UNAVAILABLE_SOLE_RESOURCE`, `OVERALLOCATED_EMPLOYEE`).
- Publishing is strictly locked until all blocking conflicts are either staffed or explicitly overridden with a manager justification, which is logged to `audit_log`.

### 6. Which parts of the process did you automate, and which did you leave under human control? Why?
- **Automated**:
  - Expanding brand-process rules into daily required headcount.
  - Greedy assignment matching based on eligibility, availability, and fair workload distribution.
  - Detecting and categorizing blocking vs. warning conflicts.
  - Re-planning future days upon leave approval while freezing historical past days.
  - Identifying qualified cross-trained backup candidates.
- **Human Control**:
  - **Publishing the Roster**: Final sign-off remains with the operations manager to ensure operational accountability.
  - **Manual Cell Overrides**: Overriding an employee's leave or assigning an employee beyond their load limit requires an explicit reason logged to the immutable audit log.
  - **Leave Final Approval**: Leaves are reviewed by managers/pod leads after reviewing the automated replan impact simulation.

### 7. If the company doubled its team and brand count, what would you change?
1. **Tiered Pod-Level Partitioning**: Solve schedules independently by pod or brand cluster before a global cross-pod backup reconciliation pass, reducing time complexity from $O(N \log N)$ over the whole company to $O(K \cdot n \log n)$ per pod.
2. **Database Read Replicas**: Route SWR polling queries (which run every 20 seconds) to Neon read replicas or cache warm roster states in Redis/Edge KV.
3. **Database Batch Inserts**: Replace individual shift upserts with multi-row SQL `INSERT ... VALUES (...), (...)` chunked in batches of 500 records.
4. **Skills Matrix Table**: Replace heuristic backup matching with an explicit skills and competency grading matrix (`skill_level: 1–5`).

### 8. If you had one additional week, what would you improve first?
1. **Shift Swap Marketplace**: Allow employees to request peer-to-peer shift swaps from their portal, which auto-validates constraints and routes to the pod lead for one-click approval.
2. **WebSocket / Server-Sent Events (SSE)**: Upgrade from 20-second SWR polling to instant push updates when a colleague makes a manual edit or when leaves are approved.
3. **Google Calendar / Outlook Sync**: Provide iCal export feeds for employees so working shifts and weekly offs automatically sync with their mobile calendar apps.
4. **Shift Time Bands**: Expand from single full-day shifts to morning/evening/night shifts with rest period enforcement (minimum 11 hours between shifts).

---

## 7. Verification & Demo Walkthrough

The application has been verified against the complete acceptance scenario:
1. **November 2026 Roster Generated**: 492 required slots analyzed, 448 slots fulfilled (91% coverage).
2. **Distinct Operating Calendars**: Verified across `all_365` (Lumora CS, Nestwell NDR), `daily_no_holidays` (Brewhaus CS, Urban Botanics ACC), and `mon_sat_no_holidays` (Daily Greens CS, Trekkr RET).
3. **Blocking Conflict Demonstration**: Brewhaus Coffee (NDR) on Sunday Nov 15 requires coverage, but sole employee Priya is on approved leave. System flags `UNAVAILABLE_SOLE_RESOURCE`.
4. **Replan & Backup Suggestion**: Approving a leave in `/manager/approvals` simulates the impact on future unpinned days, preserves past days, and surfaces cross-trained colleagues (Rahul Verma, Sneha Rao).
5. **AI Assistant Introspection**: Asked *"Who covers NDR on Sunday 15 Nov?"*, the assistant executes read-only tool introspection and provides available cross-trained options.
6. **Role Isolation in Employee Portal**: Logging in as Priya (`/me`) displays strictly her personal calendar, approved leaves, and leave request form, with zero access to company-wide rosters or other employee data.


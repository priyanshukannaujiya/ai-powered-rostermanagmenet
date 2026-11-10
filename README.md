# Smart Roster Management System (Next.js + Neon Postgres)

A monthly roster planning system for multi-brand operations. It loads employees, pods, brands, processes, and schedule rules from manager-imported data, then generates rosters with deterministic scheduling and explainable conflict detection.

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
- **Unit Testing**: Vitest test suite (`npm run test`) verifying hard constraints, scarcity sorting, replan logic, and Excel import validation
- **Dynamic Import**: Preview-first CSV and Excel import workflows with validation, referential integrity checks, database diffing, and roster generation
- **AI Assistant**: Anthropic Claude Messages API / Groq LLM with 17 live PostgreSQL-backed tools (`get_import_summary`, `list_brands`, `list_processes`, `get_pod_members`, `get_conflicts`, `find_backups`, etc.)

---

## 3. Accounts and First-Time Setup

The application does not create demo users, pods, brands, or roster data. Set up a manager account, sign in, and upload your organization data.

To provision or reset the manager login, set `BOOTSTRAP_MANAGER_EMAIL` and `BOOTSTRAP_MANAGER_PASSWORD` in a trusted local environment with access to the target database, then run:

```bash
npm run db:bootstrap-manager
```

The manager password must be at least 16 characters. The legacy `npm run db:seed` command is now a safe alias for manager bootstrap; it no longer truncates or populates the database.

CSV employee rows must include `initial_password` (minimum 12 characters). The employee email is the login name. Employees whose IDs are listed as pod leads receive the pod-lead role; all other imported employees receive the employee role. Passwords are bcrypt-hashed before storage. The downloadable templates contain headers only; the synthetic CSV under `fixtures/` is for testing and must not be used for production credentials. Do not email or commit production credential files; distribute initial passwords through a secure channel. To rotate imported account passwords, import the employee again with a new initial password.

---

## 4. Environment Variables (`.env.example`)

Create a `.env` file in the root directory:

```env
# Neon Serverless Postgres connection string
DATABASE_URL=

# Auth.js secret for JWT encryption (generate a unique random value of at least 32 characters)
AUTH_SECRET=generate_a_unique_secret_of_at_least_32_characters

# LLM Assistant API Keys (Anthropic Claude or Groq)
ANTHROPIC_API_KEY=your_anthropic_api_key_or_groq_key
GROQ_API_KEY=your_groq_api_key

# Used only by npm run db:bootstrap-manager; never expose these in client-side settings
BOOTSTRAP_MANAGER_EMAIL=manager@your-company.example
BOOTSTRAP_MANAGER_PASSWORD=use_a_unique_random_password_of_at_least_16_characters
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

### 3. Provision Manager Access
Creates or resets only the manager account using the environment variables above. It does not seed or delete roster records:
```bash
npm run db:bootstrap-manager
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
- In **multi-resource brands**, the scheduler can route shifts to other eligible colleagues when an employee is unavailable and balance their monthly load.
- In **single-resource brands**, there is no internal redundancy. If the sole eligible employee is unavailable on a required operating day, the system raises a blocking conflict and identifies cross-trained backup candidates where available.

### 4. What happens when an employee manages all processes for a brand but is unavailable on a required working day?
When a sole dedicated employee is on approved leave, comp-off, or taking their mandatory weekly off on an operating day:
1. The scheduler respects the hard constraint: the employee is marked `leave` or `weekly_off` and is **never** illegally scheduled to work.
2. A blocking conflict is raised describing the configured brand/process, date, required coverage, and reason no eligible employee is available.
3. The backup engine scans active employees available on that date who possess an assignment to the same process (NDR) in other brands or work in the same pod.
4. The conflict payload includes a suggested fix based on the configured assignments.
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

## 7. Verification

Run `npm test` for scheduler and import tests, `npm run typecheck` for TypeScript validation, and `npm run build` for a production build. The files under `fixtures/` are synthetic test data; the application does not seed or display them as live roster records.

---

## 8. Dynamic Roster Data Import

The manager import page (`/manager/import`) supports the existing multi-sheet Excel workflow and a single-file CSV workflow.

### Single-CSV workflow

Download `smart_roster_template.csv` from the import page. Each row represents one employee-to-brand/process assignment, so repeat pod, employee, brand, and process details when an employee has multiple assignments. Employee-only rows may leave the brand/process columns blank.

The CSV includes:

- `schedule_month` (`YYYY-MM`), which selects the month to regenerate.
- Pod, employee, and pod-lead details.
- Employee weekly-off day, active status, and `initial_password` (at least 12 characters).
- Employee email is used as the login. Pod lead IDs in the pod rows determine which imported users receive pod-lead access.
- Brand and process names/codes, operating calendar, and weekday/Sunday/holiday headcount rules.
- Assignment validity dates, priority, and exclusivity.

CSV uploads are validated and previewed before commit. They **merge** by natural keys: matching records are updated, new records are added, and records omitted from the file are preserved. Weekly-off changes apply only to the selected month. CSV imports do not contain or modify leave requests; employees continue to submit leave through the employee portal. Existing holidays and approved leave requests remain available to roster generation. Initial passwords are bcrypt-hashed and never returned to the browser. Distribute credentials securely, and use unique real passwords instead of the test-only values in the sample fixture.

The AI assistant queries the live database, so imported pods, employees, brands, schedules, and roster updates are available through its tools after commit. Its existing role-based access rules continue to apply.

### Excel workbook workflow
The multi-sheet Excel template is blank and remains available for full workbook imports. Unlike CSV, workbook imports use replacement semantics and may deactivate employees omitted from the workbook. The workbook format has a Leaves sheet; keep leave information in the employee portal when using the single-CSV workflow.

### 1. Workbook Structure & Template (8 Sheets)
Download the official template directly from `GET /api/import/template` or the Import page:

| Sheet | Columns (Exact snake_case) | Description |
| :--- | :--- | :--- |
| **`Pods`** | `pod_code`, `pod_name`, `lead_employee_id` | Operational pods and designated pod leads. |
| **`Employees`** | `employee_id`, `name`, `email`, `pod_code`, `weekly_off_day`, `active` | Employee records and designated weekly-off days (`MON`–`SUN`). |
| **`Brands`** | `brand_code`, `brand_name`, `category` | D2C client brands and industry categories. |
| **`Processes`** | `process_code`, `process_name` | Operational functions (`CS`, `ACC`, `RET`, `NDR`). |
| **`Schedules`** | `brand_code`, `process_code`, `operating_calendar`, `weekday_headcount`, `sunday_headcount`, `holiday_headcount`, `min_staff_required` | Brand operating rules and headcount targets (`all_365`, `daily_no_holidays`, `mon_sat_no_holidays`, `custom`). |
| **`Assignments`** | `employee_id`, `brand_code`, `process_code`, `valid_from`, `valid_to`, `priority`, `is_exclusive` | Staff eligibility mapping with priority and exclusivity. |
| **`Leaves`** | `employee_id`, `date_from`, `date_to`, `type`, `status` | Legacy workbook leave input; CSV imports do not include or modify leaves. |
| **`Holidays`** | `date`, `name` | Public holidays for the roster calendar. |

### 2. Validation & Referential Integrity Engine
- **Structural Integrity**: Missing sheets or missing column headers reject the file immediately with exact missing names.
- **Data Normalization**: Automatic string trimming, code uppercasing, boolean normalization (`TRUE/FALSE/yes/no/1/0`), and strict `YYYY-MM-DD` date parsing.
- **Zod Row-Level Validation**: Collects **all** errors with `{ sheet, row, field, message }` without early abort.
- **Referential Integrity**:
  - `pod_code` in Employees must exist in Pods.
  - `lead_employee_id` in Pods must exist in Employees and belong to that exact pod.
  - `brand_code` and `process_code` in Schedules and Assignments must exist in Brands and Processes.
  - `employee_id` in Assignments and Leaves must exist in Employees.
  - `valid_to >= valid_from` and `date_to >= date_from`.
  - Primary keys unique in every sheet.
  - Overlapping assignments for the same employee, brand, and process are flagged.
  - **Hard Blocker**: Any schedule with 0 eligible assigned employees blocks preview.
- **Warnings**: Identifies single-resource brands and processes where eligible headcount < required headcount.

### 3. Preview & Commit Workflow
1. **Preview (`POST /api/import/preview`)**: Validates the upload, runs entity diffs against PostgreSQL, and writes **zero** records. CSV previews use merge semantics; workbook previews use replacement semantics.
2. **Commit (`POST /api/import/commit`)**:
   - Re-validates and upserts records on the server.
   - CSV imports merge records and preserve records omitted from the CSV; they do not import leaves.
   - Workbook imports replace the imported employee/assignment set and can deactivate employees omitted from the workbook.
   - Records import metadata and row counts.
   - Automatically triggers the deterministic scheduler to solve and regenerate the roster for the affected month.
   - Review the preview carefully, especially before committing a replacement-mode workbook.

---

## 9. Assumptions Section

1. **Operating Month Scope**: CSV imports set the roster month with `schedule_month`; if omitted for a workbook import, the current month is used. Master data spans across months.
2. **Natural Keys**: Entities are uniquely identified by natural codes (`employee_id`, `pod_code`, `brand_code`, `process_code`) rather than arbitrary names.
3. **Weekly-Off Policy**: Every active employee has 1 designated weekly rest day per calendar week. In high-demand scenarios, the scheduler may adjust an employee's rest day to another day within the same week to satisfy mandatory coverage.
4. **Consecutive Days Limit**: The scheduler enforces a hard limit of at most 6 consecutive working days without a rest day.
5. **Deterministic Ties**: If multiple eligible employees have identical cost scores for a shift, ties are broken deterministically by `employee_id` sorting.
6. **Import Idempotency**: Re-uploading an earlier workbook restores that exact master state and re-solves schedules without orphaned data.

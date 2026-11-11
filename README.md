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

### Technical side / language features

This application is built as a full-stack operational system using modern JavaScript/TypeScript patterns instead of a static dashboard. The core technical strengths are:

- **Next.js + TypeScript** for a scalable full-stack app architecture with typed API routes and reusable UI components
- **React + Tailwind CSS** for a clean, responsive manager and employee experience
- **PostgreSQL + Neon** for persistent storage of employees, pods, rules, roster month data, conflicts, approvals, and assignments
- **Role-based auth and permission gates** so managers, pod leads, and employees only access the data they are authorized to see
- **Server-side validation and business rules** to prevent invalid assignments, blocked leave approvals, and roster publishing with unresolved blocking conflicts
- **Deterministic roster engine** written in TypeScript for fair scheduling, coverage balancing, and explainable conflict resolution
- **Live data refresh with SWR** so roster changes, approvals, and notifications update quickly across manager and employee pages
- **AI assistant grounded in live records** using tool-calling against the database instead of relying on memory or unverified assumptions
- **CSV/PDF export support** for manager use cases and interview/demo readiness
- **Notification and approval workflow integration** for real-world operations management, where staff schedule changes must be visible to the employee portal after publication

This project is not just a frontend UI — it combines scheduling logic, data validation, permission scopes, AI querying, and live operational workflows into a single production-style web app.

---

## 3. Accounts and First-Time Setup

The application does not create demo users, pods, brands, or roster data. Set up a manager account, sign in, and upload your organization data.

To provision or reset the manager login, set `BOOTSTRAP_MANAGER_EMAIL` and `BOOTSTRAP_MANAGER_PASSWORD` in a trusted local environment with access to the target database, then run:

```bash
npm run db:bootstrap-manager
```

The manager password must be at least 16 characters. The legacy `npm run db:seed` command is now a safe alias for manager bootstrap; it no longer truncates or populates the database.

CSV employee rows must include `initial_password` (minimum 12 characters). The employee email is the login name. Employees whose IDs are listed as pod leads receive the pod-lead role; all other imported employees receive the employee role. Passwords are bcrypt-hashed before storage. The downloadable templates contain headers only; the synthetic CSV under `fixtures/` is for testing and must not be used for production credentials. Do not email or commit production credential files; distribute initial passwords through a secure channel. To rotate imported account passwords, import the employee again with a new initial password.

## 4. Adding and Managing Roster Data

Managers have two ways to enter real operational data:

1. **Import new data for a month** at `/manager/import`. Choose the target month before selecting a CSV or Excel file. The preview shows validation warnings and the selected month; a file's own month value does not silently select or replace the manager's choice. Importing updates included shared master records and stores operating rules, assignments, weekly offs, leave dates, and generated roster data for the selected month. Assignment and leave ranges are clipped to that month. Holidays outside the selected month are rejected. Records omitted from a file are preserved; imports do not deactivate or delete omitted employees, brands, or assignments. The import and roster generation run in one database transaction and roll back together on failure.
2. **Add, edit, deactivate, or delete records** at `/manager/master`. Forms are specific to employees, pods and leads, brands, processes/tasks, brand-process coverage rules, assignments, weekly offs, and holidays. Foreign-key relationships and required values are validated. Referenced pods or processes cannot be deleted; employee, brand, rule, and assignment history is preserved by deactivation. Employee login setup is optional in the employee form and requires an initial password of at least 12 characters; an existing password is never returned to the browser.

Employees, pods, brands, processes, and coverage rules are shared master data. A monthly roster has its own generated schedule and imported operating-rule overrides. Editing shared data does not silently rewrite an already generated roster; review the impact and explicitly regenerate the month. See `/manager/rosters` to browse stored months, status, shifts, and conflicts. The AI assistant reads the current database, including month-specific coverage rules for its selected month.

An empty database remains empty until a manager imports or adds records. The manager account is independent of roster data and is not deleted by these workflows. The migration adds the import-month and per-month rule storage; apply `npm run db:migrate` to the intended database before using the updated application. Verify the target environment before running migrations; this change does not itself run migrations or modify production data.

---

## 5. Environment Variables (`.env.example`)

Create a `.env` file in the root directory:

```env
# Neon Serverless Postgres connection string
DATABASE_URL=xyz

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

## 6. Local Setup & Migration Instructions

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

## 7. How I Think About This Problem

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

## 8. Verification

Run `npm test` for scheduler and import tests, `npm run typecheck` for TypeScript validation, and `npm run build` for a production build. The files under `fixtures/` are synthetic test data; the application does not seed or display them as live roster records.

---

## 9. Dynamic Roster Data Import

Managers have two distinct input options: import a roster file for a specifically selected month, or manage individual records on `/manager/master`. Both options use real database records; no demo records are generated.

### Single-CSV workflow

Download `smart_roster_template.csv` from the import page. Each row represents one employee-to-brand/process assignment, so repeat pod, employee, brand, and process details when an employee has multiple assignments. Employee-only rows may leave the brand/process columns blank.

The CSV includes:

- `schedule_month` (`YYYY-MM`), retained as a workbook column; the required month selector on the import page is authoritative.
- Pod, employee, and pod-lead details.
- Employee weekly-off day, active status, and `initial_password` (at least 12 characters).
- Employee email is used as the login. Pod lead IDs in the pod rows determine which imported users receive pod-lead access.
- Brand and process names/codes, operating calendar, and weekday/Sunday/holiday headcount rules.
- Assignment validity dates, priority, and exclusivity.

CSV uploads are validated and previewed before commit. They merge matching shared records; records omitted from the file are preserved. Coverage rules, assignments, weekly offs, leave dates, and generated roster data are scoped to the selected month. Leave ranges are clipped to that month, and holiday rows outside it are rejected. CSV imports do not replace leave requests not present in the file; employees continue to submit leave through the employee portal. Initial passwords are bcrypt-hashed and never returned to the browser. Distribute credentials securely, and use unique real passwords instead of the test-only values in the sample fixture.

The AI assistant queries the live database, so imported pods, employees, brands, schedules, and roster updates are available through its tools after commit. Its existing role-based access rules continue to apply.

### Excel workbook workflow
The multi-sheet Excel template is blank and remains available. Excel imports use the same selected-month workflow and merge/preserve behavior as CSV; omitted employees, brands, and assignments are not deleted or deactivated. The workbook format has a Leaves sheet. Workbook imports do not create employee logins because the workbook has no initial-password field; add an initial password through employee management or use the CSV workflow.

### Dynamic master-data management
The manager page offers field-specific forms to create, edit, and deactivate employee, pod/lead, brand, process/task, brand-process rule, assignment, weekly-off, and holiday records. Database relationships and required values are validated on the server. Referenced pods and processes are protected from deletion; history-bearing rows are deactivated instead of removed. Employee password hashes are never sent to the client.

The shared master configuration is distinct from a roster month. Imported schedules are stored as per-month coverage overrides; regenerating one month reads its override and does not change other months' roster rows. The `/manager/rosters` page lists each stored month, roster status, shift count, and conflicts. The AI assistant uses live master data and the selected month's rule overrides.

### AI assistant and portal notifications

The assistant answers roster, conflict, availability, configuration, and leave questions from live database records and carries the current chat context through follow-up questions. It reports unresolved conflicts with their dates and suggested fixes, and availability checks exclude approved leave, effective weekly offs, and existing roster assignments when a roster exists. If availability cannot be verified because the selected month has no roster, the assistant must say so.

Roster assignments made through the assistant do not implicitly approve a leave, mark conflicts resolved, or notify anyone. After a successful assignment, the assistant offers to notify the named employee; it sends only after a manager directly requests or confirms the notification. The employee receives the notice in `/me`, and their pod lead sees a corresponding update in the manager/pod-lead approvals portal. Employee leave submissions and manager/pod-lead approvals or rejections also create portal notifications. The assistant does not pick an unspecified leave request or guess between employees with matching names.

Managers can ask for all leave history or filter by request status. Pod leads and employees see only records within their role scope. Notification reads and acknowledgements are restricted to the same employee/pod scope.

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
1. **Preview (`POST /api/import/preview`)**: Requires the explicitly selected month, validates the upload, runs entity diffs against PostgreSQL, and writes **zero** records. Both formats use merge/preserve semantics.
2. **Commit (`POST /api/import/commit`)**:
   - Re-validates and upserts records on the server inside a database transaction.
   - Both formats preserve records omitted from the upload and scope monthly records to the selected month.
   - CSV imports provision employee accounts using bcrypt-hashed initial passwords; Excel imports do not create logins.
   - Records import metadata and row counts.
   - Automatically triggers the deterministic scheduler to solve and regenerate the roster for the affected month.
   - A failure rolls back the import and generated roster together.

---

## 10. Assumptions Section

1. **Operating Month Scope**: The manager must explicitly select a valid `YYYY-MM` month for every import. There is no implicit current-month fallback. Shared master data spans months; imported coverage rules and generated roster output are month-specific.
2. **Natural Keys**: Entities are uniquely identified by natural codes (`employee_id`, `pod_code`, `brand_code`, `process_code`) rather than arbitrary names.
3. **Weekly-Off Policy**: Every active employee has 1 designated weekly rest day per calendar week. In high-demand scenarios, the scheduler may adjust an employee's rest day to another day within the same week to satisfy mandatory coverage.
4. **Consecutive Days Limit**: The scheduler enforces a hard limit of at most 6 consecutive working days without a rest day.
5. **Deterministic Ties**: If multiple eligible employees have identical cost scores for a shift, ties are broken deterministically by `employee_id` sorting.
6. **Import Idempotency**: Re-uploading a file for the same selected month upserts matching records, replaces that month's included rule/assignment data, preserves omitted records, and regenerates only that month.

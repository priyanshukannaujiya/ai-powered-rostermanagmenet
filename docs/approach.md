# Architectural Approach & Solution Design

## 1. Core Principles
The Smart Roster Management System is designed to solve a high-stakes, deterministic operational challenge: ensuring that approximately 30 employees across 6 pods cover daily operational demands (CS, ACC, RET, NDR) for 12 D2C brands without violating legal rest constraints or business hours requirements.

Key design principles:
1. **Separation of Scheduler Logic from Database**: The scheduling engine in `lib/scheduler/` is composed of 100% pure TypeScript functions without database, ORM, or network dependencies. This ensures deterministic outputs, instantaneous unit test execution, and replayable simulation for replanning.
2. **Explicit Hard vs. Soft Constraints**: Hard constraints (single status per day, approved leaves, mandatory headcount) can never be silently bypassed. Soft preferences (preferred off days, fair load balance) are scored and balanced.
3. **Transparent Explainability Over Black-Box Solvers**: Instead of an opaque integer linear programming solver (like OR-Tools or Z3) that might fail with an unhelpful `UNSATISFIABLE` error, our greedy algorithm sorts demand days by scarcity, picks eligible staff by workload cost, and flags any unmet requirement with plain-English conflict explanations and actionable backup suggestions.
4. **Resilient Incremental Replanning**: When unexpected changes occur (such as an emergency leave approval mid-month), the system freezes all past days and pinned shifts, recalculating only future, unpinned slots and producing a granular diff.

## 2. System Architecture
- **Web Framework**: Next.js 14 App Router with TypeScript and Tailwind CSS.
- **Database & ORM**: Neon Serverless Postgres with Drizzle ORM and neon-http driver for stateless serverless queries.
- **Authentication & RBAC**: Auth.js (NextAuth v5) with JWT strategy and credentials provider. Role-based access control enforces `manager`, `pod_lead`, and `employee` boundaries in both middleware and server-side endpoints.
- **Data Synchronization**: SWR with 20-second polling intervals (`refreshInterval: 20000`), `revalidateOnFocus`, optimistic updates, and conflict toast notifications.
- **AI Assistant**: Claude / Groq tool-calling agent with strict read-only introspection capabilities scoped by caller role.

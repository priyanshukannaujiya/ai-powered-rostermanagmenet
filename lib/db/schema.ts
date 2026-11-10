import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  uniqueIndex,
  index,
  jsonb,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const roleEnum = pgEnum("user_role", ["manager", "pod_lead", "employee"]);
export const operatingCalendarEnum = pgEnum("operating_calendar", [
  "all_365",
  "daily_no_holidays",
  "mon_sat_no_holidays",
  "custom",
]);
export const leaveTypeEnum = pgEnum("leave_type", ["planned", "sick", "other"]);
export const leaveStatusEnum = pgEnum("leave_status", ["pending", "approved", "rejected"]);
export const compOffStatusEnum = pgEnum("comp_off_status", ["pending", "approved", "used"]);
export const rosterMonthStatusEnum = pgEnum("roster_month_status", ["draft", "published"]);
export const rosterDayStatusEnum = pgEnum("roster_day_status", [
  "working",
  "weekly_off",
  "leave",
  "holiday",
  "comp_off",
  "unassigned",
]);
export const conflictSeverityEnum = pgEnum("conflict_severity", ["blocking", "warning"]);
export const importStatusEnum = pgEnum("import_status", ["previewed", "committed", "failed"]);

// 0. Imports (File tracking & rollback)
export const imports = pgTable(
  "imports",
  {
    id: text("id").primaryKey(),
    filename: text("filename").notNull(),
    uploadedBy: text("uploaded_by"),
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
    status: importStatusEnum("status").default("previewed").notNull(),
    targetMonth: text("target_month"),
    rowCounts: jsonb("row_counts"),
    errorSummary: jsonb("error_summary"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("imports_status_idx").on(table.status),
    index("imports_uploaded_at_idx").on(table.uploadedAt),
  ]
);

// 1. Pods (Defined early for foreign keys)
export const pods = pgTable(
  "pods",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    leadEmployeeId: text("lead_employee_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("pods_name_idx").on(table.name)]
);

// 2. Employees
export const employees = pgTable(
  "employees",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    podId: text("pod_id").references(() => pods.id),
    importId: text("import_id").references(() => imports.id),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("employees_pod_id_idx").on(table.podId),
    index("employees_email_idx").on(table.email),
    index("employees_import_id_idx").on(table.importId),
  ]
);

// 3. Users (Auth)
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("employee"),
    employeeId: text("employee_id").references(() => employees.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
    index("users_employee_id_idx").on(table.employeeId),
  ]
);

// 4. Brands
export const brands = pgTable(
  "brands",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").unique(),
    category: text("category"),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("brands_name_idx").on(table.name),
    uniqueIndex("brands_code_idx").on(table.code),
  ]
);

// 5. Processes
export const processes = pgTable(
  "processes",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull().unique(), // e.g. CS, ACC, RET, NDR
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("processes_code_idx").on(table.code)]
);

// 6. Brand Processes
export const brandProcesses = pgTable(
  "brand_processes",
  {
    id: text("id").primaryKey(),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    processId: text("process_id")
      .notNull()
      .references(() => processes.id, { onDelete: "cascade" }),
    operatingCalendar: operatingCalendarEnum("operating_calendar")
      .default("mon_sat_no_holidays")
      .notNull(),
    minHeadcountWeekday: integer("min_headcount_weekday").default(1).notNull(),
    minHeadcountSunday: integer("min_headcount_sunday").default(0).notNull(),
    minHeadcountHoliday: integer("min_headcount_holiday").default(0).notNull(),
    customScheduleConfig: jsonb("custom_schedule_config"), // e.g. { activeDays: [1,2,3,4,5], noHolidays: true }
    importId: text("import_id").references(() => imports.id),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("brand_process_unique").on(table.brandId, table.processId),
    index("bp_brand_idx").on(table.brandId),
    index("bp_process_idx").on(table.processId),
    index("bp_import_idx").on(table.importId),
  ]
);

// 7. Assignments
export const assignments = pgTable(
  "assignments",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    brandProcessId: text("brand_process_id")
      .notNull()
      .references(() => brandProcesses.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    priority: integer("priority").default(1).notNull(),
    isExclusive: boolean("is_exclusive").default(false).notNull(),
    importId: text("import_id").references(() => imports.id),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("assign_emp_idx").on(table.employeeId),
    index("assign_bp_idx").on(table.brandProcessId),
    index("assign_import_idx").on(table.importId),
  ]
);

// 8. Weekly Offs
export const weeklyOffs = pgTable(
  "weekly_offs",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(), // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("weekly_offs_emp_idx").on(table.employeeId)]
);

// 9. Holidays
export const holidays = pgTable(
  "holidays",
  {
    id: text("id").primaryKey(),
    date: date("date").notNull().unique(), // YYYY-MM-DD
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("holidays_date_idx").on(table.date)]
);

// 10. Leaves
export const leaves = pgTable(
  "leaves",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    type: leaveTypeEnum("type").default("planned").notNull(),
    reason: text("reason"),
    status: leaveStatusEnum("status").default("pending").notNull(),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("leaves_emp_idx").on(table.employeeId),
    index("leaves_status_idx").on(table.status),
    index("leaves_date_range_idx").on(table.startDate, table.endDate),
  ]
);

// 11. Comp Offs
export const compOffs = pgTable(
  "comp_offs",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: compOffStatusEnum("status").default("pending").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("comp_offs_emp_idx").on(table.employeeId),
    index("comp_offs_date_idx").on(table.date),
  ]
);

// 12. Roster Months
export const rosterMonths = pgTable(
  "roster_months",
  {
    id: text("id").primaryKey(),
    month: text("month").notNull().unique(), // Format: YYYY-MM
    status: rosterMonthStatusEnum("status").default("draft").notNull(),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("roster_months_month_idx").on(table.month)]
);

export const rosterMonthRules = pgTable(
  "roster_month_rules",
  {
    id: text("id").primaryKey(),
    month: text("month").notNull(),
    brandProcessId: text("brand_process_id")
      .notNull()
      .references(() => brandProcesses.id, { onDelete: "cascade" }),
    operatingCalendar: operatingCalendarEnum("operating_calendar").notNull(),
    minHeadcountWeekday: integer("min_headcount_weekday").notNull(),
    minHeadcountSunday: integer("min_headcount_sunday").notNull(),
    minHeadcountHoliday: integer("min_headcount_holiday").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("roster_month_rules_month_bp_unique").on(table.month, table.brandProcessId),
    index("roster_month_rules_month_idx").on(table.month),
  ]
);

// 13. Roster Days
export const rosterDays = pgTable(
  "roster_days",
  {
    id: text("id").primaryKey(),
    rosterMonthId: text("roster_month_id")
      .notNull()
      .references(() => rosterMonths.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    date: date("date").notNull(), // YYYY-MM-DD
    status: rosterDayStatusEnum("status").notNull(),
    brandProcessId: text("brand_process_id").references(() => brandProcesses.id, {
      onDelete: "set null",
    }),
    pinned: boolean("pinned").default(false).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("rd_month_idx").on(table.rosterMonthId),
    index("rd_emp_idx").on(table.employeeId),
    index("rd_date_idx").on(table.date),
    index("rd_bp_idx").on(table.brandProcessId),
    unique("rd_emp_date_bp_unique").on(table.rosterMonthId, table.employeeId, table.date, table.brandProcessId),
  ]
);

// 14. Conflicts
export const conflicts = pgTable(
  "conflicts",
  {
    id: text("id").primaryKey(),
    rosterMonthId: text("roster_month_id")
      .notNull()
      .references(() => rosterMonths.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // e.g., 'INSUFFICIENT_HEADCOUNT', 'UNAVAILABLE_SOLE_RESOURCE', etc.
    severity: conflictSeverityEnum("severity").notNull(),
    brandProcessId: text("brand_process_id").references(() => brandProcesses.id, {
      onDelete: "cascade",
    }),
    employeeId: text("employee_id").references(() => employees.id, {
      onDelete: "cascade",
    }),
    date: date("date"),
    message: text("message").notNull(),
    suggestedFix: text("suggested_fix"),
    resolved: boolean("resolved").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("conflicts_month_idx").on(table.rosterMonthId),
    index("conflicts_severity_idx").on(table.severity),
    index("conflicts_date_idx").on(table.date),
  ]
);

// 15. Audit Log
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => users.id),
    action: text("action").notNull(), // e.g. ROSTER_CELL_UPDATE, LEAVE_APPROVED, ROSTER_PUBLISHED
    entity: text("entity").notNull(), // e.g. roster_days, leaves
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_actor_idx").on(table.actorUserId),
    index("audit_entity_idx").on(table.entity, table.entityId),
  ]
);

// 16. Notifications (Employee Portal Alerts)
export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    message: text("message").notNull(),
    type: text("type").default("shift_appointment").notNull(),
    date: text("date"),
    read: boolean("read").default(false).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("notif_emp_idx").on(table.employeeId),
    index("notif_read_idx").on(table.read),
  ]
);

// Relations
export const podsRelations = relations(pods, ({ many, one }) => ({
  employees: many(employees),
  lead: one(employees, {
    fields: [pods.leadEmployeeId],
    references: [employees.id],
  }),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  pod: one(pods, {
    fields: [employees.podId],
    references: [pods.id],
  }),
  user: one(users, {
    fields: [employees.id],
    references: [users.employeeId],
  }),
  assignments: many(assignments),
  weeklyOffs: many(weeklyOffs),
  leaves: many(leaves),
  compOffs: many(compOffs),
  rosterDays: many(rosterDays),
}));

export const brandsRelations = relations(brands, ({ many }) => ({
  brandProcesses: many(brandProcesses),
}));

export const processesRelations = relations(processes, ({ many }) => ({
  brandProcesses: many(brandProcesses),
}));

export const brandProcessesRelations = relations(brandProcesses, ({ one, many }) => ({
  brand: one(brands, {
    fields: [brandProcesses.brandId],
    references: [brands.id],
  }),
  process: one(processes, {
    fields: [brandProcesses.processId],
    references: [processes.id],
  }),
  assignments: many(assignments),
  rosterDays: many(rosterDays),
  conflicts: many(conflicts),
}));

export const rosterMonthsRelations = relations(rosterMonths, ({ many }) => ({
  days: many(rosterDays),
  conflicts: many(conflicts),
}));

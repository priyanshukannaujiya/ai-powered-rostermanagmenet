import { z } from "zod";
import {
  ParsedWorkbook,
  ValidationError,
  ValidationWarning,
  ValidationResult,
  ImportDiff,
  EntityDiff,
} from "./types";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Row schemas
const PodRowSchema = z.object({
  pod_code: z.string().min(1, "pod_code cannot be empty"),
  pod_name: z.string().min(1, "pod_name cannot be empty"),
  lead_employee_id: z.string().nullable().optional(),
});

const EmployeeRowSchema = z.object({
  employee_id: z.string().min(1, "employee_id cannot be empty"),
  name: z.string().min(1, "name cannot be empty"),
  email: z.string().email("Invalid email format"),
  pod_code: z.string().min(1, "pod_code cannot be empty"),
  weekly_off_day: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"], {
    errorMap: () => ({ message: "weekly_off_day must be one of MON, TUE, WED, THU, FRI, SAT, SUN" }),
  }),
  active: z.boolean(),
});

const BrandRowSchema = z.object({
  brand_code: z.string().min(1, "brand_code cannot be empty"),
  brand_name: z.string().min(1, "brand_name cannot be empty"),
  category: z.string().nullable().optional(),
});

const ProcessRowSchema = z.object({
  process_code: z.string().min(1, "process_code cannot be empty"),
  process_name: z.string().min(1, "process_name cannot be empty"),
});

const ScheduleRowSchema = z.object({
  brand_code: z.string().min(1, "brand_code cannot be empty"),
  process_code: z.string().min(1, "process_code cannot be empty"),
  operating_calendar: z.enum(["all_365", "daily_no_holidays", "mon_sat_no_holidays", "custom"], {
    errorMap: () => ({
      message: "operating_calendar must be all_365, daily_no_holidays, mon_sat_no_holidays, or custom",
    }),
  }),
  weekday_headcount: z.number().int().min(0, "weekday_headcount must be >= 0"),
  sunday_headcount: z.number().int().min(0, "sunday_headcount must be >= 0"),
  holiday_headcount: z.number().int().min(0, "holiday_headcount must be >= 0"),
  min_staff_required: z.number().int().min(0, "min_staff_required must be >= 0"),
});

const AssignmentRowSchema = z.object({
  employee_id: z.string().min(1, "employee_id cannot be empty"),
  brand_code: z.string().min(1, "brand_code cannot be empty"),
  process_code: z.string().min(1, "process_code cannot be empty"),
  valid_from: z.string().regex(DATE_REGEX, "valid_from must be in YYYY-MM-DD format"),
  valid_to: z
    .string()
    .regex(DATE_REGEX, "valid_to must be in YYYY-MM-DD format")
    .nullable()
    .optional(),
  priority: z.number().int().min(1, "priority must be >= 1"),
  is_exclusive: z.boolean(),
});

const LeaveRowSchema = z.object({
  employee_id: z.string().min(1, "employee_id cannot be empty"),
  date_from: z.string().regex(DATE_REGEX, "date_from must be in YYYY-MM-DD format"),
  date_to: z.string().regex(DATE_REGEX, "date_to must be in YYYY-MM-DD format"),
  type: z.enum(["leave", "comp_off"], {
    errorMap: () => ({ message: "type must be leave or comp_off" }),
  }),
  status: z.enum(["approved", "pending"], {
    errorMap: () => ({ message: "status must be approved or pending" }),
  }),
});

const HolidayRowSchema = z.object({
  date: z.string().regex(DATE_REGEX, "date must be in YYYY-MM-DD format"),
  name: z.string().min(1, "holiday name cannot be empty"),
});

export function validateWorkbook(data: ParsedWorkbook): {
  ok: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  rowCounts: Record<string, number>;
} {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const rowCounts = {
    pods: data.pods.length,
    employees: data.employees.length,
    brands: data.brands.length,
    processes: data.processes.length,
    schedules: data.schedules.length,
    assignments: data.assignments.length,
    leaves: data.leaves.length,
    holidays: data.holidays.length,
  };

  // Helper to run Zod and collect errors
  const validateRows = (
    sheet: string,
    rows: any[],
    schema: z.ZodSchema
  ) => {
    rows.forEach((row, idx) => {
      const rowNum = idx + 2; // Row 1 is header
      const result = schema.safeParse(row);
      if (!result.success) {
        result.error.errors.forEach((err) => {
          errors.push({
            sheet,
            row: rowNum,
            field: err.path.join(".") || "row",
            message: err.message,
          });
        });
      }
    });
  };

  validateRows("Pods", data.pods, PodRowSchema);
  validateRows("Employees", data.employees, EmployeeRowSchema);
  validateRows("Brands", data.brands, BrandRowSchema);
  validateRows("Processes", data.processes, ProcessRowSchema);
  validateRows("Schedules", data.schedules, ScheduleRowSchema);
  validateRows("Assignments", data.assignments, AssignmentRowSchema);
  validateRows("Leaves", data.leaves, LeaveRowSchema);
  validateRows("Holidays", data.holidays, HolidayRowSchema);

  // 1. Primary Key Uniqueness
  const checkUnique = (
    sheet: string,
    items: string[],
    fieldName: string
  ) => {
    const seen = new Map<string, number>();
    items.forEach((key, idx) => {
      const rowNum = idx + 2;
      if (seen.has(key)) {
        errors.push({
          sheet,
          row: rowNum,
          field: fieldName,
          message: `Duplicate ${fieldName}: "${key}" (already defined on row ${seen.get(key)})`,
        });
      } else {
        seen.set(key, rowNum);
      }
    });
  };

  checkUnique("Pods", data.pods.map((p) => p.pod_code), "pod_code");
  checkUnique("Employees", data.employees.map((e) => e.employee_id), "employee_id");
  checkUnique("Employees", data.employees.map((e) => e.email), "email");
  checkUnique("Brands", data.brands.map((b) => b.brand_code), "brand_code");
  checkUnique("Processes", data.processes.map((p) => p.process_code), "process_code");
  checkUnique(
    "Schedules",
    data.schedules.map((s) => `${s.brand_code}:${s.process_code}`),
    "brand_code + process_code"
  );
  checkUnique("Holidays", data.holidays.map((h) => h.date), "date");

  // Lookup Sets for Referential Integrity
  const podCodeSet = new Set(data.pods.map((p) => p.pod_code));
  const employeeMap = new Map(data.employees.map((e) => [e.employee_id, e]));
  const brandCodeSet = new Set(data.brands.map((b) => b.brand_code));
  const processCodeSet = new Set(data.processes.map((p) => p.process_code));
  const scheduleSet = new Set(data.schedules.map((s) => `${s.brand_code}:${s.process_code}`));

  // 2. Referential Integrity: Employees -> Pods
  data.employees.forEach((emp, idx) => {
    const rowNum = idx + 2;
    if (emp.pod_code && !podCodeSet.has(emp.pod_code)) {
      errors.push({
        sheet: "Employees",
        row: rowNum,
        field: "pod_code",
        message: `Referenced pod_code "${emp.pod_code}" does not exist in Pods sheet`,
      });
    }
  });

  // 3. Referential Integrity: Pod Leads -> Employees
  data.pods.forEach((pod, idx) => {
    const rowNum = idx + 2;
    if (pod.lead_employee_id) {
      const emp = employeeMap.get(pod.lead_employee_id);
      if (!emp) {
        errors.push({
          sheet: "Pods",
          row: rowNum,
          field: "lead_employee_id",
          message: `Referenced lead_employee_id "${pod.lead_employee_id}" does not exist in Employees sheet`,
        });
      } else if (emp.pod_code !== pod.pod_code) {
        errors.push({
          sheet: "Pods",
          row: rowNum,
          field: "lead_employee_id",
          message: `Pod lead "${emp.name}" (${emp.employee_id}) belongs to pod "${emp.pod_code}", not "${pod.pod_code}"`,
        });
      }
    }
  });

  // 4. Referential Integrity: Schedules -> Brands, Processes
  data.schedules.forEach((sch, idx) => {
    const rowNum = idx + 2;
    if (sch.brand_code && !brandCodeSet.has(sch.brand_code)) {
      errors.push({
        sheet: "Schedules",
        row: rowNum,
        field: "brand_code",
        message: `Referenced brand_code "${sch.brand_code}" does not exist in Brands sheet`,
      });
    }
    if (sch.process_code && !processCodeSet.has(sch.process_code)) {
      errors.push({
        sheet: "Schedules",
        row: rowNum,
        field: "process_code",
        message: `Referenced process_code "${sch.process_code}" does not exist in Processes sheet`,
      });
    }
  });

  // 5. Referential Integrity: Assignments -> Employees, Brands, Processes, Schedules
  data.assignments.forEach((asg, idx) => {
    const rowNum = idx + 2;
    if (asg.employee_id && !employeeMap.has(asg.employee_id)) {
      errors.push({
        sheet: "Assignments",
        row: rowNum,
        field: "employee_id",
        message: `Referenced employee_id "${asg.employee_id}" does not exist in Employees sheet`,
      });
    }
    if (asg.brand_code && !brandCodeSet.has(asg.brand_code)) {
      errors.push({
        sheet: "Assignments",
        row: rowNum,
        field: "brand_code",
        message: `Referenced brand_code "${asg.brand_code}" does not exist in Brands sheet`,
      });
    }
    if (asg.process_code && !processCodeSet.has(asg.process_code)) {
      errors.push({
        sheet: "Assignments",
        row: rowNum,
        field: "process_code",
        message: `Referenced process_code "${asg.process_code}" does not exist in Processes sheet`,
      });
    }
    if (
      asg.brand_code &&
      asg.process_code &&
      !scheduleSet.has(`${asg.brand_code}:${asg.process_code}`)
    ) {
      errors.push({
        sheet: "Assignments",
        row: rowNum,
        field: "brand_code + process_code",
        message: `No operating schedule defined in Schedules sheet for "${asg.brand_code} - ${asg.process_code}"`,
      });
    }

    // Date range check
    if (asg.valid_from && asg.valid_to && asg.valid_to < asg.valid_from) {
      errors.push({
        sheet: "Assignments",
        row: rowNum,
        field: "valid_to",
        message: `valid_to (${asg.valid_to}) cannot be earlier than valid_from (${asg.valid_from})`,
      });
    }
  });

  // Check overlapping assignments for the same employee, brand, and process
  const empBpRanges = new Map<string, { from: string; to: string; row: number }[]>();
  data.assignments.forEach((asg, idx) => {
    const rowNum = idx + 2;
    const key = `${asg.employee_id}_${asg.brand_code}_${asg.process_code}`;
    const to = asg.valid_to || "9999-12-31";
    if (!empBpRanges.has(key)) {
      empBpRanges.set(key, []);
    }
    const existing = empBpRanges.get(key)!;
    for (const r of existing) {
      if (!(to < r.from || asg.valid_from > r.to)) {
        errors.push({
          sheet: "Assignments",
          row: rowNum,
          field: "valid_from/valid_to",
          message: `Overlapping assignment for ${asg.employee_id} on ${asg.brand_code} (${asg.process_code}) with row ${r.row}`,
        });
      }
    }
    existing.push({ from: asg.valid_from, to, row: rowNum });
  });

  // 6. Referential Integrity: Leaves -> Employees & Date check
  data.leaves.forEach((l, idx) => {
    const rowNum = idx + 2;
    if (l.employee_id && !employeeMap.has(l.employee_id)) {
      errors.push({
        sheet: "Leaves",
        row: rowNum,
        field: "employee_id",
        message: `Referenced employee_id "${l.employee_id}" does not exist in Employees sheet`,
      });
    }
    if (l.date_from && l.date_to && l.date_to < l.date_from) {
      errors.push({
        sheet: "Leaves",
        row: rowNum,
        field: "date_to",
        message: `date_to (${l.date_to}) cannot be earlier than date_from (${l.date_from})`,
      });
    }
  });

  // 7. Schedule Eligibility & Headcount Checks
  // Group assignments by brand_code + process_code
  const assignmentsBySchedule = new Map<string, Set<string>>();
  data.assignments.forEach((asg) => {
    const key = `${asg.brand_code}:${asg.process_code}`;
    if (!assignmentsBySchedule.has(key)) {
      assignmentsBySchedule.set(key, new Set());
    }
    assignmentsBySchedule.get(key)!.add(asg.employee_id);
  });

  data.schedules.forEach((sch, idx) => {
    const rowNum = idx + 2;
    const key = `${sch.brand_code}:${sch.process_code}`;
    const assignedEmps = assignmentsBySchedule.get(key) || new Set();
    const count = assignedEmps.size;

    // Hard preview blocker: Zero eligible employees assigned to a schedule
    if (count === 0) {
      errors.push({
        sheet: "Schedules",
        row: rowNum,
        field: "min_staff_required",
        message: `Schedule for "${sch.brand_code} - ${sch.process_code}" has 0 eligible assigned employees in Assignments sheet (minimum required: ${sch.min_staff_required || sch.weekday_headcount})`,
      });
    } else if (count === 1) {
      warnings.push({
        code: "SPOF_SINGLE_RESOURCE",
        message: `Single-Resource Brand Process: "${sch.brand_code} (${sch.process_code})" has only 1 certified employee assigned. Any absence creates single-point-of-failure.`,
        details: { brand_code: sch.brand_code, process_code: sch.process_code },
      });
    }

    const required = sch.min_staff_required || sch.weekday_headcount;
    if (count > 0 && count < required) {
      warnings.push({
        code: "UNDERSTAFFED_SCHEDULE",
        message: `Process "${sch.brand_code} (${sch.process_code})" has ${count} assigned staff, which is below the required headcount of ${required}.`,
        details: { brand_code: sch.brand_code, process_code: sch.process_code, assigned: count, required },
      });
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    rowCounts,
  };
}

export function computeEntityDiff<T>(
  newItems: T[],
  existingItems: any[],
  getKey: (item: any) => string,
  isEqual: (a: T, b: any) => boolean
): EntityDiff {
  const existingMap = new Map<string, any>();
  existingItems.forEach((item) => existingMap.set(getKey(item), item));

  let added = 0;
  let changed = 0;
  let unchanged = 0;
  const sampleAdded: string[] = [];
  const sampleChanged: string[] = [];
  const sampleRemoved: string[] = [];

  const seenKeys = new Set<string>();

  newItems.forEach((item) => {
    const key = getKey(item);
    seenKeys.add(key);
    if (!existingMap.has(key)) {
      added++;
      if (sampleAdded.length < 5) sampleAdded.push(key);
    } else {
      const existing = existingMap.get(key);
      if (isEqual(item, existing)) {
        unchanged++;
      } else {
        changed++;
        if (sampleChanged.length < 5) sampleChanged.push(key);
      }
    }
  });

  let removed = 0;
  existingMap.forEach((_, key) => {
    if (!seenKeys.has(key)) {
      removed++;
      if (sampleRemoved.length < 5) sampleRemoved.push(key);
    }
  });

  return {
    added,
    changed,
    unchanged,
    removed,
    sampleAdded,
    sampleChanged,
    sampleRemoved,
  };
}

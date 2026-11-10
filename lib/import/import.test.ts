import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { generateTemplateCsv, generateTemplateWorkbook } from "./template";
import { parseImportFileBuffer, parseRosterCsvBuffer, parseWorkbookBuffer } from "./parse";
import { validateWorkbook, computeEntityDiff } from "./validate";
import { intersectMonthRange, isValidRosterMonth } from "./month";

const sampleWorkbookBuffer = () => {
  const wb = XLSX.utils.book_new();
  const sheets: Record<string, Record<string, unknown>[]> = {
    Pods: [
      { pod_code: "POD_ALPHA", pod_name: "Alpha Pod", lead_employee_id: "EMP_001" },
      { pod_code: "POD_BETA", pod_name: "Beta Pod", lead_employee_id: "EMP_006" },
    ],
    Employees: [
      {
        employee_id: "EMP_001",
        name: "Test Employee",
        email: "employee@example.com",
        pod_code: "POD_ALPHA",
        weekly_off_day: "SUN",
        active: "TRUE",
      },
      {
        employee_id: "EMP_006",
        name: "Test Lead",
        email: "lead@example.com",
        pod_code: "POD_BETA",
        weekly_off_day: "MON",
        active: "TRUE",
      },
    ],
    Brands: [{ brand_code: "LUMORA", brand_name: "Lumora Skincare", category: "Test" }],
    Processes: [{ process_code: "CS", process_name: "Customer Support" }],
    Schedules: [{
      brand_code: "LUMORA",
      process_code: "CS",
      operating_calendar: "all_365",
      weekday_headcount: 1,
      sunday_headcount: 1,
      holiday_headcount: 1,
      min_staff_required: 1,
    }],
    Assignments: [{
      employee_id: "EMP_001",
      brand_code: "LUMORA",
      process_code: "CS",
      valid_from: "2026-11-01",
      valid_to: "2026-11-30",
      priority: 1,
      is_exclusive: "TRUE",
    }],
    Leaves: [{
      employee_id: "EMP_001",
      date_from: "2026-11-25",
      date_to: "2026-11-25",
      type: "leave",
      status: "approved",
    }],
    Holidays: [{ date: "2026-11-08", name: "Test Holiday" }],
  };
  for (const [sheetName, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

describe("Excel Import System - Parse, Validate, and Diff", () => {
  it("accepts only explicit YYYY-MM months with a real month number", () => {
    expect(isValidRosterMonth("2026-11")).toBe(true);
    expect(isValidRosterMonth("2026-00")).toBe(false);
    expect(isValidRosterMonth("2026-13")).toBe(false);
    expect(isValidRosterMonth("2026-1")).toBe(false);
    expect(isValidRosterMonth("")).toBe(false);
  });

  it("clips imported date ranges to the selected month without crossing month boundaries", () => {
    expect(intersectMonthRange("2026-10-25", "2026-11-03", "2026-11")).toEqual({
      start: "2026-11-01",
      end: "2026-11-03",
    });
    expect(intersectMonthRange("2026-11-05", null, "2026-11")).toEqual({
      start: "2026-11-05",
      end: "2026-11-30",
    });
    expect(intersectMonthRange("2026-10-01", "2026-10-31", "2026-11")).toBeNull();
  });

  it("downloads blank workbook and CSV templates without example records", () => {
    const buffer = generateTemplateWorkbook();
    const parsed = parseWorkbookBuffer(buffer);
    const csvWorkbook = XLSX.read(generateTemplateCsv(), { type: "buffer", raw: true });
    const csvRows = XLSX.utils.sheet_to_json(csvWorkbook.Sheets[csvWorkbook.SheetNames[0]], {
      header: 1,
    });

    expect(parsed.ok).toBe(true);
    expect(parsed.data?.employees).toHaveLength(0);
    expect(parsed.data?.leaves).toHaveLength(0);
    expect(csvRows).toHaveLength(1);
  });

  describe("Single CSV roster import", () => {
    it("validates the synthetic 32-person test fixture", () => {
      const samplePath = path.join(process.cwd(), "fixtures", "sample-roster-import.csv");
      const parsed = parseImportFileBuffer(fs.readFileSync(samplePath), samplePath);

      expect(parsed.ok).toBe(true);
      expect(parsed.data?.target_month).toBe("2026-12");
      expect(parsed.data?.employees).toHaveLength(32);
      expect(parsed.data?.pods).toHaveLength(6);
      expect(parsed.data?.brands).toHaveLength(12);
      expect(parsed.data?.assignments.length).toBeGreaterThan(15);
      expect(parsed.data?.leaves).toHaveLength(0);
      expect(parsed.data?.holidays).toHaveLength(0);
      if (parsed.data) {
        expect(validateWorkbook(parsed.data).ok).toBe(true);
      }
    });

    it("parses and validates the flat synthetic CSV fixture", () => {
      const samplePath = path.join(process.cwd(), "fixtures", "sample-roster-import.csv");
      const parsed = parseImportFileBuffer(fs.readFileSync(samplePath), samplePath);

      expect(parsed.ok).toBe(true);
      expect(parsed.data?.target_month).toBe("2026-12");
      expect(parsed.data?.employees).toHaveLength(32);
      expect(parsed.data?.leaves).toHaveLength(0);
      expect(parsed.data && validateWorkbook(parsed.data).ok).toBe(true);
    });

    it("rejects CSV rows with conflicting employee details", () => {
      const worksheet = XLSX.utils.json_to_sheet([
        {
          schedule_month: "2026-11",
          pod_code: "POD_ALPHA",
          pod_name: "Alpha Pod",
          pod_lead_employee_id: "EMP_001",
          employee_id: "EMP_001",
          employee_name: "Aarav Sharma",
          employee_email: "aarav@example.com",
          initial_password: "Test-Only-Password-123",
          weekly_off_day: "SUN",
          employee_active: "TRUE",
          brand_code: "BRAND_A",
          brand_name: "Brand A",
          brand_category: "",
          process_code: "CS",
          process_name: "Customer Support",
          operating_calendar: "all_365",
          weekday_headcount: 1,
          sunday_headcount: 1,
          holiday_headcount: 1,
          min_staff_required: 1,
          valid_from: "2026-11-01",
          valid_to: "2026-11-30",
          priority: 1,
          is_exclusive: "FALSE",
        },
        {
          schedule_month: "2026-11",
          pod_code: "POD_ALPHA",
          pod_name: "Alpha Pod",
          pod_lead_employee_id: "EMP_001",
          employee_id: "EMP_001",
          employee_name: "Aarav Sharma",
          employee_email: "aarav@example.com",
          initial_password: "Test-Only-Password-123",
          weekly_off_day: "MON",
          employee_active: "TRUE",
          brand_code: "BRAND_B",
          brand_name: "Brand B",
          brand_category: "",
          process_code: "CS",
          process_name: "Customer Support",
          operating_calendar: "all_365",
          weekday_headcount: 1,
          sunday_headcount: 1,
          holiday_headcount: 1,
          min_staff_required: 1,
          valid_from: "2026-11-01",
          valid_to: "2026-11-30",
          priority: 1,
          is_exclusive: "FALSE",
        },
      ]);
      const csv = Buffer.from(XLSX.utils.sheet_to_csv(worksheet), "utf8");
      const parsed = parseRosterCsvBuffer(csv);

      expect(parsed.ok).toBe(false);
      expect(parsed.errors?.some((error) => error.includes('Employee "EMP_001" has inconsistent values'))).toBe(true);
    });
  });

  it("validates a workbook containing test records", () => {
    const buffer = sampleWorkbookBuffer();
    const parsed = parseWorkbookBuffer(buffer);

    expect(parsed.ok).toBe(true);
    expect(parsed.data?.employees).toHaveLength(2);
    expect(parsed.data?.pods).toHaveLength(2);
    expect(parsed.data?.brands).toHaveLength(1);
    expect(parsed.data?.processes).toHaveLength(1);

    if (parsed.data) {
      const validation = validateWorkbook(parsed.data);
      expect(validation.ok).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.warnings.some((warning) => warning.code === "SPOF_SINGLE_RESOURCE")).toBe(true);
      expect(validateWorkbook(parsed.data, { requireInitialPasswords: true }).ok).toBe(false);
      expect(validateWorkbook(parsed.data, { targetMonth: "2026-12" }).ok).toBe(false);
    }
  });

  // Scenario 3: Missing sheet rejection
  it("Scenario 3: Rejects file if a required sheet is missing and names it", () => {
    const wb = XLSX.utils.book_new();
    // Add only Pods sheet
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ pod_code: "P1", pod_name: "Test" }]), "Pods");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const parsed = parseWorkbookBuffer(buffer);
    expect(parsed.ok).toBe(false);
    expect(parsed.errors).toBeDefined();
    expect(parsed.errors?.some((e) => e.includes('Missing required sheet: "Employees"'))).toBe(true);
    expect(parsed.errors?.some((e) => e.includes('Missing required sheet: "Brands"'))).toBe(true);
  });

  // Scenario 4: Missing header rejection
  it("Scenario 4: Rejects file if a required column header is missing and names it", () => {
    const wb = XLSX.read(sampleWorkbookBuffer(), { type: "buffer" });
    // Corrupt Employees sheet header: replace "weekly_off_day" with "off_day"
    const badEmployees = [
      {
        employee_id: "EMP_001",
        name: "Aarav",
        email: "aarav@test.com",
        pod_code: "POD_ALPHA",
        off_day: "SUN", // Wrong header
        active: "TRUE",
      },
    ];
    wb.Sheets["Employees"] = XLSX.utils.json_to_sheet(badEmployees);
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const parsed = parseWorkbookBuffer(buffer);
    expect(parsed.ok).toBe(false);
    expect(
      parsed.errors?.some((e) =>
        e.includes('Sheet "Employees" is missing required column header: "weekly_off_day"')
      )
    ).toBe(true);
  });

  // Scenario 5: Bad date format rejection
  it("Scenario 5: Rejects bad date format with specific field and message", () => {
    const buffer = sampleWorkbookBuffer();
    const parsed = parseWorkbookBuffer(buffer);
    expect(parsed.ok).toBe(true);

    if (parsed.data) {
      // Intentionally insert bad date in Leaves
      parsed.data.leaves[0].date_from = "25/11/2026"; // Not strict YYYY-MM-DD
      const validation = validateWorkbook(parsed.data);
      expect(validation.ok).toBe(false);
      expect(validation.errors.some((e) => e.sheet === "Leaves" && e.field === "date_from")).toBe(true);
    }
  });

  // Scenario 6: Unknown pod code referential violation
  it("Scenario 6: Catches referential violation when employee references unknown pod", () => {
    const buffer = sampleWorkbookBuffer();
    const parsed = parseWorkbookBuffer(buffer);
    expect(parsed.ok).toBe(true);

    if (parsed.data) {
      parsed.data.employees[0].pod_code = "POD_NONEXISTENT";
      const validation = validateWorkbook(parsed.data);
      expect(validation.ok).toBe(false);
      expect(
        validation.errors.some(
          (e) =>
            e.sheet === "Employees" &&
            e.field === "pod_code" &&
            e.message.includes("POD_NONEXISTENT")
        )
      ).toBe(true);
    }
  });

  // Scenario 7: Pod lead belongs to a different pod
  it("Scenario 7: Catches pod lead belonging to a different pod", () => {
    const buffer = sampleWorkbookBuffer();
    const parsed = parseWorkbookBuffer(buffer);
    expect(parsed.ok).toBe(true);

    if (parsed.data) {
      // Set Alpha Pod lead to an employee from Beta Pod (EMP_006)
      parsed.data.pods[0].lead_employee_id = "EMP_006";
      const validation = validateWorkbook(parsed.data);
      expect(validation.ok).toBe(false);
      expect(
        validation.errors.some(
          (e) =>
            e.sheet === "Pods" &&
            e.field === "lead_employee_id" &&
            e.message.includes("belongs to pod")
        )
      ).toBe(true);
    }
  });

  // Scenario 8: Overlapping assignments rejection
  it("Scenario 8: Catches overlapping assignments for same employee and brand process", () => {
    const buffer = sampleWorkbookBuffer();
    const parsed = parseWorkbookBuffer(buffer);
    expect(parsed.ok).toBe(true);

    if (parsed.data) {
      // Add a second overlapping assignment for EMP_001 on LUMORA CS
      parsed.data.assignments.push({
        employee_id: "EMP_001",
        brand_code: "LUMORA",
        process_code: "CS",
        valid_from: "2026-11-15",
        valid_to: "2026-11-20",
        priority: 1,
        is_exclusive: true,
      });
      const validation = validateWorkbook(parsed.data);
      expect(validation.ok).toBe(false);
      expect(
        validation.errors.some(
          (e) => e.sheet === "Assignments" && e.message.includes("Overlapping assignment")
        )
      ).toBe(true);
    }
  });

  // Scenario 9: Zero-eligible schedule blocks preview
  it("Scenario 9: Blocks preview if any schedule has zero eligible employees", () => {
    const buffer = sampleWorkbookBuffer();
    const parsed = parseWorkbookBuffer(buffer);
    expect(parsed.ok).toBe(true);

    if (parsed.data) {
      // Add schedule without any assignments
      parsed.data.schedules.push({
        brand_code: "LUMORA",
        process_code: "ACC", // No assignment exists in template for LUMORA ACC
        operating_calendar: "daily_no_holidays",
        weekday_headcount: 1,
        sunday_headcount: 1,
        holiday_headcount: 0,
        min_staff_required: 1,
      });
      const validation = validateWorkbook(parsed.data);
      expect(validation.ok).toBe(false);
      expect(
        validation.errors.some(
          (e) =>
            e.sheet === "Schedules" &&
            e.message.includes("has 0 eligible assigned employees")
        )
      ).toBe(true);
    }
  });

  // Scenario 10: Entity diff calculation
  it("Scenario 10: Computes accurate entity diff against existing records", () => {
    const newPods = [
      { pod_code: "POD_A", pod_name: "Alpha", lead_employee_id: "E1" }, // modified
      { pod_code: "POD_B", pod_name: "Beta", lead_employee_id: "E2" },  // unchanged
      { pod_code: "POD_C", pod_name: "Gamma", lead_employee_id: "E3" }, // new
    ];

    const existingPods = [
      { id: "POD_A", name: "Alpha Pod Old", lead_employee_id: "E1" },
      { id: "POD_B", name: "Beta", lead_employee_id: "E2" },
      { id: "POD_D", name: "Delta", lead_employee_id: "E4" }, // deleted
    ];

    const diff = computeEntityDiff(
      newPods,
      existingPods,
      (p) => p.pod_code || p.id,
      (newItem, existing) =>
        newItem.pod_name === existing.name &&
        newItem.lead_employee_id === existing.lead_employee_id
    );

    expect(diff.added).toBe(1); // POD_C
    expect(diff.changed).toBe(1); // POD_A
    expect(diff.unchanged).toBe(1); // POD_B
    expect(diff.removed).toBe(1); // POD_D
  });
});

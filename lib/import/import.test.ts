import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { generateTemplateWorkbook } from "./template";
import { parseWorkbookBuffer } from "./parse";
import { validateWorkbook, computeEntityDiff } from "./validate";

describe("Excel Import System - Parse, Validate, and Diff", () => {
  // Scenario 1: Valid round-trip on generated template
  it("Scenario 1: Valid round-trip on standard template workbook", () => {
    const buffer = generateTemplateWorkbook();
    const parsed = parseWorkbookBuffer(buffer);

    expect(parsed.ok).toBe(true);
    expect(parsed.data).toBeDefined();

    if (parsed.data) {
      const validation = validateWorkbook(parsed.data);
      expect(validation.ok).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.rowCounts.pods).toBe(1);
      expect(validation.rowCounts.employees).toBe(1);
      expect(validation.rowCounts.brands).toBe(1);
    }
  });

  // Scenario 2: Valid round-trip on fixtures/sample-roster.xlsx
  it("Scenario 2: Valid round-trip on 32-employee reference fixture", () => {
    const fixturePath = path.join(process.cwd(), "fixtures", "sample-roster.xlsx");
    expect(fs.existsSync(fixturePath)).toBe(true);

    const buffer = fs.readFileSync(fixturePath);
    const parsed = parseWorkbookBuffer(buffer);

    expect(parsed.ok).toBe(true);
    expect(parsed.data?.employees).toHaveLength(32);
    expect(parsed.data?.pods).toHaveLength(6);
    expect(parsed.data?.brands).toHaveLength(12);
    expect(parsed.data?.processes).toHaveLength(4);

    if (parsed.data) {
      const validation = validateWorkbook(parsed.data);
      expect(validation.ok).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.warnings.length).toBeGreaterThan(0); // Warnings for single-resource brands
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
    const wb = XLSX.read(generateTemplateWorkbook(), { type: "buffer" });
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
    const buffer = generateTemplateWorkbook();
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
    const buffer = generateTemplateWorkbook();
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
    const fixturePath = path.join(process.cwd(), "fixtures", "sample-roster.xlsx");
    const buffer = fs.readFileSync(fixturePath);
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
    const buffer = generateTemplateWorkbook();
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
    const buffer = generateTemplateWorkbook();
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

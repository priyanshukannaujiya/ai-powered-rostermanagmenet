import * as XLSX from "xlsx";

export function generateTemplateWorkbook(): Buffer {
  const wb = XLSX.utils.book_new();

  // 1. Pods
  const podsData = [
    {
      pod_code: "POD_ALPHA",
      pod_name: "Alpha Pod (Beauty & Wellness)",
      lead_employee_id: "EMP_001",
    },
  ];
  const podsWs = XLSX.utils.json_to_sheet(podsData, {
    header: ["pod_code", "pod_name", "lead_employee_id"],
  });
  XLSX.utils.book_append_sheet(wb, podsWs, "Pods");

  // 2. Employees
  const employeesData = [
    {
      employee_id: "EMP_001",
      name: "Aarav Sharma",
      email: "aarav.sharma@opscompany.com",
      pod_code: "POD_ALPHA",
      weekly_off_day: "SUN",
      active: "TRUE",
    },
  ];
  const employeesWs = XLSX.utils.json_to_sheet(employeesData, {
    header: ["employee_id", "name", "email", "pod_code", "weekly_off_day", "active"],
  });
  XLSX.utils.book_append_sheet(wb, employeesWs, "Employees");

  // 3. Brands
  const brandsData = [
    {
      brand_code: "LUMORA",
      brand_name: "Lumora Skincare",
      category: "Beauty & Wellness",
    },
  ];
  const brandsWs = XLSX.utils.json_to_sheet(brandsData, {
    header: ["brand_code", "brand_name", "category"],
  });
  XLSX.utils.book_append_sheet(wb, brandsWs, "Brands");

  // 4. Processes
  const processesData = [
    {
      process_code: "CS",
      process_name: "Customer Support",
    },
  ];
  const processesWs = XLSX.utils.json_to_sheet(processesData, {
    header: ["process_code", "process_name"],
  });
  XLSX.utils.book_append_sheet(wb, processesWs, "Processes");

  // 5. Schedules
  const schedulesData = [
    {
      brand_code: "LUMORA",
      process_code: "CS",
      operating_calendar: "all_365",
      weekday_headcount: 1,
      sunday_headcount: 1,
      holiday_headcount: 1,
      min_staff_required: 1,
    },
  ];
  const schedulesWs = XLSX.utils.json_to_sheet(schedulesData, {
    header: [
      "brand_code",
      "process_code",
      "operating_calendar",
      "weekday_headcount",
      "sunday_headcount",
      "holiday_headcount",
      "min_staff_required",
    ],
  });
  XLSX.utils.book_append_sheet(wb, schedulesWs, "Schedules");

  // 6. Assignments
  const assignmentsData = [
    {
      employee_id: "EMP_001",
      brand_code: "LUMORA",
      process_code: "CS",
      valid_from: "2026-11-01",
      valid_to: "2026-11-30",
      priority: 1,
      is_exclusive: "TRUE",
    },
  ];
  const assignmentsWs = XLSX.utils.json_to_sheet(assignmentsData, {
    header: [
      "employee_id",
      "brand_code",
      "process_code",
      "valid_from",
      "valid_to",
      "priority",
      "is_exclusive",
    ],
  });
  XLSX.utils.book_append_sheet(wb, assignmentsWs, "Assignments");

  // 7. Leaves
  const leavesData = [
    {
      employee_id: "EMP_001",
      date_from: "2026-11-25",
      date_to: "2026-11-25",
      type: "leave",
      status: "approved",
    },
  ];
  const leavesWs = XLSX.utils.json_to_sheet(leavesData, {
    header: ["employee_id", "date_from", "date_to", "type", "status"],
  });
  XLSX.utils.book_append_sheet(wb, leavesWs, "Leaves");

  // 8. Holidays
  const holidaysData = [
    {
      date: "2026-11-08",
      name: "Diwali",
    },
  ];
  const holidaysWs = XLSX.utils.json_to_sheet(holidaysData, {
    header: ["date", "name"],
  });
  XLSX.utils.book_append_sheet(wb, holidaysWs, "Holidays");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buffer;
}

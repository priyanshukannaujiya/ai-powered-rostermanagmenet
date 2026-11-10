import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const wb = XLSX.utils.book_new();

  // 1. Pods
  const pods = [
    { pod_code: "POD_ALPHA", pod_name: "Alpha Pod (Beauty & Wellness)", lead_employee_id: "EMP_001" },
    { pod_code: "POD_BETA", pod_name: "Beta Pod (Food & Beverages)", lead_employee_id: "EMP_006" },
    { pod_code: "POD_GAMMA", pod_name: "Gamma Pod (Home & Living)", lead_employee_id: "EMP_011" },
    { pod_code: "POD_DELTA", pod_name: "Delta Pod (Fashion & Apparel)", lead_employee_id: "EMP_017" },
    { pod_code: "POD_EPSILON", pod_name: "Epsilon Pod (Fitness & Sports)", lead_employee_id: "EMP_022" },
    { pod_code: "POD_ZETA", pod_name: "Zeta Pod (Baby & Kids)", lead_employee_id: "EMP_027" },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pods), "Pods");

  // 2. Employees (32)
  const employees = [
    // Alpha
    { employee_id: "EMP_001", name: "Aarav Sharma", email: "employee.aarav@opscompany.com", pod_code: "POD_ALPHA", weekly_off_day: "SUN", active: "TRUE" },
    { employee_id: "EMP_002", name: "Neha Joshi", email: "neha.joshi@opscompany.com", pod_code: "POD_ALPHA", weekly_off_day: "MON", active: "TRUE" },
    { employee_id: "EMP_003", name: "Kunal Kapoor", email: "kunal.kapoor@opscompany.com", pod_code: "POD_ALPHA", weekly_off_day: "TUE", active: "TRUE" },
    { employee_id: "EMP_004", name: "Isha Singhal", email: "isha.singhal@opscompany.com", pod_code: "POD_ALPHA", weekly_off_day: "WED", active: "TRUE" },
    { employee_id: "EMP_005", name: "Rohan Das", email: "rohan.das@opscompany.com", pod_code: "POD_ALPHA", weekly_off_day: "THU", active: "TRUE" },

    // Beta
    { employee_id: "EMP_006", name: "Priya Patel", email: "employee.priya@opscompany.com", pod_code: "POD_BETA", weekly_off_day: "SUN", active: "TRUE" },
    { employee_id: "EMP_007", name: "Suresh Menon", email: "suresh.menon@opscompany.com", pod_code: "POD_BETA", weekly_off_day: "MON", active: "TRUE" },
    { employee_id: "EMP_008", name: "Deepa Nair", email: "deepa.nair@opscompany.com", pod_code: "POD_BETA", weekly_off_day: "TUE", active: "TRUE" },
    { employee_id: "EMP_009", name: "Gaurav Mehta", email: "gaurav.mehta@opscompany.com", pod_code: "POD_BETA", weekly_off_day: "WED", active: "TRUE" },
    { employee_id: "EMP_010", name: "Pooja Hegde", email: "pooja.hegde@opscompany.com", pod_code: "POD_BETA", weekly_off_day: "THU", active: "TRUE" },

    // Gamma
    { employee_id: "EMP_011", name: "Rahul Verma", email: "employee.rahul@opscompany.com", pod_code: "POD_GAMMA", weekly_off_day: "SUN", active: "TRUE" },
    { employee_id: "EMP_012", name: "Aditi Sen", email: "aditi.sen@opscompany.com", pod_code: "POD_GAMMA", weekly_off_day: "MON", active: "TRUE" },
    { employee_id: "EMP_013", name: "Varun Dhawan", email: "varun.dhawan@opscompany.com", pod_code: "POD_GAMMA", weekly_off_day: "TUE", active: "TRUE" },
    { employee_id: "EMP_014", name: "Kavita Sethi", email: "kavita.sethi@opscompany.com", pod_code: "POD_GAMMA", weekly_off_day: "WED", active: "TRUE" },
    { employee_id: "EMP_015", name: "Arjun Rampal", email: "arjun.rampal@opscompany.com", pod_code: "POD_GAMMA", weekly_off_day: "THU", active: "TRUE" },
    { employee_id: "EMP_016", name: "Meera Rajput", email: "meera.rajput@opscompany.com", pod_code: "POD_GAMMA", weekly_off_day: "FRI", active: "TRUE" },

    // Delta
    { employee_id: "EMP_017", name: "Sneha Rao", email: "sneha.rao@opscompany.com", pod_code: "POD_DELTA", weekly_off_day: "SUN", active: "TRUE" },
    { employee_id: "EMP_018", name: "Manish Paul", email: "manish.paul@opscompany.com", pod_code: "POD_DELTA", weekly_off_day: "MON", active: "TRUE" },
    { employee_id: "EMP_019", name: "Tanvi Shah", email: "tanvi.shah@opscompany.com", pod_code: "POD_DELTA", weekly_off_day: "TUE", active: "TRUE" },
    { employee_id: "EMP_020", name: "Karthik Aryan", email: "karthik.aryan@opscompany.com", pod_code: "POD_DELTA", weekly_off_day: "WED", active: "TRUE" },
    { employee_id: "EMP_021", name: "Shreya Ghoshal", email: "shreya.ghoshal@opscompany.com", pod_code: "POD_DELTA", weekly_off_day: "THU", active: "TRUE" },

    // Epsilon
    { employee_id: "EMP_022", name: "Vikram Malhotra", email: "vikram.malhotra@opscompany.com", pod_code: "POD_EPSILON", weekly_off_day: "SUN", active: "TRUE" },
    { employee_id: "EMP_023", name: "Nikhil Chinapa", email: "nikhil.chinapa@opscompany.com", pod_code: "POD_EPSILON", weekly_off_day: "MON", active: "TRUE" },
    { employee_id: "EMP_024", name: "Tara Sutaria", email: "tara.sutaria@opscompany.com", pod_code: "POD_EPSILON", weekly_off_day: "TUE", active: "TRUE" },
    { employee_id: "EMP_025", name: "Harsh Vardhan", email: "harsh.vardhan@opscompany.com", pod_code: "POD_EPSILON", weekly_off_day: "WED", active: "TRUE" },
    { employee_id: "EMP_026", name: "Rhea Chakraborty", email: "rhea.chakraborty@opscompany.com", pod_code: "POD_EPSILON", weekly_off_day: "THU", active: "TRUE" },

    // Zeta
    { employee_id: "EMP_027", name: "Ananya Iyer", email: "ananya.iyer@opscompany.com", pod_code: "POD_ZETA", weekly_off_day: "SUN", active: "TRUE" },
    { employee_id: "EMP_028", name: "Sameer Kochhar", email: "sameer.kochhar@opscompany.com", pod_code: "POD_ZETA", weekly_off_day: "MON", active: "TRUE" },
    { employee_id: "EMP_029", name: "Divya Dutta", email: "divya.dutta@opscompany.com", pod_code: "POD_ZETA", weekly_off_day: "TUE", active: "TRUE" },
    { employee_id: "EMP_030", name: "Prateik Babbar", email: "prateik.babbar@opscompany.com", pod_code: "POD_ZETA", weekly_off_day: "WED", active: "TRUE" },
    { employee_id: "EMP_031", name: "Zoya Akhtar", email: "zoya.akhtar@opscompany.com", pod_code: "POD_ZETA", weekly_off_day: "THU", active: "TRUE" },
    { employee_id: "EMP_032", name: "Farhan Qureshi", email: "farhan.qureshi@opscompany.com", pod_code: "POD_ZETA", weekly_off_day: "FRI", active: "TRUE" },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employees), "Employees");

  // 3. Brands (12)
  const brands = [
    { brand_code: "LUMORA", brand_name: "Lumora Skincare", category: "Beauty & Wellness" },
    { brand_code: "BREWHAUS", brand_name: "Brewhaus Coffee", category: "Food & Beverages" },
    { brand_code: "NESTWELL", brand_name: "Nestwell Home", category: "Home & Living" },
    { brand_code: "TREKKR", brand_name: "Trekkr Outdoor", category: "Fashion & Apparel" },
    { brand_code: "AURA_GLOW", brand_name: "Aura Glow", category: "Beauty & Wellness" },
    { brand_code: "URBAN_BOTANICS", brand_name: "Urban Botanics", category: "Baby & Kids" },
    { brand_code: "DAILY_GREENS", brand_name: "Daily Greens", category: "Food & Beverages" },
    { brand_code: "ZEN_LIFESTYLE", brand_name: "Zen Lifestyle", category: "Home & Living" },
    { brand_code: "VELVET_THREAD", brand_name: "Velvet Thread", category: "Fashion & Apparel" },
    { brand_code: "KICKS_CO", brand_name: "Kicks & Co", category: "Fashion & Apparel" },
    { brand_code: "PULSE_NUTRITION", brand_name: "Pulse Nutrition", category: "Fitness & Sports" },
    { brand_code: "BLOOM_BABY", brand_name: "Bloom Baby", category: "Baby & Kids" },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(brands), "Brands");

  // 4. Processes (4)
  const processes = [
    { process_code: "CS", process_name: "Customer Support" },
    { process_code: "ACC", process_name: "Abandoned Cart Conversions" },
    { process_code: "RET", process_name: "Retention" },
    { process_code: "NDR", process_name: "Non-Delivery Report Management" },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(processes), "Processes");

  // 5. Schedules (Brand-processes)
  const schedules = [
    { brand_code: "LUMORA", process_code: "CS", operating_calendar: "all_365", weekday_headcount: 1, sunday_headcount: 1, holiday_headcount: 1, min_staff_required: 1 },
    { brand_code: "LUMORA", process_code: "ACC", operating_calendar: "daily_no_holidays", weekday_headcount: 1, sunday_headcount: 1, holiday_headcount: 0, min_staff_required: 1 },
    { brand_code: "BREWHAUS", process_code: "CS", operating_calendar: "all_365", weekday_headcount: 1, sunday_headcount: 1, holiday_headcount: 1, min_staff_required: 1 },
    { brand_code: "BREWHAUS", process_code: "NDR", operating_calendar: "mon_sat_no_holidays", weekday_headcount: 1, sunday_headcount: 0, holiday_headcount: 0, min_staff_required: 1 },
    { brand_code: "NESTWELL", process_code: "NDR", operating_calendar: "mon_sat_no_holidays", weekday_headcount: 1, sunday_headcount: 0, holiday_headcount: 0, min_staff_required: 1 },
    { brand_code: "TREKKR", process_code: "RET", operating_calendar: "mon_sat_no_holidays", weekday_headcount: 1, sunday_headcount: 0, holiday_headcount: 0, min_staff_required: 1 },
    { brand_code: "AURA_GLOW", process_code: "CS", operating_calendar: "all_365", weekday_headcount: 1, sunday_headcount: 1, holiday_headcount: 1, min_staff_required: 1 },
    { brand_code: "URBAN_BOTANICS", process_code: "ACC", operating_calendar: "daily_no_holidays", weekday_headcount: 1, sunday_headcount: 1, holiday_headcount: 0, min_staff_required: 1 },
    { brand_code: "DAILY_GREENS", process_code: "CS", operating_calendar: "all_365", weekday_headcount: 1, sunday_headcount: 1, holiday_headcount: 1, min_staff_required: 1 },
    { brand_code: "ZEN_LIFESTYLE", process_code: "RET", operating_calendar: "mon_sat_no_holidays", weekday_headcount: 1, sunday_headcount: 0, holiday_headcount: 0, min_staff_required: 1 },
    { brand_code: "VELVET_THREAD", process_code: "CS", operating_calendar: "all_365", weekday_headcount: 1, sunday_headcount: 1, holiday_headcount: 1, min_staff_required: 1 },
    { brand_code: "KICKS_CO", process_code: "ACC", operating_calendar: "daily_no_holidays", weekday_headcount: 1, sunday_headcount: 1, holiday_headcount: 0, min_staff_required: 1 },
    { brand_code: "PULSE_NUTRITION", process_code: "CS", operating_calendar: "all_365", weekday_headcount: 1, sunday_headcount: 1, holiday_headcount: 1, min_staff_required: 1 },
    { brand_code: "PULSE_NUTRITION", process_code: "NDR", operating_calendar: "mon_sat_no_holidays", weekday_headcount: 1, sunday_headcount: 0, holiday_headcount: 0, min_staff_required: 1 },
    { brand_code: "BLOOM_BABY", process_code: "CS", operating_calendar: "all_365", weekday_headcount: 1, sunday_headcount: 1, holiday_headcount: 1, min_staff_required: 1 },
    { brand_code: "BLOOM_BABY", process_code: "RET", operating_calendar: "mon_sat_no_holidays", weekday_headcount: 1, sunday_headcount: 0, holiday_headcount: 0, min_staff_required: 1 },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(schedules), "Schedules");

  // 6. Assignments
  const assignments = [
    { employee_id: "EMP_001", brand_code: "LUMORA", process_code: "CS", valid_from: "2026-01-01", valid_to: "", priority: 1, is_exclusive: "TRUE" },
    { employee_id: "EMP_001", brand_code: "LUMORA", process_code: "ACC", valid_from: "2026-01-01", valid_to: "", priority: 1, is_exclusive: "TRUE" },
    { employee_id: "EMP_002", brand_code: "DAILY_GREENS", process_code: "CS", valid_from: "2026-01-01", valid_to: "", priority: 1, is_exclusive: "TRUE" },
    { employee_id: "EMP_003", brand_code: "LUMORA", process_code: "CS", valid_from: "2026-01-01", valid_to: "", priority: 2, is_exclusive: "FALSE" },
    { employee_id: "EMP_004", brand_code: "AURA_GLOW", process_code: "CS", valid_from: "2026-01-01", valid_to: "", priority: 1, is_exclusive: "TRUE" },
    { employee_id: "EMP_005", brand_code: "LUMORA", process_code: "ACC", valid_from: "2026-01-01", valid_to: "", priority: 2, is_exclusive: "FALSE" },

    { employee_id: "EMP_006", brand_code: "BREWHAUS", process_code: "CS", valid_from: "2026-01-01", valid_to: "", priority: 1, is_exclusive: "TRUE" },
    { employee_id: "EMP_006", brand_code: "BREWHAUS", process_code: "NDR", valid_from: "2026-01-01", valid_to: "", priority: 1, is_exclusive: "TRUE" },
    { employee_id: "EMP_007", brand_code: "ZEN_LIFESTYLE", process_code: "RET", valid_from: "2026-01-01", valid_to: "", priority: 1, is_exclusive: "TRUE" },
    { employee_id: "EMP_008", brand_code: "BREWHAUS", process_code: "CS", valid_from: "2026-01-01", valid_to: "", priority: 2, is_exclusive: "FALSE" },
    { employee_id: "EMP_009", brand_code: "BREWHAUS", process_code: "NDR", valid_from: "2026-01-01", valid_to: "", priority: 2, is_exclusive: "FALSE" },
    { employee_id: "EMP_010", brand_code: "BREWHAUS", process_code: "CS", valid_from: "2026-01-01", valid_to: "", priority: 3, is_exclusive: "FALSE" },

    { employee_id: "EMP_011", brand_code: "NESTWELL", process_code: "NDR", valid_from: "2026-01-01", valid_to: "", priority: 1, is_exclusive: "TRUE" },
    { employee_id: "EMP_012", brand_code: "VELVET_THREAD", process_code: "CS", valid_from: "2026-01-01", valid_to: "", priority: 1, is_exclusive: "TRUE" },
    { employee_id: "EMP_013", brand_code: "NESTWELL", process_code: "NDR", valid_from: "2026-01-01", valid_to: "", priority: 2, is_exclusive: "FALSE" },
    { employee_id: "EMP_014", brand_code: "VELVET_THREAD", process_code: "CS", valid_from: "2026-01-01", valid_to: "", priority: 2, is_exclusive: "FALSE" },
    { employee_id: "EMP_015", brand_code: "NESTWELL", process_code: "NDR", valid_from: "2026-01-01", valid_to: "", priority: 3, is_exclusive: "FALSE" },
    { employee_id: "EMP_016", brand_code: "VELVET_THREAD", process_code: "CS", valid_from: "2026-01-01", valid_to: "", priority: 3, is_exclusive: "FALSE" },

    { employee_id: "EMP_017", brand_code: "TREKKR", process_code: "RET", valid_from: "2026-01-01", valid_to: "", priority: 1, is_exclusive: "TRUE" },
    { employee_id: "EMP_018", brand_code: "KICKS_CO", process_code: "ACC", valid_from: "2026-01-01", valid_to: "", priority: 1, is_exclusive: "TRUE" },
    { employee_id: "EMP_019", brand_code: "TREKKR", process_code: "RET", valid_from: "2026-01-01", valid_to: "", priority: 2, is_exclusive: "FALSE" },
    { employee_id: "EMP_020", brand_code: "KICKS_CO", process_code: "ACC", valid_from: "2026-01-01", valid_to: "", priority: 2, is_exclusive: "FALSE" },
    { employee_id: "EMP_021", brand_code: "TREKKR", process_code: "RET", valid_from: "2026-01-01", valid_to: "", priority: 3, is_exclusive: "FALSE" },

    { employee_id: "EMP_022", brand_code: "AURA_GLOW", process_code: "CS", valid_from: "2026-01-01", valid_to: "", priority: 1, is_exclusive: "TRUE" },
    { employee_id: "EMP_023", brand_code: "PULSE_NUTRITION", process_code: "CS", valid_from: "2026-01-01", valid_to: "", priority: 1, is_exclusive: "TRUE" },
    { employee_id: "EMP_024", brand_code: "PULSE_NUTRITION", process_code: "NDR", valid_from: "2026-01-01", valid_to: "", priority: 1, is_exclusive: "TRUE" },
    { employee_id: "EMP_025", brand_code: "PULSE_NUTRITION", process_code: "CS", valid_from: "2026-01-01", valid_to: "", priority: 2, is_exclusive: "FALSE" },
    { employee_id: "EMP_026", brand_code: "AURA_GLOW", process_code: "CS", valid_from: "2026-01-01", valid_to: "", priority: 2, is_exclusive: "FALSE" },

    { employee_id: "EMP_027", brand_code: "URBAN_BOTANICS", process_code: "ACC", valid_from: "2026-01-01", valid_to: "", priority: 1, is_exclusive: "TRUE" },
    { employee_id: "EMP_028", brand_code: "BLOOM_BABY", process_code: "CS", valid_from: "2026-01-01", valid_to: "", priority: 1, is_exclusive: "TRUE" },
    { employee_id: "EMP_029", brand_code: "BLOOM_BABY", process_code: "RET", valid_from: "2026-01-01", valid_to: "", priority: 1, is_exclusive: "TRUE" },
    { employee_id: "EMP_030", brand_code: "URBAN_BOTANICS", process_code: "ACC", valid_from: "2026-01-01", valid_to: "", priority: 2, is_exclusive: "FALSE" },
    { employee_id: "EMP_031", brand_code: "BLOOM_BABY", process_code: "CS", valid_from: "2026-01-01", valid_to: "", priority: 2, is_exclusive: "FALSE" },
    { employee_id: "EMP_032", brand_code: "BLOOM_BABY", process_code: "RET", valid_from: "2026-01-01", valid_to: "", priority: 2, is_exclusive: "FALSE" },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(assignments), "Assignments");

  // 7. Leaves
  const leaves = [
    { employee_id: "EMP_001", date_from: "2026-11-25", date_to: "2026-11-25", type: "leave", status: "approved" },
    { employee_id: "EMP_006", date_from: "2026-11-15", date_to: "2026-11-16", type: "leave", status: "approved" },
    { employee_id: "EMP_006", date_from: "2026-11-20", date_to: "2026-11-21", type: "leave", status: "pending" },
    { employee_id: "EMP_011", date_from: "2026-11-18", date_to: "2026-11-20", type: "leave", status: "pending" },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leaves), "Leaves");

  // 8. Holidays
  const holidays = [
    { date: "2026-11-08", name: "Diwali" },
    { date: "2026-11-24", name: "Guru Nanak Jayanti" },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(holidays), "Holidays");

  // Write to fixtures/sample-roster.xlsx
  const fixturesDir = path.join(process.cwd(), "fixtures");
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  const outPath = path.join(fixturesDir, "sample-roster.xlsx");
  XLSX.writeFile(wb, outPath);
  console.log(`Successfully generated fixture: ${outPath}`);
}

main();

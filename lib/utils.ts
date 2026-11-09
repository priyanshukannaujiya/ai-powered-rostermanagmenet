import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Robustly parses any Date object, ISO string, or YYYY-MM-DD string into a clean date representation
 */
export function parseDateString(val: any): { year: number; month: number; day: number; dateStr: string } | null {
  if (!val) return null;
  const str = String(val).trim();
  
  // Try matching standard ISO/SQL YYYY-MM-DD format
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { year, month, day, dateStr };
  }

  // Fallback to JS Date
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { year, month, day, dateStr };
  }

  return null;
}

export function formatDate(val: any): string {
  const parsed = parseDateString(val);
  if (!parsed) return String(val || "");
  const d = new Date(parsed.year, parsed.month - 1, parsed.day);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(val: any): string {
  const parsed = parseDateString(val);
  if (!parsed) return String(val || "");
  const d = new Date(parsed.year, parsed.month - 1, parsed.day);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatMonthYear(monthStr: string): string {
  const parsed = parseDateString(`${monthStr}-01`);
  if (!parsed) return monthStr;
  const d = new Date(parsed.year, parsed.month - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function getMonthOffset(monthStr: string, offset: number): string {
  const parsed = parseDateString(`${monthStr}-01`);
  if (!parsed) return monthStr;
  const d = new Date(parsed.year, parsed.month - 1 + offset, 1);
  const nextYear = d.getFullYear();
  const nextMonth = String(d.getMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

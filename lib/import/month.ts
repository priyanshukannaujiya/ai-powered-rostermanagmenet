export function isValidRosterMonth(month: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return false;

  const monthNumber = Number(match[2]);
  return monthNumber >= 1 && monthNumber <= 12;
}

export function intersectMonthRange(
  start: string,
  end: string | null | undefined,
  month: string
): { start: string; end: string } | null {
  if (!isValidRosterMonth(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, "0")}`;
  const clippedStart = start > monthStart ? start : monthStart;
  const clippedEnd = end && end < monthEnd ? end : monthEnd;
  return clippedStart <= clippedEnd ? { start: clippedStart, end: clippedEnd } : null;
}

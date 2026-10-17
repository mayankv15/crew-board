// Dates are inclusive calendar days in YYYY-MM-DD form. ISO strings sort correctly as text,
// so comparisons below are plain string comparisons and no timezone is ever involved.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export interface DateRange {
  startDate: string;
  endDate: string;
}

// Two inclusive ranges overlap when each starts on or before the day the other ends.
// So a range ending 14 Nov and one starting 14 Nov overlap (same person, same day),
// while ending 14 Nov and starting 15 Nov do not.
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// "2026-11-03" -> "3 Nov 2026"
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS.at(m - 1)} ${y}`;
}

export function formatRange(r: DateRange): string {
  return r.startDate === r.endDate ? formatDay(r.startDate) : `${formatDay(r.startDate)} to ${formatDay(r.endDate)}`;
}

// First day on or after `from` on which nobody in `busy` is booked.
export function earliestFreeDay(busy: DateRange[], from: string): string {
  let day = from;
  for (const r of [...busy].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    if (r.startDate <= day && r.endDate >= day) day = addDays(r.endDate, 1);
  }
  return day;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export interface DateRange {
  startDate: string;
  endDate: string;
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS.at(m - 1)} ${y}`;
}

export function formatRange(r: DateRange): string {
  return r.startDate === r.endDate ? formatDay(r.startDate) : `${formatDay(r.startDate)} to ${formatDay(r.endDate)}`;
}

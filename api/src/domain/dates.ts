import { addDays, formatDay, formatRange, type DateRange } from '@crew-board/shared';

export { addDays, formatDay, formatRange, type DateRange };

export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export function earliestFreeDay(busy: DateRange[], from: string): string {
  let day = from;
  for (const r of [...busy].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    if (r.startDate <= day && r.endDate >= day) day = addDays(r.endDate, 1);
  }
  return day;
}

import { type DateRange } from '@crew-board/shared';

export interface Timing {
  text: string;
  tone: 'urgent' | 'soon' | 'running' | 'past' | 'later';
}

const days = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export function timing(range: DateRange, today: string, open: boolean): Timing {
  if (range.endDate < today) return { text: 'Ended', tone: 'past' };
  if (range.startDate <= today) return { text: 'In progress', tone: open ? 'urgent' : 'running' };
  const away = days(today, range.startDate);
  const text = away === 1 ? 'Starts tomorrow' : `Starts in ${away} days`;
  if (open && away <= 14) return { text, tone: 'urgent' };
  return { text, tone: away <= 14 ? 'soon' : 'later' };
}

export const todayIso = (now: number = Date.now()): string => new Date(now).toISOString().slice(0, 10);

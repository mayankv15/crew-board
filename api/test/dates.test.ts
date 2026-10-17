import { describe, expect, it } from 'vitest';
import { addDays, earliestFreeDay, formatDay, formatRange, rangesOverlap } from '../src/domain/dates.ts';

const r = (startDate: string, endDate: string) => ({ startDate, endDate });

describe('rangesOverlap (inclusive calendar days)', () => {
  const existing = r('2026-11-03', '2026-11-14');

  it.each([
    ['overlaps at the start', r('2026-10-30', '2026-11-03'), true],
    ['overlaps at the end', r('2026-11-14', '2026-11-20'), true],
    ['is contained', r('2026-11-05', '2026-11-08'), true],
    ['contains it', r('2026-10-01', '2026-12-01'), true],
    ['is identical', r('2026-11-03', '2026-11-14'), true],
    ['ends the day before it starts', r('2026-10-25', '2026-11-02'), false],
    ['starts the day after it ends', r('2026-11-15', '2026-11-20'), false],
    ['ends the same day it starts', r('2026-10-25', '2026-11-03'), true],
    ['starts the same day it ends', r('2026-11-14', '2026-11-14'), true],
  ])('%s', (_label, other, expected) => {
    expect(rangesOverlap(existing, other)).toBe(expected);
    expect(rangesOverlap(other, existing)).toBe(expected);
  });
});

describe('date helpers', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('formats for coordinators', () => {
    expect(formatDay('2026-11-03')).toBe('3 Nov 2026');
    expect(formatRange(r('2026-11-03', '2026-11-14'))).toBe('3 Nov 2026 to 14 Nov 2026');
    expect(formatRange(r('2026-11-03', '2026-11-03'))).toBe('3 Nov 2026');
  });

  it('finds the first free day across back-to-back bookings', () => {
    const busy = [r('2026-11-03', '2026-11-14'), r('2026-11-15', '2026-11-20')];
    expect(earliestFreeDay(busy, '2026-11-05')).toBe('2026-11-21');
    expect(earliestFreeDay(busy, '2026-11-25')).toBe('2026-11-25');
  });
});

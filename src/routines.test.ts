import { describe, expect, it } from 'vitest';
import { appliesOn, checkId, describeDays, rate, streak } from './routines';
import type { Routine } from './types';

const R = (weekdays: number[] = []): Routine => ({
  id: 'r', name: 'x', weekdays, part: null, status: 'active', order: 0, createdAt: new Date(2026, 9, 1).getTime(), updatedAt: 0,
});
const ticks = (...dates: string[]) => new Set(dates.map((d) => checkId('r', d)));
// 2026-11-03 is a Tuesday

describe('routines', () => {
  it('applies on chosen weekdays only', () => {
    expect(appliesOn(R(), '2026-11-03')).toBe(true);
    expect(appliesOn(R([0, 2]), '2026-11-03')).toBe(false);
    expect(appliesOn(R([1]), '2026-11-03')).toBe(true);
  });

  it('today marked ✗ breaks the streak', () => {
    expect(streak(R(), ticks('2026-11-01', '2026-11-02'), '2026-11-03', 400, ticks('2026-11-03'))).toBe(0);
    expect(streak(R(), ticks('2026-11-02', '2026-11-03'), '2026-11-03', 400, ticks('2026-11-01'))).toBe(2);
  });

  it('counts the streak, today unticked does not break it', () => {
    expect(streak(R(), ticks('2026-11-01', '2026-11-02'), '2026-11-03')).toBe(2);
    expect(streak(R(), ticks('2026-11-01', '2026-11-02', '2026-11-03'), '2026-11-03')).toBe(3);
    expect(streak(R(), ticks('2026-11-01'), '2026-11-03')).toBe(0);
  });

  it('skips days the routine does not apply', () => {
    // Mon/Wed/Fri: ticked Fri 30.10 and Mon 2.11; Tue 3.11 does not apply
    expect(streak(R([0, 2, 4]), ticks('2026-10-30', '2026-11-02'), '2026-11-03')).toBe(2);
  });

  it('computes the rate over the window', () => {
    expect(rate(R(), ticks('2026-11-03', '2026-11-02'), '2026-11-03', 4)).toEqual({ done: 2, total: 4 });
  });

  it('describes days', () => {
    expect(describeDays([])).toBe('codziennie');
    expect(describeDays([4, 0, 1, 2, 3])).toBe('w dni robocze');
    expect(describeDays([0, 2])).toBe('pon, śr');
  });
});

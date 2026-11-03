// Daily routines (habits): which apply on a day, ticks and streaks.
import { addDays, weekdayIndex } from './dates';
import type { Routine } from './types';

export const checkId = (routineId: string, date: string) => `${routineId}|${date}`;

/** Does the routine apply on this day? Empty weekdays = every day. */
export function appliesOn(r: Routine, date: string): boolean {
  return !r.weekdays.length || r.weekdays.includes(weekdayIndex(date));
}

/**
 * Streak: consecutive applicable days ticked, counting back from today.
 * Today not ticked yet does not break the streak (the day is not over), unless marked ✗.
 * Days the routine does not apply are skipped. Looks back at most `limit` days.
 */
export function streak(r: Routine, done: Set<string>, today: string, limit = 400, missed?: Set<string>): number {
  let n = 0;
  for (let i = 0; i < limit; i++) {
    const d = addDays(today, -i);
    if (!appliesOn(r, d)) continue;
    if (done.has(checkId(r.id, d))) n++;
    else if (i > 0 || missed?.has(checkId(r.id, d))) break;
  }
  return n;
}

/** Ticked / applicable over the last `days` days including today. */
export function rate(r: Routine, done: Set<string>, today: string, days = 30): { done: number; total: number } {
  let total = 0;
  let ok = 0;
  const created = new Date(r.createdAt);
  const since = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;
  for (let i = 0; i < days; i++) {
    const d = addDays(today, -i);
    if (d < since && !done.has(checkId(r.id, d))) break;
    if (!appliesOn(r, d)) continue;
    total++;
    if (done.has(checkId(r.id, d))) ok++;
  }
  return { done: ok, total };
}

export const PARTS: { value: Routine['part']; label: string }[] = [
  { value: 'morning', label: 'Rano' },
  { value: 'day', label: 'W ciągu dnia' },
  { value: 'evening', label: 'Wieczorem' },
  { value: null, label: 'Kiedykolwiek' },
];

export function describeDays(w: number[]): string {
  const short = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'];
  if (!w.length || w.length === 7) return 'codziennie';
  const s = [...w].sort();
  if (s.join() === '0,1,2,3,4') return 'w dni robocze';
  if (s.join() === '5,6') return 'w weekend';
  return s.map((i) => short[i]).join(', ');
}

/** Active routines for today not marked yet (neither ✓ nor ✗). */
export function routinesLeftToday(routines: Routine[], done: Set<string>, today: string, missed?: Set<string>): number {
  return routines.filter((r) => r.status === 'active' && appliesOn(r, today) && !done.has(checkId(r.id, today)) && !missed?.has(checkId(r.id, today))).length;
}

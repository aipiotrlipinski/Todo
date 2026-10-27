import { addDays, addMonths, nextWeekday, weekdayIndex, WEEKDAYS_SHORT } from './dates';
import type { Recurrence } from './types';

/** First date on or after `from` that fits the rule (used when a recurring task has no date). */
export function firstOccurrence(r: Recurrence, from: string): string {
  if (r.kind === 'weekdays') return weekdayIndex(from) <= 4 ? from : nextWeekday(from, 0);
  if (r.kind === 'weekly' && r.weekdays?.length) {
    const sorted = [...r.weekdays].sort((a, b) => a - b);
    return sorted.map((w) => nextWeekday(from, w, true)).sort()[0];
  }
  return from;
}

/** The occurrence right after `from`. */
export function nextOccurrence(r: Recurrence, from: string): string {
  const n = Math.max(1, r.interval || 1);
  switch (r.kind) {
    case 'daily':
      return addDays(from, n);
    case 'weekdays': {
      let d = addDays(from, 1);
      while (weekdayIndex(d) > 4) d = addDays(d, 1);
      return d;
    }
    case 'monthly':
      return addMonths(from, n);
    case 'weekly': {
      const days = r.weekdays?.length ? [...r.weekdays].sort((a, b) => a - b) : null;
      if (!days || (days.length === 1 && n > 1)) return addDays(from, 7 * n);
      return days.map((w) => nextWeekday(from, w)).sort()[0];
    }
  }
}

/** Next due date after completing a task on `today`: always in the future. */
export function nextDueAfterDone(r: Recurrence, due: string | null, today: string): string {
  let next = nextOccurrence(r, due ?? today);
  while (next <= today) next = nextOccurrence(r, next);
  return next;
}

export function describeRecurrence(r: Recurrence): string {
  const n = r.interval || 1;
  switch (r.kind) {
    case 'daily':
      return n === 1 ? 'codziennie' : `co ${n} dni`;
    case 'weekdays':
      return 'w dni robocze';
    case 'monthly':
      return n === 1 ? 'co miesiąc' : `co ${n} mies.`;
    case 'weekly': {
      const base = n === 1 ? 'co tydzień' : `co ${n} tyg.`;
      return r.weekdays?.length ? `${base} (${r.weekdays.map((w) => WEEKDAYS_SHORT[w]).join(', ')})` : base;
    }
  }
}

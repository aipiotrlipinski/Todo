// Week board and dashboard helpers: days of a week, load of a day. Pure functions (tested).
import { addDays, timeToMin, weekdayIndex } from './dates';
import { capacity, fixedFor, TIMED_DEFAULT, type FixedBlock } from './planner';
import { sortTasks } from './selectors';
import type { Task } from './types';

/** Monday of the week containing the date. */
export function mondayOf(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Open top-level tasks shown in a day column (today's column also collects overdue ones). */
export function dayColumn(tasks: Task[], day: string, today: string): Task[] {
  return tasks
    .filter((t) => t.status === 'open' && !t.parentId && t.due && (t.due === day || (day === today && t.due < today)))
    .sort(sortTasks);
}

export interface DayLoad {
  /** minutes of open tasks without an hour */
  planned: number;
  /** free minutes in the planning window after fixed points and timed tasks */
  free: number;
  over: number;
  level: 'empty' | 'ok' | 'busy' | 'over';
}

export function dayLoad(
  day: string,
  tasks: Task[],
  o: { window: { start: string; end: string }; fixed: FixedBlock[]; defaultEstimate: number },
): DayLoad {
  const cap = capacity({ date: day, window: o.window, fixed: o.fixed, tasks: tasks.filter((t) => t.due === day && !t.parentId), defaultEstimate: o.defaultEstimate });
  const level = cap.over > 0 ? 'over' : cap.planned === 0 ? 'empty' : cap.planned > cap.free * 0.75 ? 'busy' : 'ok';
  return { planned: cap.planned, free: cap.free, over: cap.over, level };
}

export interface NextPoint {
  title: string;
  start: number; // minutes from midnight
  end: number;
  /** true when we're inside it right now */
  ongoing: boolean;
}

/** The fixed point or timed task happening now, or the next one later today. */
export function nextPoint(day: string, nowMin: number, fixed: FixedBlock[], tasks: Task[]): NextPoint | null {
  const items = [
    ...fixedFor(day, fixed).map((f) => ({ title: f.title, start: timeToMin(f.start), end: timeToMin(f.end) })),
    ...tasks
      .filter((t) => t.status === 'open' && t.due === day && t.time)
      .map((t) => ({ title: t.title, start: timeToMin(t.time!), end: timeToMin(t.time!) + (t.estimate ?? TIMED_DEFAULT) })),
  ].sort((a, b) => a.start - b.start);
  const now = items.find((i) => i.start <= nowMin && i.end > nowMin);
  if (now) return { ...now, ongoing: true };
  const next = items.find((i) => i.start > nowMin);
  return next ? { ...next, ongoing: false } : null;
}

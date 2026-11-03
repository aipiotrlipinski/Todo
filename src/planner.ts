// Planning against real time: fixed points of the day, free gaps, capacity, auto-scheduling.
// Pure functions (no database) so they can be tested.
import { minToTime, timeToMin, weekdayIndex } from './dates';
import { sortTasks } from './selectors';
import type { Task } from './types';

/** A recurring fixed point of the day, e.g. "Siłownia" Mon/Wed/Fri 17:00–18:30. */
export interface FixedBlock {
  id: string;
  title: string;
  /** 0 = Monday … 6 = Sunday */
  days: number[];
  start: string;
  end: string;
}

export interface Interval {
  start: number; // minutes from midnight
  end: number;
}

export interface PlanInput {
  date: string;
  window: { start: string; end: string };
  fixed: FixedBlock[];
  /** open + done tasks of that day (timed ones block time) */
  tasks: Task[];
  /** minutes counted for a task without an estimate */
  defaultEstimate: number;
  /** don't plan before this minute (now, for today) */
  fromMin?: number;
}

export const TIMED_DEFAULT = 30; // a timed task without an estimate takes 30 min on the timeline

export function fixedFor(date: string, fixed: FixedBlock[]): FixedBlock[] {
  const wd = weekdayIndex(date);
  return fixed
    .filter((f) => f.days.includes(wd) && timeToMin(f.end) > timeToMin(f.start))
    .sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
}

/** Merges overlapping intervals. */
export function merge(list: Interval[]): Interval[] {
  const s = [...list].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of s) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** Time already taken: fixed points and open tasks with an hour. */
export function busyIntervals(p: PlanInput): Interval[] {
  const fixed = fixedFor(p.date, p.fixed).map((f) => ({ start: timeToMin(f.start), end: timeToMin(f.end) }));
  const timed = p.tasks
    .filter((t) => t.time && t.status === 'open')
    .map((t) => {
      const s = timeToMin(t.time!);
      return { start: s, end: s + (t.estimate ?? TIMED_DEFAULT) };
    });
  return merge([...fixed, ...timed]);
}

/** Free gaps inside the planning window, after fromMin. */
export function freeGaps(p: PlanInput): Interval[] {
  let start = timeToMin(p.window.start);
  const end = timeToMin(p.window.end);
  if (p.fromMin !== undefined) start = Math.max(start, p.fromMin);
  if (end <= start) return [];
  const gaps: Interval[] = [];
  let cur = start;
  for (const b of busyIntervals(p)) {
    if (b.end <= cur) continue;
    if (b.start >= end) break;
    if (b.start > cur) gaps.push({ start: cur, end: Math.min(b.start, end) });
    cur = Math.max(cur, b.end);
  }
  if (cur < end) gaps.push({ start: cur, end });
  return gaps;
}

export interface Capacity {
  /** free minutes left (window minus fixed points minus timed tasks) */
  free: number;
  /** minutes of open tasks without an hour */
  planned: number;
  /** how many of those have no estimate (counted with defaultEstimate) */
  guessed: number;
  over: number;
}

export function capacity(p: PlanInput): Capacity {
  const free = freeGaps(p).reduce((s, g) => s + g.end - g.start, 0);
  const untimed = p.tasks.filter((t) => t.status === 'open' && !t.time);
  const planned = untimed.reduce((s, t) => s + (t.estimate ?? p.defaultEstimate), 0);
  const guessed = untimed.filter((t) => !t.estimate).length;
  return { free, planned, guessed, over: Math.max(0, planned - free) };
}

/** Which untimed tasks to move to another day so the rest fits: least important and newest first, never priority 1. */
export function suggestDefer(tasks: Task[], overBy: number, defaultEstimate: number): Task[] {
  if (overBy <= 0) return [];
  const pool = tasks
    .filter((t) => t.status === 'open' && !t.time && t.priority !== 1)
    .sort((a, b) => b.priority - a.priority || b.order - a.order);
  const out: Task[] = [];
  let sum = 0;
  for (const t of pool) {
    if (sum >= overBy) break;
    out.push(t);
    sum += t.estimate ?? defaultEstimate;
  }
  return out;
}

const roundUp5 = (m: number) => Math.ceil(m / 5) * 5;

export interface Schedule {
  placed: { id: string; time: string }[];
  unplaced: Task[];
}

/** Gives untimed open tasks an hour: most important first, each in the first free gap it fits. */
export function autoSchedule(p: PlanInput): Schedule {
  const gaps = freeGaps(p).map((g) => ({ start: roundUp5(g.start), end: g.end }));
  const todo = p.tasks.filter((t) => t.status === 'open' && !t.time && !t.parentId).sort(sortTasks);
  const placed: Schedule['placed'] = [];
  const unplaced: Task[] = [];
  for (const t of todo) {
    const len = t.estimate ?? p.defaultEstimate;
    const g = gaps.find((x) => x.end - x.start >= len);
    if (!g) {
      unplaced.push(t);
      continue;
    }
    placed.push({ id: t.id, time: minToTime(g.start) });
    g.start = roundUp5(g.start + len);
  }
  return { placed, unplaced };
}

/** Minutes until the next busy thing (fixed point, timed task or end of window). null = outside the window. */
export function minutesUntilBusy(p: PlanInput & { fromMin: number }): number | null {
  const gap = freeGaps(p).find((g) => g.start <= p.fromMin && g.end > p.fromMin);
  return gap ? gap.end - p.fromMin : null;
}

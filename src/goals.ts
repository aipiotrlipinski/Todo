// Goals above projects: which projects serve a goal and how much time went into it.
import type { Goal, Project, Task } from './types';

/** The goal of a project; a subproject without its own goal uses its main project's goal. */
export function goalOfProject(p: Project | undefined, byId: Map<string, Project>): string | null {
  if (!p) return null;
  if (p.goalId) return p.goalId;
  const parent = p.parentId ? byId.get(p.parentId) : undefined;
  return parent?.goalId ?? null;
}

export function projectsOfGoal(goalId: string, projects: Project[]): Project[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  return projects.filter((p) => goalOfProject(p, byId) === goalId);
}

/** Monday 00:00 of the week containing ts (local time). */
export function weekStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

const WEEK = 7 * 86_400_000;

export interface GoalStats {
  goal: Goal | null; // null = tasks without a goal
  projectIds: string[];
  doneThisWeek: number;
  minutesThisWeek: number;
  minutesLastWeek: number;
  open: number;
  /** last completion in any of its projects (ms), 0 if never */
  lastDone: number;
  next: Task | undefined;
}

/**
 * Time per goal: estimates of tasks completed this week (Monday–now) and last week.
 * A done task without an estimate counts as defaultEstimate.
 */
export function goalStats(goals: Goal[], projects: Project[], tasks: Task[], nowTs: number, defaultEstimate: number): GoalStats[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const thisWeek = weekStart(nowTs);
  const lastWeek = thisWeek - WEEK;
  const goalOfTask = (t: Task) => goalOfProject(t.projectId ? byId.get(t.projectId) : undefined, byId);

  const make = (goal: Goal | null): GoalStats => {
    const gid = goal?.id ?? null;
    const mine = tasks.filter((t) => goalOfTask(t) === gid);
    const mins = (from: number, to: number) =>
      mine
        .filter((t) => t.status === 'done' && t.completedAt && t.completedAt >= from && t.completedAt < to)
        .reduce((s, t) => s + (t.estimate ?? defaultEstimate), 0);
    const open = mine.filter((t) => t.status === 'open').sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.priority - b.priority || a.order - b.order);
    return {
      goal,
      projectIds: gid ? projectsOfGoal(gid, projects).map((p) => p.id) : [],
      doneThisWeek: mine.filter((t) => t.status === 'done' && (t.completedAt ?? 0) >= thisWeek).length,
      minutesThisWeek: mins(thisWeek, Infinity),
      minutesLastWeek: mins(lastWeek, thisWeek),
      open: open.length,
      lastDone: Math.max(0, ...mine.map((t) => t.completedAt ?? 0)),
      next: open.find((t) => !t.parentId) ?? open[0],
    };
  };

  return [...goals.filter((g) => g.status === 'active').map(make), make(null)];
}

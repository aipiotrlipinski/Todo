import type { Project, Task } from './types';

/** Priority first, then time of day, then order of adding. */
export function sortTasks(a: Task, b: Task): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
  if (!!a.time !== !!b.time) return a.time ? -1 : 1;
  return a.order - b.order;
}

export const isOpen = (t: Task) => t.status === 'open';

export function todayTasks(tasks: Task[], today: string) {
  const open = tasks.filter(isOpen);
  return {
    overdue: open.filter((t) => t.due && t.due < today).sort(sortTasks),
    today: open.filter((t) => t.due === today).sort(sortTasks),
  };
}

export function inboxTasks(tasks: Task[]) {
  return tasks.filter((t) => isOpen(t) && !t.projectId && !t.parentId).sort((a, b) => a.order - b.order);
}

export function childrenOf(tasks: Task[], id: string) {
  return tasks.filter((t) => t.parentId === id).sort((a, b) => a.order - b.order);
}

export const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

/** Main projects (no parent), in the order set by dragging. */
export function topProjects(projects: Project[]) {
  return projects.filter((p) => !p.parentId).sort(byOrder);
}

export function subprojectsOf(projects: Project[], id: string) {
  return projects.filter((p) => p.parentId === id).sort(byOrder);
}

/** Progress of a project; with includeSubs it also counts tasks of its subprojects. */
export function projectProgress(tasks: Task[], projectId: string, subIds: string[] = []) {
  const ids = new Set([projectId, ...subIds]);
  const all = tasks.filter((t) => t.projectId && ids.has(t.projectId));
  const done = all.filter((t) => t.status === 'done').length;
  return { done, total: all.length };
}

/** First open task of the first stage that still has open work (or of tasks without a stage). */
export function nextActionOf(tasks: Task[], stageOrder: string[]): Task | undefined {
  const open = tasks.filter((t) => t.status === 'open' && !t.parentId).sort((a, b) => a.order - b.order);
  for (const s of stageOrder) {
    const t = open.find((x) => x.stageId === s);
    if (t) return t;
  }
  return open.find((t) => !t.stageId) ?? open[0];
}

export interface NowOptions {
  today: string;
  /** minutes available; null = no limit */
  limit: number | null;
  /** only tasks with at least one of these labels (empty = all) */
  labelIds: string[];
  /** stage ids per project, in display order */
  stagesByProject: Map<string, string[]>;
}

/**
 * What can be done right now: overdue, today's, next 3 days, inbox without a date,
 * and the next action of each project. Tasks with an hour later today and parents
 * that still have open subtasks are left out. Returns tasks that fit and those without an estimate.
 */
export function nowCandidates(tasks: Task[], o: NowOptions): { fits: Task[]; unknown: Task[] } {
  const open = tasks.filter(isOpen);
  const hasOpenKids = new Set(open.filter((t) => t.parentId).map((t) => t.parentId!));
  const soon = new Date(o.today + 'T12:00');
  soon.setDate(soon.getDate() + 3);
  const soonISO = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`;

  const next = new Set<string>();
  const byProject = new Map<string, Task[]>();
  for (const t of open) if (t.projectId && !t.due) byProject.set(t.projectId, [...(byProject.get(t.projectId) ?? []), t]);
  for (const [pid, list] of byProject) {
    const n = nextActionOf(list, o.stagesByProject.get(pid) ?? []);
    if (n) next.add(n.id);
  }

  const rank = (t: Task) => (t.due ? (t.due < o.today ? 0 : t.due === o.today ? 1 : 2) : 3);
  const pool = open.filter((t) => {
    if (hasOpenKids.has(t.id)) return false;
    if (t.due === o.today && t.time) return false; // has its own slot today
    if (o.labelIds.length && !t.labels.some((l) => o.labelIds.includes(l))) return false;
    if (t.due) return t.due <= soonISO;
    if (t.parentId) return true; // a step of a bigger task
    return !t.projectId || next.has(t.id);
  });
  pool.sort((a, b) => rank(a) - rank(b) || a.priority - b.priority || (a.due ?? '').localeCompare(b.due ?? '') || a.order - b.order);
  return {
    fits: pool.filter((t) => t.estimate && (o.limit === null || t.estimate <= o.limit)),
    unknown: pool.filter((t) => !t.estimate),
  };
}

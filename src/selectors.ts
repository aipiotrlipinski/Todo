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

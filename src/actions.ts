import { db, newId } from './db';
import type { AiTask } from './ai';
import type { NamedRef, Parsed } from './parser';
import { nextDueAfterDone } from './recurrence';
import type { Goal, Label, Project, Stage, Task } from './types';

export const PROJECT_COLORS = ['#6D4AFF', '#1F9D6B', '#E07B12', '#2F7BE5', '#D6457A', '#8A6B2E', '#4B9DB0', '#7B8494'];

const now = () => Date.now();

export async function createProject(name: string, parentId: string | null = null): Promise<Project> {
  const count = await db.projects.count();
  const parent = parentId ? await db.projects.get(parentId) : undefined;
  const p: Project = {
    id: newId(),
    name: name.trim(),
    parentId: parent ? parent.parentId ?? parent.id : null, // only one level of nesting
    color: parent?.color ?? PROJECT_COLORS[count % PROJECT_COLORS.length],
    goal: '',
    goalId: parent?.goalId ?? null,
    due: null,
    status: 'active',
    order: now(),
    createdAt: now(),
    updatedAt: now(),
  };
  await db.projects.add(p);
  return p;
}

export async function createStage(projectId: string, name: string): Promise<Stage> {
  const s: Stage = {
    id: newId(),
    projectId,
    name: name.trim(),
    order: now(),
    due: null,
    status: 'open',
    createdAt: now(),
    updatedAt: now(),
  };
  await db.stages.add(s);
  return s;
}

export async function ensureLabels(refs: NamedRef[]): Promise<string[]> {
  const ids: string[] = [];
  for (const r of refs) {
    if (r.id) {
      ids.push(r.id);
      continue;
    }
    const existing = (await db.labels.toArray()).find((l) => l.name.toLowerCase() === r.name.toLowerCase());
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const l: Label = { id: newId(), name: r.name, color: '', createdAt: now(), updatedAt: now() };
    await db.labels.add(l);
    ids.push(l.id);
  }
  return ids;
}

export interface TaskDefaults {
  projectId?: string | null;
  stageId?: string | null;
  due?: string | null;
  parentId?: string | null;
}

export async function createTaskFromParsed(p: Parsed, defaults: TaskDefaults = {}): Promise<Task> {
  return db.transaction('rw', [db.tasks, db.projects, db.stages, db.labels], async () => {
    let projectId = defaults.projectId ?? null;
    let stageId = defaults.stageId ?? null;
    if (p.project) {
      projectId = p.project.id ?? (await createProject(p.project.name)).id;
      if (projectId !== defaults.projectId) stageId = null;
    }
    if (p.stage && projectId) {
      stageId = p.stage.id ?? (await createStage(projectId, p.stage.name)).id;
    }
    const labels = await ensureLabels(p.labels);
    const t: Task = {
      id: newId(),
      title: p.title,
      notes: '',
      projectId,
      stageId,
      parentId: defaults.parentId ?? null,
      due: p.due ?? defaults.due ?? null,
      time: p.time,
      priority: p.priority ?? 4,
      labels,
      estimate: p.estimate,
      recurrence: p.recurrence,
      status: 'open',
      completedAt: null,
      order: now(),
      createdAt: now(),
      updatedAt: now(),
    };
    await db.tasks.add(t);
    return t;
  });
}

export async function updateTask(id: string, changes: Partial<Task>) {
  await db.tasks.update(id, { ...changes, updatedAt: now() });
}

/** Completes (or reopens) a task. Recurring tasks move to their next date instead. Returns a snapshot for undo. */
export async function toggleDone(task: Task, today: string): Promise<{ snapshot: Task; message: string }> {
  const snapshot = { ...task };
  if (task.status === 'done') {
    await updateTask(task.id, { status: 'open', completedAt: null });
    return { snapshot, message: 'Przywrócono zadanie' };
  }
  if (task.recurrence) {
    const next = nextDueAfterDone(task.recurrence, task.due, today);
    await updateTask(task.id, { due: next });
    return { snapshot, message: 'Zrobione · następne powtórzenie zaplanowane' };
  }
  await updateTask(task.id, { status: 'done', completedAt: now() });
  return { snapshot, message: 'Zrobione' };
}

export async function restoreTasks(snapshots: Task[]) {
  await db.tasks.bulkPut(snapshots);
}

/** Deletes a task with all its subtasks. Returns snapshots for undo. */
export async function deleteTask(id: string): Promise<Task[]> {
  return db.transaction('rw', db.tasks, async () => {
    const removed: Task[] = [];
    const walk = async (tid: string) => {
      const t = await db.tasks.get(tid);
      if (!t) return;
      removed.push(t);
      const kids = await db.tasks.where('parentId').equals(tid).toArray();
      for (const k of kids) await walk(k.id);
    };
    await walk(id);
    await db.tasks.bulkDelete(removed.map((t) => t.id));
    return removed;
  });
}

export async function moveTasksToDate(ids: string[], due: string) {
  await db.transaction('rw', db.tasks, async () => {
    for (const id of ids) await db.tasks.update(id, { due, updatedAt: now() });
  });
}

export async function updateProject(id: string, changes: Partial<Project>) {
  await db.projects.update(id, { ...changes, updatedAt: now() });
}

/** Deletes a project with its stages, tasks and subprojects. */
export async function deleteProject(id: string) {
  await db.transaction('rw', [db.projects, db.stages, db.tasks], async () => {
    const subs = await db.projects.where('parentId').equals(id).toArray();
    for (const pid of [id, ...subs.map((s) => s.id)]) {
      await db.tasks.where('projectId').equals(pid).delete();
      await db.stages.where('projectId').equals(pid).delete();
      await db.projects.delete(pid);
    }
  });
}

/** Saves a new order for projects that share a parent (ids in display order). */
export async function reorderProjects(ids: string[]) {
  await db.transaction('rw', db.projects, async () => {
    for (let i = 0; i < ids.length; i++) await db.projects.update(ids[i], { order: i, updatedAt: now() });
  });
}

/** Moves a project under another main project, or back to the top level (null). */
export async function setProjectParent(id: string, parentId: string | null) {
  await db.transaction('rw', db.projects, async () => {
    if (parentId) {
      const parent = await db.projects.get(parentId);
      if (!parent || parent.id === id || parent.parentId) return; // one level only
      // A project that has subprojects cannot itself become a subproject.
      if ((await db.projects.where('parentId').equals(id).count()) > 0) return;
    }
    await db.projects.update(id, { parentId, order: now(), updatedAt: now() });
  });
}

/** Saves the order (and stage) of tasks after a drag in a project. */
export async function reorderTasks(items: { id: string; stageId: string | null }[]) {
  await db.transaction('rw', db.tasks, async () => {
    for (let i = 0; i < items.length; i++) {
      await db.tasks.update(items[i].id, { order: i, stageId: items[i].stageId, updatedAt: now() });
    }
  });
}

export async function updateStage(id: string, changes: Partial<Stage>) {
  await db.stages.update(id, { ...changes, updatedAt: now() });
}

/** Deletes a stage; its tasks stay in the project without a stage. */
export async function deleteStage(id: string) {
  await db.transaction('rw', [db.stages, db.tasks], async () => {
    const tasks = await db.tasks.where('stageId').equals(id).toArray();
    for (const t of tasks) await db.tasks.update(t.id, { stageId: null, updatedAt: now() });
    await db.stages.delete(id);
  });
}

export async function deleteLabel(id: string) {
  await db.transaction('rw', [db.labels, db.tasks], async () => {
    const tasks = await db.tasks.where('labels').equals(id).toArray();
    for (const t of tasks) await db.tasks.update(t.id, { labels: t.labels.filter((l) => l !== id), updatedAt: now() });
    await db.labels.delete(id);
  });
}

// ---- Goals --------------------------------------------------------------

export async function createGoal(name: string): Promise<Goal> {
  const count = await db.goals.count();
  const g: Goal = {
    id: newId(),
    name: name.trim(),
    why: '',
    color: PROJECT_COLORS[(count + 3) % PROJECT_COLORS.length],
    due: null,
    status: 'active',
    order: now(),
    createdAt: now(),
    updatedAt: now(),
  };
  await db.goals.add(g);
  return g;
}

export async function updateGoal(id: string, changes: Partial<Goal>) {
  await db.goals.update(id, { ...changes, updatedAt: now() });
}

/** Deletes a goal; its projects stay, just without a goal. */
export async function deleteGoal(id: string) {
  await db.transaction('rw', [db.goals, db.projects], async () => {
    const ps = await db.projects.where('goalId').equals(id).toArray();
    for (const p of ps) await db.projects.update(p.id, { goalId: null, updatedAt: now() });
    await db.goals.delete(id);
  });
}

/** Sets many task changes at once (auto-planning, review). */
export async function updateTasks(changes: { id: string; changes: Partial<Task> }[]) {
  await db.transaction('rw', db.tasks, async () => {
    for (const c of changes) await db.tasks.update(c.id, { ...c.changes, updatedAt: now() });
  });
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}

// ---- Backup -------------------------------------------------------------

export async function exportAll() {
  const [tasks, projects, stages, labels, filters, blocks, settings, goals] = await Promise.all([
    db.tasks.toArray(),
    db.projects.toArray(),
    db.stages.toArray(),
    db.labels.toArray(),
    db.filters.toArray(),
    db.blocks.toArray(),
    db.settings.toArray().then((rows) => rows.filter((r) => r.key !== 'aiKey')),
    db.goals.toArray(),
  ]);
  return { app: 'plan', version: 1, exportedAt: new Date().toISOString(), tasks, projects, stages, labels, filters, blocks, settings, goals };
}

export async function importAll(data: unknown) {
  const d = data as Record<string, unknown>;
  if (!d || d.app !== 'plan' || !Array.isArray(d.tasks)) throw new Error('To nie jest plik kopii z tej aplikacji.');
  const arr = <T,>(k: string) => (Array.isArray(d[k]) ? (d[k] as T[]) : []);
  await db.transaction('rw', [db.tasks, db.projects, db.stages, db.labels, db.filters, db.blocks, db.settings, db.goals], async () => {
    const key = await db.settings.get('aiKey'); // the API key stays on this device
    await Promise.all([db.tasks.clear(), db.projects.clear(), db.stages.clear(), db.labels.clear(), db.filters.clear(), db.blocks.clear(), db.settings.clear(), db.goals.clear()]);
    await db.tasks.bulkAdd(arr('tasks'));
    await db.projects.bulkAdd(arr<Project>('projects').map((p) => ({ ...p, parentId: p.parentId ?? null, goalId: p.goalId ?? null })));
    await db.goals.bulkAdd(arr('goals'));
    await db.stages.bulkAdd(arr('stages'));
    await db.labels.bulkAdd(arr('labels'));
    await db.filters.bulkAdd(arr('filters'));
    await db.blocks.bulkAdd(arr('blocks'));
    await db.settings.bulkPut(arr<{ key: string; value: unknown }>('settings').filter((r) => r.key !== 'aiKey'));
    if (key) await db.settings.put(key);
  });
}

// ---- Assistant ----------------------------------------------------------

/**
 * Adds tasks proposed by the assistant. Project/stage are matched by name to existing ones;
 * with createStages a missing stage of the target project is created. Returns the new top-level tasks.
 */
export async function addAiTasks(items: AiTask[], opts: { projectId?: string | null; createStages?: boolean } = {}): Promise<Task[]> {
  return db.transaction('rw', [db.tasks, db.projects, db.stages, db.labels], async () => {
    const projects = await db.projects.toArray();
    const created: Task[] = [];
    let order = now();
    const findProject = (name: string | null) =>
      name ? projects.find((p) => p.name.toLowerCase() === name.toLowerCase() && p.status !== 'done') : undefined;
    for (const it of items) {
      const projectId = opts.projectId ?? findProject(it.project)?.id ?? null;
      let stageId: string | null = null;
      if (projectId && it.stage) {
        const st = (await db.stages.where('projectId').equals(projectId).toArray()).find((x) => x.name.toLowerCase() === it.stage!.toLowerCase());
        stageId = st?.id ?? (opts.createStages ? (await createStage(projectId, it.stage)).id : null);
      }
      const labels = await ensureLabels(it.labels.map((n) => ({ id: null, name: n })));
      const base = { notes: '', labels: [] as string[], recurrence: null, status: 'open' as const, completedAt: null, createdAt: now(), updatedAt: now() };
      const t: Task = {
        ...base,
        id: newId(), title: it.title, notes: it.notes, projectId, stageId, parentId: null,
        due: it.due, time: it.time, priority: it.priority, labels, estimate: it.estimate, order: order++,
      };
      await db.tasks.add(t);
      created.push(t);
      for (const st of it.subtasks) {
        await db.tasks.add({ ...base, id: newId(), title: st, projectId, stageId, parentId: t.id, due: null, time: null, priority: 4, estimate: null, order: order++ });
      }
    }
    return created;
  });
}

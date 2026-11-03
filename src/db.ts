import Dexie, { type EntityTable } from 'dexie';
import type { Block, Goal, Label, Project, Routine, RoutineCheck, SavedFilter, Setting, Stage, Task } from './types';

// Local database in the browser (IndexedDB). Nothing leaves this computer.
export class PlanDB extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  projects!: EntityTable<Project, 'id'>;
  stages!: EntityTable<Stage, 'id'>;
  labels!: EntityTable<Label, 'id'>;
  filters!: EntityTable<SavedFilter, 'id'>;
  blocks!: EntityTable<Block, 'id'>;
  settings!: EntityTable<Setting, 'key'>;
  goals!: EntityTable<Goal, 'id'>;
  routines!: EntityTable<Routine, 'id'>;
  routineChecks!: EntityTable<RoutineCheck, 'id'>;

  constructor() {
    super('plan');
    this.version(1).stores({
      tasks: 'id, projectId, stageId, parentId, due, status, *labels, updatedAt',
      projects: 'id, order',
      stages: 'id, projectId, order',
      labels: 'id, name',
      filters: 'id, order',
      blocks: 'id, date, taskId',
      settings: 'key',
    });
    // v2: subprojects
    this.version(2)
      .stores({ projects: 'id, order, parentId' })
      .upgrade((tx) =>
        tx
          .table('projects')
          .toCollection()
          .modify((p: { parentId?: string | null }) => {
            if (p.parentId === undefined) p.parentId = null;
          }),
      );
    // v3: goals above projects
    this.version(3)
      .stores({ goals: 'id, order', projects: 'id, order, parentId, goalId' })
      .upgrade((tx) =>
        tx
          .table('projects')
          .toCollection()
          .modify((p: { goalId?: string | null }) => {
            if (p.goalId === undefined) p.goalId = null;
          }),
      );
    // v4: daily routines and their ticks
    this.version(4).stores({ routines: 'id, order', routineChecks: 'id, date, routineId' });
  }
}

export const db = new PlanDB();

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      /* fall through */
    }
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

import Dexie, { type EntityTable } from 'dexie';
import type { Block, Label, Project, SavedFilter, Setting, Stage, Task } from './types';

// Local database in the browser (IndexedDB). Nothing leaves this computer.
export class PlanDB extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  projects!: EntityTable<Project, 'id'>;
  stages!: EntityTable<Stage, 'id'>;
  labels!: EntityTable<Label, 'id'>;
  filters!: EntityTable<SavedFilter, 'id'>;
  blocks!: EntityTable<Block, 'id'>;
  settings!: EntityTable<Setting, 'key'>;

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

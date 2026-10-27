// Data model. Dates are local calendar days as 'YYYY-MM-DD', times as 'HH:MM'.
// Every record has id + createdAt + updatedAt so sync can be added later.

export type Priority = 1 | 2 | 3 | 4; // 1 = most important, 4 = none

export interface Recurrence {
  kind: 'daily' | 'weekly' | 'monthly' | 'weekdays';
  interval: number;
  /** For weekly: days of week, 0 = Monday … 6 = Sunday. */
  weekdays?: number[];
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  projectId: string | null;
  stageId: string | null;
  parentId: string | null;
  due: string | null;
  time: string | null;
  priority: Priority;
  labels: string[]; // label ids
  estimate: number | null; // minutes
  recurrence: Recurrence | null;
  status: 'open' | 'done';
  completedAt: number | null;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  /** Main project this one belongs to (one level of nesting). */
  parentId: string | null;
  color: string;
  goal: string;
  due: string | null;
  status: 'active' | 'paused' | 'done';
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Stage {
  id: string;
  projectId: string;
  name: string;
  order: number;
  due: string | null;
  status: 'open' | 'done';
  createdAt: number;
  updatedAt: number;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}

export interface SavedFilter {
  id: string;
  name: string;
  query: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Block {
  id: string;
  taskId: string | null;
  date: string;
  start: string;
  end: string;
  kind: 'task' | 'fixed' | 'free';
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

export type View =
  | { kind: 'today' }
  | { kind: 'inbox' }
  | { kind: 'upcoming' }
  | { kind: 'project'; id: string }
  | { kind: 'label'; id: string }
  | { kind: 'settings' };

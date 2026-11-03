import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { db } from './db';
import { toISO, weekdayIndex } from './dates';
import type { FixedBlock } from './planner';
import type { Goal, Label, Project, Stage, Task, View } from './types';

export interface PlanWindow {
  start: string;
  end: string;
}

export interface AppSettings {
  weekday: PlanWindow;
  weekend: PlanWindow;
  lastExport: string | null;
  /** recurring fixed points of the day (gym, picking up the child…) */
  fixed: FixedBlock[];
  /** minutes counted for a task without an estimate */
  defaultEstimate: number;
  /** from this hour Today suggests the evening review */
  reviewTime: string;
  /** 0 = Monday … 6 = Sunday: day of the weekly review */
  weeklyReviewDay: number;
  lastDailyReview: string | null;
  lastWeeklyReview: string | null;
  /** Claude API key for the assistant (stored only on this device) */
  aiKey: string;
  aiModel: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  weekday: { start: '16:00', end: '22:00' },
  weekend: { start: '08:00', end: '22:00' },
  lastExport: null,
  fixed: [],
  defaultEstimate: 15,
  reviewTime: '20:30',
  weeklyReviewDay: 6,
  lastDailyReview: null,
  lastWeeklyReview: null,
  aiKey: '',
  aiModel: 'claude-sonnet-5-5',
};

export interface Data {
  tasks: Task[];
  projects: Project[];
  stages: Stage[];
  labels: Label[];
  goals: Goal[];
  settings: AppSettings;
  projectById: Map<string, Project>;
  stageById: Map<string, Stage>;
  labelById: Map<string, Label>;
}

export interface UI {
  view: View;
  setView: (v: View) => void;
  openTask: (id: string | null) => void;
  toast: (message: string, undo?: () => void) => void;
  now: Date;
  today: string;
}

const DataCtx = createContext<Data | null>(null);
const UICtx = createContext<UI | null>(null);

export const useData = () => useContext(DataCtx)!;
export const useUI = () => useContext(UICtx)!;

/** Live clock: re-renders every 30 s so "today" and the now-line stay current. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function DataProvider({ children, loading }: { children: ReactNode; loading: ReactNode }) {
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);
  const projects = useLiveQuery(() => db.projects.orderBy('order').toArray(), []);
  const stages = useLiveQuery(() => db.stages.orderBy('order').toArray(), []);
  const labels = useLiveQuery(() => db.labels.toArray(), []);
  const settingRows = useLiveQuery(() => db.settings.toArray(), []);
  const goals = useLiveQuery(() => db.goals.orderBy('order').toArray(), []);

  const value = useMemo<Data | null>(() => {
    if (!tasks || !projects || !stages || !labels || !settingRows || !goals) return null;
    const s = { ...DEFAULT_SETTINGS };
    for (const r of settingRows) (s as Record<string, unknown>)[r.key] = r.value;
    return {
      tasks,
      projects,
      stages,
      labels: [...labels].sort((a, b) => a.name.localeCompare(b.name, 'pl')),
      goals,
      settings: s,
      projectById: new Map(projects.map((p) => [p.id, p])),
      stageById: new Map(stages.map((x) => [x.id, x])),
      labelById: new Map(labels.map((l) => [l.id, l])),
    };
  }, [tasks, projects, stages, labels, settingRows, goals]);

  if (!value) return <>{loading}</>;
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export const UIProvider = UICtx.Provider;

export function planWindowFor(date: string, s: AppSettings): PlanWindow {
  return weekdayIndex(date) >= 5 ? s.weekend : s.weekday;
}

export { toISO };

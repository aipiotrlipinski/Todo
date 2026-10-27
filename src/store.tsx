import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { db } from './db';
import { toISO, weekdayIndex } from './dates';
import type { Label, Project, Stage, Task, View } from './types';

export interface PlanWindow {
  start: string;
  end: string;
}

export interface AppSettings {
  weekday: PlanWindow;
  weekend: PlanWindow;
  lastExport: string | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  weekday: { start: '16:00', end: '22:00' },
  weekend: { start: '08:00', end: '22:00' },
  lastExport: null,
};

export interface Data {
  tasks: Task[];
  projects: Project[];
  stages: Stage[];
  labels: Label[];
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

  const value = useMemo<Data | null>(() => {
    if (!tasks || !projects || !stages || !labels || !settingRows) return null;
    const s = { ...DEFAULT_SETTINGS };
    for (const r of settingRows) (s as Record<string, unknown>)[r.key] = r.value;
    return {
      tasks,
      projects,
      stages,
      labels: [...labels].sort((a, b) => a.name.localeCompare(b.name, 'pl')),
      settings: s,
      projectById: new Map(projects.map((p) => [p.id, p])),
      stageById: new Map(stages.map((x) => [x.id, x])),
      labelById: new Map(labels.map((l) => [l.id, l])),
    };
  }, [tasks, projects, stages, labels, settingRows]);

  if (!value) return <>{loading}</>;
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export const UIProvider = UICtx.Provider;

export function planWindowFor(date: string, s: AppSettings): PlanWindow {
  return weekdayIndex(date) >= 5 ? s.weekend : s.weekday;
}

export { toISO };

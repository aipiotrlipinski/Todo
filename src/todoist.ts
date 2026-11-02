// Import from Todoist: either all data through the API (token) or project CSV exports.
// Nothing is deleted; existing projects/stages/labels with the same name are reused
// and tasks that already exist (same title, place and date) are skipped.

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { PROJECT_COLORS } from './actions';
import { db, newId } from './db';
import { parseQuickAdd } from './parser';
import { firstOccurrence } from './recurrence';
import type { Label, Priority, Project, Recurrence, Stage, Task } from './types';

export interface TdProject { id: string; name: string; parentId: string | null; color: string | null; isInbox: boolean; order: number }
export interface TdSection { id: string; projectId: string; name: string; order: number }
export interface TdTask {
  id: string;
  projectId: string;
  sectionId: string | null;
  parentId: string | null;
  title: string;
  notes: string;
  priority: Priority;
  dueDate: string | null;
  dueTime: string | null;
  dueString: string | null;
  recurring: boolean;
  labels: string[];
  estimate: number | null;
  order: number;
}
export interface TdData { projects: TdProject[]; sections: TdSection[]; tasks: TdTask[]; labels: string[] }

export interface ImportResult { tasks: number; skipped: number; projects: number; stages: number; labels: number }

const TD_COLORS: Record<string, string> = {
  berry_red: '#B8255F', red: '#DB4035', orange: '#FF9933', yellow: '#E0B400', olive_green: '#AFB83B',
  lime_green: '#7ECC49', green: '#299438', mint_green: '#6ACCBC', teal: '#158FAD', sky_blue: '#14AAF5',
  light_blue: '#96C3EB', blue: '#4073FF', grape: '#884DFF', violet: '#AF38EB', lavender: '#EB96EB',
  magenta: '#E05194', salmon: '#FF8D85', charcoal: '#808080', grey: '#B8B8B8', taupe: '#CCAC93',
};

const API = 'https://api.todoist.com/api/v1/';

/* ---------------- API ---------------- */

async function getJson(path: string, token: string): Promise<unknown> {
  const url = API + path;
  const headers = { Authorization: `Bearer ${token}` };
  let status: number;
  let data: unknown;
  if (Capacitor.isNativePlatform()) {
    // Native HTTP on the phone: no browser CORS limits.
    const r = await CapacitorHttp.get({ url, headers, responseType: 'json' });
    status = r.status;
    data = typeof r.data === 'string' ? JSON.parse(r.data || 'null') : r.data;
  } else {
    let r: Response;
    try {
      r = await fetch(url, { headers });
    } catch {
      throw new Error('Nie udało się połączyć z Todoist. Sprawdź internet albo użyj importu z plików CSV.');
    }
    status = r.status;
    data = r.ok ? await r.json() : null;
  }
  if (status === 401 || status === 403) throw new Error('Todoist nie przyjął tokenu. Skopiuj go jeszcze raz (bez spacji).');
  if (status < 200 || status >= 300) throw new Error(`Todoist odpowiedział błędem (${status}). Spróbuj za chwilę.`);
  return data;
}

async function getAll(resource: string, token: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 200; page++) {
    const q: string = `${resource}?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = (await getJson(q, token)) as { results?: unknown[]; next_cursor?: string | null } | unknown[];
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    out.push(...((data?.results ?? []) as Record<string, unknown>[]));
    cursor = data?.next_cursor ?? null;
    if (!cursor) break;
  }
  return out;
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);

export async function fetchTodoist(token: string): Promise<TdData> {
  const t = token.trim();
  if (!t) throw new Error('Wklej token API z Todoist.');
  const [projects, sections, tasks, labels] = await Promise.all([
    getAll('projects', t),
    getAll('sections', t),
    getAll('tasks', t),
    getAll('labels', t).catch(() => []),
  ]);
  return {
    projects: projects
      .filter((p) => !p.is_archived && !p.is_deleted)
      .map((p) => ({
        id: str(p.id),
        name: str(p.name),
        parentId: p.parent_id ? str(p.parent_id) : null,
        color: typeof p.color === 'string' ? p.color : null,
        isInbox: !!(p.inbox_project ?? p.is_inbox_project),
        order: num(p.child_order ?? p.order),
      })),
    sections: sections
      .filter((s) => !s.is_archived && !s.is_deleted)
      .map((s) => ({ id: str(s.id), projectId: str(s.project_id), name: str(s.name), order: num(s.section_order ?? s.order) })),
    tasks: tasks
      .filter((x) => !x.checked && !x.is_completed && !x.is_deleted)
      .map((x) => {
        const due = (x.due ?? null) as { date?: string; datetime?: string; string?: string; is_recurring?: boolean } | null;
        const raw = due?.datetime || due?.date || '';
        const duration = x.duration as { amount?: number; unit?: string } | null;
        const p = num(x.priority, 1);
        return {
          id: str(x.id),
          projectId: str(x.project_id),
          sectionId: x.section_id ? str(x.section_id) : null,
          parentId: x.parent_id ? str(x.parent_id) : null,
          title: str(x.content),
          notes: str(x.description),
          priority: (Math.min(4, Math.max(1, 5 - p)) as Priority), // API: 4 = urgent (p1)
          dueDate: raw ? raw.slice(0, 10) : null,
          dueTime: raw.length > 10 ? localTime(raw) : null,
          dueString: due?.string ?? null,
          recurring: !!due?.is_recurring,
          labels: Array.isArray(x.labels) ? (x.labels as unknown[]).map(str) : [],
          estimate: duration?.amount ? (duration.unit === 'day' ? duration.amount * 480 : duration.amount) : null,
          order: num(x.child_order ?? x.order),
        };
      }),
    labels: labels.map((l) => str(l.name)).filter(Boolean),
  };
}

/** '2026-11-03T14:00:00' (floating) or with Z/offset → local 'HH:MM'. */
function localTime(raw: string): string | null {
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(raw)) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const m = /T(\d\d):(\d\d)/.exec(raw);
  return m ? `${m[1]}:${m[2]}` : null;
}

/* ---------------- CSV ---------------- */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

const EN_DAYS: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

/** Recurrence from a Todoist date phrase (Polish via our parser, simple English rules). */
export function recurrenceFrom(phrase: string, today: string): Recurrence | null {
  const s = phrase.trim().toLowerCase();
  if (!s) return null;
  const pl = parseQuickAdd(s, { today, projects: [], stages: [], labels: [] }).recurrence;
  if (pl) return pl;
  if (!/\bevery\b|\bdaily\b|\bweekly\b|\bmonthly\b/.test(s)) return null;
  if (/every\s+(work\s*day|weekday)/.test(s)) return { kind: 'weekdays', interval: 1 };
  const n = Number(/every\s+(?:other\s+)?(\d+)/.exec(s)?.[1] ?? (/every\s+other/.test(s) ? 2 : 1));
  if (/every\s+(\d+\s+)?(other\s+)?days?\b|daily|every\s+day/.test(s)) return { kind: 'daily', interval: n };
  if (/every\s+(\d+\s+)?(other\s+)?months?\b|monthly/.test(s)) return { kind: 'monthly', interval: n };
  const days = [...s.matchAll(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*/g)].map((m) => EN_DAYS[m[1]]);
  if (days.length) return { kind: 'weekly', interval: 1, weekdays: [...new Set(days)] };
  if (/every\s+(\d+\s+)?(other\s+)?weeks?\b|weekly/.test(s)) return { kind: 'weekly', interval: n };
  return null;
}

function dateFrom(phrase: string, today: string): { due: string | null; time: string | null } {
  const s = phrase.trim();
  if (!s) return { due: null, time: null };
  const iso = /(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
  if (iso) return { due: iso[1], time: iso[2] ? `${iso[2]}:${iso[3]}` : null };
  const p = parseQuickAdd(s, { today, projects: [], stages: [], labels: [] });
  if (p.due || p.time) return { due: p.due ?? (p.recurrence ? today : null), time: p.time };
  if (/^today/i.test(s)) return { due: today, time: null };
  const d = new Date(/\d{4}/.test(s) ? s : `${s} ${today.slice(0, 4)}`);
  if (!isNaN(d.getTime())) {
    const due = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const time = /\d{1,2}(:\d\d)?\s*(am|pm)|\d{1,2}:\d\d/i.test(s) ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : null;
    return { due, time };
  }
  return { due: null, time: null };
}

/** One Todoist project CSV export (file name = project name). */
export function todoistFromCsv(text: string, projectName: string, today: string): TdData {
  const rows = parseCsv(text);
  if (!rows.length) return { projects: [], sections: [], tasks: [], labels: [] };
  const head = rows[0].map((h) => h.trim().toUpperCase());
  const col = (r: string[], name: string) => {
    const i = head.indexOf(name);
    return i >= 0 ? (r[i] ?? '').trim() : '';
  };
  if (!head.includes('TYPE') || !head.includes('CONTENT')) throw new Error(`Plik „${projectName}” nie wygląda na eksport CSV z Todoist.`);
  const pid = newId();
  const data: TdData = { projects: [{ id: pid, name: projectName, parentId: null, color: null, isInbox: /^(inbox|skrzynka)$/i.test(projectName), order: 0 }], sections: [], tasks: [], labels: [] };
  let section: string | null = null;
  const stack: string[] = []; // task id per indent level
  rows.slice(1).forEach((r, i) => {
    const type = col(r, 'TYPE').toLowerCase();
    const content = col(r, 'CONTENT');
    if (type === 'section') {
      section = newId();
      data.sections.push({ id: section, projectId: pid, name: content.replace(/:$/, ''), order: i });
      stack.length = 0;
      return;
    }
    if (type === 'note') {
      const last = data.tasks[data.tasks.length - 1];
      if (last && content) last.notes = last.notes ? `${last.notes}\n\n${content}` : content;
      return;
    }
    if (type !== 'task' || !content) return;
    const indent = Math.max(1, Number(col(r, 'INDENT')) || 1);
    const dateText = col(r, 'DATE');
    const rec = recurrenceFrom(dateText, today);
    const parsedDate = dateFrom(dateText, today);
    const time = parsedDate.time;
    const due = rec && !/\d{4}-\d{2}-\d{2}/.test(dateText) ? firstOccurrence(rec, today) : parsedDate.due;
    // Labels written inline in the content ("Zadanie @praca")
    const labels: string[] = [];
    const title = content.replace(/(^|\s)@([\p{L}\p{N}_-]+)/gu, (_m, sp, name) => {
      labels.push(name);
      return sp;
    }).trim();
    const prio = Number(col(r, 'PRIORITY')) || 4;
    const dur = Number(col(r, 'DURATION'));
    const id = newId();
    stack[indent - 1] = id;
    stack.length = indent;
    data.tasks.push({
      id,
      projectId: pid,
      sectionId: section,
      parentId: indent > 1 ? stack[indent - 2] ?? null : null,
      title: title || content,
      notes: col(r, 'DESCRIPTION'),
      priority: Math.min(4, Math.max(1, prio)) as Priority,
      dueDate: due ?? (rec ? today : null),
      dueTime: time,
      dueString: dateText || null,
      recurring: !!rec,
      labels,
      estimate: dur > 0 ? (col(r, 'DURATION_UNIT').toLowerCase().startsWith('day') ? dur * 480 : dur) : null,
      order: i,
    });
    labels.forEach((l) => data.labels.includes(l) || data.labels.push(l));
  });
  return data;
}

export function mergeTd(parts: TdData[]): TdData {
  return {
    projects: parts.flatMap((p) => p.projects),
    sections: parts.flatMap((p) => p.sections),
    tasks: parts.flatMap((p) => p.tasks),
    labels: [...new Set(parts.flatMap((p) => p.labels))],
  };
}

/* ---------------- Writing into the app ---------------- */

const lc = (s: string) => s.trim().toLowerCase();

export async function importTodoist(data: TdData, today: string): Promise<ImportResult> {
  const res: ImportResult = { tasks: 0, skipped: 0, projects: 0, stages: 0, labels: 0 };
  const stamp = Date.now();
  await db.transaction('rw', [db.tasks, db.projects, db.stages, db.labels], async () => {
    const [projects, stages, labels, tasks] = await Promise.all([db.projects.toArray(), db.stages.toArray(), db.labels.toArray(), db.tasks.toArray()]);

    // Labels
    const labelId = new Map<string, string>();
    labels.forEach((l) => labelId.set(lc(l.name), l.id));
    const ensureLabel = (name: string) => {
      const key = lc(name);
      if (!key) return null;
      let id = labelId.get(key);
      if (!id) {
        const l: Label = { id: newId(), name: name.trim(), color: '', createdAt: stamp, updatedAt: stamp };
        newLabels.push(l);
        labelId.set(key, l.id);
        id = l.id;
        res.labels++;
      }
      return id;
    };
    const newLabels: Label[] = [];
    data.labels.forEach(ensureLabel);

    // Projects (one level of nesting here, deeper ones go under their top project)
    const byTd = new Map(data.projects.map((p) => [p.id, p]));
    const topOf = (p: TdProject): TdProject => {
      let cur = p;
      for (let i = 0; i < 20 && cur.parentId && byTd.get(cur.parentId); i++) {
        const up = byTd.get(cur.parentId)!;
        if (!up.parentId) return up;
        cur = up;
      }
      return cur;
    };
    const depth = (p: TdProject) => {
      let d = 0;
      let cur = p;
      while (cur.parentId && byTd.get(cur.parentId) && d < 20) {
        cur = byTd.get(cur.parentId)!;
        d++;
      }
      return d;
    };
    const projectMap = new Map<string, string | null>(); // todoist id → our id (null = inbox)
    const newProjects: Project[] = [];
    const all = [...projects];
    let colorIdx = projects.length;
    [...data.projects].sort((a, b) => depth(a) - depth(b) || a.order - b.order).forEach((p, i) => {
      if (p.isInbox) {
        projectMap.set(p.id, null);
        return;
      }
      const top = p.parentId ? topOf(p) : null;
      const parentOurs = top && top.id !== p.id ? projectMap.get(top.id) ?? null : null;
      const existing = all.find((x) => lc(x.name) === lc(p.name) && (x.parentId ?? null) === parentOurs);
      if (existing) {
        projectMap.set(p.id, existing.id);
        return;
      }
      const np: Project = {
        id: newId(),
        name: p.name.trim() || 'Bez nazwy',
        parentId: parentOurs,
        color: (p.color && TD_COLORS[p.color]) || PROJECT_COLORS[colorIdx++ % PROJECT_COLORS.length],
        goal: '',
        due: null,
        status: 'active',
        order: stamp + i,
        createdAt: stamp,
        updatedAt: stamp,
      };
      newProjects.push(np);
      all.push(np);
      projectMap.set(p.id, np.id);
      res.projects++;
    });

    // Sections → stages
    const stageMap = new Map<string, string>();
    const allStages = [...stages];
    const newStages: Stage[] = [];
    [...data.sections].sort((a, b) => a.order - b.order).forEach((s, i) => {
      const pid = projectMap.get(s.projectId);
      if (!pid) return; // inbox sections: tasks stay in the inbox
      const existing = allStages.find((x) => x.projectId === pid && lc(x.name) === lc(s.name));
      if (existing) {
        stageMap.set(s.id, existing.id);
        return;
      }
      const ns: Stage = { id: newId(), projectId: pid, name: s.name.trim() || 'Sekcja', order: stamp + i, due: null, status: 'open', createdAt: stamp, updatedAt: stamp };
      newStages.push(ns);
      allStages.push(ns);
      stageMap.set(s.id, ns.id);
      res.stages++;
    });

    // Tasks (subtasks: one level, deeper ones attach to the top task)
    const tdTask = new Map(data.tasks.map((t) => [t.id, t]));
    const rootOf = (t: TdTask) => {
      let cur = t;
      for (let i = 0; i < 20 && cur.parentId && tdTask.get(cur.parentId); i++) cur = tdTask.get(cur.parentId)!;
      return cur;
    };
    const taskMap = new Map<string, string>();
    const newTasks: Task[] = [];
    const seen = new Set(tasks.filter((t) => t.status === 'open').map((t) => `${lc(t.title)}|${t.projectId ?? ''}|${t.due ?? ''}`));
    const ordered = [...data.tasks].sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0) || a.order - b.order);
    ordered.forEach((t, i) => {
      const root = t.parentId ? rootOf(t) : null;
      const parentId = root && root.id !== t.id ? taskMap.get(root.id) ?? null : null;
      const parent = parentId ? newTasks.find((x) => x.id === parentId) ?? tasks.find((x) => x.id === parentId) : undefined;
      const projectId = parent ? parent.projectId : projectMap.get(t.projectId) ?? null;
      const stageId = parent ? parent.stageId : t.sectionId ? stageMap.get(t.sectionId) ?? null : null;
      const rec = t.recurring && t.dueString ? recurrenceFrom(t.dueString, today) : null;
      const key = `${lc(t.title)}|${projectId ?? ''}|${t.dueDate ?? ''}`;
      if (!t.title.trim()) return;
      if (seen.has(key)) {
        res.skipped++;
        const dup = tasks.find((x) => x.status === 'open' && `${lc(x.title)}|${x.projectId ?? ''}|${x.due ?? ''}` === key);
        if (dup) taskMap.set(t.id, dup.id);
        return;
      }
      seen.add(key);
      const nt: Task = {
        id: newId(),
        title: t.title.trim(),
        notes: t.notes,
        projectId,
        stageId,
        parentId,
        due: t.dueDate,
        time: t.dueTime,
        priority: t.priority,
        labels: t.labels.map(ensureLabel).filter((x): x is string => !!x),
        estimate: t.estimate,
        recurrence: rec,
        status: 'open',
        completedAt: null,
        order: stamp + i,
        createdAt: stamp,
        updatedAt: stamp,
      };
      newTasks.push(nt);
      taskMap.set(t.id, nt.id);
      res.tasks++;
    });

    await db.labels.bulkAdd(newLabels);
    await db.projects.bulkAdd(newProjects);
    await db.stages.bulkAdd(newStages);
    await db.tasks.bulkAdd(newTasks);
  });
  return res;
}

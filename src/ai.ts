// Assistant powered by Claude (Anthropic API). The API key is stored only on this device (settings).
// Two jobs: (1) turn free text / dictation into tasks, (2) break a project into stages and steps.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { addDays, WEEKDAYS } from './dates';
import type { Project, Stage, Task } from './types';

export const AI_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (zalecany)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (szybszy, tańszy)' },
];

export interface AiTask {
  title: string;
  due: string | null;
  time: string | null;
  estimate: number | null;
  priority: 1 | 2 | 3 | 4;
  project: string | null;
  stage: string | null;
  labels: string[];
  notes: string;
  subtasks: string[];
}

export interface AiStage {
  name: string;
  tasks: AiTask[];
}

// ---------------- Prompts ----------------

const TASK_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Krótki tytuł zadania, zaczynający się od czasownika' },
    due: { type: ['string', 'null'], description: 'Termin YYYY-MM-DD albo null' },
    time: { type: ['string', 'null'], description: 'Godzina HH:MM albo null' },
    estimate: { type: ['integer', 'null'], description: 'Szacowany czas w minutach' },
    priority: { type: 'integer', enum: [1, 2, 3, 4], description: '1 pilne … 4 brak' },
    project: { type: ['string', 'null'], description: 'Nazwa istniejącego projektu dokładnie jak na liście albo null' },
    stage: { type: ['string', 'null'], description: 'Nazwa istniejącego etapu tego projektu albo null' },
    labels: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
    subtasks: { type: 'array', items: { type: 'string' }, description: 'Kroki, jeśli zadanie jest duże' },
  },
  required: ['title'],
};

export interface CaptureContext {
  today: string;
  projects: Project[];
  stages: Stage[];
  labelNames: string[];
}

function calendar(today: string): string {
  return Array.from({ length: 14 }, (_, i) => {
    const d = addDays(today, i);
    return `${d} = ${WEEKDAYS[(new Date(d + 'T12:00').getDay() + 6) % 7]}${i === 0 ? ' (dziś)' : i === 1 ? ' (jutro)' : ''}`;
  }).join('\n');
}

export function captureRequest(text: string, ctx: CaptureContext, model: string) {
  const projectList = ctx.projects
    .filter((p) => p.status !== 'done')
    .map((p) => {
      const st = ctx.stages.filter((s) => s.projectId === p.id).map((s) => s.name);
      return `- ${p.name}${st.length ? ` (etapy: ${st.join(', ')})` : ''}`;
    })
    .join('\n');
  const system = [
    'Jesteś asystentem w osobistej aplikacji do zadań. Użytkownik pisze lub dyktuje po polsku, często chaotycznie.',
    'Wyciągnij z tekstu konkretne zadania i wywołaj narzędzie add_tasks. Nie wymyślaj zadań, których nie ma w tekście.',
    'Tytuły krótkie, od czasownika, bez daty i godziny w tytule. Daty licz według kalendarza poniżej.',
    'Szacuj realistycznie czas (estimate) każdego zadania w minutach. Priorytet 4, chyba że tekst mówi o pilności.',
    'Projekt i etap wybieraj tylko z listy (dokładna nazwa); jeśli nic nie pasuje, daj null. Etykiety tylko z listy.',
    'Duże zadanie rozbij na 2–6 kroków w subtasks.',
    '',
    `Kalendarz:\n${calendar(ctx.today)}`,
    '',
    `Projekty:\n${projectList || '(brak)'}`,
    '',
    `Etykiety: ${ctx.labelNames.join(', ') || '(brak)'}`,
  ].join('\n');
  return {
    model,
    max_tokens: 4096,
    system,
    tools: [
      {
        name: 'add_tasks',
        description: 'Dodaje zadania do aplikacji użytkownika.',
        input_schema: { type: 'object', properties: { tasks: { type: 'array', items: TASK_SCHEMA } }, required: ['tasks'] },
      },
    ],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: text }],
  };
}

export function breakdownRequest(project: Project, stages: Stage[], tasks: Task[], extra: string, today: string, model: string) {
  const existing = stages
    .map((s) => `Etap „${s.name}”: ${tasks.filter((t) => t.stageId === s.id && t.status === 'open').map((t) => t.title).join('; ') || '(pusty)'}`)
    .concat(tasks.filter((t) => !t.stageId && t.status === 'open' && !t.parentId).length ? [`Bez etapu: ${tasks.filter((t) => !t.stageId && t.status === 'open' && !t.parentId).map((t) => t.title).join('; ')}`] : [])
    .join('\n');
  const system = [
    'Jesteś doświadczonym planistą projektów. Rozpisz projekt użytkownika na etapy i konkretne kroki.',
    'Każdy krok to jedno fizyczne działanie (od czasownika), wykonalne w jednym podejściu (15–120 min), z realnym szacunkiem w minutach.',
    'Etapy w logicznej kolejności, 2–6 etapów, po 2–7 kroków. Nie powtarzaj zadań, które już istnieją.',
    'Jeśli projekt ma już etapy, możesz dopisać kroki do istniejącego etapu (podaj jego dokładną nazwę) albo dodać nowe etapy.',
    'Nie ustawiaj terminów (due = null). Odpowiedz wywołując narzędzie plan_project. Pisz po polsku.',
    `Dziś: ${today}.`,
  ].join('\n');
  const user = [
    `Projekt: ${project.name}`,
    project.goal ? `Cel projektu: ${project.goal}` : '',
    existing ? `Co już jest:\n${existing}` : 'Projekt jest pusty.',
    extra.trim() ? `Dodatkowe informacje od użytkownika: ${extra.trim()}` : '',
  ].filter(Boolean).join('\n\n');
  return {
    model,
    max_tokens: 6000,
    system,
    tools: [
      {
        name: 'plan_project',
        description: 'Zapisuje plan projektu: etapy z krokami.',
        input_schema: {
          type: 'object',
          properties: {
            stages: {
              type: 'array',
              items: { type: 'object', properties: { name: { type: 'string' }, tasks: { type: 'array', items: TASK_SCHEMA } }, required: ['name', 'tasks'] },
            },
          },
          required: ['stages'],
        },
      },
    ],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: user }],
  };
}

// ---------------- Calling the API ----------------

const API = 'https://api.anthropic.com/v1/messages';

export async function callClaude(key: string, body: unknown): Promise<unknown> {
  if (!key.trim()) throw new Error('Najpierw wklej klucz API w Ustawieniach → Asystent AI.');
  const headers = {
    'x-api-key': key.trim(),
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    // lets the browser call the API directly (the key never leaves this device except to Anthropic)
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  let status: number;
  let data: unknown;
  try {
    if (Capacitor.isNativePlatform()) {
      const r = await CapacitorHttp.post({ url: API, headers, data: body, responseType: 'json' });
      status = r.status;
      data = typeof r.data === 'string' ? JSON.parse(r.data || 'null') : r.data;
    } else {
      const r = await fetch(API, { method: 'POST', headers, body: JSON.stringify(body) });
      status = r.status;
      data = await r.json().catch(() => null);
    }
  } catch {
    throw new Error('Brak połączenia z asystentem. Sprawdź internet.');
  }
  if (status === 401 || status === 403) throw new Error('Klucz API nie działa. Skopiuj go jeszcze raz w Ustawieniach.');
  if (status === 429) throw new Error('Za dużo zapytań naraz. Spróbuj za minutę.');
  if (status === 529 || status >= 500) throw new Error('Asystent jest chwilowo przeciążony. Spróbuj za chwilę.');
  if (status < 200 || status >= 300) {
    const msg = (data as { error?: { message?: string } })?.error?.message;
    throw new Error(`Błąd asystenta (${status})${msg ? `: ${msg}` : ''}`);
  }
  return data;
}

// ---------------- Reading the answer ----------------

/** Input of the tool call; falls back to JSON written as text. */
export function toolInput(response: unknown, tool: string): Record<string, unknown> | null {
  const content = (response as { content?: unknown[] })?.content;
  if (!Array.isArray(content)) return null;
  for (const b of content as { type?: string; name?: string; input?: unknown }[]) {
    if (b.type === 'tool_use' && b.name === tool && b.input && typeof b.input === 'object') return b.input as Record<string, unknown>;
  }
  const text = (content as { type?: string; text?: string }[]).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {
      /* ignore */
    }
  }
  return null;
}

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function cleanTask(raw: unknown, today: string): AiTask | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = str(r.title, 200);
  if (!title) return null;
  const due = typeof r.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.due) && !Number.isNaN(Date.parse(r.due)) ? r.due : null;
  const time = typeof r.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time : null;
  const est = Number(r.estimate);
  const pr = Number(r.priority);
  return {
    title,
    due: due && due >= addDays(today, -1) ? due : due ? today : null,
    time,
    estimate: Number.isFinite(est) && est > 0 ? Math.min(600, Math.round(est)) : null,
    priority: [1, 2, 3, 4].includes(pr) ? (pr as AiTask['priority']) : 4,
    project: str(r.project, 120) || null,
    stage: str(r.stage, 120) || null,
    labels: Array.isArray(r.labels) ? r.labels.map((l) => str(l, 40).replace(/^@/, '')).filter(Boolean).slice(0, 5) : [],
    notes: str(r.notes, 2000),
    subtasks: Array.isArray(r.subtasks) ? r.subtasks.map((s) => str(s, 200)).filter(Boolean).slice(0, 12) : [],
  };
}

export function parseCapture(response: unknown, today: string): AiTask[] {
  const input = toolInput(response, 'add_tasks');
  const list = Array.isArray(input?.tasks) ? input!.tasks : [];
  return list.map((t) => cleanTask(t, today)).filter((t): t is AiTask => !!t).slice(0, 40);
}

export function parseBreakdown(response: unknown, today: string): AiStage[] {
  const input = toolInput(response, 'plan_project');
  const list = Array.isArray(input?.stages) ? input!.stages : [];
  return list
    .map((s) => {
      const r = s as Record<string, unknown>;
      const tasks = (Array.isArray(r.tasks) ? r.tasks : []).map((t) => cleanTask(t, today)).filter((t): t is AiTask => !!t);
      return { name: str(r.name, 120), tasks: tasks.map((t) => ({ ...t, due: null, time: null })) };
    })
    .filter((s) => s.name && s.tasks.length)
    .slice(0, 10);
}

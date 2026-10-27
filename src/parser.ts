// Quick-add parser for Polish.
// Example: "Raport dostaw jutro 14:00 #Magazyn /Etap2 @praca !1 ~30m"
// Each recognised piece becomes a token (for highlighting) and is removed from the title.

import { addDays, addMonths, isValidDate, nextWeekday, fromISO } from './dates';
import { firstOccurrence } from './recurrence';
import type { Priority, Recurrence } from './types';

export type TokenKind = 'date' | 'time' | 'project' | 'stage' | 'label' | 'priority' | 'estimate' | 'recurrence';

export interface Token {
  kind: TokenKind;
  start: number;
  end: number;
}

export interface NamedRef {
  id: string | null; // null = will be created
  name: string;
}

export interface Parsed {
  title: string;
  due: string | null;
  time: string | null;
  project: NamedRef | null;
  stage: NamedRef | null;
  labels: NamedRef[];
  priority: Priority | null;
  estimate: number | null;
  recurrence: Recurrence | null;
  tokens: Token[];
}

export interface ParseContext {
  today: string;
  projects: { id: string; name: string }[];
  stages: { id: string; projectId: string; name: string }[];
  labels: { id: string; name: string }[];
  /** Project the task will land in when no #project is typed (e.g. inside a project view). */
  defaultProjectId?: string | null;
}

// Word boundaries that understand Polish letters.
const S = '(?<=^|[\\s,;(])';
const E = '(?=$|[\\s,;.!?)])';

const WD_GROUPS: [string, number][] = [
  ['poniedziałek|poniedzialek|pon|pn', 0],
  ['wtorek|wto|wt', 1],
  ['środa|środę|środy|sroda|srode|śr|sr', 2],
  ['czwartek|czw', 3],
  ['piątek|piatek|pią|pia|pt', 4],
  ['sobota|sobotę|sobote|soboty|sob', 5],
  ['niedziela|niedzielę|niedziele|niedzieli|niedz|nd', 6],
];
const WD_ALL = WD_GROUPS.map(([s]) => s).join('|');

function weekdayFromWord(word: string): number {
  const w = word.toLowerCase();
  for (const [alts, idx] of WD_GROUPS) if (alts.split('|').includes(w)) return idx;
  return -1;
}

const MONTHS: [string, number][] = [
  ['stycznia|styczeń|styczen|sty', 1],
  ['lutego|luty|lut', 2],
  ['marca|marzec|mar', 3],
  ['kwietnia|kwiecień|kwiecien|kwi', 4],
  ['maja|maj', 5],
  ['czerwca|czerwiec|cze', 6],
  ['lipca|lipiec|lip', 7],
  ['sierpnia|sierpień|sierpien|sie', 8],
  ['września|wrzesnia|wrzesień|wrzesien|wrz', 9],
  ['października|pazdziernika|październik|pazdziernik|paź|paz', 10],
  ['listopada|listopad|lis', 11],
  ['grudnia|grudzień|grudzien|gru', 12],
];
const MONTH_ALL = MONTHS.map(([s]) => s).join('|');

function monthFromWord(word: string): number {
  const w = word.toLowerCase();
  for (const [alts, idx] of MONTHS) if (alts.split('|').includes(w)) return idx;
  return 0;
}

const re = (src: string) => new RegExp(`${S}(?:${src})${E}`, 'iu');

/** Resolves a full date from day + month (+ year); without year picks the next such date. */
function makeDate(today: string, d: number, m: number, y?: number): string | null {
  const ty = fromISO(today).getFullYear();
  let year = y ?? ty;
  if (year < 100) year += 2000;
  if (!isValidDate(year, m, d)) return null;
  const iso = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (y === undefined && iso < today) return makeDate(today, d, m, ty + 1);
  return iso;
}

function plural(word: string): 'day' | 'week' | 'month' {
  const w = word.toLowerCase();
  if (w.startsWith('dni') || w.startsWith('dzie')) return 'day';
  if (w.startsWith('tyg') || w.startsWith('tydz') || w.startsWith('tydzień')) return 'week';
  return 'month';
}

export function parseQuickAdd(input: string, ctx: ParseContext): Parsed {
  let masked = input;
  const tokens: Token[] = [];
  const out: Parsed = {
    title: '',
    due: null,
    time: null,
    project: null,
    stage: null,
    labels: [],
    priority: null,
    estimate: null,
    recurrence: null,
    tokens,
  };

  const consume = (kind: TokenKind, start: number, end: number) => {
    tokens.push({ kind, start, end });
    masked = masked.slice(0, start) + ' '.repeat(end - start) + masked.slice(end);
  };

  /** Runs one pattern; handler returns false to reject the match. */
  const take = (kind: TokenKind, src: string, handler: (m: RegExpExecArray) => boolean): boolean => {
    const m = re(src).exec(masked);
    if (!m || !handler(m)) return false;
    consume(kind, m.index, m.index + m[0].length);
    return true;
  };

  const { today } = ctx;

  // 1. Recurrence
  const recPatterns: [string, (m: RegExpExecArray) => Recurrence | null][] = [
    ['codziennie|co\\s+dzień|co\\s+dzien|każdego\\s+dnia|kazdego\\s+dnia', () => ({ kind: 'daily', interval: 1 })],
    ['co\\s+(\\d+)\\s+(?:dni|dzień|dzien)', (m) => ({ kind: 'daily', interval: Number(m[1]) })],
    ['w\\s+dni\\s+robocze|co\\s+dzień\\s+roboczy|co\\s+dzien\\s+roboczy|dni\\s+robocze', () => ({ kind: 'weekdays', interval: 1 })],
    ['co\\s+tydzień|co\\s+tydzien|co\\s+tydz|cotygodniowo', () => ({ kind: 'weekly', interval: 1 })],
    ['co\\s+(\\d+)\\s+(?:tygodnie|tygodni|tyg)', (m) => ({ kind: 'weekly', interval: Number(m[1]) })],
    ['co\\s+miesiąc|co\\s+miesiac|comiesięcznie|comiesiecznie', () => ({ kind: 'monthly', interval: 1 })],
    ['co\\s+(\\d+)\\s+(?:miesiące|miesiace|miesięcy|miesiecy|mies)', (m) => ({ kind: 'monthly', interval: Number(m[1]) })],
    [
      `(?:co|w\\s+każdy|w\\s+każdą|w\\s+kazdy|w\\s+kazda|każdy|każdą|kazdy|kazda)\\s+((?:${WD_ALL})(?:\\s*(?:,|i)\\s*(?:${WD_ALL}))*)`,
      (m) => {
        const days = m[1]
          .split(/\s*(?:,|\si\s)\s*/u)
          .map((w) => weekdayFromWord(w.trim()))
          .filter((x) => x >= 0);
        return days.length ? { kind: 'weekly', interval: 1, weekdays: [...new Set(days)] } : null;
      },
    ],
  ];
  for (const [src, build] of recPatterns) {
    let rec: Recurrence | null = null;
    if (take('recurrence', src, (m) => (rec = build(m)) !== null && rec.interval > 0)) {
      out.recurrence = rec;
      break;
    }
  }

  // 2. Priority  !1 … !4  or  p1 … p4
  take('priority', '(?:!|p)([1-4])', (m) => {
    out.priority = Number(m[1]) as Priority;
    return true;
  });

  // 3. Estimate  ~30m  ~45  ~1h  ~1h30m  ~1,5h  ~90min
  {
    const m = /(?<=^|\s)~\s?(\d+(?:[.,]\d+)?)\s?(h|godz|g|m|min)?(?:\s?(\d+)\s?(?:m|min))?(?=$|\s|[,;.])/iu.exec(masked);
    if (m) {
      const num = Number(m[1].replace(',', '.'));
      const unit = (m[2] || 'm').toLowerCase();
      let minutes = unit.startsWith('h') || unit.startsWith('g') ? num * 60 : num;
      if (m[3]) minutes += Number(m[3]);
      minutes = Math.round(minutes);
      if (minutes > 0 && minutes <= 24 * 60) {
        out.estimate = minutes;
        consume('estimate', m.index, m.index + m[0].length);
      }
    }
  }

  // 4. Project  #Name  (existing names may contain spaces; longest match wins)
  const symbolRef = (symbol: string, known: { id: string; name: string }[]): { ref: NamedRef; start: number; end: number } | null => {
    const esc = symbol === '/' ? '\\/' : symbol;
    const sm = new RegExp(`(?<=^|\\s)${esc}(?=\\S)`, 'u').exec(masked);
    if (!sm) return null;
    const start = sm.index;
    const rest = masked.slice(start + 1);
    const lower = rest.toLowerCase();
    // Quoted name: #"Aplikacja do zadań" or #„Aplikacja do zadań”
    const quoted = /^["„“]([^"”“]+)["”“]/u.exec(rest);
    if (quoted) {
      const name = quoted[1].trim();
      const k = known.find((x) => x.name.toLowerCase() === name.toLowerCase());
      return { ref: { id: k?.id ?? null, name: k?.name ?? name }, start, end: start + 1 + quoted[0].length };
    }
    const sorted = [...known].sort((a, b) => b.name.length - a.name.length);
    for (const k of sorted) {
      const n = k.name.toLowerCase();
      if (lower.startsWith(n) && /^(?:$|[\s,;.!?])/u.test(rest.slice(n.length))) {
        return { ref: { id: k.id, name: k.name }, start, end: start + 1 + n.length };
      }
    }
    const word = /^[^\s#@!~/,;]+/u.exec(rest);
    if (!word) return null;
    return { ref: { id: null, name: word[0] }, start, end: start + 1 + word[0].length };
  };

  const pr = symbolRef('#', ctx.projects);
  if (pr) {
    out.project = pr.ref;
    consume('project', pr.start, pr.end);
  }

  // 5. Stage  /Name  — looked up within the chosen (or default) project
  const stageProjectId = out.project ? out.project.id : ctx.defaultProjectId ?? null;
  const st = symbolRef('/', stageProjectId ? ctx.stages.filter((s) => s.projectId === stageProjectId) : []);
  if (st && (stageProjectId || out.project)) {
    out.stage = st.ref;
    consume('stage', st.start, st.end);
  }

  // 6. Labels  @name (several allowed)
  for (let i = 0; i < 10; i++) {
    const lb = symbolRef('@', ctx.labels);
    if (!lb) break;
    if (!out.labels.some((l) => l.name.toLowerCase() === lb.ref.name.toLowerCase())) out.labels.push(lb.ref);
    consume('label', lb.start, lb.end);
  }

  // 7. Date
  const setDue = (d: string | null) => {
    if (!d) return false;
    out.due = d;
    return true;
  };
  const datePatterns: [string, (m: RegExpExecArray) => boolean][] = [
    ['dzisiaj|dziś|dzis', () => setDue(today)],
    ['pojutrze', () => setDue(addDays(today, 2))],
    ['wczoraj', () => setDue(addDays(today, -1))],
    ['jutro', () => setDue(addDays(today, 1))],
    ['za\\s+(\\d+)\\s+(dni|dzień|dzien|tygodnie|tygodni|tyg|miesiące|miesiace|miesięcy|miesiecy)', (m) => {
      const n = Number(m[1]);
      const u = plural(m[2]);
      return setDue(u === 'day' ? addDays(today, n) : u === 'week' ? addDays(today, 7 * n) : addMonths(today, n));
    }],
    ['za\\s+(tydzień|tydzien)', () => setDue(addDays(today, 7))],
    ['za\\s+(miesiąc|miesiac)', () => setDue(addMonths(today, 1))],
    ['w\\s+przyszłym\\s+tygodniu|w\\s+przyszlym\\s+tygodniu|przyszły\\s+tydzień|przyszly\\s+tydzien|następny\\s+tydzień|nastepny\\s+tydzien', () => setDue(nextWeekday(today, 0))],
    ['(?:w\\s+)?weekend', () => setDue(nextWeekday(today, 5, true))],
    [`(?:we?\\s+)?(?:następny|nastepny|następną|nastepna|następne|nastepne|przyszły|przyszly|przyszłą|przyszla)?\\s*(${WD_ALL})`, (m) => {
      const idx = weekdayFromWord(m[1]);
      return idx >= 0 && setDue(nextWeekday(today, idx));
    }],
    ['(\\d{1,2})[./](\\d{2})(?:[./](\\d{4}|\\d{2}))?', (m) =>
      setDue(makeDate(today, Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined))],
    [`(\\d{1,2})\\s+(${MONTH_ALL})(?:\\s+(\\d{4}))?`, (m) =>
      setDue(makeDate(today, Number(m[1]), monthFromWord(m[2]), m[3] ? Number(m[3]) : undefined))],
  ];
  for (const [src, h] of datePatterns) if (take('date', src, h)) break;

  // 8. Time  14:00  o 14  o 9:30  godz. 14
  const setTime = (h: number, min: number) => {
    if (h > 23 || min > 59) return false;
    out.time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    return true;
  };
  take('time', '(?:o\\s+|godz\\.?\\s*|na\\s+)?(\\d{1,2}):(\\d{2})', (m) => setTime(Number(m[1]), Number(m[2]))) ||
    take('time', '(?:o|godz\\.?)\\s*(\\d{1,2})(?:\\.(\\d{2}))?', (m) => setTime(Number(m[1]), Number(m[2] ?? 0)));

  // Defaults that follow from other parts
  if (out.recurrence && !out.due) out.due = firstOccurrence(out.recurrence, today);
  if (out.time && !out.due) out.due = today;

  out.title = masked.replace(/\s+/g, ' ').replace(/\s+([,;.!?])/g, '$1').replace(/^[\s,;]+|[\s,;]+$/g, '');
  tokens.sort((a, b) => a.start - b.start);
  return out;
}

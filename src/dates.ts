// Local-calendar date helpers. All dates are 'YYYY-MM-DD' strings in local time.

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(now = new Date()): string {
  return toISO(now);
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function addMonths(iso: string, n: number): string {
  const d = fromISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(iso: string): number {
  return (fromISO(iso).getDay() + 6) % 7;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000);
}

/** Next date with the given weekday. On the same weekday: today if allowToday, else in a week. */
export function nextWeekday(from: string, idx: number, allowToday = false): string {
  let d = (idx - weekdayIndex(from) + 7) % 7;
  if (d === 0 && !allowToday) d = 7;
  return addDays(from, d);
}

export function isValidDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(y, m, 0).getDate();
}

export const WEEKDAYS = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'];
export const WEEKDAYS_SHORT = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'];
export const MONTHS_GEN = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];
export const MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

/** "poniedziałek, 26 października" */
export function formatLong(iso: string): string {
  const d = fromISO(iso);
  return `${WEEKDAYS[weekdayIndex(iso)]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

/** Short relative label for a due date: Dziś, Jutro, Wczoraj, weekday, or "12 lis". */
export function formatDue(iso: string, today: string): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return 'Dziś';
  if (diff === 1) return 'Jutro';
  if (diff === 2) return 'Pojutrze';
  if (diff === -1) return 'Wczoraj';
  const d = fromISO(iso);
  if (diff > 2 && diff < 7) return WEEKDAYS[weekdayIndex(iso)];
  const sameYear = d.getFullYear() === fromISO(today).getFullYear();
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${sameYear ? '' : ' ' + d.getFullYear()}`;
}

export function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minToTime(m: number): string {
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
}

/** 135 → "2 h 15 min" */
export function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

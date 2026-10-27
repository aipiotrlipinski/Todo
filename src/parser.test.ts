import { describe, expect, it } from 'vitest';
import { parseQuickAdd, type ParseContext } from './parser';
import { nextDueAfterDone } from './recurrence';

// Sunday 25 Oct 2026
const ctx: ParseContext = {
  today: '2026-10-25',
  projects: [
    { id: 'p1', name: 'Magazyn' },
    { id: 'p2', name: 'Nauka AI' },
  ],
  stages: [{ id: 's1', projectId: 'p1', name: 'Etap2' }],
  labels: [{ id: 'l1', name: 'praca' }],
};
const P = (s: string, c: Partial<ParseContext> = {}) => parseQuickAdd(s, { ...ctx, ...c });

describe('quick add parser', () => {
  it('parses the full example', () => {
    const r = P('Raport dostaw jutro 14:00 #Magazyn /Etap2 @praca !1 ~30m');
    expect(r.title).toBe('Raport dostaw');
    expect(r.due).toBe('2026-10-26');
    expect(r.time).toBe('14:00');
    expect(r.project).toEqual({ id: 'p1', name: 'Magazyn' });
    expect(r.stage).toEqual({ id: 's1', name: 'Etap2' });
    expect(r.labels).toEqual([{ id: 'l1', name: 'praca' }]);
    expect(r.priority).toBe(1);
    expect(r.estimate).toBe(30);
    expect(r.tokens).toHaveLength(7);
  });

  it('matches project names with spaces', () => {
    const r = P('Kurs AI moduł 4 jutro 20:00 #Nauka AI ~45m');
    expect(r.title).toBe('Kurs AI moduł 4');
    expect(r.project?.id).toBe('p2');
    expect(r.estimate).toBe(45);
  });

  it('creates unknown project, stage and labels', () => {
    const r = P('Malowanie #Remont /Kuchnia @dom @weekend');
    expect(r.project).toEqual({ id: null, name: 'Remont' });
    expect(r.stage).toEqual({ id: null, name: 'Kuchnia' });
    expect(r.labels.map((l) => l.name)).toEqual(['dom', 'weekend']);
    expect(r.title).toBe('Malowanie');
  });

  it('understands Polish day words', () => {
    expect(P('a dziś').due).toBe('2026-10-25');
    expect(P('a dzisiaj').due).toBe('2026-10-25');
    expect(P('a pojutrze').due).toBe('2026-10-27');
    expect(P('a w piątek').due).toBe('2026-10-30');
    expect(P('a we wtorek').due).toBe('2026-10-27');
    expect(P('a pon').due).toBe('2026-10-26');
    expect(P('a w niedzielę').due).toBe('2026-11-01'); // same weekday → next week
    expect(P('a za 3 dni').due).toBe('2026-10-28');
    expect(P('a za tydzień').due).toBe('2026-11-01');
    expect(P('a za 2 tygodnie').due).toBe('2026-11-08');
    expect(P('a za miesiąc').due).toBe('2026-11-25');
    expect(P('a w przyszłym tygodniu').due).toBe('2026-10-26');
  });

  it('understands explicit dates', () => {
    expect(P('a 12.11').due).toBe('2026-11-12');
    expect(P('a 12/11').due).toBe('2026-11-12');
    expect(P('a 3.01').due).toBe('2027-01-03'); // past → next year
    expect(P('a 12 listopada').due).toBe('2026-11-12');
    expect(P('a 5 sty 2027').due).toBe('2027-01-05');
    expect(P('a 31.02').due).toBeNull();
  });

  it('understands times', () => {
    expect(P('a o 14').time).toBe('14:00');
    expect(P('a o 9:30').time).toBe('09:30');
    const r = P('Spotkanie 16:15');
    expect(r.time).toBe('16:15');
    expect(r.due).toBe('2026-10-25'); // time alone → today
    expect(r.title).toBe('Spotkanie');
  });

  it('understands estimates', () => {
    expect(P('a ~1h').estimate).toBe(60);
    expect(P('a ~1h30m').estimate).toBe(90);
    expect(P('a ~1,5h').estimate).toBe(90);
    expect(P('a ~90min').estimate).toBe(90);
    expect(P('a ~20').estimate).toBe(20);
  });

  it('understands recurrence', () => {
    const d = P('Trening codziennie');
    expect(d.recurrence).toEqual({ kind: 'daily', interval: 1 });
    expect(d.due).toBe('2026-10-25');
    const w = P('Raport co pon');
    expect(w.recurrence).toEqual({ kind: 'weekly', interval: 1, weekdays: [0] });
    expect(w.due).toBe('2026-10-26');
    expect(w.title).toBe('Raport');
    const two = P('Siłownia co pon i czw');
    expect(two.recurrence?.weekdays).toEqual([0, 3]);
    expect(P('Rachunki co miesiąc').recurrence?.kind).toBe('monthly');
    expect(P('Mail w dni robocze').recurrence?.kind).toBe('weekdays');
    expect(P('Mail w dni robocze').due).toBe('2026-10-26');
    expect(P('Pranie co 3 dni').recurrence).toEqual({ kind: 'daily', interval: 3 });
    const three = P('Bieganie co wt, czw i pt ~40m');
    expect(three.recurrence).toEqual({ kind: 'weekly', interval: 1, weekdays: [1, 3, 4] });
    expect(three.due).toBe('2026-10-27');
    expect(three.title).toBe('Bieganie');
    expect(P('Basen w każdy wtorek, czwartek i piątek').recurrence?.weekdays).toEqual([1, 3, 4]);
    expect(P('Basen co wtorek i piątek').title).toBe('Basen');
  });

  it('leaves normal text alone', () => {
    expect(P('Zadzwonić do serwisu auta').title).toBe('Zadzwonić do serwisu auta');
    expect(P('Napisać do jan@firma.pl').labels).toEqual([]);
    expect(P('Przeczytać rozdział 2.1 ~30m').due).toBeNull();
    expect(P('Zrobić 1-2 strony').due).toBeNull();
    expect(P('Sprawdzić http://example.com/a').stage).toBeNull();
  });

  it('accepts quoted multi-word names and wczoraj', () => {
    const r = P('Szkic #"Aplikacja do zadań" /„Etap 1” wczoraj');
    expect(r.project).toEqual({ id: null, name: 'Aplikacja do zadań' });
    expect(r.stage).toEqual({ id: null, name: 'Etap 1' });
    expect(r.due).toBe('2026-10-24');
    expect(r.title).toBe('Szkic');
  });

  it('uses the default project for /stage', () => {
    const r = P('Regał /Etap2', { defaultProjectId: 'p1' });
    expect(r.stage).toEqual({ id: 's1', name: 'Etap2' });
  });
});

describe('recurrence', () => {
  it('moves the due date to the next future occurrence', () => {
    expect(nextDueAfterDone({ kind: 'daily', interval: 1 }, '2026-10-22', '2026-10-25')).toBe('2026-10-26');
    expect(nextDueAfterDone({ kind: 'weekly', interval: 1, weekdays: [0, 3] }, '2026-10-26', '2026-10-26')).toBe('2026-10-29');
    expect(nextDueAfterDone({ kind: 'monthly', interval: 1 }, '2026-01-31', '2026-01-31')).toBe('2026-02-28');
    expect(nextDueAfterDone({ kind: 'weekdays', interval: 1 }, '2026-10-30', '2026-10-30')).toBe('2026-11-02');
  });
});

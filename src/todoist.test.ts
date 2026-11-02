import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { importTodoist, parseCsv, recurrenceFrom, todoistFromCsv, type TdData } from './todoist';

const TODAY = '2026-11-02';

describe('CSV z Todoist', () => {
  it('czyta pola w cudzysłowach i wiele linii', () => {
    const rows = parseCsv('TYPE,CONTENT\ntask,"Kup, mleko"\ntask,"Linia 1\nLinia 2"\n');
    expect(rows).toEqual([['TYPE', 'CONTENT'], ['task', 'Kup, mleko'], ['task', 'Linia 1\nLinia 2']]);
  });

  it('sekcje, podzadania, notatki, priorytety, daty', () => {
    const csv = [
      'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DURATION,DURATION_UNIT',
      'task,Bez sekcji @praca,,1,1,,,2026-11-05,en,,30,minute',
      'section,Etap A,,,,,,,,,,',
      'task,Rodzic,,4,1,,,every monday,en,,,',
      'task,Dziecko,,4,2,,,,,,,',
      'task,Wnuk,,4,3,,,,,,,',
      'note,Notatka do wnuka,,,,,,,,,,',
    ].join('\n');
    const d = todoistFromCsv(csv, 'Dom', TODAY);
    expect(d.projects[0].name).toBe('Dom');
    expect(d.sections.map((s) => s.name)).toEqual(['Etap A']);
    const [a, parent, child, grand] = d.tasks;
    expect(a).toMatchObject({ title: 'Bez sekcji', priority: 1, dueDate: '2026-11-05', estimate: 30, labels: ['praca'], sectionId: null });
    expect(parent.recurring).toBe(true);
    expect(parent.dueDate).toBe(TODAY);
    expect(child.parentId).toBe(parent.id);
    expect(grand.parentId).toBe(child.id);
    expect(grand.notes).toBe('Notatka do wnuka');
  });
});

describe('powtarzanie z Todoist', () => {
  it('angielskie i polskie frazy', () => {
    expect(recurrenceFrom('every day', TODAY)).toEqual({ kind: 'daily', interval: 1 });
    expect(recurrenceFrom('every 2 weeks', TODAY)).toEqual({ kind: 'weekly', interval: 2 });
    expect(recurrenceFrom('every mon, thu', TODAY)).toEqual({ kind: 'weekly', interval: 1, weekdays: [0, 3] });
    expect(recurrenceFrom('every workday', TODAY)).toEqual({ kind: 'weekdays', interval: 1 });
    expect(recurrenceFrom('every month', TODAY)).toEqual({ kind: 'monthly', interval: 1 });
    expect(recurrenceFrom('codziennie', TODAY)).toEqual({ kind: 'daily', interval: 1 });
    expect(recurrenceFrom('jutro', TODAY)).toBeNull();
  });
});

describe('zapis do bazy', () => {
  beforeEach(async () => {
    await Promise.all([db.tasks.clear(), db.projects.clear(), db.stages.clear(), db.labels.clear()]);
  });

  const data: TdData = {
    projects: [
      { id: 'in', name: 'Inbox', parentId: null, color: null, isInbox: true, order: 0 },
      { id: 'p1', name: 'Praca', parentId: null, color: 'blue', isInbox: false, order: 1 },
      { id: 'p2', name: 'Raporty', parentId: 'p1', color: null, isInbox: false, order: 0 },
      { id: 'p3', name: 'Głęboki', parentId: 'p2', color: null, isInbox: false, order: 0 },
    ],
    sections: [{ id: 's1', projectId: 'p1', name: 'Q4', order: 0 }],
    labels: ['pilne'],
    tasks: [
      { id: 't1', projectId: 'in', sectionId: null, parentId: null, title: 'Mleko', notes: '', priority: 4, dueDate: null, dueTime: null, dueString: null, recurring: false, labels: [], estimate: null, order: 0 },
      { id: 't2', projectId: 'p1', sectionId: 's1', parentId: null, title: 'Raport', notes: 'x', priority: 1, dueDate: '2026-11-03', dueTime: '14:00', dueString: 'every day', recurring: true, labels: ['pilne'], estimate: 30, order: 1 },
      { id: 't3', projectId: 'p1', sectionId: 's1', parentId: 't2', title: 'Dane', notes: '', priority: 4, dueDate: null, dueTime: null, dueString: null, recurring: false, labels: [], estimate: null, order: 0 },
      { id: 't4', projectId: 'p1', sectionId: 's1', parentId: 't3', title: 'Głębiej', notes: '', priority: 4, dueDate: null, dueTime: null, dueString: null, recurring: false, labels: [], estimate: null, order: 0 },
    ],
  };

  it('importuje i nie dubluje przy ponownym imporcie', async () => {
    const r1 = await importTodoist(data, TODAY);
    expect(r1).toMatchObject({ tasks: 4, projects: 3, stages: 1, labels: 1, skipped: 0 });
    const projects = await db.projects.toArray();
    const praca = projects.find((p) => p.name === 'Praca')!;
    expect(projects.find((p) => p.name === 'Raporty')!.parentId).toBe(praca.id);
    expect(projects.find((p) => p.name === 'Głęboki')!.parentId).toBe(praca.id);
    const tasks = await db.tasks.toArray();
    const raport = tasks.find((t) => t.title === 'Raport')!;
    expect(raport).toMatchObject({ projectId: praca.id, time: '14:00', priority: 1, recurrence: { kind: 'daily', interval: 1 } });
    expect(tasks.find((t) => t.title === 'Mleko')!.projectId).toBeNull();
    expect(tasks.find((t) => t.title === 'Głębiej')!.parentId).toBe(raport.id);

    const r2 = await importTodoist(data, TODAY);
    expect(r2).toMatchObject({ tasks: 0, projects: 0, stages: 0, labels: 0, skipped: 4 });
    expect(await db.tasks.count()).toBe(4);
  });
});

import { describe, expect, it } from 'vitest';
import { captureRequest, cleanTask, parseBreakdown, parseCapture } from './ai';

const today = '2026-11-03';

describe('ai', () => {
  it('builds a request with calendar, projects and the tool', () => {
    const body = captureRequest('w piątek przegląd auta', { today, projects: [], stages: [], labelNames: ['telefon'] }, 'claude-sonnet-5-5') as {
      system: string; tools: { name: string }[]; messages: { content: string }[];
    };
    expect(body.system).toContain('2026-11-06 = piątek');
    expect(body.system).toContain('Etykiety: telefon');
    expect(body.tools[0].name).toBe('add_tasks');
    expect(body.messages[0].content).toBe('w piątek przegląd auta');
  });

  it('reads tasks from the tool call and cleans bad values', () => {
    const response = {
      content: [
        { type: 'text', text: 'Dodaję:' },
        {
          type: 'tool_use', name: 'add_tasks', input: {
            tasks: [
              { title: 'Umówić przegląd auta', due: '2026-11-06', time: '25:00', estimate: 20.4, priority: 9, labels: ['@telefon'] },
              { title: '  ' },
              { title: 'Prezent urodzinowy', due: 'piątek', subtasks: ['Zapytać żonę', ''] },
            ],
          },
        },
      ],
    };
    const tasks = parseCapture(response, today);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ title: 'Umówić przegląd auta', due: '2026-11-06', time: null, estimate: 20, priority: 4, labels: ['telefon'] });
    expect(tasks[1]).toMatchObject({ due: null, subtasks: ['Zapytać żonę'] });
  });

  it('falls back to JSON in text', () => {
    const tasks = parseCapture({ content: [{ type: 'text', text: 'Oto: {"tasks":[{"title":"Zadzwonić"}]}' }] }, today);
    expect(tasks.map((t) => t.title)).toEqual(['Zadzwonić']);
  });

  it('moves an old date to today', () => {
    expect(cleanTask({ title: 'x', due: '2020-01-01' }, today)?.due).toBe(today);
  });

  it('reads a project plan and drops empty stages', () => {
    const stages = parseBreakdown({
      content: [{ type: 'tool_use', name: 'plan_project', input: { stages: [
        { name: 'Przygotowanie', tasks: [{ title: 'Spisać wymagania', estimate: 45, due: '2026-11-04' }] },
        { name: 'Pusty', tasks: [] },
      ] } }],
    }, today);
    expect(stages).toHaveLength(1);
    expect(stages[0].tasks[0]).toMatchObject({ title: 'Spisać wymagania', estimate: 45, due: null });
  });
});

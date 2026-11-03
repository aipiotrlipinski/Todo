import { describe, expect, it } from 'vitest';
import type { Task } from './types';
import { dayColumn, dayLoad, mondayOf, nextPoint, weekDays } from './week';

let n = 0;
const task = (o: Partial<Task>): Task => ({
  id: `t${++n}`, title: 'x', notes: '', projectId: null, stageId: null, parentId: null,
  due: '2026-11-03', time: null, priority: 4, labels: [], estimate: null, recurrence: null,
  status: 'open', completedAt: null, order: n, createdAt: 0, updatedAt: 0, ...o,
});
const opts = { window: { start: '16:00', end: '20:00' }, fixed: [], defaultEstimate: 15 };

describe('week', () => {
  it('finds Monday and the 7 days', () => {
    expect(mondayOf('2026-11-03')).toBe('2026-11-02');
    expect(mondayOf('2026-11-08')).toBe('2026-11-02');
    expect(mondayOf('2026-11-09')).toBe('2026-11-09');
    expect(weekDays('2026-11-02')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  });

  it('puts overdue tasks into today’s column only', () => {
    const tasks = [task({ due: '2026-11-01' }), task({ due: '2026-11-03' }), task({ due: '2026-11-04' }), task({ due: '2026-11-03', status: 'done' }), task({ due: '2026-11-03', parentId: 'x' })];
    expect(dayColumn(tasks, '2026-11-03', '2026-11-03')).toHaveLength(2);
    expect(dayColumn(tasks, '2026-11-04', '2026-11-03')).toHaveLength(1);
    expect(dayColumn(tasks, '2026-11-02', '2026-11-03')).toHaveLength(0);
  });

  it('rates the load of a day', () => {
    expect(dayLoad('2026-11-03', [], opts).level).toBe('empty');
    expect(dayLoad('2026-11-03', [task({ estimate: 60 })], opts)).toMatchObject({ planned: 60, free: 240, level: 'ok' });
    expect(dayLoad('2026-11-03', [task({ estimate: 200 })], opts).level).toBe('busy');
    expect(dayLoad('2026-11-03', [task({ estimate: 300 })], opts)).toMatchObject({ over: 60, level: 'over' });
  });
});

describe('nextPoint', () => {
  const fixed = [{ id: 'w', title: 'Praca', days: [0, 1, 2, 3, 4], start: '08:00', end: '16:00' }];
  it('shows the coming fixed point, then the ongoing one, then a timed task', () => {
    expect(nextPoint('2026-11-03', 7 * 60 + 11, fixed, [])).toMatchObject({ title: 'Praca', start: 480, ongoing: false });
    expect(nextPoint('2026-11-03', 9 * 60, fixed, [])).toMatchObject({ title: 'Praca', ongoing: true });
    expect(nextPoint('2026-11-03', 17 * 60, fixed, [task({ title: 'Siłownia', time: '17:30', estimate: 60 })])).toMatchObject({ title: 'Siłownia', start: 1050 });
    expect(nextPoint('2026-11-07', 9 * 60, fixed, [])).toBeNull();
  });
});

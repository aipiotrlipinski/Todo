import { describe, expect, it } from 'vitest';
import { autoSchedule, capacity, freeGaps, minutesUntilBusy, suggestDefer, type PlanInput } from './planner';
import type { Task } from './types';

let n = 0;
const task = (o: Partial<Task>): Task => ({
  id: `t${++n}`, title: 'x', notes: '', projectId: null, stageId: null, parentId: null,
  due: '2026-11-03', time: null, priority: 4, labels: [], estimate: null, recurrence: null,
  status: 'open', completedAt: null, order: n, createdAt: 0, updatedAt: 0, ...o,
});

// 2026-11-03 is a Tuesday (weekday index 1)
const base = (tasks: Task[], extra: Partial<PlanInput> = {}): PlanInput => ({
  date: '2026-11-03',
  window: { start: '16:00', end: '22:00' },
  fixed: [{ id: 'g', title: 'Siłownia', days: [1, 3], start: '17:00', end: '18:30' }],
  tasks,
  defaultEstimate: 15,
  ...extra,
});

describe('planner', () => {
  it('cuts fixed points and timed tasks out of the window', () => {
    const gaps = freeGaps(base([task({ time: '20:00', estimate: 60 })]));
    expect(gaps).toEqual([
      { start: 960, end: 1020 }, // 16:00–17:00
      { start: 1110, end: 1200 }, // 18:30–20:00
      { start: 1260, end: 1320 }, // 21:00–22:00
    ]);
  });

  it('ignores fixed points on other days', () => {
    expect(freeGaps(base([], { date: '2026-11-04' }))).toEqual([{ start: 960, end: 1320 }]);
  });

  it('starts from now', () => {
    expect(freeGaps(base([], { fromMin: 18 * 60 }))).toEqual([{ start: 1110, end: 1320 }]);
  });

  it('computes capacity and overload', () => {
    const c = capacity(base([task({ estimate: 120 }), task({ estimate: 120 }), task({})]));
    expect(c.free).toBe(270);
    expect(c.planned).toBe(255);
    expect(c.guessed).toBe(1);
    expect(c.over).toBe(0);
    const c2 = capacity(base([task({ estimate: 300 })]));
    expect(c2.over).toBe(30);
  });

  it('suggests deferring least important tasks, never priority 1', () => {
    const a = task({ priority: 1, estimate: 60 });
    const b = task({ priority: 3, estimate: 30 });
    const c = task({ priority: 4, estimate: 20 });
    expect(suggestDefer([a, b, c], 40, 15).map((t) => t.id)).toEqual([c.id, b.id]);
  });

  it('auto-schedules by priority into first fitting gap', () => {
    const big = task({ priority: 4, estimate: 90 });
    const urgent = task({ priority: 1, estimate: 45 });
    const tiny = task({ priority: 2 });
    const huge = task({ estimate: 500 });
    const s = autoSchedule(base([big, urgent, tiny, huge]));
    expect(s.placed).toEqual([
      { id: urgent.id, time: '16:00' },
      { id: tiny.id, time: '16:45' },
      { id: big.id, time: '18:30' },
    ]);
    expect(s.unplaced.map((t) => t.id)).toEqual([huge.id]);
  });

  it('knows how long until the next busy thing', () => {
    expect(minutesUntilBusy({ ...base([]), fromMin: 16 * 60 + 35 })).toBe(25);
    expect(minutesUntilBusy({ ...base([]), fromMin: 17 * 60 + 10 })).toBeNull();
    expect(minutesUntilBusy({ ...base([]), fromMin: 9 * 60 })).toBeNull();
  });
});

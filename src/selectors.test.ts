import { describe, expect, it } from 'vitest';
import { nowCandidates } from './selectors';
import type { Task } from './types';

let n = 0;
const T = (o: Partial<Task>): Task => ({
  id: `t${++n}`, title: o.title ?? `t${n}`, notes: '', projectId: null, stageId: null, parentId: null, due: null, time: null,
  priority: 4, labels: [], estimate: null, recurrence: null, status: 'open', completedAt: null, order: n, createdAt: 0, updatedAt: 0, ...o,
});
const today = '2026-11-03';
const opts = { today, limit: 30, labelIds: [] as string[], stagesByProject: new Map([['p', ['s1', 's2']]]) };

describe('nowCandidates', () => {
  it('picks what fits, most urgent first', () => {
    const tasks = [
      T({ title: 'inbox', estimate: 10 }),
      T({ title: 'today', due: today, estimate: 20, priority: 2 }),
      T({ title: 'overdue', due: '2026-11-01', estimate: 30 }),
      T({ title: 'too long', due: today, estimate: 45 }),
      T({ title: 'timed', due: today, time: '19:00', estimate: 10 }),
      T({ title: 'far', due: '2026-11-20', estimate: 10 }),
      T({ title: 'no estimate', due: today }),
    ];
    const r = nowCandidates(tasks, opts);
    expect(r.fits.map((t) => t.title)).toEqual(['overdue', 'today', 'inbox']);
    expect(r.unknown.map((t) => t.title)).toEqual(['no estimate']);
  });

  it('only the next action of a project, and subtasks instead of their parent', () => {
    const parent = T({ title: 'parent', projectId: 'p', stageId: 's1', estimate: 20 });
    const tasks = [
      T({ title: 'later stage', projectId: 'p', stageId: 's2', estimate: 10, order: 0 }),
      parent,
      T({ title: 'step', parentId: parent.id, projectId: 'p', estimate: 10 }),
      T({ title: 'second in s1', projectId: 'p', stageId: 's1', estimate: 10 }),
    ];
    expect(nowCandidates(tasks, opts).fits.map((t) => t.title)).toEqual(['step']);
  });

  it('filters by label and lifts the limit', () => {
    const tasks = [T({ title: 'call', labels: ['tel'], estimate: 90 }), T({ title: 'other', estimate: 5 })];
    expect(nowCandidates(tasks, { ...opts, limit: null, labelIds: ['tel'] }).fits.map((t) => t.title)).toEqual(['call']);
  });
});

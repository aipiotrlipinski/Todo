import { describe, expect, it } from 'vitest';
import { goalOfProject, goalStats, weekStart } from './goals';
import type { Goal, Project, Task } from './types';

const P = (id: string, goalId: string | null, parentId: string | null = null): Project => ({
  id, name: id, parentId, color: '', goal: '', goalId, due: null, status: 'active', order: 0, createdAt: 0, updatedAt: 0,
});
const G = (id: string): Goal => ({ id, name: id, why: '', color: '', due: null, status: 'active', order: 0, createdAt: 0, updatedAt: 0 });
let n = 0;
const T = (o: Partial<Task>): Task => ({
  id: `t${++n}`, title: 'x', notes: '', projectId: null, stageId: null, parentId: null, due: null, time: null,
  priority: 4, labels: [], estimate: null, recurrence: null, status: 'open', completedAt: null, order: n, createdAt: 0, updatedAt: 0, ...o,
});

// Tuesday 2026-11-03 21:00 local
const NOW = new Date(2026, 10, 3, 21).getTime();
const MON = new Date(2026, 10, 2).getTime();

describe('goals', () => {
  it('finds the Monday of the week', () => {
    expect(weekStart(NOW)).toBe(MON);
  });

  it('subproject inherits the goal of its main project', () => {
    const main = P('a', 'g1');
    const sub = P('b', null, 'a');
    const byId = new Map([main, sub].map((p) => [p.id, p]));
    expect(goalOfProject(sub, byId)).toBe('g1');
  });

  it('sums time per goal this week and last week', () => {
    const projects = [P('a', 'g1'), P('b', null, 'a'), P('c', null)];
    const tasks = [
      T({ projectId: 'a', status: 'done', completedAt: MON + 3600_000, estimate: 60 }),
      T({ projectId: 'b', status: 'done', completedAt: NOW - 1000, estimate: null }),
      T({ projectId: 'a', status: 'done', completedAt: MON - 86_400_000, estimate: 30 }),
      T({ projectId: 'c', status: 'done', completedAt: NOW - 1000, estimate: 45 }),
      T({ projectId: 'a', due: '2026-11-05', title: 'next' }),
    ];
    const [g1, none] = goalStats([G('g1')], projects, tasks, NOW, 15);
    expect(g1.minutesThisWeek).toBe(75);
    expect(g1.minutesLastWeek).toBe(30);
    expect(g1.doneThisWeek).toBe(2);
    expect(g1.projectIds).toEqual(['a', 'b']);
    expect(g1.next?.title).toBe('next');
    expect(none.goal).toBeNull();
    expect(none.minutesThisWeek).toBe(45);
  });
});

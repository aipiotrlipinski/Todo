import { DndContext, DragOverlay, pointerWithin, rectIntersection, useDroppable, type CollisionDetection, type DragEndEvent, type DragMoveEvent } from '@dnd-kit/core';
import { useState, type ReactNode } from 'react';
import { moveTasksToDate, restoreTasks, updateTask } from '../actions';
import { DayPlan, type DropPreview } from '../components/DayPlan';
import { IconNow } from '../components/icons';
import { TaskItem } from '../components/TaskItem';
import { DraggableRow, minuteAt, useTimeSensors } from '../components/timeDrag';
import { formatLong, minToTime } from '../dates';
import { TIMED_DEFAULT } from '../planner';
import { todayTasks } from '../selectors';
import { useData, useUI } from '../store';
import type { Task } from '../types';
import { Header } from './Header';
import { ReviewPrompt } from './Review';

// Prefer what's under the pointer (timeline vs list); fall back to overlap for keyboard/edge cases.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

export function Today() {
  const { tasks } = useData();
  const { today, toast, setView } = useUI();
  const sensors = useTimeSensors();
  const [dragId, setDragId] = useState<string | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);
  const { overdue, today: list } = todayTasks(tasks, today);
  const doneToday = tasks.filter((t) => t.status === 'done' && t.completedAt && new Date(t.completedAt).toDateString() === new Date().toDateString());
  const byId = (id: string | undefined) => (id ? tasks.find((t) => t.id === id) : undefined);

  const moveAll = async () => {
    await moveTasksToDate(overdue.map((t) => t.id), today);
    toast(`Przeniesiono na dziś: ${overdue.length}`);
  };

  const onMove = (e: DragMoveEvent) => {
    const task = byId(e.active.data.current?.taskId as string | undefined);
    const min = minuteAt(e);
    setPreview(task && min !== null ? { title: task.title, start: min, length: task.estimate ?? TIMED_DEFAULT } : null);
  };

  const onEnd = async (e: DragEndEvent) => {
    setDragId(null);
    setPreview(null);
    const task = byId(e.active.data.current?.taskId as string | undefined);
    if (!task || !e.over) return;
    const snapshot = { ...task };
    if (e.over.id === 'unplanned') {
      if (!task.time) return;
      await updateTask(task.id, { time: null });
      toast(`Bez godziny: ${task.title}`, () => restoreTasks([snapshot]));
      return;
    }
    const min = minuteAt(e);
    if (min === null) return;
    const time = minToTime(min);
    if (time === task.time && task.due === today) return;
    await updateTask(task.id, { time, due: today });
    toast(`${task.title} → ${time}`, () => restoreTasks([snapshot]));
  };

  const dragged = byId(dragId ?? undefined);

  return (
    <>
      <Header eyebrow={formatLong(today)} title="Dziś" defaults={{ due: today }}
        actions={<button type="button" className="secondary-btn" onClick={() => setView({ kind: 'now' })} title="Zadania, które zmieszczą się w czasie do następnego punktu dnia (G, N)"><IconNow /> Teraz</button>}>
        <ReviewPrompt />
      </Header>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={(e) => setDragId((e.active.data.current?.taskId as string) ?? null)}
        onDragMove={onMove}
        onDragEnd={onEnd}
        onDragCancel={() => {
          setDragId(null);
          setPreview(null);
        }}
      >
        <div className="columns">
          <ListPanel>
            <h2 className="panel-title">Na dziś · {list.length}</h2>
            {overdue.length > 0 && (
              <div className="overdue">
                <div className="overdue-head">
                  <span>Z poprzednich dni · {overdue.length}</span>
                  <button type="button" className="link-btn warn" onClick={moveAll}>Przenieś wszystkie na dziś</button>
                </div>
                <DragList tasks={overdue} />
              </div>
            )}
            <DragList tasks={list} hideDue />
            {list.length === 0 && !overdue.length && (
              <p className="empty">{doneToday.length ? `Wszystko zrobione. Ukończone dziś: ${doneToday.length}.` : 'Nic na dziś. Dodaj zadanie powyżej albo zajrzyj do Nadchodzących.'}</p>
            )}
            {doneToday.length > 0 && list.length > 0 && <p className="muted small">Ukończone dziś: {doneToday.length}</p>}
          </ListPanel>
          <DayPlan date={today} tasks={[...list, ...doneToday.filter((t) => t.due === today)]} preview={preview} />
        </div>
        <DragOverlay dropAnimation={null}>
          {dragged && !preview ? <div className="drag-ghost"><TaskItem task={dragged} hideDue /></div> : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}

/** The task list; dropping a timeline block here takes its hour away. */
function ListPanel({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver, active } = useDroppable({ id: 'unplanned' });
  const fromTimeline = active?.data.current?.from === 'timeline';
  return (
    <section ref={setNodeRef} className={`panel tasks-panel${isOver && fromTimeline ? ' drop-over' : ''}`} aria-label="Zadania na dziś">
      {children}
    </section>
  );
}

function DragList({ tasks, hideDue }: { tasks: Task[]; hideDue?: boolean }) {
  if (!tasks.length) return null;
  return (
    <div className="task-list">
      {tasks.map((t) => (
        <DraggableRow key={t.id} id={`task:${t.id}`} label={t.title} data={{ taskId: t.id, from: 'list' }}>
          <TaskItem task={t} hideDue={hideDue} />
        </DraggableRow>
      ))}
    </div>
  );
}

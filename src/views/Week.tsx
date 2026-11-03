import { closestCenter, DndContext, DragOverlay, pointerWithin, useDroppable, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { restoreTasks, updateTask } from '../actions';
import { TaskItem } from '../components/TaskItem';
import { DraggableRow, useTimeSensors } from '../components/timeDrag';
import { addDays, formatMinutes, fromISO, MONTHS_GEN, WEEKDAYS_SHORT, weekdayIndex } from '../dates';
import { inboxTasks } from '../selectors';
import { planWindowFor, useData, useUI } from '../store';
import type { Task } from '../types';
import { dayColumn, dayLoad, mondayOf, weekDays } from '../week';
import { Header } from './Header';

const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

function rangeLabel(days: string[]) {
  const a = fromISO(days[0]);
  const b = fromISO(days[6]);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
}

/** Week board: one column per day with its load; drag tasks between days. */
export function Week() {
  const { tasks, settings } = useData();
  const { today, toast } = useUI();
  const sensors = useTimeSensors();
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [dragId, setDragId] = useState<string | null>(null);
  const days = weekDays(monday);
  const noDate = inboxTasks(tasks).filter((t) => !t.due);

  const onEnd = async (e: DragEndEvent) => {
    setDragId(null);
    const task = tasks.find((t) => t.id === e.active.data.current?.taskId);
    const target = e.over?.data.current?.day as string | null | undefined;
    if (!task || target === undefined || target === task.due) return;
    const snapshot = { ...task };
    await updateTask(task.id, target ? { due: target } : { due: null, time: null });
    toast(target ? `${task.title} → ${WEEKDAYS_SHORT[weekdayIndex(target)]} ${fromISO(target).getDate()}` : `Bez terminu: ${task.title}`, () => restoreTasks([snapshot]));
  };

  const dragged = dragId ? tasks.find((t) => t.id === dragId) : undefined;

  return (
    <>
      <Header
        eyebrow="Tablica tygodnia"
        title={rangeLabel(days)}
        defaults={{ due: today }}
        actions={
          <div className="week-nav" role="group" aria-label="Zmień tydzień">
            <button type="button" className="secondary-btn" onClick={() => setMonday(addDays(monday, -7))} aria-label="Poprzedni tydzień">‹</button>
            <button type="button" className="secondary-btn" onClick={() => setMonday(mondayOf(today))} disabled={monday === mondayOf(today)}>Ten tydzień</button>
            <button type="button" className="secondary-btn" onClick={() => setMonday(addDays(monday, 7))} aria-label="Następny tydzień">›</button>
          </div>
        }
      />
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={(e) => setDragId((e.active.data.current?.taskId as string) ?? null)}
        onDragEnd={onEnd}
        onDragCancel={() => setDragId(null)}
      >
        <div className="board" aria-label="Dni tygodnia">
          <Column day={null} title="Bez terminu" sub={`${noDate.length} w skrzynce`} tasks={noDate} />
          {days.map((d) => {
            const list = dayColumn(tasks, d, today);
            const load = dayLoad(d, tasks.filter((t) => t.status === 'open'), { window: planWindowFor(d, settings), fixed: settings.fixed, defaultEstimate: settings.defaultEstimate });
            const pct = load.free ? Math.min(100, Math.round((load.planned / load.free) * 100)) : load.planned ? 100 : 0;
            return (
              <Column
                key={d}
                day={d}
                past={d < today}
                current={d === today}
                title={`${WEEKDAYS_SHORT[weekdayIndex(d)]} ${fromISO(d).getDate()}${d === today ? ' · dziś' : ''}`}
                sub={`${formatMinutes(load.planned)} / ${formatMinutes(load.free)}`}
                tasks={list}
                bar={<span className={`bar load-bar load-${load.level}`} role="img" aria-label={`Obciążenie ${pct}%`}><span style={{ width: `${pct}%` }} /></span>}
                warn={load.over ? `Za dużo o ${formatMinutes(load.over)}` : undefined}
              />
            );
          })}
        </div>
        <DragOverlay dropAnimation={null}>{dragged ? <div className="drag-ghost board-ghost"><TaskItem task={dragged} hideDue /></div> : null}</DragOverlay>
      </DndContext>
    </>
  );
}

function Column({ day, title, sub, tasks, bar, warn, past, current }: {
  day: string | null;
  title: string;
  sub: string;
  tasks: Task[];
  bar?: ReactNode;
  warn?: string;
  past?: boolean;
  current?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day ?? 'none'}`, data: { day } });
  const el = useRef<HTMLElement | null>(null);
  // Start with today's column in view (on a phone only one column fits).
  useEffect(() => {
    if (!current || !el.current || !window.matchMedia('(max-width: 860px)').matches) return;
    const board = el.current.parentElement;
    if (board) board.scrollLeft = el.current.offsetLeft - board.offsetLeft - 16;
  }, [current]);
  return (
    <section
      ref={(node) => {
        setNodeRef(node);
        el.current = node;
      }} className={`board-col${current ? ' current' : ''}${past ? ' past' : ''}${isOver ? ' drop-over' : ''}`} aria-label={title}>
      <h2 className="board-head"><span>{title}</span><span className="muted small">{sub}</span></h2>
      {bar}
      {warn && <p className="board-warn">{warn}</p>}
      <div className="task-list">
        {tasks.map((t) => (
          <DraggableRow key={t.id} id={`task:${t.id}`} label={t.title} data={{ taskId: t.id }}>
            <TaskItem task={t} hideDue={!!day && t.due === day} />
          </DraggableRow>
        ))}
      </div>
      {tasks.length === 0 && <p className="drop-hint muted">Upuść tutaj</p>}
    </section>
  );
}

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { moveTasksToDate, restoreTasks, updateTask, updateTasks } from '../actions';
import { addDays, formatMinutes, minToTime, timeToMin } from '../dates';
import { autoSchedule, capacity, fixedFor, suggestDefer, TIMED_DEFAULT, type PlanInput } from '../planner';
import { planWindowFor, useData, useUI } from '../store';
import type { Task } from '../types';
import { SNAP, type TimelineDrop } from './timeDrag';

const HOUR = 56; // px per hour

interface Item {
  key: string;
  start: number;
  end: number;
  lane: number;
  task?: Task;
  fixed?: string;
}

/** Puts overlapping blocks side by side. */
function layout(items: Item[]): { placed: Item[]; lanes: number } {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const laneEnds: number[] = [];
  for (const it of sorted) {
    let lane = laneEnds.findIndex((e) => e <= it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = it.end;
    it.lane = lane;
  }
  return { placed: sorted, lanes: Math.max(1, laneEnds.length) };
}

/** Where a dragged task would land on the timeline (shown as a dashed block). */
export interface DropPreview {
  title: string;
  start: number;
  length: number;
}

export function DayPlan({ date, tasks, preview }: { date: string; tasks: Task[]; preview?: DropPreview | null }) {
  const { settings, projectById } = useData();
  const { now, today, openTask, toast, setView } = useUI();
  const win = planWindowFor(date, settings);
  const isToday = date === today;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const input: PlanInput = {
    date,
    window: win,
    fixed: settings.fixed,
    tasks,
    defaultEstimate: settings.defaultEstimate,
    fromMin: isToday ? nowMin : undefined,
  };
  const cap = capacity(input);
  const fixedToday = fixedFor(date, settings.fixed);

  const items: Item[] = [
    ...fixedToday.map((f) => ({ key: 'f' + f.id, start: timeToMin(f.start), end: timeToMin(f.end), lane: 0, fixed: f.title })),
    ...tasks
      .filter((t) => t.time)
      .map((t) => {
        const s = timeToMin(t.time!);
        return { key: t.id, start: s, end: s + (t.estimate ?? TIMED_DEFAULT), lane: 0, task: t };
      }),
  ];

  let startMin = timeToMin(win.start);
  let endMin = timeToMin(win.end);
  for (const it of items) {
    startMin = Math.min(startMin, it.start);
    endMin = Math.max(endMin, it.end);
  }
  startMin = Math.floor(startMin / 60) * 60;
  endMin = Math.min(24 * 60, Math.ceil(endMin / 60) * 60);

  const pct = cap.free ? Math.min(100, Math.round((cap.planned / cap.free) * 100)) : cap.planned ? 100 : 0;
  const defer = suggestDefer(tasks, cap.over, settings.defaultEstimate);
  const untimedOpen = tasks.filter((t) => t.status === 'open' && !t.time && !t.parentId);

  if (preview) {
    startMin = Math.min(startMin, Math.floor(preview.start / 60) * 60);
    endMin = Math.min(24 * 60, Math.max(endMin, Math.ceil((preview.start + preview.length) / 60) * 60));
  }

  const hours: number[] = [];
  for (let m = startMin; m < endMin; m += 60) hours.push(m);
  const { placed, lanes } = layout(items);
  const y = (m: number) => ((m - startMin) / 60) * HOUR;

  const arrange = async () => {
    const s = autoSchedule(input);
    if (!s.placed.length) {
      toast('Nie ma wolnego okna, w którym zmieściłoby się któreś zadanie');
      return;
    }
    const snapshots = tasks.filter((t) => s.placed.some((p) => p.id === t.id)).map((t) => ({ ...t }));
    await updateTasks(s.placed.map((p) => ({ id: p.id, changes: { time: p.time } })));
    toast(
      `Ułożono: ${s.placed.length}${s.unplaced.length ? ` · nie zmieściło się: ${s.unplaced.length}` : ''}`,
      () => restoreTasks(snapshots),
    );
  };

  const deferAll = async () => {
    const snapshots = defer.map((t) => ({ ...t }));
    await moveTasksToDate(defer.map((t) => t.id), addDays(date, 1));
    toast(`Przeniesiono na jutro: ${defer.length}`, () => restoreTasks(snapshots));
  };

  return (
    <section className="panel plan" aria-label="Plan dnia">
      <div className="plan-head">
        <h2 className="panel-title">Plan dnia</h2>
        {untimedOpen.length > 0 && cap.free > 0 && (
          <button type="button" className="link-btn" onClick={arrange} title="Wstawia zadania bez godziny w wolne okna, najważniejsze najpierw">
            Ułóż mój dzień
          </button>
        )}
      </div>
      <div className="bar thick" role="img" aria-label={`Zaplanowane ${pct}% wolnego czasu`}>
        <span style={{ width: `${pct}%` }} className={cap.over ? 'over' : ''} />
      </div>
      <p className="muted small">
        Zadania bez godziny: {formatMinutes(cap.planned)} · wolne: {formatMinutes(cap.free)}
        {isToday && nowMin > timeToMin(win.start) ? ' (od teraz)' : ''}
        {cap.guessed ? ` · ${cap.guessed} bez szacunku liczone po ${settings.defaultEstimate} min` : ''}
      </p>

      {cap.over > 0 && (
        <div className="overload" role="alert">
          <p>
            <strong>Za dużo o {formatMinutes(cap.over)}.</strong>{' '}
            {defer.length ? 'Żeby reszta się zmieściła, przenieś na jutro:' : 'Zostały same pilne zadania — skróć je albo przenieś coś ręcznie.'}
          </p>
          {defer.length > 0 && (
            <>
              <ul>
                {defer.map((t) => (
                  <li key={t.id}>
                    <button type="button" className="link-btn" onClick={() => openTask(t.id)}>{t.title}</button>
                    <span className="muted"> · {formatMinutes(t.estimate ?? settings.defaultEstimate)}</span>
                  </li>
                ))}
              </ul>
              <button type="button" className="secondary-btn" onClick={deferAll}>Przenieś na jutro</button>
            </>
          )}
        </div>
      )}

      <Timeline date={date} startMin={startMin} height={hours.length * HOUR}>
        {hours.map((m) => (
          <div key={m} className="hour" style={{ top: y(m) }}>
            <span>{minToTime(m)}</span>
          </div>
        ))}
        {placed.map((p) => {
          const pr = p.task?.projectId ? projectById.get(p.task.projectId) : undefined;
          const h = Math.max(22, y(p.end) - y(p.start) - 2);
          const style = {
            top: y(p.start) + 1,
            height: h,
            left: `calc(46px + (100% - 46px) * ${p.lane / lanes})`,
            width: `calc((100% - 46px) / ${lanes} - 4px)`,
            ...(p.task ? { ['--block-color' as string]: pr?.color ?? 'var(--accent)' } : {}),
          };
          const body = (
            <>
              <span className="block-title">{p.task?.title ?? p.fixed}</span>
              <span className="block-time">{minToTime(p.start)}–{minToTime(p.end)}</span>
            </>
          );
          return p.task ? (
            <TaskBlock key={p.key} task={p.task} style={style} thin={h < 46} length={p.end - p.start} onOpen={() => openTask(p.task!.id)}>
              {body}
            </TaskBlock>
          ) : (
            <div key={p.key} style={style} className={`block fixed${h < 46 ? ' thin' : ''}`} title="Stały punkt dnia (Ustawienia)">
              {body}
            </div>
          );
        })}
        {isToday && nowMin >= startMin && nowMin <= endMin && (
          <div className="now-line" style={{ top: y(nowMin) }} aria-label={`Teraz ${minToTime(nowMin)}`} />
        )}
        {preview && (
          <div className={`block drop-preview${preview.length < 50 ? ' thin' : ''}`} style={{ top: y(preview.start) + 1, height: Math.max(22, (preview.length / 60) * HOUR - 2), left: 46, right: 0 }} aria-hidden="true">
            <span className="block-title">{preview.title}</span>
            <span className="block-time">{minToTime(preview.start)}–{minToTime(preview.start + preview.length)}</span>
          </div>
        )}
      </Timeline>
      {untimedOpen.length > 0 && <p className="muted small plan-hint">Przeciągnij zadanie z listy na oś, żeby dać mu godzinę. Blok przesuniesz, chwytając go; dolną krawędzią zmienisz długość.</p>}
      {items.length === 0 && (
        <p className="muted small">
          Zadania z godziną pojawią się tutaj jako bloki. Stałe punkty dnia (siłownia, odbiór dziecka) dodasz w{' '}
          <button type="button" className="link-btn" onClick={() => setView({ kind: 'settings' })}>Ustawieniach</button>.
        </p>
      )}
    </section>
  );
}

function Timeline({ date, startMin, height, children }: { date: string; startMin: number; height: number; children: ReactNode }) {
  const data: TimelineDrop = { kind: 'timeline', date, startMin, hourPx: HOUR };
  const { setNodeRef, isOver } = useDroppable({ id: 'timeline', data });
  return (
    <div ref={setNodeRef} className={`timeline${isOver ? ' drop-over' : ''}`} style={{ height }}>
      {children}
    </div>
  );
}

/** A task on the timeline: drag to move it, drag the bottom edge to change how long it takes. */
function TaskBlock({ task, style, thin, length, onOpen, children }: {
  task: Task;
  style: CSSProperties;
  thin: boolean;
  length: number;
  onOpen: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `block:${task.id}`, data: { taskId: task.id, from: 'timeline' } });
  const [resize, setResize] = useState<number | null>(null);
  const startY = useRef(0);

  const onResizeDown = (e: RPointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    startY.current = e.clientY;
    setResize(length);
  };
  const lengthAt = (clientY: number) => Math.max(SNAP, Math.round((length + ((clientY - startY.current) / HOUR) * 60) / SNAP) * SNAP);
  const onResizeMove = (e: RPointerEvent<HTMLSpanElement>) => {
    if (resize !== null) setResize(lengthAt(e.clientY));
  };
  const onResizeUp = async (e: RPointerEvent<HTMLSpanElement>) => {
    if (resize === null) return;
    const next = lengthAt(e.clientY);
    setResize(null);
    if (next !== length) await updateTask(task.id, { estimate: next });
  };

  const height = resize !== null ? Math.max(22, (resize / 60) * HOUR - 2) : style.height;
  return (
    <div
      ref={setNodeRef}
      style={{ ...style, height }}
      className={`block task-block${task.status === 'done' ? ' done' : ''}${thin ? ' thin' : ''}${isDragging ? ' dragging' : ''}`}
      {...listeners}
    >
      <button type="button" className="block-body" onClick={onOpen} {...attributes} aria-label={`${task.title} — otwórz`}>
        {children}
      </button>
      {task.status === 'open' && (
        <span
          className="block-resize"
          aria-hidden="true"
          title="Przeciągnij, aby zmienić długość"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={() => setResize(null)}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        />
      )}
      {resize !== null && <span className="resize-label">{formatMinutes(resize)}</span>}
    </div>
  );
}

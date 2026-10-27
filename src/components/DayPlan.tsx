import { formatMinutes, minToTime, timeToMin } from '../dates';
import { planWindowFor, useData, useUI } from '../store';
import type { Task } from '../types';

const HOUR = 56; // px per hour
const DEFAULT_LEN = 30; // minutes for timed tasks without an estimate

interface Placed {
  task: Task;
  start: number;
  end: number;
  lane: number;
}

/** Puts overlapping blocks side by side. */
function layout(tasks: Task[]): { placed: Placed[]; lanes: number } {
  const items = tasks
    .map((t) => {
      const start = timeToMin(t.time!);
      return { task: t, start, end: start + (t.estimate ?? DEFAULT_LEN), lane: 0 };
    })
    .sort((a, b) => a.start - b.start);
  const laneEnds: number[] = [];
  for (const it of items) {
    let lane = laneEnds.findIndex((e) => e <= it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = it.end;
    it.lane = lane;
  }
  return { placed: items, lanes: Math.max(1, laneEnds.length) };
}

export function DayPlan({ date, tasks }: { date: string; tasks: Task[] }) {
  const { settings, projectById } = useData();
  const { now, today, openTask } = useUI();
  const win = planWindowFor(date, settings);

  const timed = tasks.filter((t) => t.time);
  let startMin = timeToMin(win.start);
  let endMin = timeToMin(win.end);
  for (const t of timed) {
    const s = timeToMin(t.time!);
    startMin = Math.min(startMin, Math.floor(s / 60) * 60);
    endMin = Math.max(endMin, Math.ceil((s + (t.estimate ?? DEFAULT_LEN)) / 60) * 60);
  }
  startMin = Math.floor(startMin / 60) * 60;
  endMin = Math.min(24 * 60, Math.ceil(endMin / 60) * 60);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = date === today;
  const planned = tasks.filter((t) => t.status === 'open').reduce((sum, t) => sum + (t.estimate ?? 0), 0);
  const freeFrom = isToday ? Math.max(nowMin, timeToMin(win.start)) : timeToMin(win.start);
  const free = Math.max(0, timeToMin(win.end) - freeFrom);
  const pct = free ? Math.min(100, Math.round((planned / free) * 100)) : planned ? 100 : 0;
  const over = planned > free;

  const hours: number[] = [];
  for (let m = startMin; m < endMin; m += 60) hours.push(m);
  const { placed, lanes } = layout(timed);
  const y = (m: number) => ((m - startMin) / 60) * HOUR;

  return (
    <section className="panel plan" aria-label="Plan dnia">
      <h2 className="panel-title">Plan dnia</h2>
      <div className="bar thick" role="img" aria-label={`Zaplanowane ${pct}% wolnego czasu`}>
        <span style={{ width: `${pct}%` }} className={over ? 'over' : ''} />
      </div>
      <p className="muted small">
        {planned ? formatMinutes(planned) : '0 min'} zaplanowane z {formatMinutes(free)} wolnych
        {isToday && nowMin > timeToMin(win.start) ? ' (do końca dnia)' : ''}
        {over ? ' · za dużo na dziś' : ''}
      </p>
      <div className="timeline" style={{ height: hours.length * HOUR }}>
        {hours.map((m) => (
          <div key={m} className="hour" style={{ top: y(m) }}>
            <span>{minToTime(m)}</span>
          </div>
        ))}
        {placed.map((p) => {
          const pr = p.task.projectId ? projectById.get(p.task.projectId) : undefined;
          const h = Math.max(22, y(p.end) - y(p.start) - 2);
          return (
            <button
              key={p.task.id}
              type="button"
              className={`block${p.task.status === 'done' ? ' done' : ''}${h < 46 ? ' thin' : ''}`}
              style={{
                top: y(p.start) + 1,
                height: h,
                left: `calc(46px + (100% - 46px) * ${p.lane / lanes})`,
                width: `calc((100% - 46px) / ${lanes} - 4px)`,
                ['--block-color' as string]: pr?.color ?? 'var(--accent)',
              }}
              onClick={() => openTask(p.task.id)}
            >
              <span className="block-title">{p.task.title}</span>
              <span className="block-time">{minToTime(p.start)}–{minToTime(p.end)}</span>
            </button>
          );
        })}
        {isToday && nowMin >= startMin && nowMin <= endMin && (
          <div className="now-line" style={{ top: y(nowMin) }} aria-label={`Teraz ${minToTime(nowMin)}`} />
        )}
      </div>
      {timed.length === 0 && <p className="muted small">Zadania z godziną pojawią się tutaj jako bloki. Dodaj np. „o 19 ~45m”.</p>}
    </section>
  );
}

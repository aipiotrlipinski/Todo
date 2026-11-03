import { moveTasksToDate, restoreTasks, updateTasks } from '../actions';
import { addDays, formatMinutes, minToTime, timeToMin } from '../dates';
import { autoSchedule, capacity, fixedFor, suggestDefer, TIMED_DEFAULT, type PlanInput } from '../planner';
import { planWindowFor, useData, useUI } from '../store';
import type { Task } from '../types';

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

export function DayPlan({ date, tasks }: { date: string; tasks: Task[] }) {
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

      <div className="timeline" style={{ height: hours.length * HOUR }}>
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
            <button key={p.key} type="button" style={style} onClick={() => openTask(p.task!.id)}
              className={`block${p.task.status === 'done' ? ' done' : ''}${h < 46 ? ' thin' : ''}`}>
              {body}
            </button>
          ) : (
            <div key={p.key} style={style} className={`block fixed${h < 46 ? ' thin' : ''}`} title="Stały punkt dnia (Ustawienia)">
              {body}
            </div>
          );
        })}
        {isToday && nowMin >= startMin && nowMin <= endMin && (
          <div className="now-line" style={{ top: y(nowMin) }} aria-label={`Teraz ${minToTime(nowMin)}`} />
        )}
      </div>
      {items.length === 0 && (
        <p className="muted small">
          Zadania z godziną pojawią się tutaj jako bloki. Stałe punkty dnia (siłownia, odbiór dziecka) dodasz w{' '}
          <button type="button" className="link-btn" onClick={() => setView({ kind: 'settings' })}>Ustawieniach</button>.
        </p>
      )}
    </section>
  );
}

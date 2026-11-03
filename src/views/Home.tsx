import { IconSpark } from '../components/icons';
import { TaskItem } from '../components/TaskItem';
import { addDays, formatLong, formatMinutes, fromISO, minToTime, WEEKDAYS_SHORT, weekdayIndex } from '../dates';
import { goalStats } from '../goals';
import { capacity } from '../planner';
import { inboxTasks, todayTasks } from '../selectors';
import { planWindowFor, useData, useUI } from '../store';
import { dayLoad, nextPoint } from '../week';

function greeting(h: number) {
  if (h < 5 || h >= 18) return 'Dobry wieczór';
  return 'Dzień dobry';
}

/** Dashboard: the most important things of the day at a glance. */
export function Home() {
  const { tasks, goals, projects, settings } = useData();
  const { now, today, setView, openAssistant } = useUI();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const { overdue, today: list } = todayTasks(tasks, today);
  const top = [...overdue, ...list].filter((t) => !t.parentId).slice(0, 3);
  const cap = capacity({ date: today, window: planWindowFor(today, settings), fixed: settings.fixed, tasks: list, defaultEstimate: settings.defaultEstimate, fromMin: nowMin });
  const point = nextPoint(today, nowMin, settings.fixed, tasks);
  const inbox = inboxTasks(tasks);
  const oldest = inbox.length ? Math.floor((now.getTime() - Math.min(...inbox.map((t) => t.createdAt))) / 86_400_000) : 0;
  const stats = goalStats(goals, projects, tasks, now.getTime(), settings.defaultEstimate).filter((s) => s.goal);
  const maxGoal = Math.max(60, ...stats.map((s) => Math.max(s.minutesThisWeek, s.minutesLastWeek)));
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const open = tasks.filter((t) => t.status === 'open');
  const loads = days.map((d) => ({ d, ...dayLoad(d, open, { window: planWindowFor(d, settings), fixed: settings.fixed, defaultEstimate: settings.defaultEstimate }) }));
  const maxLoad = Math.max(60, ...loads.map((l) => Math.max(l.planned, l.free)));
  const worst = loads.filter((l) => l.over > 0).sort((a, b) => b.over - a.over)[0];

  return (
    <div className="home">
      <header className="home-head">
        <h1>{greeting(now.getHours())}</h1>
        <p className="muted">{formatLong(today)} · {list.length + overdue.length} zadań · wolne {formatMinutes(cap.free)}</p>
      </header>

      <div className="home-grid">
        <section className="panel tile" aria-labelledby="h-top">
          <h2 id="h-top" className="tile-head">Najważniejsze dziś<button type="button" className="link-btn" onClick={() => setView({ kind: 'today' })}>Dziś →</button></h2>
          {top.length ? (
            <div className="task-list">{top.map((t) => <TaskItem key={t.id} task={t} hideDue />)}</div>
          ) : (
            <p className="muted small">Nic na dziś. Dodaj coś w Skrzynce albo zaplanuj tydzień.</p>
          )}
        </section>

        <section className="panel tile tile-accent" aria-labelledby="h-next">
          <h2 id="h-next" className="tile-head">{point?.ongoing ? 'Teraz trwa' : 'Następny punkt'}</h2>
          {point ? (
            <>
              <p className="tile-big">{point.ongoing ? `do ${minToTime(point.end)}` : `za ${formatMinutes(point.start - nowMin)}`}</p>
              <p className="tile-sub">{point.title} · {minToTime(point.start)}–{minToTime(point.end)}</p>
            </>
          ) : (
            <p className="tile-sub">Dziś nic więcej w planie.</p>
          )}
          <button type="button" className="tile-btn" onClick={() => setView({ kind: 'now' })}>Co się zmieści teraz? →</button>
        </section>

        <section className="panel tile" aria-labelledby="h-inbox">
          <h2 id="h-inbox" className="tile-head">Skrzynka<button type="button" className="link-btn" onClick={() => setView({ kind: 'inbox' })}>Rozpakuj →</button></h2>
          <p className="tile-big tile-num">{inbox.length}</p>
          <p className="muted small">{inbox.length ? `zadań bez projektu${oldest > 0 ? ` · najstarsze ${oldest} ${oldest === 1 ? 'dzień' : 'dni'}` : ''}` : 'Pusto — tak trzymać.'}</p>
        </section>

        <section className="panel tile" aria-labelledby="h-goals">
          <h2 id="h-goals" className="tile-head">Cele w tym tygodniu<button type="button" className="link-btn" onClick={() => setView({ kind: 'goals' })}>Cele →</button></h2>
          {stats.length ? (
            <div className="goal-bars">
              {stats.map((s) => (
                <div key={s.goal!.id} className="goal-bar">
                  <span className="goal-bar-name"><span className="dot" style={{ background: s.goal!.color }} />{s.goal!.name}</span>
                  <span className="bar thick"><span style={{ width: `${(s.minutesThisWeek / maxGoal) * 100}%`, background: s.goal!.color }} /></span>
                  <span className="small muted">{formatMinutes(s.minutesThisWeek)}{s.minutesLastWeek ? ` (poprz. ${formatMinutes(s.minutesLastWeek)})` : ''}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted small">Dodaj cele, a zobaczysz tu, ile czasu idzie na każdy.</p>
          )}
        </section>

        <section className="panel tile" aria-labelledby="h-load">
          <h2 id="h-load" className="tile-head">Obciążenie 7 dni<button type="button" className="link-btn" onClick={() => setView({ kind: 'week' })}>Tydzień →</button></h2>
          <div className="load-chart" role="img" aria-label={loads.map((l) => `${WEEKDAYS_SHORT[weekdayIndex(l.d)]}: ${formatMinutes(l.planned)} z ${formatMinutes(l.free)}`).join(', ')}>
            {loads.map((l) => (
              <div key={l.d} className="load-col">
                <span className="load-track" style={{ height: `${(l.free / maxLoad) * 100}%` }} />
                <span className={`load-fill load-${l.level}`} style={{ height: `${(Math.min(l.planned, maxLoad) / maxLoad) * 100}%` }} />
                <span className="load-day">{l.d === today ? 'dziś' : `${WEEKDAYS_SHORT[weekdayIndex(l.d)]} ${fromISO(l.d).getDate()}`}</span>
              </div>
            ))}
          </div>
          <p className="small muted">
            {worst ? <span className="warn-text">{WEEKDAYS_SHORT[weekdayIndex(worst.d)]} {fromISO(worst.d).getDate()}: za dużo o {formatMinutes(worst.over)}</span> : 'Wszystko mieści się w wolnym czasie.'}
          </p>
        </section>

        <section className="panel tile" aria-labelledby="h-ai">
          <h2 id="h-ai" className="tile-head">Asystent</h2>
          <p className="muted small">Powiedz albo wpisz, co masz do zrobienia — asystent rozpisze to na zadania.</p>
          <button type="button" className="primary-btn tile-ai" onClick={() => openAssistant()}><IconSpark /> Dodaj z asystentem</button>
        </section>
      </div>
    </div>
  );
}

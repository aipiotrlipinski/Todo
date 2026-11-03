import { useState } from 'react';
import { createGoal, deleteGoal, PROJECT_COLORS, updateGoal, updateProject } from '../actions';
import { IconTrash } from '../components/icons';
import { daysBetween, formatMinutes, toISO } from '../dates';
import { goalStats, type GoalStats } from '../goals';
import { useData, useUI } from '../store';
import type { Goal } from '../types';
import { Header } from './Header';

const hours = (m: number) => (m ? formatMinutes(m) : '0 min');

/** This week's time split between goals, as one stacked bar. */
function WeekSplit({ stats }: { stats: GoalStats[] }) {
  const total = stats.reduce((s, x) => s + x.minutesThisWeek, 0);
  if (!total) return <p className="muted small">W tym tygodniu nic jeszcze nie odhaczono. Podział czasu pojawi się po pierwszych zrobionych zadaniach.</p>;
  return (
    <div className="split">
      <div className="split-bar" role="img" aria-label="Podział czasu na cele w tym tygodniu">
        {stats.filter((s) => s.minutesThisWeek).map((s) => (
          <span key={s.goal?.id ?? 'none'} style={{ flex: s.minutesThisWeek, background: s.goal?.color ?? 'var(--track)' }} title={`${s.goal?.name ?? 'Bez celu'}: ${formatMinutes(s.minutesThisWeek)}`} />
        ))}
      </div>
      <div className="split-legend">
        {stats.filter((s) => s.minutesThisWeek).map((s) => (
          <span key={s.goal?.id ?? 'none'} className="small">
            <span className="dot" style={{ background: s.goal?.color ?? 'var(--track)' }} />
            {s.goal?.name ?? 'Bez celu'} · {formatMinutes(s.minutesThisWeek)} ({Math.round((s.minutesThisWeek / total) * 100)}%)
          </span>
        ))}
      </div>
    </div>
  );
}

export function Goals() {
  const { goals, projects, tasks, settings } = useData();
  const { now } = useUI();
  const [name, setName] = useState('');
  const stats = goalStats(goals, projects, tasks, now.getTime(), settings.defaultEstimate);
  const real = stats.filter((s) => s.goal);
  const done = goals.filter((g) => g.status === 'done');

  const add = async () => {
    if (name.trim()) await createGoal(name);
    setName('');
  };

  return (
    <>
      <Header eyebrow="Kierunek" title="Cele" subtitle="Duże cele nad projektami. Widać, ile czasu naprawdę idzie na każdy z nich.">
        <WeekSplit stats={stats} />
      </Header>
      <section className="panel tasks-panel goals">
        {real.length === 0 && (
          <p className="empty">Dodaj 2–4 cele, np. „Awans”, „Umiejętności AI”, „Własna firma”, a potem przypnij do nich projekty.</p>
        )}
        {real.map((s) => <GoalCard key={s.goal!.id} s={s} />)}
        <div className="add-stage">
          <input className="inline-input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={real.length ? 'Dodaj kolejny cel' : 'Nazwa celu, np. Awans'} aria-label="Nazwa nowego celu" />
          <button type="button" className="secondary-btn" onClick={add} disabled={!name.trim()}>Dodaj cel</button>
        </div>
        {done.length > 0 && (
          <p className="muted small">Osiągnięte: {done.map((g) => (
            <button key={g.id} type="button" className="link-btn" title="Kliknij, aby przywrócić" onClick={() => updateGoal(g.id, { status: 'active' })}>{g.name} </button>
          ))}</p>
        )}
      </section>
    </>
  );
}

function GoalCard({ s }: { s: GoalStats }) {
  const g = s.goal as Goal;
  const { projects, projectById } = useData();
  const { setView, today, openTask } = useUI();
  const [nameDraft, setNameDraft] = useState(g.name);
  const [why, setWhy] = useState(g.why);
  const [confirm, setConfirm] = useState(false);
  const mine = s.projectIds.map((id) => projectById.get(id)!).filter((p) => p && p.status !== 'done');
  const free = projects.filter((p) => !p.parentId && !p.goalId && p.status !== 'done');
  const idle = s.lastDone ? daysBetween(toISO(new Date(s.lastDone)), today) : null;
  const trend = s.minutesThisWeek - s.minutesLastWeek;

  return (
    <article className="goal-card" style={{ ['--goal' as string]: g.color }}>
      <div className="goal-head">
        <input className="goal-name" value={nameDraft} aria-label="Nazwa celu" onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => nameDraft.trim() && nameDraft !== g.name && updateGoal(g.id, { name: nameDraft.trim() })} />
        <div className="swatches small-swatches">
          {PROJECT_COLORS.map((c) => (
            <button key={c} type="button" className={`swatch${c === g.color ? ' on' : ''}`} style={{ background: c }} aria-label={`Kolor ${c}`} onClick={() => updateGoal(g.id, { color: c })} />
          ))}
        </div>
      </div>
      <input className="inline-input goal-why" value={why} placeholder="Dlaczego to ważne? (jedno zdanie, które Cię ruszy)" aria-label="Dlaczego to ważne"
        onChange={(e) => setWhy(e.target.value)} onBlur={() => why !== g.why && updateGoal(g.id, { why })} />

      <div className="goal-stats">
        <div><strong>{hours(s.minutesThisWeek)}</strong><span className="muted small">w tym tygodniu</span></div>
        <div><strong>{s.doneThisWeek}</strong><span className="muted small">zrobione zadania</span></div>
        <div>
          <strong className={trend > 0 ? 'up' : trend < 0 ? 'down' : ''}>{trend > 0 ? '▲' : trend < 0 ? '▼' : '='} {hours(Math.abs(trend))}</strong>
          <span className="muted small">vs poprzedni ({hours(s.minutesLastWeek)})</span>
        </div>
        <div><strong>{s.open}</strong><span className="muted small">otwarte</span></div>
      </div>

      {s.open > 0 && idle !== null && idle >= 7 && <p className="chip warn-chip">Bez ruchu od {idle} dni</p>}
      {s.next && (
        <p className="small">
          <strong>Następny krok:</strong>{' '}
          <button type="button" className="link-btn" onClick={() => openTask(s.next!.id)}>{s.next.title}</button>
        </p>
      )}
      {!s.next && mine.length > 0 && <p className="chip warn-chip">Brak otwartych zadań — dopisz następny krok w projekcie.</p>}

      <div className="goal-projects">
        {mine.map((p) => (
          <span key={p.id} className="chip goal-project">
            <button type="button" className="link-plain" onClick={() => setView({ kind: 'project', id: p.id })}>
              <span className="dot" style={{ background: p.color }} /> {p.parentId ? '↳ ' : ''}{p.name}
            </button>
            {p.goalId === g.id && (
              <button type="button" className="chip-x" aria-label={`Odepnij ${p.name}`} onClick={() => updateProject(p.id, { goalId: null })}>×</button>
            )}
          </span>
        ))}
        {free.length > 0 && (
          <select className="triage-select" value="" aria-label="Przypnij projekt do celu" onChange={(e) => e.target.value && updateProject(e.target.value, { goalId: g.id })}>
            <option value="">+ Przypnij projekt</option>
            {free.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {!mine.length && !free.length && <span className="muted small">Wszystkie projekty mają już cel. Zmień cel projektu w „Edytuj projekt”.</span>}
      </div>

      <div className="goal-actions">
        <button type="button" className="link-btn" onClick={() => updateGoal(g.id, { status: 'done' })}>Cel osiągnięty</button>
        <span className="spacer" />
        <button type="button" className={`danger-btn${confirm ? ' armed' : ''}`} onClick={() => (confirm ? deleteGoal(g.id) : setConfirm(true))} onBlur={() => setConfirm(false)}>
          <IconTrash /> {confirm ? 'Kliknij, aby usunąć (projekty zostaną)' : 'Usuń'}
        </button>
      </div>
    </article>
  );
}

/** Compact version for the weekly review. */
export function GoalsWeek() {
  const { goals, projects, tasks, settings } = useData();
  const { now, setView } = useUI();
  const stats = goalStats(goals, projects, tasks, now.getTime(), settings.defaultEstimate);
  if (!goals.some((g) => g.status === 'active')) {
    return (
      <p className="muted">
        Nie masz jeszcze celów. <button type="button" className="link-btn" onClick={() => setView({ kind: 'goals' })}>Dodaj cele</button> — przegląd pokaże wtedy, ile czasu idzie na każdy.
      </p>
    );
  }
  return (
    <>
      <WeekSplit stats={stats} />
      <p className="muted small">Czy podział czasu zgadza się z tym, co dla Ciebie najważniejsze? Cel bez ruchu potrzebuje jednego małego kroku na przyszły tydzień.</p>
      <div className="task-list">
        {stats.filter((s) => s.goal).map((s) => (
          <div key={s.goal!.id} className="task review-row">
            <span className="dot" style={{ background: s.goal!.color }} />
            <span className="task-title">{s.goal!.name}</span>
            <span className="small muted">{formatMinutes(s.minutesThisWeek)} · {s.doneThisWeek} zad.</span>
            {s.minutesThisWeek === 0 && <span className="chip warn-chip">bez ruchu</span>}
          </div>
        ))}
      </div>
    </>
  );
}

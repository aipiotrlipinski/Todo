import { useState } from 'react';
import { createGoal, createProject, deleteGoal, PROJECT_COLORS, updateGoal, updateProject } from '../actions';
import { IconTrash } from '../components/icons';
import { QuickAdd } from '../components/QuickAdd';
import { TaskTree } from '../components/TaskItem';
import { daysBetween, formatMinutes, toISO } from '../dates';
import { goalProgress, goalStats, projectsOfGoal, sortGoalsByDue, type GoalStats } from '../goals';
import { projectProgress, subprojectsOf } from '../selectors';
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

const MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
export const shortDate = (iso: string) => `${Number(iso.slice(8))} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export function daysLeftText(d: number | null): string {
  if (d === null) return 'bez terminu';
  if (d < 0) return `po terminie ${-d} ${-d === 1 ? 'dzień' : 'dni'}`;
  if (d === 0) return 'termin dziś';
  if (d === 1) return 'został 1 dzień';
  return `zostało ${d} dni`;
}

export function Goals() {
  const { goals, projects, tasks, settings } = useData();
  const { now, today } = useUI();
  const [name, setName] = useState('');
  const [due, setDue] = useState('');
  const stats = goalStats(goals, projects, tasks, now.getTime(), settings.defaultEstimate);
  const active = sortGoalsByDue(goals.filter((g) => g.status === 'active'));
  const done = goals.filter((g) => g.status === 'done');

  const add = async () => {
    if (!name.trim()) return;
    const g = await createGoal(name);
    if (due) await updateGoal(g.id, { due });
    setName('');
    setDue('');
  };

  return (
    <>
      <Header eyebrow="Kierunek" title="Cele" subtitle="Cele z terminem, uporządkowane od najbliższego. Kliknij cel, aby zobaczyć wszystkie jego projekty i zadania.">
        <WeekSplit stats={stats} />
      </Header>
      <section className="panel tasks-panel goals">
        {active.length === 0 && (
          <p className="empty">Dodaj 2–4 cele z terminem, np. „Awans na dyrektora” do końca 2027, a potem przypnij do nich projekty.</p>
        )}
        <div className="goal-list">
          {active.map((g) => <GoalRow key={g.id} g={g} today={today} />)}
        </div>
        <div className="add-stage goal-add">
          <input className="inline-input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={active.length ? 'Dodaj kolejny cel' : 'Nazwa celu, np. Awans'} aria-label="Nazwa nowego celu" />
          <label className="goal-due-input">
            <span className="muted small">do</span>
            <input type="date" className="inline-input" value={due} min={today} onChange={(e) => setDue(e.target.value)} aria-label="Termin celu" />
          </label>
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

/** One goal in the list: name, due date, days left, task progress vs time gone. Click = goal screen. */
function GoalRow({ g, today }: { g: Goal; today: string }) {
  const { projects, tasks } = useData();
  const { setView } = useUI();
  const pr = goalProgress(g, projects, tasks, today);
  const nProj = projectsOfGoal(g.id, projects).filter((p) => p.status !== 'done').length;
  const pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 0;
  const behind = pr.timeGone !== null && pr.total > 0 && pr.timeGone - pr.done / pr.total > 0.15;
  const late = pr.daysLeft !== null && pr.daysLeft < 0;
  return (
    <button type="button" className="goal-row" style={{ ['--goal' as string]: g.color }} onClick={() => setView({ kind: 'goal', id: g.id })}>
      <span className="goal-row-top">
        <span className="goal-row-name">{g.name}</span>
        <span className={`goal-row-due${late ? ' late' : pr.daysLeft !== null && pr.daysLeft <= 14 ? ' soon' : ''}`}>
          {g.due ? <>do {shortDate(g.due)} · </> : null}{daysLeftText(pr.daysLeft)}
        </span>
      </span>
      <span className="bar goal-bar" aria-hidden="true">
        <span style={{ width: `${pct}%`, background: g.color }} />
        {pr.timeGone !== null && <i className="time-mark" style={{ left: `${pr.timeGone * 100}%` }} />}
      </span>
      <span className="goal-row-meta small muted">
        {pr.done} z {pr.total} zadań ({pct}%) · {nProj ? `${nProj} ${nProj === 1 ? 'projekt' : nProj < 5 ? 'projekty' : 'projektów'}` : 'brak projektów'}
        {behind && <span className="chip warn-chip">za czasem</span>}
      </span>
    </button>
  );
}

/** Goal screen: summary, editing, and every project of the goal with its open tasks. */
export function GoalView({ id }: { id: string }) {
  const { goals, projects, tasks, settings } = useData();
  const { setView, today, now } = useUI();
  const [editing, setEditing] = useState(false);
  const [newProject, setNewProject] = useState('');
  const g = goals.find((x) => x.id === id);
  if (!g) return <section className="panel tasks-panel"><p className="empty">Ten cel już nie istnieje.</p></section>;

  const pr = goalProgress(g, projects, tasks, today);
  const pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 0;
  const mine = projectsOfGoal(g.id, projects).filter((p) => p.status !== 'done');
  const mains = mine.filter((p) => !p.parentId || !mine.some((m) => m.id === p.parentId));
  const stats = goalStats(goals, projects, tasks, now.getTime(), settings.defaultEstimate).find((s) => s.goal?.id === g.id);

  const addProject = async () => {
    const n = newProject.trim();
    setNewProject('');
    if (!n) return;
    const p = await createProject(n);
    await updateProject(p.id, { goalId: g.id });
  };

  return (
    <>
      <Header
        eyebrow={undefined}
        title={g.name}
        subtitle={g.why || undefined}
        crumb={<button type="button" className="crumb" onClick={() => setView({ kind: 'goals' })}>‹ Cele</button>}
        actions={<button type="button" className="secondary-btn" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>Edytuj cel</button>}
      >
        <div className="project-summary">
          <div className="bar thick goal-bar">
            <span style={{ width: `${pct}%`, background: g.color }} />
            {pr.timeGone !== null && <i className="time-mark" style={{ left: `${pr.timeGone * 100}%` }} />}
          </div>
          <p className="muted small">
            {g.due ? <><strong>Termin: {shortDate(g.due)}</strong> · {daysLeftText(pr.daysLeft)} · </> : 'Bez terminu — ustaw go w „Edytuj cel” · '}
            {pr.done} z {pr.total} zadań zrobione
            {pr.timeGone !== null && <> · minęło {Math.round(pr.timeGone * 100)}% czasu</>}
          </p>
        </div>
        {editing && stats && <GoalCard s={stats} />}
      </Header>

      {mains.length === 0 && (
        <section className="panel tasks-panel">
          <p className="empty">Ten cel nie ma jeszcze projektów. Dodaj nowy poniżej albo przypnij istniejący w „Edytuj cel”.</p>
        </section>
      )}
      {mains.map((p) => <GoalProject key={p.id} projectId={p.id} />)}

      <section className="panel tasks-panel">
        <div className="add-stage">
          <input className="inline-input" value={newProject} onChange={(e) => setNewProject(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addProject()}
            placeholder="Nowy projekt w tym celu" aria-label="Nazwa nowego projektu w tym celu" />
          <button type="button" className="secondary-btn" onClick={addProject} disabled={!newProject.trim()}>Dodaj projekt</button>
        </div>
      </section>
    </>
  );
}

/** A project inside the goal screen: its open tasks (and its subprojects' tasks), quick add. */
function GoalProject({ projectId }: { projectId: string }) {
  const { tasks, projects, projectById } = useData();
  const { setView } = useUI();
  const p = projectById.get(projectId)!;
  const subs = subprojectsOf(projects.filter((x) => x.status !== 'done'), p.id);
  const pr = projectProgress(tasks, p.id, subs.map((s) => s.id));
  const pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 0;
  const openOf = (pid: string) => tasks.filter((t) => t.projectId === pid && !t.parentId && t.status === 'open').sort((a, b) => a.order - b.order);

  return (
    <section className="panel tasks-panel goal-project-panel" aria-label={`Projekt ${p.name}`}>
      <div className="goal-project-head">
        <button type="button" className="subproject-name" onClick={() => setView({ kind: 'project', id: p.id })}>
          <span className="dot" style={{ background: p.color }} /> {p.name} ›
        </button>
        <span className="bar subproject-bar"><span style={{ width: `${pct}%`, background: p.color }} /></span>
        <span className="small muted">{pr.done}/{pr.total}{p.due ? ` · do ${shortDate(p.due)}` : ''}</span>
      </div>
      <TaskTree tasks={openOf(p.id)} all={tasks} hideProject empty="Brak otwartych zadań — dopisz następny krok." />
      <QuickAdd compact label={`Dodaj zadanie do projektu ${p.name}`} defaults={{ projectId: p.id }} placeholder="Dodaj zadanie do tego projektu" />
      {subs.map((s) => (
        <div key={s.id} className="goal-sub">
          <button type="button" className="subproject-name" onClick={() => setView({ kind: 'project', id: s.id })}>
            <span className="dot" style={{ background: s.color }} /> ↳ {s.name} ›
          </button>
          <TaskTree tasks={openOf(s.id)} all={tasks} hideProject empty="Brak otwartych zadań." />
        </div>
      ))}
    </section>
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
      <label className="goal-due-input">
        <span className="muted small">Termin celu</span>
        <input type="date" className="inline-input" value={g.due ?? ''} aria-label="Termin celu" onChange={(e) => updateGoal(g.id, { due: e.target.value || null })} />
      </label>
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
        <button type="button" className="link-btn" onClick={() => updateGoal(g.id, { status: 'done' }).then(() => setView({ kind: 'goals' }))}>Cel osiągnięty</button>
        <span className="spacer" />
        <button type="button" className={`danger-btn${confirm ? ' armed' : ''}`} onClick={() => (confirm ? deleteGoal(g.id).then(() => setView({ kind: 'goals' })) : setConfirm(true))} onBlur={() => setConfirm(false)}>
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

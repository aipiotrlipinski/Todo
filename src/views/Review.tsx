import { useMemo, useState } from 'react';
import { deleteTask, restoreTasks, setSetting, toggleDone, updateProject, updateTask, updateTasks } from '../actions';
import { QuickAdd } from '../components/QuickAdd';
import { addDays, daysBetween, formatDue, formatLong, formatMinutes, WEEKDAYS_SHORT, weekdayIndex } from '../dates';
import { capacity } from '../planner';
import { childrenOf, isOpen, sortTasks, subprojectsOf, topProjects } from '../selectors';
import { planWindowFor, useData, useUI } from '../store';
import type { Task } from '../types';
import { Header } from './Header';

type Step = 'done' | 'overdue' | 'inbox' | 'projects' | 'goals' | 'tomorrow' | 'week' | 'finish';

const STEPS: Record<'day' | 'week', Step[]> = {
  day: ['done', 'overdue', 'tomorrow', 'finish'],
  week: ['done', 'inbox', 'overdue', 'projects', 'week', 'finish'],
};

const TITLES: Record<Step, string> = {
  done: 'Co się udało',
  overdue: 'Niedokończone',
  inbox: 'Skrzynka',
  projects: 'Projekty',
  goals: 'Cele',
  tomorrow: 'Jutro',
  week: 'Następny tydzień',
  finish: 'Gotowe',
};

export function Review({ mode }: { mode: 'day' | 'week' }) {
  const { tasks } = useData();
  const { today, setView } = useUI();
  const steps = STEPS[mode];
  const [i, setI] = useState(0);
  const step = steps[i];

  const sinceTs = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (mode === 'week') d.setDate(d.getDate() - 6);
    return d.getTime();
  }, [mode]);
  const done = tasks.filter((t) => t.status === 'done' && t.completedAt && t.completedAt >= sinceTs);

  const next = async () => {
    if (i < steps.length - 1) setI(i + 1);
    if (steps[i + 1] === 'finish') await setSetting(mode === 'day' ? 'lastDailyReview' : 'lastWeeklyReview', today);
  };

  return (
    <>
      <Header eyebrow={mode === 'day' ? `Przegląd dnia · ${formatLong(today)}` : 'Przegląd tygodnia'} title={TITLES[step]}>
        <div className="review-steps" aria-label="Kroki przeglądu">
          {steps.map((s, k) => (
            <button key={s} type="button" className={`review-step${k === i ? ' on' : ''}${k < i ? ' past' : ''}`} onClick={() => setI(k)} aria-current={k === i ? 'step' : undefined}>
              <span>{k + 1}</span> {TITLES[s]}
            </button>
          ))}
        </div>
      </Header>

      <section className="panel tasks-panel review">
        {step === 'done' && <DoneStep done={done} mode={mode} />}
        {step === 'overdue' && <TriageStep queue={tasks.filter((t) => isOpen(t) && !t.parentId && t.due && (mode === 'day' ? t.due <= today : t.due < today)).sort(sortTasks)} empty="Nic nie zostało. Wszystko z terminem na dziś jest zamknięte." />}
        {step === 'inbox' && <TriageStep inbox queue={tasks.filter((t) => isOpen(t) && !t.projectId && !t.parentId && !t.due).sort((a, b) => a.order - b.order)} empty="Skrzynka pusta. Wszystko ma swoje miejsce." />}
        {step === 'projects' && <ProjectsStep />}
        {step === 'tomorrow' && <TomorrowStep />}
        {step === 'week' && <WeekStep />}
        {step === 'finish' && <FinishStep mode={mode} />}

        <div className="dialog-actions review-nav">
          {i > 0 && step !== 'finish' && <button type="button" className="secondary-btn" onClick={() => setI(i - 1)}>Wstecz</button>}
          <span className="spacer" />
          {step === 'finish' ? (
            <button type="button" className="primary-btn" onClick={() => setView({ kind: 'today' })}>Wróć do Dziś</button>
          ) : (
            <button type="button" className="primary-btn" onClick={next}>{steps[i + 1] === 'finish' ? 'Zakończ przegląd' : 'Dalej'}</button>
          )}
        </div>
      </section>
    </>
  );
}

function DoneStep({ done, mode }: { done: Task[]; mode: 'day' | 'week' }) {
  const mins = done.reduce((s, t) => s + (t.estimate ?? 0), 0);
  return (
    <>
      <p className="review-big">
        {done.length ? `${mode === 'day' ? 'Dziś' : 'W tym tygodniu'} zamknięte: ${done.length}` : 'Nic jeszcze nie odhaczone.'}
        {mins ? <span className="muted"> · ok. {formatMinutes(mins)} pracy</span> : null}
      </p>
      {done.length > 0 ? (
        <ul className="done-list">
          {done.slice(0, 30).map((t) => <li key={t.id}>{t.title}</li>)}
          {done.length > 30 && <li className="muted">i {done.length - 30} więcej</li>}
        </ul>
      ) : (
        <p className="muted">To też informacja. W następnym kroku zdecydujesz, co dalej z otwartymi sprawami.</p>
      )}
    </>
  );
}

/** One task at a time: decide where it goes. */
function TriageStep({ queue, empty, inbox }: { queue: Task[]; empty: string; inbox?: boolean }) {
  const { projects, projectById, tasks } = useData();
  const { today, toast, openTask } = useUI();
  const [skipped, setSkipped] = useState<string[]>([]);
  const [total] = useState(queue.length);
  const left = queue.filter((t) => !skipped.includes(t.id));
  const t = left[0];
  if (!t) return <p className="review-big">{empty}</p>;

  const project = t.projectId ? projectById.get(t.projectId) : undefined;
  const kids = childrenOf(tasks, t.id).filter(isOpen).length;
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    const snap = { ...t };
    await fn();
    toast(`${msg}: ${t.title}`, () => restoreTasks([snap]));
  };
  const nextMonday = addDays(today, 7 - weekdayIndex(today));

  return (
    <div className="triage">
      <p className="muted small">{Math.min(total, total - left.length + 1)} z {Math.max(total, left.length)}</p>
      <button type="button" className="triage-card" onClick={() => openTask(t.id)} title="Otwórz szczegóły">
        <span className="triage-title">{t.title}</span>
        <span className="task-meta">
          {project && <span className="meta-project"><span className="dot" style={{ background: project.color }} />{project.name}</span>}
          {t.due && <span className={t.due < today ? 'meta-overdue' : ''}>{formatDue(t.due, today)}{t.due < today ? ` · ${daysBetween(t.due, today)} dni po terminie` : ''}</span>}
          {t.estimate ? <span>{formatMinutes(t.estimate)}</span> : null}
          {kids ? <span>{kids} podzadań</span> : null}
        </span>
      </button>
      <div className="triage-actions">
        <button type="button" className="secondary-btn" onClick={() => act(() => toggleDone(t, today), 'Zrobione')}>✓ Zrobione</button>
        {inbox && <button type="button" className="secondary-btn" onClick={() => act(() => updateTask(t.id, { due: today }), 'Na dziś')}>Dziś</button>}
        <button type="button" className="secondary-btn" onClick={() => act(() => updateTask(t.id, { due: addDays(today, 1) }), 'Na jutro')}>Jutro</button>
        <button type="button" className="secondary-btn" onClick={() => act(() => updateTask(t.id, { due: nextMonday }), 'Na przyszły tydzień')}>Przyszły tydzień</button>
        {!inbox && <button type="button" className="secondary-btn" onClick={() => act(() => updateTask(t.id, { due: null, time: null }), 'Bez terminu')}>Bez terminu</button>}
        <label className="triage-date">
          <span className="sr-only">Inny dzień</span>
          <input type="date" min={today} aria-label="Wybierz dzień" onChange={(e) => e.target.value && act(() => updateTask(t.id, { due: e.target.value }), 'Przeniesiono')} />
        </label>
        {inbox && (
          <select className="triage-select" value="" aria-label="Przenieś do projektu"
            onChange={(e) => e.target.value && act(() => updateTask(t.id, { projectId: e.target.value, stageId: null }), `Do projektu ${projectById.get(e.target.value)?.name}`)}>
            <option value="">Do projektu…</option>
            {topProjects(projects.filter((p) => p.status !== 'done')).flatMap((p) => [
              <option key={p.id} value={p.id}>{p.name}</option>,
              ...subprojectsOf(projects, p.id).map((s) => <option key={s.id} value={s.id}>{'  ↳ '}{s.name}</option>),
            ])}
          </select>
        )}
        <button type="button" className="danger-btn" onClick={async () => {
          const removed = await deleteTask(t.id);
          toast(`Usunięto: ${t.title}`, () => restoreTasks(removed));
        }}>Usuń</button>
        <button type="button" className="link-btn" onClick={() => setSkipped([...skipped, t.id])}>Zostaw bez zmian</button>
      </div>
    </div>
  );
}

function ProjectsStep() {
  const { tasks, projects } = useData();
  const { setView, today, toast } = useUI();
  const active = projects.filter((p) => p.status === 'active');
  if (!active.length) return <p className="review-big">Brak aktywnych projektów.</p>;
  return (
    <div className="review-projects">
      <p className="muted small">Każdy projekt potrzebuje jasnego następnego kroku. Te bez ruchu wstrzymaj albo zakończ — lżej się myśli.</p>
      {active.map((p) => {
        const mine = tasks.filter((t) => t.projectId === p.id && !t.parentId);
        const open = mine.filter(isOpen).sort((a, b) => a.order - b.order);
        const lastDone = Math.max(0, ...mine.map((t) => t.completedAt ?? 0));
        const idle = lastDone ? daysBetween(new Date(lastDone).toISOString().slice(0, 10), today) : null;
        const warn = !open.length ? 'Brak następnego kroku' : idle !== null && idle >= 14 ? `Bez ruchu od ${idle} dni` : null;
        return (
          <div key={p.id} className="review-project">
            <div className="subproject-head">
              <button type="button" className="subproject-name" onClick={() => setView({ kind: 'project', id: p.id })}>
                <span className="dot" style={{ background: p.color }} />{p.name}
              </button>
              {warn && <span className="chip warn-chip">{warn}</span>}
              <span className="spacer" />
              <button type="button" className="link-btn" onClick={async () => { await updateProject(p.id, { status: 'paused' }); toast(`Wstrzymano: ${p.name}`, () => updateProject(p.id, { status: 'active' })); }}>Wstrzymaj</button>
              <button type="button" className="link-btn" onClick={async () => { await updateProject(p.id, { status: 'done' }); toast(`Zakończono: ${p.name}`, () => updateProject(p.id, { status: 'active' })); }}>Zakończ</button>
            </div>
            <p className="small">{open[0] ? <><strong>Następny krok:</strong> {open[0].title}</> : 'Dopisz pierwszy krok:'} <span className="muted">· otwarte: {open.length}</span></p>
            {!open.length && <QuickAdd compact label={`Następny krok w ${p.name}`} defaults={{ projectId: p.id }} placeholder="Np. Zadzwonić do… jutro" />}
          </div>
        );
      })}
      {projects.some((p) => p.status === 'paused') && (
        <p className="muted small">Wstrzymane: {projects.filter((p) => p.status === 'paused').map((p) => (
          <button key={p.id} type="button" className="link-btn" onClick={() => updateProject(p.id, { status: 'active' })} title="Kliknij, aby wznowić">{p.name} </button>
        ))}</p>
      )}
    </div>
  );
}

function TomorrowStep() {
  const { tasks, settings } = useData();
  const { today } = useUI();
  const tomorrow = addDays(today, 1);
  const list = tasks.filter((t) => isOpen(t) && t.due === tomorrow && !t.parentId).sort(sortTasks);
  const [orig] = useState(() => new Map(list.map((t) => [t.id, t.priority])));
  const cap = capacity({ date: tomorrow, window: planWindowFor(tomorrow, settings), fixed: settings.fixed, tasks: list, defaultEstimate: settings.defaultEstimate });
  const stars = list.filter((t) => t.priority === 1).length;

  const star = (t: Task) =>
    updateTasks([{ id: t.id, changes: { priority: t.priority === 1 ? ((orig.get(t.id) ?? 4) === 1 ? 2 : orig.get(t.id) ?? 4) : 1 } }]);

  return (
    <>
      <p className="small">
        {formatLong(tomorrow)} · zadania: {list.length} · {formatMinutes(cap.planned)} z {formatMinutes(cap.free)} wolnych
        {cap.over ? <strong className="meta-overdue"> · za dużo o {formatMinutes(cap.over)}</strong> : null}
      </p>
      <p className="muted small">Zaznacz gwiazdką maksymalnie 3 najważniejsze rzeczy (dostaną priorytet 1). Resztę traktuj jako bonus.</p>
      <div className="task-list">
        {list.map((t) => (
          <div key={t.id} className="task review-row">
            <button type="button" className={`star${t.priority === 1 ? ' on' : ''}`} aria-pressed={t.priority === 1} disabled={t.priority !== 1 && stars >= 3}
              aria-label={t.priority === 1 ? `Usuń gwiazdkę: ${t.title}` : `Najważniejsze: ${t.title}`} onClick={() => star(t)}>★</button>
            <span className="task-title">{t.title}</span>
            {t.estimate ? <span className="est">{formatMinutes(t.estimate)}</span> : null}
          </div>
        ))}
        {!list.length && <p className="empty">Na jutro nic nie ma. Dopisz to, co naprawdę ważne.</p>}
      </div>
      <QuickAdd compact label="Dodaj na jutro" defaults={{ due: tomorrow }} placeholder="Dodaj zadanie na jutro" />
    </>
  );
}

function WeekStep() {
  const { tasks, settings } = useData();
  const { today } = useUI();
  const days = Array.from({ length: 7 }, (_, k) => addDays(today, k + 1));
  return (
    <div className="week-load">
      <p className="muted small">Obciążenie najbliższych 7 dni: zadania bez godziny wobec wolnego czasu (po odjęciu stałych punktów).</p>
      {days.map((d) => {
        const list = tasks.filter((t) => isOpen(t) && t.due === d && !t.parentId);
        const cap = capacity({ date: d, window: planWindowFor(d, settings), fixed: settings.fixed, tasks: list, defaultEstimate: settings.defaultEstimate });
        const pct = cap.free ? Math.min(100, Math.round((cap.planned / cap.free) * 100)) : cap.planned ? 100 : 0;
        return (
          <div key={d} className="week-row">
            <span className="week-day">{WEEKDAYS_SHORT[weekdayIndex(d)]} {d.slice(8)}.{d.slice(5, 7)}</span>
            <span className="bar thick"><span className={cap.over ? 'over' : ''} style={{ width: `${pct}%` }} /></span>
            <span className="small week-num">{list.length} · {formatMinutes(cap.planned)}{cap.over ? ` (+${formatMinutes(cap.over)})` : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

function FinishStep({ mode }: { mode: 'day' | 'week' }) {
  const { tasks } = useData();
  const { today } = useUI();
  const tomorrow = tasks.filter((t) => isOpen(t) && t.due === addDays(today, 1) && !t.parentId);
  const top = tomorrow.filter((t) => t.priority === 1);
  return (
    <>
      <p className="review-big">Przegląd {mode === 'day' ? 'dnia' : 'tygodnia'} zrobiony.</p>
      {top.length > 0 ? (
        <>
          <p>Jutro najważniejsze:</p>
          <ul className="done-list">{top.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
        </>
      ) : (
        <p className="muted">Jutro: {tomorrow.length} zadań.</p>
      )}
      <p className="muted small">Głowa wolna — wszystko jest zapisane.</p>
    </>
  );
}

/** Banner on Today: evening review / weekly review reminder. */
export function ReviewPrompt() {
  const { settings } = useData();
  const { today, now, setView } = useUI();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const weekly = weekdayIndex(today) === settings.weeklyReviewDay && settings.lastWeeklyReview !== today;
  const daily = hhmm >= settings.reviewTime && settings.lastDailyReview !== today && settings.lastWeeklyReview !== today;
  if (!weekly && !daily) return null;
  const mode = weekly ? 'week' : 'day';
  return (
    <div className="review-prompt">
      <span>{weekly ? 'Dziś przegląd tygodnia · ok. 10 min' : 'Czas na przegląd dnia · 2 min'}</span>
      <button type="button" className="primary-btn" onClick={() => setView({ kind: 'review', mode })}>Zacznij</button>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { createTaskFromParsed, deleteTask, ensureLabels, restoreTasks, toggleDone, updateTask } from '../actions';
import { parseQuickAdd } from '../parser';
import { WEEKDAYS, WEEKDAYS_SHORT, weekdayIndex } from '../dates';
import { describeRecurrence, firstOccurrence } from '../recurrence';
import { subprojectsOf, topProjects } from '../selectors';
import { childrenOf } from '../selectors';
import { useData, useUI } from '../store';
import type { Priority, Recurrence, Task } from '../types';
import { IconClose, IconTrash } from './icons';
import { TaskItem } from './TaskItem';

const REPEAT_OPTIONS: { value: string; label: string; rec: Recurrence | null }[] = [
  { value: 'none', label: 'Nie powtarzaj', rec: null },
  { value: 'daily', label: 'Codziennie', rec: { kind: 'daily', interval: 1 } },
  { value: 'weekdays', label: 'W dni robocze', rec: { kind: 'weekdays', interval: 1 } },
  { value: 'weekly', label: 'Co tydzień', rec: { kind: 'weekly', interval: 1 } },
  { value: 'days', label: 'W wybrane dni tygodnia', rec: { kind: 'weekly', interval: 1, weekdays: [] } },
  { value: 'monthly', label: 'Co miesiąc', rec: { kind: 'monthly', interval: 1 } },
];

function repeatValue(r: Recurrence | null): string {
  if (!r) return 'none';
  if (r.kind === 'weekly' && r.weekdays) return r.interval === 1 ? 'days' : 'custom';
  if (r.interval === 1) return r.kind;
  return 'custom';
}

export function TaskEditor({ task }: { task: Task }) {
  const { tasks, projects, stages, labels, labelById } = useData();
  const { openTask, toast, today } = useUI();
  const [draft, setDraft] = useState<Task>(task);
  const [labelText, setLabelText] = useState(() => task.labels.map((id) => labelById.get(id)?.name).filter(Boolean).join(', '));
  const [sub, setSub] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const set = <K extends keyof Task>(k: K, v: Task[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const toggleDay = (i: number) =>
    setDraft((d) => {
      const cur = d.recurrence?.weekdays ?? [];
      const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort((a, b) => a - b);
      if (!next.length) return d; // at least one day
      return { ...d, recurrence: { kind: 'weekly', interval: 1, weekdays: next } };
    });
  const projectStages = stages.filter((s) => s.projectId === draft.projectId);
  const kids = childrenOf(tasks, task.id);

  const save = async () => {
    const names = labelText.split(',').map((s) => s.trim().replace(/^@/, '')).filter(Boolean);
    const ids = await ensureLabels(names.map((n) => ({ id: labels.find((l) => l.name.toLowerCase() === n.toLowerCase())?.id ?? null, name: n })));
    let due = draft.due || null;
    const rec = draft.recurrence;
    if (rec && (!due || (rec.weekdays?.length && !rec.weekdays.includes(weekdayIndex(due))))) {
      due = firstOccurrence(rec, due && due > today ? due : today);
    }
    await updateTask(task.id, {
      title: draft.title.trim() || task.title,
      notes: draft.notes,
      projectId: draft.projectId,
      stageId: projectStages.some((s) => s.id === draft.stageId) ? draft.stageId : null,
      due,
      time: draft.time || null,
      priority: draft.priority,
      estimate: draft.estimate && draft.estimate > 0 ? draft.estimate : null,
      recurrence: draft.recurrence,
      labels: ids,
    });
    openTask(null);
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const removed = await deleteTask(task.id);
    openTask(null);
    toast(`Usunięto: ${task.title}`, () => restoreTasks(removed));
  };

  const complete = async () => {
    const { snapshot, message } = await toggleDone(task, today);
    openTask(null);
    toast(`${message}: ${task.title}`, () => restoreTasks([snapshot]));
  };

  const addSub = async () => {
    const p = parseQuickAdd(sub, { today, projects, stages, labels, defaultProjectId: task.projectId });
    if (!p.title) return;
    await createTaskFromParsed(p, { projectId: task.projectId, stageId: task.stageId, parentId: task.id });
    setSub('');
  };

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) save();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') openTask(null);
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
      }}
    >
      <div className="dialog panel" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <div className="dialog-head">
          <h2 id="editor-title" className="dialog-title">Zadanie</h2>
          <button type="button" className="icon-btn" aria-label="Zamknij bez zapisu" onClick={() => openTask(null)}>
            <IconClose />
          </button>
        </div>

        <label className="field">
          <span>Tytuł</span>
          <input ref={titleRef} value={draft.title} onChange={(e) => set('title', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </label>

        <label className="field">
          <span>Notatki</span>
          <textarea rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Szczegóły, linki, następne kroki" />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Termin</span>
            <input type="date" value={draft.due ?? ''} onChange={(e) => set('due', e.target.value || null)} />
          </label>
          <label className="field">
            <span>Godzina</span>
            <input type="time" value={draft.time ?? ''} onChange={(e) => set('time', e.target.value || null)} />
          </label>
          <label className="field">
            <span>Czas (min)</span>
            <input type="number" min={0} step={5} value={draft.estimate ?? ''} onChange={(e) => set('estimate', e.target.value ? Number(e.target.value) : null)} />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Projekt</span>
            <select value={draft.projectId ?? ''} onChange={(e) => setDraft((d) => ({ ...d, projectId: e.target.value || null, stageId: null }))}>
              <option value="">Skrzynka (bez projektu)</option>
              {topProjects(projects).flatMap((p) => [
                <option key={p.id} value={p.id}>{p.name}</option>,
                ...subprojectsOf(projects, p.id).map((s) => (
                  <option key={s.id} value={s.id}>{'\u00a0\u00a0\u00a0↳ '}{s.name}</option>
                )),
              ])}
            </select>
          </label>
          <label className="field">
            <span>Etap</span>
            <select value={draft.stageId ?? ''} onChange={(e) => set('stageId', e.target.value || null)} disabled={!projectStages.length}>
              <option value="">{projectStages.length ? 'Bez etapu' : '—'}</option>
              {projectStages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Priorytet</span>
            <select value={draft.priority} onChange={(e) => set('priority', Number(e.target.value) as Priority)}>
              <option value={1}>1 – pilne</option>
              <option value={2}>2 – wysokie</option>
              <option value={3}>3 – średnie</option>
              <option value={4}>Brak</option>
            </select>
          </label>
          <label className="field">
            <span>Powtarzanie</span>
            <select
              value={repeatValue(draft.recurrence)}
              onChange={(e) => {
                const opt = REPEAT_OPTIONS.find((o) => o.value === e.target.value);
                if (!opt) return;
                if (opt.value === 'days') set('recurrence', { kind: 'weekly', interval: 1, weekdays: [weekdayIndex(draft.due ?? today)] });
                else set('recurrence', opt.rec);
              }}
            >
              {REPEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
              {repeatValue(draft.recurrence) === 'custom' && draft.recurrence && (
                <option value="custom">{describeRecurrence(draft.recurrence)}</option>
              )}
            </select>
          </label>
        </div>

        {draft.recurrence?.kind === 'weekly' && draft.recurrence.weekdays && (
          <div className="field">
            <span>Powtarzaj w dni</span>
            <div className="weekday-picker" role="group" aria-label="Dni tygodnia">
              {WEEKDAYS_SHORT.map((d, i) => {
                const on = draft.recurrence!.weekdays!.includes(i);
                return (
                  <button key={d} type="button" className={on ? 'on' : ''} aria-pressed={on} aria-label={WEEKDAYS[i]} onClick={() => toggleDay(i)}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label className="field">
          <span>Etykiety (po przecinku)</span>
          <input value={labelText} onChange={(e) => setLabelText(e.target.value)} placeholder="praca, telefon" />
        </label>

        {!task.parentId && (
          <div className="field">
            <span>Podzadania</span>
            {kids.length > 0 && (
              <div className="task-list subtasks">
                {kids.map((k) => (
                  <TaskItem key={k.id} task={k} hideProject nested />
                ))}
              </div>
            )}
            <input
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSub()}
              placeholder="Dodaj podzadanie i naciśnij Enter"
              aria-label="Nowe podzadanie"
            />
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className={`danger-btn${confirmDelete ? ' armed' : ''}`} onClick={remove}>
            <IconTrash /> {confirmDelete ? 'Kliknij, aby usunąć' : 'Usuń'}
          </button>
          <span className="spacer" />
          <button type="button" className="secondary-btn" onClick={complete}>
            {task.status === 'done' ? 'Przywróć' : 'Zrobione'}
          </button>
          <button type="button" className="primary-btn" onClick={save}>Zapisz</button>
        </div>
      </div>
    </div>
  );
}

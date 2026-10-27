import { closestCorners, DndContext, DragOverlay, useDroppable, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useState, type ReactNode } from 'react';
import {
  createProject,
  createStage,
  deleteProject,
  deleteStage,
  PROJECT_COLORS,
  reorderTasks,
  setProjectParent,
  updateProject,
  updateStage,
} from '../actions';
import { QuickAdd } from '../components/QuickAdd';
import { TaskItem, TaskTree } from '../components/TaskItem';
import { IconTrash } from '../components/icons';
import { dragA11y, SortableRow, useDragSensors } from '../components/sortable';
import { formatMinutes } from '../dates';
import { childrenOf, projectProgress, subprojectsOf, topProjects } from '../selectors';
import { useData, useUI } from '../store';
import type { Project, Stage, Task } from '../types';
import { Header } from './Header';

const NONE = 'none';

export function ProjectView({ id }: { id: string }) {
  const { tasks, stages, projects, projectById } = useData();
  const { setView } = useUI();
  const project = projectById.get(id);
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newStage, setNewStage] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const sensors = useDragSensors();

  if (!project) {
    return <section className="panel tasks-panel"><p className="empty">Ten projekt już nie istnieje.</p></section>;
  }

  const parent = project.parentId ? projectById.get(project.parentId) : undefined;
  const subs = subprojectsOf(projects.filter((p) => p.status !== 'done'), id);
  const projTasks = tasks.filter((t) => t.projectId === id);
  const myStages = stages.filter((s) => s.projectId === id);
  const stageIds = new Set(myStages.map((s) => s.id));
  const containerOf = (t: Task) => (t.stageId && stageIds.has(t.stageId) ? t.stageId : NONE);
  const visible = projTasks.filter((t) => !t.parentId && (showDone || t.status === 'open')).sort((a, b) => a.order - b.order);
  const lists = new Map<string, Task[]>([[NONE, []], ...myStages.map((s) => [s.id, []] as [string, Task[]])]);
  for (const t of visible) lists.get(containerOf(t))!.push(t);

  const pr = projectProgress(tasks, id, subs.map((s) => s.id));
  const next = nextAction(projTasks, myStages);
  const remaining = tasks
    .filter((t) => t.status === 'open' && (t.projectId === id || subs.some((s) => s.id === t.projectId)))
    .reduce((s, t) => s + (t.estimate ?? 0), 0);

  const addStage = async () => {
    if (newStage.trim()) await createStage(id, newStage);
    setNewStage('');
  };

  const onDragStart = ({ active }: DragStartEvent) => setDragId(String(active.id));

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    setDragId(null);
    if (!over) return;
    const moving = visible.find((t) => t.id === active.id);
    if (!moving) return;
    const from = containerOf(moving);
    const overId = String(over.id);
    const overTask = visible.find((t) => t.id === overId);
    const to = overTask ? containerOf(overTask) : overId.startsWith('stage:') ? overId.slice(6) : null;
    if (!to || !lists.has(to)) return;
    const target = lists.get(to)!.map((t) => t.id);
    let ids: string[];
    if (from === to) {
      if (!overTask || overTask.id === moving.id) return;
      ids = arrayMove(target, target.indexOf(moving.id), target.indexOf(overTask.id));
    } else {
      ids = [...target];
      const at = overTask ? ids.indexOf(overTask.id) : ids.length;
      ids.splice(at, 0, moving.id);
    }
    await reorderTasks(ids.map((tid) => ({ id: tid, stageId: to === NONE ? null : to })));
  };

  const dragged = dragId ? visible.find((t) => t.id === dragId) : undefined;

  return (
    <>
      <Header
        eyebrow={parent ? undefined : 'Projekt'}
        title={project.name}
        subtitle={project.goal || undefined}
        defaults={{ projectId: id }}
        actions={
          <>
            <button type="button" className="secondary-btn" onClick={() => setShowDone((v) => !v)} aria-pressed={showDone}>
              {showDone ? 'Ukryj zrobione' : 'Pokaż zrobione'}
            </button>
            <button type="button" className="secondary-btn" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
              Edytuj projekt
            </button>
          </>
        }
        crumb={parent ? (
          <button type="button" className="crumb" onClick={() => setView({ kind: 'project', id: parent.id })}>
            <span className="dot" style={{ background: parent.color }} /> {parent.name} › podprojekt
          </button>
        ) : undefined}
      >
        <div className="project-summary">
          <div className="bar thick"><span style={{ width: `${pr.total ? (pr.done / pr.total) * 100 : 0}%`, background: project.color }} /></div>
          <p className="muted small">
            {pr.done} z {pr.total} zadań zrobione{subs.length ? ' (z podprojektami)' : ''}
            {remaining ? ` · zostało ok. ${formatMinutes(remaining)}` : ''}
            {next ? <> · <strong>Następne:</strong> {next.title}</> : null}
          </p>
        </div>
        {editing && <ProjectSettings project={project} hasSubs={subs.length > 0} onDeleted={() => setView(parent ? { kind: 'project', id: parent.id } : { kind: 'today' })} />}
      </Header>

      <section className="panel tasks-panel" aria-label="Zadania projektu">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)} accessibility={dragA11y}>
          {(lists.get(NONE)!.length > 0 || myStages.length === 0) && (
            <Container id={NONE} title={myStages.length ? 'Bez etapu' : undefined}>
              <SortableTasks list={lists.get(NONE)!} all={tasks} empty={myStages.length ? undefined : 'Brak zadań. Dodaj pierwsze powyżej albo podziel projekt na etapy poniżej.'} />
            </Container>
          )}
          {myStages.map((s, i) => (
            <Container key={s.id} id={s.id} head={<StageHead stage={s} index={i} all={tasks} />}>
              <SortableTasks list={lists.get(s.id)!} all={tasks} empty="Przeciągnij tu zadanie albo dodaj nowe." />
              <QuickAdd compact label={`Dodaj zadanie do etapu ${s.name}`} defaults={{ projectId: id, stageId: s.id }} placeholder="Dodaj zadanie do tego etapu" />
            </Container>
          ))}
          <DragOverlay>{dragged ? <div className="drag-ghost"><TaskItem task={dragged} hideProject /></div> : null}</DragOverlay>
        </DndContext>
        <div className="add-stage">
          <input
            className="inline-input"
            value={newStage}
            onChange={(e) => setNewStage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addStage()}
            placeholder={myStages.length ? 'Dodaj kolejny etap' : 'Dodaj pierwszy etap, np. „Etap 1 – Fundament”'}
            aria-label="Nazwa nowego etapu"
          />
          <button type="button" className="secondary-btn" onClick={addStage} disabled={!newStage.trim()}>Dodaj etap</button>
        </div>
      </section>

      {!project.parentId && <Subprojects parent={project} subs={subs} />}
    </>
  );
}

/** A stage (or "no stage") section that also accepts dropped tasks when empty. */
function Container({ id, title, head, children }: { id: string; title?: string; head?: ReactNode; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${id}` });
  return (
    <div ref={setNodeRef} className={`stage${isOver ? ' drop-over' : ''}`}>
      {head ?? (title ? <h2 className="stage-head"><span>{title}</span></h2> : null)}
      {children}
    </div>
  );
}

function SortableTasks({ list, all, empty }: { list: Task[]; all: Task[]; empty?: string }) {
  return (
    <SortableContext items={list.map((t) => t.id)} strategy={verticalListSortingStrategy}>
      <div className="task-list">
        {list.map((t) => (
          <SortableRow key={t.id} id={t.id} label={t.title} className="task-row">
            <TaskItem task={t} hideProject />
            {childrenOf(all, t.id)
              .filter((k) => k.status === 'open')
              .map((k) => (
                <TaskItem key={k.id} task={k} hideProject nested />
              ))}
          </SortableRow>
        ))}
        {list.length === 0 && empty && <p className="empty drop-hint">{empty}</p>}
      </div>
    </SortableContext>
  );
}

/** First open task of the first stage that still has open work (or of tasks without a stage). */
function nextAction(tasks: Task[], stages: Stage[]): Task | undefined {
  const open = tasks.filter((t) => t.status === 'open' && !t.parentId).sort((a, b) => a.order - b.order);
  for (const s of stages) {
    const t = open.find((x) => x.stageId === s.id);
    if (t) return t;
  }
  return open[0];
}

function StageHead({ stage, index, all }: { stage: Stage; index: number; all: Task[] }) {
  const [rename, setRename] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const stageAll = all.filter((t) => t.stageId === stage.id);
  const done = stageAll.filter((t) => t.status === 'done').length;
  const complete = stageAll.length > 0 && done === stageAll.length;

  return (
    <h2 className={`stage-head${complete ? ' stage-complete' : ''}`}>
      {rename !== null ? (
        <input
          className="inline-input"
          autoFocus
          value={rename}
          aria-label="Nazwa etapu"
          onChange={(e) => setRename(e.target.value)}
          onBlur={async () => {
            if (rename.trim()) await updateStage(stage.id, { name: rename.trim() });
            setRename(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setRename(null);
          }}
        />
      ) : (
        <button type="button" className="stage-name" onClick={() => setRename(stage.name)} title="Kliknij, aby zmienić nazwę">
          <span className="stage-num">{index + 1}</span>
          {stage.name}
        </button>
      )}
      <span className="muted small">{done}/{stageAll.length}{complete ? ' · etap zamknięty' : ''}</span>
      <button
        type="button"
        className={`icon-btn small${confirm ? ' armed' : ''}`}
        aria-label={confirm ? 'Kliknij ponownie, aby usunąć etap' : `Usuń etap ${stage.name}`}
        title={confirm ? 'Kliknij ponownie, aby usunąć (zadania zostaną w projekcie)' : 'Usuń etap'}
        onClick={() => (confirm ? deleteStage(stage.id) : setConfirm(true))}
        onBlur={() => setConfirm(false)}
      >
        <IconTrash />
      </button>
    </h2>
  );
}

/** Subprojects shown under the main project, each with its open tasks. */
function Subprojects({ parent, subs }: { parent: Project; subs: Project[] }) {
  const { tasks } = useData();
  const { setView } = useUI();
  const [name, setName] = useState('');

  const add = async () => {
    if (name.trim()) await createProject(name, parent.id);
    setName('');
  };

  return (
    <section className="panel tasks-panel" aria-label="Podprojekty">
      <h2 className="panel-title">Podprojekty{subs.length ? ` · ${subs.length}` : ''}</h2>
      {subs.map((s) => {
        const pr = projectProgress(tasks, s.id);
        const open = tasks.filter((t) => t.projectId === s.id && t.status === 'open' && !t.parentId).sort((a, b) => a.order - b.order);
        return (
          <div key={s.id} className="subproject">
            <div className="subproject-head">
              <button type="button" className="subproject-name" onClick={() => setView({ kind: 'project', id: s.id })}>
                <span className="dot" style={{ background: s.color }} />
                {s.name}
              </button>
              <span className="muted small">{pr.done}/{pr.total}</span>
              <span className="bar subproject-bar"><span style={{ width: `${pr.total ? (pr.done / pr.total) * 100 : 0}%`, background: s.color }} /></span>
              <button type="button" className="link-btn" onClick={() => setView({ kind: 'project', id: s.id })}>Otwórz</button>
            </div>
            <TaskTree tasks={open} all={tasks} hideProject empty="Brak otwartych zadań." />
            <QuickAdd compact label={`Dodaj zadanie do podprojektu ${s.name}`} defaults={{ projectId: s.id }} placeholder={`Dodaj zadanie do „${s.name}”`} />
          </div>
        );
      })}
      <div className="add-stage">
        <input
          className="inline-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={subs.length ? 'Dodaj kolejny podprojekt' : 'Podziel projekt na mniejsze części, np. „Wersja na telefon”'}
          aria-label="Nazwa nowego podprojektu"
        />
        <button type="button" className="secondary-btn" onClick={add} disabled={!name.trim()}>Dodaj podprojekt</button>
      </div>
    </section>
  );
}

function ProjectSettings({ project, hasSubs, onDeleted }: { project: Project; hasSubs: boolean; onDeleted: () => void }) {
  const { projects } = useData();
  const [name, setName] = useState(project.name);
  const [goal, setGoal] = useState(project.goal);
  const [confirm, setConfirm] = useState(false);
  const parents = topProjects(projects).filter((p) => p.id !== project.id && p.status !== 'done');
  return (
    <div className="project-settings">
      <div className="field-row">
        <label className="field">
          <span>Nazwa</span>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && updateProject(project.id, { name: name.trim() })} />
        </label>
        <label className="field">
          <span>Cel projektu</span>
          <input value={goal} onChange={(e) => setGoal(e.target.value)} onBlur={() => updateProject(project.id, { goal })} placeholder="Co ma być efektem?" />
        </label>
        <label className="field">
          <span>Należy do projektu</span>
          <select value={project.parentId ?? ''} disabled={hasSubs} onChange={(e) => setProjectParent(project.id, e.target.value || null)} title={hasSubs ? 'Projekt z podprojektami nie może być podprojektem' : undefined}>
            <option value="">— główny projekt —</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="field">
        <span>Kolor</span>
        <div className="swatches">
          {PROJECT_COLORS.map((c) => (
            <button key={c} type="button" className={`swatch${c === project.color ? ' on' : ''}`} style={{ background: c }} aria-label={`Kolor ${c}`} aria-pressed={c === project.color} onClick={() => updateProject(project.id, { color: c })} />
          ))}
        </div>
      </div>
      <div className="dialog-actions">
        <button type="button" className="secondary-btn" onClick={() => updateProject(project.id, { status: 'done' })}>Zakończ projekt</button>
        <span className="spacer" />
        <button
          type="button"
          className={`danger-btn${confirm ? ' armed' : ''}`}
          onClick={async () => {
            if (!confirm) return setConfirm(true);
            await deleteProject(project.id);
            onDeleted();
          }}
        >
          <IconTrash /> {confirm ? `Kliknij, aby usunąć projekt${hasSubs ? ', podprojekty' : ''} i zadania` : 'Usuń projekt'}
        </button>
      </div>
    </div>
  );
}

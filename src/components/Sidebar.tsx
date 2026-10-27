import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useState } from 'react';
import { createProject, reorderProjects, setProjectParent } from '../actions';
import { daysBetween } from '../dates';
import { inboxTasks, projectProgress, subprojectsOf, todayTasks, topProjects } from '../selectors';
import { useData, useUI } from '../store';
import type { ThemePref } from '../theme';
import type { Project, View } from '../types';
import { IconInbox, IconLogo, IconMoon, IconPlus, IconSettings, IconSun, IconToday, IconUpcoming } from './icons';
import { dragA11y, SortableRow, useDragSensors } from './sortable';

interface Props {
  theme: { resolved: 'light' | 'dark'; choose: (p: ThemePref) => void };
}

const same = (a: View, b: View) => a.kind === b.kind && ('id' in a ? a.id === (b as { id?: string }).id : true);

export function Sidebar({ theme }: Props) {
  const { tasks, projects, labels, settings, projectById } = useData();
  const { view, setView, today } = useUI();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const sensors = useDragSensors();

  const t = todayTasks(tasks, today);
  const counts = { inbox: inboxTasks(tasks).length, today: t.today.length + t.overdue.length };
  const backupOld = !settings.lastExport || daysBetween(settings.lastExport.slice(0, 10), today) >= 7;
  const hasData = tasks.length > 0;
  const active = projects.filter((p) => p.status !== 'done');
  const tops = topProjects(active);

  const nav = (v: View, label: string, icon: JSX.Element, count?: number) => (
    <button type="button" className={`nav-item${same(view, v) ? ' active' : ''}`} onClick={() => setView(v)} aria-current={same(view, v) ? 'page' : undefined}>
      {icon}
      <span className="nav-label">{label}</span>
      {count ? <span className="nav-count">{count}</span> : null}
    </button>
  );

  const addProject = async () => {
    const n = name.trim();
    setAdding(false);
    setName('');
    if (!n) return;
    const p = await createProject(n);
    setView({ kind: 'project', id: p.id });
  };

  // Drag: reorder among siblings; a subproject dropped onto another main project (or its subproject) moves there.
  const onDragEnd = async ({ active: a, over }: DragEndEvent) => {
    if (!over || a.id === over.id) return;
    const dragged = projectById.get(String(a.id));
    const target = projectById.get(String(over.id));
    if (!dragged || !target) return;

    if (!dragged.parentId) {
      const onto = target.parentId ?? target.id;
      const ids = tops.map((p) => p.id);
      const from = ids.indexOf(dragged.id);
      const to = ids.indexOf(onto);
      if (from < 0 || to < 0 || from === to) return;
      await reorderProjects(arrayMove(ids, from, to));
      return;
    }

    const newParent = target.parentId ?? target.id;
    if (newParent === dragged.id) return;
    if (newParent === dragged.parentId) {
      if (!target.parentId) return; // hovering its own main project: no change
      const ids = subprojectsOf(active, newParent).map((p) => p.id);
      await reorderProjects(arrayMove(ids, ids.indexOf(dragged.id), ids.indexOf(target.id)));
      return;
    }
    await setProjectParent(dragged.id, newParent);
    const ids = subprojectsOf(active, newParent).map((p) => p.id);
    const at = target.parentId ? ids.indexOf(target.id) : ids.length;
    ids.splice(at < 0 ? ids.length : at, 0, dragged.id);
    await reorderProjects(ids);
  };

  const card = (p: Project, sub: boolean) => {
    const subs = sub ? [] : subprojectsOf(active, p.id);
    const pr = projectProgress(tasks, p.id, subs.map((s) => s.id));
    const pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 0;
    const on = same(view, { kind: 'project', id: p.id });
    return (
      <SortableRow key={p.id} id={p.id} label={p.name} className={sub ? 'sub-row' : 'project-row'}>
        <button type="button" className={`project-card${sub ? ' sub' : ''}${on ? ' active' : ''}`} onClick={() => setView({ kind: 'project', id: p.id })} aria-current={on ? 'page' : undefined}>
          <span className="project-card-top">
            <span className="dot" style={{ background: p.color }} />
            <span className="project-card-name">{p.name}</span>
            <span className="project-card-count">{pr.done}/{pr.total}</span>
          </span>
          {!sub && <span className="bar"><span style={{ width: `${pct}%`, background: p.color }} /></span>}
        </button>
        {subs.length > 0 && (
          <SortableContext items={subs.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="sub-list">{subs.map((s) => card(s, true))}</div>
          </SortableContext>
        )}
      </SortableRow>
    );
  };

  return (
    <nav className="sidebar panel" aria-label="Menu główne">
      <div className="brand">
        <span className="brand-mark"><IconLogo /></span>
        <span className="brand-name">Plan</span>
      </div>

      <div className="nav-group">
        {nav({ kind: 'inbox' }, 'Skrzynka', <IconInbox />, counts.inbox)}
        {nav({ kind: 'today' }, 'Dziś', <IconToday />, counts.today)}
        {nav({ kind: 'upcoming' }, 'Nadchodzące', <IconUpcoming />)}
      </div>

      <div className="nav-group">
        <div className="nav-heading">
          <span>Projekty</span>
          <button type="button" className="icon-btn small" aria-label="Nowy projekt" onClick={() => setAdding(true)}>
            <IconPlus />
          </button>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={dragA11y}>
          <SortableContext items={tops.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="project-list">{tops.map((p) => card(p, false))}</div>
          </SortableContext>
        </DndContext>
        {adding ? (
          <input
            className="inline-input"
            autoFocus
            aria-label="Nazwa nowego projektu"
            placeholder="Nazwa projektu"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={addProject}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addProject();
              if (e.key === 'Escape') {
                setName('');
                setAdding(false);
              }
            }}
          />
        ) : projects.length === 0 ? (
          <button type="button" className="ghost-btn" onClick={() => setAdding(true)}>+ Nowy projekt</button>
        ) : null}
      </div>

      {labels.length > 0 && (
        <div className="nav-group">
          <div className="nav-heading"><span>Etykiety</span></div>
          <div className="label-cloud">
            {labels.map((l) => (
              <button key={l.id} type="button" className={`chip chip-btn${same(view, { kind: 'label', id: l.id }) ? ' active' : ''}`} onClick={() => setView({ kind: 'label', id: l.id })}>
                @{l.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sidebar-bottom">
        {hasData && backupOld && (
          <button type="button" className="backup-hint" onClick={() => setView({ kind: 'settings' })}>
            Zrób kopię zapasową danych
          </button>
        )}
        {nav({ kind: 'settings' }, 'Ustawienia', <IconSettings />)}
        <div className="segmented" role="group" aria-label="Motyw">
          <button type="button" aria-pressed={theme.resolved === 'light'} className={theme.resolved === 'light' ? 'on' : ''} onClick={() => theme.choose('light')}>
            <IconSun /> Jasny
          </button>
          <button type="button" aria-pressed={theme.resolved === 'dark'} className={theme.resolved === 'dark' ? 'on' : ''} onClick={() => theme.choose('dark')}>
            <IconMoon /> Ciemny
          </button>
        </div>
      </div>
    </nav>
  );
}

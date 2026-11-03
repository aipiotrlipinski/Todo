import { inboxTasks, todayTasks } from '../selectors';
import { useData, useUI } from '../store';
import type { View } from '../types';
import { IconInbox, IconProjects, IconToday, IconUpcoming } from './icons';

// Phone-only tab bar (like Todoist): Skrzynka, Dziś, Nadchodzące, Projekty.
export function BottomNav() {
  const { tasks } = useData();
  const { view, setView, today } = useUI();
  const t = todayTasks(tasks, today);
  const counts = { inbox: inboxTasks(tasks).length, today: t.today.length + t.overdue.length };
  const inMenu = ['browse', 'project', 'label', 'settings', 'review', 'goals', 'now'].includes(view.kind);

  const tab = (v: View, label: string, icon: JSX.Element, on: boolean, count?: number) => (
    <button type="button" className={`tab${on ? ' active' : ''}`} onClick={() => setView(v)} aria-current={on ? 'page' : undefined}>
      <span className="tab-icon">
        {icon}
        {count ? <span className="tab-badge">{count > 99 ? '99+' : count}</span> : null}
      </span>
      <span className="tab-label">{label}</span>
    </button>
  );

  return (
    <nav className="bottom-nav" aria-label="Nawigacja dolna">
      {tab({ kind: 'inbox' }, 'Skrzynka', <IconInbox />, view.kind === 'inbox', counts.inbox)}
      {tab({ kind: 'today' }, 'Dziś', <IconToday />, view.kind === 'today', counts.today)}
      {tab({ kind: 'upcoming' }, 'Nadchodzące', <IconUpcoming />, view.kind === 'upcoming')}
      {tab({ kind: 'browse' }, 'Projekty', <IconProjects />, inMenu)}
    </nav>
  );
}

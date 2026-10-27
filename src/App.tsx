import { useCallback, useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TaskEditor } from './components/TaskEditor';
import { toISO, useData, useNow, UIProvider } from './store';
import { useTheme } from './theme';
import type { View } from './types';
import { Inbox } from './views/Inbox';
import { LabelView } from './views/LabelView';
import { ProjectView } from './views/ProjectView';
import { Settings } from './views/Settings';
import { Today } from './views/Today';
import { Upcoming } from './views/Upcoming';

interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

const VIEW_KEY = 'plan.view';

function readView(): View {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
    if (v && typeof v.kind === 'string') return v;
  } catch {
    /* ignore */
  }
  return { kind: 'today' };
}

const typingIn = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export function App() {
  const theme = useTheme();
  const now = useNow();
  const { tasks } = useData();
  const [view, setViewState] = useState<View>(readView);
  const [editing, setEditing] = useState<string | null>(null);
  const [toastItem, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number>();
  const gPressed = useRef(0);

  const setView = useCallback((v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  }, []);

  const toast = useCallback((message: string, undo?: () => void) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, undo });
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  // Keyboard: Q = quick add, G then T/I/U = go to view
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typingIn(e.target) || editing) return;
      const k = e.key.toLowerCase();
      if (k === 'q') {
        e.preventDefault();
        document.getElementById('quick-add')?.focus();
        return;
      }
      if (k === 'g') {
        gPressed.current = Date.now();
        return;
      }
      if (Date.now() - gPressed.current < 1200) {
        const map: Record<string, View> = { t: { kind: 'today' }, i: { kind: 'inbox' }, u: { kind: 'upcoming' }, s: { kind: 'settings' } };
        if (map[k]) {
          e.preventDefault();
          setView(map[k]);
        }
        gPressed.current = 0;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, setView]);

  const editingTask = editing ? tasks.find((t) => t.id === editing) : undefined;

  return (
    <UIProvider value={{ view, setView, openTask: setEditing, toast, now, today: toISO(now) }}>
      <div className="app">
        <Sidebar theme={theme} />
        <main className="main" key={view.kind + ('id' in view ? view.id : '')}>
          {view.kind === 'today' && <Today />}
          {view.kind === 'inbox' && <Inbox />}
          {view.kind === 'upcoming' && <Upcoming />}
          {view.kind === 'project' && <ProjectView id={view.id} />}
          {view.kind === 'label' && <LabelView id={view.id} />}
          {view.kind === 'settings' && <Settings theme={theme} />}
        </main>
      </div>
      {editingTask && <TaskEditor key={editingTask.id} task={editingTask} />}
      {toastItem && (
        <div className="toast" role="status" key={toastItem.id}>
          <span>{toastItem.message}</span>
          {toastItem.undo && (
            <button
              type="button"
              onClick={() => {
                toastItem.undo?.();
                setToast(null);
              }}
            >
              Cofnij
            </button>
          )}
        </div>
      )}
    </UIProvider>
  );
}

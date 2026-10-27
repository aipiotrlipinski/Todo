import { useState } from 'react';
import { deleteLabel } from '../actions';
import { TaskList } from '../components/TaskItem';
import { isOpen, sortTasks } from '../selectors';
import { useData, useUI } from '../store';
import { Header } from './Header';

export function LabelView({ id }: { id: string }) {
  const { tasks, labelById } = useData();
  const { setView } = useUI();
  const [confirm, setConfirm] = useState(false);
  const label = labelById.get(id);
  if (!label) return <section className="panel tasks-panel"><p className="empty">Ta etykieta już nie istnieje.</p></section>;
  const list = tasks.filter((t) => isOpen(t) && t.labels.includes(id)).sort(sortTasks);
  return (
    <>
      <Header
        eyebrow="Etykieta"
        title={`@${label.name}`}
        actions={
          <button
            type="button"
            className={`danger-btn${confirm ? ' armed' : ''}`}
            onClick={async () => {
              if (!confirm) return setConfirm(true);
              await deleteLabel(id);
              setView({ kind: 'today' });
            }}
          >
            {confirm ? 'Kliknij, aby usunąć etykietę' : 'Usuń etykietę'}
          </button>
        }
      />
      <section className="panel tasks-panel" aria-label={`Zadania z etykietą ${label.name}`}>
        <h2 className="panel-title">Otwarte · {list.length}</h2>
        <TaskList tasks={list} empty="Brak otwartych zadań z tą etykietą." />
      </section>
    </>
  );
}

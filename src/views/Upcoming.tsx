import { TaskList } from '../components/TaskItem';
import { addDays, formatLong } from '../dates';
import { formatMinutes } from '../dates';
import { isOpen, sortTasks } from '../selectors';
import { useData, useUI } from '../store';
import { Header } from './Header';

const DAYS = 14;

export function Upcoming() {
  const { tasks } = useData();
  const { today } = useUI();
  const open = tasks.filter((t) => isOpen(t) && t.due);
  const last = addDays(today, DAYS - 1);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i + 1));
  const later = open.filter((t) => t.due! > last).sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : sortTasks(a, b)));

  return (
    <>
      <Header title="Nadchodzące" subtitle="Następne dwa tygodnie" defaults={{ due: addDays(today, 1) }} />
      <section className="panel tasks-panel" aria-label="Nadchodzące zadania">
        {days.map((d, i) => {
          const list = open.filter((t) => t.due === d).sort(sortTasks);
          const mins = list.reduce((s, t) => s + (t.estimate ?? 0), 0);
          if (!list.length && i >= 7) return null;
          return (
            <div key={d} className="day-group">
              <h2 className={`day-head${list.length ? '' : ' empty-day'}`}>
                <span>{i === 0 ? 'Jutro · ' : ''}{formatLong(d)}</span>
                {mins > 0 && <span className="muted small">{formatMinutes(mins)}</span>}
              </h2>
              <TaskList tasks={list} hideDue />
            </div>
          );
        })}
        {later.length > 0 && (
          <div className="day-group">
            <h2 className="day-head"><span>Później</span></h2>
            {later.map((t) => (
              <div key={t.id}>
                <TaskList tasks={[t]} />
              </div>
            ))}
          </div>
        )}
        {!open.some((t) => t.due! > today) && <p className="empty">Brak zaplanowanych zadań. Dodaj np. „Przegląd auta za 2 tygodnie”.</p>}
      </section>
    </>
  );
}


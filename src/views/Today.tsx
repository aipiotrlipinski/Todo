import { moveTasksToDate } from '../actions';
import { DayPlan } from '../components/DayPlan';
import { TaskList } from '../components/TaskItem';
import { formatLong } from '../dates';
import { todayTasks } from '../selectors';
import { useData, useUI } from '../store';
import { Header } from './Header';

export function Today() {
  const { tasks } = useData();
  const { today, toast } = useUI();
  const { overdue, today: list } = todayTasks(tasks, today);
  const doneToday = tasks.filter((t) => t.status === 'done' && t.completedAt && new Date(t.completedAt).toDateString() === new Date().toDateString());

  const moveAll = async () => {
    await moveTasksToDate(overdue.map((t) => t.id), today);
    toast(`Przeniesiono na dziś: ${overdue.length}`);
  };

  return (
    <>
      <Header eyebrow={formatLong(today)} title="Dziś" defaults={{ due: today }} />
      <div className="columns">
        <section className="panel tasks-panel" aria-label="Zadania na dziś">
          <h2 className="panel-title">Na dziś · {list.length}</h2>
          {overdue.length > 0 && (
            <div className="overdue">
              <div className="overdue-head">
                <span>Z poprzednich dni · {overdue.length}</span>
                <button type="button" className="link-btn warn" onClick={moveAll}>Przenieś wszystkie na dziś</button>
              </div>
              <TaskList tasks={overdue} />
            </div>
          )}
          <TaskList
            tasks={list}
            hideDue
            empty={overdue.length ? undefined : doneToday.length ? `Wszystko zrobione. Ukończone dziś: ${doneToday.length}.` : 'Nic na dziś. Dodaj zadanie powyżej albo zajrzyj do Nadchodzących.'}
          />
          {doneToday.length > 0 && list.length > 0 && <p className="muted small">Ukończone dziś: {doneToday.length}</p>}
        </section>
        <DayPlan date={today} tasks={[...list, ...doneToday.filter((t) => t.due === today)]} />
      </div>
    </>
  );
}

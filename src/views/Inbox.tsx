import { TaskTree } from '../components/TaskItem';
import { inboxTasks } from '../selectors';
import { useData } from '../store';
import { Header } from './Header';

export function Inbox() {
  const { tasks } = useData();
  const list = inboxTasks(tasks);
  return (
    <>
      <Header title="Skrzynka" subtitle="Zadania bez projektu. Przypisz je do projektu albo nadaj datę." defaults={{}} />
      <section className="panel tasks-panel" aria-label="Zadania w skrzynce">
        <h2 className="panel-title">Do uporządkowania · {list.length}</h2>
        <TaskTree tasks={list} all={tasks} empty="Skrzynka jest pusta." />
      </section>
    </>
  );
}

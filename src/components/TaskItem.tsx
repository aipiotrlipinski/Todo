import { restoreTasks, toggleDone } from '../actions';
import { formatDue, formatMinutes } from '../dates';
import { describeRecurrence } from '../recurrence';
import { childrenOf } from '../selectors';
import { useData, useUI } from '../store';
import type { Task } from '../types';
import { IconCheck, IconClock, IconRepeat, IconSubtasks } from './icons';

interface Props {
  task: Task;
  /** hide the date when the list is already about that day */
  hideDue?: boolean;
  /** hide project when the list is already inside the project */
  hideProject?: boolean;
  nested?: boolean;
}

export function TaskItem({ task, hideDue, hideProject, nested }: Props) {
  const { tasks, projectById, stageById, labelById } = useData();
  const { today, openTask, toast } = useUI();
  const done = task.status === 'done';
  const project = task.projectId ? projectById.get(task.projectId) : undefined;
  const stage = task.stageId ? stageById.get(task.stageId) : undefined;
  const parent = task.parentId ? tasks.find((t) => t.id === task.parentId) : undefined;
  const kids = childrenOf(tasks, task.id);
  const overdue = !done && task.due && task.due < today;

  const complete = async () => {
    const { snapshot, message } = await toggleDone(task, today);
    toast(`${message}: ${task.title}`, () => restoreTasks([snapshot]));
  };

  const meta: JSX.Element[] = [];
  if (parent && !nested) meta.push(<span key="parent">↳ {parent.title}</span>);
  if (project && !hideProject) meta.push(<span key="p" className="meta-project"><span className="dot" style={{ background: project.color }} />{project.name}{stage ? ` › ${stage.name}` : ''}</span>);
  if (task.due && (!hideDue || overdue)) meta.push(<span key="d" className={overdue ? 'meta-overdue' : ''}>{formatDue(task.due, today)}</span>);
  if (task.time) meta.push(<span key="t" className="meta-icon"><IconClock />{task.time}</span>);
  if (task.recurrence) meta.push(<span key="r" className="meta-icon"><IconRepeat />{describeRecurrence(task.recurrence)}</span>);
  if (kids.length) meta.push(<span key="k" className="meta-icon"><IconSubtasks />{kids.filter((k) => k.status === 'done').length}/{kids.length}</span>);
  task.labels.forEach((id) => {
    const l = labelById.get(id);
    if (l) meta.push(<span key={id} className="meta-label">@{l.name}</span>);
  });

  return (
    <div className={`task${done ? ' done' : ''}${nested ? ' nested' : ''}`}>
      <button
        type="button"
        className={`check prio-${task.priority}`}
        aria-label={done ? `Przywróć: ${task.title}` : `Oznacz jako zrobione: ${task.title}`}
        aria-pressed={done}
        onClick={complete}
      >
        <IconCheck />
      </button>
      <button type="button" className="task-body" onClick={() => openTask(task.id)}>
        <span className="task-title">{task.title}</span>
        {meta.length > 0 && <span className="task-meta">{meta}</span>}
      </button>
      {task.estimate ? <span className="est">{formatMinutes(task.estimate)}</span> : null}
    </div>
  );
}

export function TaskList({ tasks, empty, ...rest }: { tasks: Task[]; empty?: string } & Omit<Props, 'task'>) {
  if (!tasks.length) return empty ? <p className="empty">{empty}</p> : null;
  return (
    <div className="task-list">
      {tasks.map((t) => (
        <TaskItem key={t.id} task={t} {...rest} />
      ))}
    </div>
  );
}

/** Top-level tasks with their subtasks indented underneath. */
export function TaskTree({ tasks, all, empty, hideProject }: { tasks: Task[]; all: Task[]; empty?: string; hideProject?: boolean }) {
  if (!tasks.length) return empty ? <p className="empty">{empty}</p> : null;
  return (
    <div className="task-list">
      {tasks.map((t) => (
        <div key={t.id}>
          <TaskItem task={t} hideProject={hideProject} />
          {childrenOf(all, t.id)
            .filter((k) => k.status === 'open')
            .map((k) => (
              <TaskItem key={k.id} task={k} hideProject nested />
            ))}
        </div>
      ))}
    </div>
  );
}

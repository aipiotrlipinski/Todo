import { useState } from 'react';
import { TaskList } from '../components/TaskItem';
import { formatMinutes, minToTime, timeToMin } from '../dates';
import { fixedFor, minutesUntilBusy, TIMED_DEFAULT } from '../planner';
import { nowCandidates } from '../selectors';
import { planWindowFor, useData, useUI } from '../store';
import { Header } from './Header';

const LIMITS = [5, 15, 30, 60];

/** "Mam X minut": tasks that fit into the time until the next commitment. */
export function Now() {
  const { tasks, stages, labels, settings } = useData();
  const { today, now, openTask } = useUI();
  const [manual, setManual] = useState<number | null | 'auto'>('auto');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [showUnknown, setShowUnknown] = useState(false);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dayTasks = tasks.filter((t) => t.due === today);
  const win = planWindowFor(today, settings);
  const free = minutesUntilBusy({ date: today, window: win, fixed: settings.fixed, tasks: dayTasks, defaultEstimate: settings.defaultEstimate, fromMin: nowMin });

  // What comes next: a fixed point, a task with an hour, or the end of the planning window.
  let nextLabel = 'koniec dnia';
  if (free !== null) {
    const at = nowMin + free;
    const f = fixedFor(today, settings.fixed).find((x) => timeToMin(x.start) <= at && timeToMin(x.end) > at);
    const t = dayTasks.find((x) => x.status === 'open' && x.time && timeToMin(x.time) <= at && timeToMin(x.time) + (x.estimate ?? TIMED_DEFAULT) > at);
    nextLabel = f ? `${f.title} o ${f.start}` : t ? `${t.title} o ${t.time}` : `koniec planu o ${minToTime(at)}`;
  }
  const auto = free ?? 30;
  const limit = manual === 'auto' ? auto : manual;

  const stagesByProject = new Map<string, string[]>();
  for (const s of stages) stagesByProject.set(s.projectId, [...(stagesByProject.get(s.projectId) ?? []), s.id]);
  const { fits, unknown } = nowCandidates(tasks, { today, limit, labelIds, stagesByProject });
  const usedLabels = labels.filter((l) => tasks.some((t) => t.status === 'open' && t.labels.includes(l.id)));
  const top = fits[0];

  const eyebrow = free !== null
    ? `Masz ${formatMinutes(free)} · potem ${nextLabel}`
    : 'Teraz poza czasem do planowania (albo trwa stały punkt dnia)';

  return (
    <>
      <Header eyebrow={eyebrow} title="Teraz">
        <div className="now-controls">
          <div className="chips" role="group" aria-label="Ile masz czasu">
            <button type="button" className={`chip chip-btn${manual === 'auto' ? ' active' : ''}`} aria-pressed={manual === 'auto'} onClick={() => setManual('auto')}>
              {free !== null ? `Do ${nextLabel.split(' o ').pop()} (${formatMinutes(auto)})` : 'Auto (30 min)'}
            </button>
            {LIMITS.map((m) => (
              <button key={m} type="button" className={`chip chip-btn${manual === m ? ' active' : ''}`} aria-pressed={manual === m} onClick={() => setManual(m)}>
                {formatMinutes(m)}
              </button>
            ))}
            <button type="button" className={`chip chip-btn${manual === null ? ' active' : ''}`} aria-pressed={manual === null} onClick={() => setManual(null)}>Bez limitu</button>
          </div>
          {usedLabels.length > 0 && (
            <div className="chips" role="group" aria-label="Gdzie jesteś / czym dysponujesz">
              <span className="muted small now-ctx">Kontekst:</span>
              {usedLabels.map((l) => {
                const on = labelIds.includes(l.id);
                return (
                  <button key={l.id} type="button" className={`chip chip-btn${on ? ' active' : ''}`} aria-pressed={on}
                    onClick={() => setLabelIds(on ? labelIds.filter((x) => x !== l.id) : [...labelIds, l.id])}>
                    @{l.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Header>

      <section className="panel tasks-panel" aria-label="Zadania na teraz">
        {top && (
          <button type="button" className="now-top" onClick={() => openTask(top.id)}>
            <span className="muted small">Zacznij od</span>
            <span className="now-top-title">{top.title}</span>
            <span className="small">{formatMinutes(top.estimate!)}{limit ? ` z ${formatMinutes(limit)}` : ''}</span>
          </button>
        )}
        <h2 className="panel-title">Mieści się{limit !== null ? ` w ${formatMinutes(limit)}` : ''} · {fits.length}</h2>
        <TaskList tasks={fits.slice(top ? 1 : 0, 30)} empty={top ? undefined : 'Nic z szacowanym czasem się nie mieści. Wybierz dłuższy czas albo dodaj szacunki zadaniom poniżej.'} />
        {unknown.length > 0 && (
          <>
            <button type="button" className="link-btn now-unknown" onClick={() => setShowUnknown((v) => !v)} aria-expanded={showUnknown}>
              {showUnknown ? 'Ukryj' : 'Pokaż'} zadania bez szacowanego czasu ({unknown.length})
            </button>
            {showUnknown && (
              <>
                <p className="muted small">Kliknij zadanie i wybierz czas (5 min, 15 min…) — wtedy „Teraz” będzie wiedziało, czy się zmieści.</p>
                <TaskList tasks={unknown.slice(0, 30)} />
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}

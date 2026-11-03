import { useState } from 'react';
import { createRoutine, deleteRoutine, restoreRoutine, toggleRoutine, updateRoutine } from '../actions';
import { IconCheck, IconTrash } from '../components/icons';
import { addDays, formatLong, weekdayIndex, WEEKDAYS_SHORT } from '../dates';
import { appliesOn, checkId, describeDays, PARTS, rate, streak } from '../routines';
import { useData, useUI } from '../store';
import type { Routine } from '../types';
import { Header } from './Header';

const dayWord = (n: number) => (n === 1 ? 'dzień' : 'dni');

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (w: number[]) => void }) {
  return (
    <div className="weekday-picker" role="group" aria-label="Dni tygodnia (nic nie zaznaczone = codziennie)">
      {WEEKDAYS_SHORT.map((d, i) => {
        const on = value.includes(i);
        return (
          <button key={d} type="button" className={on ? 'on' : ''} aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== i) : [...value, i].sort())}>
            {d}
          </button>
        );
      })}
    </div>
  );
}

export function Routines() {
  const { routines, routineDone } = useData();
  const { today, toast } = useUI();
  const [day, setDay] = useState(today);
  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [part, setPart] = useState<Routine['part']>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const active = routines.filter((r) => r.status === 'active');
  const forDay = active.filter((r) => appliesOn(r, day));
  const notToday = active.filter((r) => !appliesOn(r, day));
  const doneCount = forDay.filter((r) => routineDone.has(checkId(r.id, day))).length;
  const pct = forDay.length ? Math.round((doneCount / forDay.length) * 100) : 0;
  const isToday = day === today;

  const add = async () => {
    if (!name.trim()) return;
    await createRoutine(name, days, part);
    setName('');
  };

  const tick = async (r: Routine) => {
    const on = await toggleRoutine(r.id, day);
    if (on && doneCount + 1 === forDay.length) toast(isToday ? 'Wszystkie rutyny na dziś zrobione!' : 'Wszystkie rutyny z tego dnia zrobione');
  };

  const remove = async (r: Routine) => {
    const snap = await deleteRoutine(r.id);
    setEditing(null);
    toast(`Usunięto rutynę: ${r.name}`, () => restoreRoutine(snap));
  };

  const groups = PARTS.map((p) => ({ ...p, items: forDay.filter((r) => r.part === p.value) })).filter((g) => g.items.length);

  return (
    <>
      <Header
        eyebrow="Codziennie"
        title="Rutyny"
        subtitle={forDay.length ? `${doneCount} z ${forDay.length} zrobione${isToday ? ' dziś' : ''}` : 'Stałe nawyki do odhaczenia każdego dnia.'}
        actions={
          <div className="day-switch" role="group" aria-label="Dzień">
            <button type="button" className="icon-btn" aria-label="Poprzedni dzień" onClick={() => setDay(addDays(day, -1))}>‹</button>
            <button type="button" className="secondary-btn" onClick={() => setDay(today)} disabled={isToday}>
              {isToday ? 'Dziś' : day === addDays(today, -1) ? 'Wczoraj' : formatLong(day)}
            </button>
            <button type="button" className="icon-btn" aria-label="Następny dzień" onClick={() => setDay(addDays(day, 1))} disabled={isToday}>›</button>
          </div>
        }
      >
        {forDay.length > 0 && (
          <div className="bar thick routine-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Postęp rutyn">
            <span style={{ width: `${pct}%` }} className={pct === 100 ? 'full' : ''} />
          </div>
        )}
      </Header>

      <section className="panel tasks-panel routines" aria-label="Lista rutyn">
        {active.length === 0 && (
          <p className="empty">Dodaj rzeczy, które chcesz robić regularnie, np. „Siłownia” (pon, śr, pt), „30 min nauki AI”, „Czytanie przed snem”, „Szklanka wody rano”.</p>
        )}
        {active.length > 0 && forDay.length === 0 && <p className="empty">Na ten dzień nie ma żadnej rutyny.</p>}

        {groups.map((g) => (
          <div key={String(g.value)} className="routine-group">
            {groups.length > 1 && <h2 className="stage-head"><span>{g.label}</span></h2>}
            <div className="task-list">
              {g.items.map((r) =>
                editing === r.id ? (
                  <RoutineEditor key={r.id} r={r} onClose={() => setEditing(null)} onDelete={() => remove(r)} />
                ) : (
                  <RoutineRow key={r.id} r={r} day={day} onTick={() => tick(r)} onEdit={() => setEditing(r.id)} />
                ),
              )}
            </div>
          </div>
        ))}

        {notToday.length > 0 && (
          <details className="routine-other">
            <summary className="muted small">Nie w ten dzień ({notToday.length})</summary>
            <div className="task-list">
              {notToday.map((r) =>
                editing === r.id ? (
                  <RoutineEditor key={r.id} r={r} onClose={() => setEditing(null)} onDelete={() => remove(r)} />
                ) : (
                  <button key={r.id} type="button" className="task routine-off" onClick={() => setEditing(r.id)}>
                    <span className="task-title">{r.name}</span>
                    <span className="small muted">{describeDays(r.weekdays)}</span>
                  </button>
                ),
              )}
            </div>
          </details>
        )}

        <div className="routine-add">
          <div className="add-stage">
            <input className="inline-input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder={active.length ? 'Dodaj kolejną rutynę' : 'Nazwa rutyny, np. Siłownia'} aria-label="Nazwa nowej rutyny" />
            <button type="button" className="secondary-btn" onClick={add} disabled={!name.trim()}>Dodaj rutynę</button>
          </div>
          {name.trim() && (
            <div className="routine-add-opts">
              <WeekdayPicker value={days} onChange={setDays} />
              <select className="triage-select" value={String(part)} aria-label="Pora dnia" onChange={(e) => setPart(e.target.value === 'null' ? null : (e.target.value as Routine['part']))}>
                {PARTS.map((p) => <option key={String(p.value)} value={String(p.value)}>{p.label}</option>)}
              </select>
              <span className="muted small">{describeDays(days)}</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function RoutineRow({ r, day, onTick, onEdit }: { r: Routine; day: string; onTick: () => void; onEdit: () => void }) {
  const { routineDone } = useData();
  const { today } = useUI();
  const done = routineDone.has(checkId(r.id, day));
  const s = streak(r, routineDone, today);
  const m = rate(r, routineDone, today, 30);
  // last 7 days ending on the shown day
  const last = Array.from({ length: 7 }, (_, i) => addDays(day, i - 6));

  return (
    <div className={`task routine${done ? ' done' : ''}`}>
      <button type="button" className="check routine-check" aria-pressed={done} aria-label={done ? `Odznacz: ${r.name}` : `Zrobione: ${r.name}`} onClick={onTick}>
        <IconCheck />
      </button>
      <button type="button" className="task-body" onClick={onEdit} title="Kliknij, aby edytować">
        <span className="task-title">{r.name}</span>
        <span className="task-meta">
          <span>{describeDays(r.weekdays)}</span>
          {s > 0 && <span className="streak">seria {s} {dayWord(s)}</span>}
          {m.total >= 3 && <span>{Math.round((m.done / m.total) * 100)}% z 30 dni</span>}
        </span>
      </button>
      <span className="routine-week" aria-label="Ostatnie 7 dni">
        {last.map((d) => {
          const applies = appliesOn(r, d);
          const ok = routineDone.has(checkId(r.id, d));
          return (
            <span key={d} className={`rd${ok ? ' ok' : applies ? (d < today ? ' miss' : '') : ' off'}`} title={`${WEEKDAYS_SHORT[weekdayIndex(d)]} ${d.slice(8)}.${d.slice(5, 7)}: ${ok ? 'zrobione' : applies ? 'nie' : 'nie dotyczy'}`}>
              {WEEKDAYS_SHORT[weekdayIndex(d)].slice(0, 1).toUpperCase()}
            </span>
          );
        })}
      </span>
    </div>
  );
}

function RoutineEditor({ r, onClose, onDelete }: { r: Routine; onClose: () => void; onDelete: () => void }) {
  const [name, setName] = useState(r.name);
  const save = async (changes: Partial<Routine>) => updateRoutine(r.id, changes);
  return (
    <div className="routine-editor">
      <input className="inline-input" autoFocus value={name} aria-label="Nazwa rutyny" onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== r.name && save({ name: name.trim() })}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && (name.trim() && save({ name: name.trim() }), onClose())} />
      <WeekdayPicker value={r.weekdays} onChange={(w) => save({ weekdays: w })} />
      <div className="routine-editor-row">
        <select className="triage-select" value={String(r.part)} aria-label="Pora dnia" onChange={(e) => save({ part: e.target.value === 'null' ? null : (e.target.value as Routine['part']) })}>
          {PARTS.map((p) => <option key={String(p.value)} value={String(p.value)}>{p.label}</option>)}
        </select>
        <span className="muted small">{describeDays(r.weekdays)}</span>
        <span className="spacer" />
        <button type="button" className="danger-btn" onClick={onDelete}><IconTrash /> Usuń</button>
        <button type="button" className="primary-btn" onClick={onClose}>Gotowe</button>
      </div>
    </div>
  );
}

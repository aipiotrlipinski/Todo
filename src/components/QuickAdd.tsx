import { useMemo, useRef, useState, type ReactNode } from 'react';
import { createTaskFromParsed, type TaskDefaults } from '../actions';
import { formatDue, formatMinutes } from '../dates';
import { parseQuickAdd, type Token } from '../parser';
import { describeRecurrence } from '../recurrence';
import { useData, useUI } from '../store';

interface Props {
  defaults?: TaskDefaults;
  placeholder?: string;
  /** id lets the Q shortcut focus the main quick-add field */
  id?: string;
  compact?: boolean;
  label?: string;
}

const KIND_CLASS: Record<Token['kind'], string> = {
  date: 'tk-date',
  time: 'tk-date',
  recurrence: 'tk-date',
  project: 'tk-project',
  stage: 'tk-project',
  label: 'tk-label',
  priority: 'tk-priority',
  estimate: 'tk-neutral',
};

export function QuickAdd({ defaults = {}, placeholder, id, compact, label = 'Szybkie dodawanie' }: Props) {
  const { projects, stages, labels, projectById, stageById } = useData();
  const { today, toast } = useUI();
  const [text, setText] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(
    () => parseQuickAdd(text, { today, projects, stages, labels, defaultProjectId: defaults.projectId ?? null }),
    [text, today, projects, stages, labels, defaults.projectId],
  );

  // Text shown behind the input with recognised parts highlighted.
  const mirror = useMemo(() => {
    const parts: ReactNode[] = [];
    let pos = 0;
    parsed.tokens.forEach((t, i) => {
      if (t.start > pos) parts.push(text.slice(pos, t.start));
      parts.push(<mark key={i} className={KIND_CLASS[t.kind]}>{text.slice(t.start, t.end)}</mark>);
      pos = t.end;
    });
    parts.push(text.slice(pos) + ' ');
    return parts;
  }, [parsed, text]);

  const chips: { text: string; cls: string }[] = [];
  const due = parsed.due ?? (text.trim() ? defaults.due ?? null : null);
  if (due) chips.push({ text: formatDue(due, today) + (parsed.time ? ` ${parsed.time}` : ''), cls: 'chip-accent' });
  if (parsed.recurrence) chips.push({ text: describeRecurrence(parsed.recurrence), cls: 'chip-accent' });
  if (parsed.project) chips.push({ text: `#${parsed.project.name}${parsed.project.id ? '' : ' (nowy)'}`, cls: 'chip-green' });
  else if (defaults.projectId && text.trim()) chips.push({ text: `#${projectById.get(defaults.projectId)?.name ?? ''}`, cls: 'chip-green' });
  if (parsed.stage) chips.push({ text: `/${parsed.stage.name}${parsed.stage.id ? '' : ' (nowy)'}`, cls: 'chip-green' });
  else if (!parsed.project && defaults.stageId && text.trim()) chips.push({ text: `/${stageById.get(defaults.stageId)?.name ?? ''}`, cls: 'chip-green' });
  parsed.labels.forEach((l) => chips.push({ text: `@${l.name}${l.id ? '' : ' (nowa)'}`, cls: 'chip' }));
  if (parsed.priority && parsed.priority < 4) chips.push({ text: `Priorytet ${parsed.priority}`, cls: `chip prio-chip-${parsed.priority}` });
  if (parsed.estimate) chips.push({ text: `~${formatMinutes(parsed.estimate)}`, cls: 'chip' });

  const submit = async () => {
    if (!parsed.title) return;
    const t = await createTaskFromParsed(parsed, defaults);
    setText('');
    toast(`Dodano: ${t.title}`);
  };

  const syncScroll = () => {
    if (mirrorRef.current && inputRef.current) mirrorRef.current.scrollLeft = inputRef.current.scrollLeft;
  };

  return (
    <div className={`quick-add${compact ? ' compact' : ''}`}>
      {!compact && (
        <div className="quick-add-head">
          <label htmlFor={id}>{label}{id === 'quick-add' ? ' · Q' : ''}</label>
          <button type="button" className="link-btn" onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp}>
            {showHelp ? 'Ukryj podpowiedzi' : 'Jak to działa?'}
          </button>
        </div>
      )}
      <div className="qa-field">
        <div className="qa-mirror" ref={mirrorRef} aria-hidden="true">{mirror}</div>
        <input
          id={id}
          ref={inputRef}
          type="text"
          className="qa-input"
          aria-label={compact ? label : undefined}
          value={text}
          placeholder={placeholder ?? 'Np. Raport dostaw jutro 14:00 #Magazyn @praca !1 ~30m'}
          onChange={(e) => {
            setText(e.target.value);
            requestAnimationFrame(syncScroll);
          }}
          onScroll={syncScroll}
          onKeyUp={syncScroll}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') {
              setText('');
              inputRef.current?.blur();
            }
          }}
          autoComplete="off"
          spellCheck={false}
        />
        {text.trim() && (
          <button type="button" className="qa-submit" onClick={submit} disabled={!parsed.title}>
            Dodaj
          </button>
        )}
      </div>
      {chips.length > 0 && (
        <div className="chips" aria-live="polite">
          {chips.map((c, i) => (
            <span key={i} className={`chip ${c.cls}`}>{c.text}</span>
          ))}
        </div>
      )}
      {showHelp && !compact && (
        <div className="qa-help">
          <div><code>jutro</code> <code>pojutrze</code> <code>w piątek</code> <code>za 3 dni</code> <code>12.11</code> <code>12 listopada</code> — data</div>
          <div><code>14:00</code> <code>o 9</code> — godzina</div>
          <div><code>codziennie</code> <code>co pon</code> <code>co pon i czw</code> <code>co miesiąc</code> <code>w dni robocze</code> — powtarzanie</div>
          <div><code>#Projekt</code> <code>/Etap</code> <code>@etykieta</code> — miejsce i etykiety (nowe utworzą się same; nazwę z kilku słów wpisz w cudzysłowie: <code>#"Nowy projekt"</code>)</div>
          <div><code>!1</code>–<code>!4</code> — priorytet · <code>~30m</code> <code>~1h30m</code> — szacowany czas</div>
        </div>
      )}
    </div>
  );
}

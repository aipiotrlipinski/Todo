import { useEffect, useRef, useState } from 'react';
import { addAiTasks, deleteTask } from '../actions';
import { breakdownRequest, callClaude, captureRequest, parseBreakdown, parseCapture, type AiStage, type AiTask } from '../ai';
import { formatDue, formatMinutes } from '../dates';
import { useData, useUI } from '../store';
import { IconClose, IconSpark } from './icons';

export type AssistantMode = { mode: 'capture' } | { mode: 'breakdown'; projectId: string };

// Web Speech API (Chrome/Edge). Not in every WebView, so the mic button only shows when available.
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start(): void; stop(): void;
};
const SpeechRec: (new () => Recognition) | undefined =
  typeof window !== 'undefined' ? ((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as never : undefined;

interface Proposal extends AiTask {
  key: number;
  on: boolean;
  stageName?: string;
}

export function Assistant({ opts, onClose }: { opts: AssistantMode; onClose: () => void }) {
  const { projects, stages, labels, tasks, settings, projectById } = useData();
  const { today, toast, setView } = useUI();
  const project = opts.mode === 'breakdown' ? projectById.get(opts.projectId) : undefined;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<Proposal[] | null>(null);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    area.current?.focus();
    return () => rec.current?.stop();
  }, []);

  const toggleMic = () => {
    if (!SpeechRec) return;
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = new SpeechRec();
    r.lang = 'pl-PL';
    r.continuous = true;
    r.interimResults = false;
    const before = text.trim();
    let heard = '';
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) heard += ' ' + e.results[i][0].transcript;
      setText((before + heard).trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };

  const run = async () => {
    rec.current?.stop();
    setError('');
    setBusy(true);
    try {
      if (opts.mode === 'capture') {
        if (!text.trim()) return;
        const res = await callClaude(settings.aiKey, captureRequest(text, { today, projects, stages, labelNames: labels.map((l) => l.name) }, settings.aiModel));
        const list = parseCapture(res, today);
        if (!list.length) setError('Asystent nie znalazł w tekście żadnego zadania. Napisz trochę konkretniej.');
        setItems(list.map((t, i) => ({ ...t, key: i, on: true })));
      } else if (project) {
        const mine = tasks.filter((t) => t.projectId === project.id);
        const res = await callClaude(settings.aiKey, breakdownRequest(project, stages.filter((s) => s.projectId === project.id), mine, text, today, settings.aiModel));
        const plan: AiStage[] = parseBreakdown(res, today);
        if (!plan.length) setError('Nie udało się rozpisać projektu. Dopisz kilka słów o tym, co ma być efektem.');
        let k = 0;
        setItems(plan.flatMap((s) => s.tasks.map((t) => ({ ...t, stage: s.name, stageName: s.name, key: k++, on: true }))));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Coś poszło nie tak.');
    } finally {
      setBusy(false);
    }
  };

  const chosen = items?.filter((i) => i.on) ?? [];
  const save = async () => {
    const created = await addAiTasks(chosen, opts.mode === 'breakdown' ? { projectId: opts.projectId, createStages: true } : {});
    onClose();
    toast(`Asystent dodał zadania: ${created.length}`, async () => {
      for (const t of created) await deleteTask(t.id);
    });
  };
  const edit = (key: number, ch: Partial<Proposal>) => setItems((list) => list!.map((i) => (i.key === key ? { ...i, ...ch } : i)));

  const noKey = !settings.aiKey.trim();
  const groups = items ? [...new Set(items.map((i) => i.stageName ?? ''))] : [];

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()} onKeyDown={(e) => e.key === 'Escape' && !busy && onClose()}>
      <div className="dialog panel assistant" role="dialog" aria-modal="true" aria-labelledby="ai-title">
        <div className="dialog-head">
          <h2 id="ai-title" className="dialog-title"><IconSpark /> {opts.mode === 'capture' ? 'Asystent' : `Rozpisz projekt: ${project?.name ?? ''}`}</h2>
          <button type="button" className="icon-btn" aria-label="Zamknij" onClick={onClose} disabled={busy}><IconClose /></button>
        </div>

        {noKey ? (
          <div className="confirm-box">
            <p>Asystent korzysta z Claude. Wklej swój klucz API w Ustawieniach — zostaje tylko na tym urządzeniu.</p>
            <div className="button-row">
              <button type="button" className="primary-btn" onClick={() => { onClose(); setView({ kind: 'settings' }); }}>Przejdź do Ustawień</button>
            </div>
          </div>
        ) : items === null ? (
          <>
            <p className="muted small">
              {opts.mode === 'capture'
                ? 'Napisz albo podyktuj wszystko, co masz w głowie, jednym ciągiem. Asystent zamieni to w zadania z datami, czasem i projektem — przed dodaniem wszystko sprawdzisz.'
                : 'Asystent zaproponuje etapy i konkretne kroki z szacowanym czasem. Możesz dopisać, co już wiesz o projekcie.'}
            </p>
            <div className="ai-input">
              <textarea ref={area} rows={opts.mode === 'capture' ? 5 : 3} value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && run()}
                placeholder={opts.mode === 'capture'
                  ? 'Np. w piątek ogarnąć przegląd auta, jutro rano zadzwonić do dostawcy w sprawie palet, do niedzieli wymyślić prezent na urodziny'
                  : 'Np. budżet do 5 tys., chcę skończyć do marca, najtrudniejsze jest…'}
                aria-label={opts.mode === 'capture' ? 'Co masz w głowie?' : 'Dodatkowe informacje o projekcie'} />
              {SpeechRec && (
                <button type="button" className={`mic${listening ? ' on' : ''}`} onClick={toggleMic} aria-pressed={listening} aria-label={listening ? 'Zatrzymaj dyktowanie' : 'Dyktuj'}>
                  {listening ? '■' : '🎤'}
                </button>
              )}
            </div>
            {listening && <p className="small listening">Słucham… mów swobodnie, kliknij ■ gdy skończysz.</p>}
            {!SpeechRec && opts.mode === 'capture' && <p className="muted small">Na telefonie dyktuj mikrofonem na klawiaturze.</p>}
            {error && <p className="error">{error}</p>}
            <div className="dialog-actions">
              <span className="spacer" />
              <button type="button" className="primary-btn" onClick={run} disabled={busy || (opts.mode === 'capture' && !text.trim())}>
                {busy ? 'Myślę…' : opts.mode === 'capture' ? 'Zamień w zadania' : 'Rozpisz projekt'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted small">Odznacz, czego nie chcesz. Tytuł możesz poprawić od razu.</p>
            <div className="proposals">
              {groups.map((g) => (
                <div key={g} className="proposal-group">
                  {g && <h3 className="stage-head"><span>{g}{stages.some((s) => s.projectId === project?.id && s.name.toLowerCase() === g.toLowerCase()) ? '' : ' · nowy etap'}</span></h3>}
                  {items.filter((i) => (i.stageName ?? '') === g).map((i) => (
                    <div key={i.key} className={`proposal${i.on ? '' : ' off'}`}>
                      <input type="checkbox" checked={i.on} onChange={(e) => edit(i.key, { on: e.target.checked })} aria-label={`Dodaj: ${i.title}`} />
                      <div className="proposal-body">
                        <input className="proposal-title" value={i.title} onChange={(e) => edit(i.key, { title: e.target.value })} aria-label="Tytuł" />
                        <span className="task-meta">
                          {i.due && <span>{formatDue(i.due, today)}{i.time ? ` ${i.time}` : ''}</span>}
                          {i.estimate && <span>{formatMinutes(i.estimate)}</span>}
                          {i.priority < 4 && <span className={`prio-chip-${i.priority}`}>P{i.priority}</span>}
                          {opts.mode === 'capture' && <span>{projects.some((p) => p.name.toLowerCase() === i.project?.toLowerCase()) ? `#${i.project}` : 'Skrzynka'}</span>}
                          {i.labels.map((l) => <span key={l}>@{l}</span>)}
                          {i.subtasks.length > 0 && <span title={i.subtasks.join('\n')}>{i.subtasks.length} kroków</span>}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {error && <p className="error">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="secondary-btn" onClick={() => setItems(null)}>Popraw opis</button>
              <span className="spacer" />
              <button type="button" className="primary-btn" onClick={save} disabled={!chosen.length || chosen.some((c) => !c.title.trim())}>
                Dodaj ({chosen.length})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

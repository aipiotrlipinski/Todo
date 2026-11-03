import { useRef, useState } from 'react';
import { exportAll, importAll, setSetting } from '../actions';
import { daysBetween, formatLong, WEEKDAYS, WEEKDAYS_SHORT } from '../dates';
import { newId } from '../db';
import type { FixedBlock } from '../planner';
import { AI_MODELS } from '../ai';
import { useData, useUI, type PlanWindow } from '../store';
import type { ThemePref } from '../theme';
import { Header } from './Header';
import { TodoistImport } from './TodoistImport';

export function Settings({ theme }: { theme: { pref: ThemePref; choose: (p: ThemePref) => void } }) {
  const { settings, tasks } = useData();
  const { today, toast } = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<unknown>(null);
  const [error, setError] = useState('');

  const saveWindow = (key: 'weekday' | 'weekend', part: keyof PlanWindow, value: string) => {
    if (!value) return;
    setSetting(key, { ...settings[key], [part]: value });
  };

  const doExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `plan-kopia-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    await setSetting('lastExport', new Date().toISOString());
    toast('Zapisano kopię zapasową');
  };

  const onFile = async (f: File | undefined) => {
    setError('');
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data?.app !== 'plan') throw new Error();
      setPending(data);
    } catch {
      setError('Nie udało się odczytać pliku. Wybierz plik kopii zapisany przez tę aplikację.');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const confirmImport = async () => {
    try {
      await importAll(pending);
      setPending(null);
      toast('Przywrócono dane z kopii');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import się nie udał.');
    }
  };

  const last = settings.lastExport;
  const pendingCount = Array.isArray((pending as { tasks?: unknown[] })?.tasks) ? (pending as { tasks: unknown[] }).tasks.length : 0;

  return (
    <>
      <Header title="Ustawienia" />
      <section className="panel tasks-panel settings">
        <div className="settings-group">
          <h2 className="panel-title">Wolny czas do planowania</h2>
          <p className="muted small">Te godziny wyznaczają oś dnia i liczbę wolnych minut w planie.</p>
          {(['weekday', 'weekend'] as const).map((k) => (
            <div key={k} className="field-row">
              <span className="field-label">{k === 'weekday' ? 'Dni robocze' : 'Weekend'}</span>
              <label className="field">
                <span>Od</span>
                <input type="time" value={settings[k].start} onChange={(e) => saveWindow(k, 'start', e.target.value)} />
              </label>
              <label className="field">
                <span>Do</span>
                <input type="time" value={settings[k].end} onChange={(e) => saveWindow(k, 'end', e.target.value)} />
              </label>
            </div>
          ))}
        </div>

        <FixedBlocks list={settings.fixed} />

        <div className="settings-group">
          <h2 className="panel-title">Szacowanie i przegląd</h2>
          <div className="field-row">
            <label className="field">
              <span>Zadanie bez szacunku liczę jako (min)</span>
              <input type="number" min={5} step={5} value={settings.defaultEstimate}
                onChange={(e) => Number(e.target.value) > 0 && setSetting('defaultEstimate', Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Przypomnienie o przeglądzie dnia od</span>
              <input type="time" value={settings.reviewTime} onChange={(e) => e.target.value && setSetting('reviewTime', e.target.value)} />
            </label>
            <label className="field">
              <span>Przegląd tygodnia w</span>
              <select value={settings.weeklyReviewDay} onChange={(e) => setSetting('weeklyReviewDay', Number(e.target.value))}>
                {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="settings-group">
          <h2 className="panel-title">Motyw</h2>
          <div className="segmented wide" role="group" aria-label="Motyw">
            {([['system', 'Jak w systemie'], ['light', 'Jasny'], ['dark', 'Ciemny']] as const).map(([v, l]) => (
              <button key={v} type="button" className={theme.pref === v ? 'on' : ''} aria-pressed={theme.pref === v} onClick={() => theme.choose(v)}>{l}</button>
            ))}
          </div>
        </div>

        <AiSettings />

        <TodoistImport />

        <div className="settings-group">
          <h2 className="panel-title">Kopia zapasowa</h2>
          <p className="muted small">
            Dane są zapisane tylko w tej przeglądarce na tym komputerze. Wyczyszczenie danych przeglądarki je usunie, dlatego rób kopię co tydzień.
          </p>
          <p className="small">
            {last ? `Ostatnia kopia: ${formatLong(last.slice(0, 10))} (${daysBetween(last.slice(0, 10), today)} dni temu)` : 'Nie zrobiono jeszcze kopii.'} · Zadań w bazie: {tasks.length}
          </p>
          <div className="button-row">
            <button type="button" className="primary-btn" onClick={doExport}>Pobierz kopię (JSON)</button>
            <button type="button" className="secondary-btn" onClick={() => fileRef.current?.click()}>Przywróć z kopii…</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          {pending !== null && (
            <div className="confirm-box">
              <p>Przywrócenie zastąpi wszystkie obecne dane danymi z kopii ({pendingCount} zadań). Tego nie da się cofnąć.</p>
              <div className="button-row">
                <button type="button" className="danger-btn armed" onClick={confirmImport}>Zastąp dane</button>
                <button type="button" className="secondary-btn" onClick={() => setPending(null)}>Anuluj</button>
              </div>
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </div>

        <div className="settings-group">
          <h2 className="panel-title">Skróty klawiszowe</h2>
          <ul className="shortcuts">
            <li><kbd>Q</kbd> szybkie dodawanie · <kbd>A</kbd> asystent AI</li>
            <li><kbd>G</kbd> <kbd>T</kbd> Dziś · <kbd>G</kbd> <kbd>I</kbd> Skrzynka · <kbd>G</kbd> <kbd>U</kbd> Nadchodzące</li>
            <li><kbd>G</kbd> <kbd>N</kbd> Teraz · <kbd>G</kbd> <kbd>C</kbd> Cele · <kbd>G</kbd> <kbd>R</kbd> przegląd dnia</li>
            <li><kbd>Esc</kbd> zamknij okno · <kbd>Ctrl</kbd> + <kbd>Enter</kbd> zapisz zadanie</li>
          </ul>
        </div>
      </section>
    </>
  );
}

/** Recurring fixed points of the day: they are cut out of the free time. */
function FixedBlocks({ list }: { list: FixedBlock[] }) {
  const save = (next: FixedBlock[]) => setSetting('fixed', next);
  const change = (id: string, ch: Partial<FixedBlock>) => save(list.map((f) => (f.id === id ? { ...f, ...ch } : f)));
  const toggleDay = (f: FixedBlock, i: number) => {
    const days = f.days.includes(i) ? f.days.filter((d) => d !== i) : [...f.days, i].sort();
    if (days.length) change(f.id, { days });
  };
  const add = () => save([...list, { id: newId(), title: '', days: [0, 1, 2, 3, 4], start: '17:00', end: '18:00' }]);

  return (
    <div className="settings-group">
      <h2 className="panel-title">Stałe punkty dnia</h2>
      <p className="muted small">
        Siłownia, odbiór dziecka, kolacja — wszystko, co zawsze zajmuje czas. Plan dnia odejmuje je od wolnego czasu i nie układa na nich zadań.
      </p>
      {list.map((f) => (
        <div key={f.id} className="fixed-row">
          <input className="inline-input" value={f.title} placeholder="Nazwa, np. Siłownia" aria-label="Nazwa stałego punktu"
            onChange={(e) => change(f.id, { title: e.target.value })} />
          <div className="weekday-picker" role="group" aria-label="Dni tygodnia">
            {WEEKDAYS_SHORT.map((d, i) => (
              <button key={d} type="button" className={f.days.includes(i) ? 'on' : ''} aria-pressed={f.days.includes(i)} aria-label={WEEKDAYS[i]} onClick={() => toggleDay(f, i)}>{d}</button>
            ))}
          </div>
          <input type="time" value={f.start} aria-label="Od" onChange={(e) => e.target.value && change(f.id, { start: e.target.value })} />
          <span className="muted">–</span>
          <input type="time" value={f.end} aria-label="Do" onChange={(e) => e.target.value && change(f.id, { end: e.target.value })} />
          <button type="button" className="icon-btn small" aria-label={`Usuń ${f.title || 'stały punkt'}`} onClick={() => save(list.filter((x) => x.id !== f.id))}>×</button>
        </div>
      ))}
      <button type="button" className="secondary-btn" onClick={add}>+ Dodaj stały punkt</button>
    </div>
  );
}

function AiSettings() {
  const { settings } = useData();
  const [key, setKey] = useState(settings.aiKey);
  const [show, setShow] = useState(false);
  return (
    <div className="settings-group">
      <h2 className="panel-title">Asystent AI</h2>
      <p className="muted small">
        Asystent zamienia opis lub dyktowanie w zadania i rozpisuje projekty na kroki. Działa na Twoim kluczu API z console.anthropic.com
        (płacisz za użycie, zwykle grosze miesięcznie). Klucz zostaje tylko na tym urządzeniu i nie trafia do kopii zapasowej.
      </p>
      <div className="field-row">
        <label className="field">
          <span>Klucz API</span>
          <input type={show ? 'text' : 'password'} value={key} placeholder="sk-ant-…" autoComplete="off" spellCheck={false}
            onChange={(e) => setKey(e.target.value)} onBlur={() => key !== settings.aiKey && setSetting('aiKey', key.trim())} />
        </label>
        <label className="field">
          <span>Model</span>
          <select value={settings.aiModel} onChange={(e) => setSetting('aiModel', e.target.value)}>
            {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
      </div>
      <div className="button-row">
        <button type="button" className="link-btn" onClick={() => setShow((v) => !v)}>{show ? 'Ukryj klucz' : 'Pokaż klucz'}</button>
        {settings.aiKey && <button type="button" className="link-btn warn" onClick={() => { setKey(''); setSetting('aiKey', ''); }}>Usuń klucz</button>}
      </div>
    </div>
  );
}

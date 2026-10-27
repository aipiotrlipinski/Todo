import { useRef, useState } from 'react';
import { exportAll, importAll, setSetting } from '../actions';
import { daysBetween, formatLong } from '../dates';
import { useData, useUI, type PlanWindow } from '../store';
import type { ThemePref } from '../theme';
import { Header } from './Header';

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

        <div className="settings-group">
          <h2 className="panel-title">Motyw</h2>
          <div className="segmented wide" role="group" aria-label="Motyw">
            {([['system', 'Jak w systemie'], ['light', 'Jasny'], ['dark', 'Ciemny']] as const).map(([v, l]) => (
              <button key={v} type="button" className={theme.pref === v ? 'on' : ''} aria-pressed={theme.pref === v} onClick={() => theme.choose(v)}>{l}</button>
            ))}
          </div>
        </div>

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
            <li><kbd>Q</kbd> szybkie dodawanie</li>
            <li><kbd>G</kbd> <kbd>T</kbd> Dziś · <kbd>G</kbd> <kbd>I</kbd> Skrzynka · <kbd>G</kbd> <kbd>U</kbd> Nadchodzące</li>
            <li><kbd>Esc</kbd> zamknij okno · <kbd>Ctrl</kbd> + <kbd>Enter</kbd> zapisz zadanie</li>
          </ul>
        </div>
      </section>
    </>
  );
}

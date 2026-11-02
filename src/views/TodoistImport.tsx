import { useRef, useState } from 'react';
import { useUI } from '../store';
import { fetchTodoist, importTodoist, mergeTd, todoistFromCsv, type ImportResult } from '../todoist';

function summary(r: ImportResult) {
  const parts = [`zadania: ${r.tasks}`];
  if (r.projects) parts.push(`projekty: ${r.projects}`);
  if (r.stages) parts.push(`etapy: ${r.stages}`);
  if (r.labels) parts.push(`etykiety: ${r.labels}`);
  if (r.skipped) parts.push(`pominięte (już są): ${r.skipped}`);
  return `Zaimportowano – ${parts.join(', ')}.`;
}

export function TodoistImport() {
  const { today, toast } = useUI();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (load: () => Promise<Parameters<typeof importTodoist>[0]>) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await importTodoist(await load(), today);
      setMsg({ ok: true, text: summary(r) });
      toast(`Import z Todoist: ${r.tasks} zadań`);
      setToken('');
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Import się nie udał.' });
    } finally {
      setBusy(false);
    }
  };

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    run(async () => mergeTd(await Promise.all(list.map(async (f) => todoistFromCsv(await f.text(), f.name.replace(/\.csv$/i, ''), today)))));
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="settings-group">
      <h2 className="panel-title">Import z Todoist</h2>
      <p className="muted small">
        Przenosi otwarte zadania razem z projektami, sekcjami (jako etapy), podzadaniami, etykietami, datami i powtarzaniem.
        Nic nie jest usuwane, a zadania już przeniesione nie zdublują się.
      </p>
      <ol className="steps small">
        <li>W Todoist otwórz <b>Ustawienia → Integracje → Dla programistów</b> i skopiuj <b>token API</b>.</li>
        <li>Wklej go poniżej i kliknij <b>Importuj</b>. Token nie jest nigdzie zapisywany.</li>
      </ol>
      <div className="import-row">
        <input
          className="inline-input"
          type="password"
          placeholder="Token API z Todoist"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && token.trim() && !busy && run(() => fetchTodoist(token))}
          autoComplete="off"
          aria-label="Token API z Todoist"
        />
        <button type="button" className="primary-btn" disabled={busy || !token.trim()} onClick={() => run(() => fetchTodoist(token))}>
          {busy ? 'Importuję…' : 'Importuj'}
        </button>
      </div>
      <p className="muted small">
        Bez tokenu: w Todoist przy projekcie wybierz <b>⋯ → Eksportuj jako szablon CSV</b>, a potem wskaż pliki (można kilka naraz).{' '}
        <button type="button" className="link-btn" disabled={busy} onClick={() => fileRef.current?.click()}>Wybierz pliki CSV…</button>
      </p>
      <input ref={fileRef} type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      {msg && <p className={msg.ok ? 'import-ok' : 'error'} role="status">{msg.text}</p>}
    </div>
  );
}

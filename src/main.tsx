import '@fontsource-variable/plus-jakarta-sans/wght.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DataProvider } from './store';

// Ask the browser not to evict our local data when disk space runs low.
navigator.storage?.persist?.().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProvider loading={<div className="loading">Wczytywanie…</div>}>
      <App />
    </DataProvider>
  </StrictMode>,
);

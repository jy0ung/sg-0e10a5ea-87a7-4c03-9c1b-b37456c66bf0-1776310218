import '@/index.css';
import '@/i18n';

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

function isChunkLoadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return (
    /Failed to fetch dynamically imported module/i.test(message)
    || /Importing a module script failed/i.test(message)
    || /ChunkLoadError/i.test(message)
  );
}

function reloadOnce() {
  const key = 'flc.hrms.chunk-reloaded';
  if (sessionStorage.getItem(key) === '1') return;
  sessionStorage.setItem(key, '1');
  window.location.reload();
}

window.addEventListener('error', (event) => {
  if (isChunkLoadError(event.error ?? event.message)) reloadOnce();
});

window.addEventListener('unhandledrejection', (event) => {
  if (isChunkLoadError(event.reason)) reloadOnce();
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
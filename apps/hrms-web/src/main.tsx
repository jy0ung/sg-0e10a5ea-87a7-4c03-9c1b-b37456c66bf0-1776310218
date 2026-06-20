import '@/index.css';

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

function reportChunkLoadError() {
  const key = 'flc.hrms.chunk-load-error-reported';
  if (sessionStorage.getItem(key) === '1') return;
  sessionStorage.setItem(key, '1');
  window.dispatchEvent(new CustomEvent('flc:chunk-load-error'));
  console.warn('A lazy route chunk failed to load. Refresh manually when your current work is saved.');
}

window.addEventListener('error', (event) => {
  if (isChunkLoadError(event.error ?? event.message)) reportChunkLoadError();
});

window.addEventListener('unhandledrejection', (event) => {
  if (isChunkLoadError(event.reason)) reportChunkLoadError();
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

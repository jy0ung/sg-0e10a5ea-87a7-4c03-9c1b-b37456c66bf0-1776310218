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
  showChunkLoadNotice();
  window.dispatchEvent(new CustomEvent('flc:chunk-load-error'));
  console.warn('A lazy route chunk failed to load. Refresh manually when your current work is saved.');
}

function showChunkLoadNotice() {
  const id = 'flc-hrms-chunk-load-notice';
  if (document.getElementById(id)) return;
  const notice = document.createElement('div');
  notice.id = id;
  notice.setAttribute('role', 'status');
  notice.style.cssText = [
    'position:fixed',
    'left:16px',
    'right:16px',
    'bottom:16px',
    'z-index:2147483647',
    'border:1px solid #bfdbfe',
    'border-radius:8px',
    'background:#eff6ff',
    'color:#1e3a8a',
    'box-shadow:0 10px 24px rgba(15,23,42,0.18)',
    'font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'padding:12px 14px',
  ].join(';');
  notice.textContent = 'A new version is available. Save your current work, then refresh this page.';
  document.body.prepend(notice);
}

window.addEventListener('error', (event) => {
  if (isChunkLoadError(event.error ?? event.message)) {
    event.preventDefault();
    reportChunkLoadError();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (isChunkLoadError(event.reason)) {
    event.preventDefault();
    reportChunkLoadError();
  }
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

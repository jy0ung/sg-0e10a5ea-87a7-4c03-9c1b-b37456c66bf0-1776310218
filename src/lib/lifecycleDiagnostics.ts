/** Temporary, opt-in Admin form-loss evidence. Only fixed metadata enters this buffer. */
export type DiagnosticFormId = 'my-profile' | 'admin-roles' | 'admin-organization';
type Boundary = 'shell' | 'profile' | 'roles' | 'organization';
type WorkerState = ServiceWorkerState | 'none';
type DiagnosticEvent = {
  schema: 1;
  at: number;
  bootId: string;
  type: string;
  route: string;
  dirtyFormIds: DiagnosticFormId[];
  dirtyFormCount: number;
  previousBootId?: string;
  navigationType?: string;
  wasDiscarded?: boolean | null;
  visibility?: DocumentVisibilityState;
  persisted?: boolean;
  boundary?: Boundary;
  mountId?: string;
  pageMountId?: string;
  formId?: DiagnosticFormId;
  dirty?: boolean;
  locationKey?: string;
  authEvent?: string;
  sessionPresent?: boolean;
  workerState?: WorkerState;
  registrationPresent?: boolean;
};

const STORAGE_KEY = 'flc.ubs.lifecycle.v1';
const MAX_EVENTS = 80;
const ROUTES = new Set(['/profile', '/profile/security', '/profile/notifications', '/admin', '/admin/roles', '/admin/organization']);
const AUTH_EVENTS = new Set(['SESSION_CHECK', 'INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED', 'PASSWORD_RECOVERY', 'MFA_CHALLENGE_VERIFIED']);
const WORKER_STATES = new Set<WorkerState>(['none', 'installing', 'installed', 'activating', 'activated', 'redundant']);
const EVENT_TYPES = new Set(['document_boot', 'visibility_change', 'page_hide', 'page_show', 'freeze', 'resume', 'worker_registration', 'worker_controller_change', 'worker_update_found', 'worker_state', 'route', 'auth', 'mount', 'unmount', 'form_mount', 'form_dirty', 'form_unmount']);
const FORM_IDS = new Set<DiagnosticFormId>(['my-profile', 'admin-roles', 'admin-organization']);
const BOUNDARIES = new Set<Boundary>(['shell', 'profile', 'roles', 'organization']);
const isMountId = (value: string): boolean => /^[a-f0-9-]{36}$/i.test(value);
const enabled = import.meta.env.VITE_LIFECYCLE_DIAGNOSTICS === 'true';
function randomId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // This is a trace correlation ID, not an authentication or security token.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 3) | 8).toString(16);
  });
}
let bootId = '';
let started = false;
let route = 'other';
let events: DiagnosticEvent[] = [];
const forms = new Map<DiagnosticFormId, { mountId: string; pageMountId: string; dirty: boolean }>();

function safeRoute(pathname: string): string {
  return ROUTES.has(pathname) ? pathname : 'other';
}

function cleanStoredEvent(item: unknown): DiagnosticEvent | null {
  if (!item || typeof item !== 'object') return null;
  const value = item as Record<string, unknown>;
  if (value.schema !== 1 || typeof value.at !== 'number' || !Number.isFinite(value.at)
    || typeof value.bootId !== 'string' || !/^[a-f0-9-]{36}$/i.test(value.bootId)
    || typeof value.type !== 'string' || !EVENT_TYPES.has(value.type)
    || typeof value.route !== 'string' || (value.route !== 'other' && !ROUTES.has(value.route))
    || !Array.isArray(value.dirtyFormIds) || !value.dirtyFormIds.every(id => FORM_IDS.has(id))) return null;
  const event: DiagnosticEvent = {
    schema: 1, at: value.at, bootId: value.bootId, type: value.type, route: value.route,
    dirtyFormIds: value.dirtyFormIds, dirtyFormCount: value.dirtyFormIds.length,
  };
  if (typeof value.previousBootId === 'string' && /^[a-f0-9-]{36}$/i.test(value.previousBootId)) event.previousBootId = value.previousBootId;
  if (typeof value.navigationType === 'string' && ['navigate', 'reload', 'back_forward', 'prerender', 'unknown'].includes(value.navigationType)) event.navigationType = value.navigationType;
  if (typeof value.wasDiscarded === 'boolean' || value.wasDiscarded === null) event.wasDiscarded = value.wasDiscarded;
  if (value.visibility === 'visible' || value.visibility === 'hidden') event.visibility = value.visibility;
  if (typeof value.persisted === 'boolean') event.persisted = value.persisted;
  if (typeof value.boundary === 'string' && BOUNDARIES.has(value.boundary as Boundary)) event.boundary = value.boundary as Boundary;
  if (typeof value.mountId === 'string' && /^[a-f0-9-]{36}$/i.test(value.mountId)) event.mountId = value.mountId;
  if (typeof value.pageMountId === 'string' && /^[a-f0-9-]{36}$/i.test(value.pageMountId)) event.pageMountId = value.pageMountId;
  if (typeof value.formId === 'string' && FORM_IDS.has(value.formId as DiagnosticFormId)) event.formId = value.formId as DiagnosticFormId;
  if (typeof value.dirty === 'boolean') event.dirty = value.dirty;
  if (typeof value.locationKey === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(value.locationKey)) event.locationKey = value.locationKey;
  if (typeof value.authEvent === 'string' && (AUTH_EVENTS.has(value.authEvent) || value.authEvent === 'OTHER')) event.authEvent = value.authEvent;
  if (typeof value.sessionPresent === 'boolean') event.sessionPresent = value.sessionPresent;
  if (typeof value.workerState === 'string' && WORKER_STATES.has(value.workerState as WorkerState)) event.workerState = value.workerState as WorkerState;
  if (typeof value.registrationPresent === 'boolean') event.registrationPresent = value.registrationPresent;
  return event;
}

function storedEvents(): DiagnosticEvent[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object' || !('schema' in parsed) || parsed.schema !== 1 || !('events' in parsed) || !Array.isArray(parsed.events)) return [];
    // Do not trust storage as an input to a diagnostic event or export. A previous
    // application version or browser extension could have written arbitrary data.
    return parsed.events.slice(-MAX_EVENTS).map(cleanStoredEvent).filter((item): item is DiagnosticEvent => item !== null);
  } catch {
    return [];
  }
}

function record(type: string, detail: Partial<DiagnosticEvent> = {}): void {
  if (!enabled || !started) return;
  const dirtyFormIds = [...forms].filter(([, value]) => value.dirty).map(([id]) => id);
  const event: DiagnosticEvent = {
    schema: 1, at: Date.now(), bootId, type, route,
    dirtyFormIds, dirtyFormCount: dirtyFormIds.length, ...detail,
  };
  events = [...events, event].slice(-MAX_EVENTS);
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 1, events }));
  } catch {
    // Storage can be disabled or full. In-memory evidence remains available.
  }
}

function workerState(worker: ServiceWorker | null): WorkerState {
  return worker && WORKER_STATES.has(worker.state) ? worker.state : 'none';
}

function observeWorker(worker: ServiceWorker | null): void {
  if (!worker) return;
  worker.addEventListener('statechange', () => record('worker_state', { workerState: workerState(worker) }));
}

function observeServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    record('worker_registration', { registrationPresent: false });
    return;
  }
  const observed = new WeakSet<ServiceWorkerRegistration>();
  const observeRegistration = (registration: ServiceWorkerRegistration | undefined) => {
    record('worker_registration', { registrationPresent: !!registration, workerState: workerState(registration?.active ?? null) });
    if (!registration || observed.has(registration)) return;
    observed.add(registration);
    observeWorker(registration.installing);
    observeWorker(registration.waiting);
    registration.addEventListener('updatefound', () => {
      record('worker_update_found', { workerState: workerState(registration.installing) });
      observeWorker(registration.installing);
    });
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    record('worker_controller_change', { workerState: workerState(navigator.serviceWorker.controller) });
    void navigator.serviceWorker.getRegistration().then(observeRegistration).catch(() => undefined);
  });
  navigator.serviceWorker.getRegistration().then(observeRegistration).catch(() => record('worker_registration', { registrationPresent: false }));
  // The generated registration script may run after this module boots.
  void navigator.serviceWorker.ready.then(observeRegistration).catch(() => undefined);
}

export function startLifecycleDiagnostics(): void {
  if (!enabled || started) return;
  started = true;
  bootId = randomId();
  events = storedEvents();
  const previousBootId = events.at(-1)?.bootId;
  route = safeRoute(window.location.pathname);
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const navigationType = navigation && ['navigate', 'reload', 'back_forward', 'prerender'].includes(navigation.type) ? navigation.type : 'unknown';
  const wasDiscarded = 'wasDiscarded' in document ? (document as Document & { wasDiscarded: boolean }).wasDiscarded : null;
  record('document_boot', { previousBootId, navigationType, wasDiscarded, visibility: document.visibilityState });
  document.addEventListener('visibilitychange', () => record('visibility_change', { visibility: document.visibilityState }));
  window.addEventListener('pagehide', () => record('page_hide', { visibility: document.visibilityState }));
  window.addEventListener('pageshow', event => record('page_show', { persisted: event.persisted, visibility: document.visibilityState }));
  document.addEventListener('freeze', () => record('freeze', { visibility: document.visibilityState }));
  document.addEventListener('resume', () => record('resume', { visibility: document.visibilityState }));
  observeServiceWorker();
  window.__flcLifecycleDiagnostics = {
    get bootId() { return bootId; },
    read: () => events.map(event => ({ ...event, dirtyFormIds: [...event.dirtyFormIds] })),
    clear: clearLifecycleDiagnostics,
  };
}

export function clearLifecycleDiagnostics(): void {
  events = [];
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* optional storage */ }
}

export function recordRoute(pathname: string, locationKey: string): void {
  route = safeRoute(pathname);
  record('route', { locationKey: /^[a-zA-Z0-9_-]{1,32}$/.test(locationKey) ? locationKey : 'unknown' });
}

export function recordAuthLifecycle(event: string, sessionPresent: boolean): void {
  record('auth', { authEvent: AUTH_EVENTS.has(event) ? event : 'OTHER', sessionPresent });
}

export function newDiagnosticMountId(): string { return enabled ? randomId() : ''; }

export function recordMount(boundary: Boundary, mountId: string, mounted: boolean): void {
  if (!BOUNDARIES.has(boundary) || !isMountId(mountId)) return;
  record(mounted ? 'mount' : 'unmount', { boundary, mountId });
}

export function registerDiagnosticForm(formId: DiagnosticFormId, mountId: string, pageMountId: string): void {
  if (!enabled || !FORM_IDS.has(formId) || !isMountId(mountId) || !isMountId(pageMountId)) return;
  forms.set(formId, { mountId, pageMountId, dirty: false });
  record('form_mount', { formId, mountId, pageMountId, dirty: false });
}

export function setDiagnosticFormDirty(formId: DiagnosticFormId, mountId: string, dirty: boolean): void {
  const entry = forms.get(formId);
  if (!entry || entry.mountId !== mountId || entry.dirty === dirty) return;
  entry.dirty = dirty;
  record('form_dirty', { formId, mountId, pageMountId: entry.pageMountId, dirty });
}

export function unregisterDiagnosticForm(formId: DiagnosticFormId, mountId: string): void {
  if (forms.get(formId)?.mountId !== mountId) return;
  record('form_unmount', { formId, mountId, pageMountId: forms.get(formId)?.pageMountId, dirty: forms.get(formId)?.dirty });
  forms.delete(formId);
}

declare global {
  interface Window {
    __flcLifecycleDiagnostics?: {
      readonly bootId: string;
      read: () => DiagnosticEvent[];
      clear: () => void;
    };
  }
}

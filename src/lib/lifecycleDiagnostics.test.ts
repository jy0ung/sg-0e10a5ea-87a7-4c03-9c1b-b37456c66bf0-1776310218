import { beforeEach, describe, expect, it, vi } from 'vitest';

type Diagnostics = typeof import('./lifecycleDiagnostics');

async function boot(): Promise<Diagnostics> {
  vi.resetModules();
  const diagnostics = await import('./lifecycleDiagnostics');
  diagnostics.startLifecycleDiagnostics();
  return diagnostics;
}

beforeEach(() => {
  vi.stubEnv('VITE_LIFECYCLE_DIAGNOSTICS', 'true');
  sessionStorage.clear();
  delete window.__flcLifecycleDiagnostics;
});

describe('lifecycle diagnostics', () => {
  it('separates a new document boot from component remounts and preserves only bounded metadata', async () => {
    const first = await boot();
    const firstBoot = window.__flcLifecycleDiagnostics!.bootId;
    first.recordRoute('/profile', 'safe-key');
    first.recordMount('shell', first.newDiagnosticMountId(), true);
    first.registerDiagnosticForm('my-profile', first.newDiagnosticMountId(), first.newDiagnosticMountId());
    const form = window.__flcLifecycleDiagnostics!.read().find(event => event.type === 'form_mount')!;
    first.setDiagnosticFormDirty('my-profile', form.mountId!, true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(window.__flcLifecycleDiagnostics!.read().slice().reverse().find(event => event.type === 'visibility_change')).toMatchObject({
      type: 'visibility_change', bootId: firstBoot, dirtyFormIds: ['my-profile'], dirtyFormCount: 1,
    });

    const second = await boot();
    const nextBoot = window.__flcLifecycleDiagnostics!.bootId;
    expect(nextBoot).not.toBe(firstBoot);
    expect(window.__flcLifecycleDiagnostics!.read().find(event => event.type === 'document_boot' && event.bootId === nextBoot)).toMatchObject({
      type: 'document_boot', bootId: nextBoot, previousBootId: firstBoot,
    });
    for (let i = 0; i < 100; i++) second.recordAuthLifecycle('TOKEN_REFRESHED', true);
    expect(window.__flcLifecycleDiagnostics!.read()).toHaveLength(80);
    expect(JSON.parse(sessionStorage.getItem('flc.ubs.lifecycle.v1')!).events).toHaveLength(80);
  });

  it('never copies form values, tokens, secrets, arbitrary routes, or poisoned storage', async () => {
    const secret = 'SENSITIVE-NAME-PASSWORD-TOKEN-WEBHOOK-SECRET';
    sessionStorage.setItem('flc.ubs.lifecycle.v1', JSON.stringify({ schema: 1, events: [{
      schema: 1, at: Date.now(), bootId: crypto.randomUUID(), type: 'auth', route: '/profile',
      dirtyFormIds: [], dirtyFormCount: 0, access_token: secret, unexpected: { password: secret },
    }] }));
    const diagnostics = await boot();
    diagnostics.recordRoute(`/customers/${secret}?token=${secret}`, secret);
    diagnostics.recordAuthLifecycle(secret, true);
    diagnostics.registerDiagnosticForm('my-profile', diagnostics.newDiagnosticMountId(), diagnostics.newDiagnosticMountId());
    const event = window.__flcLifecycleDiagnostics!.read().find(item => item.type === 'form_mount')!;
    diagnostics.setDiagnosticFormDirty('my-profile', event.mountId!, true);
    const serialized = JSON.stringify(window.__flcLifecycleDiagnostics!.read());
    expect(serialized).not.toContain(secret);
    expect(sessionStorage.getItem('flc.ubs.lifecycle.v1')).not.toContain(secret);
    expect(window.__flcLifecycleDiagnostics!.read().find(item => item.type === 'route')).toMatchObject({ type: 'route', route: 'other', locationKey: 'unknown' });
    expect(window.__flcLifecycleDiagnostics!.read().slice().reverse().find(item => item.type === 'auth')).toMatchObject({ type: 'auth', authEvent: 'OTHER', sessionPresent: true });
    diagnostics.clearLifecycleDiagnostics();
    expect(window.__flcLifecycleDiagnostics!.read()).toEqual([]);
    expect(sessionStorage.getItem('flc.ubs.lifecycle.v1')).toBeNull();
  });

  it('stays dormant without the explicit flag', async () => {
    vi.stubEnv('VITE_LIFECYCLE_DIAGNOSTICS', 'false');
    const diagnostics = await boot();
    diagnostics.recordAuthLifecycle('SIGNED_IN', true);
    expect(window.__flcLifecycleDiagnostics).toBeUndefined();
    expect(sessionStorage.getItem('flc.ubs.lifecycle.v1')).toBeNull();
  });
});

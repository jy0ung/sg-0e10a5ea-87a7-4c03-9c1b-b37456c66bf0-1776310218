/** Test-only executable acceptance model. No storage, clients, timers or production implementation. */
export interface Lease { owner: string; token: number; acquiredAt: number; expiresAt: number }
export interface AttemptEvent { candidate: string; event: string; at: number }
export interface Candidate {
  id: string; lease: Lease; baseVersion: number; rows: string[];
  status: 'BUILDING' | 'VALIDATED' | 'FAILED' | 'ABANDONED' | 'PUBLISHED';
}
export class PublicationModel {
  private lease: Lease | null = null;
  private fence = 0;
  private candidates = new Map<string, Candidate>();
  private events: AttemptEvent[] = [];
  private published: { version: number; rows: string[] };
  constructor(initialRows: string[]) {
    if (new Set(initialRows).size !== initialRows.length) throw new Error('Duplicate canonical identity');
    this.published = { version: 1, rows: [...initialRows].sort() };
  }
  private assertClock(now: number) { if (!Number.isFinite(now)) throw new Error('Invalid injected clock'); }
  private assertOwner(lease: Lease, now: number) {
    this.assertClock(now);
    if (!this.lease || this.lease.owner !== lease.owner || this.lease.token !== lease.token || now >= this.lease.expiresAt || now < this.lease.acquiredAt) throw new Error('Expired or stale lease owner');
  }
  acquire(owner: string, now: number, duration: number): Lease {
    this.assertClock(now);
    if (!owner.trim() || !Number.isFinite(duration) || duration <= 0) throw new Error('Invalid lease');
    if (this.lease && now < this.lease.expiresAt) throw new Error('Lease still owned');
    this.lease = { owner, token: ++this.fence, acquiredAt: now, expiresAt: now + duration };
    return { ...this.lease };
  }
  renew(lease: Lease, now: number, duration: number): Lease {
    this.assertOwner(lease, now);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid lease duration');
    this.lease!.expiresAt = Math.max(this.lease!.expiresAt, now + duration);
    for (const candidate of this.candidates.values()) {
      if (candidate.lease.token === lease.token) candidate.lease.expiresAt = this.lease!.expiresAt;
    }
    return { ...this.lease! };
  }
  begin(id: string, lease: Lease, now: number) {
    this.assertOwner(lease, now);
    if (!id || this.candidates.has(id)) throw new Error('Candidate already exists or invalid');
    this.candidates.set(id, { id, lease: { ...lease }, baseVersion: this.published.version, rows: [], status: 'BUILDING' });
    this.events.push({ candidate: id, event: 'STARTED', at: now });
  }
  private candidate(id: string): Candidate {
    const candidate = this.candidates.get(id);
    if (!candidate) throw new Error('Unknown candidate');
    return candidate;
  }
  private writable(id: string, lease: Lease, now: number): Candidate {
    this.assertOwner(lease, now);
    const candidate = this.candidate(id);
    if (candidate.lease.token !== lease.token || candidate.lease.owner !== lease.owner || !['BUILDING', 'VALIDATED'].includes(candidate.status)) throw new Error('Terminal candidate or different owner');
    return candidate;
  }
  stage(id: string, lease: Lease, rows: string[], now: number) {
    const candidate = this.writable(id, lease, now);
    if (candidate.status !== 'BUILDING') throw new Error('Validated candidate is sealed');
    candidate.rows = [...rows];
    this.events.push({ candidate: id, event: 'STAGED', at: now });
  }
  validate(id: string, lease: Lease, businessValid: boolean, now: number) {
    const candidate = this.writable(id, lease, now);
    if (candidate.status !== 'BUILDING') throw new Error('Candidate already validated');
    candidate.status = businessValid && candidate.rows.every(key => key.trim()) && new Set(candidate.rows).size === candidate.rows.length ? 'VALIDATED' : 'FAILED';
    this.events.push({ candidate: id, event: candidate.status, at: now });
  }
  publish(id: string, lease: Lease, now: number, beforeCommit?: () => void) {
    const candidate = this.writable(id, lease, now);
    if (candidate.status !== 'VALIDATED' || candidate.baseVersion !== this.published.version) throw new Error('Unvalidated or obsolete candidate');
    try { beforeCommit?.(); } catch (error) {
      candidate.status = 'FAILED';
      this.events.push({ candidate: id, event: 'FAILED_BEFORE_COMMIT', at: now });
      throw error;
    }
    this.writable(id, lease, now);
    if (candidate.status !== 'VALIDATED' || candidate.baseVersion !== this.published.version) throw new Error('Unvalidated or obsolete candidate');
    // One visible assignment models a future database transaction/version switch; it is not that transaction.
    this.published = { version: this.published.version + 1, rows: [...candidate.rows].sort() };
    candidate.status = 'PUBLISHED';
    this.events.push({ candidate: id, event: 'PUBLISHED', at: now });
  }
  abandonExpired(id: string, now: number) {
    this.assertClock(now);
    const candidate = this.candidate(id);
    const effectiveExpiry = this.lease?.token === candidate.lease.token ? this.lease.expiresAt : candidate.lease.expiresAt;
    if (now < effectiveExpiry) throw new Error('Cannot recover before lease expiry');
    if (!['BUILDING', 'VALIDATED'].includes(candidate.status)) throw new Error('Terminal candidate');
    candidate.status = 'ABANDONED';
    this.events.push({ candidate: id, event: 'ABANDONED', at: now });
  }
  getPublished() { return { ...this.published, rows: [...this.published.rows] }; }
  inspect(id: string): Candidate { const candidate = this.candidate(id); return { ...candidate, rows: [...candidate.rows], lease: { ...candidate.lease } }; }
  history(): AttemptEvent[] { return this.events.map(event => ({ ...event })); }
}

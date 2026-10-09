/** Read-only evidence format; no executor discovery or credentials required. */
import { z } from 'zod';

const stamp = z.object({ evidenceRef: z.string().min(1), capturedAt: z.string().datetime({ offset: true }) });
const unavailable = z.object({
  status: z.enum(['UNKNOWN', 'ACCESS DENIED']),
  reason: z.string().min(1), evidenceRef: z.string().min(1).optional(),
  capturedAt: z.string().datetime({ offset: true }).optional(),
}).strict();
const evidence = <T extends z.ZodTypeAny>(value: T) => z.union([
  stamp.extend({ status: z.literal('VERIFIED'), value }).strict(),
  stamp.extend({ status: z.literal('CODE ONLY'), value }).strict(),
  unavailable,
]);
const text = z.string().min(1);
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const trigger = z.object({
  handler: text, eventSource: text,
  cadence: evidence(text), creator: evidence(text),
  lastExecution: evidence(z.object({ at: z.string().datetime({ offset: true }), result: text }).strict()),
}).strict();

export const runtimeEvidenceSchema = z.object({
  schemaVersion: z.literal(1), projectAlias: text,
  provenance: z.object({ sourceSystem: text, sourceTables: z.array(text).min(1), extractionDate: text, evidenceRef: text, expectedInterpretation: text }).strict(),
  projectId: evidence(text), deploymentId: evidence(text),
  deploymentVersion: evidence(z.number().int().nonnegative()),
  boundContainer: evidence(text),
  effectiveProperties: evidence(z.array(z.object({ name: text, fingerprint }).strict())),
  codeFingerprint: evidence(fingerprint),
  triggerInventory: z.union([
    stamp.extend({ status: z.literal('VERIFIED'), value: z.array(trigger).min(1) }).strict(),
    stamp.extend({ status: z.literal('CODE ONLY'), value: z.array(trigger) }).strict(),
    // Certified absence requires an actual census, not an inaccessible/empty source response.
    stamp.extend({ status: z.literal('NOT INSTALLED'), censusComplete: z.literal(true) }).strict(),
    unavailable,
  ]),
}).strict();
export type RuntimeEvidence = z.infer<typeof runtimeEvidenceSchema>;

export const legacyEvidenceSchema = z.object({
  schemaVersion: z.literal(1), classification: z.literal('FORENSIC_MIGRATION_EVIDENCE'),
  authoritativeCurrentStock: z.literal(false), allowedUse: z.literal('OFFLINE_CHARACTERIZATION_ONLY'),
  evidenceTimestamp: z.string().datetime({ offset: true }),
  decision: z.literal('STRATEGY_4_PRESERVE_LEGACY_ADVANCE_ISOLATED_UBS'),
  populations: z.object({ distinctChassis: z.literal(1337), rawOccurrences: z.literal(1341), lduDuplicateIdentities: z.literal(4) }).strict(),
  publicationDates: z.object({ centralInventory: text, bookingStock: text, outletSnapshots: text }).strict(),
  anomalies: z.object({
    twuCheckAgeSeconds: z.literal(3577), lduCheckAgeSeconds: z.literal(3540),
    recoveryBeforeLeaseExpirySeconds: z.literal(120.115), abandonedHistoryWitnessCount: z.literal(1),
    preCommitTimeout: z.literal(true), dirtyBlockedState: z.literal(true),
  }).strict(),
  booking: z.object({ retainedKeys: z.literal(1880), lastGoodAt: text, failedAttemptAt: text }).strict(),
  liveExecutor: z.literal('UNKNOWN'), legacyFullReplaySafe: z.literal('UNKNOWN'),
  provenance: z.object({ sourceSystem: text, sourceTables: z.array(text).min(1), extractionDate: text, evidenceRefs: z.array(text).min(1), expectedInterpretation: text }).strict(),
}).strict();
export function requireEvidenceUse(value: unknown, use: 'offline-characterization' | 'live-stock') {
  const parsed = legacyEvidenceSchema.parse(value);
  if (use !== 'offline-characterization') throw new Error('Forensic evidence cannot be used as authoritative current stock');
  return parsed;
}

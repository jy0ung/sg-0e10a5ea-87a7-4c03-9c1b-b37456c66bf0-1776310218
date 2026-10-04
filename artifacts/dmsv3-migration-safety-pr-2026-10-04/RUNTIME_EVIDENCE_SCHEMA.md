# Runtime evidence schema

`src/test/dmsv3-migration-safety/runtime-evidence.ts` exports the strict Zod schema and inferred TypeScript format, exclusively for offline test/evidence use. No production credentials, discovery calls or Script Properties values are required in CI.

Each field is independently attributed. VERIFIED and CODE ONLY require `value`, `evidenceRef` and offset-aware `capturedAt`. UNKNOWN and ACCESS DENIED require a reason and forbid a value. CODE ONLY means static source evidence, never an installed executor assertion. The format records project ID, deployment ID/version, bound container, SHA-256 property fingerprints, code fingerprint, and a trigger inventory with handler/event source plus separately attributed cadence, creator and last execution.

NOT INSTALLED applies to trigger inventory only and requires `censusComplete: true`, evidence reference and capture time. VERIFIED requires a nonempty trigger array. UNKNOWN/ACCESS DENIED cannot be encoded as an empty verified inventory. Trigger creators and cadence may remain unknown even when a handler is observed.

The schema validates the shape of an attestation, not the authenticity of its collector. A future runtime certification must join the project, exact deployment/version, effective properties and installed census from an authorized read-only collector at a documented capture time. A file name or source hash alone does not certify execution. SHA-256 fingerprints must cover a canonical representation with redaction before any public evidence export; they are comparison evidence, not permission to expose low-entropy secrets.

Strict objects reject extra credentials and property `value` fields. Only property names/aliases and fingerprints are allowed. The committed fixture uses aliases and explicit UNKNOWN/ACCESS DENIED to preserve the current evidence gap.

The forensic stock schema separately fixes `authoritativeCurrentStock: false` and `allowedUse: OFFLINE_CHARACTERIZATION_ONLY`; `requireEvidenceUse` rejects a live-stock request. It intentionally preserves unresolved executor/replay safety as UNKNOWN. It does not create a production guard or stock data source.

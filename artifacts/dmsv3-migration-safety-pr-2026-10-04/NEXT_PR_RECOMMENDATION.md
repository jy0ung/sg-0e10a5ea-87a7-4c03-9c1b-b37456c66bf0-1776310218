# Next PR: B — canonical Vehicle/Inventory identity foundation

Choose B before stock-control commands or publication implementation. The current Vehicle normalizer can select a chassis fallback with LIMIT 1; the guarded Sales Order prerequisite does not certify Vehicle identity. Our 1,337 observed identities have no approved canonical links. Ingestion must not turn those observations into guessed Vehicle matches or a second truth.

Next slice: a bounded Inventory-owned identity/reconciliation contract with company-scoped canonical Vehicle identity, explicit source-occurrence linkage, chassis/engine conflict handling and ambiguity rejection. Reuse current `vehicles`, reconciliation and column authority where suitable; do not move Inventory authority into Sales or Dashboard. If a schema change is necessary, design/review it separately with disposable database evidence.

Exit criteria before ingestion convergence (A): exact target ownership contract reviewed; ambiguous/conflicting/unmatched cases fail closed; tenant and soft-delete guards tested; repeated observations preserve lineage without creating duplicate Vehicles; canonical links require approved reconciliation; source corrections cannot overwrite UBS-local facts; deterministic replay and identity hashes remain stable; SQL concurrency/idempotency/rollback proven in disposable PostgreSQL; no production access/deploy; donor matrix acceptance cases retained.

Publication/version/outbox (D) follows an agreed domain identity/command boundary and requires real transaction/fencing tests. This PR's in-memory model is only its acceptance contract. No implementation of B or any second slice is included here.

# Offline DMSv3 migration safety contracts

Run `npm test -- src/test/dmsv3-migration-safety` from repository root. The existing Vitest configuration discovers these tests. No credentials or live database are needed. Helpers, Zod schemas and the publication model remain under the test tree and must not be imported into application, service or Edge Function code.

See [implementation note](../../../artifacts/dmsv3-migration-safety-pr-2026-10-04/PR_SUMMARY.md), [provenance/hash manifest](../../../artifacts/dmsv3-migration-safety-pr-2026-10-04/FIXTURE_MANIFEST.json), [donor matrix](../../../artifacts/dmsv3-migration-safety-pr-2026-10-04/DMS_OPS_DONOR_MATRIX.md) and [validation](../../../artifacts/dmsv3-migration-safety-pr-2026-10-04/TEST_EVIDENCE.md).

Full identities retain the observed outlet/stage/row relationships while substituting sorted ordinal chassis aliases. Null engine and canonical match mean unobserved/unapproved, not an inferred match. Synthetic edge cases are separately labeled. Byte SHA-256 protects fixture integrity; canonical output SHA-256 uses sorted object keys and sorted observations/exception/identity results. Neither hash proves legacy stock is current.

Immutable occurrence comparison happens before normalization: altered raw values under the same snapshot/row lineage are flagged as conflicts, including formatting-only changes. A correction needs a new attributed source observation, not an overwrite of frozen occurrence evidence.

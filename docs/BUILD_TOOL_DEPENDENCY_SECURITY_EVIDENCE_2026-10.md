# Build-tool dependency security and compatibility evidence — October 2026

This bounded dependency correction removes the vulnerable Tailwind 3 build chain
from UBS, HRMS web and HRMS mobile. It uses official Tailwind CSS and
`@tailwindcss/postcss` 4.3.3 and `tailwind-merge` 3.7.0, with unchanged Node 20 CI,
audit severity and repository protections. It retires Lovable development
annotations by removing only the tagger dependency/import/plugin hook.
Independent review and any subsequent merge/deployment are separate steps.

## Baseline and dependency evidence (SB-01 / SB-02)

Refreshed main is `1cfe067944f6e2b479efe8b72685f93bd2f8ae21`, tree
`a289ae9fe0dde3aeea7aff2e71b3fed955af3a57`, the accepted squash of
[PR #132](https://github.com/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218/pull/132).
No intervening main change or overlapping focused dependency fix was present.
The primary checkout and other session's worktree were preserved; implementation,
unchanged baseline and source-only control use separate owned checkouts.

The baseline all-dependency audit exits **1**, with **eight high affected entries
from one advisory**, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
The affected entries are braces, chokidar, micromatch, fast-glob, tailwindcss,
lovable-tagger, @tailwindcss/typography and tailwindcss-animate. Tailwind 3 reaches
braces 3.0.3 through chokidar and fast-glob/micromatch; the tagger retains another
Tailwind 3 edge, while the existing plugins inherit their Tailwind peer's exposure.
These are dependency paths, not evidence of a production exploit or eight CVEs.

[Main CI 37084760661](https://github.com/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218/actions/runs/37084760661)
has five required passes and the required Security Audit failure. The separate
scheduled security workflow's pre-existing continue-on-error badge is not
fail-closed evidence. The historical failure is preserved.
Fresh registry/advisory reads found braces latest 3.0.3 with no patched range,
Tailwind v3-lts 3.4.19 and lovable-tagger latest 1.3.5 still declaring Tailwind 3;
there was no smaller published compatible remedy.

After a clean candidate `npm ci`, both installed-tree and lockfile-only registry
audits exit **0** with **zero vulnerabilities in every severity**. `npm ls --all`
exits **0** with no invalid/unmet peers. No braces, nested Tailwind 3 or tagger
instance remains. Existing typography/animation dependencies are retained;
root and HRMS web still use the animation plugin, and mobile still does not.
No audit exceptions, omit-dev flags, severity changes, forced fixes, peer bypass,
private compiler forks or unrelated overrides/tooling upgrades were introduced.

[The committed complete graph map](evidence/build-tool-dependency-graph-2026-10.json)
records every changed/added/removed installed package, its version, dependency and
peer edges, registry resolution and integrity. It contains **36 additions,
49 removals and three existing-version changes**: Tailwind 3.4.19 → 4.3.3,
tailwind-merge 2.6.1 → 3.7.0 and Tailwind's jiti 1.21.7 → 2.7.0. New packages
include the matching Tailwind PostCSS/node/oxide graph, platform bindings and
Lightning CSS; platform variants and all other transitives are listed individually.
Framework, Vite, Playwright and unrelated dependency resolutions stay unchanged.

## CSS/source and browser evidence (SB-03 through SB-06)

The three CSS entries load their existing legacy theme through supported
`@config` compatibility, explicitly scan their HTML/pages and shared packages,
and scan imported root sources for HRMS web. Root retains its cross-app source
coverage. Mobile does not scan unrelated root pages. No node_modules scan is used.

The compatibility files contain static established appearance values and the
licensed preflight reset, rather than a legacy compiler. They preserve the old
palette, typography/fallbacks, radii, shadows, blur, default borders and form/table
reset. Existing HSL tokens, container configuration, animation/plugin settings
and custom app rules are retained. Font arrays become equivalent CSS lists so
the v4 legacy theme helper keeps every fallback. Accessible invisible outlines,
three-pixel default rings and touch hover retain their existing class APIs.

The small PostCSS compatibility pass restores previous hidden-sibling margin
placement/specificity and single two-dimensional transform composition with the
retained animation plugin. Real probes caught an 8px form spacing shift, a
production-only minified-selector mismatch, and WebKit modal translation applied
twice; these were corrected instead of accepted as new product layouts.
Six committed real-entry CSS compilation tests cover each app with unminified
and minified optimization, emitted shared classes, non-nested output, margins
and modal translation. Fourteen additional tests cover all three real `cn` APIs
and rendered Button/Input overrides (spacing, text, border/ring, arbitrary and
responsive/state classes). Existing application components and business tests
are untouched.

Every PostCSS pipeline explicitly enables official optimization without
minification, including in development. The installed official optimizer targets
Safari/iOS Safari 16.4, Chrome 111 and Firefox 128 and flattens nesting/media
queries. Vite retains its existing production minification. This verifies the
compiled configuration against the approved support floor; actual testing at
each minimum version is not claimed. Primary references:
[Tailwind upgrade guide](https://tailwindcss.com/docs/upgrade-guide),
[source detection](https://tailwindcss.com/docs/detecting-classes-in-source-files),
[preflight](https://tailwindcss.com/docs/preflight), and
[tailwind-merge compatibility](https://github.com/dcastil/tailwind-merge).

### Explicit HRMS source-coverage correction

The old HRMS web config scanned its own and root source but omitted `packages`.
An unchanged baseline screenshot consequently shows the New Employee dialog
outside the viewport with its shared overlay/centering styles absent. Adding the
actual shared class sources restores the styles already declared by unchanged
Dialog/Select/Input/Toast components: centered fixed dialog, dark overlay,
responsive rounding/text alignment, focus-ring offset, select line clamping and
scroll affordance, and toast viewport placement. This is an explicitly recorded
mechanical scanning correction, not pixel equality with the defective baseline.
No application markup/behavior or new product design was substituted.

A separate **Tailwind 3 source-only control** changes exactly one content entry:
`../../packages/**/*.{ts,tsx}` in HRMS web's baseline Tailwind config. Its original
lock, compiler, CSS, components and business code stay unchanged. The candidate
must reproduce this independently generated control's values/pixels for restored
HRMS styles; every raw original-baseline difference is retained and reviewed.
Unmatched geometry or paint remains a test failure. Astra must independently
assess this source-coverage correction and the full original/control/candidate
comparison, rather than assume the original screenshots are identical.

Representative controlled screenshots are committed for direct review:

| Before / control | Candidate |
| --- | --- |
| [HRMS original off-screen modal](evidence/build-tool-browser/hrms-original.png), [source-only v3 control](evidence/build-tool-browser/hrms-source-control.png) | [Restored shared styles](evidence/build-tool-browser/hrms-candidate.png) |
| [UBS real dark mode](evidence/build-tool-browser/ubs-dark-original.png) | [UBS candidate](evidence/build-tool-browser/ubs-dark-candidate.png) |
| [Mobile focused form](evidence/build-tool-browser/mobile-original.png) | [Mobile candidate](evidence/build-tool-browser/mobile-candidate.png) |

### Controlled real-route comparisons

`e2e/build-tool-compatibility.spec.ts` exercises these actual screens with owned
synthetic mocked auth/API fixtures. It blocks external browser requests and uses
fixed date, timezone, fonts, engine and viewport. This is browser/CSS evidence,
not live browser-to-database acceptance.

| App / route | Captured states and interactions |
| --- | --- |
| UBS `/admin/users`, `/profile` | Dense filtered table and navigation/shell; blank edit disables Save, focus ring, valid edit enables Save, Escape; unsaved navigation opens alert dialog, Stay preserves draft; reduced motion disables the existing motion-safe animation. |
| HRMS web `/employees` | Dense twelve-employee table/filter, New Employee draft/focused input, Role select listbox, keyboard open/close and Cancel. Original missing-source modal behavior is retained as baseline evidence and isolated by the source-only control. |
| HRMS mobile `/profile`, `/leave` | Profile/disabled Save, editable contact and focus; required form rejection/visible validation, valid date/type selection and successful synthetic submission. |
| Test-only shared UI entry (dev) | Real Button/Input overrides, hidden-sibling spacing and first-child margin, native required validation/submission, tabs, accordion, popover positioning, dialog animation/focus return, forced-colors outline. Absent from production build inputs. |

All three real apps run in light/dark selections and desktop **1440×1000** /
mobile **390×844** viewports on **Chromium 153.0.8010.12, Firefox 155.0 and WebKit
26.6**, using Playwright 1.63.0. Mobile retains its existing CSS/theme behavior;
the fixture's dark selection does not invent a missing product theme switch.
The public Playwright 1.63.0-noble browser image has digest
`sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27`.
Browser containers use Node 24.20.0/npm 11.19.0; authoritative installs/builds/
repository gates use host Node **20.20.2**/npm **10.8.2**. Neither app tooling
versions nor the CI baseline were upgraded to the browser image's Node version.

The initial reviewed head (`f93d17592e98d1742e56db11e2a17f0c428725fb`) had 225 captured states, 21,768 individually explained raw differences and zero unexplained differences within those states. Astra subsequently found R1 in an actual shared Carousel combination absent from that matrix; those initial results do not establish complete compatibility. The correction evidence below supersedes that coverage gap. Each capture stores the PNG, every DOM node's 46 key computed properties and
rounded geometry, every raw changed property, its explanation and any unexplained
remainder. Finite animations are finished before both style and pixel capture,
and the pointer is moved to a neutral location to avoid stale hover/intermediate
WebKit frames. Original baseline capture is only from the unchanged checkpoint;
no candidate snapshot creation or rebaselining is allowed (`updateSnapshots:none`).
Equivalent color/font-list serialization and transparent/zero-area shadow bookkeeping are
reviewed explicitly; other original changes require exact source-only-control
reproduction. Screenshots allow **zero differing pixels above a 0.1 YIQ threshold**
(half Playwright's default threshold), alongside strict geometry/paint review.
Earlier zero-threshold probes retained tiny edge rasterization differences despite
matching computed paint/geometry; their images and failures remain in artifacts.
The method does not waive layout differences or substitute newly blessed images. UBS/HRMS theme storage keys are set explicitly and the
actual rendered light/dark class is asserted; earlier mislabelled fixture probes
are not counted as the final dark-mode evidence.

Final results and full comparison manifests are recorded below and in
[evidence/build-tool-style-comparison-2026-10.json](evidence/build-tool-style-comparison-2026-10.json).
The approved support targets are **Safari 16.4+, Chrome 111+, Firefox 128+**.
Modern Playwright WebKit is not native Safari 16.4 evidence. Native iOS/Android,
Capacitor/WebView, devices, real remote fonts and production login are not qualified.

## Repository / live regression results (SB-07 through SB-09)

The initial reviewed-head successful `npm run check:production-readiness` used safe placeholder
frontend inputs and a newly reconstructed, uniquely owned local stack on ports
58840–58847. It includes hygiene, lint, all four explicit TypeScript configs plus
recovery service, architecture/RPC guards, secret/edge-function checks, unchanged
all-dependency audit, UBS build/bundle budget, both HRMS builds, all migrations,
DB lint and four security audits. That initial owned project was
`ubs-readiness-58840-QHPJFF`, workdir `/tmp/ubs-readiness.58840.QHPJFF`.
Independent checks after exit0 found no remaining containers, volumes or workdir
for that exact project. DC/NR/CP synthetic fixture manifests and cleanup records
are retained in the implementation artifacts; shared stacks were not reset.

- Unit mode: **1,413 passed / 362 pre-existing skips** (1,393 retained + 20 new).
- Live database mode: **474 passed / 22 files / zero skips**. Includes DC111,
  NR59, LP49, DN30, CP14, thirteen older normalizer cases and the strengthened
  CP-08 ambiguity witness. All eight existing Case component witnesses remain.
- Existing required browser commands: **48 passed / two existing responsive
  skips** (routes33, Admin lifecycle2, Accounting Periods2, responsive8/2skip,
  accessibility3). Dedicated HRMS web: **seven passed** separately.
- New comparisons: original baseline **39 dev + 36 preview**, source-only HRMS
  control **12 dev + 12 preview**, candidate **39 dev + 36 preview**; no skips.
- Both installed and lock-only audits: **zero vulnerabilities, exit0**;
  complete installed graph: **valid, exit0**. All three builds and existing
  bundle limits pass. No budget changes.

Exact final-head CI, executed/skipped counts, checkout head/base/tree correspondence
and independent owned-stack cleanup verification are saved in the implementation
handoff. The six required checks remain Lint, Web App, Mobile App (hrms-mobile),
Security Audit, Production Readiness (local Supabase) and E2E (Playwright).
Optional credential-gated RLS skips and the separate scheduled badge are not
executed regression evidence. The newly committed browser comparison suite is
local three-engine evidence; its CSS/class-composition unit cases execute in
required Web App CI. CI's existing browser commands are unchanged.

## Acceptance map / reproduction (SB-10)

| Requirement | Concrete committed assertions and supporting evidence |
| --- | --- |
| SB-01 | Exact main/tree, failed-main CI and eight-entry audit above; untouched baseline checkout, three-app original captures and baseline graph map. |
| SB-02 | `scripts/build-tool-graph-evidence.ts`, full committed version/edge/integrity map, coherent manifests/lock; clean-install, installed graph, installed/lock audit JSON and exit files. |
| SB-03 | Twelve `src/test/build-tool-css.test.ts` real-entry/optimizer cases (six retained + six R1), normal app dev/preview browser routes, actual dev/production stylesheet loading for real shared consumers, three builds and unchanged budget. |
| SB-04 | All 225 original state identities retained plus 90 R1 states: three-engine dev/production actual Carousel and paused Dialog/AlertDialog/Select trajectory comparisons. Every raw property/geometry/pixel delta remains strict; only the independent HRMS source-only control permits its documented source correction. |
| SB-05 | Fourteen retained class/consumer cases; real Carousel size/translation/rotation/scale caller overrides, both orientations/arrows, animated 25/50/75/100 frames/final placement/close; retained real forms, tabs/accordion, focus, reduced motion and forced colors. |
| SB-06 | Approved floor, actual engine/Node matrix above; enabled official target optimization, non-nested emitted CSS assertions; unavailable native/minimum/device/production qualification stated. |
| SB-07 | Unchanged production component/service/domain/auth/migration/RLS/workflow/deployment/SOT blobs and existing test assertions; tagger-only deliberate capability retirement. |
| SB-08 | Fresh R1 full readiness exit0, exact 59040 owned project/fixture manifests/cleanup; 1,419 unit passes/362 existing skips and 474 real DB passes/22 files/zero skips. |
| SB-09 | Fresh existing 48/2skip + HRMS7; original45dev/42preview, HRMS control12/12 and candidate45/42; all six final-head required CI results/logs and actual checkout-tree proof in external handoff. |
| SB-10 | Committed graph/CSS/class/browser regressions, safe reconstruction script, checksummed comparison manifest and independent Astra prompt/handoff. |

Safe reproduction (new owned directories; no existing/local production env inputs):

```bash
npm ci
npm ls --all
npm audit --audit-level=low --registry=https://registry.npmjs.org
npm audit --package-lock-only --audit-level=low --registry=https://registry.npmjs.org
# Save the exact old lock to an owned temporary file, then regenerate the map.
git show 1cfe067944f6e2b479efe8b72685f93bd2f8ae21:package-lock.json > /tmp/sb-baseline-lock.json
npx tsx scripts/build-tool-graph-evidence.ts /tmp/sb-baseline-lock.json /tmp/sb-graph.json
# Requires installed Chromium/Firefox/WebKit and their OS dependencies.
# This creates/removes only its own comparison worktrees; evidence is retained.
SB_EVIDENCE_DIR=/tmp/sb-browser-evidence-new bash scripts/test-build-tool-compatibility.sh
```

For the full gate use CI-safe `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` and
matching `VITE_HRMS_*` placeholders, `VITE_HRMS_APP_URL=https://hrms.example.test`,
and a freshly verified unused `READINESS_PORT_BASE`, then run
`npm run check:production-readiness`. The unchanged runner creates its own
`ubs-readiness-<port>-<random>` stack. Independently verify that exact project's
containers, volumes and temporary workdir are gone after execution; never reset
or clean a shared stack. The handoff records the executed commands/logs and exact
fixture/cleanup identities without credentials.

## R1 correction — transform composition and animated trajectory

Astra's review of PR #133 at `f93d17592e98d1742e56db11e2a17f0c428725fb`
found a shared-component regression even though the supplied 225 states passed.
The unchanged vertical `CarouselPrevious`/`CarouselNext` combine
`-translate-x-1/2 rotate-90`. Rewriting translation alone left individual rotation
outside the transform, rotating the translation vector. At a 400×200 Carousel
with margin 100, previous changed from **[284,52,32,32] to [300,36,32,32]** and
next from **[284,316,32,32] to [300,300,32,32]** in every engine. No mounted product
Carousel route was found; this is a real existing shared API compatibility defect.

`styles/postcss-compat.js` now restores one combined transform for the official
compiler's 2D translation, scalar rotation, scale and existing rotation/skew
chain. Translation precedes rotation/skew, followed by scale. Each utility sets
its own registered variable and the same transform, preserving composition across
utility ordering/variants and allowing retained enter/exit keyframes to replace
the complete transform once. Scalar rotation rewriting is confined to rotation
utility selectors; arbitrary application transforms and 3D/axis declarations
remain outside this correction. There is no Carousel offset or product component
change, dependency change, snapshot approval or compiler fork.

Representative WebKit frames: [unchanged v3](evidence/build-tool-browser/r1-carousel-v3.png), [reviewed head](evidence/build-tool-browser/r1-carousel-reviewed-head.png), [corrected](evidence/build-tool-browser/r1-carousel-corrected.png). Original review artifacts remain immutable; these images come from the newly owned reconstruction/red witness.

The new paused animation witness also exposed a compiler ordering incompatibility:
v4 puts Select's `data-side` slide utility before `data-state` animation defaults,
so the retained plugin's `initial` reset cleared its -8px enter offset. The same
compatibility pass moves only those animation-variable defaults to zero-specificity
`:where(...)` selectors on animated elements. Explicit fade/zoom/slide variants
then win regardless of utility emission order. Real Dialog, AlertDialog and Select
enter trajectories now match the unchanged v3 compiler, including WebKit, rather
than only matching after `animation.finish()`.

Committed assertions and repeatable comparison:

- `e2e/build-tool-compatibility.spec.ts` adds two tests per engine/server using
  actual shared components in `e2e/fixtures/build-tool-transforms.tsx`. A test-only
  React bundle loads CSS from the normal dev server or the production index's
  actual stylesheet links. It is absent from product build inputs.
- Carousel assertions cover both vertical controls, horizontal controls, arrow
  direction/dimensions and actual `cn` caller overrides of translation, rotation,
  scale and size. The same committed witness is red with the reviewed runtime in
  all three engines for **both dev and production CSS**, reproducing exactly six
  geometry failures per mode; horizontal/override cases remain green.
- Real Dialog/AlertDialog/Select animations are paused on creation and sampled at
  **25%, 50%, 75%, 100%** of their actual enter duration. Screenshots, all existing
  computed properties and every node's geometry compare against independently
  compiled unchanged v3 output at the same time. Exit/close behavior is also
  asserted. The old final-state, reduced-motion, hidden-sibling, keyboard/focus,
  forced-colors and real-route assertions remain intact.
- Six additional real-entry CSS compiler cases (three entries × two optimization
  modes) check composable 2D output and that custom/axis transforms stay unchanged.
  All 20 previous CSS/class cases and every existing business regression remain.
- The manifest generator requires **all 225 original state identities plus 90
  additional R1 state identities**, not only a total count. New snapshots are
  compared to unchanged v3, with the same 0.1 YIQ / zero-pixel policy; R1 has no
  source-control exemption. The separate one-content-entry HRMS v3 control and
  every original/control/candidate delta remain required.

Fresh correction validation uses host Node 20.20.2/npm 10.8.2 and newly verified
unused ports 59040–59047. `npm run check:production-readiness` exits **0**:
**1,419 unit passes / 362 unchanged unit-mode skips**, **474 live passes / 22
files / zero skips**, all lint/explicit typechecks/recovery/architecture/RPC/
security/audit checks, three builds/budget, reconstruction, DB lint and four
security audits pass. This retains DC111/NR59/LP49/DN30/CP14/older normalizer13,
the strengthened CP-08 and all eight Case component witnesses. Exact project
`ubs-readiness-59040-1kWAzE`, API `127.0.0.1:59041`, temporary workdir
`/tmp/ubs-readiness.59040.1kWAzE`: fixture assertions execute and independent
post-run inventory verifies no owned containers, volumes or workdir remain.

Fresh clean `npm ci`, installed/lock-only all-dependency audits and `npm ls --all`
all exit **0**, zero vulnerabilities/invalid peers. Independently regenerated
complete graph evidence is byte equal to the existing committed graph.
Existing browser commands again give **48 passes / two existing responsive skips**;
the separate dedicated HRMS suite gives **7 passes**. No baseline test/assertion
is removed or weakened.

The complete committed reconstruction script independently rebuilt all three app
entries from unchanged v3, the one-entry HRMS control and the corrected candidate.
Original **45 dev / 42 production-preview**, control **12 / 12**, candidate **45 / 42**
all pass with zero skips across Chromium/Firefox/WebKit. The regenerated manifest
contains **315 states (225 retained + 90 R1), 21,936 individually explained
changed properties and zero unexplained differences**. All exact state identities
are required. Original_exit=0 / cleanup_exit=0; owned comparison worktrees/tempdir,
public browser container and separately owned clone were verified removed.

Fresh final correction validation and exact-head CI are recorded in the external
`pr133-r1-correction-2026-10-04/ASTRA_REVIEW_HANDOFF.md`, alongside retained red
runs and intermediate failed harness/comparison probes. The historical main
Security Audit failure, graph map, retired development tagger and approved browser
floor above remain unchanged. This correction awaits fresh independent review.

## Limits and programme boundary

No DMS SOT file or programme checkpoint is restamped. Phase 1 remains partial,
and all OPEN policies and PR #132 accepted limitations persist: malformed child
rows hidden without repair; same-company reattachment, BYPASSRLS, concurrent
privileged parent changes, Storage/master-FK/history/atomicity; local Case versus
official RO identity/population; optional deposit and legacy behavior; allocator
and normalizer limits; worker replay, Employee/access convergence and follow-up
history. Repeated loan saves, array-position detail, Deal-wide status fanout and
zero-row success/activity remain unresolved; multiple applications prohibit
uniqueness/dedup shortcuts. No Financing, LOU, Stock, Registration, metrics,
lifecycle, policy, authorization or schema work is included. No production access,
deployment, merge, programme comments or next slice was performed.

Same-company follow-up source reattachment and created_at rewriting remain possible; the nominal 24-hour predicate guarantees neither immutable history nor a fixed correction window. This correction implements no history-control redesign.

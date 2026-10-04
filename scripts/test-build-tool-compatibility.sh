#!/usr/bin/env bash
# Reconstruct an unchanged baseline plus one source-only control. No external DB.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE_REF="${SB_BASELINE_REF:-1cfe067944f6e2b479efe8b72685f93bd2f8ae21}"
: "${SB_EVIDENCE_DIR:?Set SB_EVIDENCE_DIR to a new owned absolute evidence directory}"
[[ "$SB_EVIDENCE_DIR" = /* && ! -e "$SB_EVIDENCE_DIR" ]] || { echo 'Evidence path must be new and absolute.' >&2; exit 1; }
mkdir -p "$SB_EVIDENCE_DIR"
EVIDENCE_ROOT="$SB_EVIDENCE_DIR"
OWNED_DIR="$(mktemp -d /tmp/flc-build-tools.XXXXXX)"
BASELINE_DIR="$OWNED_DIR/baseline"
CONTROL_DIR="$OWNED_DIR/source-control"
cleanup() {
  local original_exit=$? cleanup_exit=0
  for checkout in "$BASELINE_DIR" "$CONTROL_DIR"; do
    if [[ "$checkout" == "$OWNED_DIR/"* && -e "$checkout" ]]; then
      git -C "$ROOT_DIR" worktree remove --force "$checkout" || cleanup_exit=1
    fi
  done
  if [[ "$cleanup_exit" == 0 ]]; then rm -rf -- "$OWNED_DIR"; fi
  printf 'original_exit=%s cleanup_exit=%s owned_dir=%s\n' "$original_exit" "$cleanup_exit" "$OWNED_DIR" > "$EVIDENCE_ROOT/cleanup.txt"
  if [[ "$cleanup_exit" != 0 ]]; then exit "$cleanup_exit"; fi
  exit "$original_exit"
}
trap cleanup EXIT
export VITE_SUPABASE_URL=https://ci-placeholder.supabase.co
export VITE_SUPABASE_ANON_KEY=ci_placeholder_anon_key_do_not_use_in_production
export VITE_HRMS_SUPABASE_URL="$VITE_SUPABASE_URL"
export VITE_HRMS_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY"
export VITE_HRMS_APP_URL=https://hrms.example.test
# New suite itself also blocks external traffic and supplies these same inputs.
git -C "$ROOT_DIR" worktree add --detach "$BASELINE_DIR" "$BASELINE_REF"
git -C "$ROOT_DIR" worktree add --detach "$CONTROL_DIR" "$BASELINE_REF"
for checkout in "$BASELINE_DIR" "$CONTROL_DIR"; do
  for file in playwright.build-tools.config.ts e2e/build-tool-compatibility.spec.ts e2e/fixtures/build-tools.html e2e/fixtures/build-tools.tsx; do
    mkdir -p "$(dirname "$checkout/$file")"
    cp "$ROOT_DIR/$file" "$checkout/$file"
  done
  (cd "$checkout" && npm ci) > "$EVIDENCE_ROOT/$(basename "$checkout")-install.log" 2>&1
 done
# The sole tracked control change. Its compiler/lock/app markup remain baseline.
python3 - "$CONTROL_DIR" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1]) / 'apps/hrms-web/tailwind.config.ts'
s = p.read_text()
needle = "    './index.html',"
assert s.count(needle) == 1
p.write_text(s.replace(needle, "    '../../packages/**/*.{ts,tsx}',\n" + needle))
PY
git -C "$BASELINE_DIR" diff --exit-code
git -C "$CONTROL_DIR" diff > "$EVIDENCE_ROOT/source-control.diff"
build_all() {
  (cd "$1" && npm run build && npm run build --workspace @flc/hrms-web && npm run build --workspace hrms-mobile) > "$EVIDENCE_ROOT/$2-builds.log" 2>&1
}
build_all "$BASELINE_DIR" baseline
build_all "$CONTROL_DIR" source-control
build_all "$ROOT_DIR" candidate
for server in dev preview; do
  export SB_SERVER="$server" SB_CAPTURE_BASELINE=1
  unset SB_REFERENCE_DIR SB_SOURCE_CONTROL_DIR
  export SB_EVIDENCE_DIR="$EVIDENCE_ROOT/baseline-$server"
  (cd "$BASELINE_DIR" && npx playwright test --config playwright.build-tools.config.ts) > "$EVIDENCE_ROOT/baseline-$server.log" 2>&1
  export SB_EVIDENCE_DIR="$EVIDENCE_ROOT/source-control-$server"
  (cd "$CONTROL_DIR" && npx playwright test --config playwright.build-tools.config.ts --grep hrms-web) > "$EVIDENCE_ROOT/source-control-$server.log" 2>&1
  python3 - "$EVIDENCE_ROOT" "$server" <<'PY'
from pathlib import Path
import shutil, sys
root, server = Path(sys.argv[1]), sys.argv[2]
for engine in ['chromium', 'firefox', 'webkit']:
    for p in (root / f'source-control-{server}' / engine).glob('hrms-web-*.png'):
        shutil.copyfile(p, root / f'baseline-{server}' / engine / (p.stem + '-source-control.png'))
PY
  unset SB_CAPTURE_BASELINE
  export SB_EVIDENCE_DIR="$EVIDENCE_ROOT/candidate-$server"
  export SB_REFERENCE_DIR="$EVIDENCE_ROOT/baseline-$server" SB_SOURCE_CONTROL_DIR="$EVIDENCE_ROOT/source-control-$server"
  (cd "$ROOT_DIR" && npx playwright test --config playwright.build-tools.config.ts) > "$EVIDENCE_ROOT/candidate-$server.log" 2>&1
 done
echo "Browser/style evidence retained at $EVIDENCE_ROOT; owned comparison worktrees will be removed."

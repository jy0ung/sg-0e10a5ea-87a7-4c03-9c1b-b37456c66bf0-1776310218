import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const [artifactRoot, output] = process.argv.slice(2);
if (!artifactRoot || !output) throw new Error('Usage: tsx scripts/build-tool-style-evidence.ts ARTIFACT_ROOT OUTPUT_JSON');
const prefix = (qualified: string, fallback: string) => fs.existsSync(path.join(artifactRoot, `${qualified}-dev`)) ? qualified : fallback;
const baselinePrefix = prefix('baseline-qualified', 'baseline');
const controlPrefix = prefix('source-control-qualified', 'source-control');
const candidatePrefix = prefix('candidate-qualified', 'candidate');
const digest = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
interface Change { explanation: string | null }
const states = [];
for (const server of ['dev', 'preview']) for (const engine of ['chromium', 'firefox', 'webkit']) {
  const folder = path.join(artifactRoot, `${candidatePrefix}-${server}`, engine);
  for (const file of fs.readdirSync(folder).filter(file => file.endsWith('.unexplained.json')).sort()) {
    const state = file.replace('.unexplained.json', '');
    const unresolved: unknown[] = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'));
    if (unresolved.length) throw new Error(`${server}/${engine}/${state}: ${unresolved.length} unexplained differences`);
    const reviewFile = path.join(folder, `${state}.reviewed.json`);
    const review: Change[] = JSON.parse(fs.readFileSync(reviewFile, 'utf8'));
    const reasons: Record<string, number> = {};
    for (const change of review) {
      if (!change.explanation) throw new Error(`Unreviewed change in ${reviewFile}`);
      reasons[change.explanation] = (reasons[change.explanation] ?? 0) + 1;
    }
    const sources = [
      path.join(`${baselinePrefix}-${server}`, engine, `${state}.png`),
      path.join(`${baselinePrefix}-${server}`, engine, `${state}.json`),
      path.join(`${candidatePrefix}-${server}`, engine, `${state}.png`),
      path.join(`${candidatePrefix}-${server}`, engine, `${state}.json`),
      path.join(`${candidatePrefix}-${server}`, engine, `${state}.changes.json`),
      path.join(`${candidatePrefix}-${server}`, engine, `${state}.reviewed.json`),
    ];
    if (state.startsWith('hrms-web-')) sources.push(path.join(`${controlPrefix}-${server}`, engine, `${state}.png`), path.join(`${controlPrefix}-${server}`, engine, `${state}.json`));
    states.push({ server, engine, state, changedProperties: review.length, explanations: reasons, unexplained: unresolved.length,
      sourceControl: state.startsWith('hrms-web-'), artifacts: sources.map(file => ({ path: file, sha256: digest(path.join(artifactRoot, file)) })) });
  }
}
// Require every original state by identity, not just a count that new R1 states
// could accidentally satisfy while an established regression disappeared.
const expected = new Set<string>();
for (const server of ['dev', 'preview']) for (const engine of ['chromium', 'firefox', 'webkit']) {
  for (const app of ['ubs', 'hrms-web', 'hrms-mobile']) for (const size of ['desktop', 'mobile']) for (const theme of ['light', 'dark']) {
    for (const state of app === 'hrms-mobile' ? ['profile', 'focus', 'validation'] : ['table', 'form', 'overlay']) expected.add(`${server}/${engine}/${app}-${size}-${theme}-${state}`);
  }
  if (server === 'dev') for (const state of ['open-state', 'focus', 'popover']) expected.add(`${server}/${engine}/shared-ui-${state}`);
  for (const scene of ['vertical', 'horizontal', 'override']) expected.add(`${server}/${engine}/r1-carousel-${scene}`);
  for (const scene of ['dialog', 'alert', 'select']) for (const progress of [25, 50, 75, 100]) expected.add(`${server}/${engine}/r1-${scene}-enter-${progress}`);
}
const actual = new Set(states.map(state => `${state.server}/${state.engine}/${state.state}`));
if (actual.size !== expected.size || [...expected].some(state => !actual.has(state))) throw new Error(`Expected all 225 retained + 90 R1 states; found ${states.length}`);
const result = { baselineCommit: '1cfe067944f6e2b479efe8b72685f93bd2f8ae21', artifactRoot,
  method: 'Unchanged baseline; original HRMS differences retained plus independently compiled one-source-entry v3 control. All 225 original states retained with finite animations finished; 90 additional R1 states exercise actual Carousel controls and paused real Dialog/AlertDialog/Select animations at 25/50/75/100 percent. Neutral hover; mocked auth/API; external traffic blocked. No candidate rebaselining.',
  pixelPolicy: { yiqThreshold: 0.1, maximumPixelsBeyondThreshold: 0, snapshotUpdates: 'none' },
  totalStates: states.length, retainedStates: 225, additionalR1States: 90, totalChangedProperties: states.reduce((total, state) => total + state.changedProperties, 0), unexplained: 0, states };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');

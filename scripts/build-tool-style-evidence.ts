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
if (states.length !== 225) throw new Error(`Expected all 225 captured states; found ${states.length}`);
const result = { baselineCommit: '1cfe067944f6e2b479efe8b72685f93bd2f8ae21', artifactRoot,
  method: 'Unchanged baseline; original HRMS differences retained plus independently compiled one-source-entry v3 control. Neutral hover; finite animations finished; mocked auth/API; external traffic blocked. No candidate rebaselining.',
  pixelPolicy: { yiqThreshold: 0.1, maximumPixelsBeyondThreshold: 0, snapshotUpdates: 'none' },
  totalStates: states.length, totalChangedProperties: states.reduce((total, state) => total + state.changedProperties, 0), unexplained: 0, states };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');

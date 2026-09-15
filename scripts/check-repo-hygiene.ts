import { execFileSync } from 'node:child_process';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const forbidden = tracked.filter((file) => {
  const name = file.split('/').at(-1)!;
  const environmentFile = (name === '.env' || name.startsWith('.env.')) && !name.endsWith('.example');
  return environmentFile
    || /(^|\/)(node_modules|dist|coverage|test-results|playwright-report)\//.test(file)
    || /(^|\/)(bun\.lockb?|yarn\.lock|pnpm-lock\.yaml)$/.test(file)
    || /(^|\/)supabase\/\.(temp|branches)\//.test(file);
});

if (forbidden.length) {
  console.error(`Repository hygiene failed. Remove these local/generated files from Git tracking:\n${forbidden.join('\n')}`);
  process.exit(1);
}
console.info('Repository hygiene passed: npm lockfile, environment templates, and source files only.');

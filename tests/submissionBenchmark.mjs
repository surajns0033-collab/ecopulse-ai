import { spawnSync } from 'node:child_process';
import { appendFileSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run the submission benchmark with npm run benchmark:submission.');

const scenarios = 'tests/submissionScenarios.test.js';
const clientEnvironment = 'tests/clientEnvironment.test.js';
const unitTests = globSync('tests/**/*.test.{js,cjs,mjs}', { cwd: root })
  .map(path => path.replaceAll('\\', '/'))
  .filter(path => path !== scenarios && path !== clientEnvironment)
  .sort();
if (!unitTests.length) throw new Error('No unit test files were discovered.');

const checks = [
  { id: 'lint', label: 'Lint and function complexity', args: [npm, 'run', 'lint'] },
  { id: 'inventory', label: 'Source-wide maintainability scan', args: [npm, 'run', 'quality:inventory'] },
  { id: 'audit', label: 'Dependency advisories', args: [npm, 'audit', '--audit-level=moderate'] },
  { id: 'client', label: 'Browser credential isolation', args: ['--test', clientEnvironment] },
  { id: 'unit', label: 'Node regressions and source coverage', args: [
    '--test', '--experimental-test-coverage', '--test-coverage-include=src/**', '--test-coverage-include=server/**',
    '--test-coverage-lines=80', '--test-coverage-branches=75', '--test-coverage-functions=85', ...unitTests,
  ] },
  { id: 'plans', label: 'Smog scenarios and request counts', args: [npm, 'run', 'benchmark'] },
  { id: 'build', label: 'Production build', args: [npm, 'run', 'build'] },
  { id: 'size', label: 'Bundle budgets and local photo inference', after: 'build', args: ['--test', 'tests/vision.browser.mjs'] },
  { id: 'ui', label: 'Keyboard, axe and browser workflows', after: 'build', args: [
    '--test', 'tests/cleanAir.browser.mjs', 'tests/meetups.browser.mjs',
  ] },
  { id: 'rules', label: 'Private records and Firestore permissions', args: [npm, 'run', 'test:rules'] },
];

const criteria = [
  ['Code Quality', 'High', ['lint', 'inventory']],
  ['Security', 'Medium', ['audit', 'client', 'rules']],
  ['Efficiency', 'Medium', ['plans', 'size']],
  ['Testing', 'Low', ['unit', 'plans', 'ui', 'client', 'rules', 'size']],
  ['Accessibility', 'Low', ['ui']],
  ['Problem Statement Alignment', 'High', ['plans', 'ui']],
];

const results = new Map();
for (const check of checks) {
  if (check.after && results.get(check.after) !== 'PASS') {
    results.set(check.id, 'BLOCKED');
    console.log(check.label + ' blocked by ' + check.after);
    continue;
  }
  const grouped = process.env.GITHUB_ACTIONS === 'true';
  console.log(grouped ? '::group::' + check.label : '\n' + check.label);
  const run = spawnSync(process.execPath, check.args, {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, VITE_FIREBASE_API_KEY: 'demo-key' },
  });
  if (run.error) console.error(run.error.message);
  if (grouped) console.log('::endgroup::');
  results.set(check.id, run.status === 0 ? 'PASS' : 'FAIL');
}

const report = [
  '## EcoPulse submission benchmark', '',
  '| Criterion | Impact | Result | Checks |', '| --- | --- | --- | --- |',
];
for (const [name, impact, ids] of criteria) {
  const statuses = ids.map(id => results.get(id));
  const result = statuses.includes('FAIL') ? 'FAIL' : statuses.includes('BLOCKED') ? 'BLOCKED' : 'PASS';
  const evidence = ids.map(id => checks.find(check => check.id === id).label + ' (' + results.get(id) + ')');
  report.push('| ' + [name, impact, result, evidence.join(', ')].join(' | ') + ' |');
}
const summary = report.join('\n') + '\n';
console.log('\n' + summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if ([...results.values()].some(status => status !== 'PASS')) process.exitCode = 1;

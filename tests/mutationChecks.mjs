import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const checks = [
  { file: 'src/agent/requestedForecast.js', before: 'tomorrow.test(text) ? 1 : 0', after: '0',
    suite: 'tests/requestedForecast.test.js', name: 'a requested local morning uses only available forecast slots and flags the higher school exposure' },
  { file: 'src/agent/smogAdvice.js', before: 'if (noVentedHood)', after: 'if (!noVentedHood)',
    suite: 'tests/plannerLanguage.test.js', name: 'cooking advice respects a household without an exhaust hood' },
  { file: 'src/services/photoAssessment.js', before: 'confidence >= 0.6', after: 'confidence >= 0',
    suite: 'tests/photoAssessment.test.js', name: 'missing, low and out-of-range model certainty request a human observation' },
];
const copy = mkdtempSync(join(tmpdir(), 'ecopulse-mutations-'));
try {
  writeFileSync(join(copy, 'package.json'), '{"type":"module"}');
  cpSync(join(root, 'src'), join(copy, 'src'), { recursive: true });
  mkdirSync(join(copy, 'tests'));
  for (const check of checks) {
    cpSync(join(root, check.suite), join(copy, check.suite));
    const path = join(copy, check.file);
    const original = readFileSync(path, 'utf8');
    if (original.split(check.before).length !== 2) throw new Error('Review mutation target in ' + check.file);
    const run = () => spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern', check.name, check.suite],
      { cwd: copy, encoding: 'utf8' });
    const originalRun = run();
    if (originalRun.status !== 0) throw new Error('Original regression failed: ' + originalRun.stdout + originalRun.stderr);
    writeFileSync(path, original.replace(check.before, check.after));
    const mutant = run();
    writeFileSync(path, original);
    if (mutant.status !== 1 || !mutant.stdout.split('\n').some(line => line.startsWith('not ok ') && line.includes(check.name))) {
      throw new Error('Expected the named regression to reject the mutation in ' + check.file + '\n' + mutant.stdout + mutant.stderr);
    }
    console.log('Detected mutation in ' + check.file + ' with ' + check.suite);
  }
} finally {
  rmSync(copy, { recursive: true, force: true });
}

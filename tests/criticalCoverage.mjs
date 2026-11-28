import { globSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Pin the domain boundaries being measured so feature additions cannot silently
// change the denominator. Browser and emulator checks run in their own suites.
const groups = {
  'src/agent': ['intentEngine', 'intentKeywords', 'localizedIntents', 'chatLanguage', 'placeContext',
    'smogPlan', 'smogForecast', 'smogAdvice', 'smogProfile', 'requestedForecast'],
  'src/services': ['airQuality', 'environmentCache', 'photoAssessment', 'emailDrafts', 'meetupDiscovery'],
  'server': ['chatRequest', 'chatValidation'],
};
const include = Object.entries(groups).flatMap(([directory, files]) =>
  files.map(file => '--test-coverage-include=' + directory + '/' + file + '.js'));
const tests = globSync('tests/*.test.js').sort();
const run = spawnSync(process.execPath, ['--test', '--experimental-test-coverage', ...include,
  '--test-coverage-lines=90', '--test-coverage-branches=90', '--test-coverage-functions=95', ...tests],
  { stdio: 'inherit' });
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;

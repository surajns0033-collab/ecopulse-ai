import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveConfig } from 'vite';

test('the browser can read its Firebase and weather settings but cannot read AI provider keys', async t => {
  const publicNames = ['VITE_FIREBASE_PROJECT_ID', 'VITE_WAQI_TOKEN', 'VITE_OPENWEATHER_API_KEY'];
  const serverNames = ['GEMINI_API_KEY', 'VITE_GEMINI_API_KEY', 'VITE_TAVILY_API_KEY', 'VITE_OPENROUTER_API_KEY'];
  for (const name of [...publicNames, ...serverNames]) {
    const original = process.env[name];
    process.env[name] = 'ecopulse-test-' + name.toLowerCase();
    t.after(() => {
      if (original === undefined) delete process.env[name];
      else process.env[name] = original;
    });
  }
  const { env } = await resolveConfig({ logLevel: 'silent' }, 'build', 'production');
  for (const name of publicNames) assert.equal(env[name], process.env[name], name);
  for (const name of serverNames) assert.equal(Object.hasOwn(env, name), false, name + ' must stay on the server');
});

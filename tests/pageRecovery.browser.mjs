import assert from 'node:assert/strict';
import test from 'node:test';
import { openBrowser } from './browserSupport.mjs';

test('an unavailable Chat bundle shows an accessible retry and recovers on reload', { timeout: 60000 }, async t => {
  const { origin, context } = await openBrowser(t);
  const page = await context.newPage();
  const diagnostics = [];
  page.on('console', message => {
    if (message.text().startsWith('{"application":"ecopulse"')) diagnostics.push(JSON.parse(message.text()));
  });
  let blocked = true;
  await context.route(/\/assets\/ChatPage-[^/]+\.js$/, route => blocked ? route.abort() : route.continue());
  await page.goto(origin);
  await page.getByRole('button', { name: 'Continue as Guest' }).click();
  const recovery = page.getByRole('main', { name: 'Page recovery' });
  await recovery.getByRole('heading', { name: /couldn’t load this page/ }).waitFor();
  assert.deepEqual(diagnostics, [{ application: 'ecopulse', operation: 'ui.render' }]);
  blocked = false;
  await recovery.getByRole('button', { name: 'Reload page' }).click();
  await page.getByRole('textbox', { name: 'Message input' }).waitFor();
});

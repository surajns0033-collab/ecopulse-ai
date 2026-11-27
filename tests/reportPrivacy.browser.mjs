import test from 'node:test';
import assert from 'node:assert/strict';
import { auditAccessibility, openBrowser } from './browserSupport.mjs';
import { mockDelhi, ask } from './cleanAirFixtures.mjs';

test('a saved report opens from its Chat confirmation and stays private across device sessions', { timeout: 90000 }, async t => {
  const { context, origin } = await openBrowser(t);
  await mockDelhi(context);
  await context.route('**/api/ai/chat', route => route.fulfill({ status: 503, json: { error: 'Fixture offline' } }));
  const owner = await context.newPage();
  await owner.goto(origin);
  await owner.getByRole('button', { name: 'Continue as Guest' }).click();
  await ask(owner, 'I saw garbage dumping near our street in Delhi, India.');
  const edit = owner.getByRole('button', { name: /Edit/ });
  await edit.click();
  const form = owner.getByRole('form', { name: 'Edit report preview' });
  await form.getByLabel('Title').fill('Discard this change');
  await form.getByRole('button', { name: 'Cancel editing' }).click();
  assert.doesNotMatch(await owner.getByRole('log').innerText(), /Discard this change/);
  await edit.click();
  await form.getByLabel('Title').fill('Waste beside the market');
  await form.getByLabel('Location').fill('Market Road, Delhi');
  await form.getByRole('button', { name: 'Apply changes' }).click();
  const map = owner.getByRole('link', { name: 'Market Road, Delhi' });
  assert.match(await map.getAttribute('href'), /query=Market%20Road%2C%20Delhi/);
  await owner.getByRole('button', { name: /Submit Report/ }).click();
  await owner.getByRole('button', { name: 'View my report' }).click();
  const details = owner.getByRole('main', { name: 'Report details' });
  await details.getByText('Report saved on this device').waitFor();
  await details.getByText('Waste beside the market').waitFor();
  const address = owner.url();
  await owner.reload();
  await details.getByText('Report saved on this device').waitFor();
  await auditAccessibility(owner, 'Private report');

  const other = await context.newPage();
  await other.goto(address);
  await other.getByRole('button', { name: 'Continue as Guest' }).click();
  await other.getByRole('alert').filter({ hasText: 'Report not found for this account' }).waitFor();
  assert.doesNotMatch(await other.getByRole('main').innerText(), /garbage dumping/i);

  await owner.evaluate(() => {
    const user = JSON.parse(sessionStorage.getItem('ecopulse_device_session'));
    localStorage.setItem('echopulse_local_reports', JSON.stringify([{ id: 'EP-LEGACY', reportId: 'EP-LEGACY',
      userId: user.uid, title: 'Previous device report', description: 'Older local record', status: 'submitted' }]));
  });
  await owner.goto(origin + '/report/EP-LEGACY');
  await owner.getByText('Previous device report').waitFor();
  await other.goto(origin + '/report/EP-LEGACY');
  await other.getByRole('alert').filter({ hasText: 'Report not found for this account' }).waitFor();
});

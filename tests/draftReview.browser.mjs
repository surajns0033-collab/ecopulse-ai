import assert from 'node:assert/strict';
import test from 'node:test';
import { openBrowser, auditAccessibility } from './browserSupport.mjs';
import { mockDelhi } from './cleanAirFixtures.mjs';
import { photoFixtures } from './photoFixtures.mjs';

test('photo evidence and the original note reach an editable draft and require user review', { timeout: 90000 }, async t => {
  const { context, origin } = await openBrowser(t);
  await mockDelhi(context);
  const observed = 'Light smoke appears above a bin.';
  const note = 'I saw garbge near Market Road in Delhi, India.';
  let photoRequest;
  await context.route('**/api/ai/chat', route => {
    photoRequest = route.request().postDataJSON();
    return route.fulfill({ json: { provider: 'test-fixture', text: JSON.stringify({ issue: 'Possible smoke',
      description: observed, category: 'burning', severity: 'mild', confidence: 0.75, actions: [], visibleText: [] }) } });
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole('button', { name: 'Continue as Guest' }).click();
  await page.getByRole('textbox', { name: 'Message input' }).fill(note);
  const [mimeType, jpeg] = photoFixtures[0];
  await page.locator('input[type=file]').setInputFiles({ name: 'photo.jpg', mimeType, buffer: Buffer.from(jpeg, 'base64') });
  await page.getByRole('button', { name: 'Remove image' }).waitFor();
  await page.getByRole('button', { name: 'Send message' }).click();
  const card = page.locator('.inline-card').filter({ has: page.getByText('Email Draft', { exact: true }) });
  await card.waitFor();
  assert.equal(photoRequest.images.length, 1);
  assert.ok(photoRequest.messages[0].text.includes(note));
  assert.ok(!photoRequest.system.includes(note));
  assert.ok((await card.innerText()).includes(note));
  await auditAccessibility(page, 'Editable photo complaint and email draft');
  await card.getByRole('button', { name: /Open in Gmail/ }).click();
  await card.getByRole('button', { name: /Yes, Open Gmail/ }).waitFor();
  assert.equal(context.pages().length, 1);
  await card.getByRole('button', { name: 'Cancel', exact: true }).click();
  await card.getByRole('button', { name: /Edit/ }).click();
  const body = card.getByRole('textbox', { name: 'Draft body' });
  assert.ok((await body.inputValue()).includes(observed));
  await body.fill('Reviewed note: smoke was visible near the bin.');
  await card.getByRole('button', { name: 'Done editing' }).click();
  await card.getByRole('button', { name: /Save Draft/ }).click();
  await page.getByText('Draft saved on this device. Nothing was sent.').waitFor();
  const local = await page.evaluate(() => Object.keys(localStorage)
    .filter(key => key.startsWith('ecopulse_private_draft:')).map(key => JSON.parse(localStorage.getItem(key))));
  assert.equal(local.length, 1);
  assert.equal(local[0].body, 'Reviewed note: smoke was visible near the bin.');
  assert.equal(local[0].status, 'draft');
});

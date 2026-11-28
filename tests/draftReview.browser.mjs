import assert from 'node:assert/strict';
import test from 'node:test';
import { openBrowser, auditAccessibility } from './browserSupport.mjs';
import { ask, mockDelhi } from './cleanAirFixtures.mjs';
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
  const preview = card.getByRole('region', { name: 'Draft body preview' });
  await preview.focus();
  assert.ok(await preview.evaluate(element => element === document.activeElement));
  await page.keyboard.press('ArrowDown');
  await auditAccessibility(page, 'Editable photo complaint and email draft');
  await card.getByRole('button', { name: /Open in Gmail/ }).click();
  await card.getByRole('button', { name: /Yes, Open Gmail/ }).waitFor();
  assert.equal(context.pages().length, 1);
  await page.keyboard.press('Escape');
  assert.ok(await card.getByRole('button', { name: /Open in Gmail/ }).evaluate(button => button === document.activeElement));
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

test('a confirmed incident stays with its city in typed drafts and report shortcuts', { timeout: 60000 }, async t => {
  const { context, origin } = await openBrowser(t);
  await mockDelhi(context);
  await context.route('https://geocoding-api.open-meteo.com/**', route => {
    if (new URL(route.request().url()).searchParams.get('name') !== 'Pune') return route.fallback();
    return route.fulfill({ json: { results: [{ name: 'Pune', admin1: 'Maharashtra', country: 'India',
      country_code: 'IN', feature_code: 'PPLA', population: 1000000, latitude: 18.52, longitude: 73.86 }] } });
  });
  // The model summary differs from the observation, as it can in a real preview.
  await context.route('**/api/ai/chat', route => route.fulfill({ json: { provider: 'test-fixture',
    text: JSON.stringify({ title: 'Waste at the gate', description: 'Edited by the model.' }) } }));
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole('button', { name: 'Continue as Guest' }).click();
  const log = page.getByRole('log', { name: 'Chat messages' });
  const note = 'I saw garbge in Dehli near the gate.';
  await ask(page, note);
  await log.getByText('Did you mean Delhi, India?', { exact: true }).waitFor();
  await ask(page, 'haan');
  await log.getByText('Report Preview', { exact: true }).waitFor();

  const drafts = log.locator('.inline-card').filter({ has: page.getByText('Email Draft', { exact: true }) });
  await ask(page, 'Draft email');
  const nextReply = log.locator('.chat-bubble-ai').last();
  await drafts.first().or(log.getByText(/What happened, where exactly/)).first().waitFor();
  assert.equal(await drafts.count(), 1, await nextReply.innerText());
  assert.ok((await drafts.first().innerText()).includes(note));
  assert.doesNotMatch(await drafts.first().innerText(), /Edited by the model/);

  await ask(page, 'Set my city to Pune');
  await log.getByText(/is your selected city for Chat/).waitFor();
  await ask(page, 'Draft email');
  await log.getByText(/What happened, where exactly/).waitFor();
  assert.equal(await drafts.count(), 1);

  await log.getByRole('button', { name: '📧 Draft Email', exact: true }).click();
  await drafts.nth(1).waitFor();
  const fromReport = await drafts.nth(1).innerText();
  assert.ok(fromReport.includes(note));
  assert.match(fromReport, /Delhi, India/);
  assert.doesNotMatch(fromReport, /Pune|Edited by the model/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

test('Chat and Events share device-only attendance across tabs and refresh', { timeout: 90000 }, async t => {
  const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  t.after(() => server.close());
  const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin ? route.continue() : route.abort();
  });
  async function openGuest() {
    const page = await context.newPage();
    await page.goto(origin + '/meetups');
    await page.getByRole('button', { name: 'Continue as Guest' }).click();
    return page;
  }

  const first = await openGuest();
  await first.getByRole('button', { name: 'Create Meetup', exact: true }).first().click();
  await first.getByLabel('Event Title').fill('Neighbourhood clean-air walk');
  await first.getByLabel('Location / City').fill('Pune');
  await first.getByLabel('Places available').fill('1');
  await first.getByRole('button', { name: /Publish Meetup/ }).click();
  await first.getByRole('heading', { name: 'Neighbourhood clean-air walk' }).waitFor();
  const other = await openGuest();
  await other.getByRole('button', { name: 'Join event', exact: true }).waitFor();

  await first.getByRole('button', { name: 'Chat', exact: true }).click();
  await first.getByRole('textbox', { name: 'Message input' }).fill('Find eco-meetups near me');
  await first.getByRole('button', { name: 'Send message', exact: true }).click();
  await first.getByRole('button', { name: 'Join event', exact: true }).click();
  await first.getByText(/Your place is confirmed/).waitFor();
  await first.getByRole('button', { name: 'Cancel my place', exact: true }).waitFor();
  const full = other.getByRole('button', { name: 'Event full', exact: true });
  await full.waitFor();
  assert.equal(await full.isDisabled(), true);
  await other.getByText('1 / 1', { exact: true }).waitFor();

  await first.getByRole('button', { name: 'Events', exact: true }).click();
  await first.reload();
  await first.getByRole('button', { name: 'Cancel my place', exact: true }).click();
  await first.getByText('0 / 1', { exact: true }).waitFor();
  await other.getByRole('button', { name: 'Join event', exact: true }).click();
  await other.getByText('1 / 1', { exact: true }).waitFor();
  await other.getByRole('button', { name: 'Chat', exact: true }).click();
  await other.getByRole('textbox', { name: 'Message input' }).fill('Find eco-meetups near me');
  await other.getByRole('button', { name: 'Send message', exact: true }).click();
  await other.getByRole('button', { name: 'Cancel my place', exact: true }).click();
  await other.getByText(/Your place has been cancelled/).waitFor();
  await first.getByText('0 / 1', { exact: true }).waitFor();
});

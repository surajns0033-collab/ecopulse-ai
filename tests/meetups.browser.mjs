import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditAccessibility, openBrowser } from './browserSupport.mjs';

test('Chat and Events share device-only attendance across tabs and refresh', { timeout: 90000 }, async t => {
  const { context, origin } = await openBrowser(t);
  async function openGuest() {
    const page = await context.newPage();
    await page.goto(origin + '/meetups');
    await page.getByRole('button', { name: 'Continue as Guest' }).click();
    return page;
  }

  const first = await openGuest();
  const create = first.getByRole('button', { name: 'Create Meetup', exact: true }).first();
  await create.click();
  const dialog = first.getByRole('dialog', { name: /Create Eco Meetup/ });
  await dialog.waitFor();
  assert.equal(await first.getByLabel('Event Title').evaluate(el => el === document.activeElement), true);
  await first.keyboard.press('Shift+Tab');
  await first.keyboard.press('Shift+Tab');
  assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
  await first.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await create.evaluate(el => el === document.activeElement), true);
  await create.press('Enter');
  await auditAccessibility(first, 'Create meetup dialog');
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

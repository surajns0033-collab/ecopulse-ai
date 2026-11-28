import test from 'node:test';
import assert from 'node:assert/strict';
import { openBrowser } from './browserSupport.mjs';

test('device Guest stays available and an unreadable photo never enters chat', { timeout: 60000 }, async t => {
  const { context, origin } = await openBrowser(t);
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole('button', { name: 'Continue as Guest' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Continue with Google' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Continue as Guest' }).click();
  const composer = page.getByRole('textbox', { name: 'Message input' });
  await composer.fill('This note should stay in the composer.');
  await page.locator('input[type=file]').setInputFiles({
    name: 'damaged.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([255, 216, 255, 224]),
  });
  await page.getByRole('alert').filter({ hasText: /photo|image/i }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Remove image' }).count(), 0);
  assert.equal(await composer.inputValue(), 'This note should stay in the composer.');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { openBrowser } from './browserSupport.mjs';
import { photoFixtures } from './photoFixtures.mjs';

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

test('sending a note while its image is being prepared keeps both together', { timeout: 60000 }, async t => {
  const { context, origin } = await openBrowser(t);
  await context.addInitScript(() => {
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      if (this.src.startsWith('blob:')) await new Promise(resolve => { window.finishPhotoDecode = resolve; });
      return decode.call(this);
    };
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole('button', { name: 'Continue as Guest' }).click();
  const composer = page.getByRole('textbox', { name: 'Message input' });
  const note = 'Smoke above the road this morning.';
  await composer.fill(note);
  const [mimeType, bytes] = photoFixtures[0];
  await page.locator('input[type=file]').setInputFiles({ name: 'note.jpg', mimeType, buffer: Buffer.from(bytes, 'base64') });
  await page.waitForFunction(() => typeof window.finishPhotoDecode === 'function');
  assert.equal(await page.getByRole('button', { name: 'Send message' }).isDisabled(), true);
  await composer.press('Enter');
  assert.equal(await composer.inputValue(), note);
  assert.equal(await page.getByRole('log').getByText(note, { exact: true }).count(), 0);
  await page.evaluate(() => window.finishPhotoDecode());
  await page.getByRole('button', { name: 'Remove image' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Send message' }).isEnabled(), true);
  assert.equal(await composer.inputValue(), note);
});

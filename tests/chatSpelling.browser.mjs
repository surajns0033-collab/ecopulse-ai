import assert from 'node:assert/strict';
import test from 'node:test';
import { openBrowser } from './browserSupport.mjs';
import { ask, mockDelhi } from './cleanAirFixtures.mjs';

test('a guest can type a misspelled bilingual plan and ask a misspelled forecast follow-up', { timeout: 60000 }, async t => {
  const { context, origin } = await openBrowser(t);
  await mockDelhi(context);
  // 09:30 tomorrow in the fixture city regardless of the runner's time zone.
  const localDay = new Date(Date.now() + 330 * 60000);
  const tomorrow = Date.UTC(localDay.getUTCFullYear(), localDay.getUTCMonth(), localDay.getUTCDate() + 1, 4);
  await context.route('https://air-quality-api.open-meteo.com/**', route => {
    if (!new URL(route.request().url()).searchParams.has('hourly')) return route.fallback();
    return route.fulfill({ json: { timezone: 'Asia/Kolkata', current: { time: Math.floor(Date.now() / 1000) },
      hourly: { time: [tomorrow / 1000], us_aqi: [132] } } });
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole('button', { name: 'Continue as Guest' }).click();
  const log = page.getByRole('log', { name: 'Chat messages' });
  const plan = 'mera smgo plan banao in Delhi, India. I cycle to work.';
  await ask(page, plan);
  await log.getByText(plan, { exact: true }).waitFor();
  const answer = log.locator('.chat-bubble-ai').filter({ hasText: 'Your clean-air plan' });
  await answer.waitFor();
  assert.match(await answer.innerText(), /Delhi/i);
  assert.match(await answer.innerText(), /walk\/cycle/);

  const forecast = 'air polution forcast in Delhi, India tommorow morning';
  await ask(page, forecast);
  await log.getByText(forecast, { exact: true }).waitFor();
  const followUp = log.locator('.chat-bubble-ai').filter({ hasText: 'Available hourly forecast' });
  await followUp.waitFor();
  assert.match(await followUp.innerText(), /Delhi.*Asia\/Kolkata.*modeled U.S. AQI 132/is);
  assert.doesNotMatch(await followUp.innerText(), /208/);
});

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

  const mistypedCity = 'Check air qualty in Dehli, India';
  await ask(page, mistypedCity);
  await log.getByText(mistypedCity, { exact: true }).waitFor();
  await log.getByText('Did you mean Delhi, India?', { exact: true }).waitFor();
  await ask(page, 'haan');
  await log.locator('.chat-bubble-ai').filter({ hasText: /current air quality for Delhi, India/i }).waitFor();
  assert.ok(await log.getByText(mistypedCity, { exact: true }).isVisible());
});

test('official smog questions use only the current question for search and require a source', { timeout: 60000 }, async t => {
  const { context, origin } = await openBrowser(t);
  const { counts } = await mockDelhi(context);
  const requests = [];
  const source = { title: 'Fixture public bulletin', url: 'https://example.org/fixture-bulletin' };
  await context.route('**/api/ai/chat', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { provider: 'test-fixture', text: 'Fixture policy response.',
      sources: requests.length === 1 ? [source] : [] } });
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole('button', { name: 'Continue as Guest' }).click();
  const log = page.getByRole('log', { name: 'Chat messages' });
  await ask(page, 'Set my city to Delhi');
  await log.getByText(/is your selected city for Chat/).waitFor();

  const question = 'Delhi ka sarkari smgo plan kya hai?';
  await ask(page, question);
  const citation = log.getByRole('link', { name: source.url });
  await citation.waitFor();
  assert.equal(await citation.getAttribute('href'), source.url);
  assert.equal(requests[0].useSearch, true);
  assert.deepEqual(requests[0].messages, [{ role: 'user', text: question }]);

  await ask(page, 'What is the government’s official smog plan in Delhi?');
  await log.getByText(/couldn't get a sourced web answer/i).waitFor();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].useSearch, true);
  assert.deepEqual(counts, { aqi: 0, weather: 0, forecast: 0 });
});

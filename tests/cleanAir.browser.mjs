import test from 'node:test';
import assert from 'node:assert/strict';
import { auditAccessibility, openBrowser } from './browserSupport.mjs';

async function mockDelhi(context) {
  const counts = { aqi: 0, weather: 0, forecast: 0 };
  const data = { ageHours: 0 };
  await context.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({ json: { results: [{
    name: 'Delhi', admin1: 'Delhi', country: 'India', country_code: 'IN', feature_code: 'PPLC',
    population: 1000000, latitude: 28.6, longitude: 77.2,
  }] } }));
  await context.route('https://air-quality-api.open-meteo.com/**', route => {
    const url = new URL(route.request().url());
    const now = Date.now();
    if (url.searchParams.has('hourly')) {
      counts.forecast++;
      const nextDaylight = new Date(now);
      nextDaylight.setUTCHours(5, 0, 0, 0);
      if (nextDaylight.getTime() <= now) nextDaylight.setUTCDate(nextDaylight.getUTCDate() + 1);
      return route.fulfill({ json: { timezone: 'Asia/Kolkata', current: { time: Math.floor(now / 1000) },
        hourly: { time: [nextDaylight.getTime() / 1000], us_aqi: [119] } } });
    }
    counts.aqi++;
    return route.fulfill({ json: { current: { us_aqi: 208, pm2_5: 73, pm10: 110, nitrogen_dioxide: 24, ozone: 18,
      time: new Date(now - data.ageHours * 3600000).toISOString() } } });
  });
  await context.route('https://api.open-meteo.com/**', route => {
    counts.weather++;
    return route.fulfill({ json: { current: { temperature_2m: 18, wind_speed_10m: 4, weather_code: 0 } } });
  });
  return { counts, data };
}

async function ask(page, text) {
  const input = page.getByRole('textbox', { name: 'Message input' });
  await input.fill(text);
  await input.press('Enter');
}

test('a Guest can plan a school smog day with a keyboard and stale readings stay out of Chat', { timeout: 90000 }, async t => {
  const { context, origin } = await openBrowser(t);
  const { counts, data } = await mockDelhi(context);
  const page = await context.newPage();
  await page.goto(origin);
  const guest = page.getByRole('button', { name: 'Continue as Guest' });
  await guest.waitFor();
  await auditAccessibility(page, 'Sign-in choices');
  await guest.press('Enter');
  await ask(page, 'Make a smog plan for our school in Delhi, India.');
  const log = page.getByRole('log', { name: 'Chat messages' });
  await log.getByText(/switch off engines at the school gate/i).waitFor();
  const answer = await log.innerText();
  assert.match(answer, /AQI: 208/);
  assert.match(answer, /still unhealthy for sensitive groups/);
  assert.match(answer, /Move outdoor assembly/);
  await log.getByRole('img', { name: 'U.S. AQI 208' }).waitFor();
  assert.deepEqual(counts, { aqi: 1, weather: 1, forecast: 1 });
  await page.setViewportSize({ width: 320, height: 800 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await auditAccessibility(page, 'Chat smog plan at 320 pixels');

  data.ageHours = 4;
  await page.reload();
  await ask(page, 'Check AQI in Delhi, India.');
  await log.getByText(/couldn't verify the air-quality reading/i).waitFor();
  assert.doesNotMatch(await log.innerText(), /208/);

  const menu = page.getByRole('button', { name: 'User menu' });
  const exit = page.getByRole('button', { name: 'Exit Guest Mode' });
  await menu.press('Enter');
  assert.equal(await menu.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Tab');
  assert.equal(await exit.evaluate(el => el === document.activeElement), true);
  await auditAccessibility(page, 'Account menu');
  await page.keyboard.press('Escape');
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  assert.equal(await menu.evaluate(el => el === document.activeElement), true);
  await menu.press('Enter');
  await exit.press('Enter');
  await guest.waitFor();
  await page.reload();
  await guest.waitFor();
});

test('a saved report opens from its Chat confirmation and stays private across device sessions', { timeout: 90000 }, async t => {
  const { context, origin } = await openBrowser(t);
  await mockDelhi(context);
  await context.route('**/api/ai/chat', route => route.fulfill({ status: 503, json: { error: 'Fixture offline' } }));
  const owner = await context.newPage();
  await owner.goto(origin);
  await owner.getByRole('button', { name: 'Continue as Guest' }).click();
  await ask(owner, 'I saw garbage dumping near our street in Delhi, India.');
  await owner.getByRole('button', { name: /Submit Report/ }).click();
  await owner.getByRole('button', { name: 'View my report' }).click();
  const details = owner.getByRole('main', { name: 'Report details' });
  await details.getByText('Report saved on this device').waitFor();
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

test('AI explains the selected plan in isolation and returns its recorded impacts when offline', { timeout: 90000 }, async t => {
  const { context, origin } = await openBrowser(t);
  await mockDelhi(context);
  const requests = [];
  const explanation = 'Moving assembly indoors reduces exposure. Switching off waiting engines cuts emissions at the school gate.';
  await context.route('**/api/ai/chat', route => {
    requests.push(route.request().postDataJSON());
    return requests.length === 1
      ? route.fulfill({ json: { text: explanation, provider: 'fixture' } })
      : route.fulfill({ status: 503, json: { error: 'Offline fixture' } });
  });

  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole('button', { name: 'Continue as Guest' }).click();
  const log = page.getByRole('log', { name: 'Chat messages' });
  await ask(page, 'Make a smog plan for our school in Delhi, India.');
  await log.getByText(/switch off engines at the school gate/i).waitFor();
  await ask(page, 'Make a smog plan for our housing society in Delhi, India.');
  await log.getByText(/coordinate shared trips with neighbours/i).waitFor();
  assert.equal(requests.length, 0);

  const explain = log.getByRole('button', { name: 'Explain these choices with AI' });
  assert.equal(await explain.count(), 2);
  await explain.first().click();
  await log.getByText(explanation, { exact: true }).waitFor();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].messages.length, 1);
  assert.equal(requests[0].useSearch, false);
  assert.deepEqual(requests[0].images, []);
  const sent = requests[0].messages[0].text;
  assert.match(sent, /school gate/i);
  assert.doesNotMatch(sent, /housing society|shared trips with neighbours|Delhi|208|household sensitivity/i);

  await explain.last().click();
  const offline = log.locator('.chat-bubble-ai').filter({ hasText: 'The AI explanation is unavailable' });
  await offline.waitFor();
  assert.match(await offline.innerText(), /keeping leaves out of open fires/i);
  assert.doesNotMatch(await offline.innerText(), /school gate/i);
  assert.equal(requests.length, 2);
});

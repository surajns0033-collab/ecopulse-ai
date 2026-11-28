import test from 'node:test';
import assert from 'node:assert/strict';
import { openBrowser } from './browserSupport.mjs';
import { mockDelhi, ask } from './cleanAirFixtures.mjs';

test('AI explains the selected plan in isolation and returns its recorded impacts when offline', { timeout: 90000 }, async t => {
  const { context, origin } = await openBrowser(t);
  await mockDelhi(context);
  const requests = [];
  const explanation = 'Moving assembly indoors reduces exposure. Switching off waiting engines cuts emissions at the school gate.';
  await context.route('**/api/ai/chat', route => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) return route.fulfill({ json: { text: explanation, provider: 'fixture' } });
    if (requests.length === 2) return route.fulfill({ json: { text: 'Fixture fragment with no ending', provider: 'fixture', truncated: true } });
    return route.fulfill({ status: 503, json: { error: 'Offline fixture' } });
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

  await explain.first().click();
  const limited = log.locator('.chat-bubble-ai').filter({ hasText: 'The AI reply was cut short' });
  await limited.waitFor();
  assert.match(await limited.innerText(), /switching off waiting vehicles cuts emissions near pupils/i);
  assert.doesNotMatch(await log.innerText(), /fixture fragment/i);

  await explain.last().click();
  const offline = log.locator('.chat-bubble-ai').filter({ hasText: 'The AI explanation is unavailable' });
  await offline.waitFor();
  assert.match(await offline.innerText(), /keeping leaves out of open fires/i);
  assert.doesNotMatch(await offline.innerText(), /school gate/i);
  assert.equal(requests.length, 3);
});

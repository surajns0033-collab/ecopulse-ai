import test from 'node:test';
import assert from 'node:assert/strict';
import { AWAITING_CHAT_PLACE, incidentCity, isDraftDetailFragment, resolveChatPlace } from '../src/agent/chatPlaces.js';
import { buildComplaintEmailTemplate } from '../src/agent/fallbackBrain.js';
import { INTENTS } from '../src/agent/intentEngine.js';
import { handleCreateEmail } from '../src/agent/civicEmail.js';
import { getAuthorityBundle, matchesDirectoryCity } from '../src/services/authorityDirectory.js';
import { NaviMumbai, Paris, draft, forbidLookup } from './placeFixtures.mjs';

test('pending civic draft treats times and landmarks as incident details, not different cities', async () => {
  for (const note of [
    'I saw waste burning beside the Vashi bus depot at 7 pm yesterday.',
    'At Vashi bus depot, around 7 pm yesterday.',
    'I saw a fire in front of the Vashi bus depot.',
    '7 pm yesterday.',
  ]) {
    const turn = await resolveChatPlace(note, [], Paris, draft, { chosenLocation: Paris, draftDetails: true, lookup: forbidLookup });
    assert.equal(turn.intent, INTENTS.CREATE_EMAIL);
    assert.equal(turn.location, NaviMumbai);
    assert.equal(turn.message, note);
    assert.equal(turn.draftIssue, 'burning');
  }
  assert.equal(isDraftDetailFragment('At Vashi bus depot, around 7 pm yesterday.'), true);
  assert.equal(isDraftDetailFragment('7 pm yesterday.'), true);
  assert.equal(isDraftDetailFragment('Check the weather.'), false);
});

test('a draft city correction must be verified and confirmation retains the observation', async () => {
  const note = 'I saw waste burning at the depot in Parris, Île-de-France, France at 7 pm.';
  const offered = await resolveChatPlace(note, [], NaviMumbai, draft, {
    draftDetails: true,
    lookup: async (value) => {
      assert.equal(value, 'Parris, Île-de-France, France');
      return { candidate: Paris };
    },
  });
  assert.equal(offered.kind, 'reply');
  assert.match(offered.text, /Did you mean Paris/);
  const confirmed = await resolveChatPlace('Yes', [], NaviMumbai, { type: AWAITING_CHAT_PLACE, waiting: offered.context.waiting }, { lookup: forbidLookup });
  assert.equal(confirmed.message, note);
  assert.equal(confirmed.location, Paris);
  assert.equal(confirmed.intent, INTENTS.CREATE_EMAIL);
  assert.equal(confirmed.draftDetails, true);
});

test('photo notes preserve jurisdiction qualifiers and photo actions use only the incident city', async () => {
  assert.equal(incidentCity('City: Paris, Île-de-France, France. Smoke beside the depot.'), Paris.city);
  assert.equal(incidentCity('Smoke in Paris, Île-de-France, France at 7 pm.'), Paris.city);
  assert.equal(incidentCity('Smoke at the depot at 7 pm.'), '');
  const prompt = 'Show me the authority contacts for Navi Mumbai';
  const unknown = await resolveChatPlace(prompt, [], null, null, { fromPhoto: true, lookup: forbidLookup });
  assert.equal(unknown.text, 'Which city should I check?');
  const known = await resolveChatPlace(prompt, [], Paris, null, { fromPhoto: true, lookup: forbidLookup });
  assert.equal(known.location, Paris);
  assert.equal(known.intent, INTENTS.GET_AUTHORITY_CONTACTS);
  assert.deepEqual(getAuthorityBundle(Paris.city), { state: null, national: [] });
  assert.equal(matchesDirectoryCity('Navi Mumbai, Ontario, Canada'), false);
  assert.equal(matchesDirectoryCity(NaviMumbai.city), true);
});

test('a local complaint draft preserves the observation and leaves unknown or unconfirmed details for review', () => {
  const note = 'I saw waste burning beside the Vashi bus depot at 7 pm yesterday.';
  const { subject, body } = buildComplaintEmailTemplate({
    situation: note, city: NaviMumbai.city, issueLabel: 'Open burning of waste', hasPhoto: true,
  });
  assert.match(subject, /Open burning of waste.*Navi Mumbai/);
  assert.ok(body.includes(note));
  assert.match(body, /\[Your full name\]/);
  assert.match(body, /\[Attach the photo/);
  assert.doesNotMatch(body, /I have attached/);
});

test('draft history uses the most recent observation and its resolved jurisdiction', async () => {
  const note = 'I saw garbge near the gate in Parris.';
  const history = [{ role: 'user', text: note }, { role: 'ai', text: 'Report preview',
    incident: { city: Paris.city, text: note } }];
  const draft = (turns, city) => handleCreateEmail('Draft email', turns, city);
  const paris = await draft(history, Paris.city);
  assert.equal(paris.status, 'preview');
  assert.ok(paris.cards[0].data.body.includes(note));
  assert.equal((await draft(history, 'Paris, Texas, United States')).status, 'needs_info');
  assert.equal((await draft(history.slice(0, 1), Paris.city)).status, 'needs_info');
  assert.equal((await draft([...history, { role: 'user', text: 'I saw smoke in Pune.' }], Paris.city)).status, 'needs_info');

  const raw = city => [{ role: 'user', text: 'I saw smoke in ' + city + '.' }];
  assert.equal((await draft(raw('Paris, France'), Paris.city)).status, 'preview');
  assert.equal((await draft(raw('France'), Paris.city)).status, 'needs_info');
  assert.equal((await draft(raw('Paris'), 'Paris, Texas, United States')).status, 'needs_info');
  assert.equal((await draft(raw('Paris, Texas'), Paris.city)).status, 'needs_info');
});

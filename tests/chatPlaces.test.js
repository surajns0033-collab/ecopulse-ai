import test from 'node:test';
import assert from 'node:assert/strict';
import { AWAITING_CHAT_PLACE, AWAITING_DRAFT_DETAILS, incidentCity, isDraftDetailFragment, resolveChatPlace } from '../src/agent/chatPlaces.js';
import { buildComplaintEmailTemplate } from '../src/agent/fallbackBrain.js';
import { INTENTS } from '../src/agent/intentEngine.js';
import { getAuthorityBundle, matchesDirectoryCity } from '../src/services/authorityDirectory.js';

const NaviMumbai = { city: 'Navi Mumbai, Maharashtra, India', name: 'Navi Mumbai', lat: 19.04, lng: 73.02 };
const Paris = { city: 'Paris, Île-de-France, France', name: 'Paris', lat: 48.86, lng: 2.35 };
const draft = { type: AWAITING_DRAFT_DETAILS, location: NaviMumbai, draftIssue: 'burning' };
const forbidLookup = () => assert.fail('Incident detail was sent to the geocoder');

test('Chat applies a verified city correction to the pending lookup', async () => {
  const request = 'Weather near me';
  const first = await resolveChatPlace(request, [], NaviMumbai, null, { lookup: forbidLookup });
  assert.equal(first.context.waiting.turn.message, request);
  const pending = { type: AWAITING_CHAT_PLACE, waiting: first.context.waiting };
  const corrected = await resolveChatPlace('No, I meant Paris, not Navi Mumbai.', [], NaviMumbai, pending, {
    lookup: async (query) => { assert.equal(query, 'Paris'); return { location: Paris }; },
  });
  assert.equal(corrected.message, request);
  assert.equal(corrected.location, Paris);
  assert.equal(corrected.context.chosenLocation, Paris);
  assert.equal(corrected.context.waiting, null);
});

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

import test from 'node:test';
import assert from 'node:assert/strict';
import { AWAITING_CHAT_PLACE, AWAITING_DRAFT_DETAILS, incidentCity, isDraftDetailFragment, resolveChatPlace } from '../src/agent/chatPlaces.js';
import { buildComplaintEmailTemplate } from '../src/agent/fallbackBrain.js';
import { INTENTS } from '../src/agent/intentEngine.js';
import { routePlaceRequest } from '../src/agent/placeContext.js';
import { getAuthorityBundle, matchesDirectoryCity } from '../src/services/authorityDirectory.js';

const NaviMumbai = { city: 'Navi Mumbai, Maharashtra, India', name: 'Navi Mumbai', lat: 19.04, lng: 73.02 };
const Paris = { city: 'Paris, Île-de-France, France', name: 'Paris', lat: 48.86, lng: 2.35 };
const draft = { type: AWAITING_DRAFT_DETAILS, location: NaviMumbai, draftIssue: 'burning' };
const forbidLookup = () => assert.fail('Unexpected place lookup');

test('local AQI and weather ask for a city without making a device request', async () => {
  for (const text of ['AQI here', 'What is the weather in local area?', 'How’s the air outside?']) {
    const turn = await resolveChatPlace(text, [], NaviMumbai, null, { lookup: forbidLookup, locateDevice: assert.fail });
    assert.equal(turn.text, 'Which city should I check?');
    const pending = { type: AWAITING_CHAT_PLACE, waiting: turn.context.waiting };
    const noCity = await resolveChatPlace('yes', [], NaviMumbai, pending, { lookup: forbidLookup });
    assert.equal(noCity.text, 'Which city and state or country should I use?');
  }
});

test('an explicit device request completes the pending AQI lookup', async () => {
  const request = 'AQI here';
  const first = await resolveChatPlace(request, [], null, null, { lookup: forbidLookup, locateDevice: assert.fail });
  const pending = { type: AWAITING_CHAT_PLACE, waiting: first.context.waiting };
  const denied = await resolveChatPlace('Use my location', [], null, pending, { lookup: forbidLookup, locateDevice: async () => null });
  assert.equal(denied.context.waiting.turn.message, request);
  const found = await resolveChatPlace('Use my location', [], null, pending, { lookup: forbidLookup, locateDevice: async () => NaviMumbai });
  assert.equal(found.message, request);
  assert.equal(found.intent, INTENTS.GET_AIR_QUALITY);
  assert.equal(found.location, NaviMumbai);
  assert.equal(found.context.chosenLocation, NaviMumbai);
});

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

test('an ambiguous city cannot reuse an unrelated city’s AQI reading', async () => {
  const request = 'AQI in Pennsylvania';
  const first = await resolveChatPlace(request, [], NaviMumbai, null, { lookup: async () => ({ ambiguous: true }) });
  assert.equal(first.text, 'Which city and state or country should I use?');
  assert.equal(first.location, undefined);
  const pending = { type: AWAITING_CHAT_PLACE, waiting: first.context.waiting };
  const Pittsburgh = { city: 'Pittsburgh, Pennsylvania, United States', lat: 40.44, lng: -79.99 };
  const resolved = await resolveChatPlace('Pittsburgh, Pennsylvania', [], NaviMumbai, pending, {
    lookup: async (query) => { assert.equal(query, 'Pittsburgh, Pennsylvania'); return { location: Pittsburgh }; },
  });
  assert.equal(resolved.intent, INTENTS.GET_AIR_QUALITY);
  assert.equal(resolved.message, request);
  assert.equal(resolved.location, Pittsburgh);
});

test('a suggested city needs confirmation', async () => {
  const request = 'Weather in Parris';
  const offered = await resolveChatPlace(request, [], NaviMumbai, null, { lookup: async () => ({ ambiguous: true, candidate: Paris }) });
  assert.equal(offered.kind, 'reply');
  assert.equal(offered.context.location, NaviMumbai);
  assert.match(offered.text, /^Did you mean Paris/);
  const pending = { type: AWAITING_CHAT_PLACE, waiting: offered.context.waiting };
  const confirmed = await resolveChatPlace('Yes, that’s right.', [], NaviMumbai, pending, { lookup: forbidLookup });
  assert.equal(confirmed.message, request);
  assert.equal(confirmed.location, Paris);
  assert.equal(confirmed.context.waiting, null);
});

test('a map or weather lookup in another city does not replace the selected city', async () => {
  const selected = await resolveChatPlace('Set my city to Paris', [], null, null, { lookup: async () => ({ location: Paris }) });
  assert.equal(selected.selected, Paris);
  const map = await resolveChatPlace('Show me Navi Mumbai on a map', [], Paris, null, {
    chosenLocation: Paris,
    lookup: async (query, { map }) => {
      assert.equal(query, 'Navi Mumbai');
      assert.equal(map, true);
      return { location: NaviMumbai };
    },
  });
  assert.equal(map.kind, 'map');
  assert.equal(map.location, NaviMumbai);
  assert.equal(map.context.location, Paris);
  const weather = await resolveChatPlace('Weather in Navi Mumbai', [], Paris, null, {
    chosenLocation: Paris, lookup: async () => ({ location: NaviMumbai }),
  });
  assert.equal(weather.location, NaviMumbai);
  const local = await resolveChatPlace('AQI here', [], weather.location, null, { chosenLocation: weather.context.chosenLocation, lookup: forbidLookup });
  assert.equal(local.location, Paris);
});

test('Hindi, Hinglish, and Marathi city phrasing stays in Chat’s grounded routes', () => {
  assert.equal(routePlaceRequest('मुंबई में मौसम कैसा है').place, 'मुंबई');
  assert.equal(routePlaceRequest('पुणे का मौसम कैसा है').place, 'पुणे');
  assert.equal(routePlaceRequest('Mumbai ka mausam').place, 'Mumbai');
  assert.equal(routePlaceRequest('Pune madhye havaman kasa aahe').place, 'Pune');
  assert.equal(routePlaceRequest('पुण्यात हवामान कसं आहे?').place, 'पुण्यात');
  assert.equal(routePlaceRequest('मुंबईत आत्ता हवामान कसं आहे?').place, 'मुंबईत');
  assert.equal(routePlaceRequest('आज हवामान कसं आहे?').place, '');
  assert.equal(routePlaceRequest('मुंबई में स्मॉग प्लान').intent, INTENTS.GET_SMOG_PLAN);
});

test('global web searches do not geocode a region; local web searches ask for a city', async () => {
  const global = await resolveChatPlace('Search the web for how air quality is modeled in Europe', [], null, null, { lookup: forbidLookup });
  assert.equal(global.kind, 'web');
  assert.equal(global.location, undefined);
  const request = 'Search the web for clean-air centers near me';
  const local = await resolveChatPlace(request, [], null, null, { lookup: forbidLookup });
  assert.equal(local.text, 'Which city should I check?');
  const pending = { type: AWAITING_CHAT_PLACE, waiting: local.context.waiting };
  const confirmed = await resolveChatPlace('Paris', [], null, pending, { lookup: async () => ({ location: Paris }) });
  assert.equal(confirmed.kind, 'web');
  assert.equal(confirmed.location, Paris);
  assert.equal(confirmed.message, request);
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

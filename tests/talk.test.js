import test from 'node:test';
import assert from 'node:assert/strict';
import { INTENTS } from '../src/agent/intentEngine.js';
import { emptyTalkContext, resolveTalkTurn, routeTalkRequest } from '../src/agent/talkContext.js';
import { parseSmogProfile } from '../src/agent/smogProfile.js';
import { shortSpeech, talkStatus, talkWebReference, toolSpeech } from '../src/agent/talkReply.js';
import { speechLanguage } from '../src/services/talkAudio.js';
import { getTalkDeviceLocation, lookupTalkPlace } from '../src/services/talkPlaces.js';

const Mumbai = { name: 'Mumbai', city: 'Mumbai, Maharashtra, India', lat: 19.08, lng: 72.88 };
const Panvel = { name: 'Panvel', city: 'Panvel, Maharashtra, India', lat: 18.99, lng: 73.12 };
const forbidLookup = () => { throw new Error('Unexpected place lookup'); };

test('an ask about the local area never geocodes filler words or uses a default', async () => {
  for (const text of ['What is the weather in local area?', 'AQI near me', 'AQI here', 'Weather in the morning', 'How’s the air outside?']) {
    const turn = await resolveTalkTurn(text, emptyTalkContext(), { lookup: forbidLookup, locateDevice: forbidLookup });
    assert.equal(turn.kind, 'reply');
    assert.equal(turn.text, 'Which city should I check?');
    assert.equal(turn.expectsReply, true);
    assert.equal(turn.context.location, null);
  }
});

test('only an explicit device request authorizes location, then the waiting question resumes', async () => {
  const waiting = await resolveTalkTurn('AQI here', emptyTalkContext(), { lookup: forbidLookup, locateDevice: forbidLookup });
  const denial = await resolveTalkTurn('Use my location', waiting.context, { lookup: forbidLookup, locateDevice: async () => null });
  assert.match(denial.text, /couldn’t verify your device location/i);
  assert.equal(denial.context.location, null);
  const found = await resolveTalkTurn('Use my location', denial.context, { lookup: forbidLookup, locateDevice: async () => Mumbai });
  assert.equal(found.message, 'AQI here');
  assert.equal(found.location, Mumbai);
  assert.equal(found.context.chosenLocation, Mumbai);
});

test('device location rejects imprecise fixes and only reverse-geocodes rounded coordinates', async () => {
  const device = (accuracy) => ({ getCurrentPosition: (success) => success({ coords: { latitude: 19.083421, longitude: 72.88134, accuracy } }) });
  assert.equal(await getTalkDeviceLocation({ geolocation: device(20000), request: forbidLookup }), null);
  const location = await getTalkDeviceLocation({ geolocation: device(300), request: async (url) => {
    const coords = new URL(url).searchParams;
    assert.equal(coords.get('lat'), '19.08');
    assert.equal(coords.get('lon'), '72.88');
    return Response.json({ address: { city: 'Mumbai', state: 'Maharashtra', country: 'India', road: 'Not part of the city label' } });
  } });
  assert.deepEqual(location, Mumbai);
});

test('a city answer finishes the original question rather than starting an unrelated turn', async () => {
  const first = await resolveTalkTurn("What's the AQI near me?", emptyTalkContext(), { lookup: forbidLookup });
  const followUp = await resolveTalkTurn("I'm in Mumbai", first.context, {
    lookup: async (query) => { assert.equal(query, 'Mumbai'); return { location: Mumbai }; },
  });
  assert.equal(followUp.intent, INTENTS.GET_AIR_QUALITY);
  assert.equal(followUp.message, "What's the AQI near me?");
  assert.equal(followUp.location, Mumbai);
  assert.equal(followUp.context.chosenLocation, Mumbai);
});

test('a city asked about earlier does not become the user’s physical location', async () => {
  const topic = await resolveTalkTurn('Weather in Panvel', emptyTalkContext(), { lookup: async () => ({ location: Panvel }) });
  const plain = await resolveTalkTurn('And the AQI?', topic.context, { lookup: forbidLookup });
  assert.equal(plain.location, Panvel);
  const here = await resolveTalkTurn('AQI here', plain.context, { lookup: forbidLookup });
  assert.equal(here.text, 'Which city should I check?');
});

test('a different city lookup does not overwrite the city that was explicitly chosen', async () => {
  const chosen = await resolveTalkTurn('Set my city to Mumbai', emptyTalkContext(), { lookup: async () => ({ location: Mumbai }) });
  assert.ok(!chosen.expectsReply);
  const topic = await resolveTalkTurn('Weather in Panvel', chosen.context, { lookup: async () => ({ location: Panvel }) });
  assert.equal(topic.location, Panvel);
  const here = await resolveTalkTurn('AQI here', topic.context, { lookup: forbidLookup });
  assert.equal(here.location, Mumbai);
});

test('general English and unclear mic input do not introduce places', async () => {
  const waiting = await resolveTalkTurn('AQI near me', emptyTalkContext(), { lookup: forbidLookup });
  for (const text of ["What's going on?", 'I am in pain', 'Use simpler words', 'Explain what clouds are', 'How can I reduce air pollution?']) {
    const turn = await resolveTalkTurn(text, waiting.context, { lookup: forbidLookup });
    assert.equal(turn.kind, 'general');
    assert.equal(turn.location, undefined);
  }
  for (const text of ['…', 'Weather in Pennsylvania']) {
    const turn = await resolveTalkTurn(text, emptyTalkContext(), { lookup: forbidLookup, confidence: .35 });
    assert.equal(turn.text, 'I didn’t catch that clearly. Could you say it again?');
  }
});

test('failed or ambiguous verification never reuses another city’s reading', async () => {
  const turn = await resolveTalkTurn('AQI in Pennsylvania', { ...emptyTalkContext(), location: Mumbai }, {
    lookup: async () => ({ ambiguous: true }),
  });
  assert.equal(turn.kind, 'reply');
  assert.equal(turn.text, 'Which city and state or country should I use?');
  assert.equal(turn.context.location, Mumbai);

  const correction = await resolveTalkTurn('Pittsburgh, Pennsylvania', turn.context, {
    lookup: async (place) => {
      assert.equal(place, 'Pittsburgh, Pennsylvania');
      return { location: { city: 'Pittsburgh, Pennsylvania, United States', lat: 40.44, lng: -79.99 } };
    },
  });
  assert.equal(correction.intent, INTENTS.GET_AIR_QUALITY);
  assert.match(correction.location.city, /Pittsburgh/);
});

test('a suggestion is not applied until the user confirms it', async () => {
  const offered = await resolveTalkTurn('Weather in Panvell', emptyTalkContext(), { lookup: async () => ({ candidate: Panvel }) });
  assert.equal(offered.kind, 'reply');
  assert.equal(offered.expectsReply, true);
  assert.equal(offered.context.location, null);
  assert.match(offered.text, /^Did you mean Panvel/);
  const taken = await resolveTalkTurn('Yes, that’s right.', offered.context, { lookup: forbidLookup, fromMic: true, confidence: .9 });
  assert.equal(taken.intent, INTENTS.GET_WEATHER);
  assert.equal(taken.message, 'Weather in Panvell');
  assert.equal(taken.location, Panvel);
  assert.equal(taken.context.chosenLocation, null);
});

test('a medium-confidence recognition of a new city requires confirmation, even for an exact hit', async () => {
  for (const confidence of [.65, 0, undefined]) {
    const offered = await resolveTalkTurn('Weather in Panvel', emptyTalkContext(), {
      confidence, fromMic: true, lookup: async () => ({ location: Panvel }),
    });
    assert.equal(offered.kind, 'reply');
    assert.equal(offered.context.location, null);
    assert.match(offered.text, /^Did you mean Panvel/);
  }
});

test('spoken Hindi and Marathi city phrasing routes without inferring location', () => {
  assert.equal(routeTalkRequest('मुंबई में मौसम कैसा है').place, 'मुंबई');
  assert.equal(routeTalkRequest('पुणे का मौसम कैसा है').place, 'पुणे');
  assert.equal(routeTalkRequest('Mumbai ka mausam').place, 'Mumbai');
  assert.equal(routeTalkRequest('Pune madhye havaman kasa aahe').place, 'Pune');
  assert.equal(routeTalkRequest('पुण्यात हवामान कसं आहे?').place, 'पुण्यात');
  assert.equal(routeTalkRequest('आज हवामान कसं आहे?').place, '');
  assert.equal(routeTalkRequest('मुंबई में स्मॉग प्लान').intent, INTENTS.GET_SMOG_PLAN);
  assert.equal(speechLanguage('मला हवामान सांगाल का?'), 'mr-IN');
  assert.equal(speechLanguage('किस शहर का मौसम जानना है?'), 'hi-IN');
  assert.equal(speechLanguage('What is the weather in local area?', 'hi-IN'), 'en-IN');
  assert.equal(speechLanguage('Whats going on?', 'hi-IN'), 'en-IN');
  assert.equal(speechLanguage('Mumbai ka mausam', 'en-US'), 'hi-IN');
  assert.equal(speechLanguage('Pune', 'mr-IN'), 'mr-IN');
  assert.equal(speechLanguage('पुणे', 'mr-IN'), 'mr-IN');
  assert.equal(speechLanguage('पुण्यात कसं हवामान आहे?', ''), 'mr-IN');
  assert.equal(speechLanguage(talkStatus('unverified', 'hi-IN'), ''), 'hi-IN');
});

test('search requiring a city waits for one; unrelated global searches do not', async () => {
  const local = await resolveTalkTurn('What’s happening near me today?', emptyTalkContext(), { lookup: forbidLookup });
  assert.equal(local.kind, 'reply');
  const world = await resolveTalkTurn('What are today’s news headlines?', emptyTalkContext(), { lookup: forbidLookup });
  assert.equal(world.kind, 'web');
  const city = await resolveTalkTurn('Latest news in Springfield', emptyTalkContext(), { lookup: async () => ({ ambiguous: true }) });
  assert.equal(city.kind, 'reply');
  assert.match(city.text, /which city and state/i);
});

test('explicit web searches about environmental topics do not geocode regions or guess the user’s city', async () => {
  const global = await resolveTalkTurn('Search the web for what Open-Meteo uses to model air quality in Europe', emptyTalkContext(), { lookup: forbidLookup });
  assert.equal(global.kind, 'web');
  assert.equal(global.location, undefined);
  const local = await resolveTalkTurn('Search the web for clean-air centers near me', emptyTalkContext(), { lookup: forbidLookup });
  assert.equal(local.text, 'Which city should I check?');
  const confirmed = await resolveTalkTurn('Mumbai', local.context, { lookup: async () => ({ location: Mumbai }) });
  assert.equal(confirmed.kind, 'web');
  assert.equal(confirmed.location, Mumbai);
  assert.equal(confirmed.message, 'Search the web for clean-air centers near me');
});

test('a verified map result does not overwrite the active city', async () => {
  const chosen = await resolveTalkTurn('Set my city to Mumbai', emptyTalkContext(), { lookup: async () => ({ location: Mumbai }) });
  const map = await resolveTalkTurn('Map of Panvel', chosen.context, { lookup: async (query, options) => {
    assert.equal(query, 'Panvel');
    assert.equal(options.map, true);
    return { location: Panvel };
  } });
  assert.equal(map.kind, 'map');
  assert.equal(map.location, Panvel);
  assert.equal(map.context.location, Mumbai);
  assert.equal(routeTalkRequest('Show me Panvel on a map').place, 'Panvel');
});

const openPlace = (name, admin1, country, latitude, longitude) => ({ name, admin1, country, latitude, longitude, feature_code: 'PPL' });

test('two exact Pennsylvania matches do not resolve to an unrelated state or country', async () => {
  const results = [openPlace('Pennsylvania', 'Alabama', 'United States', 33, -87), openPlace('Pennsylvania', 'England', 'United Kingdom', 51, -2)];
  const request = async () => Response.json({ results });
  assert.deepEqual(await lookupTalkPlace('Pennsylvania', { request }), { ambiguous: true, candidate: null });
  const qualified = await lookupTalkPlace('Pennsylvania, England', { request });
  assert.equal(qualified.location.city, 'Pennsylvania, England, United Kingdom');
  const onlyCountry = await lookupTalkPlace('Pennsylvania, United States', { request });
  assert.equal(onlyCountry.location, undefined);
  assert.match(onlyCountry.candidate.city, /Alabama/);
});

test('a known provider spelling of a region preserves the state and country qualifiers', async () => {
  const request = async () => Response.json({ results: [
    openPlace('Paris', 'Texas', 'United States', 33.66, -95.55),
    openPlace('Paris', 'Île-de-France Region', 'France', 48.85, 2.35),
  ] });
  const hit = await lookupTalkPlace('Paris, Île-de-France, France', { request });
  assert.equal(hit.location?.city, 'Paris, Île-de-France Region, France');
  assert.equal((await lookupTalkPlace('Paris, Texas, France', { request })).location, undefined);
});

test('a fuzzy search’s first hit is not used unless its spelling or region matches', async () => {
  const request = async (url) => url.includes('open-meteo') ? Response.json({}) : Response.json({ features: [{
    properties: { name: 'Pennsylvania', country: 'United Kingdom', type: 'village' }, geometry: { coordinates: [-2, 51] },
  }, {
    properties: { name: 'Panvel', state: 'Maharashtra', country: 'India', type: 'city' }, geometry: { coordinates: [73.12, 18.99] },
  }] });
  assert.deepEqual(await lookupTalkPlace('local area', { request }), {});
  const misspelled = await lookupTalkPlace('Panvell', { request });
  assert.equal(misspelled.candidate.name, 'Panvel');
  assert.equal(misspelled.location, undefined);
  assert.deepEqual(await lookupTalkPlace('Panvel, Canada', { request }), {});
});

test('sanfransico can suggest the verified map target even when the fuzzy provider is unavailable', async () => {
  const request = async (url) => {
    assert.equal(new URL(url).searchParams.get('name'), 'San Francisco');
    return Response.json({ results: [
      { ...openPlace('San Francisco', 'California', 'United States', 37.77, -122.42), population: 827526 },
      { ...openPlace('San Francisco', 'Caraga', 'Philippines', 8.5, 125.98), population: 79718 },
    ] });
  };
  const hit = await lookupTalkPlace('sanfransico', { map: true, request });
  assert.equal(hit.location, undefined);
  assert.equal(hit.candidate.city, 'San Francisco, California, United States');
});

test('Marathi city spelling uses the same verified lookup', async () => {
  const turn = await resolveTalkTurn('मुंबईत हवामान कसं आहे?', emptyTalkContext(), {
    language: 'mr', lookup: (query) => lookupTalkPlace(query, { request: async (url) => {
      assert.equal(new URL(url).searchParams.get('name'), 'Mumbai');
      return Response.json({ results: [{ ...openPlace('Mumbai', 'Maharashtra', 'India', 19.08, 72.88), population: 1e7 }] });
    } }),
  });
  assert.deepEqual(turn.location, Mumbai);
  assert.match(toolSpeech({ speechData: { weather: { temp: 31 } } }, turn, 'mr-IN'), /31 अंश सेल्सियस/);
});

test('short speech preserves decimals, handles Hindi sentence boundaries, and omits sources', () => {
  assert.equal(shortSpeech('PM2.5 is 36.5 today. Wear a mask. Third sentence.\n**Sources**\nhttps://example.com'), 'PM2.5 is 36.5 today. Wear a mask.');
  assert.equal(shortSpeech('पहला वाक्य। दूसरा वाक्य। तीसरा वाक्य।', 'hi-IN'), 'पहला वाक्य। दूसरा वाक्य।');
  assert.ok(shortSpeech('a '.repeat(500)).length <= 350);
});

test('an official website request does not present a third-party result as the answer', () => {
  const thirdParty = { url: 'https://nasa.gov.example.com/artemis' };
  const nasa = { url: 'https://www.nasa.gov/artemis/' };
  const query = 'Search the web for the official NASA Artemis program page on nasa.gov';
  assert.equal(talkWebReference(query, [thirdParty]), null);
  assert.deepEqual(talkWebReference(query, [thirdParty, nasa]), { url: nasa.url, linkOnly: true });
  assert.deepEqual(talkWebReference(`${query.replace('nasa.gov', 'https://www.nasa.gov')}.`, [nasa]), { url: nasa.url, linkOnly: true });
  assert.deepEqual(talkWebReference('Search the web about Artemis', [nasa]), { url: nasa.url, linkOnly: false });
});

test('a missing temperature is not read as zero and the current reading is not a forecast', () => {
  const turn = { intent: INTENTS.GET_WEATHER, location: Panvel, message: 'Weather tomorrow' };
  const reply = toolSpeech({ speechData: { weather: { temp: 28, description: 'Clear sky' } } }, turn, 'en-IN');
  assert.match(reply, /can’t verify the forecast.*Right now in Panvel.*28/);
  const missing = toolSpeech({ speechData: { weather: { temp: null } } }, { ...turn, message: 'Current weather' }, 'en-IN');
  assert.match(missing, /couldn’t verify/);
  assert.doesNotMatch(missing, /0 degrees/);
});

test('a smog plan keeps its verified city when the user switches topics and resumes later', async () => {
  const pending = { intent: INTENTS.GET_SMOG_PLAN, action: { type: 'SMOG_PLAN_AWAITING_PROFILE' }, location: Mumbai };
  const context = { ...emptyTalkContext(), location: Panvel };
  const greeting = await resolveTalkTurn('Hello!', context, { lookup: forbidLookup, pending });
  assert.equal(greeting.kind, 'general');
  const profile = 'Car to work, outdoor work, gas stove and a HEPA filter.';
  const ambiguous = await resolveTalkTurn('Weather in Pennsylvania', context, { lookup: async () => ({ ambiguous: true }) });
  const answer = await resolveTalkTurn(profile, ambiguous.context, { lookup: forbidLookup, pending });
  assert.equal(answer.kind, 'tool');
  assert.equal(answer.pending, pending.action);
  assert.equal(answer.location, Mumbai);
  const reply = toolSpeech({ cards: [{ type: 'aqi', data: { aqi: 156 } }], speechData: { profile: parseSmogProfile(profile) } }, answer, 'en-IN');
  assert.match(reply, /156 in Mumbai/);
  assert.match(reply, /take breaks indoors/);
  assert.match(reply, /transit instead of driving to cut exhaust/);
  assert.match(reply, /HEPA filter to remove indoor particles/);
  assert.equal(new Intl.Segmenter('en-IN', { granularity: 'sentence' }).segment(reply).containing(reply.length - 1).segment.endsWith('.'), true);
  assert.equal([...new Intl.Segmenter('en-IN', { granularity: 'sentence' }).segment(reply)].length, 2);
});

test('a smog plan still provides personal advice when AQI cannot be verified', () => {
  const turn = { intent: INTENTS.GET_SMOG_PLAN, location: Mumbai };
  const reply = toolSpeech({ status: 'unavailable', speechData: { profile: parseSmogProfile('Car and gas stove') } }, turn, 'en-IN');
  assert.match(reply, /couldn’t check the current air quality in Mumbai/);
  assert.match(reply, /transit instead of driving.*cooking fumes/);
  assert.doesNotMatch(reply, /index is \d+/);
});

test('partial and multilingual smog profiles never fill in unstated details', () => {
  const profile = parseSmogProfile('मैं बस से ऑफिस जाती हूँ और घर पर गैस है।');
  assert.equal(profile.commute, 'public transport');
  assert.equal(profile.routine, 'office/school');
  assert.equal(profile.cooking, 'gas stove');
  assert.equal(profile.filtration, null);
  assert.equal(parseSmogProfile('Gas stove, no HEPA filter').filtration, 'no purifier');
  assert.equal(parseSmogProfile('I don’t drive; I take the bus.').commute, 'public transport');
});

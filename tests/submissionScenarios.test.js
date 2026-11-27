import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSmogPlan, getSmogPlan } from '../src/agent/smogPlan.js';
import { routePlaceRequest } from '../src/agent/placeContext.js';
import { INTENTS } from '../src/agent/intentEngine.js';
import { parseSmogProfile } from '../src/agent/smogProfile.js';

const fixtureTime = Date.parse('2026-11-27T05:00:00Z');
const scenarios = [
  {
    name: "Navi Mumbai, family with a car and gas stove",
    city: "Navi Mumbai",
    message: "I drive to school, cook with gas and have a child.",
    aqi: 205,
    expected: ["Very Unhealthy", "household sensitivity: children", "carpool", "gas stove runs", "cleaner indoor space"],
  },
  {
    name: "Bengaluru, commuter using metro and induction",
    city: "Bengaluru",
    message: "I take the metro to the office and cook with induction.",
    aqi: 42,
    expected: ["Good", "public transport", "induction/electric", "long leg on transit"],
    excluded: ["gas stove runs", "Move strenuous exercise indoors"],
  },
  {
    name: "Delhi, cyclist doing outdoor work during hazardous smog",
    city: "Delhi",
    message: "I cycle to work and do outdoor work.",
    aqi: 302,
    expected: ["Hazardous", "postpone non-essential trips", "use transit for the polluted segment", "take breaks in a cleaner indoor space"],
  },
  {
    name: "Pune, four-hour-old AQI and no purifier",
    city: "Pune",
    message: "I work from home and have no purifier.",
    aqi: 270,
    ageHours: 4,
    expected: ["no recent timestamp", "damp-clean", "Check a fresh AQI"],
    excluded: ["Current AQI: 270", "keep windows closed while outdoor air is poor"],
  },
  {
    name: "Lucknow, community plan when readings are missing",
    city: "Lucknow",
    message: "skip",
    aqi: null,
    expected: ["Current AQI:** unavailable", "Avoid burning leaves or waste", "Avoiding burning and idling cuts emissions at the source", "no commute mode was assumed"],
  },
  {
    name: "Navi Mumbai, gas cooking and explicit absence of induction",
    city: "Navi Mumbai",
    message: "I take the metro, cook with gas, and do not have an induction stove.",
    aqi: 166,
    expected: ["public transport; gas stove", "gas stove runs"],
    excluded: ["public transport; induction/electric", "Use induction when practical"],
  },
  {
    name: "Delhi school during very unhealthy smog",
    city: "Delhi", message: "Plan for our school assembly.", aqi: 208,
    expected: ["Move outdoor assembly", "engines at the school gate", "cuts emissions near pupils"],
  },
  {
    name: "Pune residents without a current reading or a stated cooking fuel",
    city: "Pune", message: "Our housing society needs a community smog plan.", aqi: null,
    expected: ["Current AQI:** unavailable", "shared trips with neighbours", "collection or composting", "if one is available"],
    excluded: ["Induction avoids", "gas stove runs", "Move outdoor assembly"],
  },
  {
    name: "Hyderabad metro commuter who rules out a car, bike and household sensitivities",
    city: "Hyderabad",
    message: "I don’t have a car or a bike. I take the metro to the office and cook at home. No kids or asthma.",
    aqi: 172,
    expected: ["public transport; office/school; household sensitivity: not stated", "Keep the long leg on transit", "recheck AQI before both legs"],
    excluded: ["carpool", "Bundle errands", "household members you flagged as sensitive", "gas stove runs"],
  },
];

for (const scenario of scenarios) {
  test(scenario.name, () => {
    const sourceTime = fixtureTime - (scenario.ageHours ?? 0) * 60 * 60 * 1000;
    const reading = scenario.aqi === null ? null : {
      aqi: scenario.aqi,
      timestamp: new Date(sourceTime).toISOString(),
      sourceType: 'modeled',
    };
    const profile = parseSmogProfile(scenario.message);
    const plan = buildSmogPlan(profile, { city: scenario.city, aqi: reading, now: fixtureTime });

    assert.equal(plan.status, 'success');
    for (const text of [scenario.city, ...scenario.expected]) {
      assert.ok(plan.text.includes(text), `Missing advice: ${text}`);
    }
    for (const text of scenario.excluded ?? []) {
      assert.ok(!plan.text.includes(text), `Unexpected advice: ${text}`);
    }
    assert.equal(plan.text.match(/\*\*Direct impact:\*\*/g)?.length, 5);
  });
}

test('a natural-language winter smog request keeps its city and household details through to the AI explanation', () => {
  const request = 'Can you make a plan for severe winter smog in Delhi, India? I take the metro to school. I have no HEPA purifier, but use a DIY filtered fan.';
  const route = routePlaceRequest(request);
  assert.equal(route.intent, INTENTS.GET_SMOG_PLAN);
  assert.equal(route.place, 'Delhi, India');
  const reading = { aqi: 180, timestamp: new Date(fixtureTime).toISOString(), sourceType: 'modeled' };
  const profile = parseSmogProfile(route.smogDetails);
  const plan = buildSmogPlan(profile, { city: route.place, aqi: reading, now: fixtureTime });
  assert.match(plan.text, /Keep the long leg on transit/);
  assert.match(plan.text, /existing filtered-air setup/);
  assert.doesNotMatch(plan.text, /Run HEPA in one cleaner-air room|Bundle errands/);
  const choices = plan.actions.find(action => action.action === 'EXPLAIN_SMOG_CHOICES').data.choices;
  assert.equal(choices.length, 5);
  for (const { advice, impact } of choices) {
    assert.ok(plan.text.includes(advice));
    assert.ok(plan.text.includes(impact));
  }
});

test('a complete smog plan refreshes its three data sources only after cache expiry', async (t) => {
  let now = fixtureTime;
  t.mock.method(Date, 'now', () => now);
  const requests = t.mock.method(globalThis, 'fetch', async (url) => {
    const endpoint = new URL(url);
    if (endpoint.hostname === 'api.open-meteo.com') {
      return Response.json({ current: { temperature_2m: 22, wind_speed_10m: 4, weather_code: 0 } });
    }
    if (endpoint.searchParams.has('hourly')) {
      const time = now / 1000;
      return Response.json({
        timezone: 'Asia/Kolkata', current: { time },
        hourly: { time: [time + 3600], us_aqi: [75] },
      });
    }
    return Response.json({ current: { us_aqi: 105, time: new Date(now).toISOString() } });
  });

  const place = { city: 'Pune', lat: 18.52, lng: 73.86 };
  const first = await getSmogPlan('I commute by bus.', place);
  assert.equal(requests.mock.callCount(), 3);
  const repeat = await getSmogPlan('I commute by bus.', place);
  assert.equal(requests.mock.callCount(), 3);
  assert.equal(repeat.text, first.text);

  now += 3 * 60 * 1000 + 1;
  await getSmogPlan('I commute by bus.', place);
  assert.equal(requests.mock.callCount(), 6);
});

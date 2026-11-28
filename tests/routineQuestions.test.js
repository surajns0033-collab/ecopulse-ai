import assert from 'node:assert/strict';
import test from 'node:test';
import { INTENTS } from '../src/agent/intentEngine.js';
import { routePlaceRequest } from '../src/agent/placeContext.js';
import { buildSmogPlan } from '../src/agent/smogPlan.js';
import { parseSmogProfile } from '../src/agent/smogProfile.js';

const now = Date.parse('2026-11-27T06:00:00Z');
const cases = [
  {
    name: 'outdoor delivery shift', city: 'Nagpur, India', aqi: 240,
    prompt: 'How can I reduce my smog exposure during a delivery shift in Nagpur, India? I work outdoors and ride a scooter.',
    profile: { routine: 'outdoor work', commute: 'two-wheeler' },
    advice: [/take breaks in a cleaner indoor space/i, /metro.train.bus for the longest leg/i],
  },
  {
    name: 'gas cooking in a home without a purifier', city: 'Ahmedabad, India', aqi: 165,
    prompt: 'I live in Ahmedabad, India. We cook with gas and have no purifier. How can we keep our kitchen air cleaner during smog?',
    profile: { cooking: 'gas stove', filtration: 'no purifier' },
    advice: [/exhaust hood that vents outdoors/i, /damp-clean/i], exclude: [/Run HEPA in/],
  },
  {
    name: 'housing society with an older air reading', city: 'Lucknow, India', aqi: 290, age: 4,
    prompt: 'How can our housing society cut emissions during winter smog in Lucknow, India?',
    profile: { community: 'neighbourhood' },
    advice: [/no recent timestamp/i, /avoid idling at the gate/i, /composting for garden waste/i],
    exclude: [/Current AQI: 290/, /Run HEPA in/],
  },
  {
    name: 'older adults with a HEPA filter', city: 'Jaipur, India', aqi: 145,
    prompt: 'How can I improve indoor air for my grandparents during smog in Jaipur, India? We use a HEPA purifier.',
    profile: { vulnerable: ['older adults'], filtration: 'HEPA purifier' },
    advice: [/household members you flagged as sensitive/i, /one cleaner-air room/i],
  },
  {
    name: 'bicycle commuter during hazardous smog', city: 'Pune, India', aqi: 305,
    prompt: 'I live in Pune, India. I cycle to work. How can I reduce my exposure to smog on my commute?',
    profile: { commute: 'walk/cycle' }, advice: [/postpone non-essential trips/i, /use transit for the polluted segment/i],
  },
  {
    name: 'Hinglish household question with no reading', city: 'Mumbai', aqi: null,
    prompt: 'Main Mumbai mein hoon. Ghar mein gas hai aur purifier nahi hai. Smog mein ghar ki hawa kaise saaf rakhu?',
    profile: { cooking: 'gas stove', filtration: 'no purifier' },
    advice: [/Current AQI:\*\* unavailable/, /gas stove runs/], exclude: [/Run HEPA in/, /Current AQI: [0-9]/],
  },
];

for (const example of cases) {
  test(example.name, () => {
    const route = routePlaceRequest(example.prompt);
    assert.equal(route.intent, INTENTS.GET_SMOG_PLAN);
    assert.equal(route.place, example.city);
    const profile = parseSmogProfile(route.smogDetails);
    for (const [field, expected] of Object.entries(example.profile)) assert.deepEqual(profile[field], expected, field);
    const aqi = example.aqi === null ? null : {
      aqi: example.aqi, sourceType: 'modeled', timestamp: new Date(now - (example.age ?? 0) * 3_600_000).toISOString(),
    };
    const plan = buildSmogPlan(profile, { city: route.place, aqi, now });
    for (const text of example.advice) assert.match(plan.text, text);
    for (const text of example.exclude ?? []) assert.doesNotMatch(plan.text, text);
    const explanations = plan.actions.find(action => action.action === 'EXPLAIN_SMOG_CHOICES').data.choices;
    assert.equal(explanations.length, 5);
    assert.ok(explanations.every(choice => choice.impact && plan.text.includes(choice.impact)));
  });
}

test('definitions, current readings and policy searches keep their own routes', () => {
  assert.deepEqual(routePlaceRequest('What causes winter smog?'), { kind: 'general', intent: INTENTS.ASK_QUESTION });
  assert.equal(routePlaceRequest('What is the AQI in Delhi today?').intent, INTENTS.GET_AIR_QUALITY);
  assert.equal(routePlaceRequest('Search the web for the current policy on open burning.').kind, 'web');
});

test('a scooter delivery shift includes a feasible emission-reducing action at moderate AQI', () => {
  const profile = parseSmogProfile('I work outdoors and ride a scooter.');
  const plan = buildSmogPlan(profile, { city: 'Nagpur', now,
    aqi: { aqi: 121, timestamp: new Date(now).toISOString(), sourceType: 'modeled' } });
  assert.match(plan.text, /group stops to avoid repeat trips/i);
  assert.match(plan.text, /switch off the engine when parked/i);
  assert.match(plan.text, /take breaks in a cleaner indoor space/i);
});

test('public smog plans open a sourced search in each chat language', () => {
  for (const question of [
    'What is the government’s official smog plan in Delhi?',
    'Delhi ka sarkari smgo plan kya hai?',
    'दिल्ली की सरकारी स्मॉग योजना क्या है?',
    'What is the smog plan announced by the government in Delhi?',
  ]) {
    assert.equal(routePlaceRequest(question).kind, 'web', question);
  }
  assert.equal(routePlaceRequest('What is the official winter smog plan near me?').needsPlace, true);
  assert.equal(routePlaceRequest('I work at a government school. Create a smog plan for my family in Delhi.').intent, INTENTS.GET_SMOG_PLAN);
  assert.equal(routePlaceRequest('What is the official AQI in Delhi?').intent, INTENTS.GET_AIR_QUALITY);
});

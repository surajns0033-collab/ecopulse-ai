import assert from 'node:assert/strict';
import test from 'node:test';
import { recognitionText } from '../src/agent/chatLanguage.js';
import { detectIntent, INTENTS } from '../src/agent/intentEngine.js';
import { routePlaceRequest } from '../src/agent/placeContext.js';
import { parseSmogProfile } from '../src/agent/smogProfile.js';
import { buildSmogPlan } from '../src/agent/smogPlan.js';

test('family details in the request reach the plan together', () => {
  const question = 'Create a smog plan for my child who has asthma and takes the bus to school';
  const route = routePlaceRequest(question);
  const profile = parseSmogProfile(route.smogDetails);
  assert.equal(route.intent, INTENTS.GET_SMOG_PLAN);
  assert.equal(profile.commute, 'public transport');
  assert.deepEqual(profile.vulnerable, ['children', 'heart/lung sensitivity']);
});

test('cooking advice respects a household without an exhaust hood', () => {
  const profile = parseSmogProfile('I cook on a gas stove and have no exhaust hood.');
  const plan = buildSmogPlan(profile, { city: 'Delhi' });
  const choices = plan.actions.find(action => action.action === 'EXPLAIN_SMOG_CHOICES').data.choices;
  assert.match(choices[3].advice, /lid|cover/i);
  assert.doesNotMatch(choices[3].advice, /use an exhaust hood|run (?:a|the) hood/i);
});

test('natural scooter and cyclist questions reach the personalized plan', () => {
  for (const message of [
    'I cycle to work in winter smog. How can I reduce my exposure?',
    'I deliver parcels by scooter. What can I change during winter smog to reduce emissions?',
  ]) {
    const route = routePlaceRequest(message);
    assert.equal(route.intent, INTENTS.GET_SMOG_PLAN, message);
    assert.ok(parseSmogProfile(route.smogDetails).commute, message);
  }
});

test('school timing questions preserve the city in English, Hindi and Hinglish', () => {
  for (const [question, city] of [
    ['Should our school in Delhi move sports indoors tomorrow because of smog?', 'Delhi'],
    ['Delhi mein kal subah school assembly bahar rakhni chahiye?', 'Delhi'],
    ['दिल्ली में कल सुबह स्कूल की सभा बाहर रखें या अंदर?', 'दिल्ली'],
  ]) {
    const route = routePlaceRequest(question);
    assert.equal(route.place, city, question);
    assert.ok([INTENTS.GET_AIR_QUALITY, INTENTS.GET_SMOG_PLAN].includes(route.intent), question);
  }
});

test('recognizable typing mistakes reach the same tool and preserve place names', () => {
  for (const [question, intent] of [
    ['cretae a smgo plna for my family', INTENTS.GET_SMOG_PLAN],
    ['air polution forcast in Noida tomorrow morning', INTENTS.GET_AIR_QUALITY],
    ['mera smgo plan banao', INTENTS.GET_SMOG_PLAN],
  ]) assert.equal(detectIntent(question).intent, intent, question);
  assert.equal(routePlaceRequest('air polution forcast in Noida tomorrow morning').place, 'Noida');
  assert.equal(detectIntent('Can I repair a chair?').intent, INTENTS.ASK_QUESTION);
  assert.equal(detectIntent('I saw garbage on the street').entities.category, undefined);
});

test('misspellings in a commuter question and bilingual AQI route preserve unrelated words and city names', () => {
  const commute = 'Main scoter se delivery karta hu. Pradushn me exposur kaise kam karu?';
  assert.equal(routePlaceRequest(commute).intent, INTENTS.GET_SMOG_PLAN);
  assert.equal(parseSmogProfile(routePlaceRequest(commute).smogDetails).commute, 'two-wheeler');
  const city = 'Pune me hawa ki qualty kaisi hai?';
  assert.equal(routePlaceRequest(city).place, 'Pune');
  assert.equal(routePlaceRequest(city).intent, INTENTS.GET_AIR_QUALITY);
  const raw = 'My garage, repot, complain, low-emission, https://example.org/forcast, smgo@example.org';
  assert.equal(recognitionText(raw), raw);
  assert.equal(detectIntent('My garage door is stuck').intent, INTENTS.ASK_QUESTION);
  assert.equal(detectIntent('mera naam kya hai?').intent, INTENTS.ASK_QUESTION);
});

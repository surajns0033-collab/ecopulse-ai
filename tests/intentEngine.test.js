import test from 'node:test';
import assert from 'node:assert/strict';
import { asksForSmogPlan, detectIntent, INTENTS } from '../src/agent/intentEngine.js';

test('explicit requests retain the tool and confirmation policy for each action', () => {
  const cases = [
    ['Host a community cleanup event', INTENTS.CREATE_EVENT, 'createMeetup', true],
    ['Show the national helpline and local authority contacts', INTENTS.GET_AUTHORITY_CONTACTS, null, false],
    ['Search the web for air pollution news', INTENTS.ASK_QUESTION, null, false],
    ['I saw garbage dumped on my street in Vashi', INTENTS.CREATE_REPORT, 'createEnvironmentalReport', true],
    ['How do I plan my daily study schedule?', INTENTS.ASK_QUESTION, null, false],
  ];
  for (const [input, intent, tool, confirmation] of cases) {
    const result = detectIntent(input);
    assert.equal(result.intent, intent, input);
    assert.equal(result.suggestedTool, tool, input);
    assert.equal(result.requiresConfirmation, confirmation, input);
    assert.equal(result.message, input.toLowerCase());
  }
  const draft = detectIntent('Draft email', [{ role: 'user', text: 'I saw sewage on my street.' }]);
  assert.equal(draft.intent, INTENTS.CREATE_EMAIL);
  assert.equal(draft.requiresConfirmation, true);
  const keyword = detectIntent('Eco meetups in Vashi');
  assert.equal(keyword.entities.location, 'vashi');
  assert.ok(keyword.matchedKeywords.includes('meetups'));
});

test('household exposure requests and searches for official guidance stay separate', () => {
  for (const input of [
    'How can our family reduce exposure to winter smog on the way to school?',
    'How do we lower air pollution exposure for our kids during school pickup?',
    'How can we improve indoor air quality at home during winter smog?',
  ]) {
    assert.equal(detectIntent(input).intent, INTENTS.GET_SMOG_PLAN, input);
  }
  for (const input of ['What is the AQI in Delhi?', 'Search the web for the official plan for severe smog.', 'How do I improve my study routine?']) {
    assert.equal(asksForSmogPlan(input), false, input);
  }
});

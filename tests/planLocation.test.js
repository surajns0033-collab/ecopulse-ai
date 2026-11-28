import test from 'node:test';
import assert from 'node:assert/strict';
import { AWAITING_CHAT_PLACE, resolveChatPlace } from '../src/agent/chatPlaces.js';
import { INTENTS } from '../src/agent/intentEngine.js';
import { AWAITING_SMOG_PROFILE } from '../src/agent/smogProfile.js';
import { NaviMumbai, Paris, forbidLookup } from './placeFixtures.mjs';

test('a one-message clean-air plan separates the qualified city from private lifestyle details', async () => {
  const text = 'Make a smog action plan for Navi Mumbai, Maharashtra, India. I take the train and have no purifier.';
  const turn = await resolveChatPlace(text, [], null, null, {
    lookup: async (query) => {
      assert.equal(query, NaviMumbai.city);
      return { location: NaviMumbai };
    },
    locateDevice: assert.fail,
  });
  assert.equal(turn.intent, INTENTS.GET_SMOG_PLAN);
  assert.equal(turn.location, NaviMumbai);
  assert.equal(turn.smogDetails, 'I take the train and have no purifier');
});

test('a low-emission daily routine can use a separate city statement and does not invent a commute', async () => {
  const text = 'I live in Paris, France. Suggest a low-emission daily routine. I cook with induction.';
  const turn = await resolveChatPlace(text, [], NaviMumbai, null, {
    lookup: async (query) => {
      assert.equal(query, 'Paris, France');
      return { location: Paris };
    },
  });
  assert.equal(turn.intent, INTENTS.GET_SMOG_PLAN);
  assert.equal(turn.location, Paris);
  assert.equal(turn.smogDetails, 'I cook with induction');
  assert.equal(turn.context.chosenLocation, Paris);
});

test('an unresolved smog-plan city does not use the previous location or discard the supplied profile', async () => {
  const request = 'Smog plan for Parris; I work outdoors and use a gas stove.';
  const offered = await resolveChatPlace(request, [], NaviMumbai, null, {
    lookup: async (query) => {
      assert.equal(query, 'Parris');
      return { candidate: Paris };
    },
  });
  assert.equal(offered.kind, 'reply');
  assert.match(offered.text, /^Did you mean Paris/);
  assert.equal(offered.location, undefined);
  const pending = { type: AWAITING_CHAT_PLACE, waiting: offered.context.waiting };
  const confirmed = await resolveChatPlace('Yes', [], NaviMumbai, pending, { lookup: forbidLookup });
  assert.equal(confirmed.intent, INTENTS.GET_SMOG_PLAN);
  assert.equal(confirmed.location, Paris);
  assert.equal(confirmed.smogDetails, 'I work outdoors and use a gas stove');
});

test('when Chat is waiting for a profile, a new city replaces the original city only after verification', async () => {
  const pending = { type: AWAITING_SMOG_PROFILE, location: NaviMumbai };
  const skip = await resolveChatPlace('Skip.', [], null, pending, { lookup: forbidLookup });
  assert.equal(skip.location, NaviMumbai);
  assert.equal(skip.smogDetails, 'Skip');

  const change = await resolveChatPlace('Set my city to Paris; I commute by bus', [], NaviMumbai, pending, {
    lookup: async (query) => {
      assert.equal(query, 'Paris');
      return { location: Paris };
    },
  });
  assert.equal(change.intent, INTENTS.GET_SMOG_PLAN);
  assert.equal(change.location, Paris);
  assert.equal(change.context.chosenLocation, Paris);
  assert.equal(change.smogDetails, 'I commute by bus');
});


test('a school smog request keeps its audience when a city is supplied later', async () => {
  const question = 'Make a smog plan for our school.';
  const first = await resolveChatPlace(question, [], null, null, { lookup: forbidLookup });
  assert.equal(first.kind, 'reply');
  const pending = { type: AWAITING_CHAT_PLACE, waiting: first.context.waiting };
  const second = await resolveChatPlace('Navi Mumbai, Maharashtra, India', [], null, pending, {
    lookup: async () => ({ location: NaviMumbai }),
  });
  assert.equal(second.intent, INTENTS.GET_SMOG_PLAN);
  assert.match(second.smogDetails, /our school/i);
  assert.equal(second.location.city, NaviMumbai.city);
});

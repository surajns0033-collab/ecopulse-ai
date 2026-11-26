import test from 'node:test';
import assert from 'node:assert/strict';
import { isSmogProfile, parseSmogProfile } from '../src/agent/smogProfile.js';

test('partial and multilingual smog profiles never fill in unstated details', () => {
  const text = 'मैं बस से ऑफिस जाती हूँ और घर पर गैस है।';
  const profile = parseSmogProfile(text);
  assert.equal(isSmogProfile(text), true);
  assert.equal(profile.commute, 'public transport');
  assert.equal(profile.routine, 'office/school');
  assert.equal(profile.cooking, 'gas stove');
  assert.equal(profile.filtration, null);
  assert.equal(parseSmogProfile('Gas stove, no HEPA filter').filtration, 'no purifier');
  assert.equal(parseSmogProfile('I don’t drive; I take the bus.').commute, 'public transport');
  assert.equal(isSmogProfile('Hello!'), false);
});

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

test('an explicit no-car commute is treated as transit, not driving', () => {
  assert.equal(parseSmogProfile('I take the metro to work, no car.').commute, 'public transport');
  assert.equal(parseSmogProfile('I do not use a car; I cycle.').commute, 'walk/cycle');
});

test('negative household details do not hide a separate sensitivity the user disclosed', () => {
  const result = parseSmogProfile('No children, no older adults, no asthma. I have a heart condition.');
  assert.deepEqual(result.vulnerable, ['heart/lung sensitivity']);
  assert.deepEqual(parseSmogProfile('No baby; no grandparents; no lung condition.').vulnerable, []);
});

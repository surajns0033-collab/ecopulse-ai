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

test('cooking advice uses appliances the household says it has', () => {
  assert.equal(parseSmogProfile('I cook with gas and do not have an induction stove.').cooking, 'gas stove');
  assert.equal(parseSmogProfile('No gas stove. We cook with induction.').cooking, 'induction/electric');
  assert.equal(parseSmogProfile('I don’t cook with gas.').cooking, null);
  assert.equal(parseSmogProfile('We use neither gas nor an induction stove.').cooking, null);
  assert.equal(parseSmogProfile('I do not have an induction stove or a gas stove.').cooking, null);
  assert.equal(parseSmogProfile('No induction at work, but I cook with gas at home.').cooking, 'gas stove');
  assert.equal(parseSmogProfile('No induction at work, but I use induction at home.').cooking, 'induction/electric');
  assert.equal(parseSmogProfile('घर पर गैस है, इंडक्शन नहीं है।').cooking, 'gas stove');
});

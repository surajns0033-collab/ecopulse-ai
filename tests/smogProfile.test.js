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
  assert.equal(parseSmogProfile('Gas stove, no HEPA filter').filtration, 'without HEPA purifier');
  assert.equal(parseSmogProfile('I don’t drive; I take the bus.').commute, 'public transport');
  assert.equal(isSmogProfile('Hello!'), false);
});

test('Hindi and Hinglish commuters can rule out a mode or a sensitivity', () => {
  assert.equal(parseSmogProfile('Mere paas car nahi hai, main metro leta hoon.').commute, 'public transport');
  const profile = parseSmogProfile('Main bike se nahi jaata. Metro se office jaata hu. Asthma nahi hai.');
  assert.equal(profile.commute, 'public transport');
  assert.equal(profile.routine, 'office/school');
  assert.deepEqual(profile.vulnerable, []);
  assert.equal(parseSmogProfile('मैं कार से नहीं जाता, मेट्रो से ऑफिस जाता हूँ।').commute, 'public transport');
});

test('a denied transport mode leaves the stated commute available', () => {
  assert.equal(parseSmogProfile('I take the metro to work, no car.').commute, 'public transport');
  assert.equal(parseSmogProfile('I do not use a car; I cycle.').commute, 'walk/cycle');
  assert.equal(parseSmogProfile('I don’t have a car or a bike. I take the metro.').commute, 'public transport');
  assert.equal(parseSmogProfile('I don’t cycle. I take the train.').commute, 'public transport');
  assert.equal(parseSmogProfile('No car or scooter.').commute, null);
  assert.equal(parseSmogProfile('I have no car, but I drive to school.').commute, 'car');
});

test('negative household details do not hide a separate sensitivity the user disclosed', () => {
  const result = parseSmogProfile('No children, no older adults, no asthma. I have a heart condition.');
  assert.deepEqual(result.vulnerable, ['heart/lung sensitivity']);
  assert.deepEqual(parseSmogProfile('No baby; no grandparents; no lung condition.').vulnerable, []);
  assert.deepEqual(parseSmogProfile('No kids or asthma. My grandparents live with me.').vulnerable, ['older adults']);
});

test('cooking at home preserves a separately stated office routine', () => {
  const profile = parseSmogProfile('I take the metro to the office and cook at home.');
  assert.equal(profile.commute, 'public transport');
  assert.equal(profile.routine, 'office/school');
  assert.equal(profile.cooking, null);
  assert.equal(parseSmogProfile('I work from home and cook with gas.').routine, 'mostly home');
  assert.equal(parseSmogProfile('मी घरून काम करते आणि घरी गॅस आहे.').routine, 'mostly home');
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

test('air-cleaning advice respects absent equipment and separately stated alternatives', () => {
  for (const input of ['I don’t have HEPA.', 'HEPA filter nahi hai.', 'घर पर हेपा फ़िल्टर नहीं है।']) {
    assert.equal(parseSmogProfile(input).filtration, 'without HEPA purifier', input);
  }
  assert.equal(parseSmogProfile('फ़िल्टर मेरे पास नहीं है।').filtration, 'no purifier');
  assert.equal(parseSmogProfile('No HEPA purifier, but I use a DIY filtered fan.').filtration, 'DIY filtered-air setup');
  assert.equal(parseSmogProfile('I have no DIY filter. We use HEPA at home.').filtration, 'HEPA purifier');
  assert.equal(parseSmogProfile('I use a purifier.').filtration, null);
});

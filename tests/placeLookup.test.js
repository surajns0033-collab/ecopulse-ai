import test from 'node:test';
import assert from 'node:assert/strict';
import { getDevicePlace, lookupPlace } from '../src/services/placeLookup.js';

const openPlace = (name, admin1, country, latitude, longitude) => ({ name, admin1, country, latitude, longitude, feature_code: 'PPL' });

test('device location rejects imprecise fixes and only reverse-geocodes rounded coordinates', async () => {
  const device = (accuracy) => ({ getCurrentPosition: (success) => success({ coords: { latitude: 19.083421, longitude: 72.88134, accuracy } }) });
  assert.equal(await getDevicePlace({ geolocation: device(20000), request: assert.fail }), null);
  const location = await getDevicePlace({ geolocation: device(300), request: async (url) => {
    const coords = new URL(url).searchParams;
    assert.equal(coords.get('lat'), '19.08');
    assert.equal(coords.get('lon'), '72.88');
    return Response.json({ address: { city: 'Mumbai', state: 'Maharashtra', country: 'India', road: 'Not part of the city label' } });
  } });
  assert.deepEqual(location, { name: 'Mumbai', city: 'Mumbai, Maharashtra, India', lat: 19.08, lng: 72.88 });
});

test('two exact Pennsylvania matches do not resolve to an unrelated state or country', async () => {
  const results = [openPlace('Pennsylvania', 'Alabama', 'United States', 33, -87), openPlace('Pennsylvania', 'England', 'United Kingdom', 51, -2)];
  const request = async () => Response.json({ results });
  assert.deepEqual(await lookupPlace('Pennsylvania', { request }), { ambiguous: true, candidate: null });
  const qualified = await lookupPlace('Pennsylvania, England', { request });
  assert.equal(qualified.location.city, 'Pennsylvania, England, United Kingdom');
  const onlyCountry = await lookupPlace('Pennsylvania, United States', { request });
  assert.equal(onlyCountry.location, undefined);
  assert.match(onlyCountry.candidate.city, /Alabama/);
});

test('a known provider spelling of a region preserves the state and country qualifiers', async () => {
  const request = async () => Response.json({ results: [
    openPlace('Paris', 'Texas', 'United States', 33.66, -95.55),
    openPlace('Paris', 'Île-de-France Region', 'France', 48.85, 2.35),
  ] });
  const hit = await lookupPlace('Paris, Île-de-France, France', { request });
  assert.equal(hit.location?.city, 'Paris, Île-de-France Region, France');
  assert.equal((await lookupPlace('Paris, Texas, France', { request })).location, undefined);
});

test('an ambiguous typed place is not treated as a different city', async () => {
  const request = async (url) => {
    assert.equal(new URL(url).searchParams.get('name'), 'Pun');
    return Response.json({ results: [
      openPlace('Pun', 'Karnali Pradesh', 'Nepal', 29, 81),
      openPlace('Pun', 'Loreto', 'Peru', -4, -73),
    ] });
  };
  assert.deepEqual(await lookupPlace('Pun', { request }), { ambiguous: true, candidate: null });
  assert.equal((await lookupPlace('Pun, Loreto', { request })).location.city, 'Pun, Loreto, Peru');
});

test('a fuzzy search’s first hit is not used unless its spelling or region matches', async () => {
  const request = async (url) => url.includes('open-meteo') ? Response.json({}) : Response.json({ features: [{
    properties: { name: 'Pennsylvania', country: 'United Kingdom', type: 'village' }, geometry: { coordinates: [-2, 51] },
  }, {
    properties: { name: 'Panvel', state: 'Maharashtra', country: 'India', type: 'city' }, geometry: { coordinates: [73.12, 18.99] },
  }] });
  assert.deepEqual(await lookupPlace('local area', { request }), {});
  const misspelled = await lookupPlace('Panvell', { request });
  assert.equal(misspelled.candidate.name, 'Panvel');
  assert.equal(misspelled.location, undefined);
  assert.deepEqual(await lookupPlace('Panvel, Canada', { request }), {});
});

test('sanfransico can suggest the verified map target even when the fuzzy provider is unavailable', async () => {
  const request = async (url) => {
    assert.equal(new URL(url).searchParams.get('name'), 'San Francisco');
    return Response.json({ results: [
      { ...openPlace('San Francisco', 'California', 'United States', 37.77, -122.42), population: 827526 },
      { ...openPlace('San Francisco', 'Caraga', 'Philippines', 8.5, 125.98), population: 79718 },
    ] });
  };
  const hit = await lookupPlace('sanfransico', { map: true, request });
  assert.equal(hit.location, undefined);
  assert.equal(hit.candidate.city, 'San Francisco, California, United States');
});

test('the geocoder verifies a Marathi city spelling using the same place data', async () => {
  const result = await lookupPlace('मुंबईत', { request: async (url) => {
    assert.equal(new URL(url).searchParams.get('name'), 'Mumbai');
    return Response.json({ results: [{ ...openPlace('Mumbai', 'Maharashtra', 'India', 19.08, 72.88), population: 1e7 }] });
  } });
  assert.deepEqual(result.location, { name: 'Mumbai', city: 'Mumbai, Maharashtra, India', lat: 19.08, lng: 72.88 });
});

test('malformed primary and secondary place data safely produce no city', async () => {
  for (const pair of [[{ results: {} }, { features: 5 }], [{ results: [null, { feature_code: 'PPL' }] },
    { features: [null, { properties: null }, { properties: { type: 'city', name: 'Only a name' } }] }]]) {
    const result = await lookupPlace('Unverified', { request: async url => Response.json(url.includes('open-meteo') ? pair[0] : pair[1]) });
    assert.deepEqual(result, {});
  }
});

test('a common city transposition proposes the geocoded city for confirmation', async () => {
  const request = async url => {
    assert.equal(new URL(url).searchParams.get('name'), 'Delhi');
    return Response.json({ results: [{ ...openPlace('Delhi', 'Delhi', 'India', 28.6, 77.2), population: 1000000 }] });
  };
  const result = await lookupPlace('Dehli, India', { request });
  assert.equal(result.candidate.city, 'Delhi, India');
  assert.equal(result.location, undefined);
});

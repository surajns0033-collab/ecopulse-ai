import { normalize, qualifies, validPlace, namedWithRegion, editDistance } from './placeMatching.js';

export function primaryPlaces(data, map, expected, qualifiers) {
  const rows = Array.isArray(data?.results) ? data.results.filter(row => typeof row?.name === 'string') : [];
  const regionMatch = !map && rows.some(row => /^(?:ADM1|PCL[A-Z]*)$/.test(row.feature_code) &&
    normalize(row.name) === expected && qualifies({ region: row.admin1 || row.name, country: row.country, countryCode: row.country_code }, qualifiers));
  const places = rows.filter(row => /^PPL/.test(row.feature_code) || (map && /^(?:ADM|PCL)/.test(row.feature_code)))
    .map(row => ({
      name: row.name, region: row.admin1, country: row.country, countryCode: row.country_code,
      lat: row.latitude, lng: row.longitude, timeZone: row.timezone, population: row.population || 0,
    })).filter(validPlace);
  return { regionMatch, places };
}

const settlementTypes = new Set(['city', 'town', 'village', 'municipality', 'locality', 'district', 'suburb']);
const osmSettlements = new Set(['city', 'town', 'village', 'municipality', 'suburb']);

export function secondaryPlaces(data, map) {
  if (!Array.isArray(data?.features)) return [];
  return data.features.flatMap(feature => {
    const place = feature?.properties;
    if (typeof place?.name !== 'string') return [];
    if (!map && !settlementTypes.has(place.type) && !(place.osm_key === 'place' && osmSettlements.has(place.osm_value))) return [];
    return [{ name: place.name, region: place.state, country: place.country, countryCode: place.countrycode,
      lat: feature.geometry?.coordinates?.[1], lng: feature.geometry?.coordinates?.[0], population: 0 }];
  }).filter(validPlace);
}

export function suggestedPlace(places, name, qualifiers, map) {
  const expected = normalize(name);
  if (!qualifiers.length) {
    const qualified = places.find(place => namedWithRegion(place, expected));
    if (qualified) return { place: qualified, exact: true };
  }
  const compact = expected.replaceAll(' ', '');
  const landmark = value => normalize(value).replace(/\b(?:railway|train|railroad|metro) station\b/g, 'station');
  const place = places.find(place => qualifies(place, qualifiers) &&
    ((map && landmark(place.name) === landmark(name)) || (compact.length >= 5 &&
      editDistance(normalize(place.name).replaceAll(' ', ''), compact) <= (compact.length >= 8 ? 2 : 1))));
  return place ? { place, exact: false } : null;
}

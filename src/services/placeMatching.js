export const normalize = (value) => String(value || '').normalize('NFD')
  .replace(/(\p{Script=Latin})\p{M}+/gu, '$1').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();

const aliases = new Map(Object.entries({
  bangalore: 'Bengaluru', bombay: 'Mumbai', bambai: 'Mumbai', dilli: 'Delhi',
  madras: 'Chennai', calcutta: 'Kolkata', poona: 'Pune', gurgaon: 'Gurugram',
  baroda: 'Vadodara', trivandrum: 'Thiruvananthapuram', cochin: 'Kochi', benares: 'Varanasi',
  मुंबई: 'Mumbai', मुम्बई: 'Mumbai', मुंबईत: 'Mumbai', 'नवी मुंबई': 'Navi Mumbai', 'नवी मुंबईत': 'Navi Mumbai',
  'नई दिल्ली': 'New Delhi', दिल्ली: 'Delhi', दिल्लीत: 'Delhi',
  पुणे: 'Pune', पुण्यात: 'Pune', बेंगलुरु: 'Bengaluru', बैंगलोर: 'Bengaluru', पनवेल: 'Panvel', पनवेलमध्ये: 'Panvel',
  महाराष्ट्र: 'Maharashtra', भारत: 'India',
}));

const regions = {
  usa: 'us', 'united states': 'us', 'united states of america': 'us', uk: 'gb', 'united kingdom': 'gb',
  'national capital territory of delhi': 'delhi',
  'ile de france region': 'ile de france',
};
const regionKey = (value) => {
  const key = normalize(value);
  return Object.hasOwn(regions, key) ? regions[key] : key;
};
export const commonTypos = new Map(['sanfransico', 'sanfrancisco', 'sanfransisco', 'san fransico'].map((typo) => [typo, 'San Francisco']));

export function alias(value) {
  return aliases.get(value.toLowerCase()) || value;
}

export function qualifies(place, qualifiers) {
  const available = [place.region, place.country, place.countryCode].map(regionKey);
  return qualifiers.every((value) => available.includes(regionKey(value)));
}

export function validPlace(place) {
  return place.name && Number.isFinite(place.lat) && Number.isFinite(place.lng) &&
    Math.abs(place.lat) <= 90 && Math.abs(place.lng) <= 180;
}

export function selectExact(places, expected, qualifiers) {
  const matches = places.filter((place) => validPlace(place) &&
    normalize(place.name) === expected && qualifies(place, qualifiers));
  // Different neighbourhoods in the same state can also share a name. Only
  // collapse duplicate provider entries for essentially the same coordinates.
  const unique = matches.filter((place, index) => !matches.slice(0, index).some((other) =>
    Math.abs(place.lat - other.lat) < .03 && Math.abs(place.lng - other.lng) < .03));
  if (!unique.length) return null;
  if (unique.length === 1) {
    const [match] = unique;
    return match.population || qualifiers.some((value) => regionKey(value) === regionKey(match.region))
      ? { location: toLocation(match) } : { candidate: toLocation(match) };
  }

  const [first, second] = [...unique].sort((a, b) => b.population - a.population);
  return {
    ambiguous: true,
    // Offer the common namesake as a question, never silently choose it.
    candidate: first.population >= 100000 && first.population > second.population * 10
      ? toLocation(first) : null,
  };
}

export function toLocation(place) {
  return {
    ...(place.timeZone ? { timeZone: place.timeZone } : {}),
    lat: place.lat,
    lng: place.lng,
    name: place.name,
    city: [...new Set([place.name, place.region, place.country].filter(Boolean))].join(', '),
  };
}

export function namedWithRegion(place, expected) {
  const name = normalize(place.name);
  if (!expected.startsWith(`${name} `)) return false;
  const suffix = expected.slice(name.length + 1);
  const region = normalize(place.region);
  const country = normalize(place.country);
  return suffix === region || regionKey(suffix) === regionKey(country) ||
    (suffix.startsWith(`${region} `) && regionKey(suffix.slice(region.length + 1)) === regionKey(country));
}

export function editDistance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) {
      next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (a[i] === b[j] ? 0 : 1)));
    }
    row = next;
  }
  return row[b.length];
}

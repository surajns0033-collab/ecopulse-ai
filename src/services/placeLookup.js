// Unlike a map search, a live reading needs the intended place, not just a plausible hit.
const normalize = (value) => String(value || '').normalize('NFD')
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
const commonTypos = new Map(['sanfransico', 'sanfrancisco', 'sanfransisco', 'san fransico'].map((typo) => [typo, 'San Francisco']));

function alias(value) {
  return aliases.get(value.toLowerCase()) || value;
}

function qualifies(place, qualifiers) {
  const available = [place.region, place.country, place.countryCode].map(regionKey);
  return qualifiers.every((value) => available.includes(regionKey(value)));
}

function validPlace(place) {
  return place.name && Number.isFinite(place.lat) && Number.isFinite(place.lng) &&
    Math.abs(place.lat) <= 90 && Math.abs(place.lng) <= 180;
}

function selectExact(places, expected, qualifiers) {
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

function toLocation(place) {
  return {
    lat: place.lat,
    lng: place.lng,
    name: place.name,
    city: [...new Set([place.name, place.region, place.country].filter(Boolean))].join(', '),
  };
}

function namedWithRegion(place, expected) {
  const name = normalize(place.name);
  if (!expected.startsWith(`${name} `)) return false;
  const suffix = expected.slice(name.length + 1);
  const region = normalize(place.region);
  const country = normalize(place.country);
  return suffix === region || regionKey(suffix) === regionKey(country) ||
    (suffix.startsWith(`${region} `) && regionKey(suffix.slice(region.length + 1)) === regionKey(country));
}

function editDistance(a, b) {
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

async function readPlaces(url, signal, request) {
  try {
    const deadline = AbortSignal.timeout(3500);
    const res = await request(url, { signal: signal ? AbortSignal.any([deadline, signal]) : deadline });
    return res.ok ? await res.json() : null;
  } catch {
    signal?.throwIfAborted();
    return null;
  }
}

export async function lookupPlace(query, { map = false, signal, request = fetch } = {}) {
  const [rawName, ...qualifiers] = query.split(',').map((part) => alias(part.trim())).filter(Boolean);
  if (!rawName) return {};
  // Resolve a common spelling error without relying on the
  // availability of the fuzzy provider. The correction still needs consent.
  const normalized = normalize(rawName);
  const corrected = commonTypos.get(normalized);
  const name = corrected || rawName;
  const expected = normalize(name);
  const data = await readPlaces(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&language=en&count=20`, signal, request);
  const results = data?.results || [];
  const matchingRegion = !map && results.some((p) => /^(?:ADM1|PCL[A-Z]*)$/.test(p.feature_code) &&
    normalize(p.name) === expected && qualifies({ region: p.admin1 || p.name, country: p.country, countryCode: p.country_code }, qualifiers));
  const places = results.filter((p) => /^PPL/.test(p.feature_code) || (map && /^(?:ADM|PCL)/.test(p.feature_code)))
    .map((p) => ({
      name: p.name, region: p.admin1, country: p.country, countryCode: p.country_code,
      lat: p.latitude, lng: p.longitude, population: p.population || 0,
    }));
  const exact = selectExact(places, expected, qualifiers);
  if (matchingRegion) {
    // Same-named settlements are not substitutes for a state or country.
    return { ambiguous: true, candidate: exact?.location && places.some((p) => p.population >= 100000 && p.lat === exact.location.lat && p.lng === exact.location.lng) ? exact.location : null };
  }
  if (exact?.location || exact?.candidate) return corrected && exact.location ? { candidate: exact.location } : exact;

  if (exact) return exact;

  // Keep typo and landmark lookup, but never present a fuzzy hit as confirmed.
  const queryWithRegion = [name, ...qualifiers].join(', ');
  const photon = await readPlaces(`https://photon.komoot.io/api/?q=${encodeURIComponent(queryWithRegion)}&limit=10&lang=en`, signal, request);
  const otherPlaces = (photon?.features || []).filter(({ properties: p = {} }) => map ||
    ['city', 'town', 'village', 'municipality', 'locality', 'district', 'suburb'].includes(p.type) ||
    (p.osm_key === 'place' && ['city', 'town', 'village', 'municipality', 'suburb'].includes(p.osm_value)))
    .map(({ properties: p = {}, geometry }) => ({
      name: p.name, region: p.state, country: p.country, countryCode: p.countrycode,
      lat: geometry?.coordinates?.[1], lng: geometry?.coordinates?.[0], population: 0,
    }));
  const otherExact = selectExact(otherPlaces, expected, qualifiers);
  // A secondary provider's single exact hit might hide namesakes (e.g. after
  // a timeout above). Ask for confirmation before using its coordinates.
  if (otherExact) return otherExact.location ? { candidate: otherExact.location } : otherExact;
  if (!qualifiers.length) {
    const qualified = [...places, ...otherPlaces].find((place) => validPlace(place) && namedWithRegion(place, expected));
    if (qualified) return { candidate: toLocation(qualified) };
  }
  const compact = expected.replaceAll(' ', '');
  const landmarkName = (value) => normalize(value).replace(/\b(?:railway|train|railroad|metro) station\b/g, 'station');
  const close = [...places, ...otherPlaces].find((place) => validPlace(place) && qualifies(place, qualifiers) &&
    ((map && landmarkName(place.name) === landmarkName(name)) ||
      (compact.length >= 5 && editDistance(normalize(place.name).replaceAll(' ', ''), compact) <= (compact.length >= 8 ? 2 : 1))));
  return close ? { candidate: toLocation(close) } : {};
}

// Only called after an explicit location request. Inaccurate fixes and reverse
// geocoding failures must not turn into a default city or a full street address.
export async function getDevicePlace({ signal, geolocation = globalThis.navigator?.geolocation, request = fetch } = {}) {
  if (!geolocation || signal?.aborted) return null;
  const coords = await new Promise((resolve) => {
    const timeout = setTimeout(() => finish(null), 5500);
    const aborted = () => finish(null);
    function finish(value) {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', aborted);
      resolve(value);
    }
    signal?.addEventListener('abort', aborted, { once: true });
    try {
      geolocation.getCurrentPosition(({ coords }) => finish(coords), () => finish(null),
        { timeout: 5000, maximumAge: 60000, enableHighAccuracy: false });
    } catch { finish(null); }
  });
  if (signal?.aborted || !coords || !Number.isFinite(coords.accuracy) || coords.accuracy > 5000 ||
      !Number.isFinite(coords.latitude) || Math.abs(coords.latitude) > 90 ||
      !Number.isFinite(coords.longitude) || Math.abs(coords.longitude) > 180) return null;

  const lat = Number(coords.latitude.toFixed(2));
  const lng = Number(coords.longitude.toFixed(2));
  const result = await readPlaces(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=10&accept-language=en`, signal, request);
  const address = result?.address;
  const name = address?.city || address?.town || address?.village || address?.municipality;
  return name && address.country ? toLocation({ name, region: address.state, country: address.country, lat, lng }) : null;
}

import { normalize, commonTypos, alias, qualifies, validPlace, selectExact, toLocation, namedWithRegion, editDistance } from './placeMatching.js';

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

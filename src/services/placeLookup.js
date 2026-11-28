import { primaryPlaces, secondaryPlaces, suggestedPlace, deviceLocality } from './geocodingResults.js';
import { normalize, commonTypos, alias, selectExact, toLocation } from './placeMatching.js';

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

function regionCandidate(exact, places) {
  const location = exact?.location;
  const candidate = location && places.some(place => place.population >= 100000 && place.lat === location.lat && place.lng === location.lng)
    ? location : null;
  return { ambiguous: true, candidate };
}

async function secondaryLookup(primary, name, qualifiers, map, signal, request) {
  const query = [name, ...qualifiers].join(', ');
  const url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(query) + '&limit=10&lang=en';
  const secondary = secondaryPlaces(await readPlaces(url, signal, request), map);
  const exact = selectExact(secondary, normalize(name), qualifiers);
  if (exact) return exact.location ? { candidate: exact.location } : exact;
  const suggestion = suggestedPlace([...primary, ...secondary], name, qualifiers, map);
  if (!suggestion) return {};
  const location = toLocation(suggestion.place);
  return suggestion.exact ? { location } : { candidate: location };
}

export async function lookupPlace(query, { map = false, signal, request = fetch } = {}) {
  const [rawName, ...qualifiers] = query.split(',').map(part => alias(part.trim())).filter(Boolean);
  if (!rawName) return {};
  const corrected = commonTypos.get(normalize(rawName));
  const name = corrected || rawName;
  const url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(name) + '&language=en&count=20';
  const data = await readPlaces(url, signal, request);
  const { places, regionMatch } = primaryPlaces(data, map, normalize(name), qualifiers);
  const exact = selectExact(places, normalize(name), qualifiers);
  if (regionMatch) return regionCandidate(exact, places);
  if (exact) return corrected && exact.location ? { candidate: exact.location } : exact;
  return secondaryLookup(places, name, qualifiers, map, signal, request);
}

function readDeviceCoordinates(geolocation, signal) {
  return new Promise((resolve) => {
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
}

function usableFix(coords) {
  return coords && Number.isFinite(coords.accuracy) && coords.accuracy <= 5000 && coords.accuracy >= 0 &&
    Number.isFinite(coords.latitude) && Math.abs(coords.latitude) <= 90 &&
    Number.isFinite(coords.longitude) && Math.abs(coords.longitude) <= 180;
}

// Only called after an explicit location request. Inaccurate fixes and reverse
// geocoding failures must not turn into a default city or a full street address.
export async function getDevicePlace({ signal, geolocation = globalThis.navigator?.geolocation, request = fetch } = {}) {
  if (!geolocation || signal?.aborted) return null;
  const coords = await readDeviceCoordinates(geolocation, signal);
  if (signal?.aborted || !usableFix(coords)) return null;
  const lat = Number(coords.latitude.toFixed(2));
  const lng = Number(coords.longitude.toFixed(2));
  const result = await readPlaces(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=10&accept-language=en`, signal, request);
  return deviceLocality(result?.address, lat, lng);
}

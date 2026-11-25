// Environmental data service — real-time data using free APIs (Open-Meteo + WAQI + Nominatim)

const rawWaqi = import.meta.env.VITE_WAQI_TOKEN || '';
const rawOwm = import.meta.env.VITE_OPENWEATHER_KEY || import.meta.env.VITE_OPENWEATHER_API_KEY || '';
const rawGmaps = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

function isConfiguredKey(val) {
  return Boolean(val && !val.startsWith('your_') && !val.includes('replace_with'));
}

const WAQI_TOKEN = isConfiguredKey(rawWaqi) ? rawWaqi : '';
const OWM_KEY = isConfiguredKey(rawOwm) ? rawOwm : '';
const GOOGLE_MAPS_KEY = isConfiguredKey(rawGmaps) ? rawGmaps : '';

export const DEFAULT_LOCATION = {
  lat: 19.0330,
  lng: 73.0297,
  city: 'Navi Mumbai',
  address: 'Navi Mumbai, Maharashtra, India',
};

const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const apiCache = new Map();

function getCached(key) {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    apiCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  if (value != null) apiCache.set(key, { value, ts: Date.now() });
  return value;
}

function toUtcIso(timeStr) {
  if (!timeStr) return new Date().toISOString();
  return timeStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(timeStr) ? timeStr : `${timeStr}Z`;
}

// Weather code -> human readable description (WMO codes used by Open-Meteo)
function wmoDescription(code) {
  if (code === 0) return 'Clear sky';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 9) return 'Foggy';
  if (code <= 19) return 'Drizzle';
  if (code <= 29) return 'Rainy';
  if (code <= 39) return 'Snowy';
  if (code <= 49) return 'Foggy';
  if (code <= 59) return 'Drizzle';
  if (code <= 69) return 'Rain';
  if (code <= 79) return 'Snow';
  if (code <= 84) return 'Rain showers';
  if (code <= 94) return 'Thunderstorm';
  return 'Haze / Smoky';
}

/**
 * Geocode any city/place name to { lat, lng, city } using Open-Meteo Geocoding API (free, no key)
 */
const CITY_ALIASES = {
  bangalore: 'Bengaluru',
  bombay: 'Mumbai',
  madras: 'Chennai',
  calcutta: 'Kolkata',
  poona: 'Pune',
  gurgaon: 'Gurugram',
  baroda: 'Vadodara',
  trivandrum: 'Thiruvananthapuram',
  cochin: 'Kochi',
  benares: 'Varanasi',
};

export async function geocodeCity(cityName) {
  if (!cityName || !cityName.trim()) return null;
  const raw = cityName.trim().toLowerCase();
  const normalized = CITY_ALIASES[raw] || cityName.trim();
  const cacheKey = `geo:${normalized.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(normalized)}&count=5&language=en&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      const results = (data.results || []).filter((item) => {
        const n = (item.name || '').toLowerCase().trim();
        const q = normalized.toLowerCase().trim();
        const firstWord = n.split(/[\s,]+/)[0];
        return n === q || firstWord === q;
      });
      if (results.length > 0) {
        const r = results.sort((a, b) => (b.population || 0) - (a.population || 0))[0];
        const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
        return setCached(cacheKey, {
          lat: r.latitude,
          lng: r.longitude,
          city: label || r.name,
          country: r.country || null,
          countryCode: r.country_code || null,
        });
      }
    }
  } catch (err) {
    console.warn('Open-Meteo geocoding failed:', err.message);
  }

  // Typo-tolerant fallback. Photon uses OpenStreetMap data and can resolve
  // common misspellings such as "sanfransico" → "San Francisco".
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(normalized)}&limit=5`;
    const photonRes = await fetch(photonUrl, { signal: AbortSignal.timeout(6000) });
    if (photonRes.ok) {
      const data = await photonRes.json();
      const hit = (data.features || []).find((feature) => {
        const p = feature?.properties || {};
        return ['city', 'town', 'village', 'municipality', 'locality'].includes(p.type) ||
          ['city', 'town', 'village', 'municipality'].includes(p.osm_value);
      });
      const coordinates = hit?.geometry?.coordinates;
      if (hit && Array.isArray(coordinates) && coordinates.length >= 2) {
        const p = hit.properties || {};
        const place = p.name || p.city || normalized;
        const label = [place, p.state, p.country].filter(Boolean).join(', ');
        return setCached(cacheKey, {
          lat: Number(coordinates[1]),
          lng: Number(coordinates[0]),
          city: label || place,
          country: p.country || null,
          countryCode: p.countrycode || null,
        });
      }
    }
  } catch (err) {
    console.warn('Photon geocoding failed:', err.message);
  }

  // Fallback to Nominatim for landmarks, reserves, and towns (e.g., Tadoba, Marina Beach)
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(normalized)}&format=json&limit=1&addressdetails=1`;
    const nomRes = await fetch(nomUrl, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'EcoPulseAI/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (nomRes.ok) {
        const list = await nomRes.json();
        const hit = list?.[0];
        if (hit) {
          const address = hit.address || {};
          const displayFirst = (hit.display_name || '').split(',')[0]?.trim();
          const place = address.city || address.town || address.village || address.municipality || displayFirst || normalized;
          const label = [place, address.state, address.country].filter(Boolean).join(', ') || normalized;
          return setCached(cacheKey, {
            lat: parseFloat(hit.lat),
            lng: parseFloat(hit.lon),
            city: label,
            country: address.country || null,
            countryCode: address.country_code || null,
          });
        }
    }
  } catch (err) {
    console.warn('Nominatim geocoding failed:', err.message);
  }

  return null;
}

/**
 * Get real-time AQI data: tries WAQI (if real token configured), then Open-Meteo Air Quality (free, any global location)
 * Returns null if both fail (never returns fabricated data)
 */
export async function getAirQuality(lat = 19.0330, lng = 73.0297, cityLabel = null) {
  const cacheKey = `aqi:${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
  const cached = getCached(cacheKey);
  if (cached) return cityLabel ? { ...cached, city: cityLabel, station: cityLabel } : cached;

  // 1. Try WAQI only if user configured a real WAQI token
  if (WAQI_TOKEN) {
    try {
      const url = `https://api.waqi.info/feed/geo:${lat};${lng}/?token=${WAQI_TOKEN}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = await res.json();
        if (json.status === 'ok' && json.data) {
          const d = json.data;
          const iaqi = d.iaqi || {};
          return setCached(cacheKey, {
            aqi: d.aqi ?? null,
            pm25: iaqi.pm25?.v ?? null,
            pm10: iaqi.pm10?.v ?? null,
            no2: iaqi.no2?.v ?? null,
            o3: iaqi.o3?.v ?? null,
            co: iaqi.co?.v ?? null,
            so2: iaqi.so2?.v ?? null,
            station: d.city?.name || cityLabel || null,
            city: cityLabel || d.city?.name || null,
            timestamp: d.time?.s || new Date().toISOString(),
            source: 'WAQI / CPCB',
          });
        }
      }
    } catch (err) {
      console.warn('WAQI fetch failed:', err.message);
    }
  }

  // 2. Open-Meteo Air Quality API — completely free, no key needed, works for any lat/lng worldwide
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&timezone=GMT`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = await res.json();
      const cur = json.current || {};
      if (cur.us_aqi != null) {
        return setCached(cacheKey, {
          aqi: Math.round(cur.us_aqi),
          pm25: cur.pm2_5 != null ? Math.round(cur.pm2_5 * 10) / 10 : null,
          pm10: cur.pm10 != null ? Math.round(cur.pm10 * 10) / 10 : null,
          no2: cur.nitrogen_dioxide != null ? Math.round(cur.nitrogen_dioxide * 10) / 10 : null,
          o3: cur.ozone != null ? Math.round(cur.ozone * 10) / 10 : null,
          co: cur.carbon_monoxide != null ? Math.round(cur.carbon_monoxide) : null,
          so2: cur.sulphur_dioxide != null ? Math.round(cur.sulphur_dioxide * 10) / 10 : null,
          station: cityLabel || `${lat.toFixed(2)}, ${lng.toFixed(2)}`,
          city: cityLabel || null,
          timestamp: toUtcIso(cur.time),
          source: 'Open-Meteo Air Quality',
        });
      }
    }
  } catch (err) {
    console.warn('Open-Meteo AQI fetch failed:', err.message);
  }

  return null;
}

/**
 * Get current weather — tries OpenWeatherMap (if real key configured), then Open-Meteo (free, no key needed)
 */
export async function getWeather(lat = 19.0330, lng = 73.0297) {
  const cacheKey = `weather:${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  if (OWM_KEY) {
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${OWM_KEY}&units=metric`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const d = await res.json();
        return setCached(cacheKey, {
          temp: Math.round(d.main?.temp ?? null),
          feelsLike: Math.round(d.main?.feels_like ?? null),
          humidity: d.main?.humidity ?? null,
          windSpeed: d.wind?.speed ?? null,
          description: d.weather?.[0]?.description || 'Unknown',
          icon: d.weather?.[0]?.icon || null,
          timestamp: new Date().toISOString(),
          source: 'OpenWeatherMap',
        });
      }
    } catch (err) {
      console.warn('OpenWeatherMap failed:', err.message);
    }
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&wind_speed_unit=ms&timezone=GMT`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const d = await res.json();
      const cur = d.current || {};
      return setCached(cacheKey, {
        temp: Math.round(cur.temperature_2m ?? null),
        feelsLike: Math.round(cur.apparent_temperature ?? null),
        humidity: cur.relative_humidity_2m ?? null,
        windSpeed: cur.wind_speed_10m ?? null,
        description: wmoDescription(cur.weather_code ?? 99),
        icon: null,
        timestamp: toUtcIso(cur.time),
        source: 'Open-Meteo',
      });
    }
  } catch (err) {
    console.warn('Open-Meteo failed:', err.message);
  }

  return null;
}

/**
 * Reverse geocode using Google Maps Geocoding API if key provided, else Nominatim
 */
export async function getUserCity(lat, lng) {
  if (!lat || !lng) return DEFAULT_LOCATION.city;

  if (GOOGLE_MAPS_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.results?.length > 0) {
          const comp = data.results[0].address_components;
          const locality = comp.find(c => c.types.includes('locality'))?.long_name;
          const sublocality = comp.find(c => c.types.includes('sublocality'))?.long_name;
          return locality || sublocality || data.results[0].formatted_address;
        }
      }
    } catch (e) {
      console.warn('Google Maps geocoding error:', e);
    }
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'EcoPulseAI/1.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const d = await res.json();
      const addr = d.address || {};
      const cityName = addr.city || addr.town || addr.suburb || addr.village || addr.county;
      if (cityName) return `${cityName}, ${addr.country || 'India'}`;
    }
  } catch (err) {
    console.warn('Nominatim geocode failed:', err.message);
  }

  return DEFAULT_LOCATION.city;
}

/**
 * Get user's GPS location via browser
 */
export function getLocationFromBrowser() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported, using default');
      resolve(DEFAULT_LOCATION);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => {
        console.warn('Location permission denied or timed out:', err.message);
        resolve(DEFAULT_LOCATION);
      },
      { timeout: 5000, maximumAge: 300000, enableHighAccuracy: false }
    );
  });
}

export function getGoogleMapsUrl(lat, lng, query = '') {
  if (lat && lng) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  if (query) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return 'https://maps.google.com';
}

export function getGoogleMapStaticImage(lat, lng, zoom = 14, width = 360, height = 180) {
  if (GOOGLE_MAPS_KEY && lat && lng) {
    return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${GOOGLE_MAPS_KEY}`;
  }
  return `https://static-maps.yandex.ru/1.x/?ll=${lng},${lat}&z=${zoom}&l=map&size=360,180&pt=${lng},${lat},pm2rdm`;
}

export function getAQICategory(aqi) {
  if (aqi == null) return { label: 'Unknown', color: '#94a3b8', bg: '#f1f5f9' };
  if (aqi <= 50)  return { label: 'Good', color: '#16a34a', bg: '#dcfce7' };
  if (aqi <= 100) return { label: 'Moderate', color: '#ca8a04', bg: '#fef9c3' };
  if (aqi <= 150) return { label: 'Unhealthy for Sensitive Groups', color: '#ea580c', bg: '#ffedd5' };
  if (aqi <= 200) return { label: 'Unhealthy', color: '#e11d48', bg: '#ffe4e6' };
  if (aqi <= 300) return { label: 'Very Unhealthy', color: '#9333ea', bg: '#f3e8ff' };
  return { label: 'Hazardous', color: '#881337', bg: '#ffe4e6' };
}

export function getAQIInsight(aqiData) {
  if (!aqiData?.aqi) return null;
  const { aqi } = aqiData;
  if (aqi > 300) return 'Air quality is hazardous. Stay indoors where possible and follow local health advisories.';
  if (aqi > 200) return 'Air quality is very unhealthy. Avoid outdoor exertion and wear a well-fitted N95 if you must go out.';
  if (aqi > 150) return 'Air quality is unhealthy. Reduce outdoor activity and wear a well-fitted N95 if you must go out.';
  if (aqi > 100) return 'Air quality is unhealthy for sensitive groups. Children, older adults, and people with heart or lung conditions should limit prolonged outdoor exposure.';
  if (aqi > 50)  return 'Air quality is moderate. Unusually sensitive people may want to reduce prolonged outdoor exertion.';
  return 'Air quality is clean and fresh. Perfect for outdoor activities!';
}

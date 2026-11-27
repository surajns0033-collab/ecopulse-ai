export { getAirQuality, isRecentAirQuality, getCurrentAirQuality, getAirQualityForecast } from './airQuality.js';
export { getWeather } from './weatherData.js';

export function getGoogleMapsUrl(lat, lng, query = '') {
  if (Number.isFinite(lat) && Number.isFinite(lng)) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  if (query) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return 'https://maps.google.com';
}

export function getAQICategory(aqi) {
  if (!Number.isFinite(aqi) || aqi < 0) return { label: 'Unknown', color: '#475569', bg: '#f1f5f9' };
  if (aqi <= 50)  return { label: 'Good', color: '#166534', bg: '#dcfce7' };
  if (aqi <= 100) return { label: 'Moderate', color: '#854d0e', bg: '#fef9c3' };
  if (aqi <= 150) return { label: 'Unhealthy for Sensitive Groups', color: '#9a3412', bg: '#ffedd5' };
  if (aqi <= 200) return { label: 'Unhealthy', color: '#9f1239', bg: '#ffe4e6' };
  if (aqi <= 300) return { label: 'Very Unhealthy', color: '#6b21a8', bg: '#f3e8ff' };
  return { label: 'Hazardous', color: '#881337', bg: '#ffe4e6' };
}

export function getAQIInsight(aqiData) {
  if (!Number.isFinite(aqiData?.aqi)) return null;
  const { aqi } = aqiData;
  if (aqi > 300) return 'Air quality is hazardous. Stay indoors where possible and follow local health advisories.';
  if (aqi > 200) return 'Air quality is very unhealthy. Avoid outdoor exertion and wear a well-fitted N95 if you must go out.';
  if (aqi > 150) return 'Air quality is unhealthy. Reduce outdoor activity and wear a well-fitted N95 if you must go out.';
  if (aqi > 100) return 'Air quality is unhealthy for sensitive groups. Children, older adults, and people with heart or lung conditions should limit prolonged outdoor exposure.';
  if (aqi > 50)  return 'Air quality is moderate. Unusually sensitive people may want to reduce prolonged outdoor exertion.';
  return 'The reported AQI is in the Good range. Keep following any local advisories.';
}

export async function mockDelhi(context) {
  const counts = { aqi: 0, weather: 0, forecast: 0 };
  const data = { ageHours: 0 };
  await context.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({ json: { results: [{
    name: 'Delhi', admin1: 'Delhi', country: 'India', country_code: 'IN', feature_code: 'PPLC',
    population: 1000000, latitude: 28.6, longitude: 77.2,
  }] } }));
  await context.route('https://air-quality-api.open-meteo.com/**', route => {
    const url = new URL(route.request().url());
    const now = Date.now();
    if (url.searchParams.has('hourly')) {
      counts.forecast++;
      const nextDaylight = new Date(now);
      nextDaylight.setUTCHours(5, 0, 0, 0);
      if (nextDaylight.getTime() <= now) nextDaylight.setUTCDate(nextDaylight.getUTCDate() + 1);
      return route.fulfill({ json: { timezone: 'Asia/Kolkata', current: { time: Math.floor(now / 1000) },
        hourly: { time: [nextDaylight.getTime() / 1000], us_aqi: [119] } } });
    }
    counts.aqi++;
    return route.fulfill({ json: { current: { us_aqi: 208, pm2_5: 73, pm10: 110, nitrogen_dioxide: 24, ozone: 18,
      time: new Date(now - data.ageHours * 3600000).toISOString() } } });
  });
  await context.route('https://api.open-meteo.com/**', route => {
    counts.weather++;
    return route.fulfill({ json: { current: { temperature_2m: 18, wind_speed_10m: 4, weather_code: 0, time: new Date().toISOString() } } });
  });
  return { counts, data };
}

export async function ask(page, text) {
  const input = page.getByRole('textbox', { name: 'Message input' });
  await input.fill(text);
  await input.press('Enter');
}

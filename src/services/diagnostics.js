// Diagnostic records contain only an operation from this list and an HTTP status.
const operations = new Set(['ui.render', 'chat.request', 'chat.provider', 'auth.redirect',
  'community.load', 'community.send', 'community.delete', 'community.subscribe',
  'chat.turn', 'vision.ocr', 'vision.classify', 'air.waqi', 'air.current', 'air.forecast',
  'weather.openweather', 'weather.openmeteo', 'storage.fallback']);

export function logFailure(operation, status) {
  if (!operations.has(operation)) return;
  const event = { application: 'ecopulse', operation };
  if (Number.isInteger(status) && status >= 400 && status <= 599) event.status = status;
  console.error(JSON.stringify(event));
}

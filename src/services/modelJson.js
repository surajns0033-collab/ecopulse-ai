/** @param {unknown} value @returns {value is Record<string, unknown>} */
export function isModelObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} text @returns {Record<string, unknown> | null} */
export function parseModelObject(text) {
  if (typeof text !== 'string') return null;
  const raw = text.trim().replace(/^`{3}(?:json)?/i, '').replace(/`{3}$/, '').trim();
  const braced = raw.match(/\{[\s\S]*\}/)?.[0];
  for (const candidate of new Set([raw, braced].filter(Boolean))) {
    if (typeof candidate !== 'string') continue;
    try {
      const value = JSON.parse(candidate);
      if (isModelObject(value)) return value;
      // A complete JSON array or primitive is outside the expected contract.
      return null;
    } catch { /* Try an object surrounded by ordinary prose. */ }
  }
  return null;
}

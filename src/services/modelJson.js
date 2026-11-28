export function parseModelObject(text) {
  if (typeof text !== 'string') return null;
  const raw = text.trim().replace(/^`{3}(?:json)?/i, '').replace(/`{3}$/, '').trim();
  const braced = raw.match(/\{[\s\S]*\}/)?.[0];
  for (const candidate of new Set([raw, braced].filter(Boolean))) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
      // A complete JSON array or primitive is outside the expected contract.
      return null;
    } catch { /* Try an object surrounded by ordinary prose. */ }
  }
  return null;
}

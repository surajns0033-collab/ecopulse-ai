import { parseSmogProfile } from '../src/agent/smogProfile.js';

export const now = Date.parse('2026-11-27T05:00:00Z');
export const city = 'Navi Mumbai';
export const profile = parseSmogProfile('Car commute, outdoor work, gas stove, HEPA purifier, one child.');
export const modeled = { aqi: 171, timestamp: '2026-11-27T04:30:00Z', source: 'Open-Meteo Air Quality', sourceType: 'modeled' };

import { isModelObject } from './modelJson.js';
import { REPORT_CATEGORIES } from '../firebase/collections.js';

const categories = new Set(REPORT_CATEGORIES.map(item => item.id));
const severities = new Set(['mild', 'moderate', 'severe']);

/** @param {unknown} value @param {number} limit */
function text(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

/** @param {unknown} value @param {number} limit */
function lines(value, limit) {
  return Array.isArray(value) ? value.map(item => text(item, 180)).filter(Boolean).slice(0, limit) : [];
}

/** Decode the provider's untrusted description before it reaches a report or draft.
 * @param {unknown} value */
export function photoAssessment(value) {
  if (!isModelObject(value) || !text(value.description, 600)) return null;
  const category = text(value.category, 25).toLowerCase();
  const severity = text(value.severity, 20).toLowerCase();
  const confidence = value.confidence;
  const visibleText = lines(value.visibleText, 5);
  if (!categories.has(category) || !severities.has(severity) ||
      typeof confidence !== 'number' || !(confidence >= 0.6 && confidence <= 1)) {
    return { uncertain: true, visibleText };
  }
  return {
    uncertain: false, needsUserVerification: true, category, severity,
    issue: text(value.issue, 120) || 'Possible environmental issue',
    description: text(value.description, 600), actions: lines(value.actions, 3), visibleText,
  };
}

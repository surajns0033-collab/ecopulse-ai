import { requestAI } from './aiClient.js';
import { buildSystem, toHistory } from './geminiPrompt.js';

export const AI_UNAVAILABLE_TEXT =
  "I'm having trouble reaching the AI service right now. I can still help with live air quality, weather, verified complaint contacts and filing a report — what's happening?";

export function isAIUnavailable(text) {
  if (!text) return true;
  return text === AI_UNAVAILABLE_TEXT || text.includes('trouble connecting to the AI') || text.includes("trouble reaching the AI");
}


export async function getChatResponse(messages, systemContext = '', options = {}) {
  const useSearch = options.useSearch ?? false;
  // Search gets only the current question, not private conversation context.
  if (useSearch && messages?.at(-1)?.role !== 'user') return AI_UNAVAILABLE_TEXT;
  const history = toHistory(useSearch ? messages?.slice(-1) : messages);
  if (!history.length) return AI_UNAVAILABLE_TEXT;
  // Gemini expects the history to end with the user's turn.
  if (history[history.length - 1].role !== 'user') {
    history.push({ role: 'user', text: 'Please continue.' });
  }

  const result = await requestAI({
    system: buildSystem(useSearch ? '' : systemContext),
    messages: history,
    temperature: options.temperature ?? 0.7,
    maxTokens: options.maxTokens ?? 700,
    timeoutMs: options.timeoutMs ?? 30000,
    useSearch,
    signal: options.signal,
  });

  if (!result?.text || (useSearch && !result.sources?.length)) return AI_UNAVAILABLE_TEXT;
  const text = result.text.trim();
  if (!result.sources?.length) return text;
  const sources = result.sources
    .map((source) => `• ${source.title}: ${source.url}`)
    .join('\n');
  return `${text}\n\n**Sources**\n${sources}`;
}

/**
 * Ask for a strict JSON object. Returns null when unavailable or unparseable,
 * so callers can fall back to their deterministic path.
 */
export async function getJsonResponse(prompt, systemContext = '', options = {}) {
  const result = await requestAI({
    system: buildSystem(systemContext),
    messages: [{ role: 'user', text: `${prompt}\n\nRespond with ONLY a single valid JSON object, no markdown fences, no explanation.` }],
    temperature: options.temperature ?? 0.2,
    maxTokens: options.maxTokens ?? 800,
    timeoutMs: options.timeoutMs ?? 25000,
  });
  if (!result?.text) return null;

  const raw = result.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const candidates = [raw];
  const braced = raw.match(/\{[\s\S]*\}/);
  if (braced) candidates.push(braced[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Analyze an environmental photo with vision.
 * Returns null when unavailable — callers must ask the user to describe it.
 */
export async function analyzeEnvironmentalImage(base64, mimeType, contextHint = '') {
  const result = await requestAI({
    system: `You are an environmental inspection assistant. Describe ONLY what is visible in the photo. Do not identify the location, suggest a specific agency, give contact details, or make legal conclusions from the photo. If something is unclear, lower the confidence instead of guessing. ${contextHint ? `Unverified user note: ${contextHint}` : ''}`,
    messages: [{
      role: 'user',
      text: 'Analyze this photo for an environmental or civic complaint. Return JSON with keys: issue (short label), severity (mild|moderate|severe), category (garbage|plastic|burning|air|construction|water|sewage|trees|greenspace|industrial|road_obstruction|other), description (2 factual sentences safe for an official complaint), actions (array of up to 3 immediate practical steps), confidence (0-1), visibleText (array containing ONLY clearly legible text copied exactly from signs/boards/vehicles; otherwise []).',
    }],
    images: [{ base64, mimeType }],
    temperature: 0.2,
    maxTokens: 600,
    timeoutMs: 40000,
  });

  if (!result?.text) return null;

  const raw = result.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const braced = raw.match(/\{[\s\S]*\}/);
  const candidates = [raw, braced?.[0]].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || typeof parsed !== 'object') continue;

      const allowedCategories = ['garbage', 'plastic', 'burning', 'air', 'construction', 'water', 'sewage', 'trees', 'greenspace', 'industrial', 'road_obstruction', 'other'];
      const category = allowedCategories.includes(String(parsed.category).toLowerCase())
        ? String(parsed.category).toLowerCase()
        : 'other';
      const severity = ['mild', 'moderate', 'severe'].includes(String(parsed.severity).toLowerCase())
        ? String(parsed.severity).toLowerCase()
        : 'moderate';

      return {
        issue: String(parsed.issue || 'Environmental issue').slice(0, 120),
        severity,
        category,
        description: String(parsed.description || '').slice(0, 600),
        actions: Array.isArray(parsed.actions) ? parsed.actions.filter(Boolean).slice(0, 3).map(String) : [],
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.6)),
        visibleText: Array.isArray(parsed.visibleText)
          ? parsed.visibleText.filter(Boolean).slice(0, 5).map((line) => String(line).slice(0, 100))
          : [],
      };
    } catch { /* try next candidate */ }
  }
  return null;
}

// Gemini / AI service — thin layer on top of aiClient.
//
// Every call returns real model output or a clearly-marked unavailable
// sentinel. It never fabricates data; callers are expected to answer from
// live APIs and verified contacts when the sentinel comes back.

import { requestAI } from './aiClient';

/** Returned when no AI provider could be reached. */
export const AI_UNAVAILABLE_TEXT =
  "I'm having trouble reaching the AI service right now. I can still help with live air quality, weather, verified complaint contacts and filing a report — what's happening?";

export function isAIUnavailable(text) {
  if (!text) return true;
  return text === AI_UNAVAILABLE_TEXT || text.includes('trouble connecting to the AI') || text.includes("trouble reaching the AI");
}

const SYSTEM_PROMPT = `You are EcoPulse AI, a warm, capable general-purpose daily companion for people in India and anywhere else. You have special expertise in environmental and civic help, but you must also answer ordinary questions naturally.

Your default role is an open-ended conversational assistant: everyday questions, explanations, writing, planning, study, technology, decisions, brainstorming and supportive conversation.

Special tools are available when relevant: live AQI/weather, maps, grounded web search, photo understanding, environmental complaints, authorities, email drafts, eco-events and sustainability guidance. Treat these as silent tools—not topics to advertise.

How you write:
- Be a real companion: understand what the person actually asked and answer that—not a canned feature list.
- Do NOT force unrelated questions into environmental topics, complaints, AQI, or the user's current city.
- NEVER append a capability list or mention tools, AQI, civic services, authorities, or complaints unless they are relevant to the user's request or the user explicitly asks what you can do.
- If the user only says they need help, warmly ask what they need help with in one short sentence. Do not assume the topic.
- For casual small talk (for example "what's up", "how are you", or "what's going on"), respond naturally in 1–2 short sentences. Do not list capabilities or advertise features unless the user asks what you can do.
- Short by default: 2–4 sentences, or up to 4 tight bullets. Go long only when the user asks for a draft, a step-by-step plan, or details.
- Match the user's language automatically (English, Hindi, Hinglish, Marathi). Keep the same script they use.
  Default to English. Only switch when the user's message is clearly in Hindi/Hinglish/Marathi (a bare "hi"/"hello" is English → reply in English).
- For a greeting, reply naturally in 1–2 sentences and ask how the person is doing or what they would like to talk about.
- Use **bold** for the important line (helpline, portal, next action) and short bullets for steps.
- Never pad with generic filler or repeat the question back.

Hard rules:
- NEVER invent AQI numbers, weather, event details, emails, phone numbers, URLs, or complaint statuses.
- For general factual questions, be accurate and clearly say when you are uncertain. For current/latest facts, use grounded sources or say live verification is unavailable.
- Only give an email/phone/portal that appears in "Current context". 112 is the national emergency number; 1926 is state-specific and must NEVER be called a national helpline. If you are not sure, say so and point to the official portal.
- NEVER use a made-up @gmail.com address for a government body.
- If the user is reporting something happening right now (burning, dumping, sewage overflow), lead with the immediate action: call the local helpline/flying squad now, then the written complaint.
- If a needed detail is missing (area, when, what exactly), ask 1–2 focused questions instead of assuming.
- Health advice is general guidance, not a diagnosis — suggest a doctor for medical decisions.
- If the user attaches a photo, describe only what is actually visible and say when you are unsure.`;

function buildSystem(systemContext) {
  if (!systemContext) return SYSTEM_PROMPT;
  return `${SYSTEM_PROMPT}\n\nCurrent context (authoritative — prefer this over your own memory):\n${systemContext}`;
}

function toHistory(messages, maxTurns = 14) {
  return (messages || [])
    .filter((m) => (m.text || '').trim())
    .slice(-maxTurns)
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      text: m.text,
    }));
}

/**
 * Chat completion with conversation history.
 * Returns AI_UNAVAILABLE_TEXT when every provider fails.
 */
export async function getChatResponse(messages, systemContext = '', options = {}) {
  const history = toHistory(messages);
  if (!history.length) return AI_UNAVAILABLE_TEXT;
  // Gemini expects the history to end with the user's turn.
  if (history[history.length - 1].role !== 'user') {
    history.push({ role: 'user', text: 'Please continue.' });
  }

  const result = await requestAI({
    system: buildSystem(systemContext),
    messages: history,
    temperature: options.temperature ?? 0.7,
    maxTokens: options.maxTokens ?? 700,
    timeoutMs: options.timeoutMs ?? 30000,
    useSearch: options.useSearch ?? false,
  });

  if (!result?.text) return AI_UNAVAILABLE_TEXT;
  const text = result.text.trim();
  if (!result.sources?.length) return text;
  const sources = result.sources
    .map((source) => `• ${source.title}: ${source.url}`)
    .join('\n');
  return `${text}\n\n**Sources**\n${sources}`;
}

/** Low-latency response path for voice conversations. */
export async function getVoiceResponse(messages, options = {}) {
  const history = toHistory(messages, 8);
  if (!history.length) return AI_UNAVAILABLE_TEXT;
  const result = await requestAI({
    system: 'You are EcoPulse AI in a voice conversation. Reply naturally in the user\'s language in one or two short spoken sentences. Never use headings, bullets, markdown, URLs, feature lists, or canned advertising. Ask one brief follow-up when useful. Do not invent current facts.',
    messages: history,
    temperature: options.temperature ?? 0.55,
    maxTokens: options.maxTokens ?? 500,
    timeoutMs: options.timeoutMs ?? 18000,
    model: options.model ?? 'gemini-3.1-flash-lite',
  });
  return result?.text?.trim() || AI_UNAVAILABLE_TEXT;
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
    system: `You are an environmental inspection assistant. Describe ONLY what is visible in the photo. If something is unclear, lower the confidence instead of guessing. ${contextHint ? `User note: ${contextHint}` : ''}`,
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

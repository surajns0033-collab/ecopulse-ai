import { getCurrentAirQuality, getWeather } from '../services/environmentalData.js';
import { getChatResponse, isAIUnavailable } from '../services/geminiService';
import { findVerifiedRecipient } from '../services/verifiedRecipient.js';
import { detectIssueCategory } from './civicIssues.js';
import { buildFallbackReply } from './fallbackBrain.js';
import { resolveCity } from './placeContext.js';
import { logAction } from './activityLog';
import { citySnapshot } from './citySnapshot.js';
import { concernsComplaint, replyContext, wantsWeb } from './replyContext.js';

async function localSnapshot(city, lat, lng, userId, signal) {
  const [liveAqi, liveWeather] = Number.isFinite(lat) && Number.isFinite(lng)
    ? await Promise.all([getCurrentAirQuality(lat, lng, city, { signal }), getWeather(lat, lng, { signal })])
    : [null, null];
  return citySnapshot({ city, lat, lng, liveAqi, liveWeather, userId });
}

function requestHistory(history, message, searchLocation) {
  const messages = history.map(({ role, text }) => ({ role, text: text || '' }));
  messages.push({ role: 'user', text: searchLocation ? message + '\nSearch this area: ' + searchLocation.city : message });
  return messages;
}

export async function handleGeneralQuestion(message, history, location, userId, options = {}) {
  const city = resolveCity(location?.city);
  if (options.snapshot && city) return localSnapshot(city, location.lat, location.lng, userId, options.signal);

  const useSearch = Boolean(options.web || wantsWeb(message));
  const complaint = concernsComplaint(message);
  let recipient = null;
  if (city && complaint && !useSearch) {
    const recent = history.slice(-4).map(item => item.text || '').join(' ');
    recipient = await findVerifiedRecipient({ issueCategory: detectIssueCategory(message + ' ' + recent), city });
  }
  const reply = await getChatResponse(requestHistory(history, message, options.webLocation),
    replyContext(city, message, recipient), { useSearch, signal: options.signal });
  if (!isAIUnavailable(reply)) return { text: reply, cards: [], actions: [], status: 'success' };
  if (useSearch) return {
    text: "I couldn't get a sourced web answer right now. Try again or check the relevant official website.",
    cards: [], actions: [], status: 'unavailable',
  };
  logAction(userId, 'general_chat_fallback', {});
  return buildFallbackReply({ message, location: { ...location, city }, recipient, isComplaintContext: complaint });
}

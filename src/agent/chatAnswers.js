import { getCurrentAirQuality, getWeather, getAQIInsight, getAQICategory } from '../services/environmentalData.js';
import { getAuthorityBundle, isIndianPlace } from '../services/authorityDirectory.js';
import { getChatResponse, isAIUnavailable } from '../services/geminiService';
import { tools } from '../services/agentTools';
import { detectIssueCategory } from './civicIssues.js';
import { buildFallbackReply } from './fallbackBrain.js';
import { resolveCity } from './placeContext.js';
import { logAction } from './activityLog';

export async function handleGeneralQuestion(userMessage, conversationHistory, location, userId, { snapshot = false, web = false, webLocation, signal } = {}) {
  const city = resolveCity(location?.city);
  const lat = location?.lat;
  const lng = location?.lng;
  const lower = (userMessage || '').toLowerCase();
  const isOpenEndedHelp = /^(?:i\s*need|ineed|need|can you|could you|please|pls)?.{0,18}\bhelp(?:\s+me)?[.!?]*$/i.test(lower.trim());
  const isCasualSmallTalk = /^(?:what'?s?\s+(?:going(?:\s+on)?|up|new)|whatsgoing|how(?:'s| is|s)\s+it\s+going|how\s+are\s+you|sup|wassup|wyd)[.!?]*$/i.test(lower.trim());
  const isPersonalConversation = /\b(not (?:good|okay|ok|well)|bad day|feeling (?:sad|low|down|stressed|anxious|lonely|tired)|i(?:'m| am) (?:sad|upset|stressed|anxious|lonely|tired)|need to talk)\b/i.test(lower);

  const needsWebSearch = web || /\b(search (?:the )?web|google (?:this|it|for)|look (?:this )?up|latest|recent news|today['’]?s news|current (?:rule|rules|law|laws|policy|policies|deadline|official update)|what happened today)\b/i.test(lower);
  const complaintContext = /\b(complain|complaint|grievance|authority contacts?|helpline|midc|mpcb|nmmc|bmc|mcd|bbmp|shikayat)\b/i.test(userMessage);

  let liveAqi = null;
  let liveWeather = null;
  if (snapshot && Number.isFinite(lat) && Number.isFinite(lng)) {
    [liveAqi, liveWeather] = await Promise.all([
      getCurrentAirQuality(lat, lng, city, { signal }),
      getWeather(lat, lng, { signal }),
    ]);
  }

  // A bare city name requests a snapshot; it does not set the user's local city.
  if (snapshot && city) {
    const outsideIndia = !isIndianPlace(city);
    const lines = [`📍 **${city} — live environmental snapshot**`];

    if (liveAqi) {
      const category = getAQICategory(liveAqi.aqi);
      lines.push(`🌬️ **AQI ${liveAqi.aqi} — ${category.label}** (PM2.5: ${liveAqi.pm25 ?? '—'} µg/m³, PM10: ${liveAqi.pm10 ?? '—'} µg/m³)`);
    } else {
      lines.push('🌬️ Live air-quality data is temporarily unavailable.');
    }

    if (liveWeather) {
      lines.push(`🌤️ **${liveWeather.temp}°C**, ${liveWeather.description} ([${liveWeather.source}](${liveWeather.sourceUrl}))`);
    } else {
      lines.push('🌤️ Live weather data is temporarily unavailable.');
    }

    if (liveAqi) lines.push(`\n${getAQIInsight(liveAqi)}`);
    lines.push(outsideIndia
      ? '\nI can help with the map, live environmental data, photo understanding, and complaint wording. I will not invent local authority contacts for a country that is not in the verified directory.'
      : '\nI can also show verified **local, state and national complaint contacts**, draft an email, or help report a problem from a photo.');

    logAction(userId, 'city_snapshot', { city, hasAqi: Boolean(liveAqi), hasWeather: Boolean(liveWeather) });
    return {
      text: lines.join('\n'),
      cards: [
        ...(liveAqi ? [{ type: 'aqi', data: { ...liveAqi, insight: getAQIInsight(liveAqi) } }] : []),
        { type: 'map', data: { lat, lng, city, label: city, query: city } },
      ],
      actions: [
        ...(outsideIndia
          ? [{ label: '📣 Complaint Guidance', action: 'START_COMPLAINT', variant: 'primary' }]
          : [{ label: '📇 Authority Contacts', action: 'QUICK_ALL_CONTACTS', variant: 'primary' }]),
        { label: '💊 Health Tips', action: 'QUICK_HEALTH_TIPS', variant: 'secondary' },
      ],
      status: 'success',
    };
  }

  let context = city
    ? `Most recently discussed city: ${city}. This is not evidence of the user's physical whereabouts. Use it only when the request clearly refers to that city.`
    : 'No city confirmed. If a city is needed, ask which city to use.';

  if (isOpenEndedHelp) {
    context += '\nInstruction: The user has only said they need help. Reply with one warm, open-ended sentence asking what they need help with. Do not list capabilities, examples, location, or environmental features.';
  }
  if (isCasualSmallTalk) {
    context += '\nInstruction: This is casual small talk. Reply naturally like a friendly conversational partner in no more than two short sentences. Do not list capabilities, mention location, AQI, weather, complaints, or advertise features.';
  }
  if (isPersonalConversation) {
    context += '\nInstruction: This is a personal or emotional conversation. Respond empathetically to what the user actually said and invite them to share more when appropriate. Do not advertise tools, list capabilities, mention location, environment, AQI, authorities, or complaints. Do not diagnose.';
  }

  // Verified contacts, only when the conversation is about complaining/reporting.
  let recipient = null;
  const recentCombined = `${userMessage} ${(conversationHistory || []).slice(-4).map((m) => m.text || '').join(' ')}`;
  const recipientNeeded = complaintContext && !needsWebSearch && Boolean(city);
  if (recipientNeeded) {
    recipient = await tools.findVerifiedRecipient({ issueCategory: detectIssueCategory(recentCombined), city });
    context += !recipient.localUnavailable && recipient.jurisdiction === 'india'
      ? `\nVerified local authority for ${city}: ${recipient.organization}, Email: ${recipient.email}, Portal: ${recipient.portalUrl}, Helpline: ${recipient.helpline || 'N/A'}.`
      : `\nNo verified local contact for ${city}.${recipient.portalUrl ? ` National portal: ${recipient.portalUrl}.` : ''}`;
    if (recipient.forestEmail) {
      context += `\nVerified Forest / Tree Cell contact: Email: ${recipient.forestEmail}${recipient.forestHelpline ? `, Forest Helpline: ${recipient.forestHelpline}` : ''}.`;
    }
    if (recipient.whatsapp) {
      context += `\nOfficial WhatsApp Grievance Helpline: ${recipient.whatsapp}.`;
    }

    // National + state levels, so contact questions are answered from verified data.
    const bundle = getAuthorityBundle(city);
    if (bundle.state) {
      context += `\nVerified state authority: ${bundle.state.name} | Emails: ${(bundle.state.emails || []).join(', ') || 'not published — use portal form'} | Phones: ${(bundle.state.phones || []).join(', ') || 'not published'} | Portal: ${bundle.state.portal}.`;
    }
    context += `\nVerified national authorities: ${bundle.national
      .map((a) => `${a.name} (${[a.emails?.join(' / '), a.phones?.join(' / '), a.portal].filter(Boolean).join(' | ')})`)
      .join('; ')}.`;
    context += '\nInstruction: quote only these contacts. If a level is missing, say so and point to the official portal — never invent an email or phone number.';
  }

  if (needsWebSearch) {
    context += '\nInstruction: Support the answer with the returned web sources. Do not answer from memory if search is unavailable.';
  }

  const chatHistory = conversationHistory.map((m) => ({
    role: m.role,
    text: m.text || '',
  }));
  chatHistory.push({ role: 'user', text: webLocation ? `${userMessage}\nSearch this area: ${webLocation.city}` : userMessage });

  const responseText = await getChatResponse(chatHistory, context, { useSearch: needsWebSearch, signal });

  // Model unreachable → answer from verified data instead of a generic error.
  if (isAIUnavailable(responseText)) {
    if (needsWebSearch) {
      return {
        text: "I couldn't get a sourced web answer right now, so I won't guess. Try again or check the relevant official website.",
        cards: [],
        actions: [],
        status: 'unavailable',
      };
    }
    logAction(userId, 'general_chat_fallback', {});
    return buildFallbackReply({
      message: userMessage,
      location: { city, lat, lng },
      recipient,
      aqi: liveAqi,
      weather: liveWeather,
      isComplaintContext: complaintContext,
    });
  }

  return {
    text: responseText,
    cards: [],
    actions: [],
    status: 'success',
  };
}

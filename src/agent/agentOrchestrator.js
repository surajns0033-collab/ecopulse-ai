import { logFailure } from '../services/diagnostics.js';
import { detectIntent, INTENTS } from './intentEngine.js';
import { getSmogPlan, startSmogPlan } from './smogPlan.js';
import { AWAITING_CHAT_PLACE, AWAITING_DRAFT_DETAILS, incidentCity, isDraftDetailFragment, resolveChatPlace } from './chatPlaces.js';
import { asksForForecast, resolveCity } from './placeContext.js';
import { lookupPlace } from '../services/placeLookup.js';
import { describesIssue } from './civicIssues.js';
import { handleCreateReport, handleCreateEmail, handleAuthorityContacts } from './civicReports';
import {
  explainSmogChoices, handleAirQuality, handleDailyPlan, handleHealthTips, handleRoutes, handleWasteTips, handleWaterQuality, handleWeather,
} from './environmentReplies';
import {
  handleCommunityFeed, handleCreateEventPrompt, handleFindEvents, handleJoinEventPrompt, handleUserImpact,
} from './communityReplies';
import { handleGeneralQuestion } from './chatAnswers';
import { logAction } from './activityLog';

// Each intent owns one reply. Place resolution and pending conversation state
// are handled once, before and after dispatch.
const replies = {
  [INTENTS.GET_AIR_QUALITY]: ({ lat, lng, city, userId, message, signal }) =>
    handleAirQuality(lat, lng, city, userId, { signal, forecast: asksForForecast(message) }),
  [INTENTS.GET_WEATHER]: ({ lat, lng, city, userId, message, signal }) =>
    handleWeather(lat, lng, city, userId, { signal, forecast: asksForForecast(message) }),
  [INTENTS.GET_WATER_QUALITY]: ({ city }) => handleWaterQuality(city),
  [INTENTS.FIND_EVENTS]: ({ city, category, userId }) => handleFindEvents(city, category, userId),
  [INTENTS.JOIN_EVENT]: () => handleJoinEventPrompt(),
  [INTENTS.CREATE_EVENT]: ({ message, city, lat, lng }) => handleCreateEventPrompt(message, city, lat, lng),
  [INTENTS.CREATE_REPORT]: ({ message, userId, city, lat, lng }) => handleCreateReport(message, userId, { lat, lng, city }),
  [INTENTS.CREATE_EMAIL]: ({ message, history, city, turn }) => handleCreateEmail(message, history, city, turn),
  [INTENTS.GET_AUTHORITY_CONTACTS]: ({ message, city }) => handleAuthorityContacts(message, { city }),
  [INTENTS.GET_COMMUNITY]: () => handleCommunityFeed(),
  [INTENTS.GET_DAILY_PLAN]: ({ lat, lng }) => handleDailyPlan(lat, lng),
  [INTENTS.GET_HEALTH_TIPS]: ({ lat, lng, city, signal }) => handleHealthTips(lat, lng, city, signal),
  [INTENTS.GET_ROUTES]: ({ city, lat, lng }) => handleRoutes(city, lat, lng),
  [INTENTS.GET_USER_IMPACT]: ({ userId }) => handleUserImpact(userId),
  [INTENTS.GET_WASTE_TIPS]: ({ city, lat, lng }) => handleWasteTips(city, lat, lng),
  [INTENTS.GET_SMOG_PLAN]: ({ turn, city, lat, lng, signal }) => turn?.smogDetails
    ? getSmogPlan(turn.smogDetails, { city, lat, lng }, signal) : startSmogPlan(city),
};

function generalReply({ message, history, city, lat, lng, userId, turn, signal }) {
  return handleGeneralQuestion(message, history, { lat, lng, city }, userId, {
    snapshot: turn?.snapshot, web: turn?.kind === 'web', webLocation: turn?.location, signal,
  });
}

function placeChanges(context, location, chosenLocation) {
  const update = {};
  if (context?.location && context.location !== location) update.resolvedLocation = context.location;
  if (context?.chosenLocation && context.chosenLocation !== chosenLocation) update.chosenLocation = context.chosenLocation;
  return update;
}

function locationReply(turn, update) {
  if (turn.selected) return { ...chatMap(turn.selected, true), ...update };
  const { waiting } = turn.context;
  return {
    text: waiting?.turn?.draftDetails ? turn.text + ' I’ll keep these details for the draft.' : turn.text,
    cards: [],
    actions: [{ label: '📍 Share My Location', action: 'REQUEST_LOCATION', variant: 'secondary' }],
    status: 'needs_location',
    ...(waiting ? { pending: AWAITING_CHAT_PLACE, pendingData: { waiting } } : {}),
  };
}

async function photoReply(image, message, userId, signal) {
  const candidate = incidentCity(message || '');
  const location = candidate ? (await lookupPlace(candidate, { signal })).location : null;
  const { handleImageAnalysis } = await import('./photoReports');
  return handleImageAnalysis(image, message, userId, location);
}

function continuesDraft(message, pending) {
  return pending?.type === AWAITING_DRAFT_DETAILS && (describesIssue(message) || isDraftDetailFragment(message));
}

async function textReply(input, history, userId, location, pending, { chosenLocation, photoLocation, signal }) {
  // A photo action keeps its incident location independent of the current city in Chat.
  const fromPhoto = photoLocation !== undefined;
  const chatLocation = fromPhoto ? photoLocation : location;
  const chatPending = fromPhoto ? null : pending;
  const turn = await resolveChatPlace(input, history, chatLocation, chatPending, {
    chosenLocation: fromPhoto ? null : chosenLocation, draftDetails: continuesDraft(input, chatPending), fromPhoto, signal,
  });
  const update = fromPhoto ? {} : placeChanges(turn?.context, location, chosenLocation);
  if (turn?.kind === 'reply') return locationReply(turn, update);
  if (turn?.kind === 'map') return { ...chatMap(turn.location), ...update };
  const active = turn?.location || chatLocation;
  const result = await answerTurn(turn, input, history, userId, active, signal);
  if (result.pending && active) return { ...result, pendingData: { ...result.pendingData, location: active }, ...update };
  return { ...result, ...update };
}

async function answerTurn(turn, input, history, userId, active, signal) {
  const message = turn?.message || input;
  const detected = detectIntent(message, history);
  const intent = turn?.intent || (turn?.kind === 'web' ? INTENTS.ASK_QUESTION : detected.intent);
  logAction(userId, 'intent_detected', { intent, confidence: detected.confidence });
  const reply = replies[intent] ?? generalReply;
  return reply({
    message, history, userId, turn, signal, category: detected.entities?.category,
    lat: active?.lat, lng: active?.lng, city: resolveCity(active?.city),
  });
}

export async function processMessage(message, history, user, location, image, pending, options = {}) {
  const userId = user?.uid || 'anonymous';
  const { planChoices, signal } = options;
  try {
    if (planChoices?.length) return await explainSmogChoices(message, planChoices, signal);
    if (image?.base64) return await photoReply(image, message, userId, signal);
    return await textReply(message, history, userId, location, pending, options);
  } catch {
    signal?.throwIfAborted();
    logFailure('chat.turn');
    logAction(userId, 'error', {});
    return {
      text: "I encountered an issue processing that request. Please try again.",
      cards: [], actions: [], status: 'error',
    };
  }
}

function chatMap(place, selected = false) {
  return {
    text: selected ? `📍 **${place.city}** is your selected city for Chat.` : `🗺️ Here is **${place.city}** on the map.`,
    cards: [{ type: 'map', data: { ...place, label: place.city } }],
    actions: selected ? [{ label: '🌬️ Check Air Quality', action: 'QUICK_AQI', variant: 'primary' }] : [],
    status: 'success',
  };
}

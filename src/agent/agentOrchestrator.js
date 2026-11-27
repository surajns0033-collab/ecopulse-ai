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

export async function processMessage(userMessage, conversationHistory, user, location, imageData, pendingAction, { chosenLocation, photoLocation, planChoices, signal } = {}) {
  const userId = user?.uid || 'anonymous';

  try {
    // An explanation belongs to the plan the user clicked, even after a change of city.
    if (planChoices?.length) return await explainSmogChoices(userMessage, planChoices, signal);
    if (imageData?.base64) {
      // The city in a different Chat turn needn't be where a photo was taken.
      // Keep the analysis useful, but don't prefill a recipient from that city.
      const candidate = incidentCity(userMessage || '');
      const verifiedLocation = candidate ? (await lookupPlace(candidate, { signal })).location : null;
      const { handleImageAnalysis } = await import('./photoReports');
      return await handleImageAnalysis(imageData, userMessage, userId, verifiedLocation);
    }

    // Photo actions must not inherit the city being discussed elsewhere in Chat.
    const fromPhoto = photoLocation !== undefined;
    const chatLocation = fromPhoto ? photoLocation : location;
    const draftDetails = !fromPhoto && pendingAction?.type === AWAITING_DRAFT_DETAILS &&
      (describesIssue(userMessage) || isDraftDetailFragment(userMessage));
    const placeTurn = await resolveChatPlace(userMessage, conversationHistory, chatLocation, fromPhoto ? null : pendingAction, {
      chosenLocation: fromPhoto ? null : chosenLocation, draftDetails, fromPhoto, signal,
    });
    const contextUpdate = placeTurn?.context;
    const placeUpdate = {
      ...(!fromPhoto && contextUpdate?.location && contextUpdate.location !== location ? { resolvedLocation: contextUpdate.location } : {}),
      ...(!fromPhoto && contextUpdate?.chosenLocation && contextUpdate.chosenLocation !== chosenLocation ? { chosenLocation: contextUpdate.chosenLocation } : {}),
    };
    if (placeTurn?.kind === 'reply') {
      const { waiting } = placeTurn.context;
      if (placeTurn.selected) return { ...chatMap(placeTurn.selected, true), ...placeUpdate };
      return {
        text: waiting?.turn?.draftDetails ? `${placeTurn.text} I’ll keep these details for the draft.` : placeTurn.text,
        cards: [],
        actions: [{ label: '📍 Share My Location', action: 'REQUEST_LOCATION', variant: 'secondary' }],
        status: 'needs_location',
        ...(waiting ? { pending: AWAITING_CHAT_PLACE, pendingData: { waiting } } : {}),
      };
    }
    if (placeTurn?.kind === 'map') return { ...chatMap(placeTurn.location), ...placeUpdate };

    const active = placeTurn?.location || chatLocation;
    const { lat, lng } = active || {};
    const city = resolveCity(active?.city);
    const message = placeTurn?.message || userMessage;
    const { intent: detectedIntent, confidence, entities } = detectIntent(message, conversationHistory);
    const intent = placeTurn?.intent || (placeTurn?.kind === 'web' ? INTENTS.ASK_QUESTION : detectedIntent);
    logAction(userId, 'intent_detected', { intent, confidence });

    let result;

    switch (intent) {
      case INTENTS.GET_AIR_QUALITY:
        result = await handleAirQuality(lat, lng, city, userId, { signal, forecast: asksForForecast(message) });
        break;

      case INTENTS.GET_WATER_QUALITY:
        result = await handleWaterQuality(city);
        break;

      case INTENTS.GET_WEATHER:
        result = await handleWeather(lat, lng, city, userId, { signal, forecast: asksForForecast(message) });
        break;

      case INTENTS.FIND_EVENTS:
        result = await handleFindEvents(city, entities?.category, userId);
        break;

      case INTENTS.JOIN_EVENT:
        result = handleJoinEventPrompt();
        break;

      case INTENTS.CREATE_EVENT:
        result = await handleCreateEventPrompt(message, city, lat, lng);
        break;

      case INTENTS.CREATE_REPORT:
        result = await handleCreateReport(message, userId, { lat, lng, city });
        break;

      case INTENTS.CREATE_EMAIL:
        result = await handleCreateEmail(message, conversationHistory, city, placeTurn);
        break;

      case INTENTS.GET_AUTHORITY_CONTACTS:
        result = await handleAuthorityContacts(message, { city });
        break;

      case INTENTS.GET_COMMUNITY:
        result = await handleCommunityFeed();
        break;

      case INTENTS.GET_DAILY_PLAN:
        result = await handleDailyPlan(lat, lng);
        break;

      case INTENTS.GET_HEALTH_TIPS:
        result = await handleHealthTips(lat, lng, city, signal);
        break;

      case INTENTS.GET_ROUTES:
        result = await handleRoutes(city, lat, lng);
        break;

      case INTENTS.GET_USER_IMPACT:
        result = await handleUserImpact(userId);
        break;

      case INTENTS.GET_WASTE_TIPS:
        result = await handleWasteTips(city, lat, lng);
        break;

      case INTENTS.GET_SMOG_PLAN:
        result = placeTurn?.smogDetails
          ? await getSmogPlan(placeTurn.smogDetails, { city, lat, lng }, signal)
          : startSmogPlan(city);
        break;

      default:
        result = await handleGeneralQuestion(message, conversationHistory, { lat, lng, city }, userId, {
          snapshot: placeTurn?.snapshot, web: placeTurn?.kind === 'web', webLocation: placeTurn?.location, signal,
        });
        break;
    }

    if (result.pending && active) result.pendingData = { ...result.pendingData, location: active };
    return { ...result, ...placeUpdate };
  } catch (err) {
    signal?.throwIfAborted();
    console.error('Orchestrator error:', err);
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

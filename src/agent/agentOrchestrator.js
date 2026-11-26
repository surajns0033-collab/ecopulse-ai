// Agent Orchestrator — processes user messages and returns structured responses

import { detectIntent, INTENTS } from './intentEngine';
import { isSmogProfile, parseSmogProfile } from './smogProfile';
import { AWAITING_CHAT_PLACE, AWAITING_DRAFT_DETAILS, incidentCity, isDraftDetailFragment, resolveChatPlace } from './chatPlaces';
import { asksForForecast } from './talkContext';
import { tools } from '../services/agentTools';
import { getChatResponse, getJsonResponse, isAIUnavailable } from '../services/geminiService';
import { buildFallbackReply, buildComplaintEmailTemplate, contactLines } from './fallbackBrain';
import { getAQIInsight, getAQICategory, getAirQuality, getAirQualityForecast, getWeather } from '../services/environmentalData';
import { lookupTalkPlace } from '../services/talkPlaces';
import { getAuthorityBundle, isIndianPlace } from '../services/authorityDirectory';
import { COLLECTIONS } from '../firebase/collections';
import { db, isFirebaseConfigured } from '../firebase/config';
import { addDoc, collection, Timestamp } from 'firebase/firestore';

async function logAction(userId, action, data) {
  if (!userId || !isFirebaseConfigured) return;
  try {
    await addDoc(collection(db, COLLECTIONS.AI_ACTION_LOGS), {
      userId, action, data, timestamp: Timestamp.now(),
    });
  } catch { /* analytics must not block a reply */ }
}

/** Resolve the best city label — dynamic, never hardcoded */
function resolveCity(city) {
  if (city && city !== 'your city' && city !== 'Unknown') return city;
  return null; // null = location unknown
}

export async function processMessage(userMessage, conversationHistory, user, location, imageData, pendingAction, { chosenLocation, photoLocation, voiceIntent, signal } = {}) {
  const userId = user?.uid || 'anonymous';
  const logUserId = voiceIntent ? null : userId;
  const followingSmog = pendingAction?.type === 'SMOG_PLAN_AWAITING_PROFILE' && (voiceIntent || isSmogProfile(userMessage));

  try {
    if (imageData?.base64) {
      // The city in a different Chat turn needn't be where a photo was taken.
      // Keep the analysis useful, but don't prefill a recipient from that city.
      const candidate = incidentCity(userMessage || '');
      const verifiedLocation = candidate ? (await lookupTalkPlace(candidate, { signal })).location : null;
      return await handleImageAnalysis(imageData, userMessage, userId, verifiedLocation);
    }

    // Photo actions must not inherit the city being discussed elsewhere in Chat.
    const fromPhoto = photoLocation !== undefined;
    const chatLocation = fromPhoto ? photoLocation : location;
    const draftDetails = !fromPhoto && pendingAction?.type === AWAITING_DRAFT_DETAILS &&
      (describesIssue(userMessage) || isDraftDetailFragment(userMessage));
    const placeTurn = voiceIntent || followingSmog ? null :
      await resolveChatPlace(userMessage, conversationHistory, chatLocation, fromPhoto ? null : pendingAction, {
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

    const active = placeTurn?.location || (followingSmog && pendingAction.location) || chatLocation;
    const { lat, lng } = active || {};
    const city = resolveCity(active?.city);
    const message = placeTurn?.message || userMessage;
    const { intent: detectedIntent, confidence, entities } = detectIntent(message, conversationHistory);
    const intent = voiceIntent || placeTurn?.intent || (placeTurn?.kind === 'web' ? INTENTS.ASK_QUESTION : detectedIntent);
    logAction(logUserId, 'intent_detected', { intent, confidence });

    let result;

    if (followingSmog) {
      result = await handleSmogPlanProfile(message, { city, lat, lng }, Boolean(voiceIntent), signal);
    } else {
      switch (intent) {
      case INTENTS.GET_AIR_QUALITY:
        result = await handleAirQuality(lat, lng, city, logUserId, { signal, forecast: asksForForecast(message) });
        break;

      case INTENTS.GET_WATER_QUALITY:
        result = await handleWaterQuality(city);
        break;

      case INTENTS.GET_WEATHER:
        result = await handleWeather(lat, lng, city, logUserId, { signal, forecast: asksForForecast(message) });
        break;

      case INTENTS.FIND_EVENTS:
        result = await handleFindEvents(city, entities?.category, logUserId);
        break;

      case INTENTS.JOIN_EVENT:
        result = handleJoinEventPrompt();
        break;

      case INTENTS.CREATE_EVENT:
        result = await handleCreateEventPrompt(message, city, lat, lng);
        break;

      case INTENTS.CREATE_REPORT:
        result = voiceIntent ? await handleAuthorityContacts(message, { city }) : await handleCreateReport(message, userId, { lat, lng, city });
        break;

      case INTENTS.CREATE_EMAIL:
        result = voiceIntent ? await handleAuthorityContacts(message, { city }) : await handleCreateEmail(message, conversationHistory, city, placeTurn);
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
        result = voiceIntent ? await handleAirQuality(lat, lng, city, null, { signal }) : await handleHealthTips(lat, lng, city);
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
        result = handleSmogPlanStart(city);
        break;

      default:
        result = await handleGeneralQuestion(message, conversationHistory, { lat, lng, city }, userId, {
          snapshot: placeTurn?.snapshot, web: placeTurn?.kind === 'web', webLocation: placeTurn?.location, signal,
        });
        break;
      }
    }

    if (result.pending && active) result.pendingData = { ...result.pendingData, location: active };
    return { ...result, ...placeUpdate };
  } catch (err) {
    signal?.throwIfAborted();
    console.error('Orchestrator error:', err);
    logAction(logUserId, 'error', { error: err.message });
    return {
      text: "I encountered an issue processing that request. Please try again.",
      cards: [], actions: [], status: 'error',
    };
  }
}

// ===== HANDLERS =====

function chatMap(place, selected = false) {
  return {
    text: selected ? `📍 **${place.city}** is your selected city for Chat.` : `🗺️ Here is **${place.city}** on the map.`,
    cards: [{ type: 'map', data: { ...place, label: place.city } }],
    actions: selected ? [{ label: '🌬️ Check Air Quality', action: 'QUICK_AQI', variant: 'primary' }] : [],
    status: 'success',
  };
}

function handleSmogPlanStart(city) {
  return {
    text: `Let's create your personalized clean-air and winter-smog plan for **${city || 'your city'}**. Reply naturally in one message with whatever you know:\n\n• Usual commute: car / two-wheeler / public transport / walk-cycle / work from home\n• Routine: office-school / outdoor work / mostly home / mixed\n• Cooking: gas / induction-electric / mixed\n• Air cleaning: HEPA / DIY filter / none\n• Household: children, older adults, or heart/lung sensitivity (optional)\n\nExample: *“Car commute, outdoor work, gas stove, HEPA purifier, one child.”*`,
    cards: [],
    actions: [],
    status: 'needs_info',
    pending: 'SMOG_PLAN_AWAITING_PROFILE',
  };
}

function lowestAqiWindow(forecast) {
  const hours = forecast?.hours || [];
  const usable = hours.filter((item) => {
    const hour = Number(String(item.time).slice(11, 13));
    return hour >= 6 && hour <= 21;
  });
  const best = [...(usable.length ? usable : hours)].sort((a, b) => a.aqi - b.aqi)[0];
  if (!best) return null;
  // Open-Meteo already sent wall-clock time for the target city. Preserve it
  // even if the device is in another zone (or has a DST transition that day).
  const date = new Date(`${best.time}Z`);
  return {
    ...best,
    label: Number.isNaN(date.getTime()) ? best.time.replace('T', ' ') : date.toLocaleString([], { weekday: 'short', hour: 'numeric', timeZone: 'UTC' }),
  };
}

async function handleSmogPlanProfile(userMessage, location, voice, signal) {
  const targetCity = location?.city || 'your area';
  const lat = location?.lat;
  const lng = location?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      text: 'I have your routine, but I need a location for live AQI. Type the city name or share your location, then ask for the smog plan again.',
      cards: [],
      actions: [{ label: '📍 Share Location', action: 'REQUEST_LOCATION', variant: 'primary' }],
      status: 'needs_location',
    };
  }

  const profile = parseSmogProfile(userMessage);
  const [aqi, weather, forecast] = await Promise.all([
    getAirQuality(lat, lng, targetCity, { signal }),
    voice ? null : getWeather(lat, lng, { signal }),
    voice ? null : getAirQualityForecast(lat, lng, { signal }),
  ]);
  const hasAqi = aqi?.aqi != null && Number.isFinite(Number(aqi.aqi));
  if (voice) {
    return { speechData: { profile }, cards: hasAqi ? [{ type: 'aqi', data: aqi }] : [], status: hasAqi ? 'success' : 'unavailable' };
  }
  const category = getAQICategory(aqi?.aqi);
  const severe = hasAqi && aqi.aqi >= 151;
  const sensitive = hasAqi && aqi.aqi >= 101;
  const best = lowestAqiWindow(forecast);
  const vulnerable = profile.vulnerable.length ? profile.vulnerable.join(', ') : 'none stated';

  const commuteAdvice = profile.commute === 'car'
    ? 'Bundle errands, carpool when practical, avoid idling, and use cabin recirculation near heavy traffic.'
    : profile.commute === 'two-wheeler'
      ? `${severe ? 'Use metro/train/bus for the longest leg today; ' : ''}avoid waiting behind buses and trucks.`
      : profile.commute === 'walk/cycle'
        ? `${severe ? 'Avoid strenuous roadside exercise today; use transit for the polluted segment.' : 'Use internal lanes away from traffic.'}`
        : profile.commute === 'work from home'
          ? 'Preserve the avoided commute benefit by grouping deliveries and unnecessary trips.'
          : profile.commute === 'public transport'
            ? 'Keep the long leg on public transport and reach it through quieter internal streets.'
            : 'Choose public transport or carpool for longer journeys where practical, and avoid idling.';
  const commuteImpact = profile.commute === 'walk/cycle'
    ? 'Active travel has zero tailpipe emissions; moving it away from peak smog prevents high breathing rates from multiplying exposure.'
    : 'Fewer solo vehicle kilometres and less idling reduce tailpipe emissions while quieter routes reduce roadside exposure.';

  const indoorAdvice = profile.filtration === 'HEPA purifier'
    ? 'Run HEPA in one closed cleaner-air room, keep airflow clear, wet-mop, and avoid ozone/ionizer modes.'
    : 'Create one low-dust room, damp-clean instead of dry sweeping, close traffic-facing leaks during peaks, and ventilate only when outdoor AQI is lower.';
  const cookingAdvice = profile.cooking === 'gas stove'
    ? 'Exhaust the gas stove outdoors every time it runs; prefer back burners and keep children away from the cooking plume.'
    : 'If you fry or cook at high heat, use an exhaust fan that vents outdoors.';

  const profileSummary = [profile.commute, profile.routine, profile.cooking, profile.filtration].filter(Boolean).join('; ') || 'routine not specified';

  const forecastLine = best
    ? `**Lower-AQI outdoor window:** ${best.label} (city local time; forecast U.S. AQI ${best.aqi}). [Open-Meteo forecast](${forecast.sourceUrl}). Check the latest reading before going out.`
    : '**Lower-AQI outdoor window:** forecast temporarily unavailable—check live AQI before going out.';
  const lowWind = weather?.windSpeed != null && weather.windSpeed < 2
    ? ` Wind is low at ${weather.windSpeed} m/s ([${weather.source}](${weather.sourceUrl})), so dispersion may be slow.`
    : '';

  const reading = hasAqi
    ? `**Current:** AQI **${aqi.aqi} — ${category.label}** · PM2.5 ${aqi.pm25 ?? '—'} · PM10 ${aqi.pm10 ?? '—'} (${aqi.source}).`
    : '**Current AQI:** temporarily unavailable. The steps below are based on your routine, not on an assumed reading.';
  const exposure = !hasAqi ? 'Check the current AQI before strenuous outdoor activity, and avoid visible smoke and idling vehicles.'
    : severe ? 'Move exercise indoors, shorten non-essential outdoor tasks, and use a well-fitted N95/FFP2 for unavoidable travel.'
      : sensitive ? 'Shorten prolonged outdoor exertion, especially beside traffic; sensitive family members should take extra care.'
        : 'Follow local guidance and avoid visible smoke and idling traffic.';
  const workAdvice = profile.routine === 'outdoor work' && (sensitive || !hasAqi)
    ? ' If you work outside, take breaks in a cleaner indoor space when possible.' : '';
  const factualPlan = `🌫️ **Your clean-air plan — ${targetCity}**\n\n${reading}${lowWind}\n**Profile understood:** ${profileSummary}; household sensitivity: ${vulnerable}.\n\n🛡️ **1. Exposure routine**\n${exposure}${workAdvice}\n**Direct impact:** reduces inhaled fine-particle dose; this does not reduce the pollution source itself.\n\n🚌 **2. Lower-emission commute**\n${commuteAdvice}\n**Direct impact:** ${commuteImpact}\n\n🏠 **3. Indoor air**\n${indoorAdvice}\n**Direct impact:** source control prevents new indoor particles; filtration removes particles already suspended indoors.\n\n🍳 **4. Cooking**\n${cookingAdvice}\n**Direct impact:** prevents controllable cooking pollution from adding another exposure layer on an outdoor-smog day.\n\n🌿 **5. Community choice**\nDo not burn leaves or waste, discourage idling, share verified AQI guidance, and report smoke or dust hotspots with location and photos.\n**Direct impact:** avoiding burning and idling cuts emissions at the source.\n\n🕒 ${forecastLine}`;

  return {
    text: `${factualPlan}\n\n_General exposure guidance, not medical advice. Follow local advisories and consult a clinician for symptoms or individual medical decisions._`,
    cards: hasAqi ? [{ type: 'aqi', data: { ...aqi, insight: getAQIInsight(aqi) } }] : [],
    actions: [
      { label: '💊 AQI Health Tips', action: 'QUICK_HEALTH_TIPS', variant: 'secondary' },
      { label: '📷 Report a Pollution Source', action: 'OPEN_IMAGE_PICKER', variant: 'secondary' },
    ],
    status: 'success',
  };
}

async function handleAirQuality(lat, lng, city, userId, { signal, forecast = false } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      text: 'Which city should I check for air quality?',
      cards: [],
      actions: [{ label: '📍 Share Location', action: 'REQUEST_LOCATION', variant: 'primary' }],
      status: 'needs_location',
    };
  }

  const aqiData = await getAirQuality(lat, lng, city, { signal });
  const displayCity = city || aqiData?.city || `(${lat.toFixed(2)}, ${lng.toFixed(2)})`;

  if (aqiData?.aqi == null || !Number.isFinite(Number(aqiData.aqi))) {
    return {
      text: `I couldn't verify the air-quality reading for **${displayCity}**. Try again later, or check [World Air Quality Index](https://aqicn.org/map/)${isIndianPlace(city) ? ' or the CPCB Sameer app' : ''}.`,
      cards: [],
      actions: [{ label: '📋 Report Air Issue', action: 'QUICK_REPORT', variant: 'primary' }],
      status: 'unavailable',
    };
  }

  const insight = getAQIInsight(aqiData);
  logAction(userId, 'aqi_fetched', { city: displayCity, aqi: aqiData.aqi });

  return {
    text: `${forecast ? "I couldn't verify AQI for the time you asked about. " : ''}Here's the current air quality for **${displayCity}**. 🌬️`,
    cards: [{ type: 'aqi', data: { ...aqiData, insight } }],
    actions: [
      { label: '💊 Health Tips', action: 'QUICK_HEALTH_TIPS', variant: 'secondary' },
      { label: '📋 File Report', action: 'QUICK_REPORT', variant: 'secondary' },
    ],
    status: 'success',
  };
}

async function handleWaterQuality(city) {
  const displayCity = city || 'your area';
  return {
    text: `Water quality monitoring via free APIs isn't available for **${displayCity}** yet. Here's what you can check:`,
    cards: [{ type: 'water-quality', data: { city: displayCity } }],
    actions: [{ label: '📋 Report Water Issue', action: 'QUICK_WATER_REPORT', variant: 'primary' }],
    status: 'info',
  };
}

function getWeatherPrecautions(weather) {
  const tips = [];
  const description = String(weather?.description || '').toLowerCase();
  const { temp, humidity, windSpeed: wind } = weather;

  if (/thunder|storm/.test(description)) {
    tips.push('Stay indoors during lightning; avoid open grounds, isolated trees, metal fencing, and water bodies.');
  } else if (/rain|shower|drizzle/.test(description)) {
    tips.push('Carry rain protection and avoid walking or driving through waterlogged roads—you cannot judge drain depth safely.');
  }
  if (Number.isFinite(temp) && temp >= 38) {
    tips.push('High heat: avoid strenuous outdoor activity from roughly noon to 4 PM, carry water, and take shade breaks.');
  } else if (Number.isFinite(temp) && temp >= 33) {
    tips.push('It is hot: hydrate regularly, use shade, and never leave children, older adults, or pets in a parked vehicle.');
  } else if (Number.isFinite(temp) && temp <= 12) {
    tips.push('Dress in warm layers, especially for children, older adults, and early-morning travel.');
  }
  if (Number.isFinite(wind) && wind >= 10) {
    tips.push('Strong wind: secure loose balcony items and keep away from weak branches, temporary sheets, and unstable hoardings.');
  }
  if (Number.isFinite(humidity) && humidity >= 80 && Number.isFinite(temp) && temp >= 28) {
    tips.push('High heat plus humidity can make exertion harder—slow down, hydrate, and take cooling breaks.');
  }
  if (!tips.length) {
    tips.push('No special weather hazard is evident from the current reading; normal precautions and hydration are appropriate.');
  }
  return tips.slice(0, 4);
}

async function handleWeather(lat, lng, city, userId, { signal, forecast } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      text: 'Which city should I check for weather?',
      cards: [],
      actions: [{ label: '📍 Share Location', action: 'REQUEST_LOCATION', variant: 'primary' }],
      status: 'needs_location',
    };
  }

  const weather = await getWeather(lat, lng, { signal });
  const displayCity = city || `(${lat.toFixed(2)}, ${lng.toFixed(2)})`;

  if (!weather) {
    return {
      text: `I couldn't verify the current weather for **${displayCity}** right now.`,
      cards: [],
      actions: [],
      status: 'unavailable',
    };
  }

  logAction(userId, 'weather_fetched', { city: displayCity });
  const precautions = getWeatherPrecautions(weather);

  return {
    text: `${forecast ? "I couldn't verify a forecast for the time you asked about. " : ''}Here's the current weather in **${displayCity}**. 🌤️\n\n🌡️ Temperature: **${weather.temp}°C**${Number.isFinite(weather.feelsLike) ? ` (feels like ${weather.feelsLike}°C)` : ''}\n💧 Humidity: ${Number.isFinite(weather.humidity) ? `${weather.humidity}%` : 'unavailable'}\n💨 Wind: ${Number.isFinite(weather.windSpeed) ? `${weather.windSpeed} m/s` : 'unavailable'}\n☁️ Conditions: ${weather.description}\n\n🛡️ **Precautions based on the current reading**\n${precautions.map((tip) => `• ${tip}`).join('\n')}\n\nSource: [${weather.source}](${weather.sourceUrl}). These are current-condition precautions, not a severe-weather warning or medical advice.`,
    speechData: { weather },
    cards: [],
    actions: [
      { label: '🌬️ Check AQI', action: 'QUICK_AQI', variant: 'secondary' },
      { label: '💊 AQI Health Tips', action: 'QUICK_HEALTH_TIPS', variant: 'secondary' },
    ],
    status: 'success',
  };
}

async function handleFindEvents(city, category, userId) {
  const today = new Date().toISOString().slice(0, 10);
  const events = (await tools.getNearbyMeetups({ category, limit: 30 })).filter((event) => {
    const date = new Date(event.date?.toDate?.() || event.date);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) >= today;
  }).slice(0, 8);
  logAction(userId, 'events_fetched', { count: events.length, category: category || null });

  if (!events || events.length === 0) {
    return {
      text: 'I didn’t find any upcoming meetups in the EcoPulse listings. You can check the Events tab or organize one.',
      cards: [],
      actions: [{ label: '➕ Create Meetup', action: 'CREATE_EVENT', variant: 'primary' }],
      status: 'empty',
    };
  }

  return {
    text: `Here are upcoming events listed on EcoPulse.${city ? ` I can’t verify that they’re near **${city}**; check the venue before you go.` : ''}`,
    cards: [{ type: 'meetup-list', data: { events } }],
    actions: [
      { label: '🗓️ See All Events', action: 'GOTO_MEETUPS', variant: 'secondary' },
      { label: '➕ Create Event', action: 'CREATE_EVENT', variant: 'secondary' },
    ],
    status: 'success',
  };
}

function handleJoinEventPrompt() {
  return {
    text: "To join an event, tap the **Join** button on any event card, or tell me the event name and I'll help you RSVP! 🤝",
    cards: [],
    actions: [{ label: '🔍 Find Events', action: 'QUICK_FIND_EVENTS', variant: 'primary' }],
    status: 'info',
  };
}

async function handleCreateEventPrompt(userMessage, city, lat, lng) {
  const defaultCity = city || 'Your City';
  const lower = (userMessage || '').toLowerCase();
  const hasDetails = userMessage && userMessage.trim().split(/\s+/).length >= 4 &&
    !['i want to create a community eco-event', 'create event', 'create meetup', 'organise event', 'organize event'].includes(lower.trim());

  if (hasDetails) {
    // Use the model to structure meetup details from natural language (best effort).
    const parsed = await getJsonResponse(
      `Extract eco-meetup details from this user request: "${userMessage}".
Default city if not specified: "${defaultCity}".
Today's date: "${new Date().toISOString().slice(0, 10)}".
Only use details the user actually gave; use sensible defaults for the rest.`,
      '',
      { timeoutMs: 15000 }
    );
    if (parsed) {
      return {
        text: "I've prepared your eco-meetup! 🗓️ Review the details below and tap **Publish Meetup**:",
        cards: [{
          type: 'meetup-preview',
          data: {
            title: parsed.title || 'Community Eco-Meetup',
            category: parsed.category || 'cleanup',
            location: parsed.location || defaultCity,
            date: parsed.date || new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            time: parsed.time || '7:00 AM',
            description: parsed.description || userMessage,
            capacity: parsed.capacity || 25,
            lat,
            lng,
          },
        }],
        actions: [],
        status: 'preview',
      };
    }
  }

  return {
    text: `Great initiative! 🌱 Tell me the meetup details in one message (for example: *"Create a beach cleanup at Juhu, Mumbai this Sunday at 7 AM"*), and I'll set it up for you — or open the Events page to use the form!`,
    cards: [],
    actions: [{ label: '🗓️ Open Events Page', action: 'GOTO_MEETUPS', variant: 'primary' }],
    status: 'info',
  };
}

async function handleCreateReport(userMessage, userId, location) {
  const city = resolveCity(location?.city) || 'your area';
  const lat = location?.lat;
  const lng = location?.lng;

  const lower = userMessage.toLowerCase();
  let category = 'other';
  let title = 'Environmental Issue Report';

  if ((lower.includes('parking') || lower.includes('parked') || lower.includes('vehicle')) && (lower.includes('block') || lower.includes('obstruct') || lower.includes('road') || lower.includes('footpath'))) { category = 'road_obstruction'; title = 'Road / Footpath Obstruction by Parked Vehicle'; }
  else if (lower.includes('burning') || lower.includes('buring') || lower.includes('jalana') || lower.includes('smoke')) { category = 'burning'; title = 'Open Burning Issue'; }
  else if (lower.includes('landfill') || lower.includes('land filling') || lower.includes('excavation material') || lower.includes('soil dumping') || lower.includes('rubble dumping')) { category = 'greenspace'; title = 'Land Filling / Excavation Material Dumping'; }
  else if (lower.includes('garbage') || lower.includes('kachra') || lower.includes('dumping')) { category = 'garbage'; title = 'Illegal Garbage Dumping'; }
  else if (lower.includes('plastic')) { category = 'plastic'; title = 'Plastic Waste Issue'; }
  else if (lower.includes('sewage') || lower.includes('nali') || lower.includes('naala') || lower.includes('nala') || lower.includes('drain')) { category = 'sewage'; title = 'Sewage / Polluted Drain Issue'; }
  else if (lower.includes('water')) { category = 'water'; title = 'Water Pollution Issue'; }
  else if (lower.includes('tree') || lower.includes('mangrove')) { category = 'trees'; title = 'Tree / Mangrove Damage Issue'; }
  else if (lower.includes('construction') || lower.includes('dust')) { category = 'construction'; title = 'Construction Dust Issue'; }
  else if (lower.includes('air') || lower.includes('pollution')) { category = 'air'; title = 'Air Pollution Issue'; }

  // Fetch official authority details so user knows whom to complain to
  const recipient = await tools.findVerifiedRecipient({ issueCategory: category, city });
  const isTreeOrMangrove = lower.includes('tree') || lower.includes('mangrove') || lower.includes('forest');

  const forestLine = isTreeOrMangrove && recipient.forestEmail
    ? `🌿 **Forest / Tree Protection Cell:** ${recipient.forestEmail}${recipient.forestHelpline ? ` (Helpline: ${recipient.forestHelpline})` : ''}`
    : null;

  // "Where do I complain about X?" — the user wants the route, not a report draft.
  const askingWhere =
    /\b(where|whom|kisko|kahan|kaha|kaise|how do i|how to)\b/i.test(lower) &&
    !/\b(my|our|near|nearby|outside|behind|beside|opposite|society|street|road|happening|since|yesterday|today|saw|seen|noticed|smell|stink|gate)\b/i.test(lower);

  if (askingWhere) {
    const immediateNumber = !/emergency only/i.test(recipient.helpline || '')
      ? (recipient.helpline || (isTreeOrMangrove ? recipient.forestHelpline : null))
      : null;
    const contactBlock = [
      `🏛️ **${recipient.organization}**`,
      recipient.email && recipient.email.includes('@') ? `📧 Email: ${recipient.email}` : null,
      recipient.helpline ? `📞 Helpline: ${recipient.helpline}` : null,
      recipient.whatsapp ? `💬 WhatsApp: ${recipient.whatsapp}` : null,
      recipient.portalUrl ? `🌐 Portal: ${recipient.portalUrl}` : null,
      recipient.sourceUrl ? `[Official contact listing](${recipient.sourceUrl})` : null,
      forestLine,
    ].filter(Boolean).join('\n');

    return {
      text: `Here's how to report the issue for **${city}**:\n\n${contactBlock}\n${recipient.disclaimer}\n\n**To make it count:** write it down with the **exact location, date and time**, attach **photos/video**, and note the **reference number** you get back.${immediateNumber ? ` If it's happening right now, call **${immediateNumber}** first so the responsible team can inspect.` : recipient.jurisdiction !== 'india' ? ' Verify the emergency number for this location with local authorities.' : ' If there is fire or immediate danger to life, call **112**; otherwise use the official portal for a tracked complaint.'}\n\nWant me to draft the email? 📧`,
      cards: [],
      actions: [
        { label: '📧 Draft Complaint Email', action: 'QUICK_DRAFT_EMAIL', variant: 'primary' },
        { label: '📇 All Contacts', action: 'QUICK_ALL_CONTACTS', variant: 'secondary', data: { category } },
      ],
      status: 'info',
    };
  }
  // Use AI to structure title/description/locality cleanly from the user's message.
  // If the model is unreachable we keep the user's own words — never invent place names.
  let finalLocation = city;
  let finalDescription = userMessage.trim();
  const structured = await getJsonResponse(
    `Extract a concise report title, a clean factual 1-2 sentence description, and the specific locality from this complaint.
Complaint: "${userMessage}"
Default city: "${city}".
Rules: do not invent names, streets, dates or facts. If the locality is not stated, use the default city.
Respond in JSON: {"title":"...","description":"...","locality":"..."}`,
    '',
    { timeoutMs: 15000 }
  );
  if (structured) {
    if (structured.title) title = String(structured.title).slice(0, 120);
    if (structured.description) finalDescription = String(structured.description).slice(0, 600);
    const loc = typeof structured.locality === 'string' ? structured.locality.trim().slice(0, 120) : '';
    if (loc && lower.includes(loc.toLowerCase()) && !/unknown|not specified/i.test(loc)) {
      const cityShort = city.split(',')[0].trim();
      finalLocation = loc.toLowerCase().includes(cityShort.toLowerCase()) ? loc : `${loc}, ${city}`;
    }
  }

  const previewData = {
    title,
    category,
    description: finalDescription,
    location: finalLocation,
    userId,
    lat,
    lng,
  };

  const authorityLines = [
    `🏛️ **Where to complain:** ${recipient.organization}`,
    recipient.email && recipient.email.includes('@') ? `📧 Email: ${recipient.email}` : null,
    recipient.helpline ? `📞 Helpline: ${recipient.helpline}` : null,
    recipient.whatsapp ? `💬 WhatsApp: ${recipient.whatsapp}` : null,
    recipient.portalUrl ? `🌐 Portal: ${recipient.portalUrl}` : null,
    recipient.sourceUrl ? `[Official contact listing](${recipient.sourceUrl})` : null,
    isTreeOrMangrove && recipient.forestEmail
      ? `🌿 **Forest / Tree Protection Cell CC:** ${recipient.forestEmail}${recipient.forestHelpline ? ` (Helpline: ${recipient.forestHelpline})` : ''}`
      : (isTreeOrMangrove && recipient.forestHelpline ? `🌿 **State Forest Helpline (24/7):** ${recipient.forestHelpline}` : null),
  ].filter(Boolean).join('\n');

  const urgentHelpline = !/emergency only/i.test(recipient.helpline || '')
    ? (recipient.helpline || (isTreeOrMangrove ? recipient.forestHelpline : null))
    : null;

  const proofHint = isTreeOrMangrove
    ? '📸 *Got a photo? Attach it — it speeds up inspection. **Draft Email** will also CC the Forest Cell.*'
    : '📸 *Got a photo? Attach it — evidence makes the complaint much harder to ignore.*';

  return {
    text: `Thank you for speaking up for **${finalLocation}**! 🙌 Reporting this really makes a difference in our community.${urgentHelpline ? `\n\n🚨 **Happening right now?** Call **${urgentHelpline}** so the responsible local team can inspect it.` : recipient.jurisdiction !== 'india' ? '\n\n🚨 Verify the correct emergency number on the local government or police website; none is guessed here.' : '\n\n🚨 If there is fire, a hazardous leak, or immediate danger to life, call **112**; otherwise review the written complaint below.'}\n\n${authorityLines}\n${recipient.disclaimer}\n\n${proofHint}`,
    cards: [{ type: 'report-preview', data: previewData }],
    actions: [
      { label: '📧 Draft Email', action: 'QUICK_DRAFT_EMAIL', variant: 'secondary' },
      { label: '📇 All Contacts', action: 'QUICK_ALL_CONTACTS', variant: 'secondary', data: { category } },
    ],
    status: 'preview',
  };
}

/**
 * Full three-level contact directory: national → state → local.
 * Only publicly published contacts are shown. Where no email is confirmed we
 * point at the official grievance form rather than inventing an address.
 */
async function handleAuthorityContacts(userMessage, location) {
  const city = resolveCity(location?.city);
  const place = city;

  const bundle = getAuthorityBundle(city);
  const recipient = await tools.findVerifiedRecipient({
    issueCategory: detectIssueCategory(userMessage),
    city,
  });
  if (recipient.jurisdiction !== 'india') {
    return {
      text: recipient.jurisdiction === 'unknown' ? 'Which city and country do you need the authority contacts for?'
        : `I don't have verified local contacts for **${place}**. Check the official city or regional website for its **environment, sanitation, public works, or police** complaint page.`,
      cards: [],
      actions: [],
      status: 'info',
    };
  }
  const isTraffic = recipient.civicDomain === 'traffic';
  const stateAuthority = recipient.stateAuthority || bundle.state;
  const nationalAuthorities = isTraffic
    ? bundle.national.filter((authority) => authority.id === 'emergency')
    : bundle.national;

  // ---- National ----
  const nationalLines = nationalAuthorities.map((a) => {
    const parts = [`**${a.name}**`];
    if (a.emails?.length) parts.push(`📧 ${a.emails.join(' · ')}`);
    if (a.phones?.length) parts.push(`📞 ${a.phones.join(' · ')}`);
    if (a.portal) parts.push(`🌐 ${a.portal}`);
    return `• ${parts.join('  |  ')}`;
  });

  // ---- State ----
  let stateBlock;
  if (stateAuthority) {
    const stateLines = [`🏛️ **${stateAuthority.name}**`];
    if (stateAuthority.emails?.length) stateLines.push(`📧 ${stateAuthority.emails.join(' · ')}`);
    if (stateAuthority.phones?.length) stateLines.push(`📞 ${stateAuthority.phones.join(' · ')}`);
    if (stateAuthority.portal) stateLines.push(`🌐 ${stateAuthority.portal}`);
    if (stateAuthority.notes) stateLines.push(`ℹ️ ${stateAuthority.notes}`);

    const regional = (stateAuthority.regional || []).find((r) => place.toLowerCase().includes(r.area.toLowerCase()));
    if (regional) {
      const regionalBits = [
        `**${regional.area} regional office**`,
        regional.emails?.length ? `📧 ${regional.emails.join(' · ')}` : null,
        regional.phones?.length ? `📞 ${regional.phones.join(' · ')}` : null,
      ].filter(Boolean);
      stateLines.push(regionalBits.join('  |  '));
    }
    if (!stateAuthority.verified) {
      stateLines.push('⚠️ Email not published — use the online grievance form on the portal.');
    }
    stateBlock = stateLines.join('\n');
  } else {
    stateBlock = isTraffic
      ? '🏛️ **State police**\nUse your state police citizen portal for a tracked complaint. Call 112 only for immediate danger.'
      : `🏛️ **State pollution control board**\nFind your state board's official contact on CPCB's directory: 🌐 https://cpcb.nic.in — then use its grievance form.`;
  }

  // ---- Local ----
  const localLines = [recipient.localUnavailable ? '📍 **No verified local contact**' : `📍 **${recipient.organization}**`];
  if (recipient.email && recipient.email.includes('@')) localLines.push(`📧 ${recipient.email}`);
  else localLines.push('📧 No verified email published — use the portal form');
  if (recipient.helpline) localLines.push(`📞 ${recipient.helpline}`);
  if (recipient.whatsapp) localLines.push(`💬 WhatsApp: ${recipient.whatsapp}`);
  if (recipient.portalUrl) localLines.push(`🌐 ${recipient.localUnavailable ? 'National portal: ' : ''}${recipient.portalUrl}`);
  if (recipient.sourceUrl) localLines.push(`[Official contact listing](${recipient.sourceUrl})`);
  if (recipient.forestEmail) {
    localLines.push(`🌳 Forest / Tree Cell: ${recipient.forestEmail}${recipient.forestHelpline ? ` (Helpline: ${recipient.forestHelpline})` : ''}`);
  }

  const text = [
    `Here are the **national → state → local** contacts for **${place}**. 📇`,
    '',
    '🇮🇳 **National (escalation & policy)**',
    ...nationalLines,
    '',
    stateBlock,
    '',
    localLines.join('\n'),
    '',
    '🧭 **Which one should you use?**',
    isTraffic
      ? '• **Parking / road obstruction** → local traffic police helpline or complaint portal first.'
      : '• **Day-to-day civic issue** (garbage, burning, sewage, dust, tree cutting) → **local** body first.',
    isTraffic
      ? '• Keep the exact location, time, obstruction photo, and vehicle number; do not confront the driver.'
      : '• **No action in 7–15 days** → escalate to the **state** pollution board, CC the local body.',
    isTraffic
      ? '• For a non-emergency, use the written police portal so you receive a complaint record.'
      : '• **Still nothing, or it is serious/illegal** → file on **CPGRAMS** (tracked) and/or approach the **NGT**.',
    '• **Happening right now** → call the published local/state helpline. Use **112** only for fire, hazardous leaks, blocked emergency access, or immediate danger to life.',
    '',
    '_Publicly listed official contacts — verify on the official portal before sending._',
  ].join('\n');

  return {
    text,
    cards: [],
    speechData: recipient.portalUrl ? { contact: { organization: recipient.organization, portal: recipient.portalUrl, source: recipient.sourceUrl, national: Boolean(recipient.localUnavailable) } } : null,
    actions: [
      { label: '📧 Draft Complaint Email', action: 'QUICK_DRAFT_EMAIL', variant: 'primary' },
      { label: '📋 File Report', action: 'QUICK_REPORT', variant: 'secondary' },
    ],
    status: 'info',
  };
}

function detectIssueCategory(text) {
  const lower = (text || '').toLowerCase();
  if (lower.includes('polluted naala') || lower.includes('polluted nala') || lower.includes('polluted drain')) return 'water';
  if ((lower.includes('parking') || lower.includes('parked') || lower.includes('vehicle')) && (lower.includes('block') || lower.includes('obstruct') || lower.includes('road') || lower.includes('footpath'))) return 'road_obstruction';
  if (lower.includes('water') || lower.includes('paani')) return 'water';
  if (lower.includes('sewage') || lower.includes('drain') || lower.includes('nali') || lower.includes('naala') || lower.includes('nala')) return 'sewage';
  if (lower.includes('tree')) return 'trees';
  if (lower.includes('landfill') || lower.includes('land filling') || lower.includes('excavation material') || lower.includes('soil dumping')) return 'greenspace';
  if (lower.includes('construction') || lower.includes('dust')) return 'construction';
  if (lower.includes('burning') || lower.includes('burn') || lower.includes('jalana')) return 'burning';
  if (lower.includes('industrial') || lower.includes('factory') || lower.includes('chemical')) return 'industrial';
  if (lower.includes('air') || lower.includes('smoke') || lower.includes('smog')) return 'air';
  if (lower.includes('garbage') || lower.includes('waste') || lower.includes('kachra') || lower.includes('plastic')) return 'garbage';
  return 'default';
}

const ISSUE_LABELS = {
  garbage: 'Garbage dumping',
  burning: 'Open burning of waste',
  air: 'Air pollution',
  sewage: 'Sewage overflow',
  water: 'Water pollution',
  trees: 'Tree cutting',
  construction: 'Construction material, dust, or debris',
  greenspace: 'Land filling or excavation-material dumping',
  plastic: 'Plastic waste dumping',
  industrial: 'Industrial or scrap-waste dumping',
  road_obstruction: 'Road or footpath obstruction by a parked vehicle',
  other: 'Environmental issue',
  default: 'Environmental issue',
};

const ISSUE_KEYWORDS = [
  'garbage', 'waste', 'kachra', 'dump', 'dumping', 'landfill', 'land filling', 'excavation material', 'soil dumping', 'rubble', 'debris', 'plastic', 'litter',
  'water', 'paani', 'pani', 'sewage', 'drain', 'nali', 'leak', 'overflow',
  'burning', 'buring', 'burn', 'tyre', 'tire', 'fire', 'jalana', 'smoke', 'smog', 'dust', 'construction', 'air pollution',
  'tree', 'cutting', 'industrial', 'chemical', 'noise', 'smell', 'stink', 'parking', 'parked', 'vehicle', 'blocked road', 'obstruction', 'footpath',
];

function hasConcreteIssue(text) {
  const lower = (text || '').toLowerCase();
  const hasIssueWord = ISSUE_KEYWORDS.some((kw) => lower.includes(kw));
  const wordCount = lower.trim().split(/\s+/).filter(Boolean).length;
  return hasIssueWord && wordCount >= 2;
}

const DRAFT_REQUEST = /^(?:(?:please|(?:can|could|would) you|i (?:want|need) (?:you )?to)\s+)?(?:draft|write|compose|prepare|create|send|generate|make)\b/i;
const OBSERVATION = /\b(?:i|we)\s+(?:saw|noticed|witnessed|observed)\b/i;

function describesIssue(text) {
  if (!hasConcreteIssue(text)) return false;
  if (/^(?:how|why|what|which|where|who|can i|is there|should i|tell me|show me|check)\b/i.test(text.trim())) return false;
  return !DRAFT_REQUEST.test(text.trim()) || OBSERVATION.test(text);
}

async function handleCreateEmail(userMessage, conversationHistory, city, turn) {
  const recentUserMessages = (conversationHistory || [])
    .filter((m) => m.role === 'user' && m.text)
    .slice(-4)
    .map((m) => m.text);

  const cityOnly = /^city:\s*[^.!?;\n]+[.!?]?$/i.test(userMessage.trim());
  const currentHasIssue = !cityOnly && (turn?.draftDetails || describesIssue(userMessage));
  const historyIssueMsg = [...recentUserMessages].reverse().find(describesIssue);
  const historyPlace = historyIssueMsg ? incidentCity(historyIssueMsg) : '';
  const parts = (value) => String(value || '').toLowerCase().split(/\s*,\s*/).filter(Boolean);
  const historyMatchesCurrentCity = historyPlace && parts(historyPlace).every((part) => parts(city).includes(part));

  // If user hasn't explained a concrete issue/situation for the current city yet, ask clarifying questions
  if (!currentHasIssue && (!historyIssueMsg || !historyMatchesCurrentCity)) {
    return {
      text: `I can draft a complaint${city ? ` for **${city}**` : ''}. What happened, where exactly, and when did you notice it? If it happened in a different city, include its name and state or country.`,
      cards: [],
      actions: [],
      status: 'needs_info',
      pending: AWAITING_DRAFT_DETAILS,
      pendingData: { draftIssue: cityOnly ? turn?.draftIssue : detectIssueCategory(userMessage) },
    };
  }

  const raw = (currentHasIssue ? userMessage : historyIssueMsg).trim();
  const startOfObservation = DRAFT_REQUEST.test(raw) ? raw.search(OBSERVATION) : -1;
  const situationText = startOfObservation >= 0 ? raw.slice(startOfObservation) : raw;
  const detectedCategory = detectIssueCategory(situationText);
  const issueCategory = detectedCategory === 'default' ? (turn?.draftIssue || detectedCategory) : detectedCategory;
  const recipient = await tools.findVerifiedRecipient({ issueCategory, city });

  let cc = null;
  let ccLabel = null;
  const isTreeOrForestIssue =
    /tree|mangrove|forest|jungle|wood|felling|cutting/i.test(situationText) ||
    /tree|mangrove|forest|cc/i.test(userMessage);

  if (isTreeOrForestIssue && recipient.forestEmail) {
    cc = recipient.forestEmail;
    ccLabel = recipient.forestHelpline ? `State Forest Dept (Helpline: ${recipient.forestHelpline})` : 'State Forest Department';
  }

  // Keep the observed facts verbatim. Unknown dates and addresses stay as
  // placeholders, and we do not send complaint details to a model to guess them.
  const { subject, body } = buildComplaintEmailTemplate({
    situation: situationText,
    recipient,
    city,
    issueLabel: ISSUE_LABELS[issueCategory],
    hasPhoto: /\b(?:i have|i took|and have|attached|attaching)\b.*\b(?:photo|picture|image)\b/i.test(situationText),
  });

  const draftData = {
    to: recipient.email,
    recipientName: recipient.name,
    organization: recipient.organization,
    location: city,
    cc,
    ccLabel,
    portalUrl: recipient.portalUrl,
    sourceUrl: recipient.sourceUrl,
    helpline: recipient.helpline,
    subject,
    body,
    disclaimer: recipient.disclaimer,
  };

  return {
    text: recipient.email
      ? `I drafted this complaint for **${recipient.organization}**. Review the details and fill in any blanks before sending.`
      : 'I drafted the complaint without an email address because I couldn’t verify one. Review the details and use the official portal if listed.',
    cards: [{ type: 'email-preview', data: draftData }],
    actions: [],
    status: 'preview',
  };
}

async function handleCommunityFeed() {
  const posts = await tools.getCommunityFeed({ limit: 5 });

  if (!posts || posts.length === 0) {
    return {
      text: "The community feed is quiet right now 🌱 Be the first to contribute by filing a report or joining an event!",
      cards: [],
      actions: [
        { label: '🗓️ Find Events', action: 'QUICK_FIND_EVENTS', variant: 'primary' },
        { label: '📋 File Report', action: 'QUICK_REPORT', variant: 'secondary' },
      ],
      status: 'empty',
    };
  }

  return {
    text: "Here's what's happening in the EcoPulse community 🤝",
    cards: [{ type: 'community-feed', data: { posts } }],
    actions: [{ label: '🌍 Community Page', action: 'GOTO_COMMUNITY', variant: 'secondary' }],
    status: 'success',
  };
}

async function handleDailyPlan(lat, lng) {
  const plan = await tools.getDailyActionPlan({ lat, lng });

  return {
    text: "Here's your personalized eco-action plan for today! 🌱 Small actions make a big difference:",
    cards: [{ type: 'daily-plan', data: { actions: plan } }],
    actions: [],
    status: 'success',
  };
}

async function handleHealthTips(lat, lng, city) {
  const displayCity = city || 'your area';
  const [aqiData, weatherData] = Number.isFinite(lat) && Number.isFinite(lng)
    ? await Promise.all([
        getAirQuality(lat, lng, city).catch(() => null),
        getWeather(lat, lng).catch(() => null),
      ])
    : [null, null];

  const aqiContext = aqiData
    ? `Current AQI in ${displayCity}: ${aqiData.aqi} (${getAQICategory(aqiData.aqi).label}). Source: ${aqiData.source}.`
    : `Live AQI for ${displayCity} is currently unavailable.`;
  const weatherContext = weatherData
    ? `Current weather in ${displayCity}: ${weatherData.temp}°C, ${weatherData.description}, humidity ${weatherData.humidity}%.`
    : 'Current weather unavailable.';

  const prompt = `Give concise, practical, location-specific health tips for someone in ${displayCity} right now based ONLY on the live data provided. Do not include raw pollutant tables or unrelated topics.`;
  const aiText = await getChatResponse(
    [{ role: 'user', text: prompt }],
    `${aqiContext}\n${weatherContext}`
  );

  if (isAIUnavailable(aiText)) {
    const category = aqiData ? getAQICategory(aqiData.aqi) : null;
    const tips = [];
    if (aqiData?.aqi > 150) {
      tips.push('Wear an **N95 mask** whenever you step out; cloth masks do not filter PM2.5.');
      tips.push('Keep windows shut during peak traffic hours (8–10 AM, 6–8 PM) and use a purifier indoors if you have one.');
      tips.push('Skip outdoor exercise today — move workouts indoors.');
    } else if (aqiData?.aqi > 100) {
      tips.push('Sensitive groups (children, elderly, asthma/allergy) should cut long outdoor exposure.');
      tips.push('Prefer walking/cycling on quieter lanes away from main roads.');
      tips.push('Keep inhalers/medication handy if you have a respiratory condition.');
    } else {
      tips.push('Air is acceptable today — normal outdoor activity is fine.');
      tips.push('Still prefer green spaces and side lanes over main-road footpaths.');
      tips.push('Drink water and take shade breaks if it is hot and humid.');
    }
    if (weatherData?.temp >= 34) tips.push('It is hot — carry water and avoid the 12–4 PM sun.');
    if (weatherData?.humidity >= 80) tips.push('High humidity: light cotton clothes and extra hydration help.');

    return {
      text: aqiData
        ? `💊 **Today in ${displayCity}** — AQI **${aqiData.aqi}** (${category.label})\n\n${tips.map((t) => `• ${t}`).join('\n')}\n\n_General guidance, not medical advice — consult a doctor for any breathing problem._`
        : `💊 General tips for **${displayCity}** today:\n\n• Check the AQI before outdoor exercise.\n• Prefer side lanes and green spaces over main-road footpaths.\n• Keep windows shut during peak traffic hours.\n• Sensitive groups should carry medication and limit long outdoor exposure.\n\n_General guidance, not medical advice._`,
      cards: [],
      actions: [{ label: '🌬️ View Full AQI Details', action: 'QUICK_AQI', variant: 'secondary' }],
      status: 'success',
    };
  }

  return {
    text: `${aqiContext}\n${weatherContext}\n\n${aiText}`,
    cards: aqiData ? [{ type: 'aqi', data: aqiData }] : [],
    actions: [{ label: '🌬️ View Full AQI Details', action: 'QUICK_AQI', variant: 'secondary' }],
    status: 'success',
  };
}

async function handleRoutes(city, lat, lng) {
  return {
    text: `I can’t verify which route has the lowest pollution${city ? ` in **${city}**` : ''}. For less roadside exposure, choose quieter parallel streets and avoid lingering beside idling vehicles. Public transit or carpooling can reduce emissions compared with driving alone.`,
    cards: Number.isFinite(lat) && Number.isFinite(lng) ? [{ type: 'map', data: { lat, lng, city } }] : [],
    actions: [],
    status: 'success',
  };
}

async function handleUserImpact(userId) {
  const stats = await tools.getUserImpact({ userId });

  return {
    text: `🌟 **Your EcoPulse Impact:**\n\n📋 Reports Submitted: **${stats.reportsSubmitted}**\n🤝 Events Joined: **${stats.eventsJoined}**\n🌱 Carbon Offset: ~**${stats.carbonSaved.toFixed(1)} kg CO₂**\n\nEvery report and event attendance makes your city cleaner! Keep going! 💪`,
    cards: [],
    actions: [
      { label: '📋 File a Report', action: 'QUICK_REPORT', variant: 'primary' },
      { label: '🗓️ Join an Event', action: 'QUICK_FIND_EVENTS', variant: 'secondary' },
    ],
    status: 'success',
  };
}

async function handleWasteTips(city, lat, lng) {
  const displayCity = city || 'your city';
  const prompt = `Provide concise, practical waste reduction, segregation, and e-waste/recycling guidance specifically relevant to ${displayCity} (including local municipal body name if known).`;
  const aiText = await getChatResponse(
    [{ role: 'user', text: prompt }],
    `Target city: ${displayCity}${lat && lng ? ` (${lat.toFixed(4)}, ${lng.toFixed(4)})` : ''}.`
  );

  if (isAIUnavailable(aiText)) {
    return {
      text: `♻️ **Waste basics that work in ${displayCity}:**\n\n• **Segregate at source:** green bin = wet/food waste, blue = dry (paper, plastic, metal), red/hazardous = batteries, e-waste, sanitary waste.\n• **Rinse and dry** plastic before putting it in dry waste — dirty plastic is not recyclable.\n• **Compost** kitchen waste in a bucket or balcony bin; it cuts half your daily waste.\n• **E-waste:** hand it to a municipal e-waste collection point or an authorised recycler — never to the kabadiwala's fire pit.\n• **Report missed pickups / illegal dumping** to your ward office or the municipal helpline.\n\nTell me your city and I'll pull the exact municipal contact for waste complaints.`,
      cards: [],
      actions: [{ label: '📋 Report Waste Issue', action: 'QUICK_REPORT', variant: 'primary' }],
      status: 'success',
    };
  }

  return {
    text: aiText,
    cards: [],
    actions: [{ label: '📍 Find Collection Events', action: 'QUICK_FIND_EVENTS', variant: 'secondary' }],
    status: 'success',
  };
}

function photoIssueActions(location) {
  return [
    ['🗑️ Garbage dumping', 'garbage'],
    ['🔥 Open burning', 'burning'],
    ['💧 Sewage overflow', 'sewage'],
    ['🌳 Tree cutting', 'trees'],
  ].map(([label, category], index) => ({
    label, action: 'PHOTO_ISSUE', variant: index === 0 ? 'primary' : 'secondary',
    data: { issue: ISSUE_LABELS[category], photoLocation: location ?? null },
  }));
}

async function handleImageAnalysis(imageData, userMessage, userId, location) {
  const city = resolveCity(location?.city);
  const photoLocation = location ?? null;
  const result = await tools.analyzeEnvironmentalImage({
    base64: imageData.base64,
    mimeType: imageData.mimeType,
    contextHint: userMessage || '',
  });

  logAction(userId, 'image_analyzed', { hasResult: !!result, city });

  // The on-device model ran successfully but found no complaint category with
  // enough certainty. Keep the photo flow useful without claiming it failed.
  if (result?.uncertain) {
    const recipient = await tools.findVerifiedRecipient({ issueCategory: 'default', city });
    const ocrText = result.visibleText?.length
      ? `\n\n📝 **Text I could read (OCR — verify against the photo):** ${result.visibleText.map((line) => `“${line}”`).join(' · ')}`
      : '';
    return {
      text: `I checked the photo, but I **couldn't identify a specific environmental problem confidently**. 🔍${ocrText}\n\nChoose what you can confirm in the photo below to start a complaint draft.\n\n${contactLines(recipient).join('\n')}`,
      cards: [],
      actions: photoIssueActions(location),
      status: 'info',
    };
  }

  // Vision unavailable — never pretend to see the photo.
  // Use details from the note if present; otherwise let the user pick the issue.
  if (!result) {
    const note = (userMessage || '').trim();
    const userDescribed = note.length > 3 && hasConcreteIssue(note);

    if (userDescribed) {
      const category = detectIssueCategory(note);
      const recipient = await tools.findVerifiedRecipient({ issueCategory: category, city });
      const isTree = /tree|mangrove|forest|cutting|felling/i.test(note);
      const cc = isTree && recipient.forestEmail ? recipient.forestEmail : null;
      const ccLabel = cc ? 'State Forest Department' : null;
      const template = buildComplaintEmailTemplate({
        situation: note,
        recipient,
        city,
        issueLabel: ISSUE_LABELS[category] || ISSUE_LABELS.other,
        hasPhoto: true,
      });

      return {
        text: `I couldn't analyze the photo automatically. I prepared a draft from your description instead. Review it and verify the recipient before sending.\n\n${contactLines(recipient).join('\n')}`,
        cards: [{
          type: 'email-preview',
          data: {
            to: recipient.email,
            recipientName: recipient.name,
            organization: recipient.organization,
            location: city,
            cc,
            ccLabel,
            portalUrl: recipient.portalUrl,
            sourceUrl: recipient.sourceUrl,
            helpline: recipient.helpline,
            subject: template.subject,
            body: template.body,
            disclaimer: recipient.disclaimer,
          },
        }],
        actions: [{
          label: '📋 Also file a report',
          action: 'FILE_REPORT_FROM_ANALYSIS',
          variant: 'secondary',
          data: { situation: note, category, photoLocation },
        }],
        status: 'preview',
      };
    }

    const recipient = await tools.findVerifiedRecipient({ issueCategory: 'default', city });
    return {
      text: `I can't analyze the photo automatically right now, and I won't guess what's in it. 🔍\n\nChoose what you can confirm in the photo below to start a complaint draft.\n\n${contactLines(recipient).join('\n')}`,
      cards: [],
      actions: photoIssueActions(location),
      status: 'info',
    };
  }

  const recipientCategory = result.category === 'plastic'
    ? 'garbage'
    : (result.category === 'burning' || result.category === 'industrial' ? 'air' : result.category);
  const recipient = await tools.findVerifiedRecipient({ issueCategory: recipientCategory, city });
  const contacts = contactLines(recipient).join('\n');
  const urgentNumber = recipient.helpline || (result.category === 'trees' ? recipient.forestHelpline : null);
  const isUrgent = result.severity === 'severe' || result.category === 'burning';

  // Turn the visual finding into a usable draft immediately. The wording says
  // "appears to show" and asks the user to verify it, so an on-device classifier
  // is never presented as infallible evidence.
  let draftCc = null;
  let draftCcLabel = null;
  const greenspaceNeedsForest = result.category === 'greenspace' &&
    /wetland|mangrove|forest/i.test(`${result.matchedPrompt || ''} ${userMessage || ''}`);
  if ((result.category === 'trees' || greenspaceNeedsForest) && recipient.forestEmail) {
    draftCc = recipient.forestEmail;
    draftCcLabel = 'State Forest / Tree Protection Department';
  } else if (['burning', 'industrial', 'air', 'construction', 'greenspace', 'water'].includes(result.category)) {
    draftCc = recipient.stateAuthority?.emails?.[0] || null;
    draftCcLabel = draftCc ? recipient.stateAuthority.name : null;
  }

  const imageSituation = [
    result.description,
    result.visibleText?.length
      ? `Text visible in the photograph (OCR — verify against the original before sending): ${result.visibleText.join(' | ')}`
      : null,
    userMessage?.trim() ? `User's note: ${userMessage.trim()}` : null,
  ].filter(Boolean).join('\n');
  const emailTemplate = buildComplaintEmailTemplate({
    situation: imageSituation,
    recipient,
    city,
    issueLabel: ISSUE_LABELS[result.category] || result.issue,
    hasPhoto: true,
  });

  const severityLabel = { mild: '🟡 Mild', moderate: '🟠 Moderate', severe: '🔴 Severe' }[result.severity] || '🟠 Moderate';
  const nextSteps = (result.actions || []).slice(0, 3).map((a) => `• ${a}`).join('\n');

  const text = [
    `🔍 **Possible finding:** ${result.issue} — ${severityLabel}`,
    result.description,
    '⚠️ This is an automated assessment. Please verify it against the photo before sending.',
    result.visibleText?.length
      ? `📝 **Text read from the photo (OCR — please verify):** ${result.visibleText.map((line) => `“${line}”`).join(' · ')}`
      : null,
    isUrgent ? (urgentNumber ? `🚨 **Happening right now?** Check the appropriate official helpline: **${urgentNumber}**.`
      : '🚨 If there is immediate danger, follow local emergency guidance. I don’t have a verified local number for this report.') : null,
    nextSteps ? `**What to do next**\n${nextSteps}` : null,
    contacts ? `**Who to send it to**\n${contacts}` : null,
    '📧 **I also prepared a complaint draft below.** Review it against the original photo and confirm the recipient before sending.',
  ].filter(Boolean).join('\n\n');

  return {
    text,
    cards: [
      {
        type: 'image-analysis',
        data: {
          ...result,
          preview: imageData.preview,
          location: city || 'Incident location not verified',
          authority: {
            organization: recipient.organization,
            email: recipient.email,
            helpline: recipient.helpline,
            portalUrl: recipient.portalUrl,
          },
        },
      },
      {
        type: 'email-preview',
        data: {
          to: recipient.email,
          recipientName: recipient.name,
          organization: recipient.organization,
          location: city,
          cc: draftCc,
          ccLabel: draftCcLabel,
          portalUrl: recipient.portalUrl,
          sourceUrl: recipient.sourceUrl,
          helpline: recipient.helpline,
          subject: emailTemplate.subject,
          body: emailTemplate.body,
          disclaimer: `${recipient.disclaimer} Automated photo classification — verify the description before sending.`,
        },
      },
    ],
    actions: [
      {
        label: '📋 File Report',
        action: 'FILE_REPORT_FROM_ANALYSIS',
        variant: 'primary',
        data: { situation: result.description, category: result.category, photoLocation },
      },
      { label: '📇 All Contacts', action: 'QUICK_ALL_CONTACTS', variant: 'secondary', data: { category: result.category, photoLocation } },
    ],
    status: 'success',
  };
}

async function handleGeneralQuestion(userMessage, conversationHistory, location, userId, { snapshot = false, web = false, webLocation, signal } = {}) {
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
      getAirQuality(lat, lng, city, { signal }),
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

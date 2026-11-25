// Agent Orchestrator — processes user messages and returns structured responses

import { detectIntent, INTENTS } from './intentEngine';
import { tools } from '../services/agentTools';
import { getChatResponse, getJsonResponse, isAIUnavailable } from '../services/geminiService';
import { buildFallbackReply, buildComplaintEmailTemplate, contactLines } from './fallbackBrain';
import { getAQIInsight, getAQICategory, geocodeCity, getAirQuality, getWeather } from '../services/environmentalData';
import { getAuthorityBundle } from '../services/authorityDirectory';
import { COLLECTIONS } from '../firebase/collections';
import { db, isFirebaseConfigured } from '../firebase/config';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';

async function logAction(userId, action, data) {
  if (!isFirebaseConfigured) return;
  try {
    await addDoc(collection(db, COLLECTIONS.AI_ACTION_LOGS), {
      userId, action, data, timestamp: Timestamp.now(),
    });
  } catch (_) {}
}

function formatDate(d) {
  if (!d) return 'TBD';
  try {
    if (d?.toDate) return format(d.toDate(), 'EEE, d MMM yyyy');
    if (d instanceof Date) return format(d, 'EEE, d MMM yyyy');
    return String(d);
  } catch { return 'TBD'; }
}

/** Resolve the best city label — dynamic, never hardcoded */
function resolveCity(city) {
  if (city && city !== 'your city' && city !== 'Unknown') return city;
  return null; // null = location unknown
}

const KNOWN_CITIES = [
  'navi mumbai', 'mumbai', 'bengaluru', 'bangalore', 'new delhi', 'delhi',
  'pune', 'hyderabad', 'chennai', 'kolkata', 'ahmedabad', 'surat', 'jaipur',
  'thiruvananthapuram', 'trivandrum', 'kochi', 'cochin', 'lucknow', 'chandigarh',
  'indore', 'bhopal', 'thane', 'nagpur', 'tadoba', 'goa', 'patna', 'bhubaneswar',
  'guwahati', 'visakhapatnam', 'vadodara', 'ghaziabad', 'ludhiana', 'agra', 'nashik',
];

// Neighbourhoods / suburbs. These are NOT geocoded on their own — a generic
// geocoder happily maps "Vashi" to a village in Russia. They are kept as a
// locality label on top of the user's current city instead.
const KNOWN_LOCALITIES = new Set([
  'vashi', 'kharghar', 'belapur', 'cbd belapur', 'nerul', 'seawoods', 'airoli', 'ulwe',
  'ghansoli', 'koparkhairane', 'sanpada', 'juinagar', 'turbhe', 'digha', 'vashi node',
  'andheri', 'bandra', 'powai', 'dadar', 'borivali', 'colaba', 'worli', 'juhu', 'kurla',
  'malad', 'goregaon', 'chembur', 'mulund', 'ghatkopar', 'vikhroli', 'bhandup', 'dahisar',
  'kandivali', 'sion', 'wadala', 'mahim', 'byculla', 'lower parel', 'bkc', 'kalyan',
]);

function findKnownLocality(value) {
  if (!value) return null;
  const lower = String(value).toLowerCase().trim();
  return [...KNOWN_LOCALITIES]
    .sort((a, b) => b.length - a.length)
    .find((locality) => lower === locality || lower.startsWith(`${locality} `) || lower.endsWith(` ${locality}`)) || null;
}

/** "in Vashi", "near Kharghar station" → "Vashi" / "Kharghar" (capitalised places only). */
function extractLocality(msg) {
  if (!msg) return null;
  const match = msg.match(/\b(?:in|at|near|behind|opposite|beside|outside|around)\s+([A-Z][A-Za-z]{2,}(?:\s+[A-Z][A-Za-z]{2,})?)\b/);
  if (!match) return null;
  const candidate = match[1].trim();
  if (/^(The|My|Our|This|That|India)$/i.test(candidate)) return null;
  return candidate;
}

/** Extract a city/place mentioned in the user message if any */
function extractMentionedCity(msg) {
  if (!msg) return null;
  const lower = msg.toLowerCase();

  // 0. Fast match for known cities anywhere in the sentence (e.g. "in bangalore majesty area tyre burning")
  const knownHit = KNOWN_CITIES.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(lower));
  if (knownHit) return knownHit;

  const ignore = new Set([
    'my city', 'my area', 'your city', 'india', 'the', 'this', 'here', 'me',
    'health', 'tips', 'weather', 'aqi', 'air', 'quality', 'pollution', 'route',
    'routes', 'waste', 'report', 'detail', 'details', 'info', 'today', 'hello', 'hi',
    'draft', 'email', 'mail', 'help', 'create', 'join', 'plan', 'impact', 'community',
    'events', 'event', 'meetup', 'meetups', 'water', 'garbage', 'complaint', 'complain',
    'recycling', 'recycle', 'compost', 'composting', 'climate', 'energy', 'electricity',
    'ok', 'okay', 'yes', 'no', 'thanks', 'thank you', 'cancel', 'done',
  ]);

  const nonPlaceWords = new Set([
    'i', 'im', 'i’m', 'ineed', 'need', 'want', 'wanna', 'help', 'assist', 'assistance',
    'ur', 'your', 'you', 'my', 'me', 'please', 'pls', 'can', 'could', 'would', 'should',
    'tell', 'give', 'show', 'explain', 'guide', 'ask', 'question', 'problem', 'issue',
    'what', 'whats', "what's", 'why', 'how', 'who', 'when', 'going', 'happening', 'up', 'do', 'does', 'is', 'are', 'am', 'about',
    'environment', 'environmental', 'recycling', 'compost', 'composting', 'climate',
    'electricity', 'energy', 'plastic', 'complaint', 'report', 'photo', 'image',
  ]);
  const looksConversational = (candidate) => {
    const phrase = candidate.toLowerCase().trim();
    if (ignore.has(phrase)) return true;
    return phrase.split(/\s+/).some((word) => nonPlaceWords.has(word));
  };

  // Only interpret "in/for/near X" as a location when the sentence is
  // actually location-dependent. This prevents "prepare for interview" or
  // "benefits of exercise" from being mistaken for city searches.
  const hasLocationContext = /\b(weather|aqi|air quality|pollution|map|location|complaint|report|authority|garbage|dumping|burning|sewage|naala|nala|tree|parking|event|meetup|route|nearby)\b/i.test(msg);
  if (hasLocationContext) {
    const prepMatch = msg.match(/\b(?:in|of|at|for|near)\s+([A-Za-z][A-Za-z\s]{1,30}?)(?=\s*(?:\?|!|\.|,|right now|today|weather|aqi|air|pollution|detail|details|info|$))/i);
    if (prepMatch) {
      const candidate = prepMatch[1].trim();
      if (!looksConversational(candidate)) return candidate;
    }
  }

  // Topic-first form: "weather San Francisco", "map Vashi station".
  const topicMatch = msg.match(/^(?:show\s+)?(?:weather|aqi|air quality|map|location|details?|info)(?:\s+(?:in|for|of))?\s+([A-Za-z][A-Za-z\s]{1,30})$/i);
  if (topicMatch) {
    const candidate = topicMatch[1].trim();
    if (!looksConversational(candidate)) return candidate;
  }

  // 2. Leading city form: "and bangalore", "bangalore detail", "delhi aqi", "pune weather", "mumbai"
  const cleaned = msg.trim().replace(/^(?:and|also|now|what about|how about|about|for|check)\s+/i, '');
  const leadMatch = cleaned.match(/^([A-Za-z][A-Za-z\s]{1,25}?)(?:\s+(?:detail|details|info|aqi|weather|pollution|air quality|report|events|routes))?$/i);
  if (leadMatch) {
    const candidate = leadMatch[1].trim();
    if (candidate.length >= 3 && !looksConversational(candidate)) return candidate;
  }

  return null;
}

export async function processMessage(userMessage, conversationHistory, user, location, imageData, pendingAction) {
  const userId = user?.uid || 'anonymous';
  let lat = location?.lat;
  let lng = location?.lng;
  let city = resolveCity(location?.city);
  let hasExplicitCity = false;
  let failedCityLookup = null;

  let localityLabel = null;
  const mentionedCity = extractMentionedCity(userMessage);
  const localityCandidate = extractLocality(userMessage) || mentionedCity;
  const knownLocality = findKnownLocality(localityCandidate) || findKnownLocality(mentionedCity);

  if (knownLocality) {
    // A suburb we know — keep it as a label, don't trust a global geocoder with it.
    localityLabel = localityCandidate || mentionedCity || knownLocality;
  } else if (mentionedCity) {
    const geo = await geocodeCity(mentionedCity);
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
      city = geo.city;
      hasExplicitCity = true;
    } else {
      failedCityLookup = mentionedCity;
    }
  }

  if (imageData?.base64) {
    return handleImageAnalysis(imageData, userMessage, userId, {
      ...location, lat, lng, city, locality: localityLabel,
    });
  }

  const explicitlyAskedForLocation = /\b(weather|aqi|air quality|map|maps|location|locate|coordinates|city|where is)\b/i.test(userMessage);
  if (failedCityLookup && explicitlyAskedForLocation && !pendingAction && userMessage.trim().split(/\s+/).length <= 8) {
    return {
      text: `I couldn't locate **${failedCityLookup}** reliably, so I won't reuse your previous city or guess. Please check the spelling, or type it as **City, State/Region, Country**.`,
      cards: [],
      actions: [{ label: '📍 Share My Location', action: 'REQUEST_LOCATION', variant: 'secondary' }],
      status: 'needs_location',
    };
  }

  const { intent, confidence, entities, suggestedTool, requiresConfirmation } = detectIntent(
    userMessage, conversationHistory
  );

  logAction(userId, 'intent_detected', { intent, confidence, message: userMessage });

  try {
    let result;

    // Continue an in-progress email draft: user is answering clarifying questions.
    // Prevents each reply from being treated as a fresh general question (which caused fabricated answers).
    if (pendingAction?.type === 'DRAFT_EMAIL_AWAITING_INFO') {
      result = await handleCreateEmail(userMessage, conversationHistory, userId, city);
    } else {
      switch (intent) {
      case INTENTS.GET_AIR_QUALITY:
        result = await handleAirQuality(lat, lng, city, userId);
        break;

      case INTENTS.GET_WATER_QUALITY:
        result = await handleWaterQuality(city);
        break;

      case INTENTS.GET_WEATHER:
        result = await handleWeather(lat, lng, city, userId);
        break;

      case INTENTS.FIND_EVENTS:
        result = await handleFindEvents(lat, lng, city, entities?.category, userId);
        break;

      case INTENTS.JOIN_EVENT:
        result = handleJoinEventPrompt();
        break;

      case INTENTS.CREATE_EVENT:
        result = await handleCreateEventPrompt(userMessage, userId, city, lat, lng);
        break;

      case INTENTS.CREATE_REPORT:
        result = await handleCreateReport(userMessage, userId, { lat, lng, city, locality: localityLabel });
        break;

      case INTENTS.CREATE_EMAIL:
        result = await handleCreateEmail(userMessage, conversationHistory, userId, city);
        break;

      case INTENTS.GET_AUTHORITY_CONTACTS:
        result = await handleAuthorityContacts(userMessage, { city, locality: localityLabel });
        break;

      case INTENTS.GET_COMMUNITY:
        result = await handleCommunityFeed(userId);
        break;

      case INTENTS.GET_DAILY_PLAN:
        result = await handleDailyPlan(userId, lat, lng);
        break;

      case INTENTS.GET_HEALTH_TIPS:
        result = await handleHealthTips(lat, lng, city, userId);
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

      default:
        result = await handleGeneralQuestion(userMessage, conversationHistory, { lat, lng, city, locality: localityLabel, hasExplicitCity }, userId);
        break;
      }
    }

    if (hasExplicitCity && lat && lng && city) {
      result.resolvedLocation = { lat, lng, city };
    }
    return result;
  } catch (err) {
    console.error('Orchestrator error:', err);
    logAction(userId, 'error', { intent, error: err.message });
    return {
      text: "I encountered an issue processing that request. Please try again.",
      cards: [], actions: [], status: 'error',
    };
  }
}

// ===== HANDLERS =====

async function handleAirQuality(lat, lng, city, userId) {
  if (!lat || !lng) {
    return {
      text: city
        ? `I need your GPS coordinates to fetch live air quality for **${city}**. Please share your location!`
        : "Please share your location so I can fetch real-time air quality for your area.",
      cards: [],
      actions: [{ label: '📍 Share Location', action: 'REQUEST_LOCATION', variant: 'primary' }],
      status: 'needs_location',
    };
  }

  const aqiData = await getAirQuality(lat, lng, city).catch(() => null);
  const displayCity = city || aqiData?.city || `(${lat.toFixed(2)}, ${lng.toFixed(2)})`;

  if (!aqiData) {
    return {
      text: `I couldn't reach the live air-quality feed for **${displayCity}** just now 🌬️\n\nTry again in a minute, or check **https://aqicn.org/map/** / the CPCB **Sameer** app. If you can see smoke, dust or burning nearby, that itself is worth reporting — want me to give you the local authority?`,
      cards: [],
      actions: [{ label: '📋 Report Air Issue', action: 'QUICK_REPORT', variant: 'primary' }],
      status: 'unavailable',
    };
  }

  const insight = getAQIInsight(aqiData);
  logAction(userId, 'aqi_fetched', { city: displayCity, aqi: aqiData.aqi });

  return {
    text: `Hey! I just checked the live air quality for **${aqiData.city || displayCity}** — here's how it's looking right now 🌬️`,
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
  const temp = Number(weather?.temp);
  const humidity = Number(weather?.humidity);
  const wind = Number(weather?.windSpeed);

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

async function handleWeather(lat, lng, city, userId) {
  if (!lat || !lng) {
    return {
      text: "I need your location to get weather data. Please share your location!",
      cards: [],
      actions: [{ label: '📍 Share Location', action: 'REQUEST_LOCATION', variant: 'primary' }],
      status: 'needs_location',
    };
  }

  const weather = await getWeather(lat, lng).catch(() => null);
  const displayCity = city || `(${lat.toFixed(2)}, ${lng.toFixed(2)})`;

  if (!weather) {
    return {
      text: `Weather data for **${displayCity}** isn't available right now. Add your OpenWeatherMap API key to .env to enable this feature.`,
      cards: [],
      actions: [],
      status: 'unavailable',
    };
  }

  logAction(userId, 'weather_fetched', { city: displayCity });
  const precautions = getWeatherPrecautions(weather);

  return {
    text: `Here's the live weather in **${displayCity}** right now. 🌤️\n\n🌡️ Temperature: **${weather.temp?.toFixed(1)}°C** (feels like ${weather.feelsLike?.toFixed(1)}°C)\n💧 Humidity: ${weather.humidity}%\n💨 Wind: ${weather.windSpeed} m/s\n☁️ Conditions: ${weather.description}\n\n🛡️ **Precautions based on the current reading**\n${precautions.map((tip) => `• ${tip}`).join('\n')}\n\n_These are current-condition precautions, not a severe-weather warning or medical advice._`,
    cards: [],
    actions: [
      { label: '🌬️ Check AQI', action: 'QUICK_AQI', variant: 'secondary' },
      { label: '💊 AQI Health Tips', action: 'QUICK_HEALTH_TIPS', variant: 'secondary' },
    ],
    status: 'success',
  };
}

async function handleFindEvents(lat, lng, city, category, userId) {
  const events = await tools.getNearbyMeetups({ lat, lng, category, limit: 8 });
  const displayCity = city || 'your area';
  logAction(userId, 'events_fetched', { count: events.length, category, city: displayCity });

  if (!events || events.length === 0) {
    return {
      text: `No upcoming eco-meetups found for **${displayCity}** right now 😕 Be the first to organize one!`,
      cards: [],
      actions: [{ label: '➕ Create Meetup', action: 'CREATE_EVENT', variant: 'primary' }],
      status: 'empty',
    };
  }

  return {
    text: `Found **${events.length}** upcoming eco-event${events.length > 1 ? 's' : ''} near **${displayCity}**! 🌍`,
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

async function handleCreateEventPrompt(userMessage, userId, city, lat, lng) {
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
  const locality = location?.locality || null;
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
      ? (recipient.helpline || recipient.forestHelpline)
      : null;
    const contactBlock = [
      `🏛️ **${recipient.organization}**`,
      recipient.email && recipient.email.includes('@') ? `📧 Email: ${recipient.email}` : null,
      recipient.helpline ? `📞 Helpline: ${recipient.helpline}` : null,
      recipient.whatsapp ? `💬 WhatsApp: ${recipient.whatsapp}` : null,
      recipient.portalUrl ? `🌐 Portal: ${recipient.portalUrl}` : null,
      forestLine,
    ].filter(Boolean).join('\n');

    return {
      text: `Here's exactly where to send a complaint for **${city}**:\n\n${contactBlock}\n\n**To make it count:** write it down with the **exact location, date and time**, attach **photos/video**, and note the **reference number** you get back.${immediateNumber ? ` If it's happening right now, call **${immediateNumber}** first so the responsible team can inspect.` : recipient.jurisdiction === 'outside-india' ? ' Use the local government or police website to verify the correct emergency number; I will not guess one.' : ' If there is fire or immediate danger to life, call **112**; otherwise use the official portal for a tracked complaint.'}\n\nWant me to draft the email? 📧`,
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
  let finalLocation = locality ? `${locality}, ${city}` : city;
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
    if (structured.locality && !/unknown|not specified/i.test(structured.locality)) {
      const loc = String(structured.locality).slice(0, 120);
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
    isTreeOrMangrove && recipient.forestEmail
      ? `🌿 **Forest / Tree Protection Cell CC:** ${recipient.forestEmail}${recipient.forestHelpline ? ` (Helpline: ${recipient.forestHelpline})` : ''}`
      : (isTreeOrMangrove && recipient.forestHelpline ? `🌿 **State Forest Helpline (24/7):** ${recipient.forestHelpline}` : null),
  ].filter(Boolean).join('\n');

  const urgentHelpline = !/emergency only/i.test(recipient.helpline || '')
    ? (recipient.helpline || recipient.forestHelpline)
    : null;

  const proofHint = isTreeOrMangrove
    ? '📸 *Got a photo? Attach it — it speeds up inspection. **Draft Email** will also CC the Forest Cell.*'
    : '📸 *Got a photo? Attach it — evidence makes the complaint much harder to ignore.*';

  return {
    text: `Thank you for speaking up for **${finalLocation}**! 🙌 Reporting this really makes a difference in our community.${urgentHelpline ? `\n\n🚨 **Happening right now?** Call **${urgentHelpline}** so the responsible local team can inspect it.` : recipient.jurisdiction === 'outside-india' ? '\n\n🚨 Verify the correct emergency number on the local government or police website; none is guessed here.' : '\n\n🚨 If there is fire, a hazardous leak, or immediate danger to life, call **112**; otherwise submit the written complaint below.'}\n\n${authorityLines}\n\n${proofHint}`,
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
  const city = resolveCity(location?.city) || 'your area';
  const locality = location?.locality || null;
  const place = locality ? `${locality}, ${city}` : city;

  const bundle = getAuthorityBundle(city);
  const recipient = await tools.findVerifiedRecipient({
    issueCategory: detectIssueCategory(userMessage),
    city,
  });
  if (recipient.jurisdiction === 'outside-india') {
    return {
      text: `I can map **${place}** and fetch live environmental data, but I do **not** have a verified authority directory for this country yet. I won't show Indian contacts or invent a local email.\n\nUse the official city/regional government website and look for its **environment, sanitation, public works, or police** complaint page. If you share an official URL, I can help explain the form and draft the complaint text without changing any contact details.`,
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
  const localLines = [`📍 **${recipient.organization}**`];
  if (recipient.email && recipient.email.includes('@')) localLines.push(`📧 ${recipient.email}`);
  else localLines.push('📧 No verified email published — use the portal form');
  if (recipient.helpline) localLines.push(`📞 ${recipient.helpline}`);
  if (recipient.whatsapp) localLines.push(`💬 WhatsApp: ${recipient.whatsapp}`);
  if (recipient.portalUrl) localLines.push(`🌐 ${recipient.portalUrl}`);
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

async function handleCreateEmail(userMessage, conversationHistory, userId, city) {
  const recentUserMessages = (conversationHistory || [])
    .filter((m) => m.role === 'user' && m.text)
    .slice(-4)
    .map((m) => m.text);

  const currentHasIssue = hasConcreteIssue(userMessage);
  const historyIssueMsg = [...recentUserMessages].reverse().find((t) => hasConcreteIssue(t));
  // Only reject historyIssueMsg if it explicitly names a DIFFERENT known city than the current city
  const cityLower = (city || '').toLowerCase();
  const historyCity = historyIssueMsg ? extractMentionedCity(historyIssueMsg) : null;
  const historyMatchesCurrentCity = !historyCity || !cityLower ||
    cityLower.includes(historyCity.toLowerCase()) ||
    (historyCity.toLowerCase() === 'bangalore' && cityLower.includes('bengaluru')) ||
    (historyCity.toLowerCase() === 'trivandrum' && cityLower.includes('thiruvananthapuram'));

  // If user hasn't explained a concrete issue/situation for the current city yet, ask clarifying questions
  if (!currentHasIssue && (!historyIssueMsg || !historyMatchesCurrentCity)) {
    const authInfo = await tools.findVerifiedRecipient({ issueCategory: detectIssueCategory(userMessage), city });
    const chatHistory = (conversationHistory || []).map((m) => ({
      role: m.role,
      text: m.text || '',
    }));
    chatHistory.push({ role: 'user', text: userMessage });

    const aiAsk = await getChatResponse(
      chatHistory,
      `User location: ${city || 'not specified'}.
Verified local authority: ${authInfo.organization}, Email: ${authInfo.email}, Portal: ${authInfo.portalUrl}, Helpline: ${authInfo.helpline || 'N/A'}.
Instruction: The user wants to draft an email/complaint ("${userMessage}") but has NOT explained their situation yet.
Ask concise, friendly questions to understand their situation (what happened, where, since when, and how it affects them — only what is needed).
Do NOT generate an email draft, do NOT invent any example scenario, and do NOT invent any email address.`,
      { maxTokens: 300, timeoutMs: 20000 }
    );

    const clarifyingQuestion = isAIUnavailable(aiAsk)
      ? `Sure — I'll draft it for **${city || 'your area'}**. 📧 Quick check so the email is accurate:\n\n• **What exactly is happening?** (garbage dumping / burning / sewage overflow / tree cutting / other)\n• **Where?** — building, street or landmark\n• **Since when**, and who is affected?\n\nGive me even one line and I'll write the full complaint with the right authority's email and portal.`
      : aiAsk;

    return {
      text: clarifyingQuestion,
      cards: [],
      actions: [],
      status: 'needs_info',
      pending: 'DRAFT_EMAIL_AWAITING_INFO',
    };
  }

  const situationText = currentHasIssue ? userMessage : historyIssueMsg;
  const issueCategory = detectIssueCategory(situationText);
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

  const prompt = `Draft a formal, concise civic complaint email to ${recipient.name} (${recipient.organization}) in ${city || 'the user\'s city'} based STRICTLY on the user's situation below.
Do NOT invent any dates, street names, phone numbers, or facts not mentioned by the user. If a detail is missing, use a clear bracketed placeholder like [Your Area/Street] or [Your Name].
Keep it under 180 words, polite and specific, and end with a clear request for inspection and action.

User's situation: "${situationText}"

Respond ONLY in valid JSON: {"subject":"...","body":"..."}`;

  const drafted = await getJsonResponse(prompt, '', { timeoutMs: 25000, maxTokens: 900 });
  let subject = drafted?.subject ? String(drafted.subject).slice(0, 160) : `Environmental complaint — ${city || 'Local Area'}`;
  let body = drafted?.body ? String(drafted.body) : null;

  // Model unreachable? Build a factual template from the user's own words.
  // Placeholders are intentional — nothing is invented on their behalf.
  if (!body) {
    const template = buildComplaintEmailTemplate({
      situation: situationText,
      recipient,
      city,
      cc,
      ccLabel,
      issueLabel: ISSUE_LABELS[issueCategory],
      hasPhoto: /photo|image|picture|📸/i.test(situationText),
    });
    subject = template.subject;
    body = template.body;
  }

  const draftData = {
    to: recipient.email,
    recipientName: recipient.name,
    organization: recipient.organization,
    cc,
    ccLabel,
    portalUrl: recipient.portalUrl,
    helpline: recipient.helpline,
    subject,
    body,
    disclaimer: recipient.disclaimer,
  };

  const ccText = cc ? ` and CC'd the ${ccLabel} (${cc})` : '';
  return {
    text: `Got it! I've put together this complaint email to **${recipient.name}**${ccText} 📧 Take a look and tap **Open in Gmail** or copy when ready:`,
    cards: [{ type: 'email-preview', data: draftData }],
    actions: [],
    status: 'preview',
  };
}

async function handleCommunityFeed(userId) {
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

async function handleDailyPlan(userId, lat, lng) {
  const plan = await tools.getDailyActionPlan({ userId, lat, lng });

  return {
    text: "Here's your personalized eco-action plan for today! 🌱 Small actions make a big difference:",
    cards: [{ type: 'daily-plan', data: { actions: plan } }],
    actions: [],
    status: 'success',
  };
}

async function handleHealthTips(lat, lng, city, userId) {
  const displayCity = city || 'your area';
  const [aqiData, weatherData] = lat && lng
    ? await Promise.all([
        getAirQuality(lat, lng, city).catch(() => null),
        getWeather(lat, lng).catch(() => null),
      ])
    : [null, null];

  const aqiContext = aqiData
    ? `Live AQI in ${displayCity}: ${aqiData.aqi} (${getAQICategory(aqiData.aqi).label}), PM2.5: ${aqiData.pm25} µg/m³, PM10: ${aqiData.pm10} µg/m³.`
    : `Live AQI for ${displayCity} is currently unavailable.`;
  const weatherContext = weatherData
    ? `Current weather in ${displayCity}: ${weatherData.temp}°C, ${weatherData.description}, humidity ${weatherData.humidity}%.`
    : '';

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
    text: aiText,
    cards: [],
    actions: [{ label: '🌬️ View Full AQI Details', action: 'QUICK_AQI', variant: 'secondary' }],
    status: 'success',
  };
}

async function handleRoutes(city, lat, lng) {
  const displayCity = city || 'your area';
  const prompt = `Suggest practical low-pollution commuting tips, green corridors, and public transit options specifically for ${displayCity}. Keep it concise with bullet points.`;
  const aiText = await getChatResponse(
    [{ role: 'user', text: prompt }],
    `Target city: ${displayCity}${lat && lng ? ` (${lat.toFixed(4)}, ${lng.toFixed(4)})` : ''}.`
  );

  const text = isAIUnavailable(aiText)
    ? `🗺️ **Getting around ${displayCity} with less pollution:**\n\n• Prefer **metro/local train** for the long leg, then walk or cycle the last kilometre.\n• Walk or cycle on **internal/side lanes** instead of main-road footpaths during peak traffic.\n• Use **carpooling or shared autos** for repeat errands; combine trips into one loop.\n• Travel **before 8 AM or after 8 PM** when traffic and roadside pollution are lower.\n• If you must drive, keep tyres inflated and switch the engine off at long signals.\n\nHere's your area on the map:`
    : aiText;

  return {
    text,
    cards: [{ type: 'map', data: { lat, lng, city: displayCity, label: `${displayCity} — Your Area`, query: displayCity } }],
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

async function handleImageAnalysis(imageData, userMessage, userId, location) {
  const city = resolveCity(location?.city);
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
      text: `I checked the photo, but I **couldn't identify a specific environmental problem confidently** — so I won't invent one. 🔍${ocrText}\n\nIf the issue is visible but subtle, tap the closest option below (or type one sentence about what I should focus on) and I'll produce the full complaint draft immediately.\n\n${contactLines(recipient).join('\n')}`,
      cards: [],
      actions: [
        { label: '🗑️ Garbage dumping', action: 'IMAGE_ISSUE_GARBAGE', variant: 'primary' },
        { label: '🔥 Open burning', action: 'IMAGE_ISSUE_BURNING', variant: 'secondary' },
        { label: '💧 Sewage overflow', action: 'IMAGE_ISSUE_SEWAGE', variant: 'secondary' },
        { label: '🌳 Tree cutting', action: 'IMAGE_ISSUE_TREES', variant: 'secondary' },
      ],
      status: 'info',
    };
  }

  // Vision unavailable — never pretend to see the photo.
  // If the user described the issue in the same message, use their own words and
  // hand them a ready-to-send draft. Otherwise let them pick with one tap.
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
        cc,
        ccLabel,
        issueLabel: ISSUE_LABELS[category] || ISSUE_LABELS.other,
        hasPhoto: true,
      });

      return {
        text: `I couldn't read the photo automatically, but I've used your description to prepare the complaint. 📧 **Add your name, address and phone number, then send it.**\n\n${contactLines(recipient).join('\n')}`,
        cards: [{
          type: 'email-preview',
          data: {
            to: recipient.email,
            recipientName: recipient.name,
            organization: recipient.organization,
            cc,
            ccLabel,
            portalUrl: recipient.portalUrl,
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
          data: { situation: note, category },
        }],
        status: 'preview',
      };
    }

    const recipient = await tools.findVerifiedRecipient({ issueCategory: 'default', city });
    return {
      text: `I can't analyse the photo automatically right now — no vision model is connected, and I won't guess what's in it. 🔍\n\n**Tap what the photo shows** and I'll immediately write the full complaint email for **${city || 'your area'}**, ready to send:\n\n${contactLines(recipient).join('\n')}`,
      cards: [],
      actions: [
        { label: '🗑️ Garbage dumping', action: 'IMAGE_ISSUE_GARBAGE', variant: 'primary' },
        { label: '🔥 Open burning', action: 'IMAGE_ISSUE_BURNING', variant: 'secondary' },
        { label: '💧 Sewage overflow', action: 'IMAGE_ISSUE_SEWAGE', variant: 'secondary' },
        { label: '🌳 Tree cutting', action: 'IMAGE_ISSUE_TREES', variant: 'secondary' },
      ],
      status: 'info',
    };
  }

  const recipientCategory = result.category === 'plastic'
    ? 'garbage'
    : (result.category === 'burning' || result.category === 'industrial' ? 'air' : result.category);
  const recipient = await tools.findVerifiedRecipient({ issueCategory: recipientCategory, city });
  const contacts = contactLines(recipient).join('\n');
  const urgentNumber = recipient.helpline || recipient.forestHelpline || '112';
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
    cc: draftCc,
    ccLabel: draftCcLabel,
    issueLabel: ISSUE_LABELS[result.category] || result.issue,
    hasPhoto: true,
  });

  const severityLabel = { mild: '🟡 Mild', moderate: '🟠 Moderate', severe: '🔴 Severe' }[result.severity] || '🟠 Moderate';
  const nextSteps = (result.actions || []).slice(0, 3).map((a) => `• ${a}`).join('\n');

  const text = [
    `🔍 **What I see:** ${result.issue} — ${severityLabel} (${Math.round((result.confidence || 0.6) * 100)}% confidence)`,
    result.description,
    result.needsUserVerification ? '⚠️ **Please verify this finding before sending** — the photo was classified automatically on your device.' : null,
    result.visibleText?.length
      ? `📝 **Text read from the photo (OCR — please verify):** ${result.visibleText.map((line) => `“${line}”`).join(' · ')}`
      : null,
    isUrgent ? `🚨 **Happening right now?** Call **${urgentNumber}** immediately — the flying squad can stop it on the spot.` : null,
    nextSteps ? `**What to do next**\n${nextSteps}` : null,
    contacts ? `**Who to send it to**\n${contacts}` : null,
    '📧 **I also prepared a complaint draft below.** Fill in the bracketed personal/location details, attach the original photo, and review it before opening Gmail.',
  ].filter(Boolean).join('\n\n');

  return {
    text,
    cards: [
      {
        type: 'image-analysis',
        data: {
          ...result,
          preview: imageData.preview,
          location: city || 'Your Location',
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
          cc: draftCc,
          ccLabel: draftCcLabel,
          portalUrl: recipient.portalUrl,
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
        data: { situation: result.description, category: result.category },
      },
      { label: '📇 All Contacts', action: 'QUICK_ALL_CONTACTS', variant: 'secondary', data: { category: result.category } },
    ],
    status: 'success',
  };
}

async function handleGeneralQuestion(userMessage, conversationHistory, location, userId) {
  const city = resolveCity(location?.city);
  const lat = location?.lat;
  const lng = location?.lng;
  const locality = location?.locality;
  const hasExplicitCity = Boolean(location?.hasExplicitCity);
  const lower = (userMessage || '').toLowerCase();
  const isOpenEndedHelp = /^(?:i\s*need|ineed|need|can you|could you|please|pls)?.{0,18}\bhelp(?:\s+me)?[.!?]*$/i.test(lower.trim());
  const isCasualSmallTalk = /^(?:what'?s?\s+(?:going(?:\s+on)?|up|new)|whatsgoing|how(?:'s| is|s)\s+it\s+going|how\s+are\s+you|sup|wassup|wyd)[.!?]*$/i.test(lower.trim());
  const isPersonalConversation = /\b(not (?:good|okay|ok|well)|bad day|feeling (?:sad|low|down|stressed|anxious|lonely|tired)|i(?:'m| am) (?:sad|upset|stressed|anxious|lonely|tired)|need to talk)\b/i.test(lower);

  const wantsLiveData = /\b(aqi|air|weather|temperature|pollution|mausam|garmi|humid|rain|health|mask|smog)\b/i.test(lower);
  const needsWebSearch = /\b(search (?:the )?web|google (?:this|it|for)|look (?:this )?up|latest|recent news|today'?s news|current (?:rule|rules|law|laws|policy|policies|deadline|official update)|what happened today|2026 update)\b/i.test(lower);
  const complaintContext = /\b(complain|complaint|grievance|report|portal|authority|email|contact|call|helpline|forest|mangrove|midc|mpcb|nmmc|bmc|mcd|bbmp|steps|burning|buring|garbage|sewage|tree|cutting|kachra|shikayat|kisko|kahan)\b/i.test(userMessage);

  let liveAqi = null;
  let liveWeather = null;
  if (lat && lng && (hasExplicitCity || wantsLiveData)) {
    [liveAqi, liveWeather] = await Promise.all([
      getAirQuality(lat, lng, city).catch(() => null),
      getWeather(lat, lng).catch(() => null),
    ]);
  }

  const mapPlace = locality ? `${locality}, ${city || ''}`.replace(/,\s*$/, '') : city;
  const wantsMap = /\b(map|maps|show location|where is|locate)\b/i.test(lower);
  if (wantsMap && mapPlace && lat && lng) {
    return {
      text: `🗺️ Here is **${mapPlace}** on the map. The link opens a live Google Maps search, so you can zoom to the exact street or landmark.`,
      cards: [{ type: 'map', data: { lat, lng, city: mapPlace, label: mapPlace, query: mapPlace } }],
      actions: [
        { label: '🌬️ Check AQI', action: 'QUICK_AQI', variant: 'secondary' },
        { label: '📇 Authority Contacts', action: 'QUICK_ALL_CONTACTS', variant: 'secondary' },
      ],
      status: 'success',
    };
  }

  // A bare city name ("Navi Mumbai", "Pune", "Delhi") is a location switch,
  // not an open-ended AI question. Answer it directly from live APIs so this
  // route still works when every language-model provider is offline.
  const isCityOnly = hasExplicitCity && userMessage.trim().split(/\s+/).filter(Boolean).length <= 3;
  if (isCityOnly) {
    const cityParts = String(city || '').split(',').map((part) => part.trim()).filter(Boolean);
    const outsideIndia = cityParts.length >= 3 && !/\bindia\b/i.test(cityParts[cityParts.length - 1]);
    const lines = [`📍 **${city} — live environmental snapshot**`];

    if (liveAqi) {
      const category = getAQICategory(liveAqi.aqi);
      lines.push(`🌬️ **AQI ${liveAqi.aqi} — ${category.label}** (PM2.5: ${liveAqi.pm25 ?? '—'} µg/m³, PM10: ${liveAqi.pm10 ?? '—'} µg/m³)`);
    } else {
      lines.push('🌬️ Live air-quality data is temporarily unavailable.');
    }

    if (liveWeather) {
      lines.push(`🌤️ **${liveWeather.temp}°C**, ${liveWeather.description}; feels like ${liveWeather.feelsLike}°C, humidity ${liveWeather.humidity}%, wind ${liveWeather.windSpeed} m/s`);
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

  let context = lat || city
    ? `Optional location context: ${city || 'Unknown city'} (coordinates: ${lat?.toFixed(4)}, ${lng?.toFixed(4)}). Use this ONLY when the user's request is location-dependent. Do not mention the city, AQI, weather, civic authorities, or environmental features in an unrelated answer.`
    : 'User location: not shared yet. If location-specific info is needed, ask the user to share their location.';

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
  const recipientNeeded = complaintContext || /\b(complain|complaint|grievance|report|portal|authority|email|contact|helpline|forest|mangrove|midc|mpcb|nmmc|bmc|mcd|bbmp|steps|burning|buring|garbage|sewage|tree|cutting)\b/i.test(recentCombined);
  if (recipientNeeded) {
    recipient = await tools.findVerifiedRecipient({ issueCategory: detectIssueCategory(recentCombined), city });
    context += `\nVerified local authority for ${city || 'this area'}: ${recipient.organization}, Email: ${recipient.email}, Portal: ${recipient.portalUrl}, Helpline: ${recipient.helpline || 'N/A'}, National Portal: ${recipient.nationalPortal}.`;
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

  if (liveAqi) {
    context += `\nLive AQI for ${city}: ${liveAqi.aqi} (PM2.5: ${liveAqi.pm25} µg/m³, PM10: ${liveAqi.pm10} µg/m³, source: ${liveAqi.source}).`;
  }
  if (liveWeather) {
    context += `\nLive Weather for ${city}: ${liveWeather.temp}°C (feels like ${liveWeather.feelsLike}°C), ${liveWeather.description}, humidity ${liveWeather.humidity}%, wind ${liveWeather.windSpeed} m/s.`;
  }
  if (hasExplicitCity && userMessage.trim().split(/\s+/).length <= 3) {
    context += `\nInstruction: The user only entered the city name "${city}". Reply concisely with ONLY the live weather & AQI summary for ${city} and ask how you can help them there. Do NOT generate email drafts or unrelated content from earlier turns.`;
  }
  if (needsWebSearch) {
    context += '\nInstruction: This question requires current web information. Use Google Search grounding, distinguish published facts from uncertainty, and support the answer with the returned sources. Do not answer from memory if search is unavailable.';
  }

  const chatHistory = conversationHistory.map((m) => ({
    role: m.role,
    text: m.text || '',
  }));
  chatHistory.push({ role: 'user', text: userMessage });

  const responseText = await getChatResponse(chatHistory, context, { useSearch: needsWebSearch });

  // Model unreachable → answer from verified data instead of a generic error.
  if (isAIUnavailable(responseText)) {
    if (needsWebSearch) {
      return {
        text: `I can't verify a current web answer right now, so I won't guess. 🔎\n\nAdd a valid **Gemini API key** to enable Google Search grounding, or share an official URL and I can help read and explain it.`,
        cards: [],
        actions: [],
        status: 'unavailable',
      };
    }
    logAction(userId, 'general_chat_fallback', { message: userMessage.slice(0, 50), city });
    return buildFallbackReply({
      message: userMessage,
      location: { city, lat, lng },
      history: conversationHistory,
      recipient,
      aqi: liveAqi,
      weather: liveWeather,
      isComplaintContext: complaintContext,
    });
  }

  const cards = [];
  const wantsCityOverview = hasExplicitCity && (
    userMessage.trim().split(/\s+/).length <= 3 ||
    /\b(detail|details|info|aqi|air|weather|climate|status)\b/i.test(userMessage)
  );

  if (liveAqi && wantsCityOverview) {
    cards.push({ type: 'aqi', data: { ...liveAqi, insight: getAQIInsight(liveAqi) } });
  }

  logAction(userId, 'general_chat', { message: userMessage.slice(0, 50) });

  return {
    text: responseText,
    cards,
    actions: [],
    status: 'success',
  };
}

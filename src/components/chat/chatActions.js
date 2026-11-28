import { RECORD_ACTIONS } from './chatRecords.js';

const ACTION_PROMPTS = {
  REQUEST_LOCATION: 'Use my location',
  QUICK_AQI: 'What is the air quality right now?',
  QUICK_WEATHER_PRECAUTIONS: 'What is the current weather and what precautions should I take?',
  QUICK_SMOG_PLAN: 'Create my personalized winter smog and clean-air action plan',
  QUICK_HEALTH_TIPS: 'Give me health tips for today\'s air quality',
  QUICK_REPORT: 'I want to file an environmental complaint',
  QUICK_WATER_REPORT: 'I want to report a water pollution issue',
  QUICK_FIND_EVENTS: 'Find eco-meetups near me',
  QUICK_DRAFT_EMAIL: 'Draft a complaint email to municipal corporation',
  CREATE_EVENT: 'I want to create a community eco-event',
};

export function createWelcomeMessage(user) {
  const name = user?.displayName ? ` ${user.displayName}` : '';
  return {
    id: 'welcome',
    role: 'ai',
    text: (user?.offline ? 'Cloud sign-in is unavailable. You are using Guest mode on this device. Exit Guest mode to try account sign-in again.\n\n' : '') + `👋 Hi${name}! I'm **EcoPulse AI**, I can help your household or community plan for smog. Choose **Smog Action Plan** for commute and indoor-air advice and the impact of each choice.\n\nType a city name for a local snapshot, or say **“Set my city to…”** to save your choice.`,
    cards: [],
    actions: [
      { label: '🌫️ Smog Action Plan', action: 'QUICK_SMOG_PLAN', variant: 'primary' },
      { label: '📍 Share My Location', action: 'REQUEST_LOCATION', variant: 'secondary' },
      { label: '🌬️ Check AQI', action: 'QUICK_AQI', variant: 'secondary' },
      { label: '🌦️ Weather & Precautions', action: 'QUICK_WEATHER_PRECAUTIONS', variant: 'secondary' },
      { label: '📣 Make a Complaint', action: 'START_COMPLAINT', variant: 'secondary' },
      { label: '📷 Understand a Photo', action: 'OPEN_IMAGE_PICKER', variant: 'secondary' },
      { label: '📇 Authority Contacts', action: 'QUICK_ALL_CONTACTS', variant: 'secondary' },
      { label: '🗺️ Map Any Place', action: 'START_MAP_SEARCH', variant: 'secondary' },
    ],
    timestamp: new Date().toISOString(),
  };
}

const COMPLAINT = {
  text: 'I’m with you. Tell me **what happened, where, and since when**—one natural sentence is enough. Or choose the closest issue below. I’ll identify the authority, give verified contacts, and prepare a draft before anything is sent.',
  cards: [],
  actions: [
    { label: '🗑️ Garbage / Dumping', action: 'START_COMPLAINT_CATEGORY', variant: 'secondary', data: { prompt: 'I need to report garbage or material dumping in my area' } },
    { label: '🔥 Waste Burning', action: 'START_COMPLAINT_CATEGORY', variant: 'secondary', data: { prompt: 'I need to report open waste burning and smoke in my area' } },
    { label: '💧 Polluted Naala / Sewage', action: 'START_COMPLAINT_CATEGORY', variant: 'secondary', data: { prompt: 'I need to report a polluted naala or sewage overflow in my area' } },
    { label: '🌳 Tree / Land Filling', action: 'START_COMPLAINT_CATEGORY', variant: 'secondary', data: { prompt: 'I need to report tree damage or illegal land filling in my area' } },
    { label: '🚗 Road Blocked by Parking', action: 'START_COMPLAINT_CATEGORY', variant: 'secondary', data: { prompt: 'A parked vehicle is blocking a road or footpath in my area' } },
    { label: '📷 Use a Photo', action: 'OPEN_IMAGE_PICKER', variant: 'primary' },
  ],
};

export function chatMessage(role, { text = '', cards = [], actions = [] }) {
  return { role, text, cards, actions, timestamp: new Date().toISOString() };
}

function handlePlanOrPhoto(action, details, send) {
  switch (action) {
    case 'EXPLAIN_SMOG_CHOICES':
      if (details?.choices?.length) return send('How do the choices in this plan reduce exposure and emissions?', null, { planChoices: details.choices });
      break;
    case 'FILE_REPORT_FROM_ANALYSIS': {
      const message = details?.situation ? `Help me file a report. Possible photo finding (needs review): ${details.situation}` : 'Help me file a report for this environmental issue';
      return send(message, null, { photoLocation: details?.photoLocation });
    }
    case 'PHOTO_ISSUE':
      if (details?.issue) return send(`Draft a complaint email. I observed ${details.issue.toLowerCase()} and have a photo.`, null, { photoLocation: details.photoLocation ?? null });
      break;
    case 'QUICK_ALL_CONTACTS': {
      const message = details?.category === 'road_obstruction'
        ? 'Show me the local, state and emergency traffic-police contacts for this road obstruction, with verified email, helpline and complaint portal'
        : 'Show me the national, state and local authority contacts with emails';
      return send(message, null, { photoLocation: details?.photoLocation });
    }
  }
}

export function dispatchChatAction(action, item, { send, reply, navigate, save }) {
  if (Object.hasOwn(ACTION_PROMPTS, action)) return send(ACTION_PROMPTS[action], null);
  if (Object.hasOwn(RECORD_ACTIONS, action)) return save(action, item);
  const details = item?.data;
  switch (action) {
    case 'GOTO_MEETUPS': return navigate('/meetups');
    case 'GOTO_COMMUNITY': return navigate('/community');
    case 'VIEW_REPORT':
      if (details?.id) return navigate('/report/' + encodeURIComponent(details.id));
      break;
    case 'START_MAP_SEARCH':
      return reply({ text: '🗺️ Type any city, area, or landmark like **“show map of Udaipur”**, **“map Vashi station”**, or **“Tokyo”**. I’ll resolve the real coordinates and open it on the map.' });
    case 'START_COMPLAINT': return reply(COMPLAINT);
    case 'START_COMPLAINT_CATEGORY': return send(details?.prompt || 'I need help making a civic complaint', null);
    case 'OPEN_IMAGE_PICKER': return window.dispatchEvent(new Event('ecopulse:open-image-picker'));
    case 'CANCEL': return reply({ text: "No problem! Let me know if there's anything else I can help you with. 🌱" });
    default: return handlePlanOrPhoto(action, details, send);
  }
}

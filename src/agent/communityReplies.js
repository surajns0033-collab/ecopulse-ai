import { tools } from '../services/agentTools';
import { getJsonResponse } from '../services/geminiService';
import { logAction } from './activityLog';

export async function handleFindEvents(city, category, userId, timeZone, signal) {
  const events = await tools.getNearbyMeetups({ city, category, timeZone, limit: 8, signal });
  logAction(userId, 'events_fetched', { count: events.length, category: category || null });

  if (!events || events.length === 0) {
    return {
      text: city ? 'No upcoming meetup lists ' + city + ' in its venue. The Events tab also lists venues without a city.'
        : 'I didn’t find any upcoming meetups in the EcoPulse listings. You can check the Events tab or organize one.',
      cards: [],
      actions: [{ label: '➕ Create Meetup', action: 'CREATE_EVENT', variant: 'primary' }],
      status: 'empty',
    };
  }

  return {
    text: `Upcoming EcoPulse meetups are listed by date. ${city ? `The venue lists **${city}**.` : 'Check the venue before joining.'}`,
    cards: [{ type: 'meetup-list', data: { events } }],
    actions: [
      { label: '🗓️ See All Events', action: 'GOTO_MEETUPS', variant: 'secondary' },
      { label: '➕ Create Event', action: 'CREATE_EVENT', variant: 'secondary' },
    ],
    status: 'success',
  };
}

export function handleJoinEventPrompt() {
  return {
    text: "To join an event, tap **Join event** on its card. You can also cancel your place from Events.",
    cards: [],
    actions: [{ label: '🔍 Find Events', action: 'QUICK_FIND_EVENTS', variant: 'primary' }],
    status: 'info',
  };
}

export async function handleCreateEventPrompt(userMessage, city, lat, lng) {
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

export async function handleCommunityFeed() {
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

export async function handleUserImpact(userId) {
  const stats = await tools.getUserImpact({ userId });

  return {
    text: `🌟 **Your EcoPulse Impact:**\n\n📋 Reports Submitted: **${stats.reportsSubmitted}**\n🤝 Event registrations: **${stats.eventsJoined}**`,
    cards: [],
    actions: [
      { label: '📋 File a Report', action: 'QUICK_REPORT', variant: 'primary' },
      { label: '🗓️ Join an Event', action: 'QUICK_FIND_EVENTS', variant: 'secondary' },
    ],
    status: 'success',
  };
}

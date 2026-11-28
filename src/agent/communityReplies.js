import { tools } from '../services/agentTools';
import { getJsonResponse } from '../services/geminiService';
import { readMeetupDraft } from '../services/meetupDraft.js';
import { meetupDayStart } from '../services/meetupDiscovery.js';
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

export async function handleCreateEventPrompt(userMessage, city, timeZone, signal) {
  const lower = (userMessage || '').toLowerCase();
  const hasDetails = userMessage && userMessage.trim().split(/\s+/).length >= 4 &&
    !['i want to create a community eco-event', 'create event', 'create meetup', 'organise event', 'organize event'].includes(lower.trim());

  if (hasDetails) {
    // Use the model to structure meetup details from natural language (best effort).
    const today = meetupDayStart(timeZone).toISOString().slice(0, 10);
    const parsed = await getJsonResponse(
      'Extract an event proposal from the user request. Return title, location, date (YYYY-MM-DD), time, ' +
      'category (cleanup, plantation, biodiversity, waste_reduction, awareness or community), description and capacity. ' +
      'Leave missing details null. Use the local date ' + today + ' to resolve relative dates.\nUser request: ' + userMessage,
      '', { timeoutMs: 15000, signal }
    );
    const data = readMeetupDraft(parsed, userMessage, city);
    if (data) return {
      text: 'Review the proposed venue, date, time and places before publishing. You can also enter different details in Events.',
      cards: [{ type: 'meetup-preview', data }],
      actions: [{ label: 'Open Events', action: 'GOTO_MEETUPS', variant: 'secondary' }],
      status: 'preview',
    };
  }

  return {
    text: 'Tell me the event title, venue and date so I can prepare a preview. For example, “Organize a park cleanup in Pune this Sunday at 8 AM.” You can also enter the details in Events.',
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

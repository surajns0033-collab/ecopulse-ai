// ChatPage — main chat interface matching reference screenshot + Google Maps location support
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { attendanceMessage, meetupErrorMessage } from '../services/meetupMessages';
import Header from '../components/chat/Header';
import MessageBubble from '../components/chat/MessageBubble';
import QuickActions from '../components/chat/QuickActions';
import ChatInput from '../components/chat/ChatInput';
import BottomNav from '../components/BottomNav';

function createWelcomeMessage(user) {
  const name = user?.displayName ? ` ${user.displayName}` : '';
  return {
    id: 'welcome',
    role: 'ai',
    text: `👋 Hi${name}! I'm **EcoPulse AI**, your everyday environment and civic-help companion. 🌱\n\nChoose a feature or ask anything. Type a city name for a snapshot, or say **“Set my city to…”** to choose the city for local questions.`,
    cards: [],
    actions: [
      { label: '📍 Share My Location', action: 'REQUEST_LOCATION', variant: 'primary' },
      { label: '🌬️ Check AQI', action: 'QUICK_AQI', variant: 'secondary' },
      { label: '🌦️ Weather & Precautions', action: 'QUICK_WEATHER_PRECAUTIONS', variant: 'secondary' },
      { label: '🌫️ Smog Action Plan', action: 'QUICK_SMOG_PLAN', variant: 'secondary' },
      { label: '📣 Make a Complaint', action: 'START_COMPLAINT', variant: 'secondary' },
      { label: '📷 Understand a Photo', action: 'OPEN_IMAGE_PICKER', variant: 'secondary' },
      { label: '📇 Authority Contacts', action: 'QUICK_ALL_CONTACTS', variant: 'secondary' },
      { label: '🗺️ Map Any Place', action: 'START_MAP_SEARCH', variant: 'secondary' },
    ],
    timestamp: new Date().toISOString(),
  };
}

export default function ChatPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { location, setLocation, chosenLocation, setChosenLocation, conversation, addMessage, clearConversation, pendingAction, setPendingAction } = useApp();

  const [isTyping, setIsTyping] = useState(false);
  const [typingStatus, setTypingStatus] = useState('Thinking...');
  const scrollRef = useRef(null);
  const messagesEndRef = useRef(null);
  const requestRef = useRef(null);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    messagesEndRef.current?.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [conversation, isTyping, scrollToBottom]);

  // Device location is only requested after an explicit action.
  useEffect(() => {
    if (conversation.length === 0) {
      addMessage(createWelcomeMessage(user));
    }
  }, [conversation.length, user, addMessage]);

  // Handle card/button actions
  async function handleAction(action, data) {
    switch (action) {
      case 'REQUEST_LOCATION':
        await sendMessage('Use my location', null);
        break;

      case 'GOTO_MEETUPS':
        navigate('/meetups');
        break;

      case 'GOTO_COMMUNITY':
        navigate('/community');
        break;

      case 'QUICK_AQI':
        await sendMessage('What is the air quality right now?', null);
        break;

      case 'QUICK_WEATHER_PRECAUTIONS':
        await sendMessage('What is the current weather and what precautions should I take?', null);
        break;

      case 'START_MAP_SEARCH':
        addMessage({
          role: 'ai',
          text: '🗺️ Type any city, area, or landmark like **“show map of Udaipur”**, **“map Vashi station”**, or **“Tokyo”**. I’ll resolve the real coordinates and open it on the map.',
          cards: [], actions: [], timestamp: new Date().toISOString(),
        });
        break;

      case 'QUICK_SMOG_PLAN':
        await sendMessage('Create my personalized winter smog and clean-air action plan', null);
        break;

      case 'EXPLAIN_SMOG_CHOICES':
        await sendMessage('How do the choices in this plan reduce exposure and emissions?', null, { planChoices: data.data.choices });
        break;

      case 'START_COMPLAINT':
        addMessage({
          role: 'ai',
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
          timestamp: new Date().toISOString(),
        });
        break;

      case 'START_COMPLAINT_CATEGORY':
        await sendMessage(data?.data?.prompt || 'I need help making a civic complaint', null);
        break;

      case 'OPEN_IMAGE_PICKER':
        window.dispatchEvent(new Event('ecopulse:open-image-picker'));
        break;

      case 'QUICK_HEALTH_TIPS':
        await sendMessage('Give me health tips for today\'s air quality', null);
        break;

      case 'QUICK_REPORT':
        await sendMessage('I want to file an environmental complaint', null);
        break;

      case 'QUICK_WATER_REPORT':
        await sendMessage('I want to report a water pollution issue', null);
        break;

      case 'QUICK_FIND_EVENTS':
        await sendMessage('Find eco-meetups near me', null);
        break;

      case 'QUICK_DRAFT_EMAIL':
        await sendMessage('Draft a complaint email to municipal corporation', null);
        break;

      case 'QUICK_ALL_CONTACTS':
        await sendMessage(
          data?.data?.category === 'road_obstruction'
            ? 'Show me the local, state and emergency traffic-police contacts for this road obstruction, with verified email, helpline and complaint portal'
            : 'Show me the national, state and local authority contacts with emails',
          null,
          { photoLocation: data?.data?.photoLocation },
        );
        break;

      case 'FILE_REPORT_FROM_ANALYSIS':
        await sendMessage(
          data?.data?.situation
            ? `Help me file a report. Possible photo finding (needs review): ${data.data.situation}`
            : 'Help me file a report for this environmental issue',
          null,
          { photoLocation: data?.data?.photoLocation },
        );
        break;

      case 'PHOTO_ISSUE':
        if (!data?.data?.issue) break;
        await sendMessage(`Draft a complaint email. I observed ${data.data.issue.toLowerCase()} and have a photo.`, null, {
          photoLocation: data.data.photoLocation ?? null,
        });
        break;

      case 'CREATE_EVENT':
        await sendMessage('I want to create a community eco-event', null);
        break;

      case 'PUBLISH_MEETUP': {
        if (!user || !data) break;
        setIsTyping(true);
        setTypingStatus('Publishing meetup...');
        try {
          const { createMeetup } = await import('../services/meetups');
          const result = await createMeetup({
            userId: user.uid,
            organizer: user.displayName || 'Guest Organizer',
            title: data.title,
            description: data.description,
            category: data.category,
            location: data.location,
            date: data.date,
            time: data.time,
            capacity: data.capacity,
            lat: data.lat,
            lng: data.lng,
          });
          addMessage({
            role: 'ai',
            text: '',
            cards: [{
              type: 'confirmation',
              data: {
                title: result.localOnly ? 'Meetup saved on this device' : 'Meetup published',
                message: `"${data.title}" at ${data.location} is on your Events page.`,
                id: result.eventId,
              },
            }],
            actions: [{ label: '🗓️ View Events', action: 'GOTO_MEETUPS', variant: 'primary' }],
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          addMessage({
            role: 'ai',
            text: user.isAnonymous ? 'Sign in with Google or email to publish a meetup.' : meetupErrorMessage(error),
            cards: [], actions: [], timestamp: new Date().toISOString(),
          });
        } finally {
          setIsTyping(false);
        }
        break;
      }

      case 'JOIN_MEETUP':
      case 'CANCEL_MEETUP': {
        if (!user || !data) break;
        let message;
        try {
          const { joinMeetup, cancelMeetupRSVP } = await import('../services/meetups');
          const save = action === 'JOIN_MEETUP' ? joinMeetup : cancelMeetupRSVP;
          const result = await save({ userId: user.uid, meetupDocId: data.id, meetupId: data.eventId });
          message = attendanceMessage(result);
        } catch (error) {
          message = meetupErrorMessage(error);
        }
        addMessage({
          role: 'ai', text: `**${data.title}** — ${message}`, cards: [],
          actions: [{ label: 'View events', action: 'GOTO_MEETUPS', variant: 'secondary' }],
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case 'VIEW_REPORT': {
        const id = data?.data?.id;
        if (id) navigate('/report/' + encodeURIComponent(id));
        break;
      }

      case 'SUBMIT_REPORT': {
        if (!user || !data) break;
        setIsTyping(true);
        setTypingStatus('Submitting report...');
        try {
          const { tools } = await import('../services/agentTools');
          const result = await tools.createEnvironmentalReport({
            userId: user.uid,
            title: data.title,
            description: data.description,
            category: data.category,
            location: data.location,
            lat: data.lat,
            lng: data.lng,
          });
          addMessage({
            role: 'ai',
            text: '',
            cards: [{
              type: 'confirmation',
              data: {
                title: result.localOnly ? 'Report saved on this device' : 'Report submitted',
                message: 'Your report is ready to review. You can also draft an email to the relevant authority.',
                id: result.reportId,
              }
            }],
            actions: [
              { label: 'View my report', action: 'VIEW_REPORT', variant: 'primary', data: { id: result.docId } },
              { label: '📧 Draft Email', action: 'QUICK_DRAFT_EMAIL', variant: 'secondary' },
              { label: '🏠 Done', action: 'CANCEL', variant: 'secondary' },
            ],
            timestamp: new Date().toISOString(),
          });
        } catch {
          addMessage({
            role: 'ai',
            text: 'Report could not be submitted right now. Please try again.',
            cards: [], actions: [], timestamp: new Date().toISOString(),
          });
        } finally {
          setIsTyping(false);
        }
        break;
      }

      case 'SAVE_EMAIL_DRAFT': {
        if (!user || !data) break;
        setIsTyping(true);
        setTypingStatus('Saving email draft...');
        try {
          const { tools } = await import('../services/agentTools');
          const result = await tools.createEmailDraft({
            userId: user.uid,
            reportId: data.reportId || null,
            issue: data.subject,
            location: data.location || null,
            recipientType: 'municipal',
            recipientEmail: data.to,
            subject: data.subject,
            body: data.body,
          });
          addMessage({
            role: 'ai',
            text: '',
            cards: [{
              type: 'confirmation',
              data: {
                title: 'Email Draft Saved! 📧',
                message: 'Draft saved to your account. Nothing was sent.',
                id: result.draftId,
              }
            }],
            actions: [],
            timestamp: new Date().toISOString(),
          });
        } catch {
          addMessage({
            role: 'ai',
            text: 'Could not save the email draft. Please try again.',
            cards: [], actions: [], timestamp: new Date().toISOString(),
          });
        } finally {
          setIsTyping(false);
        }
        break;
      }

      case 'CANCEL':
        addMessage({
          role: 'ai',
          text: 'No problem! Let me know if there\'s anything else I can help you with. 🌱',
          cards: [], actions: [], timestamp: new Date().toISOString(),
        });
        break;

      default:
        break;
    }
  }

  // Main send handler
  async function sendMessage(text, imageData, { photoLocation, planChoices } = {}) {
    if (isTyping || requestRef.current || (!text && !imageData)) return;
    const controller = new AbortController();
    requestRef.current = controller;

    addMessage({
      role: 'user',
      text: text || (imageData ? '📸 [Image attached]' : ''),
      cards: [],
      actions: [],
      timestamp: new Date().toISOString(),
    });

    setIsTyping(true);
    setTypingStatus(imageData ? 'Analyzing photo… The on-device fallback may download a vision model.' : 'Thinking...');

    let timeout;
    try {
      const history = planChoices ? [] : conversation.map((m) => ({ role: m.role, text: m.text }));
      const lower = (text || '').toLowerCase();
      if (planChoices) setTypingStatus('Explaining your selected plan...');
      else if (lower === 'use my location') setTypingStatus('Verifying your device location...');
      else if (lower.includes('aqi') || lower.includes('air') || lower.includes('pollution')) setTypingStatus('Checking air quality...');
      else if (lower.includes('event') || lower.includes('meetup')) setTypingStatus('Finding events...');
      else if (lower.includes('report') || lower.includes('complaint')) setTypingStatus('Preparing report...');
      else if (lower.includes('map') || lower.includes('route') || lower.includes('location')) setTypingStatus('Loading Google Maps...');

      const reply = import('../agent/agentOrchestrator').then(({ processMessage }) => {
        controller.signal.throwIfAborted();
        return processMessage(text, history, user, location, imageData, pendingAction, {
          chosenLocation, photoLocation, planChoices, signal: controller.signal,
        });
      });
      const response = await Promise.race([
        reply,
        new Promise((_, reject) => {
          timeout = setTimeout(() => {
            reject(new Error('Request timed out'));
            controller.abort();
          }, imageData ? 180000 : 45000);
        }),
      ]);

      if (requestRef.current !== controller) return;
      if (response.resolvedLocation) setLocation(response.resolvedLocation);
      if (response.chosenLocation) setChosenLocation(response.chosenLocation);

      if (!planChoices) {
        setPendingAction(response.pending ? {
          type: response.pending, location: response.resolvedLocation || location, ...response.pendingData,
        } : null);
      }

      addMessage({
        role: 'ai',
        text: response.text,
        cards: response.cards || [],
        actions: response.actions || [],
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      if (requestRef.current !== controller) return;
      addMessage({
        role: 'ai',
        text: err?.message === 'Request timed out'
          ? 'That took longer than expected. Please try again.'
          : 'Something went wrong on my side. Please try again.',
        cards: [], actions: [], timestamp: new Date().toISOString(),
      });
    } finally {
      clearTimeout(timeout);
      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsTyping(false);
        setTypingStatus('Thinking...');
      }
    }
  }

  function handleRefresh() {
    requestRef.current?.abort();
    requestRef.current = null;
    setIsTyping(false);
    clearConversation();
    setPendingAction(null);
    setLocation(chosenLocation);
  }

  return (
    <div className="app-shell">
      <Header onRefresh={handleRefresh} />

      <main className="chat-scroll-area" ref={scrollRef} aria-label="Chat" tabIndex={0}>
        <div role="log" aria-label="Chat messages" aria-relevant="additions">
        {conversation.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onAction={handleAction}
          />
        ))}

        {isTyping && (
          <div className="typing-indicator" aria-hidden="true">
            <div className="message-avatar">
              <span style={{ fontSize: 14 }}>🤖</span>
            </div>
            <div>
              <div className="typing-bubble">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
              <div className="status-text">{typingStatus}</div>
            </div>
          </div>
        )}

        </div>
        <div ref={messagesEndRef} />
      </main>
      <div className="chat-visually-hidden" role="status">{isTyping ? typingStatus : ''}</div>

      <QuickActions
        onMessage={(msg) => sendMessage(msg, null)}
        onCommand={(action) => handleAction(action)}
      />
      <ChatInput onSend={sendMessage} disabled={isTyping} />
      <BottomNav />
    </div>
  );
}

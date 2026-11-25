// ChatPage — main chat interface matching reference screenshot + Google Maps location support
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { processMessage } from '../agent/agentOrchestrator';
import { getUserCity, getLocationFromBrowser, DEFAULT_LOCATION } from '../services/environmentalData';
import { tools } from '../services/agentTools';
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
    text: `👋 Hi${name}! I'm **EcoPulse AI**, your everyday environment and civic-help companion. 🌱\n\nChoose a feature below to get started, or just type naturally about anything you need help with. You can change the city anytime by typing its name.`,
    cards: [],
    actions: [
      { label: '📍 Share My Location', action: 'REQUEST_LOCATION', variant: 'primary' },
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

export default function ChatPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { location, setLocation, conversation, addMessage, clearConversation, pendingAction, setPendingAction } = useApp();

  const [isTyping, setIsTyping] = useState(false);
  const [typingStatus, setTypingStatus] = useState('Thinking...');
  const scrollRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [conversation, isTyping]);

  // Add welcome message on first load & auto-detect location safely
  useEffect(() => {
    if (conversation.length === 0) {
      addMessage(createWelcomeMessage(user));
    }
    if (!location) {
      getLocationFromBrowser().then(async (coords) => {
        const city = await getUserCity(coords.lat, coords.lng);
        setLocation({ lat: coords.lat, lng: coords.lng, city });
      }).catch(() => {
        setLocation(DEFAULT_LOCATION);
      });
    }
  }, []);

  // Request location explicitly with Google Maps preview
  async function requestLocation() {
    setIsTyping(true);
    setTypingStatus('Getting your location...');
    try {
      const coords = await getLocationFromBrowser();
      const city = await getUserCity(coords.lat, coords.lng);
      const finalLoc = { lat: coords.lat, lng: coords.lng, city };
      setLocation(finalLoc);

      addMessage({
        role: 'ai',
        text: `📍 Got your location! You're in **${city}**. Here is your area on Google Maps:`,
        cards: [{ type: 'map', data: { lat: finalLoc.lat, lng: finalLoc.lng, city: finalLoc.city, label: `${finalLoc.city} — Your Location` } }],
        actions: [{ label: '🌬️ Check Air Quality', action: 'QUICK_AQI', variant: 'primary' }],
        timestamp: new Date().toISOString(),
      });
    } catch {
      setLocation(DEFAULT_LOCATION);
      addMessage({
        role: 'ai',
        text: `📍 Using default location **${DEFAULT_LOCATION.city}**. You can also type any city name in chat.`,
        cards: [{ type: 'map', data: { ...DEFAULT_LOCATION, label: DEFAULT_LOCATION.city } }],
        actions: [],
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsTyping(false);
    }
  }

  // Handle card/button actions
  async function handleAction(action, data) {
    switch (action) {
      case 'REQUEST_LOCATION':
        await requestLocation();
        break;

      case 'GOTO_MEETUPS':
        navigate('/meetups');
        break;

      case 'GOTO_COMMUNITY':
        navigate('/community');
        break;

      case 'QUICK_AQI':
        await sendMessage(`What is the air quality in ${location?.city || 'Navi Mumbai'} right now?`, null);
        break;

      case 'QUICK_WEATHER_PRECAUTIONS':
        await sendMessage(`What is the live weather in ${location?.city || 'Navi Mumbai'} and what precautions should I take right now?`, null);
        break;

      case 'START_MAP_SEARCH':
        addMessage({
          role: 'ai',
          text: '🗺️ Type any city, area, or landmark like **“show map of Udaipur”**, **“map Vashi station”**, or **“Tokyo”**. I’ll resolve the real coordinates and open it on the map.',
          cards: [], actions: [], timestamp: new Date().toISOString(),
        });
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
        );
        break;

      case 'FILE_REPORT_FROM_ANALYSIS':
        await sendMessage(
          data?.data?.situation
            ? `Help me file a report. Photo analysis: ${data.data.situation}`
            : 'Help me file a report for this environmental issue',
          null,
        );
        break;

      case 'DRAFT_EMAIL_FROM_ANALYSIS':
        await sendMessage(
          data?.data?.situation
            ? `Draft a complaint email to authorities. Photo analysis: ${data.data.situation}`
            : 'Draft a complaint email to authorities about this issue',
          null,
        );
        break;

      case 'IMAGE_ISSUE_GARBAGE':
        await sendMessage('Draft a complaint email about garbage dumping in my area. I have a photo attached as evidence.', null);
        break;

      case 'IMAGE_ISSUE_BURNING':
        await sendMessage('Draft a complaint email about open burning of garbage in my area. I have a photo attached as evidence.', null);
        break;

      case 'IMAGE_ISSUE_SEWAGE':
        await sendMessage('Draft a complaint email about sewage overflow in my area. I have a photo attached as evidence.', null);
        break;

      case 'IMAGE_ISSUE_TREES':
        await sendMessage('Draft a complaint email about tree cutting in my area. I have a photo attached as evidence.', null);
        break;

      case 'CREATE_EVENT':
        await sendMessage('I want to create a community eco-event', null);
        break;

      case 'PUBLISH_MEETUP': {
        if (!user || !data) break;
        setIsTyping(true);
        setTypingStatus('Publishing meetup...');
        try {
          const result = await tools.createMeetup({
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
                title: 'Meetup Published! 🎉',
                message: `"${data.title}" at ${data.location} is now live on the Events page!`,
                id: result.eventId,
              },
            }],
            actions: [{ label: '🗓️ View Events', action: 'GOTO_MEETUPS', variant: 'primary' }],
            timestamp: new Date().toISOString(),
          });
        } catch {
          addMessage({
            role: 'ai',
            text: 'Could not publish the meetup right now. Please try again.',
            cards: [], actions: [], timestamp: new Date().toISOString(),
          });
        } finally {
          setIsTyping(false);
        }
        break;
      }

      case 'JOIN_MEETUP': {
        if (!user || !data) break;
        const eventId = data.eventId || data.id;
        try {
          const result = await tools.joinMeetup({ userId: user.uid, meetupId: eventId });
          if (result.alreadyJoined) {
            addMessage({
              role: 'ai',
              text: `You're already registered for **${data.title}**! 🎉`,
              cards: [],
              actions: [],
              timestamp: new Date().toISOString(),
            });
          } else {
            addMessage({
              role: 'ai',
              text: '',
              cards: [{
                type: 'confirmation',
                data: {
                  title: 'Successfully Joined! 🎉',
                  message: `You're registered for "${data.title}". See you there!`,
                  id: eventId,
                }
              }],
              actions: [{ label: '🗓️ View All Events', action: 'GOTO_MEETUPS', variant: 'secondary' }],
              timestamp: new Date().toISOString(),
            });
          }
        } catch {
          addMessage({
            role: 'ai',
            text: 'Could not process your RSVP right now. Please try again.',
            cards: [], actions: [], timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      case 'SUBMIT_REPORT': {
        if (!user || !data) break;
        setIsTyping(true);
        setTypingStatus('Submitting report...');
        try {
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
                title: 'Report Submitted! ✅',
                message: 'Your environmental complaint has been recorded. Want to also send an email to authorities?',
                id: result.reportId,
              }
            }],
            actions: [
              { label: '📧 Draft Email', action: 'QUICK_DRAFT_EMAIL', variant: 'primary' },
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

      case 'SEND_EMAIL': {
        if (!user || !data) break;
        setIsTyping(true);
        setTypingStatus('Saving email draft...');
        try {
          const result = await tools.createEmailDraft({
            userId: user.uid,
            reportId: data.reportId || null,
            issue: data.subject,
            location: location?.city || 'Navi Mumbai',
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
                message: `Draft saved to your account. Send it from your email client to ${data.to}`,
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
  async function sendMessage(text, imageData) {
    if (!text && !imageData) return;

    addMessage({
      role: 'user',
      text: text || (imageData ? '📸 [Image attached]' : ''),
      cards: [],
      actions: [],
      timestamp: new Date().toISOString(),
    });

    setIsTyping(true);
    setTypingStatus(imageData ? 'Analyzing image privately… First photo may download the vision model.' : 'Thinking...');

    try {
      const history = conversation.map((m) => ({ role: m.role, text: m.text }));
      const lower = (text || '').toLowerCase();
      if (lower.includes('aqi') || lower.includes('air') || lower.includes('pollution')) setTypingStatus('Checking air quality...');
      else if (lower.includes('event') || lower.includes('meetup')) setTypingStatus('Finding events...');
      else if (lower.includes('report') || lower.includes('complaint')) setTypingStatus('Preparing report...');
      else if (lower.includes('map') || lower.includes('route') || lower.includes('location')) setTypingStatus('Loading Google Maps...');

      const activeLoc = location || DEFAULT_LOCATION;
      const response = await Promise.race([
        processMessage(text, history, user, activeLoc, imageData, pendingAction),
        new Promise((_, reject) => setTimeout(
          () => reject(new Error('Request timed out')),
          imageData ? 180000 : 45000,
        )),
      ]);

      // Remember the city currently being discussed so quick actions use it
      if (response.resolvedLocation) {
        setLocation(response.resolvedLocation);
      }

      // Keep the email-drafting flow alive across turns while the AI awaits details.
      // Only the email handler sets `pending`, so other "needs info" replies don't trap the chat.
      if (response.pending) {
        setPendingAction({ type: response.pending, city: activeLoc.city });
      } else if (response.status === 'preview' || response.status === 'success' || response.status === 'needs_info' || response.status === 'unavailable') {
        setPendingAction(null);
      }

      addMessage({
        role: 'ai',
        text: response.text,
        cards: response.cards || [],
        actions: response.actions || [],
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      addMessage({
        role: 'ai',
        text: err?.message === 'Request timed out'
          ? `That took longer than expected ⏳ Please try once more.\n\nMeanwhile I can always tell you **which authority, email and helpline** to complain to for **${location?.city || 'your area'}** — just say "where do I complain about garbage?"`
          : 'Something went wrong on my side. Please try again — and if it repeats, tell me your city and the exact issue and I\'ll give you the verified complaint contacts directly.',
        cards: [], actions: [], timestamp: new Date().toISOString(),
      });
    } finally {
      setIsTyping(false);
      setTypingStatus('Thinking...');
    }
  }

  function handleRefresh() {
    clearConversation();
    setTimeout(() => addMessage(createWelcomeMessage(user)), 50);
  }

  return (
    <div className="app-shell">
      <Header onRefresh={handleRefresh} />

      <div className="chat-scroll-area" ref={scrollRef}>
        {conversation.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onAction={handleAction}
          />
        ))}

        {isTyping && (
          <div className="typing-indicator">
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

        <div ref={messagesEndRef} />
      </div>

      <QuickActions
        onMessage={(msg) => sendMessage(msg, null)}
        onCommand={(action) => handleAction(action)}
      />
      <ChatInput onSend={sendMessage} disabled={isTyping} />
      <BottomNav />
    </div>
  );
}

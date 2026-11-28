import { useState } from 'react';
import { MapPin, Calendar, Users } from 'lucide-react';
import { getGoogleMapsUrl } from '../../services/environmentalData';
import { MEETUP_CATEGORIES } from '../../firebase/collections';
import { formatMeetupDate } from '../../services/meetupDiscovery.js';
import { AttendanceButton } from '../meetups/AttendanceButton.jsx';
import { useAuth } from '../../contexts/AuthContext';
import { useMeetups } from '../meetups/useMeetups';

export function MeetupListCard({ data, onJoin, onLeave }) {
  const { user } = useAuth();
  const live = useMeetups(user?.uid);
  const [pending, setPending] = useState(new Set());

  async function changePlace(event, joined) {
    const id = event.id || event.eventId;
    setPending(previous => new Set(previous).add(id));
    try {
      await (joined ? onLeave : onJoin)?.(event);
    } finally {
      setPending(previous => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="inline-card">
      <div className="card-header">
        <Calendar size={15} color="#22c55e" />
        <span className="card-title">Upcoming Eco-Events</span>
      </div>
      {live.error && <div role="alert">{live.error} <button onClick={live.retry}>Retry</button></div>}
      <div className="meetup-scroll">
        {data.events.map(saved => <ChatMeetup key={saved.id || saved.eventId} saved={saved} live={live}
          saving={pending.has(saved.id || saved.eventId)} changePlace={changePlace} />)}
      </div>
    </div>
  );
}


function ChatMeetup({ saved, live, saving, changePlace }) {
  const current = live.events.find(event => saved.id ? event.id === saved.id : event.eventId === saved.eventId);
  const ev = current || saved;
  const joined = live.joinedIds.has(current?.id || saved.id || saved.eventId);
  const catObj = MEETUP_CATEGORIES.find(category => category.id === ev.category);
  const mapsUrl = getGoogleMapsUrl(ev.lat, ev.lng, ev.location);
  return (
    <div className="meetup-mini-card">
      <div className="event-category">{catObj?.icon} {catObj?.label || ev.category}</div>
      <div className="event-title">{ev.title}</div>
      <div className="event-meta"><Calendar size={10} /> {formatMeetupDate(ev.date, true)} • {ev.time}</div>
      <div className="event-meta">
        <MapPin size={10} />
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#166534', textDecoration: 'none' }}
        >
          {ev.location?.length > 26 ? ev.location.slice(0, 26) + '…' : ev.location}
        </a>
      </div>
      {current && <div className="event-meta"><Users size={10} /> {current.participantCount || 0}{current.capacity > 0 && `/${current.capacity}`}</div>}
      <AttendanceButton compact event={ev} joined={joined} pending={saving} unavailable={live.loading || Boolean(live.error)}
        onChange={() => changePlace(saved, joined)} />
    </div>
  );
}

export function MeetupPreviewCard({ data, onPublish, onCancel }) {
  const cat = MEETUP_CATEGORIES.find((c) => c.id === data.category);
  return (
    <div className="inline-card">
      <div className="preview-card-header">
        <span>🗓️</span> New Meetup Preview
      </div>
      <div className="preview-card-body">
        <div className="preview-field">
          <div className="preview-field-label">Title</div>
          <div className="preview-field-val">{data.title}</div>
        </div>
        <div className="preview-field">
          <div className="preview-field-label">Category</div>
          <div className="preview-field-val">{cat?.icon || '🌱'} {cat?.label || data.category}</div>
        </div>
        <div className="preview-field">
          <div className="preview-field-label">Location</div>
          <div className="preview-field-val">📍 {data.location}</div>
        </div>
        <div className="preview-field">
          <div className="preview-field-label">Date & Time</div>
          <div className="preview-field-val">📅 {data.date} • ⏰ {data.time || '7:00 AM'}{data.capacity > 0 && ` • ${data.capacity} places`}</div>
        </div>
        <div className="preview-field">
          <div className="preview-field-label">Description</div>
          <div className="preview-field-val" style={{ color: '#475569' }}>{data.description}</div>
        </div>
      </div>
      <div className="preview-card-actions">
        <button className="btn-primary" onClick={() => onPublish && onPublish(data)}>
          ✅ Publish Meetup
        </button>
        <button className="btn-secondary" onClick={() => onCancel && onCancel()}>
          Cancel
        </button>
      </div>
    </div>
  );
}

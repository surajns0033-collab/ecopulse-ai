import { useState } from 'react';
import { MapPin, Calendar, Users } from 'lucide-react';
import { getGoogleMapsUrl } from '../../services/environmentalData';
import { MEETUP_CATEGORIES } from '../../firebase/collections';
import { format } from 'date-fns';
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

  function formatEventDate(d) {
    if (!d) return 'TBD';
    try {
      if (d?.toDate) return format(d.toDate(), 'EEE d MMM');
      if (d instanceof Date) return format(d, 'EEE d MMM');
      return String(d);
    } catch { return 'TBD'; }
  }

  return (
    <div className="inline-card">
      <div className="card-header">
        <Calendar size={15} color="#22c55e" />
        <span className="card-title">Upcoming Eco-Events</span>
      </div>
      {live.error && <div role="alert">{live.error} <button onClick={live.retry}>Retry</button></div>}
      <div className="meetup-scroll">
        {data.events.map((saved) => {
          const id = saved.id || saved.eventId;
          const current = live.events.find(event => saved.id ? event.id === saved.id : event.eventId === saved.eventId);
          const ev = current || saved;
          const joined = live.joinedIds.has(current?.id || id);
          const full = current?.capacity > 0 && current.participantCount >= current.capacity;
          const saving = pending.has(id);
          const catObj = MEETUP_CATEGORIES.find((c) => c.id === ev.category);
          const mapsUrl = getGoogleMapsUrl(ev.lat, ev.lng, ev.location);
          return (
            <div key={ev.id || ev.eventId} className="meetup-mini-card">
              <div className="event-category">{catObj?.icon} {catObj?.label || ev.category}</div>
              <div className="event-title">{ev.title}</div>
              <div className="event-meta"><Calendar size={10} /> {formatEventDate(ev.date)} • {ev.time}</div>
              <div className="event-meta">
                <MapPin size={10} />
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#16a34a', textDecoration: 'none' }}
                >
                  {ev.location?.length > 26 ? ev.location.slice(0, 26) + '…' : ev.location}
                </a>
              </div>
              {current && <div className="event-meta"><Users size={10} /> {current.participantCount || 0}{current.capacity > 0 && `/${current.capacity}`}</div>}
              <button className="join-btn" disabled={live.loading || !!live.error || saving || (!joined && full)}
                onClick={() => changePlace(saved, joined)}>
                {saving ? 'Saving…' : joined ? 'Cancel my place' : full ? 'Event full' : 'Join event'}
              </button>
            </div>
          );
        })}
      </div>
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
          <div className="preview-field-val">📅 {data.date} • ⏰ {data.time || '7:00 AM'}</div>
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

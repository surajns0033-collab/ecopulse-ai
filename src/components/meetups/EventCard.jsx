// EventCard — full event card component
import { Calendar, MapPin, Users, Clock, AlertCircle } from 'lucide-react';
import { formatMeetupDate } from '../../services/meetupDiscovery.js';
import { AttendanceButton } from './AttendanceButton.jsx';
import { MEETUP_CATEGORIES } from '../../firebase/collections';

export default function EventCard({ event, onJoin, onLeave, isJoined = false, pending = false }) {
  const catObj = MEETUP_CATEGORIES.find((c) => c.id === event.category);
  return (
    <div className="event-card-full">
      <div className="event-card-top">
        <div className="event-category-badge">
          {catObj?.icon} {catObj?.label || event.category}
        </div>
        <h3>{event.title}</h3>
      </div>

      <div className="event-card-body">
        {event.isSeeded && (
          <div className="seeded-badge">
            <AlertCircle size={10} />
            Sample event — verify details before attending
          </div>
        )}

        <div className="event-info-row">
          <Calendar size={13} color="#22c55e" />
          <span>{formatMeetupDate(event.date)} • {event.time}</span>
        </div>

        {event.duration && (
          <div className="event-info-row">
            <Clock size={13} color="#22c55e" />
            <span>Duration: {event.duration}</span>
          </div>
        )}

        <div className="event-info-row">
          <MapPin size={13} color="#22c55e" />
          <span>{event.location}</span>
        </div>

        <div className="event-info-row">
          <Users size={13} color="#22c55e" />
          <span>Organized by {event.organizer}</span>
        </div>

        {event.description && (
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, marginTop: 4 }}>
            {event.description}
          </div>
        )}

        {event.safety && event.safety.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 3 }}>SAFETY TIPS</div>
            {event.safety.map((tip, i) => (
              <div key={i} style={{ fontSize: 12, color: '#475569', marginBottom: 2 }}>• {tip}</div>
            ))}
          </div>
        )}

        <ParticipantBar event={event} />
        <AttendanceButton event={event} joined={isJoined} pending={pending}
          onChange={(item, joined) => (joined ? onLeave : onJoin)?.(item)} />
      </div>
    </div>
  );
}

function ParticipantBar({ event }) {
  const fillPct = event.capacity > 0 ? Math.min(100, Math.round(((event.participantCount || 0) / event.capacity) * 100)) : 0;
  return (
    <div className="participant-bar-container">
      <div className="participant-bar-label">
        <span>Participants</span>
        <span>{event.participantCount || 0}{event.capacity > 0 && ` / ${event.capacity}`}</span>
      </div>
      <div className="participant-bar">
        <div className="participant-fill" style={{ width: `${fillPct}%` }} />
      </div>
    </div>
  );
}

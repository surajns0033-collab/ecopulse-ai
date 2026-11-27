// InlineCards — renders all card types inline in chat, matching reference UI + Google Maps
import { useState } from 'react';
import { MapPin, Calendar, Users, CheckCircle, AlertCircle, Zap, Droplets, ExternalLink, Navigation } from 'lucide-react';
import { getAQICategory, getGoogleMapsUrl } from '../../services/environmentalData';
import { MEETUP_CATEGORIES, REPORT_CATEGORIES } from '../../firebase/collections';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useMeetups } from '../meetups/useMeetups';

// ===== AQI GAUGE — multi-color gradient arc matching reference screenshot =====
function AQIGauge({ aqi, scale, categoryLabel, categoryColor, categoryBg }) {
  const radius = 52;
  const circumference = Math.PI * radius;
  const pct = Math.min(1, Math.max(0.05, (aqi || 0) / 300));
  const dash = pct * circumference;

  return (
    <div className="aqi-gauge-side">
      <svg width="136" height="84" viewBox="0 0 136 84" className="aqi-gauge-svg">
        <defs>
          <linearGradient id="aqiGradient" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="35%" stopColor="#eab308" />
            <stop offset="65%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>
        {/* Background track */}
        <path
          d={`M 16 74 A ${radius} ${radius} 0 0 1 120 74`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Gradient active arc */}
        <path
          d={`M 16 74 A ${radius} ${radius} 0 0 1 120 74`}
          fill="none"
          stroke="url(#aqiGradient)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
        <text x="68" y="48" textAnchor="middle" style={{ fontSize: 11, fontWeight: 600, fill: '#6b7280' }}>
          {scale || 'AQI'}
        </text>
        <text x="68" y="72" textAnchor="middle" style={{ fontSize: 28, fontWeight: 800, fill: '#1a1a2e' }}>
          {aqi ?? '--'}
        </text>
      </svg>
      <span
        className="aqi-category-badge"
        style={{ background: categoryBg, color: categoryColor, marginTop: -2 }}
      >
        {categoryLabel}
      </span>
    </div>
  );
}

export function AQICard({ data }) {
  const { aqi, scale, pm25, pm10, no2, o3, city, timestamp, source, sourceUrl, station, insight } = data;
  const cat = getAQICategory(aqi);

  const pollutants = [
    { label: 'PM2.5', value: pm25, unit: 'µg/m³', dot: '#ec4899' },
    { label: 'PM10', value: pm10, unit: 'µg/m³', dot: '#f59e0b' },
    { label: 'NO₂', value: no2, unit: 'µg/m³', dot: '#22c55e' },
    { label: 'O₃', value: o3, unit: 'µg/m³', dot: '#10b981' },
  ].filter((p) => p.value != null);

  const timeStr = timestamp
    ? (() => { try { return format(new Date(timestamp), 'h:mm a'); } catch { return ''; } })()
    : '';

  return (
    <div className="inline-card">
      <div className="aqi-card-layout">
        <AQIGauge
          aqi={aqi}
          scale={scale}
          categoryLabel={cat.label}
          categoryColor={cat.color}
          categoryBg={cat.bg}
        />

        {pollutants.length > 0 && (
          <div className="aqi-pollutant-list">
            {pollutants.map((p) => (
              <div key={p.label} className="aqi-pollutant-row">
                <span className="aqi-pollutant-dot" style={{ background: p.dot }} />
                <span className="aqi-pollutant-name">{p.label}</span>
                <span className="aqi-pollutant-val" style={{ marginLeft: 'auto' }}>
                  {typeof p.value === 'number' ? Math.round(p.value) : p.value}
                  <span className="aqi-pollutant-unit"> {p.unit}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {insight && (
        <div className="ai-insight-box">
          <div className="insight-label">
            <span className="insight-icon">💡</span>
            <span>AI Insight</span>
          </div>
          <p>{insight}</p>
        </div>
      )}

      <div className="aqi-source-row">
        <span>{city ? `📍 ${city} • ` : ''}Source: {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{source}</a> : source || 'Unavailable'}{station && station !== city ? ` (${station})` : ''}</span>
        {timeStr && <span>{timeStr} (your time)</span>}
      </div>
    </div>
  );
}

// ===== GOOGLE MAP LOCATION CARD =====
export function MapLocationCard({ data }) {
  const { lat, lng, city, label } = data;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const mapsUrl = getGoogleMapsUrl(lat, lng);
  const embedQuery = encodeURIComponent(`${lat},${lng}`);

  return (
    <div className="inline-card">
      <div className="card-header">
        <MapPin size={15} color="#22c55e" />
        <span className="card-title">{label || city || 'Location on Google Maps'}</span>
      </div>
      <div className="card-body">
        <div className="location-map-inline">
          <iframe
            title="Google Map Location"
            loading="lazy"
            src={`https://maps.google.com/maps?q=${embedQuery}&z=14&output=embed`}
            allowFullScreen
          />
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
          Coordinates: {lat.toFixed(4)}, {lng.toFixed(4)}
        </div>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 8,
            textDecoration: 'none',
            fontSize: 12,
          }}
        >
          <Navigation size={13} /> Open in Google Maps <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}

// ===== MEETUP LIST =====
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

// ===== REPORT PREVIEW =====
export function ReportPreviewCard({ data, onSubmit, onEdit, onCancel }) {
  const catObj = REPORT_CATEGORIES.find((c) => c.id === data.category);
  const mapsUrl = getGoogleMapsUrl(data.lat, data.lng, data.location);

  return (
    <div className="inline-card">
      <div className="card-header">
        <AlertCircle size={15} color="#f59e0b" />
        <span className="card-title">Report Preview</span>
      </div>
      <div className="report-preview-fields">
        <div className="report-field">
          <span className="report-field-label">Category</span>
          <span className="report-field-value">{catObj?.icon} {catObj?.label || data.category}</span>
        </div>
        <div className="report-field">
          <span className="report-field-label">Title</span>
          <span className="report-field-value">{data.title}</span>
        </div>
        <div className="report-field">
          <span className="report-field-label">Description</span>
          <span className="report-field-value" style={{ fontSize: 12, color: '#6b7280' }}>{data.description}</span>
        </div>
        <div className="report-field">
          <span className="report-field-label">Location</span>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="report-field-value"
            style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a', textDecoration: 'none' }}
          >
            <MapPin size={12} color="#22c55e" /> {data.location} <ExternalLink size={11} />
          </a>
        </div>
        {data.photoUrl && (
          <div className="report-field">
            <span className="report-field-label">Photo</span>
            <img src={data.photoUrl} alt="Report" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }} />
          </div>
        )}
      </div>
      <div className="report-actions">
        <button className="btn-primary" onClick={() => onSubmit && onSubmit(data)}>✅ Submit Report</button>
        <button className="btn-secondary" onClick={() => onEdit && onEdit(data)}>✏️ Edit</button>
        <button className="btn-danger" onClick={() => onCancel && onCancel()}>✕ Cancel</button>
      </div>
    </div>
  );
}

// ===== EMAIL PREVIEW =====
export function EmailPreviewCard({ data, onSave, onCancel }) {
  const [askGmailPerm, setAskGmailPerm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({ subject: data.subject || '', body: data.body || '' }));
  const complete = Boolean(draft.subject.trim() && draft.body.trim());

  const toEmail = data.to && data.to.includes('@') ? data.to : '';
  const ccParam = data.cc && data.cc.includes('@') ? `&cc=${encodeURIComponent(data.cc)}` : '';
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(toEmail)}${ccParam}&su=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;

  function handleConfirmOpenGmail() {
    setAskGmailPerm(false);
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');
  }

  function handleCopyDraft() {
    const ccLine = data.cc ? `CC: ${data.cc}\n` : '';
    const text = `${toEmail ? `To: ${toEmail}\n` : ''}${ccLine}Subject: ${draft.subject}\n\n${draft.body}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className="inline-card">
      <div className="card-header">
        <Zap size={15} color="#3b82f6" />
        <span className="card-title">Email Draft</span>
      </div>
      <div className="email-preview-body">
        <div className="email-field">
          <div className="email-field-label">To</div>
          <div className="email-field-value">{toEmail ? `${data.recipientName} — ${toEmail}` : 'No verified email address'}</div>
        </div>
        {data.cc && (
          <div className="email-field">
            <div className="email-field-label">CC</div>
            <div className="email-field-value" style={{ color: '#15803d', fontWeight: 500 }}>
              {data.ccLabel ? `${data.ccLabel} — ` : ''}{data.cc}
            </div>
          </div>
        )}
        <div className="email-field">
          <div className="email-field-label">Organization</div>
          <div className="email-field-value">{data.organization}</div>
        </div>
        {data.portalUrl && (
          <div className="email-field">
            <div className="email-field-label">Complaint Portal</div>
            <a
              href={data.portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="email-field-value"
              style={{ color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
            >
              {data.portalUrl} <ExternalLink size={11} />
            </a>
          </div>
        )}
        {data.sourceUrl && (
          <div className="email-field">
            <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer">Official contact listing <ExternalLink size={11} /></a>
          </div>
        )}
        {data.helpline && (
          <div className="email-field">
            <div className="email-field-label">Helpline</div>
            <div className="email-field-value">📞 {data.helpline}</div>
          </div>
        )}
        <div className="email-field">
          <div className="email-field-label">Subject</div>
          {editing ? <input className="email-draft-edit" aria-label="Draft subject" value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} />
            : <div className="email-field-value">{draft.subject}</div>}
        </div>
        <div className="email-field">
          <div className="email-field-label">Body Preview</div>
          {editing ? <textarea className="email-draft-edit" aria-label="Draft body" rows={8} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
            : <div className="email-body-preview">{draft.body}</div>}
        </div>
        {data.disclaimer && (
          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6, fontStyle: 'italic' }}>
            ⚠️ {data.disclaimer}
          </div>
        )}
      </div>
      {askGmailPerm && (
        <div style={{
          marginTop: 8, padding: '10px 12px', borderRadius: 10,
          background: '#f0fdf4', border: '1px solid #bbf7d0',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#166534' }}>
            Allow EcoPulse AI to open Gmail with this draft pre-filled in Compose?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={handleConfirmOpenGmail}>
              ✅ Yes, Open Gmail
            </button>
            <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setAskGmailPerm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="report-actions">
        <button className="btn-primary" disabled={!complete || editing} onClick={() => onSave?.({ ...data, ...draft })}>📧 Save Draft</button>
        {toEmail && <button className="btn-secondary" disabled={!complete || editing} onClick={() => setAskGmailPerm(true)}>✉️ Open in Gmail</button>}
        <button className="btn-secondary" disabled={!complete || editing} onClick={handleCopyDraft}>
          {copied ? '✅ Copied' : '📋 Copy'}
        </button>
        <button className="btn-secondary" onClick={() => { setAskGmailPerm(false); setEditing(!editing); }}>{editing ? 'Done editing' : '✏️ Edit'}</button>
        <button className="btn-danger" onClick={() => onCancel && onCancel()}>✕ Cancel</button>
      </div>
    </div>
  );
}

// ===== CONFIRMATION CARD =====
export function ConfirmationCard({ data }) {
  return (
    <div className="inline-card">
      <div className="confirmation-card">
        <div className="confirmation-icon">
          <CheckCircle size={28} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{data.title || 'Success!'}</div>
        <div style={{ fontSize: 13, color: '#6b7280', textAlign: 'center' }}>{data.message}</div>
        {data.id && <div className="confirmation-id">{data.id}</div>}
      </div>
    </div>
  );
}

// ===== IMAGE ANALYSIS CARD =====
export function ImageAnalysisCard({ data }) {
  const severityClass = `severity-${data.severity || 'moderate'}`;
  const confidencePct = Math.round((data.confidence || 0) * 100);
  const catObj = REPORT_CATEGORIES.find((c) => c.id === data.category);

  return (
    <div className="inline-card">
      <div className="card-header">
        <AlertCircle size={15} color="#f59e0b" />
        <span className="card-title">Environmental Analysis</span>
      </div>
      {data.preview && (
        <img
          src={data.preview}
          alt="Analyzed"
          style={{ width: '100%', maxHeight: 180, objectFit: 'cover' }}
        />
      )}
      <div className="analysis-result">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className={`analysis-badge ${severityClass}`}>
            {data.severity?.toUpperCase()} SEVERITY
          </span>
          {catObj && (
            <span style={{ fontSize: 11, background: '#f3f4f6', padding: '3px 10px', borderRadius: 20, color: '#4b5563' }}>
              {catObj.icon} {catObj.label}
            </span>
          )}
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{data.issue}</div>
        <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{data.description}</div>

        <div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>AI Confidence: {confidencePct}%</div>
          <div className="confidence-bar">
            <div className="confidence-fill" style={{ width: `${confidencePct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== COMMUNITY FEED =====
export function CommunityFeedCard({ data }) {
  const { posts } = data;

  function getInitials(name) {
    return (name || 'U').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  }

  return (
    <div className="inline-card">
      <div className="card-header">
        <Users size={15} color="#22c55e" />
        <span className="card-title">Community Feed</span>
      </div>
      {posts.map((post, i) => (
        <div key={post.id || i} className="community-post-item">
          <div className="community-post-meta">
            <div className="community-avatar">{getInitials(post.author || post.userId)}</div>
            <span className="community-post-author">{post.author || 'Community Member'}</span>
            <span className="community-post-time">
              {post.createdAt?.toDate
                ? (() => { try { return format(post.createdAt.toDate(), 'd MMM'); } catch { return ''; } })()
                : ''}
            </span>
          </div>
          <div className="community-post-text">{post.text || post.description || 'No description'}</div>
        </div>
      ))}
    </div>
  );
}

// ===== DAILY PLAN CARD =====
export function DailyPlanCard({ data }) {
  const { actions } = data;

  return (
    <div className="inline-card">
      <div className="card-header">
        <Zap size={15} color="#22c55e" />
        <span className="card-title">Today's Eco-Action Plan</span>
      </div>
      {actions.map((item, i) => (
        <div key={i} className="daily-plan-item">
          <div className="daily-plan-num">{i + 1}</div>
          <div className="daily-plan-text">{item.icon} {item.action}</div>
        </div>
      ))}
    </div>
  );
}

// ===== WATER QUALITY CARD =====
export function WaterQualityCard({ data }) {
  const items = [
    { icon: '👃', text: 'Unusual smell or colour? Report it immediately — it may indicate contamination.' },
    { icon: '🧪', text: 'Ask your local water utility where to get drinking water tested.' },
    { icon: '💧', text: 'If contamination is suspected, use a known safe supply and follow local advisories. Boiling does not remove chemicals.' },
    { icon: '🚫', text: 'Never dump chemicals, oil, or paints into storm drains or water bodies.' },
  ];

  return (
    <div className="inline-card">
      <div className="card-header">
        <Droplets size={15} color="#3b82f6" />
        <span className="card-title">Water Quality Info</span>
      </div>
      <div className="water-info-card">
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
          Real-time water quality data is not available via free APIs for {data?.city || 'this location'}. Here's what to look out for:
        </div>
        {items.map((item, i) => (
          <div key={i} className="water-info-item">
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== MEETUP PREVIEW CARD (Bot-assisted creation) =====
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

// ===== MASTER RENDERER =====
export default function InlineCards({ cards, onAction }) {
  if (!cards || cards.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
      {cards.map((card, i) => {
        switch (card.type) {
          case 'aqi':
            return <AQICard key={i} data={card.data} />;
          case 'map':
            return <MapLocationCard key={i} data={card.data} />;
          case 'meetup-list':
            return (
              <MeetupListCard
                key={i}
                data={card.data}
                onJoin={ev => onAction?.('JOIN_MEETUP', ev)}
                onLeave={ev => onAction?.('CANCEL_MEETUP', ev)}
              />
            );
          case 'meetup-preview':
            return (
              <MeetupPreviewCard
                key={i}
                data={card.data}
                onPublish={(d) => onAction && onAction('PUBLISH_MEETUP', d)}
                onCancel={() => onAction && onAction('CANCEL', null)}
              />
            );
          case 'report-preview':
            return (
              <ReportPreviewCard
                key={i}
                data={card.data}
                onSubmit={(d) => onAction && onAction('SUBMIT_REPORT', d)}
                onEdit={(d) => onAction && onAction('EDIT_REPORT', d)}
                onCancel={() => onAction && onAction('CANCEL', null)}
              />
            );
          case 'email-preview':
            return (
              <EmailPreviewCard
                key={i}
                data={card.data}
                onSave={(d) => onAction && onAction('SAVE_EMAIL_DRAFT', d)}
                onCancel={() => onAction && onAction('CANCEL', null)}
              />
            );
          case 'confirmation':
            return <ConfirmationCard key={i} data={card.data} />;
          case 'image-analysis':
            return <ImageAnalysisCard key={i} data={card.data} />;
          case 'community-feed':
            return <CommunityFeedCard key={i} data={card.data} />;
          case 'daily-plan':
            return <DailyPlanCard key={i} data={card.data} />;
          case 'water-quality':
            return <WaterQualityCard key={i} data={card.data} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

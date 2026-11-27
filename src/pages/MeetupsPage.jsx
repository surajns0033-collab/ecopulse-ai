// MeetupsPage — full meetups listing + Create Meetup modal
import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Plus, X } from 'lucide-react';
import { tools } from '../services/agentTools';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { attendanceMessage, meetupErrorMessage } from '../services/meetups';
import { useMeetups } from '../components/meetups/useMeetups';
import EventCard from '../components/meetups/EventCard';
import Header from '../components/chat/Header';
import BottomNav from '../components/BottomNav';
import { MEETUP_CATEGORIES } from '../firebase/collections';

const FILTERS = [
  { id: 'all', label: 'All Events' },
  ...MEETUP_CATEGORIES,
];

function emptyMeetupForm() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { title: '', category: 'cleanup', location: null, date: format(tomorrow, 'yyyy-MM-dd'),
    time: '7:00 AM', capacity: 25, description: '' };
}

export default function MeetupsPage() {
  const { user } = useAuth();
  const { location } = useApp();
  const { events, joinedIds, loading, error, retry } = useMeetups(user?.uid);
  const [pending, setPending] = useState(new Set());
  const [activeFilter, setActiveFilter] = useState('all');
  const visibleEvents = events.filter(event => activeFilter === 'all' || event.category === activeFilter);
  const [toastMsg, setToastMsg] = useState('');
  const dialog = useRef(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState(emptyMeetupForm);
  const venue = form.location ?? location?.city ?? '';

  function openCreate() {
    if (user?.isAnonymous && !user.isLocal) {
      setToastMsg('Sign in with Google or email to publish a meetup.');
      return;
    }
    dialog.current.showModal();
    dialog.current.querySelector('#meetup-title').focus();
  }

  async function handleCreateSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !venue.trim()) {
      setToastMsg('Please enter event title and location.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await tools.createMeetup({
        userId: user?.uid || 'guest',
        organizer: user?.displayName || 'Community Member',
        title: form.title.trim(),
        category: form.category,
        location: venue.trim(),
        date: form.date,
        time: form.time.trim() || '7:00 AM',
        capacity: Number(form.capacity) || 25,
        description: form.description.trim() || `Community ${form.category} meetup in ${venue.trim()}.`,
      });
      dialog.current.close();
      setForm(emptyMeetupForm());
      setToastMsg(result.localOnly ? 'Meetup saved on this device.' : 'Meetup published.');
    } catch (error) {
      setToastMsg(meetupErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function changePlace(event, joining) {
    if (!user) return;
    const id = event.id || event.eventId;
    setPending(previous => new Set(previous).add(id));
    try {
      const save = joining ? tools.joinMeetup : tools.cancelMeetupRSVP;
      const result = await save({ userId: user.uid, meetupDocId: event.id, meetupId: event.eventId });
      setToastMsg(attendanceMessage(result));
    } catch (error) {
      setToastMsg(meetupErrorMessage(error));
    } finally {
      setPending(previous => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    }
  }

  useEffect(() => {
    if (!toastMsg) return;
    const timer = setTimeout(() => setToastMsg(''), 6000);
    return () => clearTimeout(timer);
  }, [toastMsg]);

  return (
    <div className="app-shell">
      <Header />

      {/* Top filter bar + Create button */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Eco Meetups & Drives</span>
          <button
            className="btn-primary"
            style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={openCreate}
          >
            <Plus size={14} /> Create Meetup
          </button>
        </div>
        <div className="filter-bar">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`filter-chip${activeFilter === f.id ? ' active' : ''}`}
              aria-pressed={activeFilter === f.id}
              onClick={() => setActiveFilter(f.id)}
            >
              {f.icon && `${f.icon} `}{f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Events list */}
      <main className="page-content" aria-label="Meetup listings" tabIndex={0}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <div className="spinner" role="status" aria-label="Loading meetups" />
          </div>
        )}

        {error && <div role="alert">{error} <button className="btn-secondary" onClick={retry}>Retry</button></div>}

        {!error && !loading && visibleEvents.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🌱</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>No events yet</div>
            <div style={{ fontSize: 13, marginTop: 4, marginBottom: 14 }}>Be the first to organize a community eco-meetup!</div>
            <button className="btn-primary" onClick={openCreate}>
              + Create Meetup
            </button>
          </div>
        )}

        {!error && !loading && visibleEvents.map((event) => (
          <EventCard
            key={event.id || event.eventId}
            event={event}
            isJoined={joinedIds.has(event.id || event.eventId)}
            pending={pending.has(event.id || event.eventId)}
            onJoin={e => changePlace(e, true)}
            onLeave={e => changePlace(e, false)}
          />
        ))}
      </main>

      {/* Create Meetup Modal */}
      <dialog ref={dialog} className="meetup-dialog" aria-labelledby="create-meetup-heading"
        onClick={e => { if (e.target === e.currentTarget) dialog.current.close(); }}>
          <form className="create-modal" onSubmit={handleCreateSubmit}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 id="create-meetup-heading" style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>🌱 Create Eco Meetup</h2>
              <button type="button" aria-label="Close meetup form" onClick={() => dialog.current.close()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            <label className="modal-label" htmlFor="meetup-title">Event Title *</label>
            <input id="meetup-title"
              className="modal-input"
              placeholder="e.g. Cubbon Park Morning Clean-Up"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />

            <label className="modal-label" htmlFor="meetup-category">Category</label>
            <select id="meetup-category"
              className="modal-input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {MEETUP_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
              ))}
            </select>

            <label className="modal-label" htmlFor="meetup-location">Location / City *</label>
            <input id="meetup-location"
              className="modal-input"
              placeholder="e.g. Cubbon Park, Bengaluru"
              value={venue}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              required
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label className="modal-label" htmlFor="meetup-date">Date</label>
                <input id="meetup-date"
                  type="date"
                  className="modal-input"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div>
                <label className="modal-label" htmlFor="meetup-time">Time</label>
                <input id="meetup-time"
                  className="modal-input"
                  placeholder="7:00 AM"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                />
              </div>
            </div>

            <label className="modal-label" htmlFor="meetup-capacity">Places available</label>
            <input id="meetup-capacity" className="modal-input" type="number" min="1" step="1" required
              value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} />

            <label className="modal-label" htmlFor="meetup-description">Description</label>
            <textarea id="meetup-description"
              className="modal-input"
              rows={3}
              placeholder="What will participants do? Gloves/bags provided?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={submitting}>
                {submitting ? 'Publishing...' : '✅ Publish Meetup'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => dialog.current.close()}>
                Cancel
              </button>
            </div>
          </form>
      </dialog>

      {/* Toast */}
      {toastMsg && (
        <div role="status" style={{
          position: 'fixed', bottom: 72, left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', color: '#fff', padding: '10px 20px', borderRadius: 24,
          fontSize: 13, fontWeight: 600, zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          width: 'max-content', maxWidth: '90vw',
        }}>
          {toastMsg}
        </div>
      )}

      <BottomNav />
    </div>
  );
}

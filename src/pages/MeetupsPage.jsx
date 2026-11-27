// MeetupsPage — full meetups listing + Create Meetup modal
import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { tools } from '../services/agentTools';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import EventCard from '../components/meetups/EventCard';
import Header from '../components/chat/Header';
import BottomNav from '../components/BottomNav';
import { MEETUP_CATEGORIES } from '../firebase/collections';

const FILTERS = [
  { id: 'all', label: 'All Events' },
  ...MEETUP_CATEGORIES,
];

export default function MeetupsPage() {
  const { user } = useAuth();
  const { location } = useApp();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [joinedIds, setJoinedIds] = useState(new Set());
  const [toastMsg, setToastMsg] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: '',
    category: 'cleanup',
    location: '',
    date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    time: '7:00 AM',
    capacity: 25,
    description: '',
  });

  useEffect(() => {
    loadEvents();
    try {
      const savedRsvps = JSON.parse(localStorage.getItem('echopulse_local_rsvps') || '[]');
      if (user?.uid) {
        setJoinedIds(new Set(savedRsvps.filter((r) => r.userId === user.uid).map((r) => r.meetupId)));
      }
    } catch {}
  }, [activeFilter, user?.uid]);

  useEffect(() => {
    if (location?.city && !form.location) {
      setForm((prev) => ({ ...prev, location: location.city }));
    }
  }, [location?.city]);

  async function loadEvents() {
    setLoading(true);
    try {
      const data = await tools.getNearbyMeetups({
        lat: null,
        lng: null,
        category: activeFilter === 'all' ? null : activeFilter,
        limit: 30,
      });
      setEvents(data);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.location.trim()) {
      showToast('Please enter event title and location.');
      return;
    }
    setSubmitting(true);
    try {
      await tools.createMeetup({
        userId: user?.uid || 'guest',
        organizer: user?.displayName || 'Community Member',
        title: form.title.trim(),
        category: form.category,
        location: form.location.trim(),
        date: form.date,
        time: form.time.trim() || '7:00 AM',
        capacity: Number(form.capacity) || 25,
        description: form.description.trim() || `Community ${form.category} meetup in ${form.location.trim()}.`,
      });
      setShowCreateModal(false);
      setForm({
        title: '',
        category: 'cleanup',
        location: location?.city || '',
        date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        time: '7:00 AM',
        capacity: 25,
        description: '',
      });
      showToast('🎉 Meetup created and published!');
      await loadEvents();
    } catch {
      showToast('Could not create meetup. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(event) {
    if (!user) return;
    const eventId = event.eventId || event.id;
    try {
      const result = await tools.joinMeetup({ userId: user.uid, meetupId: eventId });
      if (result.alreadyJoined) {
        showToast('You are already registered for this event!');
      } else {
        setJoinedIds((prev) => new Set([...prev, eventId]));
        showToast('🎉 Successfully joined! See you there!');
        await loadEvents();
      }
    } catch {
      showToast('Could not join event. Please try again.');
    }
  }

  async function handleLeave(event) {
    if (!user) return;
    const eventId = event.eventId || event.id;
    try {
      await tools.cancelMeetupRSVP({ userId: user.uid, meetupId: eventId });
      setJoinedIds((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
      showToast('RSVP cancelled.');
      await loadEvents();
    } catch {
      showToast('Could not cancel RSVP. Please try again.');
    }
  }

  function showToast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  }

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
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={14} /> Create Meetup
          </button>
        </div>
        <div className="filter-bar">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`filter-chip${activeFilter === f.id ? ' active' : ''}`}
              onClick={() => setActiveFilter(f.id)}
            >
              {f.icon && `${f.icon} `}{f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Events list */}
      <div className="page-content" role="region" aria-label="Meetup listings" tabIndex={0}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <div className="spinner" />
          </div>
        )}

        {!loading && events.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🌱</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>No events yet</div>
            <div style={{ fontSize: 13, marginTop: 4, marginBottom: 14 }}>Be the first to organize a community eco-meetup!</div>
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
              + Create Meetup
            </button>
          </div>
        )}

        {!loading && events.map((event) => (
          <EventCard
            key={event.id || event.eventId}
            event={event}
            isJoined={joinedIds.has(event.eventId || event.id)}
            onJoin={handleJoin}
            onLeave={handleLeave}
          />
        ))}
      </div>

      {/* Create Meetup Modal */}
      {showCreateModal && (
        <div className="create-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <form className="create-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleCreateSubmit}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>🌱 Create Eco Meetup</h3>
              <button type="button" onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            <label className="modal-label">Event Title *</label>
            <input
              className="modal-input"
              placeholder="e.g. Cubbon Park Morning Clean-Up"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />

            <label className="modal-label">Category</label>
            <select
              className="modal-input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {MEETUP_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
              ))}
            </select>

            <label className="modal-label">Location / City *</label>
            <input
              className="modal-input"
              placeholder="e.g. Cubbon Park, Bengaluru"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              required
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label className="modal-label">Date</label>
                <input
                  type="date"
                  className="modal-input"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div>
                <label className="modal-label">Time</label>
                <input
                  className="modal-input"
                  placeholder="7:00 AM"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                />
              </div>
            </div>

            <label className="modal-label">Description</label>
            <textarea
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
              <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 72, left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', color: '#fff', padding: '10px 20px', borderRadius: 24,
          fontSize: 13, fontWeight: 600, zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          whiteSpace: 'nowrap',
        }}>
          {toastMsg}
        </div>
      )}

      <BottomNav />
    </div>
  );
}

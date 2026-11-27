import { Plus } from 'lucide-react';
import EventCard from '../components/meetups/EventCard';
import Header from '../components/chat/Header';
import BottomNav from '../components/BottomNav';
import { MEETUP_CATEGORIES } from '../firebase/collections';
import { MeetupDialog } from './MeetupDialog.jsx';
import { useMeetupListing } from './useMeetupListing.js';

const FILTERS = [
  { id: 'all', label: 'All Events' },
  ...MEETUP_CATEGORIES,
];

export default function MeetupsPage() {
  const model = useMeetupListing();
  const { loading, error, retry, joinedIds, pending, activeFilter, setActiveFilter, visibleEvents, toastMsg, openCreate, changePlace } = model;

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


      <MeetupDialog dialog={model.dialog} form={model.form} setForm={model.setForm} venue={model.venue}
        handleCreateSubmit={model.handleCreateSubmit} formError={model.formError} submitting={model.submitting} />

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

import { communityMessageKey } from '../services/communityMessages';
import Header from '../components/chat/Header';
import BottomNav from '../components/BottomNav';
import { format } from 'date-fns';
import { Users, Calendar } from 'lucide-react';
import { PostCard } from './CommunityPost.jsx';
import { CommunityComposer } from './CommunityComposer.jsx';
import { useCommunityFeed } from './useCommunityFeed.js';

export default function CommunityPage() {
  const model = useCommunityFeed();
  const { user, communityNameConfirmed, selectLocation, locationFilter, availableLocations, messagesRef, handleScroll, handleSaveName,
    nameInput, setNameDraft, nameError, loading, events, navigate, visiblePosts, handleDeletePost } = model;

  function formatEventDate(d) {
    if (!d) return 'TBD';
    try {
      if (d?.toDate) return format(d.toDate(), 'EEE d MMM');
      return format(new Date(d), 'EEE d MMM');
    } catch { return 'TBD'; }
  }


  return (
    <div className="app-shell">
      <Header />

      {/* Public Channel Location Filter Bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '10px 12px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={15} color="#22c55e" /> Public Community Channel (All Locations)
        </div>
        <div className="filter-bar">
          <button
            className={`filter-chip${locationFilter === 'all' ? ' active' : ''}`}
            aria-pressed={locationFilter === 'all'}
            onClick={() => selectLocation('all')}
          >
            🌍 All Locations
          </button>
          {availableLocations.map((loc) => (
            <button
              key={loc}
              className={`filter-chip${locationFilter === loc ? ' active' : ''}`}
              aria-pressed={locationFilter === loc}
              onClick={() => selectLocation(loc)}
            >
              📍 {loc}
            </button>
          ))}
        </div>
      </div>

      <main className="page-content" aria-label="Community messages" tabIndex={0} ref={messagesRef} style={{ paddingBottom: 12 }} onScroll={handleScroll}>
        {user && !user.isAnonymous && (
          <form onSubmit={handleSaveName} className="community-name-panel">
            <div>
              <div className="community-name-title">Your public community name</div>
              <div className="community-name-note">Only this name is shown with posts. Your email is never published.</div>
            </div>
            <div className="community-name-controls">
              <input
                value={nameInput}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Choose a name"
                maxLength={24}
                aria-label="Public community name"
              />
              <button type="submit" disabled={!nameInput.trim()}>{communityNameConfirmed ? 'Update' : 'Save'}</button>
            </div>
            {nameError && <div className="community-name-error" role="alert">{nameError}</div>}
          </form>
        )}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <div className="spinner" />
          </div>
        )}

        {/* Upcoming Events preview */}
        {!loading && events.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={15} color="#22c55e" /> Upcoming Meetups
              </span>
              <button
                onClick={() => navigate('/meetups')}
                style={{ background: 'none', border: 'none', color: 'var(--green-dark)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                See all →
              </button>
            </div>
            {events.slice(0, 2).map((ev) => (
              <div key={ev.id || ev.eventId} className="report-detail-section" style={{ marginBottom: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{ev.title}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                  📅 {formatEventDate(ev.date)} • 📍 {ev.location}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Public Channel Messages */}
        {!loading && (
          <div>
            {visiblePosts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#64748b', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>💬</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Start the conversation!</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Share an eco-update, local alert, or invite people from your city below.</div>
              </div>
            ) : (
              visiblePosts.map((post) => (
                <PostCard
                  key={communityMessageKey(post)}
                  post={post}
                  canDelete={Boolean(user && post.userId === user.uid)}
                  onDelete={handleDeletePost}
                />
              ))
            )}
          </div>
        )}
      </main>

      <CommunityComposer user={user} communityNameConfirmed={communityNameConfirmed} handleSignInToPost={model.handleSignInToPost}
        handleSendPost={model.handleSendPost} postCity={model.postCity} setPostCity={model.setPostCity}
        msgText={model.msgText} setMsgText={model.setMsgText} sending={model.sending} />

      <BottomNav />
    </div>
  );
}

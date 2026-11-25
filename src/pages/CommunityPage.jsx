// CommunityPage — Public Community Chat Channel across all locations + Upcoming Events
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tools } from '../services/agentTools';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/chat/Header';
import BottomNav from '../components/BottomNav';
import { format } from 'date-fns';
import { Users, Calendar, Send, MapPin, Trash2 } from 'lucide-react';

function PostCard({ post, canDelete, onDelete }) {
  function getInitials(name) {
    return (name || 'U').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  }
  function formatDate(d) {
    if (!d) return '';
    try {
      if (d?.toDate) return format(d.toDate(), 'd MMM, h:mm a');
      return format(new Date(d), 'd MMM, h:mm a');
    } catch { return ''; }
  }

  return (
    <div className="report-detail-section" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="community-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
            {getInitials(post.author || post.userId)}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{post.author || 'Community Member'}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{formatDate(post.createdAt)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {post.location && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            background: '#dcfce7', color: '#15803d', fontSize: 11,
            fontWeight: 600, padding: '2px 8px', borderRadius: 12,
          }}>
            <MapPin size={10} /> {post.location}
          </span>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete(post)}
            aria-label="Delete your message"
            title="Delete your message"
            style={{ border: 0, background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: 5, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
          >
            <Trash2 size={12} />
          </button>
        )}
        </div>
      </div>
      <div style={{ fontSize: 13.5, color: '#1e293b', lineHeight: 1.5 }}>{post.text || post.description}</div>
    </div>
  );
}

function uniquePosts(items) {
  const seen = new Set();
  return (items || []).filter((post) => {
    const key = post.id || `${post.userId || ''}:${post.createdAt?.seconds || post.createdAt || ''}:${post.text || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function CommunityPage() {
  const navigate = useNavigate();
  const {
    user,
    communityName,
    communityNameConfirmed,
    saveCommunityName,
    signOut,
  } = useAuth();

  const [posts, setPosts] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locationFilter, setLocationFilter] = useState('all');
  const [msgText, setMsgText] = useState('');
  const [postCity, setPostCity] = useState('Global');
  const [sending, setSending] = useState(false);
  const sendLockRef = useRef(false);
  const [nameInput, setNameInput] = useState(communityName || '');
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    setNameInput(communityName || '');
  }, [communityName]);

  const canPost = Boolean(user && !user.isAnonymous && communityNameConfirmed);

  async function loadData() {
    setLoading(true);
    try {
      const [postsData, eventsData] = await Promise.all([
        tools.getCommunityFeed({ limit: 50 }),
        tools.getNearbyMeetups({ limit: 3 }),
      ]);
      setPosts(uniquePosts(postsData));
      setEvents(eventsData);
    } catch (err) {
      console.error('Community load failed:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    const unsubscribe = tools.subscribeCommunityFeed({ limit: 50 }, (latestPosts) => {
      setPosts(uniquePosts(latestPosts));
    });
    return () => unsubscribe?.();
  }, []);

  async function handleSendPost(e) {
    e.preventDefault();
    const text = msgText.trim();
    if (!text || sending || sendLockRef.current || !canPost) return;
    sendLockRef.current = true;
    setSending(true);
    try {
      const created = await tools.createCommunityPost({
        userId: user?.uid || 'guest',
        author: communityName,
        text,
        location: postCity.trim() || 'Global',
      });
      setPosts((prev) => prev.some((post) => post.id === created.id)
        ? prev
        : uniquePosts([created, ...prev]));
      setMsgText('');
    } catch (err) {
      console.error('Failed to post:', err);
    } finally {
      sendLockRef.current = false;
      setSending(false);
    }
  }

  function handleSaveName(e) {
    e.preventDefault();
    setNameError('');
    try {
      saveCommunityName(nameInput);
    } catch (err) {
      setNameError(err?.message || 'Choose another public name.');
    }
  }

  async function handleSignInToPost() {
    await signOut();
    navigate('/');
  }

  async function handleDeletePost(post) {
    if (!user || post.userId !== user.uid) return;
    if (!window.confirm('Delete this community message?')) return;
    try {
      await tools.deleteCommunityPost({ postId: post.id, userId: user.uid });
      setPosts((current) => current.filter((item) => item.id !== post.id));
    } catch (err) {
      console.error('Could not delete community message:', err);
    }
  }

  function formatEventDate(d) {
    if (!d) return 'TBD';
    try {
      if (d?.toDate) return format(d.toDate(), 'EEE d MMM');
      return format(new Date(d), 'EEE d MMM');
    } catch { return 'TBD'; }
  }

  // Unique locations from posts for filtering
  const availableLocations = Array.from(
    new Set(posts.map((p) => p.location).filter(Boolean))
  );

  const visiblePosts = locationFilter === 'all'
    ? posts
    : posts.filter((p) => (p.location || '').toLowerCase() === locationFilter.toLowerCase());

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
            onClick={() => setLocationFilter('all')}
          >
            🌍 All Locations
          </button>
          {availableLocations.map((loc) => (
            <button
              key={loc}
              className={`filter-chip${locationFilter === loc ? ' active' : ''}`}
              onClick={() => setLocationFilter(loc)}
            >
              📍 {loc}
            </button>
          ))}
        </div>
      </div>

      <div className="page-content" style={{ paddingBottom: 12 }}>
        {user && !user.isAnonymous && (
          <form onSubmit={handleSaveName} className="community-name-panel">
            <div>
              <div className="community-name-title">Your public community name</div>
              <div className="community-name-note">Only this name is shown with posts. Your email is never published.</div>
            </div>
            <div className="community-name-controls">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Choose a name"
                maxLength={24}
                aria-label="Public community name"
              />
              <button type="submit" disabled={!nameInput.trim()}>{communityNameConfirmed ? 'Update' : 'Save'}</button>
            </div>
            {nameError && <div className="community-name-error">{nameError}</div>}
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
                style={{ background: 'none', border: 'none', color: '#16a34a', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
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
              visiblePosts.map((post, i) => (
                <PostCard
                  key={post.id || i}
                  post={post}
                  canDelete={Boolean(user && post.userId === user.uid)}
                  onDelete={handleDeletePost}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Public Channel Message Composer */}
      {user?.isAnonymous ? (
        <div className="community-readonly">
          <span>Guest mode is read-only in the public channel.</span>
          <button onClick={handleSignInToPost}>Sign in to post</button>
        </div>
      ) : !communityNameConfirmed ? (
        <div className="community-readonly">
          <span>Choose and save your public name above to join the conversation.</span>
        </div>
      ) : (
      <form className="community-composer" onSubmit={handleSendPost}>
        <div className="community-composer-loc">
          <MapPin size={12} color="#16a34a" />
          <input
            type="text"
            value={postCity}
            onChange={(e) => setPostCity(e.target.value)}
            placeholder="Your city (e.g. Bengaluru)"
            aria-label="Your city"
          />
        </div>
        <div className="community-composer-row">
          <input
            type="text"
            className="community-composer-input"
            placeholder="Share an update in the public channel..."
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
            maxLength={1000}
            aria-label="Community message"
          />
          <button
            type="submit"
            className="send-btn"
            disabled={!msgText.trim() || sending}
            aria-label="Post message"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
      )}

      <BottomNav />
    </div>
  );
}

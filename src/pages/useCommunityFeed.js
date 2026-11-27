import { logFailure } from '../services/diagnostics.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tools } from '../services/agentTools';
import { orderCommunityMessages } from '../services/communityMessages';
import { useAuth } from '../contexts/AuthContext';

export function useCommunityFeed() {

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
  const messagesRef = useRef(null);
  const followLatest = useRef(true);
  const [nameDraft, setNameDraft] = useState(null);
  const nameInput = nameDraft ?? communityName ?? '';
  const [nameError, setNameError] = useState('');

  const canPost = Boolean(user && !user.isAnonymous && communityNameConfirmed);

  useEffect(() => {
    let mounted = true;
    let receivedLivePosts = false;
    Promise.all([tools.getCommunityFeed({ limit: 50 }), tools.getNearbyMeetups({ limit: 3 })])
      .then(([postsData, eventsData]) => {
        if (!mounted) return;
        if (!receivedLivePosts) setPosts(orderCommunityMessages(postsData));
        setEvents(eventsData);
      })
      .catch(() => logFailure('community.load'))
      .finally(() => { if (mounted) setLoading(false); });
    const unsubscribe = tools.subscribeCommunityFeed({ limit: 50 }, (latestPosts) => {
      if (!mounted) return;
      receivedLivePosts = true;
      setPosts(orderCommunityMessages(latestPosts));
    });
    return () => { mounted = false; unsubscribe?.(); };
  }, []);

  const needsName = Boolean(user && !user.isAnonymous && !communityNameConfirmed);
  useLayoutEffect(() => {
    const panel = messagesRef.current;
    if (panel && !loading && !needsName && followLatest.current) panel.scrollTop = panel.scrollHeight;
  }, [loading, needsName, posts, locationFilter]);

  function selectLocation(location) {
    followLatest.current = true;
    setLocationFilter(location);
  }

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
      followLatest.current = true;
      setPosts((prev) => orderCommunityMessages([...prev, created]).slice(-50));
      setMsgText('');
    } catch {
      logFailure('community.send');
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
      setNameDraft(null);
      if (needsName) followLatest.current = true;
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
    } catch {
      logFailure('community.delete');
    }
  }

  // Unique locations from posts for filtering
  const availableLocations = Array.from(
    new Set(posts.map((p) => p.location).filter(Boolean))
  );

  const visiblePosts = locationFilter === 'all'
    ? posts
    : posts.filter((p) => (p.location || '').toLowerCase() === locationFilter.toLowerCase());

  return { user, communityNameConfirmed, selectLocation, locationFilter, availableLocations, messagesRef, followLatest, handleSaveName, nameInput, setNameDraft, nameError, loading, events, navigate, visiblePosts, handleDeletePost, handleSignInToPost, handleSendPost, postCity, setPostCity, msgText, setMsgText, sending };
}

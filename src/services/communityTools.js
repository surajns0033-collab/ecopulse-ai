import { collection, addDoc, getDocs, doc, deleteDoc, query, orderBy, limit as fsLimit, Timestamp, onSnapshot } from 'firebase/firestore';
import { isFirebaseConfigured } from '../firebase/config';
import { db } from '../firebase/firestoreClient';
import { COLLECTIONS } from '../firebase/collections';
import { readLocal, writeLocal, STORAGE_KEYS, firestoreOrLocal } from './toolStorage.js';

export const communityTools = {
  /**
   * Get community posts (public channel across all locations)
   */
  getCommunityFeed: async ({ limit: lim = 30, locationFilter = null } = {}) => {
    return firestoreOrLocal(
      async () => {
        const q = query(
          collection(db, COLLECTIONS.COMMUNITY_POSTS),
          orderBy('createdAt', 'desc'),
          fsLimit(lim)
        );
        const snap = await getDocs(q);
        let posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (locationFilter && locationFilter !== 'all') {
          posts = posts.filter((p) => (p.location || '').toLowerCase().includes(locationFilter.toLowerCase()));
        }
        return posts;
      },
      () => {
        let posts = readLocal(STORAGE_KEYS.POSTS);
        if (locationFilter && locationFilter !== 'all') {
          posts = posts.filter((p) => (p.location || '').toLowerCase().includes(locationFilter.toLowerCase()));
        }
        return posts.slice(0, lim);
      }
    );
  },

  /** Subscribe to public community messages in real time. */
  subscribeCommunityFeed: ({ limit: lim = 50 } = {}, onChange) => {
    if (isFirebaseConfigured) {
      const q = query(
        collection(db, COLLECTIONS.COMMUNITY_POSTS),
        orderBy('createdAt', 'desc'),
        fsLimit(lim)
      );
      return onSnapshot(q, (snapshot) => {
        onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      }, (error) => {
        console.warn('Community live updates unavailable:', error.message);
      });
    }

    const emitLocal = () => onChange(readLocal(STORAGE_KEYS.POSTS).slice(0, lim));
    emitLocal();
    const handleStorage = (event) => {
      if (event.key === STORAGE_KEYS.POSTS) emitLocal();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  },

  /**
   * Post a message to the public community channel
   */
  createCommunityPost: async ({ userId, author, text, location, tags = [] }) => {
    const postData = {
      userId: userId || 'guest',
      author: author || 'Community Member',
      text: text.trim(),
      location: (location || 'Global').trim(),
      tags,
      createdAt: new Date().toISOString(),
    };

    return firestoreOrLocal(
      async () => {
        const docRef = await addDoc(collection(db, COLLECTIONS.COMMUNITY_POSTS), {
          ...postData,
          createdAt: Timestamp.now(),
        });
        return { id: docRef.id, ...postData };
      },
      () => {
        const saved = { id: 'post-' + Date.now(), ...postData };
        const existing = readLocal(STORAGE_KEYS.POSTS);
        writeLocal(STORAGE_KEYS.POSTS, [saved, ...existing]);
        return saved;
      }
    );
  },

  /** Delete a community post owned by the current user. Firestore rules enforce ownership too. */
  deleteCommunityPost: async ({ postId, userId }) => {
    if (!postId || !userId) throw new Error('Post and user are required.');
    return firestoreOrLocal(
      async () => {
        await deleteDoc(doc(db, COLLECTIONS.COMMUNITY_POSTS, postId));
        return { success: true };
      },
      () => {
        const remaining = readLocal(STORAGE_KEYS.POSTS).filter((post) => !(post.id === postId && post.userId === userId));
        writeLocal(STORAGE_KEYS.POSTS, remaining);
        return { success: true };
      }
    );
  },

};

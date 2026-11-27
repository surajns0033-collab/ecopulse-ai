import { isFirebaseConfigured } from '../firebase/config';

// Persistent localStorage fallback store for when Firebase isn't configured
export function readLocal(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const STORAGE_KEYS = {
  POSTS: 'echopulse_local_posts',
  DRAFTS: 'echopulse_local_drafts',
};

export const localStore = {
  actions: [],
};

// Helper: skip Firestore immediately when not configured, otherwise try Firestore with local fallback
export async function firestoreOrLocal(firestoreFn, localFallback) {
  if (!isFirebaseConfigured) return localFallback();
  try {
    return await firestoreFn();
  } catch (err) {
    console.warn('Firestore unavailable, using local fallback:', err.message);
    return localFallback();
  }
}

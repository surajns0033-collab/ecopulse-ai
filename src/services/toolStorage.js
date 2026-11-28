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
  localStorage.setItem(key, JSON.stringify(value));
}

export const STORAGE_KEYS = {
  POSTS: 'echopulse_local_posts',
};

// Device storage is selected only for a device session. A rejected cloud write
// must reach the caller so a private device record cannot look like a public post.
export function firestoreOrLocal(firestoreFn, localFallback) {
  return isFirebaseConfigured ? firestoreFn() : localFallback();
}

import { COLLECTIONS } from '../firebase/collections';
import { isFirebaseConfigured } from '../firebase/config';
import { db } from '../firebase/firestoreClient';
import { addDoc, collection, Timestamp } from 'firebase/firestore';

export async function logAction(userId, action, data) {
  if (!userId || !isFirebaseConfigured) return;
  try {
    await addDoc(collection(db, COLLECTIONS.AI_ACTION_LOGS), {
      userId, action, data, timestamp: Timestamp.now(),
    });
  } catch { /* analytics must not block a reply */ }
}

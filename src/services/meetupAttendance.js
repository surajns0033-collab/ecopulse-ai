import { collection, doc, getDocFromServer, getDocs, limit, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { COLLECTIONS } from '../firebase/collections.js';

// Hex keeps the owner prefix unambiguous even when an auth UID contains punctuation.
export function attendanceId(userId, meetupDocId) {
  const owner = Array.from(new TextEncoder().encode(userId), byte => byte.toString(16).padStart(2, '0')).join('');
  return owner + '!' + meetupDocId;
}

export function joinedMeetupIds(rows) {
  return new Set(rows.map(row => row.meetupDocId || row.meetupId).filter(Boolean));
}

async function eventReference(db, documentId, code) {
  if (documentId) return doc(db, COLLECTIONS.MEETUPS, documentId);
  // Older chat cards contain the public code alone.
  const matches = await getDocs(query(collection(db, COLLECTIONS.MEETUPS), where('eventId', '==', code), limit(2)));
  if (matches.size > 1) throw new Error('Open the event in the Events tab to choose the correct meetup.');
  return matches.docs[0]?.ref || doc(db, COLLECTIONS.MEETUPS, code);
}

function missingEvent(tx, member, joining) {
  if (joining) throw new Error('This meetup is no longer available.');
  if (member.exists()) tx.delete(member.ref);
  return { joined: false, changed: member.exists(), participantCount: 0 };
}

export async function saveMeetupAttendance(db, { userId, meetupDocId, meetupId, joining }) {
  if (!userId || !(meetupDocId || meetupId)) throw new Error('Sign in and select a meetup to continue.');
  const eventRef = await eventReference(db, meetupDocId, meetupId);
  const receipt = doc(db, COLLECTIONS.RSVPS, attendanceId(userId, eventRef.id));
  let observed;
  const attempt = () => runTransaction(db, async tx => {
    const [event, member] = await Promise.all([tx.get(eventRef), tx.get(receipt)]);
    observed = { count: event.data()?.participantCount, joined: member.exists() };
    return updatePlace(tx, event, member, joining, userId);
  });

  // Rules can see a competing commit before Firestore checks the transaction
  // version. Retry a denial only when a server read confirms attendance changed.
  for (let retry = 0; ; retry++) {
    observed = undefined;
    try {
      return await attempt();
    } catch (error) {
      if (error.code !== 'permission-denied' || !observed || retry >= 3) throw error;
      const [latest, member] = await Promise.all([getDocFromServer(eventRef), getDocFromServer(receipt)]);
      if (latest.data()?.participantCount === observed.count && member.exists() === observed.joined) throw error;
    }
  }
}

function updatePlace(tx, event, member, joining, userId) {
  const eventRef = event.ref;
  const receipt = member.ref;
  if (!event.exists()) return missingEvent(tx, member, joining);
  const data = event.data();
  if (data.attendanceVersion !== 2) throw new Error('Attendance for this older meetup is being updated.');
  const count = data.participantCount;
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('The attendance count needs to be checked.');
  if (member.exists() === joining) return { joined: joining, changed: false, participantCount: count };
  if (joining && data.status !== 'published') throw new Error('This meetup is closed for registration.');
  if (joining && Number.isInteger(data.capacity) && count >= data.capacity) {
    return { joined: false, changed: false, full: true, participantCount: count };
  }

  const nextCount = count + (joining ? 1 : -1);
  if (nextCount < 0) throw new Error('The attendance count needs to be checked.');
  if (joining) {
    const code = typeof data.eventId === 'string' && data.eventId ? data.eventId : eventRef.id;
    tx.set(receipt, { userId, meetupDocId: eventRef.id, meetupId: code, createdAt: serverTimestamp() });
  } else {
    tx.delete(receipt);
  }
  tx.update(eventRef, { participantCount: nextCount });
  return { joined: joining, changed: true, participantCount: nextCount };
}

import { collection, doc, getDocs, limit, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { COLLECTIONS } from '../firebase/collections.js';

// Hex keeps the owner prefix unambiguous even when an auth UID contains punctuation.
export function attendanceId(userId, meetupDocId) {
  const owner = Array.from(new TextEncoder().encode(userId), byte => byte.toString(16).padStart(2, '0')).join('');
  return owner + '!' + meetupDocId;
}

export function joinedMeetupIds(rows) {
  return new Set(rows.map(row => row.meetupDocId || row.meetupId).filter(Boolean));
}

export async function saveMeetupAttendance(db, { userId, meetupDocId, meetupId, joining }) {
  if (!userId || !(meetupDocId || meetupId)) throw new Error('Sign in and select a meetup to continue.');
  let eventRef;
  if (meetupDocId) {
    eventRef = doc(db, COLLECTIONS.MEETUPS, meetupDocId);
  } else {
    // Previously saved Chat cards may carry only the public event code.
    const matches = await getDocs(query(collection(db, COLLECTIONS.MEETUPS), where('eventId', '==', meetupId), limit(2)));
    if (matches.size > 1) throw new Error('Open the event in the Events tab to choose the correct meetup.');
    eventRef = matches.docs[0]?.ref || doc(db, COLLECTIONS.MEETUPS, meetupId);
  }
  const receipt = doc(db, COLLECTIONS.RSVPS, attendanceId(userId, eventRef.id));
  return runTransaction(db, async tx => {
    const [event, member] = await Promise.all([tx.get(eventRef), tx.get(receipt)]);
    if (!event.exists()) {
      if (joining) throw new Error('This meetup is no longer available.');
      if (member.exists()) tx.delete(receipt);
      return { joined: false, changed: member.exists(), participantCount: 0 };
    }
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
      tx.set(receipt, { userId, meetupDocId: eventRef.id, meetupId: typeof data.eventId === 'string' && data.eventId ? data.eventId : eventRef.id, createdAt: serverTimestamp() });
    } else {
      tx.delete(receipt);
    }
    tx.update(eventRef, { participantCount: nextCount });
    return { joined: joining, changed: true, participantCount: nextCount };
  });
}

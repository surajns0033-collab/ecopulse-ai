import { collection, getDocs, limit, orderBy, query, startAfter, Timestamp, where } from 'firebase/firestore';
import { COLLECTIONS } from '../firebase/collections.js';
import { selectUpcomingEvents } from './meetupDiscovery.js';

export async function cloudUpcomingEvents(database, filters, signal) {
  const { since, category, city, max } = filters;
  const collectionRef = collection(database, COLLECTIONS.MEETUPS);
  const constraints = [where('status', '==', 'published'), where('date', '>=', Timestamp.fromDate(since))];
  if (category) constraints.push(where('category', '==', category));
  const pageSize = city ? Math.max(max, 30) : max;
  const matches = [];
  let cursor;
  do {
    signal?.throwIfAborted();
    const paging = cursor ? [startAfter(cursor)] : [];
    const snapshot = await getDocs(query(collectionRef, ...constraints, orderBy('date'), ...paging, limit(pageSize)));
    matches.push(...selectUpcomingEvents(snapshot.docs.map(item => ({ ...item.data(), id: item.id })), { ...filters, max: max - matches.length }));
    cursor = snapshot.size === pageSize ? snapshot.docs.at(-1) : null;
  } while (cursor && matches.length < max);
  return matches;
}

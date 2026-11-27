import { addDoc, collection, getDocs, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { isFirebaseConfigured } from '../firebase/config';
import { db } from '../firebase/firestoreClient';
import { COLLECTIONS, generateEventId } from '../firebase/collections.js';
import { joinedMeetupIds, saveMeetupAttendance } from './meetupAttendance.js';
import {
  localMeetups, localMeetupsKey, localParticipants, notifyLocalMeetups, readLocalAttendance,
  saveLocalAttendance, watchLocalMeetups,
} from './localMeetupAttendance.js';

function publishedMeetups(max) {
  return query(collection(db, COLLECTIONS.MEETUPS), where('status', '==', 'published'), orderBy('date'), limit(max));
}

function eventRows(snapshot) {
  return snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
}

function deviceEvents(rows) {
  return localMeetups().filter(event => !event.status || event.status === 'published')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(event => ({ ...event, participantCount: localParticipants(rows, event.eventId || event.id) }));
}

export async function getNearbyMeetups({ category, limit: max = 10 } = {}) {
  const events = isFirebaseConfigured
    ? eventRows(await getDocs(publishedMeetups(max)))
    : deviceEvents(await readLocalAttendance());
  return events.filter(event => !category || event.category === category).slice(0, max);
}

export function subscribeMeetups(userId, onChange, onError) {
  let active = true;
  let events;
  let joinedIds;
  function emit() {
    if (active && events && joinedIds) onChange({ events, joinedIds });
  }
  function fail(error) {
    if (active) {
      active = false;
      onError(error);
    }
  }
  if (isFirebaseConfigured) {
    const stopEvents = onSnapshot(publishedMeetups(30), snapshot => { events = eventRows(snapshot); emit(); }, fail);
    const ownReceipts = query(collection(db, COLLECTIONS.RSVPS), where('userId', '==', userId));
    const stopReceipts = onSnapshot(ownReceipts, snapshot => {
      joinedIds = joinedMeetupIds(snapshot.docs.map(item => item.data()));
      emit();
    }, fail);
    return () => { active = false; stopEvents(); stopReceipts(); };
  }

  let generation = 0;
  async function refresh() {
    const current = ++generation;
    try {
      const rows = await readLocalAttendance();
      if (!active || current !== generation) return;
      events = deviceEvents(rows).slice(0, 30);
      joinedIds = joinedMeetupIds(rows.filter(row => row.userId === userId));
      emit();
    } catch (error) { fail(error); }
  }
  const stop = watchLocalMeetups(refresh);
  refresh();
  return () => { active = false; stop(); };
}

export async function createMeetup({ userId, organizer, title, description, category, location, date, time, capacity, lat, lng }) {
  const places = Number(capacity ?? 20);
  if (!Number.isSafeInteger(places) || places < 1) throw new Error('Capacity must be a positive whole number.');
  const eventId = generateEventId();
  const when = date ? new Date(date) : new Date();
  const now = Timestamp.now();
  const event = {
    eventId, userId, organizer: organizer || 'Community Member', title, description, category, location,
    date: Timestamp.fromDate(when), time, capacity: places, lat: lat ?? null, lng: lng ?? null,
    attendanceVersion: 2, participantCount: 0, status: 'published', isSeeded: false, createdAt: now, updatedAt: now,
  };
  if (isFirebaseConfigured) {
    const ref = await addDoc(collection(db, COLLECTIONS.MEETUPS), event);
    return { eventId, docId: ref.id };
  }
  const local = { ...event, id: eventId, date: when.toISOString(), createdAt: now.toDate().toISOString(), updatedAt: now.toDate().toISOString() };
  localStorage.setItem(localMeetupsKey, JSON.stringify([local, ...localMeetups()]));
  notifyLocalMeetups();
  return { eventId, docId: eventId, event: local, localOnly: true };
}

async function changeAttendance(args, joining) {
  if (isFirebaseConfigured) return saveMeetupAttendance(db, { ...args, joining });
  const event = localMeetups().find(item => args.meetupDocId ? item.id === args.meetupDocId : (item.eventId || item.id) === args.meetupId);
  if (!event) throw new Error('This meetup is no longer available.');
  return saveLocalAttendance(event, args.userId, joining);
}

export async function joinMeetup(args) {
  const result = await changeAttendance(args, true);
  return { ...result, success: result.joined, alreadyJoined: result.joined && !result.changed };
}

export async function cancelMeetupRSVP(args) {
  return { ...await changeAttendance(args, false), success: true };
}

export function attendanceMessage(result) {
  if (result.full) return 'The last place has been taken. This event is full.';
  const message = result.joined
    ? (result.changed ? 'Your place is confirmed.' : 'You already have a place.')
    : (result.changed ? 'Your place has been cancelled.' : 'You have no place reserved.');
  return result.localOnly ? message + ' Saved on this device.' : message;
}

export function meetupErrorMessage(error) {
  if (error?.code === 'permission-denied') return 'Access was denied. Check your sign-in and try again.';
  if (error?.code) return 'Could not reach the meetup service. Check your connection and try again.';
  return error?.message || 'Could not update attendance. Please try again.';
}

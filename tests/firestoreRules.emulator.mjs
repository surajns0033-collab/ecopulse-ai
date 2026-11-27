import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInAnonymously } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDocFromServer, getDocsFromServer, getFirestore, query, serverTimestamp, where, writeBatch,
  setDoc, setLogLevel, terminate, updateDoc,
} from 'firebase/firestore';

import { attendanceId, joinedMeetupIds, saveMeetupAttendance } from '../src/services/meetupAttendance.js';

const clients = [];
let owner;
let neighbour;
let guest;

function localEmulator(name) {
  const address = process.env[name];
  if (!address) throw new Error('Start the emulators with npm run test:rules.');
  const url = new URL('http://' + address);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Rules fixtures require a loopback emulator');
  assert.ok(url.port, 'The emulator must specify a port');
  return url;
}

async function client(name, anonymous = false) {
  const authHost = localEmulator('FIREBASE_AUTH_EMULATOR_HOST');
  const storeHost = localEmulator('FIRESTORE_EMULATOR_HOST');
  const app = initializeApp({ projectId: 'demo-ecopulse', apiKey: 'demo-key' }, name);
  const auth = getAuth(app);
  const db = getFirestore(app);
  clients.push({ app, db });
  connectAuthEmulator(auth, authHost.origin, { disableWarnings: true });
  connectFirestoreEmulator(db, storeHost.hostname, Number(storeHost.port));
  const credential = anonymous ? await signInAnonymously(auth) :
    await createUserWithEmailAndPassword(auth, name + '-' + randomUUID() + '@example.test', randomUUID());
  return { uid: credential.user.uid, db };
}

const permissionDenied = (error) => error?.code === 'permission-denied';

before(async () => {
  setLogLevel('silent');
  [owner, neighbour, guest] = await Promise.all([client('owner'), client('neighbour'), client('guest', true)]);
});

after(async () => {
  await Promise.all(clients.map(async ({ app, db }) => {
    await terminate(db);
    await deleteApp(app);
  }));
});

test('private records remain accessible to their owner throughout normal edits', async () => {
  const collections = ['environmentalReports', 'emailDrafts', 'communityActions',
    'userActions', 'aiConversations', 'aiActionLogs'];
  for (const collection of collections) {
    const own = doc(owner.db, collection, randomUUID());
    const otherView = doc(neighbour.db, own.path);
    await setDoc(own, { userId: owner.uid, note: 'initial' });
    await updateDoc(own, { note: 'updated' });
    assert.equal((await getDocFromServer(own)).data().note, 'updated');
    await assert.rejects(getDocFromServer(otherView), permissionDenied);
    await assert.rejects(updateDoc(otherView, { note: 'change' }), permissionDenied);
    await assert.rejects(updateDoc(own, { userId: neighbour.uid }), permissionDenied);
    await deleteDoc(own);
  }
});

test('community post edits preserve the public schema and the author', async () => {
  const post = doc(owner.db, 'communityPosts', randomUUID());
  const data = { userId: owner.uid, author: 'Neighbour', text: 'Cleaner air today', location: 'Pune' };
  await setDoc(post, data);
  await updateDoc(post, { text: 'Meet near the park' });
  assert.equal((await getDocFromServer(doc(guest.db, post.path))).data().text, 'Meet near the park');
  await assert.rejects(updateDoc(post, { email: 'private@example.test' }), permissionDenied);
  await assert.rejects(updateDoc(post, { userId: neighbour.uid }), permissionDenied);
  await assert.rejects(setDoc(doc(guest.db, 'communityPosts', randomUUID()), { ...data, userId: guest.uid }), permissionDenied);
  await deleteDoc(post);
});

test('a meetup organizer can edit the event while keeping its ownership', async () => {
  const meetup = doc(owner.db, 'meetups', randomUUID());
  await setDoc(meetup, meetupData());
  await updateDoc(meetup, { title: 'Clean-air gathering' });
  await assert.rejects(updateDoc(meetup, { userId: neighbour.uid }), permissionDenied);
  await assert.rejects(updateDoc(doc(neighbour.db, meetup.path), { title: 'Changed' }), permissionDenied);
  await deleteDoc(meetup);
});

function meetupData(capacity = 4) {
  return { userId: owner.uid, title: 'Clean-air walk', eventId: randomUUID(), status: 'published',
    attendanceVersion: 2, participantCount: 0, capacity };
}

async function createMeetup(capacity) {
  const ref = doc(owner.db, 'meetups', randomUUID());
  await setDoc(ref, meetupData(capacity));
  return ref;
}

function attend(person, event, joining = true) {
  return saveMeetupAttendance(person.db, { userId: person.uid, meetupDocId: event.id, joining });
}

function receipt(person, event) {
  return doc(person.db, 'meetupRSVPs', attendanceId(person.uid, event.id));
}

async function count(event) {
  return (await getDocFromServer(event)).data().participantCount;
}

test('two attendees join concurrently and their private registrations survive a fresh server read', async () => {
  const event = await createMeetup(2);
  const joined = await Promise.all([attend(neighbour, event), attend(guest, event)]);
  assert.ok(joined.every(result => result.joined && result.changed));
  assert.equal(await count(event), 2);
  for (const person of [neighbour, guest]) {
    const snapshot = await getDocsFromServer(query(collection(person.db, 'meetupRSVPs'), where('userId', '==', person.uid)));
    assert.ok(joinedMeetupIds(snapshot.docs.map(d => d.data())).has(event.id));
  }
  await assert.rejects(getDocFromServer(doc(owner.db, receipt(guest, event).path)), permissionDenied);
  await assert.rejects(getDocsFromServer(collection(neighbour.db, 'meetupRSVPs')), permissionDenied);
  await assert.rejects(deleteDoc(doc(neighbour.db, receipt(guest, event).path)), permissionDenied);
});

test('a race for the last place admits one person and preserves the other receipt as absent', async () => {
  const event = await createMeetup(1);
  const people = [neighbour, guest];
  const results = await Promise.all(people.map(p => attend(p, event)));
  assert.equal(results.filter(r => r.joined).length, 1);
  assert.equal(results.filter(r => r.full).length, 1);
  const loser = people[results.findIndex(r => r.full)];
  assert.equal((await getDocFromServer(receipt(loser, event))).exists(), false);
  assert.equal(await count(event), 1);
});

test('duplicate joins and cancellations change the count once, including older Chat cards', async () => {
  const event = await createMeetup(3);
  const code = (await getDocFromServer(event)).data().eventId;
  const joins = await Promise.all([
    attend(neighbour, event),
    saveMeetupAttendance(neighbour.db, { userId: neighbour.uid, meetupId: code, joining: true }),
  ]);
  assert.equal(joins.filter(r => r.changed).length, 1);
  assert.equal(await count(event), 1);
  const cancels = await Promise.all([attend(neighbour, event, false), attend(neighbour, event, false)]);
  assert.equal(cancels.filter(r => r.changed).length, 1);
  assert.equal(await count(event), 0);
});

test('closed meetups allow cancellation, and missing public codes fall back to the document ID', async () => {
  for (const code of [undefined, '']) {
    const event = doc(owner.db, 'meetups', randomUUID());
    const data = meetupData(2);
    if (code === undefined) delete data.eventId;
    else data.eventId = code;
    await setDoc(event, data);
    await attend(guest, event);
    assert.equal((await getDocFromServer(receipt(guest, event))).data().meetupId, event.id);
    await updateDoc(event, { status: 'closed' });
    await assert.rejects(attend(neighbour, event), /closed/);
    await attend(guest, event, false);
    assert.equal(await count(event), 0);
  }
});

test('organizers and attendees cannot write the count or a private receipt in isolation', async () => {
  const event = await createMeetup(2);
  const member = receipt(neighbour, event);
  const code = (await getDocFromServer(event)).data().eventId;
  const payload = { userId: neighbour.uid, meetupId: code, meetupDocId: event.id, createdAt: serverTimestamp() };
  await assert.rejects(updateDoc(event, { participantCount: 1 }), permissionDenied);
  await assert.rejects(setDoc(member, payload), permissionDenied);
  await assert.rejects(setDoc(doc(guest.db, 'meetups', randomUUID()), { ...meetupData(), userId: guest.uid }), permissionDenied);
  const invalid = writeBatch(neighbour.db);
  invalid.set(member, payload);
  invalid.update(doc(neighbour.db, event.path), { participantCount: 1, title: 'Other title' });
  await assert.rejects(invalid.commit(), permissionDenied);
  assert.equal(await count(event), 0);
  assert.equal((await getDocFromServer(member)).exists(), false);
  await attend(neighbour, event);
  await assert.rejects(deleteDoc(member), permissionDenied);
  await assert.rejects(updateDoc(member, { userId: owner.uid }), permissionDenied);
  await assert.rejects(deleteDoc(event), permissionDenied);
  assert.equal(await count(event), 1);
});

import { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDocFromServer, getFirestore, setDoc, setLogLevel, terminate } from 'firebase/firestore';
import { attendanceId, saveMeetupAttendance } from '../src/services/meetupAttendance.js';

const clients = [];
export let owner;
export let neighbour;
export let guest;

export function localEmulator(name) {
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

export const permissionDenied = (error) => error?.code === 'permission-denied';

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


export function meetupData(capacity = 4) {
  return { userId: owner.uid, title: 'Clean-air walk', eventId: randomUUID(), status: 'published',
    attendanceVersion: 2, participantCount: 0, capacity };
}

export async function createMeetup(capacity) {
  const ref = doc(owner.db, 'meetups', randomUUID());
  await setDoc(ref, meetupData(capacity));
  return ref;
}

export function attend(person, event, joining = true) {
  return saveMeetupAttendance(person.db, { userId: person.uid, meetupDocId: event.id, joining });
}

export function receipt(person, event) {
  return doc(person.db, 'meetupRSVPs', attendanceId(person.uid, event.id));
}

export async function count(event) {
  return (await getDocFromServer(event)).data().participantCount;
}

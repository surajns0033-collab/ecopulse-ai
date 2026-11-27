import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInAnonymously } from 'firebase/auth';
import {
  connectFirestoreEmulator, deleteDoc, doc, getDocFromServer, getFirestore,
  setDoc, setLogLevel, terminate, updateDoc,
} from 'firebase/firestore';

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
  const collections = ['environmentalReports', 'emailDrafts', 'meetupRSVPs', 'communityActions',
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
  await setDoc(meetup, { userId: owner.uid, title: 'Clean-air walk' });
  await updateDoc(meetup, { title: 'Clean-air gathering' });
  await assert.rejects(updateDoc(meetup, { userId: neighbour.uid }), permissionDenied);
  await assert.rejects(updateDoc(doc(neighbour.db, meetup.path), { title: 'Changed' }), permissionDenied);
  await deleteDoc(meetup);
});

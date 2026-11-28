import assert from 'node:assert/strict';
import test from 'node:test';
import { doc, collection, setDoc, updateDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { cloudUpcomingEvents } from '../src/services/firestoreDiscovery.js';
import { owner, guest, neighbour, permissionDenied, meetupData } from './rulesFixtures.mjs';

test('report and draft writes validate their real fields and preserve ownership and creation data', async () => {
  const now = Timestamp.now();
  const report = { userId: owner.uid, title: 'Smoke', description: 'Smoke above the bins.', category: 'burning',
    location: 'Pune', reportId: 'EP-TEST01', status: 'submitted', lat: null, lng: null, photoUrl: null, createdAt: now, updatedAt: now };
  const draft = { userId: owner.uid, issue: 'Smoke', subject: 'Smoke', body: 'I saw smoke.', location: null, recipientType: 'municipal',
    recipientEmail: null, cc: null, reportId: null, createdAt: now, status: 'draft' };
  for (const [name, data, changes] of [
    ['environmentalReports', report, [{ category: 'unlisted' }, { lat: 91 }, { status: 'resolved' }, { reportId: 'EP-OTHER1' }]],
    ['emailDrafts', draft, [{ body: 10 }, { status: 'sent' }, { subject: '' }, { cc: {} }]],
  ]) {
    const ref = doc(collection(owner.db, name));
    await setDoc(ref, data);
    await assert.rejects(setDoc(doc(collection(neighbour.db, name)), data), permissionDenied);
    for (const patch of [...changes, { userId: guest.uid }, { createdAt: 'yesterday' }, { unexpected: true }]) {
      await assert.rejects(updateDoc(ref, patch), permissionDenied);
    }
  }
});

test('public posts and meetup organizer edits validate public fields and terminal states', async () => {
  const post = doc(collection(owner.db, 'communityPosts'));
  const data = { userId: owner.uid, author: 'Neighbour', text: 'Smoke reported', location: 'Pune', tags: [], createdAt: Timestamp.now() };
  await setDoc(post, data);
  for (const patch of [{ tags: [12] }, { tags: 'tag' }, { createdAt: 'today' }, { author: 'Someone else' }]) {
    await assert.rejects(updateDoc(post, patch), permissionDenied);
  }
  const event = doc(collection(owner.db, 'meetups'));
  await setDoc(event, meetupData());
  for (const patch of [{ privateEmail: 'private@example.test' }, { status: 'invented' }, { capacity: -1 }]) {
    await assert.rejects(updateDoc(event, patch), permissionDenied);
  }
  await updateDoc(event, { status: 'cancelled' });
  await assert.rejects(updateDoc(event, { status: 'published' }), permissionDenied);
});

test('cloud discovery pages past other cities and applies the date and category before its limit', async () => {
  const collectionRef = collection(owner.db, 'meetups');
  const batch = writeBatch(owner.db);
  const writeEvent = (location, day, category = 'cleanup') => {
    const ref = doc(collectionRef);
    batch.set(ref, { ...meetupData(), location, category, date: Timestamp.fromDate(new Date(day)) });
    return ref.id;
  };
  const city = 'Fixtureville';
  writeEvent(city, '2035-12-30');
  writeEvent(city, '2036-01-01', 'awareness');
  for (let i = 0; i < 32; i++) writeEvent('Different venue', '2036-01-02');
  const expected = writeEvent(city, '2036-01-03');
  await batch.commit();
  const rows = await cloudUpcomingEvents(guest.db, { city, category: 'cleanup', since: new Date('2036-01-01'), max: 1 });
  assert.deepEqual(rows.map(row => row.id), [expected]);
});

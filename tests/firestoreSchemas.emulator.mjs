import assert from 'node:assert/strict';
import test from 'node:test';
import { doc, collection, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
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

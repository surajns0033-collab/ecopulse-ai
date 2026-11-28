import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deleteDoc, doc, getDocFromServer, setDoc, updateDoc } from 'firebase/firestore';
import { findCloudReport, saveReport } from '../src/services/reportRecords.js';
import { owner, neighbour, guest, permissionDenied, meetupData } from './rulesFixtures.mjs';

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


test('report confirmations open by document ID and public code only for their owner', async () => {
  const saved = await saveReport(owner.db, { userId: owner.uid, title: 'Smoke observation', description: 'Smoke at the gate',
    category: 'air', location: 'Test neighbourhood', lat: 0, lng: 0 });
  assert.equal(saved.localOnly, false);
  for (const id of [saved.docId, saved.reportId]) {
    const record = await findCloudReport(owner.db, owner.uid, id);
    assert.equal(record.id, saved.docId);
    assert.equal(record.lat, 0);
    assert.equal(record.lng, 0);
    assert.equal(await findCloudReport(neighbour.db, neighbour.uid, id), null);
    assert.equal(await findCloudReport(guest.db, guest.uid, id), null);
  }
  await deleteDoc(doc(owner.db, 'environmentalReports', saved.docId));
  assert.equal(await findCloudReport(owner.db, owner.uid, saved.reportId), null);
});

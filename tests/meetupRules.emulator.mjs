import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { collection, deleteDoc, doc, getDocFromServer, getDocsFromServer, query, serverTimestamp, where, writeBatch, setDoc, updateDoc } from 'firebase/firestore';
import { joinedMeetupIds, saveMeetupAttendance } from '../src/services/meetupAttendance.js';
import { migrateAttendance } from '../server/migrateMeetupAttendance.mjs';
import { owner, neighbour, guest, localEmulator, permissionDenied, meetupData, createMeetup, attend, receipt, count } from './rulesFixtures.mjs';

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

test('owner reconciliation keeps legacy participants, repairs the count and can be rerun', async () => {
  const event = doc(owner.db, 'meetups', randomUUID());
  const code = randomUUID();
  const admin = localEmulator('FIRESTORE_EMULATOR_HOST').origin;
  const root = 'projects/demo-ecopulse/databases/(default)/documents';
  const fields = { userId: { stringValue: owner.uid }, eventId: { stringValue: code }, status: { stringValue: 'published' },
    participantCount: { integerValue: '0' }, capacity: { integerValue: '5' } };
  const updates = [{ name: root + '/' + event.path, fields }];
  for (const person of [guest, guest, neighbour]) {
    updates.push({ name: root + '/meetupRSVPs/' + randomUUID(),
      fields: { userId: { stringValue: person.uid }, meetupId: { stringValue: code } } });
  }
  const seed = await fetch(admin + '/v1/' + root + ':commit', { method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: updates.map(update => ({ update })) }) });
  assert.equal(seed.status, 200);
  await assert.rejects(attend(guest, event), /older meetup/);
  assert.equal((await migrateAttendance('demo-ecopulse')).legacyMeetups, 1);
  assert.equal(await count(event), 0);
  assert.equal((await migrateAttendance('demo-ecopulse', true)).applied, 1);
  assert.equal(await count(event), 2);
  for (const person of [guest, neighbour]) {
    assert.equal((await getDocFromServer(receipt(person, event))).exists(), true);
    const saved = await getDocsFromServer(query(collection(person.db, 'meetupRSVPs'), where('userId', '==', person.uid)));
    assert.equal(saved.docs.filter(row => row.data().meetupId === code).length, 1);
  }
  assert.equal((await migrateAttendance('demo-ecopulse', true)).applied, 0);
  await attend(guest, event, false);
  assert.equal(await count(event), 1);
});

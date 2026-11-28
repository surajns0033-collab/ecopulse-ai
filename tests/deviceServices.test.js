import assert from 'node:assert/strict';
import test from 'node:test';
import { firebaseSettings } from '../src/firebase/settings.js';
import { saveEmailDraft } from '../src/services/emailDrafts.js';
import { selectUpcomingEvents } from '../src/services/meetupDiscovery.js';

const config = { VITE_FIREBASE_API_KEY: 'fixture-key', VITE_FIREBASE_AUTH_DOMAIN: 'air-test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'air-test', VITE_FIREBASE_STORAGE_BUCKET: 'air-test.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '12345', VITE_FIREBASE_APP_ID: '1:12345:web:abc' };

test('partial configuration and an inconsistent Firebase sender preserve device Guest mode', () => {
  assert.equal(firebaseSettings(config).projectId, 'air-test');
  for (const key of Object.keys(config)) assert.equal(firebaseSettings({ ...config, [key]: '' }), null, key);
  assert.equal(firebaseSettings({ ...config, VITE_FIREBASE_API_KEY: 'demo-key' }), null);
  assert.equal(firebaseSettings({ ...config, VITE_FIREBASE_APP_ID: '1:999:web:abc' }), null);
  assert.equal(firebaseSettings({ ...config, VITE_FIREBASE_AUTH_DOMAIN: 'custom.example.org' }).authDomain, 'custom.example.org');
});

test('drafts distinguish an acknowledged account save, a device save and storage failure', async () => {
  const entries = new Map();
  const storage = { setItem: (key, text) => entries.set(key, JSON.parse(text)) };
  const record = { userId: 'owner', subject: 'Smoke at the gate', body: 'I saw smoke this morning.' };
  const device = await saveEmailDraft(record, { storage });
  assert.equal(device.localOnly, true);
  assert.equal(entries.size, 1);
  assert.equal([...entries.values()][0].body, record.body);
  const cloud = await saveEmailDraft(record, { persist: async () => 'cloud-id', storage });
  assert.deepEqual(cloud, { draftId: 'cloud-id', localOnly: false });
  for (const code of ['permission-denied', 'unavailable']) {
    await assert.rejects(saveEmailDraft(record, { persist: async () => { throw Object.assign(new Error(code), { code }); }, storage }), { code });
  }
  assert.equal(entries.size, 1);
  await assert.rejects(saveEmailDraft(record, { storage: { setItem() { throw new Error('quota'); } } }), /quota/);
  await assert.rejects(saveEmailDraft({ ...record, userId: '' }, { storage }));
});

test('old events and other cities cannot hide a matching upcoming meetup', () => {
  const date = '2026-01-20';
  const past = Array.from({ length: 40 }, (_, id) => ({ id, date: '2025-12-20', category: 'cleanup', location: 'Pune' }));
  const today = { id: 'today', date, location: 'Kothrud, Pune', category: 'cleanup', status: 'published' };
  const near = { ...today, id: 'later', date: '2026-01-21' };
  const events = [...past, { ...today, location: 'Jaipur' }, { ...today, location: 'Puneri' }, { ...today, status: 'cancelled' },
    { ...today, category: 'awareness' }, { ...today, date: 'broken' }, near, today];
  assert.deepEqual(selectUpcomingEvents(events, { since: new Date(date), city: 'Pune, Maharashtra, India',
    category: 'cleanup', max: 2 }).map(e => e.id), ['today', 'later']);
});

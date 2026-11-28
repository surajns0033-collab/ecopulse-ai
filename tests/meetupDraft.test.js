import test from 'node:test';
import assert from 'node:assert/strict';
import { readMeetupDraft } from '../src/services/meetupDraft.js';

const proposed = { title: 'Clean-air walk', location: 'Ward park, Pune', date: '2028-02-29', time: '8 AM',
  category: 'awareness', description: 'Walk to check the bus stop.', capacity: 12 };

test('an event preview preserves the supplied venue, date and seats and excludes model coordinates', () => {
  const data = readMeetupDraft({ ...proposed, capacity: '12', lat: 22, lng: 75 }, 'My note', 'Another city');
  assert.deepEqual(data, { ...proposed, lat: null, lng: null });
  const basic = readMeetupDraft({ title: 'Walk', date: '2028-02-29' }, 'My note', 'Pune');
  assert.equal(basic.location, 'Pune');
  assert.equal(basic.description, 'My note');
  assert.equal(basic.time, '7:00 AM');
  assert.equal(basic.capacity, 25);
});

test('missing or malformed event details cannot become a publishable Chat card', () => {
  for (const value of [null, [], {}, { ...proposed, title: { text: 'Walk' } }, { ...proposed, date: '2027-02-29' },
    { ...proposed, date: 'tomorrow' }, { ...proposed, capacity: 0 }, { ...proposed, capacity: 1.5 },
    { ...proposed, description: [] }, { ...proposed, category: 'unknown' }, { ...proposed, location: '' }]) {
    assert.equal(readMeetupDraft(value, 'Note', null), null, JSON.stringify(value));
  }
});

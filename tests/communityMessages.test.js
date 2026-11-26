import test from 'node:test';
import assert from 'node:assert/strict';
import { orderCommunityMessages } from '../src/services/communityMessages.js';

test('the Community view orders the fetched window and local sends oldest to newest', () => {
  const minute = 60;
  const first = { id: 'first', createdAt: '2026-11-26T09:00:00.000Z' };
  const second = { id: 'second', createdAt: { seconds: Date.parse(first.createdAt) / 1000 + minute, nanoseconds: 50 } };
  const newest = { id: 'newest', createdAt: '2026-11-26T09:02:00.000Z' };
  const duplicate = { id: 'second', createdAt: '2026-11-26T09:01:00.000Z' };
  const fetched = [second, first];
  assert.deepEqual(orderCommunityMessages([...fetched, newest, duplicate]), [first, second, newest]);
  assert.deepEqual(fetched, [second, first]);
});

test('a live snapshot and a local post can arrive out of order', () => {
  const live = { id: 'live', createdAt: '2026-11-26T09:04:00.000Z' };
  const mine = { id: 'mine', createdAt: '2026-11-26T09:03:59.000Z' };
  assert.deepEqual(orderCommunityMessages([live, mine, { ...mine }]), [mine, live]);
});

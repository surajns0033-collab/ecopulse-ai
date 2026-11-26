import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyTalkContext, resolveTalkTurn } from '../src/agent/talkContext.js';
import { createTalkSession, clearTalkSession, TALK_HISTORY_LIMIT, TALK_MESSAGE_LIMIT } from '../src/services/talkSession.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}

test('recent text and an unanswered city question survive returning to Talk', async () => {
  const storage = memoryStorage();
  const session = createTalkSession('member', storage);
  const question = 'What’s the weather near me?';
  const first = await resolveTalkTurn(question, emptyTalkContext());
  session.remember('user', question, { voiceLocale: 'en-IN' });
  session.remember('ai', first.text, { context: first.context, questionLocale: 'en-IN' });

  const returned = createTalkSession('member', storage);
  assert.deepEqual(returned.current.history, [{ role: 'user', text: question }, { role: 'ai', text: 'Which city should I check?' }]);
  assert.equal(returned.current.questionLocale, 'en-IN');
  assert.equal(returned.current.voiceLocale, 'en-IN');
  const mumbai = { city: 'Mumbai, Maharashtra, India', name: 'Mumbai', lat: 19.08, lng: 72.88 };
  const resumed = await resolveTalkTurn('Mumbai', returned.current.context, { lookup: async () => ({ location: mumbai }) });
  assert.equal(resumed.message, question);
  assert.deepEqual(resumed.location, mumbai);
  returned.update({ context: resumed.context, questionLocale: '' });

  const refreshed = createTalkSession('member', storage);
  const next = await resolveTalkTurn('AQI in my city', refreshed.current.context, {
    lookup: () => assert.fail('A verified local city should not need another lookup'),
  });
  assert.deepEqual(next.location, mumbai);
});

test('session history is bounded, account-scoped, clearable, and has a private in-memory fallback', () => {
  const storage = memoryStorage();
  const session = createTalkSession('first', storage);
  for (let i = 0; i < TALK_HISTORY_LIMIT + 2; i++) session.remember('user', `${i} ${'x'.repeat(2 * TALK_MESSAGE_LIMIT)}`);
  assert.equal(session.current.history.length, TALK_HISTORY_LIMIT);
  assert.equal(session.current.history[0].text.length, TALK_MESSAGE_LIMIT);
  assert.ok(session.current.history[0].text.startsWith('2 '));
  assert.equal(createTalkSession('first', storage).current.history.length, TALK_HISTORY_LIMIT);
  assert.deepEqual(createTalkSession('second', storage).current.history, []);
  session.clear();
  assert.deepEqual(createTalkSession('first', storage).current.history, []);
  session.remember('user', 'A private turn');
  clearTalkSession(storage);
  session.remember('ai', 'A reply arriving after sign-out');
  assert.deepEqual(session.current.history, []);
  assert.deepEqual(createTalkSession('first', storage).current.history, []);

  const unavailable = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const inMemory = createTalkSession('first', unavailable);
  inMemory.remember('user', 'In memory');
  assert.deepEqual(inMemory.current.history, [{ role: 'user', text: 'In memory' }]);
});

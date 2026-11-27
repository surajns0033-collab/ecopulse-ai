import assert from 'node:assert/strict';
import test from 'node:test';
import { chatRequestSchema } from '../server/chatSchema.ts';
import { logFailure } from '../src/services/diagnostics.js';

test('strict chat schema normalizes legacy roles and isolates search from history', () => {
  const input = { messages: [{ role: 'model', text: 'Earlier reply' }, { role: 'user', text: ' Updated forecast? ' }],
    system: 'Private household details', model: 'legacy', timeoutMs: 90000 };
  const normal = chatRequestSchema.parse(input);
  assert.equal(normal.messages[0].role, 'assistant');
  assert.equal(normal.timeoutMs, 40000);
  assert.equal(Object.hasOwn(normal, 'model'), false);
  const search = chatRequestSchema.parse({ ...input, useSearch: true });
  assert.deepEqual(search.messages, [{ role: 'user', text: 'Updated forecast?' }]);
  assert.equal(search.system, '');
});

test('strict chat schema enforces nested keys, types, message and history limits', () => {
  const valid = { messages: [{ role: 'user', text: 'Check the air' }] };
  for (const input of [{ ...valid, extra: 1 }, { ...valid, useSearch: 'true' },
    { messages: [{ ...valid.messages[0], email: 'fixture@example.org' }] },
    { messages: [{ role: 'assistant', text: 'No user turn' }] },
    { messages: Array.from({ length: 4 }, () => ({ role: 'user', text: 'a'.repeat(16000) })) },
    { messages: [{ role: 'user', text: '   ' }] }]) {
    assert.equal(chatRequestSchema.safeParse(input).success, false);
  }
});

test('failure logs contain only an allowed operation and numeric status', t => {
  const messages = [];
  t.mock.method(console, 'error', message => messages.push(JSON.parse(message)));
  logFailure('chat.provider', 504);
  logFailure('ui.render', new Error('Private user content'));
  logFailure('Unrecognized private content', 500);
  assert.deepEqual(messages, [{ application: 'ecopulse', operation: 'chat.provider', status: 504 },
    { application: 'ecopulse', operation: 'ui.render' }]);
});

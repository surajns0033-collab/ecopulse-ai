import test from 'node:test';
import assert from 'node:assert/strict';
import { clearDeviceGuest, deviceGuest, newDeviceGuest, startGuest } from '../src/contexts/deviceSession.js';

test('a temporary Guest auth outage starts a device session, and exiting restores sign-in choices', async t => {
  const saved = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key),
  } });
  t.after(() => { delete globalThis.sessionStorage; });
  const reload = t.mock.fn();
  const fail = code => async () => { throw Object.assign(new Error(code), { code }); };
  for (const code of ['auth/network-request-failed', 'auth/operation-not-allowed']) {
    assert.equal(await startGuest(fail(code), reload), null);
    assert.equal(deviceGuest().offline, true);
    clearDeviceGuest();
    assert.equal(deviceGuest(), null);
  }
  assert.equal(reload.mock.callCount(), 2);
  await assert.rejects(startGuest(fail('auth/user-disabled'), reload), { code: 'auth/user-disabled' });
  assert.equal(deviceGuest(), null);
  const real = { uid: 'cloud', isAnonymous: true };
  assert.equal(await startGuest(async () => ({ user: real }), reload), real);
  assert.equal((await startGuest(null, reload)).offline, false);
  saved.set('ecopulse_device_session', JSON.stringify({ uid: 'google-user-old', isLocal: true, isAnonymous: false }));
  assert.equal(deviceGuest(), null);
});

test('blocked storage still permits a memory-only Guest with an unconfigured backend', () => {
  assert.equal(newDeviceGuest().isLocal, true);
  assert.throws(() => newDeviceGuest(true), /tab storage/);
});

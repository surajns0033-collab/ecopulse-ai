const key = 'ecopulse_device_session';

export function deviceGuest() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key));
    if (!saved?.isLocal || saved.isAnonymous !== true || typeof saved.uid !== 'string' || !saved.uid.startsWith('guest-')) return null;
    return { uid: saved.uid, isLocal: true, isAnonymous: true, offline: saved.offline === true };
  } catch { return null; }
}

export function clearDeviceGuest() {
  try { sessionStorage.removeItem(key); } catch { /* The in-memory session can still sign out. */ }
}

export function newDeviceGuest(offline = false) {
  const user = { uid: 'guest-' + crypto.randomUUID(), isAnonymous: true, isLocal: true, offline };
  try { sessionStorage.setItem(key, JSON.stringify(user)); }
  catch {
    if (offline) throw new Error('Device Guest mode needs tab storage while account sign-in is unavailable.');
  }
  return user;
}

export async function startGuest(signIn, reload) {
  if (!signIn) return newDeviceGuest();
  try { return (await signIn()).user; }
  catch (error) {
    if (!['auth/network-request-failed', 'auth/operation-not-allowed'].includes(error?.code)) throw error;
    // Reopen with every store bound to device mode before accepting any writes.
    newDeviceGuest(true);
    reload();
    return null;
  }
}

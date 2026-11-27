// A read/write IndexedDB transaction serializes attendance changes across tabs.
const DB_NAME = 'ecopulse-meetup-attendance';
const LEGACY_KEY = 'echopulse_local_rsvps';
let database;

function openDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('attendance');
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch(error => { database = undefined; throw error; });
  }
  return database;
}

export const localMeetupsKey = 'echopulse_local_meetups';
const changeKey = 'ecopulse_meetups_changed';

export function notifyLocalMeetups() {
  window.dispatchEvent(new Event(changeKey));
  // Other tabs read the committed IndexedDB rows when they receive this signal.
  try { localStorage.setItem(changeKey, crypto.randomUUID()); } catch { /* Same-tab state is already current. */ }
}

export function watchLocalMeetups(refresh) {
  const handleStorage = event => {
    if (!event.key || [localMeetupsKey, changeKey, LEGACY_KEY].includes(event.key)) refresh();
  };
  window.addEventListener(changeKey, refresh);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(changeKey, refresh);
    window.removeEventListener('storage', handleStorage);
  };
}

export function localMeetups() {
  return JSON.parse(localStorage.getItem(localMeetupsKey) || '[]');
}

function legacyRows() {
  const rows = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
  return Array.isArray(rows) ? rows : [];
}

async function access(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('attendance', mode);
    const store = tx.objectStore('attendance');
    const read = store.get('rows');
    let result;
    let error;
    read.onsuccess = () => {
      try {
        const rows = read.result ?? legacyRows();
        result = action(rows);
        if (mode === 'readwrite' && result.changed) store.put(result.rows, 'rows');
      } catch (e) { error = e; tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(error || tx.error || new Error('Could not save attendance on this device.'));
  });
}

export function localParticipants(rows, meetupId) {
  return new Set(rows.filter(r => r.meetupId === meetupId).map(r => r.userId)).size;
}

export function readLocalAttendance() {
  return access('readonly', rows => rows);
}

export async function saveLocalAttendance(event, userId, joining) {
  const meetupId = event.eventId || event.id;
  const result = await access('readwrite', rows => {
    const mine = row => row.userId === userId && row.meetupId === meetupId;
    const joined = rows.some(mine);
    const count = localParticipants(rows, meetupId);
    if (joining === joined) return { joined, changed: false, participantCount: count };
    if (joining && event.status && event.status !== 'published') throw new Error('This meetup is closed for registration.');
    if (joining && Number.isInteger(event.capacity) && count >= event.capacity) {
      return { joined: false, changed: false, full: true, participantCount: count };
    }
    const next = joining ? [...rows, { userId, meetupId }] : rows.filter(row => !mine(row));
    return { rows: next, joined: joining, changed: true, participantCount: localParticipants(next, meetupId) };
  });
  if (result.changed) notifyLocalMeetups();
  return { joined: result.joined, changed: result.changed, full: result.full, participantCount: result.participantCount, localOnly: true };
}

import { addDoc, collection, doc, getDoc, getDocs, limit, query, Timestamp, where } from 'firebase/firestore';
import { COLLECTIONS, generateReportId } from '../firebase/collections.js';

const localReportsKey = 'echopulse_local_reports';

function deviceReports(storage) {
  const records = JSON.parse(storage.getItem(localReportsKey) || '[]');
  if (!Array.isArray(records)) throw new Error('Could not read reports on this device.');
  return records;
}

function devicePrefix(userId) {
  return 'ecopulse_private_report:' + encodeURIComponent(userId) + ':';
}

export function reportsOnDevice(storage, userId) {
  if (!userId) return [];
  const mine = deviceReports(storage).filter(row => row.userId === userId);
  const prefix = devicePrefix(userId);
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const row = JSON.parse(storage.getItem(key));
    if (row?.userId === userId) mine.push(row);
  }
  return mine;
}

export function findDeviceReport(storage, userId, id) {
  if (!userId || !id) return null;
  const direct = JSON.parse(storage.getItem(devicePrefix(userId) + id));
  if (direct?.userId === userId) return { ...direct, localOnly: true };
  const row = reportsOnDevice(storage, userId).find(report => report.id === id || report.reportId === id);
  return row ? { ...row, localOnly: true } : null;
}

export async function saveReport(database, { userId, title, description, category, location, photoUrl, lat, lng }) {
  if (!userId) throw new Error('Sign in before saving a report.');
  const reportId = generateReportId();
  const now = Timestamp.now();
  const record = {
    userId, title, description, category, location, reportId, status: 'submitted', photoUrl: photoUrl ?? null,
    lat: lat ?? null, lng: lng ?? null, createdAt: now, updatedAt: now,
  };
  if (database) {
    const ref = await addDoc(collection(database, COLLECTIONS.REPORTS), record);
    return { reportId, docId: ref.id, localOnly: false };
  }

  const time = now.toDate().toISOString();
  const id = crypto.randomUUID();
  const local = { ...record, id, createdAt: time, updatedAt: time };
  localStorage.setItem(devicePrefix(userId) + id, JSON.stringify(local));
  return { reportId, docId: id, localOnly: true };
}

async function findByCode(database, userId, id) {
  const records = collection(database, COLLECTIONS.REPORTS);
  const matches = await getDocs(query(records, where('userId', '==', userId), where('reportId', '==', id), limit(2)));
  if (matches.size > 1) throw new Error('Use the link in the original report confirmation.');
  const found = matches.docs[0];
  return found ? { ...found.data(), id: found.id } : null;
}

async function findByDocument(database, userId, id) {
  try {
    const record = await getDoc(doc(database, COLLECTIONS.REPORTS, id));
    return record.exists() && record.data().userId === userId ? { ...record.data(), id: record.id } : null;
  } catch (error) {
    // A missing private document and another member's document look alike to a reader.
    if (error.code === 'permission-denied') return null;
    throw error;
  }
}

export async function findCloudReport(database, userId, id) {
  if (!userId || !id || id.includes('/')) return null;
  if (/^EP-[A-Z0-9]{6}$/.test(id)) {
    return await findByCode(database, userId, id) || findByDocument(database, userId, id);
  }
  return await findByDocument(database, userId, id) || findByCode(database, userId, id);
}

export async function loadReport(database, userId, id) {
  if (!database) return findDeviceReport(localStorage, userId, id);
  try {
    const report = await findCloudReport(database, userId, id);
    if (report) return report;
  } catch (error) {
    // A previous version could save a report on this device during a network failure.
    if (error.code !== 'unavailable' && error.code !== 'deadline-exceeded') throw error;
    const saved = findDeviceReport(localStorage, userId, id);
    if (saved) return saved;
    throw error;
  }
  return findDeviceReport(localStorage, userId, id);
}

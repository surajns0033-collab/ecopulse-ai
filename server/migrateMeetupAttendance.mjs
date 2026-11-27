// Owner maintenance for records created before transactional attendance.
import { pathToFileURL } from 'node:url';
import { attendanceId } from '../src/services/meetupAttendance.js';

function docId(record) {
  return record.name.split('/').at(-1);
}

function migrationWrites(event, rows) {
  const groups = new Map();
  for (const row of rows) {
    const uid = row.fields?.userId?.stringValue;
    if (!uid) throw new Error('A receipt is missing its owner for meetup ' + docId(event));
    if (!groups.has(uid)) groups.set(uid, []);
    groups.get(uid).push(row);
  }
  const writes = [];
  const id = docId(event);
  const code = event.fields?.eventId?.stringValue || id;
  const prefix = event.name.slice(0, event.name.lastIndexOf('/meetups/'));
  for (const [uid, records] of groups) {
    const name = prefix + '/meetupRSVPs/' + attendanceId(uid, id);
    const current = records.find(record => record.name === name);
    const dated = records.map(row => row.fields?.createdAt?.timestampValue || row.createTime).filter(Boolean).sort();
    writes.push({
      update: { name, fields: { userId: { stringValue: uid }, meetupDocId: { stringValue: id },
        meetupId: { stringValue: code }, createdAt: { timestampValue: dated[0] || event.createTime } } },
      currentDocument: current ? { updateTime: current.updateTime } : { exists: false },
    });
    for (const record of records) {
      if (record.name !== name) writes.push({ delete: record.name, currentDocument: { updateTime: record.updateTime } });
    }
  }
  writes.push({
    update: { name: event.name, fields: { attendanceVersion: { integerValue: '2' },
      participantCount: { integerValue: String(groups.size) } } },
    updateMask: { fieldPaths: ['attendanceVersion', 'participantCount'] },
    currentDocument: { updateTime: event.updateTime },
  });
  return writes;
}

function migrationPlans(events, receipts) {
  const aliases = new Map();
  const records = new Map();
  for (const event of events) {
    const id = docId(event);
    records.set(id, []);
    for (const key of new Set([id, event.fields?.eventId?.stringValue].filter(Boolean))) {
      if (!aliases.has(key)) aliases.set(key, []);
      aliases.get(key).push(id);
    }
  }
  let orphanReceipts = 0;
  for (const receipt of receipts) {
    const id = receipt.fields?.meetupDocId?.stringValue;
    const matches = id ? [id] : aliases.get(receipt.fields?.meetupId?.stringValue) || [];
    if (matches.length > 1) throw new Error('Resolve the duplicate public event code on receipt ' + docId(receipt));
    if (records.has(matches[0])) records.get(matches[0]).push(receipt);
    else orphanReceipts++;
  }
  const plans = events.filter(event => Number(event.fields?.attendanceVersion?.integerValue || 0) < 2)
    .map(event => migrationWrites(event, records.get(docId(event))));
  return { plans, orphanReceipts };
}

export async function migrateAttendance(projectId, apply = false) {
  if (!/^[a-z][a-z0-9-]+$/.test(projectId || '')) throw new Error('Supply the Firebase project ID.');
  let origin = 'https://firestore.googleapis.com';
  let token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const url = new URL('http://' + process.env.FIRESTORE_EMULATOR_HOST);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Use a loopback emulator.');
    origin = url.origin;
    token = 'owner';
  }
  if (!token) throw new Error('Supply a short-lived owner access token in GOOGLE_OAUTH_ACCESS_TOKEN.');
  const root = origin + '/v1/projects/' + projectId + '/databases/(default)/documents';
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  async function request(path, options) {
    const response = await fetch(root + path, { ...options, headers });
    if (!response.ok) throw new Error('Firestore migration request failed: ' + response.status + ' ' + (await response.json()).error?.message);
    return response.json();
  }
  async function list(collection) {
    const result = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({ pageSize: '300' });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await request('/' + collection + '?' + params);
      result.push(...(page.documents || []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return result;
  }

  const [events, receipts] = await Promise.all([list('meetups'), list('meetupRSVPs')]);
  const { plans, orphanReceipts } = migrationPlans(events, receipts);
  if (apply) {
    // Each event, its count and all of its receipts commit together. A changed
    // input fails the precondition and the command can be safely run again.
    for (const writes of plans) await request(':commit', { method: 'POST', body: JSON.stringify({ writes }) });
  }
  return { legacyMeetups: plans.length, orphanReceipts, applied: apply ? plans.length : 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , projectId, option] = process.argv;
  if (option && option !== '--apply') throw new Error('Usage: node server/migrateMeetupAttendance.mjs PROJECT_ID [--apply]');
  console.log(await migrateAttendance(projectId, option === '--apply'));
}

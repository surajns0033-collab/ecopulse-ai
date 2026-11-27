import assert from 'node:assert/strict';
import test from 'node:test';
import { findVerifiedRecipient } from '../src/services/verifiedRecipient.js';
import { generateEventId, generateReportId } from '../src/firebase/collections.js';
import { parseModelObject } from '../src/services/modelJson.js';
import { emailPreviewData } from '../src/agent/civicReportDetails.js';

test('city aliases select the same verified recipient in the correct jurisdiction', async () => {
  for (const [name, alternate, state] of [['Thiruvananthapuram', 'Trivandrum', 'Kerala'],
    ['Kochi', 'Cochin', 'Kerala'], ['Bengaluru', 'Bangalore', 'Karnataka']]) {
    const recipient = city => findVerifiedRecipient({ city: city + ', ' + state + ', India', issueCategory: 'trees' });
    const original = await recipient(name);
    assert.ok(original.email && original.portalUrl);
    assert.deepEqual(await recipient(alternate), original);
  }
  const other = await findVerifiedRecipient({ city: 'Kochi, Japan', issueCategory: 'trees' });
  assert.equal(other.email, null);
});

test('generated records preserve public reference formats', () => {
  assert.match(generateReportId(), /^EP-[A-Z0-9]{6}$/);
  assert.match(generateEventId(), /^EV-[A-Z0-9]{6}$/);
});

test('photo and text draft cards keep the same verified contact fields and source-specific disclaimer', () => {
  const recipient = { email: 'desk@example.org', name: 'Desk', organization: 'City', disclaimer: 'Verify first' };
  const contents = { subject: 'Smoke on market road', body: 'Observed yesterday' };
  const draft = emailPreviewData(recipient, 'Nagpur', contents);
  const photo = emailPreviewData(recipient, 'Nagpur', contents, { cc: 'forest@example.org', disclaimer: 'Verify the photo' });
  assert.deepEqual(photo, { ...draft, cc: 'forest@example.org', disclaimer: 'Verify the photo' });
  assert.equal(photo.to, recipient.email);
  assert.equal(photo.subject, contents.subject);
});

test('text and photo JSON use one parser for fenced, embedded and unusable provider output', () => {
  for (const input of ['{"severity":"mild"}', '```json\n{"severity":"mild"}\n```', 'Result: {"severity":"mild"}']) {
    assert.deepEqual(parseModelObject(input), { severity: 'mild' });
  }
  for (const input of [null, '[{"severity":"mild"}]', 'broken {', '42']) assert.equal(parseModelObject(input), null);
});

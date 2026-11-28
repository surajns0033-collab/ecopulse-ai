import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyReport, describesIssue, detectIssueCategory, hasConcreteIssue, mentionsForest, observationText } from '../src/agent/civicIssues.js';
import { reportContacts, reportFields, reportUrgency } from '../src/agent/civicReportDetails.js';

test('overlapping observations preserve report titles and authority routing', () => {
  const issues = [
    ['Parked vehicle is blocking the road beside garbage', 'road_obstruction', 'road_obstruction'],
    ['Smoke from burning plastic', 'burning', 'burning'],
    ['Soil dumping and tree cutting', 'greenspace', 'trees'],
    ['Garbage and plastic on the street', 'garbage', 'garbage'],
    ['Plastic bag beside the gate', 'plastic', 'garbage'],
    ['Polluted drain and water', 'sewage', 'water'],
    ['Mangrove damage', 'trees', 'default'],
    ['Construction dust reduces air quality', 'construction', 'construction'],
    ['Unspecified observation', 'other', 'default'],
  ];
  for (const [message, report, directory] of issues) {
    assert.equal(classifyReport(message).category, report, message);
    assert.equal(detectIssueCategory(message), directory, message);
  }
  assert.equal(classifyReport('Smoke at the gate').title, 'Open Burning Issue');
});

test('report previews retain observed facts when model fields are absent or malformed', () => {
  const message = '  Smoke near Gandhi Chowk  ';
  const city = 'Nagpur, India';
  const fallback = { title: 'Open Burning Issue', description: message.trim(), location: city };
  assert.deepEqual(reportFields(message, city, fallback.title, null), fallback);
  assert.deepEqual(reportFields(message, city, fallback.title,
    { title: {}, description: '   ', locality: 'Imaginary Road' }), fallback);
  const facts = reportFields(message, city, fallback.title,
    { title: 'Smoke at the crossing', description: 'Smoke was observed.', locality: 'Gandhi Chowk' });
  assert.equal(facts.location, 'Gandhi Chowk, Nagpur, India');
  assert.equal(facts.title, 'Smoke at the crossing');
  assert.equal(facts.description, 'Smoke was observed.');
  assert.equal(reportFields('Smoke in Nagpur', city, '', { locality: 'Nagpur' }).location, 'Nagpur');
});

test('only published contact fields are shown for the report and directions', () => {
  const details = { organization: 'City office', email: 'unpublished', forestHelpline: 'fixture forest line' };
  assert.doesNotMatch(reportContacts(details, false, false), /Email:|forest/i);
  assert.doesNotMatch(reportContacts(details, true, false), /forest/i);
  assert.match(reportContacts(details, true, true), /State Forest Helpline/);
  const available = { ...details, email: 'help@example.org', whatsapp: 'fixture chat', helpline: 'fixture line',
    forestEmail: 'forest@example.org', portalUrl: 'https://example.org/report', sourceUrl: 'https://example.org/contacts' };
  const contacts = reportContacts(available, true, true);
  for (const expected of ['help@example.org', 'fixture chat', 'fixture line', 'forest@example.org', available.portalUrl, available.sourceUrl]) {
    assert.ok(contacts.includes(expected), expected);
  }
  assert.match(reportContacts(available, true, false), /Forest \/ Tree Protection Cell:\*\*/);
});

test('urgent guidance distinguishes local inspection from an emergency in each jurisdiction', () => {
  for (const preview of [true, false]) {
    const india = { jurisdiction: 'india', helpline: '112 (emergency only)', forestHelpline: 'forest desk' };
    assert.match(reportUrgency(india, true, preview), /immediate danger to life/);
    assert.doesNotMatch(reportUrgency(india, true, preview), /forest desk|emergency only/);
    assert.match(reportUrgency({ ...india, helpline: null }, true, preview), /forest desk/);
    assert.match(reportUrgency({ ...india, helpline: 'inspection desk' }, true, preview), /inspection desk/);
    const abroad = reportUrgency({ jurisdiction: 'outside-india' }, false, preview);
    assert.match(abroad, /verify/i);
    assert.doesNotMatch(abroad, /112/);
  }
});

test('typing corrections identify the observation without changing the complaint text', () => {
  const note = 'I saw garbge in Dehli near the gate.';
  assert.equal(classifyReport(note).category, 'garbage');
  assert.equal(hasConcreteIssue(note), true);
  assert.equal(observationText('Draft an email. ' + note), note);
  assert.equal(hasConcreteIssue('The street is quiet'), false);
  assert.equal(detectIssueCategory('My chair needs repair'), 'default');
  assert.equal(classifyReport('मैंने सड़क पर कचरा देखा।').category, 'garbage');
  assert.equal(classifyReport('maine sadak par dhool dekhi').category, 'construction');
});

test('the complaint flow distinguishes a witnessed issue from a question or draft instruction', () => {
  assert.equal(describesIssue('Where can I report tree cutting?'), false);
  assert.equal(describesIssue('Please write a complaint about garbage.'), false);
  assert.equal(describesIssue('Please write a complaint. I saw garbge near the gate.'), true);
  assert.equal(describesIssue('What are the opening hours?'), false);
  assert.equal(mentionsForest('Two mango trees were cut.'), true);
  assert.equal(mentionsForest('My street is quiet.'), false);
});

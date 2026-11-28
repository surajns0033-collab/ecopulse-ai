// Authority directory — national, state and local complaint contacts.
//
// ACCURACY RULES (important):
// • Every entry here was taken from an official government page, a CPCB
//   directory, or the authority's own published contact page.
// • `verified: true`  → email/phone confirmed on the authority's own site.
// • `verified: false` → only the official portal is confirmed; treat the
//   rest as "check on the portal before sending".
// • Never add a guessed email. A missing email is better than a wrong one.
//
// Last reviewed: 2026-11-25

export const NATIONAL_AUTHORITIES = [
  {
    id: 'cpcb',
    name: 'Central Pollution Control Board (CPCB)',
    level: 'national',
    scope: 'Air, water and industrial pollution anywhere in India',
    emails: ['mscb.cpcb@nic.in', 'ccb.cpcb@nic.in'],
    phones: ['011-43102030'],
    portal: 'https://cpcb.nic.in',
    notes: 'Escalation route when a state board does not act. Member Secretary + Chairman offices.',
    verified: true,
  },
  {
    id: 'moefcc',
    name: 'Ministry of Environment, Forest & Climate Change (MoEFCC)',
    level: 'national',
    scope: 'Policy, forest clearances, environmental law, Eco-Sensitive Zones',
    emails: ['mefcc@gov.in'],
    phones: ['011-20819190', '011-20819187'],
    portal: 'https://moef.gov.in',
    notes: 'Use PARIVESH helpdesk 1800-11-9792 for forest/environment clearance issues.',
    verified: true,
  },
  {
    id: 'cpgrams',
    name: 'CPGRAMS — Centralised Public Grievance Portal',
    level: 'national',
    scope: 'Any grievance against a central or state department, with tracking',
    emails: [],
    phones: [],
    portal: 'https://pgportal.gov.in',
    notes: 'Best written escalation: you get a registration number and a timeline for reply.',
    verified: true,
  },
  {
    id: 'ngt',
    name: 'National Green Tribunal (NGT)',
    level: 'national',
    scope: 'Legal action on environmental violations after authorities fail',
    emails: [],
    phones: [],
    portal: 'https://greentribunal.gov.in',
    notes: 'For serious or repeated violations. Filing can be done online; no fee for many cases.',
    verified: true,
  },
  {
    id: 'emergency',
    name: 'Emergency Response',
    level: 'national',
    scope: 'Fire, hazardous chemical leak, immediate danger to life',
    emails: [],
    phones: ['112'],
    portal: '',
    notes: 'Call first, complain later.',
    verified: true,
  },
];

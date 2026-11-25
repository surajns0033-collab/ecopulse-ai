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

export const STATE_AUTHORITIES = {
  maharashtra: {
    name: 'Maharashtra Pollution Control Board (MPCB)',
    emails: ['ronavimumbai@mpcb.gov.in', 'romumbai@mpcb.gov.in', 'ropune@mpcb.gov.in'],
    phones: ['022-67808888', '022-27562740'],
    portal: 'https://mpcb.gov.in',
    notes: 'Head office: Kalpataru Point, Sion Circle, Mumbai 400022 · 022-67808888. Navi Mumbai regional office: Raigad Bhavan, 7th floor, Sector 11, CBD Belapur (covers Vashi, Turbhe, Sanpada, Belapur, Airoli, Ghansoli, Koparkhairane, Taloja).',
    regional: [
      { area: 'Navi Mumbai', emails: ['ronavimumbai@mpcb.gov.in', 'mpcbnavimumbai@mpcb.gov.in'], phones: ['022-27562740', '022-27562865', '022-27571127'] },
      { area: 'Mumbai', emails: ['romumbai@mpcb.gov.in', 'mpcbmumbai@mpcb.gov.in'], phones: ['022-67808888'] },
      { area: 'Pune', emails: ['ropune@mpcb.gov.in', 'mpcbpune@mpcb.gov.in'], phones: ['020-25811627'] },
    ],
    verified: true,
  },
  karnataka: {
    name: 'Karnataka State Pollution Control Board (KSPCB)',
    emails: ['contact@kspcb.gov.in', 'ho@kspcb.gov.in', 'iccc.kspcb@gmail.com'],
    phones: [],
    portal: 'https://kspcb.karnataka.gov.in',
    notes: 'ICCC email is the dedicated pollution-complaint inbox.',
    verified: true,
  },
  delhi: {
    name: 'Delhi Pollution Control Committee (DPCC)',
    emails: ['chdpcc@nic.in'],
    phones: ['011-23392108'],
    portal: 'https://dpcc.delhi.gov.in',
    notes: 'DPCC is the right authority for construction dust, burning and noise in Delhi. Use the online complaint form for a written record.',
    verified: true,
  },
  'tamil nadu': {
    name: 'Tamil Nadu Pollution Control Board (TNPCB)',
    emails: ['complaint@tnpcb.gov.in'],
    phones: ['1800-425-6750'],
    portal: 'https://tnpcb.gov.in',
    notes: 'OLGPRS online grievance system + toll-free complaint line.',
    verified: true,
  },
  'west bengal': {
    name: 'West Bengal Pollution Control Board (WBPCB)',
    emails: [],
    phones: ['1800-345-3390'],
    portal: 'https://wbpcb.gov.in',
    notes: 'Toll-free complaint line. Use the portal form for written complaints.',
    verified: true,
  },
  gujarat: {
    name: 'Gujarat Pollution Control Board (GPCB)',
    emails: [],
    phones: ['079-23222425', '079-23232152'],
    portal: 'https://gpcb.gujarat.gov.in',
    notes: 'Use the online complaint form on the portal for a written record.',
    verified: true,
  },
  'uttar pradesh': {
    name: 'Uttar Pradesh Pollution Control Board (UPPCB)',
    emails: ['info@uppcb.in'],
    phones: ['1800-180-5455', '0522-2720831'],
    portal: 'https://uppcb.com',
    notes: 'Head office: TC-12V Vibhuti Khand, Gomti Nagar, Lucknow 226010.',
    verified: true,
  },
  telangana: {
    name: 'Telangana Pollution Control Board (TGPCB)',
    emails: [],
    phones: ['10741', '040-23887500'],
    portal: 'https://tgpcb.cgg.gov.in',
    notes: '10741 is the state pollution toll-free line. Prajavani 155300 also accepts grievances. No public complaint email is published — use the portal form.',
    verified: true,
  },
  kerala: {
    name: 'Kerala State Pollution Control Board (KSPCB)',
    emails: ['kspcbcomplaintcell25@gmail.com'],
    phones: ['0471-2318153'],
    portal: 'https://kspcb.kerala.gov.in',
    notes: 'Complaint cell email is the published route for public complaints.',
    verified: true,
  },
};

// States we can name, with their official board portal. Emails are only added
// when confirmed — otherwise the user is pointed to the portal form.
export const OTHER_STATE_BOARDS = {
  'andhra pradesh': { name: 'Andhra Pradesh Pollution Control Board', portal: 'https://appcb.ap.gov.in' },
  assam: { name: 'Pollution Control Board Assam', portal: 'https://pcba.assam.gov.in' },
  bihar: { name: 'Bihar State Pollution Control Board', portal: 'https://bspcb.bihar.gov.in' },
  chhattisgarh: { name: 'Chhattisgarh Environment Conservation Board', portal: 'https://cecb.cg.gov.in' },
  goa: { name: 'Goa State Pollution Control Board', portal: 'https://gspcb.goa.gov.in' },
  haryana: { name: 'Haryana State Pollution Control Board', portal: 'https://hspcb.org.in' },
  'himachal pradesh': { name: 'Himachal Pradesh State Pollution Control Board', portal: 'https://hppcb.nic.in' },
  jharkhand: { name: 'Jharkhand State Pollution Control Board', portal: 'https://jspcb.nic.in' },
  'madhya pradesh': { name: 'Madhya Pradesh Pollution Control Board', portal: 'https://mppcb.mp.gov.in' },
  odisha: { name: 'Odisha State Pollution Control Board', portal: 'https://ospcboard.org' },
  punjab: { name: 'Punjab Pollution Control Board', portal: 'https://ppcb.punjab.gov.in' },
  rajasthan: { name: 'Rajasthan State Pollution Control Board', portal: 'https://environment.rajasthan.gov.in' },
  uttarakhand: { name: 'Uttarakhand Pollution Control Board', portal: 'https://uepcb.nic.in' },
  'jammu and kashmir': { name: 'J&K Pollution Control Committee', portal: 'https://jkppcb.nic.in' },
  chandigarh: { name: 'Chandigarh Pollution Control Committee', portal: 'https://chandigarh.gov.in' },
};

const CITY_TO_STATE = {
  'navi mumbai': 'maharashtra',
  mumbai: 'maharashtra',
  thane: 'maharashtra',
  pune: 'maharashtra',
  nagpur: 'maharashtra',
  nashik: 'maharashtra',
  bengaluru: 'karnataka',
  bangalore: 'karnataka',
  mysuru: 'karnataka',
  delhi: 'delhi',
  'new delhi': 'delhi',
  chennai: 'tamil nadu',
  coimbatore: 'tamil nadu',
  madurai: 'tamil nadu',
  kolkata: 'west bengal',
  howrah: 'west bengal',
  ahmedabad: 'gujarat',
  surat: 'gujarat',
  vadodara: 'gujarat',
  rajkot: 'gujarat',
  lucknow: 'uttar pradesh',
  noida: 'uttar pradesh',
  ghaziabad: 'uttar pradesh',
  kanpur: 'uttar pradesh',
  varanasi: 'uttar pradesh',
  agra: 'uttar pradesh',
  hyderabad: 'telangana',
  warangal: 'telangana',
  kochi: 'kerala',
  cochin: 'kerala',
  thiruvananthapuram: 'kerala',
  trivandrum: 'kerala',
  kozhikode: 'kerala',
  visakhapatnam: 'andhra pradesh',
  vijayawada: 'andhra pradesh',
  bhopal: 'madhya pradesh',
  indore: 'madhya pradesh',
  jaipur: 'rajasthan',
  jodhpur: 'rajasthan',
  patna: 'bihar',
  bhubaneswar: 'odisha',
  cuttack: 'odisha',
  guwahati: 'assam',
  chandigarh: 'chandigarh',
  ludhiana: 'punjab',
  amritsar: 'punjab',
  dehradun: 'uttarakhand',
  raipur: 'chhattisgarh',
  ranchi: 'jharkhand',
  shimla: 'himachal pradesh',
  panaji: 'goa',
  srinagar: 'jammu and kashmir',
  jammu: 'jammu and kashmir',
};

export function stateForCity(city) {
  if (!city) return null;
  const lower = String(city).toLowerCase();
  // Geocoding labels include the state (for example "Udaipur, Rajasthan,
  // India"), so any Indian city can resolve to its official state board even
  // when the city itself is not in our alias table.
  const stateName = [...Object.keys(STATE_AUTHORITIES), ...Object.keys(OTHER_STATE_BOARDS)]
    .find((state) => lower.includes(state));
  if (stateName) return stateName;
  const key = Object.keys(CITY_TO_STATE).find((k) => lower.includes(k));
  return key ? CITY_TO_STATE[key] : null;
}

export function getStateAuthority(city) {
  const state = stateForCity(city);
  if (!state) return null;

  const board = STATE_AUTHORITIES[state];
  if (board) {
    return { state, level: 'state', ...board };
  }
  const other = OTHER_STATE_BOARDS[state];
  if (other) {
    return {
      state,
      level: 'state',
      name: other.name,
      emails: [],
      phones: [],
      portal: other.portal,
      notes: 'File the complaint through the board\'s online grievance form; add CPCB/MoEFCC in CC for escalation.',
      verified: false,
    };
  }
  return null;
}

/** National + state bundle for a city (local authority comes from agentTools). */
export function getAuthorityBundle(city) {
  return {
    national: NATIONAL_AUTHORITIES,
    state: getStateAuthority(city),
  };
}

/** Compact text block used in AI context and chat replies. */
export function formatAuthorityLines(authority, { limit = 3 } = {}) {
  if (!authority) return [];
  const lines = [];
  const label = authority.level === 'national' ? '🇮🇳' : '🏛️';
  lines.push(`${label} **${authority.name}**`);
  (authority.emails || []).slice(0, limit).forEach((email) => lines.push(`📧 ${email}`));
  if (!authority.emails?.length && authority.portal) lines.push('📧 (use the grievance form on the portal)');
  (authority.phones || []).slice(0, 2).forEach((phone) => lines.push(`📞 ${phone}`));
  if (authority.portal) lines.push(`🌐 ${authority.portal}`);
  return lines;
}

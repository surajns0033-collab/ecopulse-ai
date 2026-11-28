import { NATIONAL_AUTHORITIES } from './nationalAuthorities.js';
import { STATE_AUTHORITIES, OTHER_STATE_BOARDS } from './stateAuthorities.js';

export { NATIONAL_AUTHORITIES } from './nationalAuthorities.js';
export { STATE_AUTHORITIES, OTHER_STATE_BOARDS } from './stateAuthorities.js';

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

const placeParts = (city) => String(city || '').toLowerCase().split(',').map((part) => part.trim()).filter(Boolean)
  .map((part) => part === 'national capital territory of delhi' ? 'delhi' : part);

export function isIndianPlace(city) {
  const parts = placeParts(city);
  return parts.length >= 2 && parts.at(-1) === 'india';
}

export function matchesDirectoryCity(city) {
  if (!isIndianPlace(city)) return false;
  const [name, ...regions] = placeParts(city);
  const state = Object.hasOwn(CITY_TO_STATE, name) ? CITY_TO_STATE[name] : null;
  return typeof state === 'string' && (name === state || regions.includes(state));
}

export function stateForCity(city) {
  if (!isIndianPlace(city)) return null;
  const [name, ...regions] = placeParts(city);
  // Geocoding labels include the state (for example "Udaipur, Rajasthan,
  // India"), so any Indian city can resolve to its official state board even
  // when the city itself is not in our alias table.
  const stateName = [...Object.keys(STATE_AUTHORITIES), ...Object.keys(OTHER_STATE_BOARDS)]
    .find((state) => regions.includes(state));
  if (stateName) return stateName;
  return matchesDirectoryCity(city) ? CITY_TO_STATE[name] : null;
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
    national: isIndianPlace(city) ? NATIONAL_AUTHORITIES : [],
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

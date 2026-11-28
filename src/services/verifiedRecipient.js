import { getAuthorityBundle, isIndianPlace, matchesDirectoryCity } from './authorityDirectory.js';
import { maharashtraContacts } from './maharashtraContacts.js';
import { southernContacts } from './southernContacts.js';
import { otherCityContacts } from './cityContacts.js';

const knownContacts = { ...maharashtraContacts, ...southernContacts, ...otherCityContacts };

function outsideDirectory(city) {
  return {
    email: null,
    name: 'Relevant Local Authority',
    organization: city ? `Local municipal or environmental authority for ${city}` : 'Local municipal or environmental authority',
    portalUrl: null,
    helpline: null,
    jurisdiction: city ? 'outside-india' : 'unknown',
    disclaimer: city ? 'No verified contact is stored for this jurisdiction. Check the official city or regional government website.'
      : 'Provide the city and country to check for verified local contacts.',
  };
}

function trafficRecipient(city, naviMumbai) {
  if (naviMumbai) {
    return {
      email: 'cp.navimumbai@mahapolice.gov.in',
      name: 'Commissioner of Police, Navi Mumbai',
      organization: 'Navi Mumbai Traffic Police / Navi Mumbai Police',
      portalUrl: 'https://navimumbaipolice.gov.in/en/report/complaint',
      helpline: '7738393839 (24×7 Traffic Helpline)',
      whatsapp: null,
      nationalPortal: null,
      forestEmail: null,
      forestHelpline: null,
      stateAuthority: {
        state: 'maharashtra',
        level: 'state',
        name: 'Maharashtra Police Citizen Portal',
        emails: [],
        phones: ['112 (emergency only)'],
        portal: 'https://dial112.mahapolice.gov.in/CitizenPortal-Maharashtra/register-complaint',
        notes: 'Use 112 only when the obstruction creates immediate danger or blocks emergency access.',
        verified: true,
      },
      nationalAuthority: [],
      civicDomain: 'traffic',
      jurisdiction: 'india',
      disclaimer: 'Publicly listed official police contacts — verify on the official portal before sending.',
    };
  }
  return {
    email: null,
    name: 'Local Traffic Police',
    organization: city ? `Traffic Police for ${city}` : 'Local Traffic Police',
    portalUrl: 'https://digitalpolice.gov.in',
    helpline: '112 (emergency only)',
    whatsapp: null,
    nationalPortal: null,
    forestEmail: null,
    forestHelpline: null,
    stateAuthority: null,
    nationalAuthority: [],
    civicDomain: 'traffic',
    jurisdiction: 'india',
    localUnavailable: true,
    disclaimer: 'No verified local email is stored for this city. Check the state police website; call 112 only for immediate danger.',
  };
}

function municipalRecipient(matchKey, issueCategory, authorityBundle) {
  const isMaharashtra = ['navi mumbai', 'mumbai', 'pune', 'thane', 'nagpur'].includes(matchKey);
  const c = knownContacts[matchKey];
  const contactCategory = issueCategory === 'plastic'
    ? 'garbage'
    : (issueCategory === 'burning' || issueCategory === 'industrial' ? 'air' : issueCategory);
  const email = c[contactCategory] || c.default;
  return {
    email,
    name: c.name,
    organization: c.organization,
    portalUrl: c.portalUrl,
    sourceUrl: c.sourceUrl || null,
    helpline: c.helpline || null,
    whatsapp: c.whatsapp || null,
    nationalPortal: 'https://pgportal.gov.in',
    forestEmail: c.forestEmail || (isMaharashtra ? 'ccfmangraove@mahaforest.gov.in' : null),
    forestHelpline: c.forestHelpline || null,
    stateAuthority: authorityBundle.state,
    nationalAuthority: authorityBundle.national,
    jurisdiction: 'india',
    disclaimer: 'Publicly listed official contacts — please verify on the official portal before sending.',
  };
}

export async function findVerifiedRecipient({ issueCategory, city }) {
  if (!isIndianPlace(city)) return outsideDirectory(city);
  const cityName = city.split(',')[0].trim().toLowerCase();
  const matchKey = matchesDirectoryCity(city) && Object.hasOwn(knownContacts, cityName) ? cityName : null;
  if (issueCategory === 'road_obstruction') return trafficRecipient(city, matchKey === 'navi mumbai');
  const authorityBundle = getAuthorityBundle(city);
  if (matchKey) return municipalRecipient(matchKey, issueCategory, authorityBundle);
  return {
    email: null,
    name: 'Local Municipal / Environmental Authority',
    organization: city ? `Municipal Corporation / District Administration for ${city}` : 'Local Municipal / Environmental Authority',
    portalUrl: 'https://pgportal.gov.in',
    helpline: null,
    nationalPortal: 'https://pgportal.gov.in',
    forestHelpline: null,
    stateAuthority: authorityBundle.state,
    nationalAuthority: authorityBundle.national,
    jurisdiction: 'india',
    localUnavailable: true,
    disclaimer: `For ${city || 'your area'}, file an official grievance with automatic tracking at CPGRAMS (pgportal.gov.in) and verify the correct local department on the city or district portal.`,
  };
}

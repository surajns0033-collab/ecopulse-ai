// Agent Tools — all async tool implementations

import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
  query, where, orderBy, limit as fsLimit, Timestamp, increment, onSnapshot
} from 'firebase/firestore';
import { isFirebaseConfigured } from '../firebase/config';
import { db } from '../firebase/firestoreClient';
import { COLLECTIONS, generateReportId, generateEventId } from '../firebase/collections';
import { getAirQuality, getWeather } from './environmentalData';
import { analyzeEnvironmentalImage as geminiAnalyze } from './geminiService';
import { getAuthorityBundle, isIndianPlace, matchesDirectoryCity } from './authorityDirectory';
import { analyzeImageOnDevice } from './onDeviceVision';

// Persistent localStorage fallback store for when Firebase isn't configured
function readLocal(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const STORAGE_KEYS = {
  MEETUPS: 'echopulse_local_meetups',
  RSVPS: 'echopulse_local_rsvps',
  POSTS: 'echopulse_local_posts',
  REPORTS: 'echopulse_local_reports',
  DRAFTS: 'echopulse_local_drafts',
};

const localStore = {
  actions: [],
};

// Helper: skip Firestore immediately when not configured, otherwise try Firestore with local fallback
async function firestoreOrLocal(firestoreFn, localFallback) {
  if (!isFirebaseConfigured) return localFallback();
  try {
    return await firestoreFn();
  } catch (err) {
    console.warn('Firestore unavailable, using local fallback:', err.message);
    return localFallback();
  }
}

export const tools = {
  /**
   * Get combined environmental data (AQI + weather)
   */
  getEnvironmentalData: async ({ lat, lng, city }) => {
    const [aqi, weather] = await Promise.all([
      getAirQuality(lat, lng, city).catch(() => null),
      getWeather(lat, lng).catch(() => null),
    ]);
    return { aqi, weather };
  },

  /**
   * Get published meetups from Firestore (the listing isn't geospatial).
   */
  getNearbyMeetups: async ({ category, limit: lim = 10 }) => {
    return firestoreOrLocal(
      async () => {
        let q = query(
          collection(db, COLLECTIONS.MEETUPS),
          where('status', '==', 'published'),
          orderBy('date', 'asc'),
          fsLimit(lim)
        );
        const snap = await getDocs(q);
        let events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (category) events = events.filter((e) => e.category === category);
        return events;
      },
      () => readLocal(STORAGE_KEYS.MEETUPS)
        .filter((e) => !category || e.category === category)
        .slice(0, lim)
    );
  },

  /**
   * Get community posts (public channel across all locations)
   */
  getCommunityFeed: async ({ limit: lim = 30, locationFilter = null } = {}) => {
    return firestoreOrLocal(
      async () => {
        const q = query(
          collection(db, COLLECTIONS.COMMUNITY_POSTS),
          orderBy('createdAt', 'desc'),
          fsLimit(lim)
        );
        const snap = await getDocs(q);
        let posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (locationFilter && locationFilter !== 'all') {
          posts = posts.filter((p) => (p.location || '').toLowerCase().includes(locationFilter.toLowerCase()));
        }
        return posts;
      },
      () => {
        let posts = readLocal(STORAGE_KEYS.POSTS);
        if (locationFilter && locationFilter !== 'all') {
          posts = posts.filter((p) => (p.location || '').toLowerCase().includes(locationFilter.toLowerCase()));
        }
        return posts.slice(0, lim);
      }
    );
  },

  /** Subscribe to public community messages in real time. */
  subscribeCommunityFeed: ({ limit: lim = 50 } = {}, onChange) => {
    if (isFirebaseConfigured) {
      const q = query(
        collection(db, COLLECTIONS.COMMUNITY_POSTS),
        orderBy('createdAt', 'desc'),
        fsLimit(lim)
      );
      return onSnapshot(q, (snapshot) => {
        onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      }, (error) => {
        console.warn('Community live updates unavailable:', error.message);
      });
    }

    const emitLocal = () => onChange(readLocal(STORAGE_KEYS.POSTS).slice(0, lim));
    emitLocal();
    const handleStorage = (event) => {
      if (event.key === STORAGE_KEYS.POSTS) emitLocal();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  },

  /**
   * Post a message to the public community channel
   */
  createCommunityPost: async ({ userId, author, text, location, tags = [] }) => {
    const postData = {
      userId: userId || 'guest',
      author: author || 'Community Member',
      text: text.trim(),
      location: (location || 'Global').trim(),
      tags,
      createdAt: new Date().toISOString(),
    };

    return firestoreOrLocal(
      async () => {
        const docRef = await addDoc(collection(db, COLLECTIONS.COMMUNITY_POSTS), {
          ...postData,
          createdAt: Timestamp.now(),
        });
        return { id: docRef.id, ...postData };
      },
      () => {
        const saved = { id: 'post-' + Date.now(), ...postData };
        const existing = readLocal(STORAGE_KEYS.POSTS);
        writeLocal(STORAGE_KEYS.POSTS, [saved, ...existing]);
        return saved;
      }
    );
  },

  /** Delete a community post owned by the current user. Firestore rules enforce ownership too. */
  deleteCommunityPost: async ({ postId, userId }) => {
    if (!postId || !userId) throw new Error('Post and user are required.');
    return firestoreOrLocal(
      async () => {
        await deleteDoc(doc(db, COLLECTIONS.COMMUNITY_POSTS, postId));
        return { success: true };
      },
      () => {
        const remaining = readLocal(STORAGE_KEYS.POSTS).filter((post) => !(post.id === postId && post.userId === userId));
        writeLocal(STORAGE_KEYS.POSTS, remaining);
        return { success: true };
      }
    );
  },

  /**
   * Create an environmental report
   */
  createEnvironmentalReport: async ({ userId, title, description, category, location, photoUrl, lat, lng }) => {
    const reportId = generateReportId();
    const reportData = {
      reportId,
      userId,
      title,
      description,
      category,
      location,
      photoUrl: photoUrl || null,
      lat: lat || null,
      lng: lng || null,
      status: 'submitted',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    return firestoreOrLocal(
      async () => {
        const docRef = await addDoc(collection(db, COLLECTIONS.REPORTS), reportData);
        return { reportId, docId: docRef.id };
      },
      () => {
        const reports = readLocal(STORAGE_KEYS.REPORTS);
        reports.push({ id: reportId, ...reportData, createdAt: new Date().toISOString() });
        writeLocal(STORAGE_KEYS.REPORTS, reports);
        return { reportId, docId: reportId };
      }
    );
  },

  /**
   * Analyze an environmental image
   */
  analyzeEnvironmentalImage: async ({ base64, mimeType, contextHint }) => {
    // Prefer a configured multimodal provider. If it is unavailable, classify
    // common civic/environmental scenes locally in the browser.
    const cloudResult = await geminiAnalyze(base64, mimeType, contextHint || '');
    if (cloudResult) return { ...cloudResult, provider: cloudResult.provider || 'AI vision' };
    return analyzeImageOnDevice(base64, mimeType, contextHint || '');
  },

  /**
   * Create a new meetup event
   */
  createMeetup: async ({ userId, organizer, title, description, category, location, date, time, capacity, lat, lng }) => {
    const eventId = generateEventId();
    const isoDate = date ? new Date(date).toISOString() : new Date().toISOString();
    const eventData = {
      eventId,
      userId,
      title,
      description,
      category,
      location,
      date: date ? Timestamp.fromDate(new Date(date)) : Timestamp.now(),
      time,
      capacity: Number(capacity) || 20,
      participantCount: 0,
      lat: lat || null,
      lng: lng || null,
      organizer: organizer || 'Community Member',
      status: 'published',
      isSeeded: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    return firestoreOrLocal(
      async () => {
        const docRef = await addDoc(collection(db, COLLECTIONS.MEETUPS), eventData);
        return { eventId, docId: docRef.id };
      },
      () => {
        const localEvent = {
          ...eventData,
          id: eventId,
          date: isoDate,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const existing = readLocal(STORAGE_KEYS.MEETUPS);
        writeLocal(STORAGE_KEYS.MEETUPS, [localEvent, ...existing]);
        return { eventId, docId: eventId, event: localEvent };
      }
    );
  },

  /**
   * Join/RSVP to a meetup
   */
  joinMeetup: async ({ userId, meetupId }) => {
    return firestoreOrLocal(
      async () => {
        // Check if already RSVP'd
        const existing = await getDocs(
          query(collection(db, COLLECTIONS.RSVPS), where('userId', '==', userId), where('meetupId', '==', meetupId))
        );
        if (!existing.empty) return { alreadyJoined: true };

        await addDoc(collection(db, COLLECTIONS.RSVPS), {
          userId,
          meetupId,
          createdAt: Timestamp.now(),
        });

        // Try to increment participant count (best effort)
        const meetupDocs = await getDocs(
          query(collection(db, COLLECTIONS.MEETUPS), where('eventId', '==', meetupId))
        );
        if (!meetupDocs.empty) {
          await updateDoc(meetupDocs.docs[0].ref, { participantCount: increment(1) });
        }

        return { success: true, meetupId };
      },
      () => {
        const rsvps = readLocal(STORAGE_KEYS.RSVPS);
        const alreadyJoined = rsvps.some((r) => r.userId === userId && r.meetupId === meetupId);
        if (!alreadyJoined) {
          rsvps.push({ userId, meetupId });
          writeLocal(STORAGE_KEYS.RSVPS, rsvps);
          const meetups = readLocal(STORAGE_KEYS.MEETUPS).map((m) =>
            (m.eventId === meetupId || m.id === meetupId)
              ? { ...m, participantCount: (m.participantCount || 0) + 1 }
              : m
          );
          writeLocal(STORAGE_KEYS.MEETUPS, meetups);
        }
        return { success: !alreadyJoined, alreadyJoined };
      }
    );
  },

  /**
   * Cancel RSVP for a meetup
   */
  cancelMeetupRSVP: async ({ userId, meetupId }) => {
    return firestoreOrLocal(
      async () => {
        const snap = await getDocs(
          query(collection(db, COLLECTIONS.RSVPS), where('userId', '==', userId), where('meetupId', '==', meetupId))
        );
        for (const d of snap.docs) await deleteDoc(d.ref);

        // Decrement participant count
        const meetupDocs = await getDocs(
          query(collection(db, COLLECTIONS.MEETUPS), where('eventId', '==', meetupId))
        );
        if (!meetupDocs.empty) {
          await updateDoc(meetupDocs.docs[0].ref, { participantCount: increment(-1) });
        }

        return { success: true };
      },
      () => {
        const rsvps = readLocal(STORAGE_KEYS.RSVPS).filter((r) => !(r.userId === userId && r.meetupId === meetupId));
        writeLocal(STORAGE_KEYS.RSVPS, rsvps);
        const meetups = readLocal(STORAGE_KEYS.MEETUPS).map((m) =>
          (m.eventId === meetupId || m.id === meetupId)
            ? { ...m, participantCount: Math.max(0, (m.participantCount || 1) - 1) }
            : m
        );
        writeLocal(STORAGE_KEYS.MEETUPS, meetups);
        return { success: true };
      }
    );
  },

  /**
   * Save an email draft
   */
  createEmailDraft: async ({ userId, reportId, issue, location, recipientType, recipientEmail, subject, body }) => {
    const draftData = {
      userId,
      reportId: reportId || null,
      issue,
      location,
      recipientType,
      recipientEmail,
      subject,
      body,
      status: 'draft',
      createdAt: Timestamp.now(),
    };

    return firestoreOrLocal(
      async () => {
        const docRef = await addDoc(collection(db, COLLECTIONS.EMAIL_DRAFTS), draftData);
        return { draftId: docRef.id };
      },
      () => {
        const id = 'draft-' + Date.now();
        const drafts = readLocal(STORAGE_KEYS.DRAFTS);
        drafts.push({ id, ...draftData, createdAt: new Date().toISOString() });
        writeLocal(STORAGE_KEYS.DRAFTS, drafts);
        return { draftId: id };
      }
    );
  },

  /**
   * Find verified municipal/environmental recipients + official portal & helpline
   */
  findVerifiedRecipient: async ({ issueCategory, city }) => {
    if (!isIndianPlace(city)) {
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
    const cityName = city.split(',')[0].trim().toLowerCase();
    const authorityBundle = getAuthorityBundle(city);

    // Road obstruction belongs to traffic police, not the municipal environment
    // department. These Navi Mumbai details are published by Navi Mumbai Police.
    if (issueCategory === 'road_obstruction' && cityName === 'navi mumbai' && matchesDirectoryCity(city)) {
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

    if (issueCategory === 'road_obstruction') {
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

    const knownContacts = {
      'navi mumbai': {
        default: 'commissioner@nmmconline.com',
        name: 'NMMC Commissioner',
        organization: 'Navi Mumbai Municipal Corporation (NMMC)',
        portalUrl: 'https://www.nmmc.gov.in/register-grievance',
        sourceUrl: 'https://thane.nic.in/en/telephone-directory/',
        forestEmail: 'ccfmangraove@mahaforest.gov.in',
        forestHelpline: '1926 (24/7 Toll-Free)',
      },
      'mumbai': {
        default: 'commissioner@mcgm.gov.in',
        garbage: 'solidwaste@mcgm.gov.in',
        water: 'hydraulic@mcgm.gov.in',
        sewage: 'sewage@mcgm.gov.in',
        trees: 'gardens@mcgm.gov.in',
        air: 'environment@mcgm.gov.in',
        name: 'BMC / MCGM Commissioner',
        organization: 'Brihanmumbai Municipal Corporation (BMC)',
        portalUrl: 'https://portal.mcgm.gov.in',
        helpline: '1916',
        forestEmail: 'ccfmangraove@mahaforest.gov.in',
        forestHelpline: '1926 (24/7 Toll-Free)',
      },
      'thiruvananthapuram': {
        default: 'secretary@tmcofficials.in',
        garbage: 'complaints.tmc@gmail.com',
        trees: 'secretary@tmcofficials.in',
        air: 'secretary@tmcofficials.in',
        water: 'secretary@tmcofficials.in',
        name: 'TMC Secretary',
        organization: 'Thiruvananthapuram Municipal Corporation (TMC)',
        portalUrl: 'https://tmc.lsgkerala.gov.in',
        helpline: '1800-425-6882 / 0471-2320821',
        whatsapp: '9447377477',
        forestEmail: 'dfo.tvm.for@kerala.gov.in',
        forestHelpline: '1926 (24/7 Toll-Free Vanabandhu)',
      },
      'trivandrum': {
        default: 'secretary@tmcofficials.in',
        garbage: 'complaints.tmc@gmail.com',
        trees: 'secretary@tmcofficials.in',
        air: 'secretary@tmcofficials.in',
        water: 'secretary@tmcofficials.in',
        name: 'TMC Secretary',
        organization: 'Thiruvananthapuram Municipal Corporation (TMC)',
        portalUrl: 'https://tmc.lsgkerala.gov.in',
        helpline: '1800-425-6882 / 0471-2320821',
        whatsapp: '9447377477',
        forestEmail: 'dfo.tvm.for@kerala.gov.in',
        forestHelpline: '1926 (24/7 Toll-Free Vanabandhu)',
      },
      'kochi': {
        default: 'kochicorpsecretary@gmail.com',
        trees: 'kochicorpsecretary@gmail.com',
        name: 'Secretary, Kochi Municipal Corporation',
        organization: 'Kochi Municipal Corporation',
        portalUrl: 'https://kochicorporation.lsgkerala.gov.in',
        helpline: '0484-2369007 / 9188955176',
        forestEmail: 'pccf.for@kerala.gov.in',
        forestHelpline: '1926 (24/7 Toll-Free)',
      },
      'cochin': {
        default: 'kochicorpsecretary@gmail.com',
        trees: 'kochicorpsecretary@gmail.com',
        name: 'Secretary, Kochi Municipal Corporation',
        organization: 'Kochi Municipal Corporation',
        portalUrl: 'https://kochicorporation.lsgkerala.gov.in',
        helpline: '0484-2369007 / 9188955176',
        forestEmail: 'pccf.for@kerala.gov.in',
        forestHelpline: '1926 (24/7 Toll-Free)',
      },
      'pune': {
        default: 'commissioner@pmccare.in',
        garbage: 'solidwaste@pmccare.in',
        trees: 'garden@punecorporation.org',
        name: 'PMC Commissioner',
        organization: 'Pune Municipal Corporation (PMC)',
        portalUrl: 'https://www.pmc.gov.in',
        helpline: '1800-103-0222',
        forestEmail: 'ccfmangraove@mahaforest.gov.in',
        forestHelpline: '1926 (24/7 Toll-Free)',
      },
      'delhi': {
        default: 'mcd@mcdonline.nic.in',
        air: 'environment@dpcc.delhigovt.nic.in',
        trees: 'dcfnd-forest.delhi@nic.in',
        name: 'MCD Commissioner',
        organization: 'Municipal Corporation of Delhi (MCD)',
        portalUrl: 'https://mcdonline.nic.in',
        helpline: '155305',
        forestEmail: 'dcfnd-forest.delhi@nic.in',
        forestHelpline: '1800-11-8600 (Green Helpline)',
      },
      'bengaluru': {
        default: 'comm@bbmpgov.in',
        trees: 'dcfbbmp1@gmail.com',
        name: 'BBMP Commissioner',
        organization: 'Bruhat Bengaluru Mahanagara Palike (BBMP)',
        portalUrl: 'https://bbmp.gov.in',
        helpline: '1533',
        forestEmail: 'dcfbbmp1@gmail.com',
        forestHelpline: '1926 (Karnataka Forest 24/7)',
      },
      'bangalore': {
        default: 'comm@bbmpgov.in',
        trees: 'dcfbbmp1@gmail.com',
        name: 'BBMP Commissioner',
        organization: 'Bruhat Bengaluru Mahanagara Palike (BBMP)',
        portalUrl: 'https://bbmp.gov.in',
        helpline: '1533',
        forestEmail: 'dcfbbmp1@gmail.com',
        forestHelpline: '1926 (Karnataka Forest 24/7)',
      },
      'hyderabad': {
        default: 'commissioner@ghmc.gov.in',
        name: 'GHMC Commissioner',
        organization: 'Greater Hyderabad Municipal Corporation (GHMC)',
        portalUrl: 'https://www.ghmc.gov.in',
        helpline: '040-21111111',
        forestEmail: 'pccf_wl_ts@telangana.gov.in',
        forestHelpline: '1800-425-5364',
      },
      'chennai': {
        default: 'commr@chennaicorporation.gov.in',
        name: 'GCC Commissioner',
        organization: 'Greater Chennai Corporation (GCC)',
        portalUrl: 'https://chennaicorporation.gov.in',
        helpline: '1913',
        forestEmail: 'pccf-tn@nic.in',
        forestHelpline: '1800-425-4740',
      },
      'kolkata': {
        default: 'mc@kmcgov.in',
        name: 'KMC Commissioner',
        organization: 'Kolkata Municipal Corporation (KMC)',
        portalUrl: 'https://www.kmcgov.in',
        helpline: '155360',
        forestEmail: 'pccfwb@vsnl.net',
        forestHelpline: '1800-345-3873',
      },
      'ahmedabad': {
        default: 'commissioner@egovamc.com',
        name: 'AMC Commissioner',
        organization: 'Ahmedabad Municipal Corporation (AMC)',
        portalUrl: 'https://ahmedabadcity.gov.in',
        helpline: '155303',
        forestEmail: 'pccf-forest@gujarat.gov.in',
        forestHelpline: '1926',
      },
      'surat': {
        default: 'commissioner@suratmunicipal.org',
        name: 'SMC Commissioner',
        organization: 'Surat Municipal Corporation (SMC)',
        portalUrl: 'https://www.suratmunicipal.gov.in',
        helpline: '1800-123-8000',
        forestEmail: 'pccf-forest@gujarat.gov.in',
        forestHelpline: '1926',
      },
      'jaipur': {
        default: 'commissioner.jmc@rajasthan.gov.in',
        name: 'JMC Commissioner',
        organization: 'Nagar Nigam Jaipur (JMC)',
        portalUrl: 'https://jaipurmc.org',
        helpline: '1800-572-8545 / 0141-2747400',
        forestEmail: 'pccf-forest-rj@nic.in',
        forestHelpline: '1800-180-6088',
      },
      'lucknow': {
        default: 'nnlko@nic.in',
        name: 'Municipal Commissioner, Lucknow',
        organization: 'Lucknow Municipal Corporation (LMC)',
        portalUrl: 'https://lmc.up.nic.in',
        helpline: '1533 / +91-9219902911',
        forestEmail: 'pccf-forest-up@nic.in',
        forestHelpline: '1926',
      },
      'thane': {
        default: 'commissioner@thanecity.gov.in',
        name: 'TMC Commissioner',
        organization: 'Thane Municipal Corporation (TMC)',
        portalUrl: 'https://thanecity.gov.in',
        helpline: '1800-222-108',
        forestEmail: 'ccfmangraove@mahaforest.gov.in',
        forestHelpline: '1926 (24/7 Toll-Free)',
      },
      'nagpur': {
        default: 'commissioner@nmcnagpur.gov.in',
        name: 'NMC Commissioner',
        organization: 'Nagpur Municipal Corporation (NMC)',
        portalUrl: 'https://nmcnagpur.gov.in',
        helpline: '0712-2567035',
        forestEmail: 'pccfngp@mahaforest.gov.in',
        forestHelpline: '1926 (24/7 Toll-Free)',
      },
      'chandigarh': {
        default: 'mc-chd@nic.in',
        name: 'MCC Commissioner',
        organization: 'Municipal Corporation Chandigarh (MCC)',
        portalUrl: 'https://mcchandigarh.gov.in',
        helpline: '155304',
        forestEmail: 'forest-chd@nic.in',
        forestHelpline: '0172-2700217',
      },
      'indore': {
        default: 'commindore@mpurban.gov.in',
        name: 'IMC Commissioner',
        organization: 'Indore Municipal Corporation (IMC)',
        portalUrl: 'https://imcindore.mp.gov.in',
        helpline: '1800-233-5555 / 0731-2535555',
        forestEmail: 'pccfmp@mp.gov.in',
        forestHelpline: '1926',
      },
    };

    const matchKey = matchesDirectoryCity(city) && Object.hasOwn(knownContacts, cityName) ? cityName : null;
    const isMaharashtra = ['navi mumbai', 'mumbai', 'pune', 'thane', 'nagpur'].includes(matchKey);
    if (matchKey) {
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
  },

  /**
   * Get a personalized daily action plan
   */
  getDailyActionPlan: async ({ lat, lng }) => {
    const aqiData = await getAirQuality(lat, lng);

    const basePlan = [
      { icon: '🌱', action: 'Check local AQI before planning outdoor activity.' },
      { icon: '♻️', action: 'Segregate your household waste into wet, dry, and hazardous categories.' },
      { icon: '💧', action: 'Carry a reusable water bottle and refuse single-use plastic today.' },
      { icon: '🤝', action: 'Share one environmental tip with a friend or family member.' },
      { icon: '📸', action: 'Report one environmental issue you notice today using EcoPulse AI.' },
    ];

    const highAQIPlan = [
      { icon: '😷', action: 'AQI is elevated — wear an N95 mask if going outdoors for extended periods.' },
      { icon: '🏠', action: 'Keep windows closed while outdoor pollution is elevated, and ventilate when it improves.' },
      { icon: '🌿', action: 'Run a HEPA filter if you have one and avoid burning candles or incense indoors.' },
      { icon: '🚶', action: 'Combine errands or take transit to reduce repeat vehicle trips.' },
      { icon: '📋', action: 'Report any visible pollution sources (burning, construction dust) to authorities via EcoPulse.' },
    ];

    return aqiData?.aqi > 100 ? highAQIPlan : basePlan;
  },

  /**
   * Get user's environmental impact stats
   */
  getUserImpact: async ({ userId }) => {
    return firestoreOrLocal(
      async () => {
        const [reportsSnap, rsvpsSnap] = await Promise.all([
          getDocs(query(collection(db, COLLECTIONS.REPORTS), where('userId', '==', userId))),
          getDocs(query(collection(db, COLLECTIONS.RSVPS), where('userId', '==', userId))),
        ]);
        return {
          reportsSubmitted: reportsSnap.size,
          eventsJoined: rsvpsSnap.size,
          carbonSaved: rsvpsSnap.size * 2.4, // approx kg CO2
          treesPlanted: 0,
        };
      },
      () => {
        const reports = readLocal(STORAGE_KEYS.REPORTS);
        const rsvps = readLocal(STORAGE_KEYS.RSVPS);
        return {
          reportsSubmitted: reports.filter((r) => r.userId === userId).length,
          eventsJoined: rsvps.filter((r) => r.userId === userId).length,
          carbonSaved: rsvps.filter((r) => r.userId === userId).length * 2.4,
          treesPlanted: 0,
        };
      }
    );
  },

  /**
   * Save a user action to history
   */
  saveUserAction: async ({ userId, actionType, data }) => {
    return firestoreOrLocal(
      async () => {
        await addDoc(collection(db, COLLECTIONS.USER_ACTIONS), {
          userId,
          actionType,
          data,
          createdAt: Timestamp.now(),
        });
        return { saved: true };
      },
      () => {
        localStore.actions.push({ userId, actionType, data, createdAt: new Date().toISOString() });
        return { saved: true };
      }
    );
  },
};

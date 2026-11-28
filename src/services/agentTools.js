import { collection, addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { isFirebaseConfigured } from '../firebase/config';
import { db } from '../firebase/firestoreClient';
import { COLLECTIONS } from '../firebase/collections';
import { reportsOnDevice, saveReport } from './reportRecords.js';
import { getCurrentAirQuality, getWeather } from './environmentalData';
import { analyzeEnvironmentalImage as geminiAnalyze } from './geminiService';
import { createMeetup, getNearbyMeetups, joinMeetup, cancelMeetupRSVP } from './meetups';
import { readLocalAttendance } from './localMeetupAttendance.js';
import { joinedMeetupIds } from './meetupAttendance.js';
import { findVerifiedRecipient } from './verifiedRecipient.js';
import { saveEmailDraft } from './emailDrafts.js';
import { communityTools } from './communityTools.js';

export const tools = {

  /**
   * Get combined environmental data (AQI + weather)
   */
  getEnvironmentalData: async ({ lat, lng, city }) => {
    const [aqi, weather] = await Promise.all([
      getCurrentAirQuality(lat, lng, city).catch(() => null),
      getWeather(lat, lng).catch(() => null),
    ]);
    return { aqi, weather };
  },

  getNearbyMeetups,
  createMeetup,
  joinMeetup,
  cancelMeetupRSVP,


  ...communityTools,
  findVerifiedRecipient,

  /**
   * Create an environmental report
   */
  createEnvironmentalReport: details => saveReport(isFirebaseConfigured ? db : null, details),

  /**
   * Analyze an environmental image
   */
  analyzeEnvironmentalImage: async ({ base64, mimeType, contextHint, signal }) => {
    // Prefer a configured multimodal provider. If it is unavailable, classify
    // common civic/environmental scenes locally in the browser.
    const cloudResult = await geminiAnalyze(base64, mimeType, contextHint || '', signal);
    signal?.throwIfAborted();
    if (cloudResult) return { ...cloudResult, provider: cloudResult.provider || 'AI vision' };
    const { analyzeImageOnDevice } = await import('./onDeviceVision.js');
    return analyzeImageOnDevice(base64, mimeType, contextHint || '', signal);
  },

  /**
   * Save an email draft
   */
  createEmailDraft: record => saveEmailDraft(record, {
    persist: db ? async draft => {
      const ref = await addDoc(collection(db, COLLECTIONS.EMAIL_DRAFTS), { ...draft, createdAt: Timestamp.now() });
      return ref.id;
    } : null,
  }),

  /**
   * Get a personalized daily action plan
   */
  getDailyActionPlan: async ({ lat, lng }) => {
    const aqiData = await getCurrentAirQuality(lat, lng);

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
    if (isFirebaseConfigured) {
      const [reports, receipts] = await Promise.all([
        getDocs(query(collection(db, COLLECTIONS.REPORTS), where('userId', '==', userId))),
        getDocs(query(collection(db, COLLECTIONS.RSVPS), where('userId', '==', userId))),
      ]);
      return { reportsSubmitted: reports.size, eventsJoined: joinedMeetupIds(receipts.docs.map(row => row.data())).size };
    }
    const mine = (await readLocalAttendance()).filter(row => row.userId === userId);
    return {
      reportsSubmitted: reportsOnDevice(localStorage, userId).length,
      eventsJoined: joinedMeetupIds(mine).size,
    };
  },
};

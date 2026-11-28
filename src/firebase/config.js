import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { deviceGuest } from '../contexts/deviceSession.js';
import { firebaseSettings } from './settings.js';

const config = firebaseSettings(import.meta.env);
export const offlineGuestSession = Boolean(config && deviceGuest()?.offline);
const app = config && !offlineGuestSession ? initializeApp(config) : null;

export const isFirebaseConfigured = Boolean(app);
export const auth = app ? getAuth(app) : null;
export default app;

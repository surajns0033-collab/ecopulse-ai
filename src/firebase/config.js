import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { firebaseSettings } from './settings.js';

const config = firebaseSettings(import.meta.env);
const app = config ? initializeApp(config) : null;

export const isFirebaseConfigured = Boolean(app);
export const auth = app ? getAuth(app) : null;
export default app;

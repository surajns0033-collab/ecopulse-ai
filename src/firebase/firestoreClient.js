import { getFirestore } from 'firebase/firestore';
import app from './config';

// Keep the database SDK off the signed-out landing page's import graph.
export const db = app ? getFirestore(app) : null;

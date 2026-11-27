import { useCallback, useEffect, useRef, useState } from 'react';
import { sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../firebase/config';

const emailKey = 'echopulse_email_link_address';
function pendingEmail() {
  try { return sessionStorage.getItem(emailKey); } catch { return null; }
}

export function useEmailSignIn({ firebaseReady, setLoading, setUser, setAuthMode }) {
  const [emailLinkNeedsEmail, setEmailLinkNeedsEmail] = useState(() =>
    isFirebaseConfigured && isSignInWithEmailLink(auth, window.location.href) && !pendingEmail());
  const attemptedEmailLink = useRef(null);
  /** Send a passwordless Firebase email sign-in link. */
  async function sendEmailLink(email) {
    if (!firebaseReady) {
      throw new Error('Firebase is not configured yet. Add Firebase environment values first.');
    }
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('Enter a valid email address.');
    await sendSignInLinkToEmail(auth, normalizedEmail, {
      url: `${window.location.origin}/?emailSignIn=1`,
      handleCodeInApp: true,
    });
    // Temporary browser-session storage only; never written to Firestore.
    try { sessionStorage.setItem(emailKey, normalizedEmail); } catch { /* The recipient can re-enter their email. */ }
    return { sent: true };
  }

  /** Complete a passwordless sign-in after the user returns through the email link. */
  const completeEmailSignIn = useCallback(async (email) => {
    if (!firebaseReady || !isSignInWithEmailLink(auth, window.location.href)) {
      throw new Error('This email sign-in link is invalid or has expired.');
    }
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('Enter the email that received the link.');
    const credential = await signInWithEmailLink(auth, normalizedEmail, window.location.href);
    try { sessionStorage.removeItem(emailKey); } catch { /* Optional session storage. */ }
    setEmailLinkNeedsEmail(false);
    setUser(credential.user);
    setAuthMode('email');
    window.history.replaceState({}, document.title, window.location.pathname);
    return credential.user;
  }, [firebaseReady]);

  useEffect(() => {
    const link = window.location.href;
    if (!firebaseReady || !isSignInWithEmailLink(auth, link)) return;
    const email = pendingEmail();
    if (!email || attemptedEmailLink.current === link) return;
    attemptedEmailLink.current = link;
    completeEmailSignIn(email).catch(() => {
      setEmailLinkNeedsEmail(true);
      setLoading(false);
    });
  }, [firebaseReady, completeEmailSignIn]);

  return { sendEmailLink, completeEmailSignIn, emailLinkNeedsEmail };
}

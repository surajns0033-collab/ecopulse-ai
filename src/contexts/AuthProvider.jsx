import { useCallback, useEffect, useRef, useState } from 'react';
import {
  signInAnonymously,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../firebase/config';

import { AuthContext } from './AuthContext';

const localSessionKey = 'ecopulse_device_session';

function rememberLocalUser(user) {
  try { sessionStorage.setItem(localSessionKey, JSON.stringify(user)); } catch { /* Storage can be disabled. */ }
  return user;
}

function restoreDeviceUser() {
  if (isFirebaseConfigured) return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(localSessionKey));
    return saved?.isLocal === true && typeof saved.uid === 'string' ? saved : null;
  } catch { return null; }
}

const emailKey = 'echopulse_email_link_address';
function pendingEmail() {
  try { return sessionStorage.getItem(emailKey); } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(restoreDeviceUser);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [authMode, setAuthMode] = useState(() => user && (user.isAnonymous ? 'guest' : 'google'));
  const [emailLinkNeedsEmail, setEmailLinkNeedsEmail] = useState(() =>
    isFirebaseConfigured && isSignInWithEmailLink(auth, window.location.href) && !pendingEmail());
  const attemptedEmailLink = useRef(null);
  const [communityName, setCommunityName] = useState('');
  const [communityNameConfirmed, setCommunityNameConfirmed] = useState(false);

  const firebaseReady = isFirebaseConfigured;
  const resetUser = useCallback(() => {
    // Keep clearing any legacy Talk history on sign-out.
    try { sessionStorage.removeItem('echopulse_talk_session_v1'); } catch { /* storage can be disabled */ }
    setUser(null);
    setAuthMode(null);
    setCommunityName('');
    setCommunityNameConfirmed(false);
  }, []);

  useEffect(() => {
    if (!firebaseReady) return;

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const mode = currentUser.isAnonymous
          ? 'guest'
          : currentUser.providerData?.some((provider) => provider.providerId === 'google.com') ? 'google' : 'email';
        setAuthMode(mode);
        let savedName = '';
        try { savedName = localStorage.getItem(`echopulse_community_name_${currentUser.uid}`) || ''; } catch { /* Optional public display name. */ }
        setCommunityName(savedName || currentUser.displayName || '');
        setCommunityNameConfirmed(Boolean(savedName));
        setLoading(false);
      } else {
        // Also clear this tab when Firebase signs out in another tab.
        resetUser();
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [firebaseReady, resetUser]);

  useEffect(() => {
    if (!firebaseReady) return;
    // Completes a Google same-tab redirect. onAuthStateChanged updates the UI;
    // this call also consumes and clears Firebase's pending redirect state.
    getRedirectResult(auth).catch((error) => {
      console.warn('Google redirect sign-in could not be completed:', error?.message || error);
      setLoading(false);
    });
  }, [firebaseReady]);

  /** Sign in with Google */
  async function signInWithGoogle() {
    if (!firebaseReady) {
      // Firebase not configured — create a local "signed-in" user placeholder
      setUser(rememberLocalUser({ uid: 'google-user-' + crypto.randomUUID(), displayName: 'User', isAnonymous: false, isLocal: true }));
      setAuthMode('google');
      return;
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setAuthMode('google');
    await signInWithRedirect(auth, provider);
  }

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

  /** Continue as guest (anonymous) */
  async function continueAsGuest() {
    if (!firebaseReady) {
      // Firebase not configured — create local guest user
      setUser(rememberLocalUser({ uid: 'guest-' + crypto.randomUUID(), isAnonymous: true, isLocal: true }));
      setAuthMode('guest');
      return;
    }
    const cred = await signInAnonymously(auth);
    setUser(cred.user);
    setAuthMode('guest');
  }

  /** Sign out */
  async function signOut() {
    if (firebaseReady) await firebaseSignOut(auth);
    try { sessionStorage.removeItem(localSessionKey); } catch { /* Storage can be disabled. */ }
    resetUser();
  }

  function saveCommunityName(value) {
    if (!user || user.isAnonymous) throw new Error('Sign in before choosing a community name.');
    const name = String(value || '').replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 24) throw new Error('Choose a name between 2 and 24 characters.');
    if (!/^[\p{L}\p{N} ._'-]+$/u.test(name)) throw new Error('Use letters, numbers, spaces, dots, underscores, apostrophes or hyphens only.');
    localStorage.setItem(`echopulse_community_name_${user.uid}`, name);
    setCommunityName(name);
    setCommunityNameConfirmed(true);
    return name;
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      authMode,
      signInWithGoogle,
      sendEmailLink,
      completeEmailSignIn,
      emailLinkNeedsEmail,
      continueAsGuest,
      signOut,
      firebaseReady,
      communityName,
      communityNameConfirmed,
      saveCommunityName,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

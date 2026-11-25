import { createContext, useContext, useEffect, useState } from 'react';
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

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState(null); // null = not chosen yet
  const [emailLinkNeedsEmail, setEmailLinkNeedsEmail] = useState(false);
  const [communityName, setCommunityName] = useState('');
  const [communityNameConfirmed, setCommunityNameConfirmed] = useState(false);

  const firebaseReady = isFirebaseConfigured;

  useEffect(() => {
    if (!firebaseReady) {
      // Firebase not configured — stay on landing (loading = false, user = null, authMode = null)
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const mode = currentUser.isAnonymous
          ? 'guest'
          : currentUser.providerData?.some((provider) => provider.providerId === 'google.com') ? 'google' : 'email';
        setAuthMode(mode);
        const savedName = localStorage.getItem(`echopulse_community_name_${currentUser.uid}`) || '';
        setCommunityName(savedName || currentUser.displayName || '');
        setCommunityNameConfirmed(Boolean(savedName));
        setLoading(false);
      } else {
        // No user yet — show landing page (don't auto sign-in)
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [firebaseReady]);

  useEffect(() => {
    if (!firebaseReady) return;
    // Completes a Google same-tab redirect. onAuthStateChanged updates the UI;
    // this call also consumes and clears Firebase's pending redirect state.
    getRedirectResult(auth).catch((error) => {
      console.warn('Google redirect sign-in could not be completed:', error?.message || error);
      setLoading(false);
    });
  }, [firebaseReady]);

  useEffect(() => {
    if (!firebaseReady || !isSignInWithEmailLink(auth, window.location.href)) return;
    const pendingEmail = sessionStorage.getItem('echopulse_email_link_address');
    if (!pendingEmail) {
      setEmailLinkNeedsEmail(true);
      setLoading(false);
      return;
    }
    completeEmailSignIn(pendingEmail).catch(() => {
      setEmailLinkNeedsEmail(true);
      setLoading(false);
    });
  }, [firebaseReady]);

  /** Sign in with Google */
  async function signInWithGoogle() {
    if (!firebaseReady) {
      // Firebase not configured — create a local "signed-in" user placeholder
      setUser({ uid: 'google-user-' + Date.now(), displayName: 'User', isAnonymous: false, isLocal: true });
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
    sessionStorage.setItem('echopulse_email_link_address', normalizedEmail);
    return { sent: true };
  }

  /** Complete a passwordless sign-in after the user returns through the email link. */
  async function completeEmailSignIn(email) {
    if (!firebaseReady || !isSignInWithEmailLink(auth, window.location.href)) {
      throw new Error('This email sign-in link is invalid or has expired.');
    }
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('Enter the email that received the link.');
    const credential = await signInWithEmailLink(auth, normalizedEmail, window.location.href);
    sessionStorage.removeItem('echopulse_email_link_address');
    setEmailLinkNeedsEmail(false);
    setUser(credential.user);
    setAuthMode('email');
    window.history.replaceState({}, document.title, window.location.pathname);
    return credential.user;
  }

  /** Continue as guest (anonymous) */
  async function continueAsGuest() {
    if (!firebaseReady) {
      // Firebase not configured — create local guest user
      setUser({ uid: 'guest-' + Date.now(), isAnonymous: true, isLocal: true });
      setAuthMode('guest');
      return;
    }
    const cred = await signInAnonymously(auth);
    setUser(cred.user);
    setAuthMode('guest');
  }

  /** Sign out */
  async function signOut() {
    if (firebaseReady) {
      try { await firebaseSignOut(auth); } catch {}
    }
    setUser(null);
    setAuthMode(null);
    setCommunityName('');
    setCommunityNameConfirmed(false);
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

export function useAuth() {
  return useContext(AuthContext);
}

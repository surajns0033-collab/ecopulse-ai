import { logFailure } from '../services/diagnostics.js';
import { useCallback, useEffect, useState } from 'react';
import { signInAnonymously, signInWithRedirect, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../firebase/config';
import { AuthContext } from './AuthContext';
import { useEmailSignIn } from './useEmailSignIn.js';

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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(restoreDeviceUser);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [authMode, setAuthMode] = useState(() => user && (user.isAnonymous ? 'guest' : 'google'));

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
    getRedirectResult(auth).catch(() => {
      logFailure('auth.redirect');
      setLoading(false);
    });
  }, [firebaseReady]);


  const { sendEmailLink, completeEmailSignIn, emailLinkNeedsEmail } = useEmailSignIn({ firebaseReady, setLoading, setUser, setAuthMode });

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

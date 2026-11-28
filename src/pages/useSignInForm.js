import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function useSignInForm() {
  const {
    signInWithGoogle,
    sendEmailLink,
    completeEmailSignIn,
    emailLinkNeedsEmail,
    continueAsGuest,
    firebaseReady,
  } = useAuth();
  const [loading, setLoading] = useState(null); // 'google' | 'guest' | null
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  async function handleGoogle() {
    setError('');
    setLoading('google');
    try {
      await signInWithGoogle();
    } catch {
      setError('Google sign-in failed. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  async function handleGuest() {
    setError('');
    setLoading('guest');
    try {
      await continueAsGuest();
    } catch {
      setError('Could not start guest session. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  async function handleEmail(e) {
    e.preventDefault();
    setError('');
    setLoading('email');
    try {
      if (emailLinkNeedsEmail) {
        await completeEmailSignIn(email);
      } else {
        await sendEmailLink(email);
        setEmailSent(true);
      }
    } catch (err) {
      setError(err?.message || 'Email sign-in failed. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  return { loading, error, email, setEmail, emailSent, handleGoogle, handleGuest, handleEmail, emailLinkNeedsEmail, firebaseReady };
}

// LandingPage — shown before entering the app, choose Guest or Google Sign-In
import { useState } from 'react';
import { Leaf, Bot, UserCheck, Loader, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function LandingPage() {
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

  return (
    <div className="app-shell">
      <main className="landing-container">
        {/* Logo */}
        <div className="landing-logo-wrap">
          <div className="landing-logo">
            <Bot size={48} color="white" strokeWidth={1.5} />
          </div>
          <div className="landing-leaf">
            <Leaf size={28} color="#22c55e" strokeWidth={2.5} fill="#bbf7d0" />
          </div>
        </div>

        {/* Title */}
        <h1 className="landing-title">
          <Leaf size={20} color="#22c55e" strokeWidth={2.5} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          EcoPulse AI
        </h1>
        <p className="landing-sub">Your personal AI companion for cleaner air, safer routines and smarter everyday decisions during urban pollution.</p>

        {/* Features */}
        <div className="landing-features">
          {['🌬️ Real-time Air Quality', '🌫️ Personal Smog Plans', '📍 Environmental Reports', '🌿 Community Action'].map(f => (
            <div key={f} className="landing-feature-pill">{f}</div>
          ))}
        </div>

        {/* Auth Buttons */}
        <div className="landing-auth">
          <button
            className="landing-btn landing-btn-google"
            onClick={handleGoogle}
            disabled={!!loading}
          >
            {loading === 'google' ? (
              <Loader size={20} className="spin" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/>
              </svg>
            )}
            Continue with Google
          </button>

          <div className="landing-divider">
            <span>or use email</span>
          </div>

          <form className="landing-email-form" onSubmit={handleEmail}>
            <div className="landing-email-input-wrap">
              <Mail size={17} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                aria-label="Email address"
                disabled={!!loading || emailSent}
                required
              />
            </div>
            <button
              type="submit"
              className="landing-btn landing-btn-email"
              disabled={!!loading || emailSent || !email.trim()}
            >
              {loading === 'email' ? <Loader size={18} className="spin" /> : <Mail size={18} />}
              {emailLinkNeedsEmail ? 'Complete Email Sign-In' : 'Send Secure Sign-In Link'}
            </button>
          </form>

          {emailSent && (
            <p className="landing-success" role="status">
              Check your inbox and open the EcoPulse sign-in link on this device. No password is required.
            </p>
          )}

          {!firebaseReady && (
            <p className="landing-email-hint">Email and real Google sign-in become active after Firebase is configured. Guest mode continues to work now.</p>
          )}

          <div className="landing-divider">
            <span>or continue privately</span>
          </div>

          <button
            className="landing-btn landing-btn-guest"
            onClick={handleGuest}
            disabled={!!loading}
          >
            {loading === 'guest' ? (
              <Loader size={20} className="spin" />
            ) : (
              <UserCheck size={20} />
            )}
            Continue as Guest
          </button>

          {error && <p className="landing-error" role="alert">{error}</p>}

          <p className="landing-note">
            Guest mode works without login. Signed-in community posts show only your chosen public name—your email is never displayed or written into a community post.
          </p>
        </div>
      </main>
    </div>
  );
}

// Header component
import { ArrowLeft, RefreshCw, Leaf, Bot, LogOut, User } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function Header({ onRefresh }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isSubPage = !['/', '/talk', '/community', '/meetups'].includes(location.pathname);
  const { user, signOut, authMode } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  const displayName = user?.displayName || (authMode === 'guest' ? 'Guest' : 'User');
  const photoURL = user?.photoURL;

  async function handleSignOut() {
    setShowMenu(false);
    await signOut();
  }

  return (
    <header className="chat-header" style={{ position: 'relative' }}>
      {/* Back button — only shown on sub-pages */}
      {isSubPage && (
        <button className="header-back-btn" onClick={() => navigate(-1)} aria-label="Go back">
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
      )}

      {/* Logo */}
      <div className="header-logo-wrap">
        <div className="header-logo">
          <Bot size={22} color="white" strokeWidth={2} />
        </div>
        <div className="header-leaf-accent">
          <Leaf size={16} color="#22c55e" strokeWidth={2.5} fill="#bbf7d0" />
        </div>
      </div>

      {/* Title */}
      <div className="header-info">
        <div className="header-title">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Leaf size={14} color="#22c55e" strokeWidth={2.5} />
            EcoPulse AI
          </span>
        </div>
        <div className="header-subtitle">Environmental Assistant</div>
      </div>

      {/* Right icons */}
      <div className="header-actions">
        {onRefresh && (
          <button className="header-icon-btn" onClick={onRefresh} aria-label="Refresh">
            <RefreshCw size={18} />
          </button>
        )}
        {/* User avatar / menu */}
        <button
          className="header-icon-btn"
          aria-label="User menu"
          onClick={() => setShowMenu(v => !v)}
        >
          {photoURL ? (
            <img src={photoURL} alt={displayName} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: authMode === 'guest' ? '#e5e7eb' : '#22c55e',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
              color: authMode === 'guest' ? '#6b7280' : 'white'
            }}>
              {authMode === 'guest' ? <User size={13} color="#6b7280" /> : (displayName?.[0]?.toUpperCase() || '?')}
            </div>
          )}
        </button>
      </div>

      {/* Dropdown menu — anchored inside header/app-shell frame */}
      {showMenu && (
        <>
          <div className="header-dropdown" onClick={() => setShowMenu(false)} />
          <div className="header-dropdown-inner" onClick={e => e.stopPropagation()}>
            <div className="header-dropdown-user">
              {photoURL ? (
                <img src={photoURL} alt={displayName} style={{ width: 36, height: 36, borderRadius: '50%' }} />
              ) : (
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: authMode === 'guest' ? '#e5e7eb' : '#22c55e',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 700,
                  color: authMode === 'guest' ? '#6b7280' : 'white'
                }}>
                  {authMode === 'guest' ? '?' : (displayName?.[0]?.toUpperCase() || '?')}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{displayName}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {authMode === 'guest' ? 'Guest Mode (saved locally)' : user?.email || 'Signed in with Google'}
                </div>
              </div>
            </div>
            {authMode === 'guest' && (
              <div style={{ padding: '10px 14px', background: '#f0fdf4', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 500, lineHeight: 1.45 }}>
                  🔐 Sign in with Google to sync reports & events across devices.
                </div>
              </div>
            )}
            <button className="header-dropdown-btn" onClick={handleSignOut}>
              <LogOut size={15} />
              {authMode === 'guest' ? 'Exit Guest Mode' : 'Sign Out'}
            </button>
          </div>
        </>
      )}
    </header>
  );
}

import { ArrowLeft, RefreshCw, Leaf, Bot, LogOut, User } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

function Avatar({ user, guest, large = false }) {
  const className = `account-avatar${large ? ' large' : ''}${guest ? ' guest' : ''}`;
  if (user?.photoURL) return <img className={className} src={user.photoURL} alt="" />;
  return (
    <span className={className} aria-hidden="true">
      {guest ? <User size={large ? 18 : 13} /> : user?.displayName?.[0]?.toUpperCase() || '?'}
    </span>
  );
}

function AccountMenu() {
  const { user, authMode, signOut } = useAuth();
  const guest = authMode === 'guest';
  const displayName = user?.displayName || (guest ? 'Guest' : 'User');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const container = useRef(null);
  const trigger = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function closeOutside(event) {
      if (!container.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  function onKeyDown(event) {
    if (open && event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      trigger.current.focus();
    }
  }

  async function leaveAccount() {
    setError('');
    try {
      await signOut();
    } catch {
      setError('Sign-out did not finish. Please try again.');
    }
  }

  const sessionLabel = user?.isLocal ? 'Device-only session'
    : guest ? 'Anonymous Firebase session' : user?.email || 'Signed in';

  return (
    <div ref={container} onKeyDown={onKeyDown}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button ref={trigger} type="button" className="header-icon-btn" aria-label="User menu"
        aria-expanded={open} aria-controls={panelId}
        onClick={() => { setError(''); setOpen(value => !value); }}>
        <Avatar user={user} guest={guest} />
      </button>
      <div id={panelId} className="header-dropdown-inner" hidden={!open}>
        <div className="header-dropdown-user">
          <Avatar user={user} guest={guest} large />
          <div>
            <div className="account-name">{displayName}</div>
            <div className="account-session">{sessionLabel}</div>
          </div>
        </div>
        {guest && !user?.isLocal && (
          <p className="account-hint">Use a Google or email account to access your account's reports and events across devices.</p>
        )}
        {error && <p className="account-hint" role="alert">{error}</p>}
        <button type="button" className="header-dropdown-btn" onClick={leaveAccount}>
          <LogOut size={15} /> {guest ? 'Exit Guest Mode' : 'Sign Out'}
        </button>
      </div>
    </div>
  );
}

export default function Header({ onRefresh }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isSubPage = !['/', '/community', '/meetups'].includes(pathname.replace(/\/+$/, '') || '/');

  return (
    <header className="chat-header">
      {isSubPage && (
        <button className="header-back-btn" onClick={() => navigate(-1)} aria-label="Go back">
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
      )}
      <div className="header-logo-wrap" aria-hidden="true">
        <div className="header-logo"><Bot size={22} color="white" strokeWidth={2} /></div>
        <div className="header-leaf-accent"><Leaf size={16} color="#22c55e" strokeWidth={2.5} fill="#bbf7d0" /></div>
      </div>
      <div className="header-info">
        <div className="header-title"><Leaf size={14} color="#22c55e" strokeWidth={2.5} /> EcoPulse AI</div>
        <div className="header-subtitle">Environmental Assistant</div>
      </div>
      <div className="header-actions">
        {onRefresh && (
          <button className="header-icon-btn" onClick={onRefresh} aria-label="Refresh">
            <RefreshCw size={18} />
          </button>
        )}
        <AccountMenu />
      </div>
    </header>
  );
}

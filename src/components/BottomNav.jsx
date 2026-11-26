// BottomNav — persistent bottom navigation bar
import { useNavigate, useLocation } from 'react-router-dom';
import { MessageCircle, Users, CalendarDays } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/',          icon: MessageCircle, label: 'Chat' },
  { path: '/community', icon: Users,         label: 'Community' },
  { path: '/meetups',   icon: CalendarDays,  label: 'Events' },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const currentPath = pathname.replace(/\/+$/, '') || '/';

  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
        const active = currentPath === path;
        return (
          <button
            key={path}
            className={`bottom-nav-item${active ? ' active' : ''}`}
            onClick={() => navigate(path)}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
          >
            <div className={`bottom-nav-icon${active ? ' active' : ''}`}>
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
            </div>
            <span className="bottom-nav-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

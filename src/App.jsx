// App.jsx — root component with routing and providers
import { BrowserRouter, Navigate, Route, Routes, useLocation, useMatch } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppProvider } from './contexts/AppProvider';
import LandingPage from './pages/LandingPage';

const ChatPage = lazy(() => import('./pages/ChatPage'));
const MeetupsPage = lazy(() => import('./pages/MeetupsPage'));
const CommunityPage = lazy(() => import('./pages/CommunityPage'));
const ReportDetailPage = lazy(() => import('./pages/ReportDetailPage'));

function AppLoader({ label = 'Loading EcoPulse AI...' }) {
  return (
    <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div className="landing-logo" style={{ width: 64, height: 64 }}>
          <span style={{ fontSize: 32 }}>🌿</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{label}</p>
      </div>
    </div>
  );
}

function AppInner() {
  const { user, loading } = useAuth();
  const isOldTalkLink = useMatch('/talk');
  const { search, hash } = useLocation();

  if (isOldTalkLink) {
    return <Navigate to={{ pathname: '/', search, hash }} replace />;
  }

  // Show nothing while checking auth state
  if (loading) {
    return <AppLoader label="Checking secure session..." />;
  }

  // Show landing if no user
  if (!user) {
    return <LandingPage />;
  }

  return (
    <AppProvider key={user.uid}>
      <Suspense fallback={<AppLoader />}>
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/meetups" element={<MeetupsPage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/report/:id" element={<ReportDetailPage />} />
        </Routes>
      </Suspense>
    </AppProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </BrowserRouter>
  );
}

// App.jsx — root component with routing and providers
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppProvider } from './contexts/AppContext';
import ChatPage from './pages/ChatPage';
import MeetupsPage from './pages/MeetupsPage';
import CommunityPage from './pages/CommunityPage';
import ReportDetailPage from './pages/ReportDetailPage';
import LandingPage from './pages/LandingPage';

function AppInner() {
  const { user, loading } = useAuth();

  // Show nothing while checking auth state
  if (loading) {
    return (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div className="landing-logo" style={{ width: 64, height: 64 }}>
            <span style={{ fontSize: 32 }}>🌿</span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading EcoPulse AI...</p>
        </div>
      </div>
    );
  }

  // Show landing if no user
  if (!user) {
    return <LandingPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<ChatPage />} />
      <Route path="/meetups" element={<MeetupsPage />} />
      <Route path="/community" element={<CommunityPage />} />
      <Route path="/report/:id" element={<ReportDetailPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <AppInner />
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

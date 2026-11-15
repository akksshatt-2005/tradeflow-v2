import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import ServerWakeBanner from './components/ServerWakeBanner';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Signup from './pages/Signup';
import SelectCompany from './pages/SelectCompany';
import Dashboard from './pages/Dashboard';
import SuperAdminPortal from './pages/SuperAdminPortal';

function MainApp() {
  const { user, activeCompany, loading } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [forceCompanySelection, setForceCompanySelection] = useState(false);
  const [isSuperAdminRoute, setIsSuperAdminRoute] = useState(() => {
    return window.location.pathname.startsWith('/superadmin') ||
      window.location.pathname.startsWith('/admin') ||
      window.location.hash === '#superadmin';
  });

  useEffect(() => {
    const handlePopState = () => {
      setIsSuperAdminRoute(
        window.location.pathname.startsWith('/superadmin') ||
        window.location.pathname.startsWith('/admin') ||
        window.location.hash === '#superadmin'
      );
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Separate SuperAdmin Licensing Dashboard
  if (isSuperAdminRoute) {
    return (
      <SuperAdminPortal
        onBackToApp={() => {
          window.history.pushState({}, '', '/');
          setIsSuperAdminRoute(false);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        color: '#64748b',
        fontSize: '13px'
      }}>
        Initializing Trade Flow session...
      </div>
    );
  }

  // If not logged in
  if (!user) {
    return (
      <div>
        <div className="no-print"><ServerWakeBanner /></div>
        {authMode === 'login' ? (
          <Login onSwitchToSignup={() => setAuthMode('signup')} />
        ) : (
          <Signup onSwitchToLogin={() => setAuthMode('login')} />
        )}
      </div>
    );
  }

  // If logged in but no active company selected or user requested switcher view
  if (!activeCompany || forceCompanySelection) {
    return (
      <div>
        <div className="no-print"><ServerWakeBanner /></div>
        <SelectCompany onCompanySelected={() => setForceCompanySelection(false)} />
      </div>
    );
  }

  // Authenticated Dashboard
  return (
    <div>
      <div className="no-print"><ServerWakeBanner /></div>
      <Dashboard onSwitchCompany={() => setForceCompanySelection(true)} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary fallbackTitle="TradeFlow encountered an unexpected error">
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}

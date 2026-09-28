import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import ServerWakeBanner from './components/ServerWakeBanner';
import Login from './pages/Login';
import Signup from './pages/Signup';
import SelectCompany from './pages/SelectCompany';
import Dashboard from './pages/Dashboard';

function MainApp() {
  const { user, activeCompany, loading } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [forceCompanySelection, setForceCompanySelection] = useState(false);

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
        <ServerWakeBanner />
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
        <ServerWakeBanner />
        <SelectCompany />
      </div>
    );
  }

  // Authenticated Dashboard
  return (
    <div>
      <ServerWakeBanner />
      <Dashboard onSwitchCompany={() => setForceCompanySelection(true)} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

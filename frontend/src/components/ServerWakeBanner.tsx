import React, { useState, useEffect } from 'react';
import { subscribeServerState, ServerState, prewarmServer } from '../api/client';
import { RefreshCw, AlertCircle, ShieldCheck } from 'lucide-react';

export default function ServerWakeBanner() {
  const [state, setState] = useState<ServerState>({
    isWakingUp: false,
    isOnline: true,
    elapsedSeconds: 0,
    maxRetrySeconds: 90,
    error: null
  });

  useEffect(() => {
    const unsubscribe = subscribeServerState((newState) => {
      setState(newState);
    });
    return () => unsubscribe();
  }, []);

  const [dismissed, setDismissed] = useState(false);

  if (dismissed || (!state.isWakingUp && !state.error)) {
    return null;
  }

  const progressPercent = Math.min(100, Math.round((state.elapsedSeconds / state.maxRetrySeconds) * 100));

  const handleManualRetry = () => {
    setDismissed(false);
    prewarmServer(true);
  };

  return (
    <div className="wake-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {state.error ? (
          <AlertCircle size={16} color="#dc2626" />
        ) : (
          <RefreshCw size={16} color="#0284c7" className="spin-icon" style={{ animation: 'spin 2s linear infinite' }} />
        )}

        <div>
          <span style={{ fontWeight: 600, color: state.error ? '#dc2626' : '#1e3a8a' }}>
            {state.error ? 'Server connection timed out' : 'Waking up the server, this can take up to a minute'}
          </span>
          <span style={{ color: '#64748b', marginLeft: '8px' }}>
            {state.error ? state.error : `Render free service waking (${state.elapsedSeconds}s / 90s). Your form entries are safe.`}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {!state.error ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="wake-progress-bar">
              <div className="wake-progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, color: '#0284c7' }}>
              {progressPercent}%
            </span>
          </div>
        ) : (
          <button onClick={handleManualRetry} className="btn btn-primary btn-sm">
            <RefreshCw size={12} /> Retry
          </button>
        )}

        <button
          onClick={() => setDismissed(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '2px 4px', fontSize: '14px', lineHeight: 1 }}
          title="Dismiss banner"
        >
          ✕
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, AlertOctagon, Key, Calendar, Mail, CheckCircle2, Copy, Sparkles, ExternalLink, X } from 'lucide-react';
import api from '../api/client';

export interface LicenseInfo {
  id: string;
  licenseKey: string;
  registeredEmail: string;
  planType: string;
  status: 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'PENDING' | 'SUSPENDED';
  maxUsers: number;
  gracePeriodDays: number;
  issuedAt: string;
  activatedAt?: string;
  expiresAt: string;
  daysRemaining: number;
  inGracePeriod: boolean;
  isHardExpired: boolean;
}

interface LicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  license: LicenseInfo | null;
  onLicenseUpdated: () => void;
}

export default function LicenseModal({
  isOpen,
  onClose,
  license,
  onLicenseUpdated
}: LicenseModalProps) {
  const [activationKey, setActivationKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [activateSuccess, setActivateSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [adminPlan, setAdminPlan] = useState('WHOLESALE');
  const [generating, setGenerating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  // Keyboard Shortcut: Escape to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationKey.trim()) return;

    setActivating(true);
    setActivateError(null);
    setActivateSuccess(null);

    try {
      const res = await api.post<any>('/api/licenses/activate', {
        licenseKey: activationKey.trim()
      });

      setActivateSuccess(res.message || 'License activated successfully!');
      setActivationKey('');
      onLicenseUpdated();
    } catch (err: any) {
      setActivateError(err.message || err.error || 'Failed to activate license key.');
    } finally {
      setActivating(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusColor = 
    license?.isHardExpired ? '#dc2626' :
    license?.inGracePeriod ? '#ea580c' :
    (license?.daysRemaining || 0) <= 15 ? '#d97706' : '#16a34a';

  const statusBg = 
    license?.isHardExpired ? '#fef2f2' :
    license?.inGracePeriod ? '#fff7ed' :
    (license?.daysRemaining || 0) <= 15 ? '#fffbeb' : '#f0fdf4';

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
        backdropFilter: 'blur(3px)'
      }}
    >
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '560px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
        border: '1px solid #e2e8f0',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ padding: '6px', borderRadius: '6px', backgroundColor: '#e0f2fe', color: '#0284c7' }}>
              <Key size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                TradeFlow ERP License & Subscription
              </h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                Cloud-verified SaaS license details & renewals
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.25rem', maxHeight: '78vh', overflowY: 'auto' }}>
          {/* Current Status Banner */}
          {license ? (
            <div style={{
              padding: '1rem',
              borderRadius: '8px',
              backgroundColor: statusBg,
              border: `1px solid ${statusColor}33`,
              marginBottom: '1.25rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {license.isHardExpired ? (
                    <AlertOctagon size={20} color={statusColor} />
                  ) : license.inGracePeriod ? (
                    <AlertTriangle size={20} color={statusColor} />
                  ) : (
                    <ShieldCheck size={20} color={statusColor} />
                  )}
                  <span style={{ fontWeight: 800, fontSize: '0.92rem', color: statusColor }}>
                    {license.isHardExpired ? 'LICENSE EXPIRED (READ-ONLY)' :
                     license.inGracePeriod ? 'GRACE PERIOD ACTIVE' :
                     'ACTIVE COMMERCIAL LICENSE'}
                  </span>
                </div>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: statusColor,
                  color: '#ffffff'
                }}>
                  {license.planType}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', fontSize: '0.8rem', color: '#334155' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} color="#64748b" />
                  <span>Valid Until: <strong>{new Date(license.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></span>
                </div>
                <div>
                  Days Remaining: <strong style={{ color: statusColor }}>{license.daysRemaining > 0 ? `${license.daysRemaining} Days` : 'Expired'}</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', gridColumn: 'span 2' }}>
                  <Mail size={14} color="#64748b" />
                  <span>Registered: <strong>{license.registeredEmail}</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', gridColumn: 'span 2', background: '#ffffff', padding: '6px 10px', borderRadius: '5px', border: '1px solid #cbd5e1' }}>
                  <span style={{ fontSize: '0.74rem', color: '#64748b' }}>KEY:</span>
                  <code style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', letterSpacing: '0.04em' }}>
                    {license.licenseKey}
                  </code>
                  <button
                    onClick={() => handleCopy(license.licenseKey)}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#0284c7', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '3px' }}
                  >
                    <Copy size={12} /> {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
              No active license found for this company. Please enter a valid license key below.
            </div>
          )}

          {/* Activate / Renew Card */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
              🔑 Activate License / Enter Renewal Key
            </h4>
            <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: '#64748b' }}>
              Enter the 16-character license key issued by your TradeFlow administrator to extend validity.
            </p>

            <form onSubmit={handleActivate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="TF-2026-XXXX-XXXX-XXXX"
                value={activationKey}
                onChange={e => setActivationKey(e.target.value.toUpperCase())}
                style={{
                  flex: 1,
                  minWidth: '220px',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: '0.88rem'
                }}
              />
              <button
                type="submit"
                disabled={activating || !activationKey.trim()}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#0f766e',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: activating || !activationKey.trim() ? 'not-allowed' : 'pointer'
                }}
              >
                {activating ? 'Verifying...' : 'Activate Key'}
              </button>
            </form>

            {activateError && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 }}>
                ⚠️ {activateError}
              </div>
            )}
            {activateSuccess && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={14} /> {activateSuccess}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '0.75rem 1.25rem',
          borderTop: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.82rem', padding: '0.4rem 1rem' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
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
  isOwner?: boolean;
  onOpenManager?: () => void;
}

export default function LicenseModal({
  isOpen,
  onClose,
  license,
  onLicenseUpdated,
  isOwner = false,
  onOpenManager
}: LicenseModalProps) {
  const [activationKey, setActivationKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [activateSuccess, setActivateSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Admin key generation states
  const [showAdminGen, setShowAdminGen] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminDuration, setAdminDuration] = useState('365');
  const [adminPlan, setAdminPlan] = useState('WHOLESALE');
  const [generating, setGenerating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

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

  const handleAdminGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail.trim()) return;

    setGenerating(true);
    try {
      const res = await api.post<any>('/api/licenses/admin/generate', {
        registeredEmail: adminEmail.trim(),
        durationDays: parseInt(adminDuration) || 365,
        planType: adminPlan
      });

      if (res.license?.licenseKey) {
        setGeneratedKey(res.license.licenseKey);
        setAdminEmail('');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to generate key');
    } finally {
      setGenerating(false);
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
    <div style={{
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
    }}>
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

          {/* Super Admin Tool (Visible to Owners) */}
          {isOwner && (
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Master License Generator
                </span>
                <button
                  onClick={() => setShowAdminGen(!showAdminGen)}
                  style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  {showAdminGen ? 'Hide Generator' : '+ Generate New Key'}
                </button>
              </div>

              {showAdminGen && (
                <form onSubmit={handleAdminGenerate} style={{ background: '#f1f5f9', padding: '0.8rem', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input
                    type="email"
                    placeholder="Recipient / Client Email"
                    value={adminEmail}
                    onChange={e => setAdminEmail(e.target.value)}
                    required
                    style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select
                      value={adminDuration}
                      onChange={e => setAdminDuration(e.target.value)}
                      style={{ flex: 1, padding: '0.45rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                    >
                      <option value="14">14 Days (Trial)</option>
                      <option value="90">90 Days (Quarterly)</option>
                      <option value="365">365 Days (Annual)</option>
                      <option value="730">2 Years (Multi-Year)</option>
                    </select>
                    <select
                      value={adminPlan}
                      onChange={e => setAdminPlan(e.target.value)}
                      style={{ flex: 1, padding: '0.45rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                    >
                      <option value="WHOLESALE">WHOLESALE</option>
                      <option value="RETAIL_STD">RETAIL_STD</option>
                      <option value="ENTERPRISE">ENTERPRISE</option>
                    </select>
                    <button
                      type="submit"
                      disabled={generating}
                      style={{ padding: '0.45rem 0.8rem', background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      {generating ? 'Generating...' : 'Create'}
                    </button>
                  </div>

                  {generatedKey && (
                    <div style={{ marginTop: '0.4rem', padding: '0.5rem', background: '#ffffff', border: '1px solid #10b981', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f766e', fontSize: '0.85rem' }}>
                        {generatedKey}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(generatedKey)}
                        style={{ background: 'none', border: 'none', color: '#0f766e', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}
                      >
                        Copy Key
                      </button>
                    </div>
                  )}
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '0.75rem 1.25rem',
          borderTop: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          {onOpenManager ? (
            <button
              onClick={() => {
                onClose();
                onOpenManager();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: 'none',
                border: 'none',
                color: '#0f766e',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              <ExternalLink size={13} />
              <span>Open License Manager Panel</span>
            </button>
          ) : <div />}

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

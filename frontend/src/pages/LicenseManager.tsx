import React, { useState, useEffect } from 'react';
import {
  Key,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Calendar,
  Clock,
  Mail,
  Building2,
  Copy,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  Filter,
  PowerOff,
  Power,
  Trash2,
  Edit3,
  ExternalLink,
  X
} from 'lucide-react';
import api from '../api/client';
import { useAuth, Company } from '../context/AuthContext';

export interface AdminLicenseItem {
  id: string;
  licenseKey: string;
  registeredEmail: string;
  companyId: string | null;
  planType: string;
  status: 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'PENDING' | 'SUSPENDED';
  effectiveStatus: 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'PENDING' | 'SUSPENDED';
  maxUsers: number;
  gracePeriodDays: number;
  issuedAt: string;
  activatedAt?: string;
  expiresAt: string;
  daysRemaining: number;
  notes?: string;
  company?: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    gstin?: string;
  };
}

export default function LicenseManager() {
  const { activeCompany, companies } = useAuth();
  const [licenses, setLicenses] = useState<AdminLicenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'SUSPENDED'>('ALL');

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createCompanyId, setCreateCompanyId] = useState('');
  const [createPlan, setCreatePlan] = useState('WHOLESALE');
  const [createDurationPreset, setCreateDurationPreset] = useState<'14' | '30' | '90' | '365' | 'custom'>('365');
  const [customExpiryDate, setCustomExpiryDate] = useState('');
  const [createMaxUsers, setCreateMaxUsers] = useState('5');
  const [createNotes, setCreateNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  // Edit Expiry Modal
  const [editingLicense, setEditingLicense] = useState<AdminLicenseItem | null>(null);
  const [newExpiryDateTime, setNewExpiryDateTime] = useState('');
  const [updatingExpiry, setUpdatingExpiry] = useState(false);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchLicenses();
  }, []);

  const fetchLicenses = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ licenses: AdminLicenseItem[] }>('/api/licenses/admin/list');
      setLicenses(res.licenses || []);
    } catch (err: any) {
      console.error('Failed to load licenses:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleStatus = async (item: AdminLicenseItem) => {
    const newStatus = item.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const actionLabel = newStatus === 'ACTIVE' ? 'activate' : 'deactivate (suspend)';
    
    if (!window.confirm(`Are you sure you want to ${actionLabel} the license for "${item.company?.name || item.registeredEmail}"?`)) {
      return;
    }

    try {
      await api.patch(`/api/licenses/admin/${item.id}/status`, { status: newStatus });
      fetchLicenses();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  const handleQuickExtend = async (item: AdminLicenseItem, days: number) => {
    if (!window.confirm(`Extend license for "${item.company?.name || item.registeredEmail}" by ${days} days?`)) {
      return;
    }

    try {
      await api.patch(`/api/licenses/admin/${item.id}/extend`, { additionalDays: days });
      fetchLicenses();
    } catch (err: any) {
      alert(err.message || 'Failed to extend license');
    }
  };

  const handleUpdateExpirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLicense || !newExpiryDateTime) return;

    setUpdatingExpiry(true);
    try {
      await api.patch(`/api/licenses/admin/${editingLicense.id}/expiry`, {
        expiresAt: new Date(newExpiryDateTime).toISOString()
      });
      setEditingLicense(null);
      fetchLicenses();
    } catch (err: any) {
      alert(err.message || 'Failed to update expiry date and time');
    } finally {
      setUpdatingExpiry(false);
    }
  };

  const handleDeleteLicense = async (item: AdminLicenseItem) => {
    if (!window.confirm(`PERMANENTLY REVOKE & DELETE license ${item.licenseKey}? This cannot be undone.`)) {
      return;
    }

    try {
      await api.delete(`/api/licenses/admin/${item.id}`);
      fetchLicenses();
    } catch (err: any) {
      alert(err.message || 'Failed to delete license');
    }
  };

  const handleCreateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createEmail.trim()) return;

    setCreating(true);
    try {
      let payload: any = {
        registeredEmail: createEmail.trim(),
        companyId: createCompanyId || null,
        planType: createPlan,
        maxUsers: parseInt(createMaxUsers) || 5,
        notes: createNotes.trim() || undefined
      };

      if (createDurationPreset === 'custom') {
        if (!customExpiryDate) {
          alert('Please specify a custom expiry date & time');
          setCreating(false);
          return;
        }
        payload.expiresAt = new Date(customExpiryDate).toISOString();
      } else {
        payload.durationDays = parseInt(createDurationPreset);
      }

      const res = await api.post<any>('/api/licenses/admin/generate', payload);
      if (res.license?.licenseKey) {
        setCreatedKey(res.license.licenseKey);
        fetchLicenses();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to generate license');
    } finally {
      setCreating(false);
    }
  };

  // Metrics
  const totalCount = licenses.length;
  const activeCount = licenses.filter(l => l.effectiveStatus === 'ACTIVE').length;
  const expiringSoonCount = licenses.filter(l => l.effectiveStatus === 'ACTIVE' && l.daysRemaining <= 15).length;
  const graceCount = licenses.filter(l => l.effectiveStatus === 'GRACE').length;
  const suspendedCount = licenses.filter(l => l.status === 'SUSPENDED').length;

  // Filtered List
  const filteredLicenses = licenses.filter(lic => {
    const q = searchQuery.toLowerCase();
    const matchName = lic.company?.name?.toLowerCase().includes(q) || false;
    const matchEmail = lic.registeredEmail?.toLowerCase().includes(q) || false;
    const matchKey = lic.licenseKey?.toLowerCase().includes(q) || false;
    const matchSearch = !searchQuery || matchName || matchEmail || matchKey;

    if (!matchSearch) return false;
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'SUSPENDED') return lic.status === 'SUSPENDED';
    return lic.effectiveStatus === statusFilter;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Title & Action Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Key size={22} color="#0f766e" />
            License & Subscription Management Center
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
            Activate, deactivate, extend validity, set exact expiry dates and issue new client licenses.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={fetchLicenses}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => {
              setShowCreateModal(true);
              setCreatedKey(null);
            }}
            className="btn btn-primary btn-sm"
            style={{
              backgroundColor: '#0f766e',
              borderColor: '#0f766e',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 700
            }}
          >
            <Plus size={15} />
            <span>Issue New License</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px'
      }}>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total Issued</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{totalCount}</div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '12px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Active & Good</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>{activeCount}</div>
        </div>

        <div style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: '8px', padding: '12px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: '#854d0e', fontWeight: 700, textTransform: 'uppercase' }}>Expiring ≤ 15 Days</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#a16207', marginTop: '2px' }}>{expiringSoonCount}</div>
        </div>

        <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '8px', padding: '12px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: '#9a3412', fontWeight: 700, textTransform: 'uppercase' }}>In Grace Period</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#c2410c', marginTop: '2px' }}>{graceCount}</div>
        </div>

        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: '#991b1b', fontWeight: 700, textTransform: 'uppercase' }}>Deactivated / Suspended</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#b91c1c', marginTop: '2px' }}>{suspendedCount}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        {/* Search Input */}
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search by company name, email, or license key..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px 6px 30px',
              border: '1px solid #cbd5e1',
              borderRadius: '5px',
              fontSize: '0.82rem'
            }}
          />
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['ALL', 'ACTIVE', 'GRACE', 'EXPIRED', 'SUSPENDED'] as const).map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '4px 10px',
                borderRadius: '5px',
                border: '1px solid',
                borderColor: statusFilter === st ? '#0f766e' : '#cbd5e1',
                backgroundColor: statusFilter === st ? '#0f766e' : '#f8fafc',
                color: statusFilter === st ? '#ffffff' : '#475569',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Main Licenses Data Table */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '10px 14px' }}>Status</th>
                <th style={{ padding: '10px 14px' }}>Company / Client</th>
                <th style={{ padding: '10px 14px' }}>Registered Email</th>
                <th style={{ padding: '10px 14px' }}>License Key</th>
                <th style={{ padding: '10px 14px' }}>Plan</th>
                <th style={{ padding: '10px 14px' }}>Expiry Date & Time</th>
                <th style={{ padding: '10px 14px' }}>Remaining</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                    Loading licenses from database...
                  </td>
                </tr>
              ) : filteredLicenses.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                    No licenses match the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredLicenses.map(lic => {
                  const isSuspended = lic.status === 'SUSPENDED';
                  const isExpired = lic.effectiveStatus === 'EXPIRED';
                  const isGrace = lic.effectiveStatus === 'GRACE';
                  const isExpiringSoon = lic.effectiveStatus === 'ACTIVE' && lic.daysRemaining <= 15;

                  const badgeColor = isSuspended ? '#b91c1c' : isExpired ? '#dc2626' : isGrace ? '#ea580c' : isExpiringSoon ? '#d97706' : '#16a34a';
                  const badgeBg = isSuspended ? '#fef2f2' : isExpired ? '#fef2f2' : isGrace ? '#fff7ed' : isExpiringSoon ? '#fffbeb' : '#f0fdf4';

                  const expiryDateObj = new Date(lic.expiresAt);
                  const formattedExpiry = expiryDateObj.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                  });
                  const formattedTime = expiryDateObj.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return (
                    <tr
                      key={lic.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        opacity: isSuspended ? 0.65 : 1
                      }}
                    >
                      {/* Status */}
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          backgroundColor: badgeBg,
                          color: badgeColor,
                          border: `1px solid ${badgeColor}40`
                        }}>
                          {isSuspended ? 'SUSPENDED' : lic.effectiveStatus}
                        </span>
                      </td>

                      {/* Company Name */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>
                          {lic.company?.name || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Unassigned (Pending)</span>}
                        </div>
                        {lic.company?.gstin && (
                          <div style={{ fontSize: '0.7rem', color: '#0f766e', fontFamily: 'monospace' }}>
                            GSTIN: {lic.company.gstin}
                          </div>
                        )}
                      </td>

                      {/* Registered Email */}
                      <td style={{ padding: '10px 14px', color: '#334155' }}>
                        {lic.registeredEmail}
                      </td>

                      {/* License Key */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <code style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                            {lic.licenseKey}
                          </code>
                          <button
                            onClick={() => handleCopy(lic.id, lic.licenseKey)}
                            title="Copy License Key"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0284c7', padding: '2px' }}
                          >
                            {copiedId === lic.id ? <CheckCircle2 size={13} color="#16a34a" /> : <Copy size={13} />}
                          </button>
                        </div>
                      </td>

                      {/* Plan */}
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#e2e8f0', color: '#334155' }}>
                          {lic.planType}
                        </span>
                      </td>

                      {/* Expiry Date & Time */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>
                          {formattedExpiry}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Clock size={11} /> {formattedTime}
                        </div>
                      </td>

                      {/* Days Remaining */}
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontWeight: 700, color: badgeColor }}>
                          {isSuspended ? 'Disabled' : lic.daysRemaining > 0 ? `${lic.daysRemaining} days` : `Expired`}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {/* Quick Extend +365 Days */}
                          <button
                            onClick={() => handleQuickExtend(lic, 365)}
                            title="Renew: Add +1 Year (+365 days)"
                            style={{
                              padding: '3px 7px',
                              backgroundColor: '#f0fdf4',
                              border: '1px solid #86efac',
                              color: '#15803d',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            +1 Yr
                          </button>

                          {/* Quick Extend +30 Days */}
                          <button
                            onClick={() => handleQuickExtend(lic, 30)}
                            title="Add +30 Days"
                            style={{
                              padding: '3px 7px',
                              backgroundColor: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              color: '#334155',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            +30d
                          </button>

                          {/* Edit Custom Expiry Date & Time */}
                          <button
                            onClick={() => {
                              setEditingLicense(lic);
                              // Format for datetime-local input YYYY-MM-DDTHH:mm
                              const d = new Date(lic.expiresAt);
                              d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                              setNewExpiryDateTime(d.toISOString().slice(0, 16));
                            }}
                            title="Set custom expiry date and time"
                            style={{
                              padding: '3px 6px',
                              backgroundColor: '#f0f9ff',
                              border: '1px solid #bae6fd',
                              color: '#0284c7',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            <Calendar size={13} />
                          </button>

                          {/* Activate / Deactivate (Toggle Suspend) */}
                          <button
                            onClick={() => handleToggleStatus(lic)}
                            title={isSuspended ? 'Reactivate License' : 'Deactivate / Suspend License'}
                            style={{
                              padding: '3px 6px',
                              backgroundColor: isSuspended ? '#f0fdf4' : '#fef2f2',
                              border: isSuspended ? '1px solid #86efac' : '1px solid #fecaca',
                              color: isSuspended ? '#16a34a' : '#dc2626',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            {isSuspended ? <Power size={13} /> : <PowerOff size={13} />}
                          </button>

                          {/* Revoke / Delete */}
                          <button
                            onClick={() => handleDeleteLicense(lic)}
                            title="Delete License"
                            style={{
                              padding: '3px 6px',
                              backgroundColor: '#ffffff',
                              border: '1px solid #e2e8f0',
                              color: '#64748b',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE NEW LICENSE MODAL */}
      {showCreateModal && (
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
            borderRadius: '10px',
            width: '100%',
            maxWidth: '520px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '12px 18px',
              borderBottom: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Key size={16} color="#0f766e" /> Issue New Commercial License
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateLicense} style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              {/* Recipient Email */}
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  REGISTERED CLIENT EMAIL * :
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. clinic.owner@gmail.com"
                  value={createEmail}
                  onChange={e => setCreateEmail(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                />
              </div>

              {/* Direct Company Assignment (Optional) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  DIRECT COMPANY ASSIGNMENT (OPTIONAL) :
                </label>
                <select
                  value={createCompanyId}
                  onChange={e => setCreateCompanyId(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                >
                  <option value="">-- Unassigned (Client will activate via key) --</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.gstin ? `(${c.gstin})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Plan Type */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    PLAN TIER :
                  </label>
                  <select
                    value={createPlan}
                    onChange={e => setCreatePlan(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                  >
                    <option value="WHOLESALE">WHOLESALE (Multi-Counter B2B)</option>
                    <option value="RETAIL_STD">RETAIL_STD (Single Clinic)</option>
                    <option value="ENTERPRISE">ENTERPRISE (Chain / Hospital)</option>
                    <option value="TRIAL">TRIAL (14 Days Demo)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    MAX USERS / DEVICES :
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={createMaxUsers}
                    onChange={e => setCreateMaxUsers(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                  />
                </div>
              </div>

              {/* Expiry Presets / Custom Date & Time */}
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  VALIDITY DURATION / EXPIRY DATE & TIME :
                </label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {[
                    { id: '14', label: '14 Days (Trial)' },
                    { id: '30', label: '30 Days (1 Mo)' },
                    { id: '90', label: '90 Days (Quarter)' },
                    { id: '365', label: '1 Year (Annual)' },
                    { id: 'custom', label: 'Custom Date & Time...' }
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setCreateDurationPreset(p.id as any)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: '1px solid',
                        borderColor: createDurationPreset === p.id ? '#0f766e' : '#cbd5e1',
                        backgroundColor: createDurationPreset === p.id ? '#e6fffa' : '#ffffff',
                        color: createDurationPreset === p.id ? '#0f766e' : '#475569',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {createDurationPreset === 'custom' && (
                  <input
                    type="datetime-local"
                    required
                    value={customExpiryDate}
                    onChange={e => setCustomExpiryDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '5px',
                      border: '1.5px solid #0f766e',
                      fontSize: '0.82rem'
                    }}
                  />
                )}
              </div>

              {/* Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  ADMIN NOTES / INVOICE REF :
                </label>
                <input
                  type="text"
                  placeholder="e.g. Paid via UPI ref 89283921 / Dr. Sharma annual subscription"
                  value={createNotes}
                  onChange={e => setCreateNotes(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                />
              </div>

              {createdKey ? (
                <div style={{ marginTop: '10px', padding: '12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', marginBottom: '4px' }}>
                    🎉 License Key Generated Successfully!
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', padding: '6px 10px', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                    <code style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>{createdKey}</code>
                    <button
                      type="button"
                      onClick={() => handleCopy('new', createdKey)}
                      style={{ background: 'none', border: 'none', color: '#0f766e', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      {copiedId === 'new' ? 'Copied!' : 'Copy Key'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setCreatedKey(null);
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ width: '100%', marginTop: '8px', fontSize: '0.78rem' }}
                  >
                    Done & Close
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="btn btn-primary btn-sm"
                    style={{ backgroundColor: '#0f766e', borderColor: '#0f766e', fontWeight: 700 }}
                  >
                    {creating ? 'Generating...' : 'Generate & Issue Key'}
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* EDIT EXPIRY DATE & TIME MODAL */}
      {editingLicense && (
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
            borderRadius: '10px',
            width: '100%',
            maxWidth: '440px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>
                📅 Set Exact Expiry Date & Time
              </h3>
              <button
                onClick={() => setEditingLicense(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleUpdateExpirySubmit} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '0.8rem', color: '#334155' }}>
                Updating license for: <strong>{editingLicense.company?.name || editingLicense.registeredEmail}</strong>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  NEW EXPIRATION DATE & TIME :
                </label>
                <input
                  type="datetime-local"
                  required
                  value={newExpiryDateTime}
                  onChange={e => setNewExpiryDateTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '5px',
                    border: '1.5px solid #0284c7',
                    fontSize: '0.85rem',
                    fontWeight: 600
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setEditingLicense(null)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingExpiry}
                  className="btn btn-primary btn-sm"
                  style={{ backgroundColor: '#0284c7', borderColor: '#0284c7', fontWeight: 700 }}
                >
                  {updatingExpiry ? 'Saving...' : 'Update Expiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

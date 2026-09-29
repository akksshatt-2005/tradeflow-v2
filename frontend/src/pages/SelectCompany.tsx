import React, { useState, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { Building2, Plus, ArrowRight, LogOut, AlertCircle, Sparkles, MapPin, FileText, Phone, Mail } from 'lucide-react';

export default function SelectCompany() {
  const { user, companies, selectCompany, createCompany, logout } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  
  // Form fields
  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [drugLicenseNo, setDrugLicenseNo] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  // GST Autofill state
  const [gstLookupLoading, setGstLookupLoading] = useState(false);
  const [gstLookupMsg, setGstLookupMsg] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGstAutofill = async (inputGstin?: string) => {
    const cleanGstin = (inputGstin || gstin).trim().toUpperCase();
    if (!cleanGstin || cleanGstin.length < 15) {
      setGstLookupMsg({ type: 'error', text: 'Please enter a valid 15-character GSTIN' });
      return;
    }

    try {
      setGstLookupLoading(true);
      setGstLookupMsg(null);

      const res = await api.post('/api/gst/lookup', { gstin: cleanGstin });
      const d = (res as any)?.data || res;

      if (d) {
        if (d.legalName || d.tradeName) setName(d.legalName || d.tradeName);
        if (d.address) setAddress(d.address);
        if (d.city) setCity(d.city);
        if (d.state) setState(d.state);
        if (d.pincode) setPincode(d.pincode);
        if (d.phone && !phone) setPhone(d.phone);
        if (d.email && !email) setEmail(d.email);
        if (d.dlNumber && !drugLicenseNo) setDrugLicenseNo(d.dlNumber);

        const isLive = (res as any)?.source === 'GOVERNMENT_GSP_LIVE';
        const srcLabel = isLive ? 'Govt GST Portal' : 'Smart Decoder';

        if (d.status?.toLowerCase() === 'active') {
          setGstLookupMsg({
            type: 'success',
            text: `✅ Verified (${srcLabel}): ${d.legalName || d.tradeName || 'Active Taxpayer'} — ${d.state}`
          });
        } else {
          setGstLookupMsg({
            type: 'warning',
            text: `⚠️ GSTIN Status: ${d.status?.toUpperCase() || 'INACTIVE'}`
          });
        }
      }
    } catch (err: any) {
      console.error('GST Autofill failed:', err);
      setGstLookupMsg({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Failed to lookup GSTIN'
      });
    } finally {
      setGstLookupLoading(false);
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Company / Pharmacy Name is required');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await createCompany({
        name: name.trim(),
        gstin: gstin.trim() || undefined,
        drugLicenseNo: drugLicenseNo.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        pincode: pincode.trim() || undefined
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create company');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setName('');
    setGstin('');
    setDrugLicenseNo('');
    setPhone('');
    setEmail('');
    setAddress('');
    setCity('');
    setState('');
    setPincode('');
    setGstLookupMsg(null);
    setError(null);
    setIsCreating(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div style={{ width: '100%', maxWidth: isCreating ? '640px' : '520px', transition: 'max-width 0.2s ease' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            backgroundColor: '#e0f2fe',
            borderRadius: '10px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '12px'
          }}>
            <Building2 size={26} color="#0284c7" />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>Select Pharmacy Company</h1>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
            Logged in as <strong style={{ color: '#0f172a' }}>{user?.username}</strong>
          </p>
        </div>

        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            padding: '10px 12px',
            borderRadius: '6px',
            fontSize: '12.5px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Main Card */}
        <div className="card" style={{ marginBottom: '16px', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#475569' }}>
              {isCreating ? '🏢 Create New Company / Pharmacy' : `Your Companies (${companies.length})`}
            </span>
            <button
              onClick={() => {
                if (isCreating) resetForm();
                else setIsCreating(true);
              }}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Plus size={14} />
              <span>{isCreating ? 'Cancel' : 'New Company'}</span>
            </button>
          </div>

          {/* Create Company Form */}
          {isCreating && (
            <form onSubmit={handleCreate} style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '18px',
              marginBottom: '16px'
            }}>
              {/* GSTIN Instant Autofill Helper Bar */}
              <div style={{
                background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                border: '1px solid #bae6fd',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={15} color="#0284c7" />
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0369a1' }}>
                      ⚡ Instant GSTIN Autofill (Optional)
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 500 }}>
                    Auto-fetches name, address & PIN code
                  </span>
                </div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Enter 15-digit GSTIN (e.g. 09AAALL0016F1ZK)"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleGstAutofill();
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      fontSize: '12.5px',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: '1px solid #93c5fd',
                      background: '#ffffff'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleGstAutofill()}
                    disabled={gstLookupLoading}
                    className="btn btn-primary btn-sm"
                    style={{
                      backgroundColor: '#0284c7',
                      borderColor: '#0284c7',
                      padding: '7px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {gstLookupLoading ? 'Fetching...' : '⚡ Autofill'}
                  </button>
                </div>

                {gstLookupMsg && (
                  <div style={{
                    marginTop: '8px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: gstLookupMsg.type === 'success' ? '#15803d' : (gstLookupMsg.type === 'warning' ? '#b45309' : '#b91c1c')
                  }}>
                    {gstLookupMsg.text}
                  </div>
                )}
              </div>

              {/* Company Core Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
                    Company / Pharmacy Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Apollo Pharmacy Ltd / Shree Ganesh Medicos"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13.5px', fontWeight: 600 }}
                    autoFocus
                  />
                </div>

                {/* Drug License & Phone Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', color: '#64748b' }}>
                      Drug License No. (DL 20B/21B) <span style={{ fontSize: '11px', color: '#94a3b8' }}>(Optional)</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. WLF20B2025UP010333"
                      value={drugLicenseNo}
                      onChange={(e) => setDrugLicenseNo(e.target.value.toUpperCase())}
                      style={{ padding: '7px 10px', fontSize: '12.5px' }}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', color: '#64748b' }}>
                      Mobile / Phone <span style={{ fontSize: '11px', color: '#94a3b8' }}>(Optional)</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      style={{ padding: '7px 10px', fontSize: '12.5px' }}
                    />
                  </div>
                </div>

                {/* Email Address */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px', color: '#64748b' }}>
                    Email Address <span style={{ fontSize: '11px', color: '#94a3b8' }}>(Optional)</span>
                  </label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="e.g. billing@apollomedicos.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ padding: '7px 10px', fontSize: '12.5px' }}
                  />
                </div>

                {/* Street Address */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px', color: '#64748b' }}>
                    Address (Shop No., Building, Street) <span style={{ fontSize: '11px', color: '#94a3b8' }}>(Optional)</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Shop 12, Ramanand Complex, Sitapur Road"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    style={{ padding: '7px 10px', fontSize: '12.5px' }}
                  />
                </div>

                {/* City, State & Pincode Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '10px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', color: '#64748b' }}>
                      City / Station <span style={{ fontSize: '11px', color: '#94a3b8' }}>(Optional)</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Lucknow"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      style={{ padding: '7px 10px', fontSize: '12.5px' }}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', color: '#64748b' }}>
                      State <span style={{ fontSize: '11px', color: '#94a3b8' }}>(Optional)</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Uttar Pradesh"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      style={{ padding: '7px 10px', fontSize: '12.5px' }}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', color: '#64748b' }}>
                      PIN Code <span style={{ fontSize: '11px', color: '#94a3b8' }}>(Optional)</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 226020"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      style={{ padding: '7px 10px', fontSize: '12.5px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Form Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '7px 14px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary btn-sm"
                  style={{ padding: '7px 16px', fontWeight: 600 }}
                >
                  {submitting ? 'Creating Company...' : 'Create & Enter'}
                </button>
              </div>
            </form>
          )}

          {/* Companies List */}
          {companies.length === 0 && !isCreating ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b' }}>
              <p style={{ fontSize: '13px', marginBottom: '12px' }}>
                You have not joined or created any companies yet.
              </p>
              <button
                onClick={() => setIsCreating(true)}
                className="btn btn-primary btn-sm"
              >
                <Plus size={14} /> Create Your First Company
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {companies.map((company) => (
                <div
                  key={company.id}
                  onClick={() => selectCompany(company)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#0284c7';
                    e.currentTarget.style.backgroundColor = '#f0f9ff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.backgroundColor = '#ffffff';
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14.5px', color: '#0f172a' }}>
                      {company.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                      <span className={`badge badge-${company.role}`}>
                        {company.role.toUpperCase()}
                      </span>
                      {company.gstin && (
                        <span style={{ fontSize: '11px', color: '#0369a1', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 600 }}>
                          GST: {company.gstin}
                        </span>
                      )}
                      {(company.city || company.state) && (
                        <span style={{ fontSize: '11.5px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <MapPin size={11} /> {[company.city, company.state].filter(Boolean).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', color: '#0284c7', gap: '4px', fontSize: '12.5px', fontWeight: 600 }}>
                    <span>Select</span>
                    <ArrowRight size={14} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Logout */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={logout}
            className="btn btn-secondary btn-sm"
            style={{ color: '#64748b' }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>

      </div>
    </div>
  );
}

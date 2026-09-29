import React, { useState, FormEvent } from 'react';
import { useAuth, Company } from '../context/AuthContext';
import { api } from '../api/client';
import { 
  Building2, 
  Plus, 
  ArrowRight, 
  LogOut, 
  AlertCircle, 
  Sparkles, 
  MapPin, 
  Edit2, 
  Trash2, 
  X, 
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

interface SelectCompanyProps {
  onCompanySelected?: () => void;
}

export default function SelectCompany({ onCompanySelected }: SelectCompanyProps) {
  const { user, companies, selectCompany, createCompany, updateCompany, deleteCompany, logout } = useAuth();
  
  // State for Create
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [drugLicenseNo, setDrugLicenseNo] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  // State for Edit
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editName, setEditName] = useState('');
  const [editGstin, setEditGstin] = useState('');
  const [editDrugLicenseNo, setEditDrugLicenseNo] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editPincode, setEditPincode] = useState('');

  // State for Delete Confirmation Modal
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // GST Autofill state
  const [gstLookupLoading, setGstLookupLoading] = useState(false);
  const [gstLookupMsg, setGstLookupMsg] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Handle Company Selection
  const handleSelect = (company: Company) => {
    selectCompany(company);
    if (onCompanySelected) {
      onCompanySelected();
    }
  };

  // GSTIN Autofill handler (for Create)
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

  // GSTIN Autofill handler (for Edit)
  const handleEditGstAutofill = async () => {
    const cleanGstin = editGstin.trim().toUpperCase();
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
        if (d.legalName || d.tradeName) setEditName(d.legalName || d.tradeName);
        if (d.address) setEditAddress(d.address);
        if (d.city) setEditCity(d.city);
        if (d.state) setEditState(d.state);
        if (d.pincode) setEditPincode(d.pincode);
        if (d.phone && !editPhone) setEditPhone(d.phone);
        if (d.email && !editEmail) setEditEmail(d.email);
        if (d.dlNumber && !editDrugLicenseNo) setEditDrugLicenseNo(d.dlNumber);

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

  // Handle Create Company
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
      if (onCompanySelected) {
        onCompanySelected();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create company');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Edit Form
  const openEdit = (comp: Company, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCompany(comp);
    setEditName(comp.name || '');
    setEditGstin(comp.gstin || '');
    setEditDrugLicenseNo(comp.drugLicenseNo || '');
    setEditPhone(comp.phone || '');
    setEditEmail(comp.email || '');
    setEditAddress(comp.address || '');
    setEditCity(comp.city || '');
    setEditState(comp.state || '');
    setEditPincode(comp.pincode || '');
    setGstLookupMsg(null);
    setError(null);
    setIsCreating(false);
  };

  // Handle Save Edit
  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingCompany || !editName.trim()) {
      setError('Company name is required');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await updateCompany(editingCompany.id, {
        name: editName.trim(),
        gstin: editGstin.trim() || undefined,
        drugLicenseNo: editDrugLicenseNo.trim() || undefined,
        phone: editPhone.trim() || undefined,
        email: editEmail.trim() || undefined,
        address: editAddress.trim() || undefined,
        city: editCity.trim() || undefined,
        state: editState.trim() || undefined,
        pincode: editPincode.trim() || undefined
      });
      setSuccessMsg(`Company "${editName}" updated successfully!`);
      setTimeout(() => setSuccessMsg(null), 3500);
      setEditingCompany(null);
    } catch (err: any) {
      setError(err.message || 'Failed to update company');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Delete Confirmation
  const openDelete = (comp: Company, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingCompany(comp);
    setDeleteConfirmText('');
    setError(null);
  };

  // Handle Delete Company
  const handleDelete = async () => {
    if (!deletingCompany) return;
    setDeleteLoading(true);
    setError(null);
    try {
      await deleteCompany(deletingCompany.id);
      setSuccessMsg(`Company "${deletingCompany.name}" has been deleted.`);
      setTimeout(() => setSuccessMsg(null), 3500);
      setDeletingCompany(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete company');
    } finally {
      setDeleteLoading(false);
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
    setEditingCompany(null);
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
      <div style={{ width: '100%', maxWidth: (isCreating || editingCompany) ? '640px' : '540px', transition: 'max-width 0.2s ease' }}>
        
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

        {/* Feedback Messages */}
        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            padding: '10px 14px',
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

        {successMsg && (
          <div style={{
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#15803d',
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '12.5px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <CheckCircle size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Main Card */}
        <div className="card" style={{ marginBottom: '16px', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#475569' }}>
              {isCreating ? '🏢 Create New Company / Pharmacy' : (editingCompany ? `✏️ Edit Company: ${editingCompany.name}` : `Your Companies (${companies.length})`)}
            </span>
            {!editingCompany && (
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
            )}
          </div>

          {/* ======================================================== */}
          {/* EDIT COMPANY FORM */}
          {/* ======================================================== */}
          {editingCompany && (
            <form onSubmit={handleSaveEdit} style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '18px',
              marginBottom: '16px'
            }}>
              {/* GSTIN Autofill for Edit */}
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
                    Auto-updates address & details from GST portal
                  </span>
                </div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Enter 15-digit GSTIN"
                    value={editGstin}
                    onChange={(e) => setEditGstin(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleEditGstAutofill();
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
                    onClick={handleEditGstAutofill}
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

              {/* Company Fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
                    Company / Pharmacy Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13.5px', fontWeight: 600 }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', color: '#64748b' }}>
                      Drug License No. (DL 20B/21B)
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. WLF20B2025UP010333"
                      value={editDrugLicenseNo}
                      onChange={(e) => setEditDrugLicenseNo(e.target.value.toUpperCase())}
                      style={{ padding: '7px 10px', fontSize: '12.5px' }}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', color: '#64748b' }}>
                      Mobile / Phone
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 9876543210"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      style={{ padding: '7px 10px', fontSize: '12.5px' }}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px', color: '#64748b' }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="e.g. store@pharmacy.com"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    style={{ padding: '7px 10px', fontSize: '12.5px' }}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px', color: '#64748b' }}>
                    Address (Shop No., Building, Street)
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    style={{ padding: '7px 10px', fontSize: '12.5px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '10px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', color: '#64748b' }}>
                      City / Station
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={editCity}
                      onChange={(e) => setEditCity(e.target.value)}
                      style={{ padding: '7px 10px', fontSize: '12.5px' }}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', color: '#64748b' }}>
                      State
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={editState}
                      onChange={(e) => setEditState(e.target.value)}
                      style={{ padding: '7px 10px', fontSize: '12.5px' }}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '12px', color: '#64748b' }}>
                      PIN Code
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={editPincode}
                      onChange={(e) => setEditPincode(e.target.value)}
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
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* CREATE NEW COMPANY FORM */}
          {/* ======================================================== */}
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

          {/* ======================================================== */}
          {/* COMPANIES LIST */}
          {/* ======================================================== */}
          {companies.length === 0 && !isCreating && !editingCompany ? (
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
          ) : (!isCreating && !editingCompany && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {companies.map((company) => (
                <div
                  key={company.id}
                  onClick={() => handleSelect(company)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
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
                  <div style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>
                      {company.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '5px' }}>
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

                  {/* Actions: Edit, Delete, Select */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                    {company.role === 'owner' && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => openEdit(company, e)}
                          title="Edit Company Details"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '5px 8px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            borderRadius: '5px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#475569',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#0284c7';
                            e.currentTarget.style.color = '#0284c7';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#cbd5e1';
                            e.currentTarget.style.color = '#475569';
                          }}
                        >
                          <Edit2 size={12} />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => openDelete(company, e)}
                          title="Delete Company"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '5px 8px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            borderRadius: '5px',
                            border: '1px solid #fecaca',
                            background: '#fff5f5',
                            color: '#dc2626',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#b91c1c';
                            e.currentTarget.style.background = '#fee2e2';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#fecaca';
                            e.currentTarget.style.background = '#fff5f5';
                          }}
                        >
                          <Trash2 size={12} />
                          <span>Delete</span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => handleSelect(company)}
                      className="btn btn-primary btn-sm"
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <span>Select</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
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

      {/* ======================================================== */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ======================================================== */}
      {deletingCompany && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            maxWidth: '460px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <AlertTriangle size={22} color="#dc2626" />
              </div>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Delete Company?
                </h3>
                <p style={{ fontSize: '12.5px', color: '#64748b', margin: '2px 0 0 0' }}>
                  This action cannot be undone.
                </p>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: '#334155', lineHeight: '1.5', marginBottom: '16px' }}>
              Are you sure you want to delete <strong style={{ color: '#0f172a' }}>"{deletingCompany.name}"</strong>? This will permanently delete all associated:
            </p>

            <ul style={{ fontSize: '12px', color: '#dc2626', paddingLeft: '20px', marginBottom: '16px', lineHeight: '1.6' }}>
              <li>Sales Invoices & Purchase Bills</li>
              <li>Medicine Inventory, Batches & Stock Ledgers</li>
              <li>Customer & Supplier Master Data</li>
            </ul>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setDeletingCompany(null)}
                disabled={deleteLoading}
                className="btn btn-secondary btn-sm"
                style={{ padding: '8px 14px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteLoading}
                className="btn btn-danger btn-sm"
                style={{
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  padding: '8px 16px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Trash2 size={14} />
                <span>{deleteLoading ? 'Deleting...' : 'Yes, Delete Company'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

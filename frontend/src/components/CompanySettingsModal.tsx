import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  QrCode,
  Scale,
  ShieldCheck,
  Printer,
  Hash,
  AlertTriangle,
  Upload,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import { Company } from '../context/AuthContext';
import { CompanySettings, getCompanySettings, saveCompanySettings } from '../utils/companySettings';

interface CompanySettingsModalProps {
  activeCompany: Company | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (settings: CompanySettings) => void;
}

type TabType = 'BANK_UPI' | 'TERMS' | 'PHARMA' | 'PRINT' | 'SERIES' | 'ALERTS' | 'BRANDING';

export const CompanySettingsModal: React.FC<CompanySettingsModalProps> = ({
  activeCompany,
  isOpen,
  onClose,
  onSaved
}) => {
  const companyId = activeCompany?.id || '';
  const [activeTab, setActiveTab] = useState<TabType>('BANK_UPI');
  const [form, setForm] = useState<CompanySettings>(() => getCompanySettings(companyId, activeCompany));
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen && companyId) {
      setForm(getCompanySettings(companyId, activeCompany));
      setSaveSuccess(false);
    }
  }, [isOpen, companyId, activeCompany]);

  // Keyboard Shortcut: Escape to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo file size exceeds 2MB limit.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setForm(prev => ({ ...prev, companyLogo: event.target!.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Stamp file size exceeds 2MB limit.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setForm(prev => ({ ...prev, signatureImage: event.target!.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    saveCompanySettings(companyId, form);
    setSaveSuccess(true);
    if (onSaved) onSaved(form);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 400);
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'BANK_UPI', label: 'Bank & UPI QR', icon: <QrCode size={14} /> },
    { id: 'TERMS', label: 'Terms & Jurisdiction', icon: <Scale size={14} /> },
    { id: 'PHARMA', label: 'Pharma Statutory', icon: <ShieldCheck size={14} /> },
    { id: 'PRINT', label: 'Print Presets', icon: <Printer size={14} /> },
    { id: 'SERIES', label: 'Invoice Series', icon: <Hash size={14} /> },
    { id: 'ALERTS', label: 'Expiry & Alerts', icon: <AlertTriangle size={14} /> },
    { id: 'BRANDING', label: 'Logo & Mohar', icon: <Building2 size={14} /> },
  ];

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
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(2px)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div style={{
        background: '#ffffff',
        width: '100%',
        maxWidth: '720px',
        maxHeight: '90vh',
        borderRadius: '8px',
        boxShadow: '0 12px 36px rgba(0,0,0,0.22)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #cbd5e1'
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 18px',
          borderBottom: '1px solid #e2e8f0',
          background: '#0f766e',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Building2 size={18} />
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, letterSpacing: '0.3px', color: '#ffffff' }}>
                Firm Settings & Preferences
              </h3>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#ccfbf1', marginTop: '2px', fontWeight: 600 }}>
              Configuring: <strong>{activeCompany?.name || 'Default Firm'}</strong> (Unique per vendor)
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#ffffff',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          overflowX: 'auto',
          borderBottom: '1px solid #e2e8f0',
          background: '#f8fafc',
          padding: '0 8px'
        }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 12px',
                fontSize: '0.75rem',
                fontWeight: activeTab === tab.id ? 800 : 600,
                color: activeTab === tab.id ? '#0f766e' : '#475569',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2.5px solid #0f766e' : '2.5px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>

            {/* TAB 1: BANK & UPI QR */}
            {activeTab === 'BANK_UPI' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase' }}>
                  🏦 Bank Account & Dynamic UPI QR Code
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  These details print in the bank footer of all invoices. Enter your UPI ID to print an instant scan-to-pay QR code for clients.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>Bank Name *</label>
                    <input
                      type="text"
                      required
                      value={form.bankName}
                      onChange={e => setForm({ ...form, bankName: e.target.value })}
                      style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>A/C Number *</label>
                    <input
                      type="text"
                      required
                      value={form.accountNo}
                      onChange={e => setForm({ ...form, accountNo: e.target.value })}
                      style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontFamily: 'monospace' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>IFSC Code *</label>
                    <input
                      type="text"
                      required
                      value={form.ifscCode}
                      onChange={e => setForm({ ...form, ifscCode: e.target.value.toUpperCase() })}
                      style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontFamily: 'monospace' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>Branch Name</label>
                    <input
                      type="text"
                      value={form.branch}
                      onChange={e => setForm({ ...form, branch: e.target.value })}
                      style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>Account Beneficiary / Company Name</label>
                  <input
                    type="text"
                    placeholder={activeCompany?.name}
                    value={form.accountName}
                    onChange={e => setForm({ ...form, accountName: e.target.value })}
                    style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                  />
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e3a8a', textTransform: 'uppercase', marginBottom: '8px' }}>
                    📲 UPI Payment Configuration
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>UPI ID (e.g. 9876543210@paytm or firm@okicici)</label>
                      <input
                        type="text"
                        placeholder="yourname@upi"
                        value={form.upiId}
                        onChange={e => setForm({ ...form, upiId: e.target.value.trim() })}
                        style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontFamily: 'monospace' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>Payee Name (as registered with bank)</label>
                      <input
                        type="text"
                        placeholder={activeCompany?.name || 'Firm Name'}
                        value={form.upiPayeeName}
                        onChange={e => setForm({ ...form, upiPayeeName: e.target.value })}
                        style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: TERMS & JURISDICTION */}
            {activeTab === 'TERMS' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase' }}>
                  ⚖️ Invoice Terms, Conditions & Legal Jurisdiction
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  These clauses appear in the bottom-left Terms box of your wholesale and retail tax invoices.
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>Legal Jurisdiction Court</label>
                  <input
                    type="text"
                    placeholder="e.g. LUCKNOW Jurisdiction only"
                    value={form.jurisdiction}
                    onChange={e => setForm({ ...form, jurisdiction: e.target.value })}
                    style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>Terms Line 1 (Return Policy)</label>
                  <input
                    type="text"
                    value={form.termsLine1}
                    onChange={e => setForm({ ...form, termsLine1: e.target.value })}
                    style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>Terms Line 2 (Dispute Clause)</label>
                  <input
                    type="text"
                    value={form.termsLine2}
                    onChange={e => setForm({ ...form, termsLine2: e.target.value })}
                    style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>Terms Line 3 (Overdue Interest Clause)</label>
                    <input
                      type="text"
                      value={form.termsLine3}
                      onChange={e => setForm({ ...form, termsLine3: e.target.value })}
                      style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>Credit Interest Rate (%)</label>
                    <input
                      type="number"
                      value={form.creditInterestRate}
                      onChange={e => setForm({ ...form, creditInterestRate: e.target.value })}
                      style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: PHARMA COMPLIANCE */}
            {activeTab === 'PHARMA' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase' }}>
                  💊 Drug Licensing & Statutory Compliance (Form 20B, 21B, FSSAI)
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Printed on invoice header and statutory inspection logs as mandated by Indian FDA & Drugs and Cosmetics Act.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>Drug License Form 20B (Allopathic)</label>
                    <input
                      type="text"
                      placeholder="e.g. 20B-194000"
                      value={form.dl20b}
                      onChange={e => setForm({ ...form, dl20b: e.target.value })}
                      style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontFamily: 'monospace' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>Drug License Form 21B (Schedule C/C1)</label>
                    <input
                      type="text"
                      placeholder="e.g. 21B-194001"
                      value={form.dl21b}
                      onChange={e => setForm({ ...form, dl21b: e.target.value })}
                      style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>FSSAI Registration / License Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 10019051003482 (For food supplements/nutraceuticals)"
                    value={form.fssaiNo}
                    onChange={e => setForm({ ...form, fssaiNo: e.target.value })}
                    style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontFamily: 'monospace' }}
                  />
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.requireDoctorOnScheduleH}
                      onChange={e => setForm({ ...form, requireDoctorOnScheduleH: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#0f766e' }}
                    />
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                        Enforce Doctor Name & Reg No for Schedule H / H1 / Narcotic Drugs
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                        Warns the cashier before billing prescription-only antibiotics and controlled medicines without doctor details.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* TAB 4: PRINT PRESETS */}
            {activeTab === 'PRINT' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase' }}>
                  🖨️ Printer Hardware & Layout Presets
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Select the default paper format for invoices printed from this firm.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div
                    onClick={() => setForm({ ...form, paperSize: 'A4_PORTRAIT' })}
                    style={{
                      border: form.paperSize === 'A4_PORTRAIT' ? '2px solid #0f766e' : '1px solid #cbd5e1',
                      background: form.paperSize === 'A4_PORTRAIT' ? '#f0fdfa' : '#ffffff',
                      borderRadius: '6px',
                      padding: '12px',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>📄</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>A4 Full Page</div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '2px' }}>Laser / Inkjet (Full ERP Details)</div>
                  </div>

                  <div
                    onClick={() => setForm({ ...form, paperSize: 'A5_LANDSCAPE' })}
                    style={{
                      border: form.paperSize === 'A5_LANDSCAPE' ? '2px solid #0f766e' : '1px solid #cbd5e1',
                      background: form.paperSize === 'A5_LANDSCAPE' ? '#f0fdfa' : '#ffffff',
                      borderRadius: '6px',
                      padding: '12px',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>📑</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>A5 Landscape</div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '2px' }}>Half-page (50% paper savings)</div>
                  </div>

                  <div
                    onClick={() => setForm({ ...form, paperSize: 'THERMAL_80MM' })}
                    style={{
                      border: form.paperSize === 'THERMAL_80MM' ? '2px solid #0f766e' : '1px solid #cbd5e1',
                      background: form.paperSize === 'THERMAL_80MM' ? '#f0fdfa' : '#ffffff',
                      borderRadius: '6px',
                      padding: '12px',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>🧾</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>3" Thermal Roll</div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '2px' }}>80mm POS Counter Receipt</div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.showUpiQrOnInvoice}
                      onChange={e => setForm({ ...form, showUpiQrOnInvoice: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#0f766e' }}
                    />
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                        Show Dynamic UPI QR Code on Printed Invoice
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                        Clients can scan with PhonePe / GPay / Paytm to transfer exact bill amount directly to your account.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* TAB 5: INVOICE SERIES */}
            {activeTab === 'SERIES' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase' }}>
                  🏷️ Invoice Prefix & Numbering Sequence
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Configure your standard billing sequence to match GST audit standards.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>Invoice Prefix</label>
                    <input
                      type="text"
                      placeholder="e.g. NHC/26-27/ or INV-"
                      value={form.invoicePrefix}
                      onChange={e => setForm({ ...form, invoicePrefix: e.target.value })}
                      style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontFamily: 'monospace' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>Starting Sequence Number</label>
                    <input
                      type="text"
                      placeholder="1001"
                      value={form.invoiceStartNumber}
                      onChange={e => setForm({ ...form, invoiceStartNumber: e.target.value })}
                      style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.75rem' }}>
                  <strong>Next Generated Invoice Format Preview:</strong>{' '}
                  <span style={{ fontFamily: 'monospace', color: '#0f766e', fontWeight: 800 }}>
                    {form.invoicePrefix || 'INV-'}{form.invoiceStartNumber || '1001'}
                  </span>
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.autoResetFinancialYear}
                      onChange={e => setForm({ ...form, autoResetFinancialYear: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#0f766e' }}
                    />
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                        Auto-Reset Invoice Numbering Every Financial Year (1st April)
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                        Restarts numbering series on April 1st to comply with standard Indian accounting laws.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* TAB 6: INVENTORY & EXPIRY ALERTS */}
            {activeTab === 'ALERTS' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase' }}>
                  ⚠️ Inventory Stock Safety & Expiry Alert Thresholds
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Automate loss prevention by warning staff before selling near-expiry or out-of-stock items.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>Near-Expiry Alert Window</label>
                    <select
                      value={form.expiryWarningDays}
                      onChange={e => setForm({ ...form, expiryWarningDays: Number(e.target.value) as any })}
                      style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem', background: '#fff' }}
                    >
                      <option value={30}>30 Days (Immediate Action)</option>
                      <option value={60}>60 Days (2 Months Before)</option>
                      <option value={90}>90 Days (Quarterly Return)</option>
                      <option value={180}>180 Days (Half-Year Wholesale Notice)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>Low Stock Reorder Threshold</label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={form.lowStockThreshold}
                      onChange={e => setForm({ ...form, lowStockThreshold: Number(e.target.value) || 10 })}
                      style={{ width: '100%', padding: '7px 9px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.preventNegativeStock}
                      onChange={e => setForm({ ...form, preventNegativeStock: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#0f766e' }}
                    />
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                        Strict Stock Control: Block Billing for Zero / Negative Stock
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                        Disallows billing if computer stock has run out. Uncheck to allow negative stock (grace delivery mode).
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* TAB 7: BRANDING & MOHAR STAMP */}
            {activeTab === 'BRANDING' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase' }}>
                  🖼️ Company Logo & Official Stamp / Mohar
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Upload high-resolution graphics to give your printouts an executive medical ERP look.
                </div>

                {/* Company Logo */}
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Company / Clinic Logo (Prints on Top Header)
                  </div>
                  {form.companyLogo ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', border: '1.5px solid #86efac', borderRadius: '6px', background: '#f0fdf4' }}>
                      <img src={form.companyLogo} alt="Logo" style={{ maxHeight: '48px', maxWidth: '120px', objectFit: 'contain' }} />
                      <div style={{ flex: 1, fontSize: '0.72rem', color: '#166534', fontWeight: 600 }}>Active Company Logo Loaded</div>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, companyLogo: undefined })}
                        className="btn btn-secondary btn-sm"
                        style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    </div>
                  ) : (
                    <label style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '12px',
                      border: '1.5px dashed #cbd5e1',
                      borderRadius: '6px',
                      background: '#f8fafc',
                      cursor: 'pointer'
                    }}>
                      <Upload size={18} color="#0f766e" />
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f766e' }}>Click to Upload Clinic / Company Logo</span>
                      <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>PNG or JPG (recommended width 200px)</span>
                      <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                    </label>
                  )}
                </div>

                {/* Official Stamp / Mohar */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Authorized Signature / Mohar (Stamp) (Prints in Signature Box)
                  </div>
                  {form.signatureImage ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', border: '1.5px solid #86efac', borderRadius: '6px', background: '#f0fdf4' }}>
                      <img src={form.signatureImage} alt="Stamp" style={{ maxHeight: '48px', maxWidth: '120px', objectFit: 'contain' }} />
                      <div style={{ flex: 1, fontSize: '0.72rem', color: '#166534', fontWeight: 600 }}>Official Stamp / Signature Loaded</div>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, signatureImage: undefined })}
                        className="btn btn-secondary btn-sm"
                        style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    </div>
                  ) : (
                    <label style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '12px',
                      border: '1.5px dashed #cbd5e1',
                      borderRadius: '6px',
                      background: '#f8fafc',
                      cursor: 'pointer'
                    }}>
                      <Upload size={18} color="#0f766e" />
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f766e' }}>Click to Upload Official Mohar / Stamp</span>
                      <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>PNG or JPG with transparent background</span>
                      <input type="file" accept="image/*" onChange={handleSignatureUpload} style={{ display: 'none' }} />
                    </label>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Footer Actions */}
          <div style={{
            padding: '12px 18px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
              All settings are saved directly to this vendor firm and will automatically reflect across all printouts.
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                style={{
                  backgroundColor: saveSuccess ? '#16a34a' : '#0f766e',
                  borderColor: saveSuccess ? '#16a34a' : '#0f766e',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                {saveSuccess ? (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Saved!</span>
                  </>
                ) : (
                  <span>Save All Settings</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

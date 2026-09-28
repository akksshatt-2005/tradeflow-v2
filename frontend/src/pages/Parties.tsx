import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import {
  Users,
  Search,
  Plus,
  Truck,
  UserCheck,
  Building2,
  FileCheck2,
  Phone,
  Mail,
  MapPin,
  X,
  CreditCard,
  Globe,
  ShieldAlert,
  Calendar,
  Eye,
  Edit2,
  FileText,
  CheckCircle,
  AlertTriangle,
  Trash2
} from 'lucide-react';

interface PartyLedger {
  id: string;
  name: string;
  type: 'supplier' | 'customer' | 'both';
  station?: string | null;
  accountGroup?: string | null;
  balancingMethod: string;
  openingBalance: number;
  openingBalanceType: 'DR' | 'CR';
  mailTo?: string | null;
  address?: string | null;
  pincode?: string | null;
  state?: string | null;
  stateCode?: string | null;
  country: string;
  phone?: string | null;
  mobile?: string | null;
  faxNo?: string | null;
  email?: string | null;
  website?: string | null;
  contactPerson?: string | null;
  designation?: string | null;
  gstin?: string | null;
  drugLicenseNo?: string | null;
  dlExpiryDate?: string | null;
  fssaiNo?: string | null;
  fssaiExpiryDate?: string | null;
  panNo?: string | null;
  scheduleHNotice: 'ALLOW_ALL' | 'WARNING' | 'BLOCK';
  holdPayment: boolean;
  ledgerCategory: 'REGISTERED' | 'UNREGISTERED' | 'COMPOSITE' | 'CONSUMER';
  defaultDoctorName?: string | null;
  defaultDoctorRegNo?: string | null;
  isCash: boolean;
  creditLimit: number;
  outstandingBalance: number;
  createdAt: string;
}

export default function Parties() {
  const { activeCompany } = useAuth();
  const [parties, setParties] = useState<PartyLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'customer' | 'supplier'>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Modal State for Ledger Modification / Creation (Photo 1)
  const [showModal, setShowModal] = useState(false);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'BASIC' | 'CONTACT' | 'STATUTORY' | 'TERMS'>('BASIC');

  // Form Fields (Exact fields from Photo 1)
  const [name, setName] = useState('');
  const [station, setStation] = useState('');
  const [accountGroup, setAccountGroup] = useState('SUNDRY_CREDITORS');
  const [balancingMethod, setBalancingMethod] = useState('BILL_BY_BILL');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [openingBalanceType, setOpeningBalanceType] = useState<'DR' | 'CR'>('CR');
  const [mailTo, setMailTo] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [state, setState] = useState('UTTAR PRADESH');
  const [stateCode, setStateCode] = useState('09');
  const [country, setCountry] = useState('INDIA');

  // Contact Info
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [designation, setDesignation] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [faxNo, setFaxNo] = useState('');

  // Statutory & Licences
  const [drugLicenseNo, setDrugLicenseNo] = useState('');
  const [dlExpiryDate, setDlExpiryDate] = useState('');
  const [gstin, setGstin] = useState('');
  const [fssaiNo, setFssaiNo] = useState('');
  const [fssaiExpiryDate, setFssaiExpiryDate] = useState('');
  const [panNo, setPanNo] = useState('');
  const [scheduleHNotice, setScheduleHNotice] = useState<'ALLOW_ALL' | 'WARNING' | 'BLOCK'>('ALLOW_ALL');
  const [holdPayment, setHoldPayment] = useState(false);
  const [ledgerCategory, setLedgerCategory] = useState<'REGISTERED' | 'UNREGISTERED' | 'COMPOSITE' | 'CONSUMER'>('REGISTERED');
  const [defaultDoctorName, setDefaultDoctorName] = useState('');
  const [defaultDoctorRegNo, setDefaultDoctorRegNo] = useState('');
  const [creditLimit, setCreditLimit] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchParties();
  }, [activeCompany?.id, activeTab]);

  const fetchParties = async () => {
    if (!activeCompany) return;
    try {
      setLoading(true);
      setError(null);
      const url = activeTab === 'all'
        ? '/api/parties'
        : `/api/parties?type=${activeTab}`;
      const res = await api.get<{ parties: PartyLedger[] }>(url, {
        companyId: activeCompany.id
      });
      setParties(res.parties || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load parties');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = (type: 'supplier' | 'customer') => {
    setEditingPartyId(null);
    setName('');
    setStation('');
    setAccountGroup(type === 'supplier' ? 'SUNDRY_CREDITORS' : 'SUNDRY_DEBTORS');
    setBalancingMethod('BILL_BY_BILL');
    setOpeningBalance('0');
    setOpeningBalanceType(type === 'supplier' ? 'CR' : 'DR');
    setMailTo('');
    setAddress('');
    setPincode('');
    setState('UTTAR PRADESH');
    setStateCode('09');
    setCountry('INDIA');
    setEmail('');
    setWebsite('');
    setContactPerson('');
    setDesignation('');
    setPhone('');
    setMobile('');
    setFaxNo('');
    setDrugLicenseNo('');
    setDlExpiryDate('');
    setGstin('');
    setFssaiNo('');
    setFssaiExpiryDate('');
    setPanNo('');
    setScheduleHNotice('ALLOW_ALL');
    setHoldPayment(false);
    setLedgerCategory('REGISTERED');
    setDefaultDoctorName('');
    setDefaultDoctorRegNo('');
    setCreditLimit('0');
    setActiveSection('BASIC');
    setShowModal(true);
  };

  const handleOpenEditModal = (p: PartyLedger) => {
    setEditingPartyId(p.id);
    setName(p.name);
    setStation(p.station || '');
    setAccountGroup(p.accountGroup || (p.type === 'supplier' ? 'SUNDRY_CREDITORS' : 'SUNDRY_DEBTORS'));
    setBalancingMethod(p.balancingMethod || 'BILL_BY_BILL');
    setOpeningBalance(String(p.openingBalance || 0));
    setOpeningBalanceType(p.openingBalanceType || (p.type === 'supplier' ? 'CR' : 'DR'));
    setMailTo(p.mailTo || p.name);
    setAddress(p.address || '');
    setPincode(p.pincode || '');
    setState(p.state || 'UTTAR PRADESH');
    setStateCode(p.stateCode || '09');
    setCountry(p.country || 'INDIA');
    setEmail(p.email || '');
    setWebsite(p.website || '');
    setContactPerson(p.contactPerson || '');
    setDesignation(p.designation || '');
    setPhone(p.phone || '');
    setMobile(p.mobile || '');
    setFaxNo(p.faxNo || '');
    setDrugLicenseNo(p.drugLicenseNo || '');
    setDlExpiryDate(p.dlExpiryDate ? p.dlExpiryDate.split('T')[0] : '');
    setGstin(p.gstin || '');
    setFssaiNo(p.fssaiNo || '');
    setFssaiExpiryDate(p.fssaiExpiryDate ? p.fssaiExpiryDate.split('T')[0] : '');
    setPanNo(p.panNo || '');
    setScheduleHNotice(p.scheduleHNotice || 'ALLOW_ALL');
    setHoldPayment(p.holdPayment || false);
    setLedgerCategory(p.ledgerCategory || 'REGISTERED');
    setDefaultDoctorName(p.defaultDoctorName || '');
    setDefaultDoctorRegNo(p.defaultDoctorRegNo || '');
    setCreditLimit(String(p.creditLimit || 0));
    setActiveSection('BASIC');
    setShowModal(true);
  };

  const handleGstinChange = (val: string) => {
    const clean = val.toUpperCase();
    setGstin(clean);
    // Auto-extract 2-digit state code and 10-digit PAN from 15-char GSTIN
    if (clean.length >= 2) {
      const code = clean.substring(0, 2);
      setStateCode(code);
      if (code === '09') setState('UTTAR PRADESH');
      else if (code === '07') setState('DELHI');
      else if (code === '27') setState('MAHARASHTRA');
      else if (code === '24') setState('GUJARAT');
      else if (code === '08') setState('RAJASTHAN');
      else if (code === '19') setState('WEST BENGAL');
      else if (code === '33') setState('TAMIL NADU');
      else if (code === '29') setState('KARNATAKA');
    }
    if (clean.length >= 12) {
      setPanNo(clean.substring(2, 12));
    }
  };

  const handleSaveParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany) return;

    if (!name.trim()) {
      setError('Ledger Name is required');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const computedType = accountGroup === 'SUNDRY_CREDITORS' ? 'supplier' : 'customer';

      const payload = {
        name: name.trim(),
        type: computedType,
        station: station.trim() || null,
        accountGroup,
        balancingMethod,
        openingBalance: parseFloat(openingBalance) || 0,
        openingBalanceType,
        mailTo: mailTo.trim() || name.trim(),
        address: address.trim() || null,
        pincode: pincode.trim() || null,
        state: state.trim() || null,
        stateCode: stateCode.trim() || null,
        country: country.trim() || 'INDIA',
        phone: phone.trim() || null,
        mobile: mobile.trim() || null,
        faxNo: faxNo.trim() || null,
        email: email.trim().toLowerCase() || null,
        website: website.trim() || null,
        contactPerson: contactPerson.trim() || null,
        designation: designation.trim() || null,
        gstin: gstin.trim().toUpperCase() || null,
        drugLicenseNo: drugLicenseNo.trim().toUpperCase() || null,
        dlExpiryDate: dlExpiryDate || null,
        fssaiNo: fssaiNo.trim().toUpperCase() || null,
        fssaiExpiryDate: fssaiExpiryDate || null,
        panNo: panNo.trim().toUpperCase() || null,
        scheduleHNotice,
        holdPayment,
        ledgerCategory,
        defaultDoctorName: defaultDoctorName.trim() || null,
        defaultDoctorRegNo: defaultDoctorRegNo.trim() || null,
        creditLimit: parseFloat(creditLimit) || 0
      };

      if (editingPartyId) {
        await api.put(`/api/parties/${editingPartyId}`, payload, {
          companyId: activeCompany.id,
          idempotencyKey: `edit-party-${Date.now()}`
        });
      } else {
        await api.post('/api/parties', payload, {
          companyId: activeCompany.id,
          idempotencyKey: `create-party-${Date.now()}`
        });
      }

      setShowModal(false);
      fetchParties();
    } catch (err: any) {
      console.error('Failed to save party ledger:', err);
      setError(err.response?.data?.error || err.message || 'Failed to save ledger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteParty = async (p: PartyLedger) => {
    if (!activeCompany) return;
    if (p.isCash) {
      alert('The default Cash party cannot be deleted.');
      return;
    }

    const confirmDelete = window.confirm(
      `Are you sure you want to delete ledger "${p.name}"?\n\nNote: Ledgers with linked purchase bills or sales invoices cannot be deleted until those bills are deleted.`
    );
    if (!confirmDelete) return;

    try {
      setLoading(true);
      setError(null);
      await api.delete(`/api/parties/${p.id}`, {
        companyId: activeCompany.id
      });
      if (editingPartyId === p.id) {
        setShowModal(false);
        setEditingPartyId(null);
      }
      await fetchParties();
    } catch (err: any) {
      console.error('Failed to delete party:', err);
      setError(err.response?.data?.error || err.message || 'Failed to delete party ledger');
    } finally {
      setLoading(false);
    }
  };

  const filteredParties = parties.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.station && p.station.toLowerCase().includes(search.toLowerCase())) ||
    (p.phone && p.phone.includes(search)) ||
    (p.mobile && p.mobile.includes(search)) ||
    (p.gstin && p.gstin.toLowerCase().includes(search.toLowerCase())) ||
    (p.drugLicenseNo && p.drugLicenseNo.toLowerCase().includes(search.toLowerCase()))
  );

  const totalSuppliers = parties.filter(p => p.type === 'supplier' || p.type === 'both').length;
  const totalCustomers = parties.filter(p => p.type === 'customer' || p.type === 'both').length;
  const totalCreditorsPayable = parties
    .filter(p => p.type === 'supplier')
    .reduce((sum, p) => sum + p.outstandingBalance, 0);
  const totalDebtorsReceivable = parties
    .filter(p => p.type === 'customer')
    .reduce((sum, p) => sum + p.outstandingBalance, 0);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
            <Users style={{ color: 'var(--brand-teal)' }} /> Ledger Master & Accounts
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.2rem 0 0 0', fontSize: '0.9rem' }}>
            Pharma party ledgers, Drug Licenses (20B/21B), GSTIN, and credit controls
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <button
            onClick={() => handleOpenCreateModal('supplier')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.2rem',
              background: '#0284c7',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            <Plus size={16} /> Add Sundry Creditor (Supplier)
          </button>
          <button
            onClick={() => handleOpenCreateModal('customer')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.2rem',
              background: 'var(--brand-teal)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            <Plus size={16} /> Add Sundry Debtor (Customer)
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            <span>Sundry Creditors (Suppliers)</span>
            <Truck size={18} style={{ color: '#0284c7' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '0.4rem' }}>
            {totalSuppliers}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '0.2rem', fontWeight: '600' }}>
            Payable: ₹{totalCreditorsPayable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            <span>Sundry Debtors (Customers)</span>
            <UserCheck size={18} style={{ color: 'var(--brand-teal)' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '0.4rem' }}>
            {totalCustomers}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#16a34a', marginTop: '0.2rem', fontWeight: '600' }}>
            Receivable: ₹{totalDebtorsReceivable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            <span>Drug License Active</span>
            <FileCheck2 size={18} style={{ color: '#10b981' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#10b981', marginTop: '0.4rem' }}>
            {parties.filter(p => p.drugLicenseNo).length}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Verified 20B / 21B Pharma Licences
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', padding: '0.8rem 1.2rem', borderRadius: '8px', color: 'var(--accent-red)', marginBottom: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Tabs & Search Filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '0.8rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.3rem' }}>
          <button
            onClick={() => setActiveTab('all')}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'all' ? 'var(--brand-teal)' : 'transparent',
              color: activeTab === 'all' ? '#fff' : 'var(--text-secondary)',
              fontWeight: activeTab === 'all' ? '600' : '400',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            All Ledgers ({parties.length})
          </button>
          <button
            onClick={() => setActiveTab('supplier')}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'supplier' ? 'var(--brand-teal)' : 'transparent',
              color: activeTab === 'supplier' ? '#fff' : 'var(--text-secondary)',
              fontWeight: activeTab === 'supplier' ? '600' : '400',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            Creditors / Suppliers ({totalSuppliers})
          </button>
          <button
            onClick={() => setActiveTab('customer')}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'customer' ? 'var(--brand-teal)' : 'transparent',
              color: activeTab === 'customer' ? '#fff' : 'var(--text-secondary)',
              fontWeight: activeTab === 'customer' ? '600' : '400',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            Debtors / Customers ({totalCustomers})
          </button>
        </div>

        <div style={{ position: 'relative', width: '320px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Search by name, station, GSTIN, DL..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.8rem 0.5rem 2rem',
              background: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.85rem'
            }}
          />
        </div>
      </div>

      {/* Ledgers Master Table */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading ledger accounts...
          </div>
        ) : filteredParties.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Users size={40} style={{ opacity: 0.3, marginBottom: '0.8rem' }} />
            <p style={{ margin: 0, fontWeight: '500' }}>No party ledgers found.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.9rem 1.2rem' }}>Ledger Name & Station</th>
                  <th style={{ padding: '0.9rem 1.2rem' }}>Account Group</th>
                  <th style={{ padding: '0.9rem 1.2rem' }}>Contact & Mobile</th>
                  <th style={{ padding: '0.9rem 1.2rem' }}>GSTIN / PAN</th>
                  <th style={{ padding: '0.9rem 1.2rem' }}>Drug License (DL)</th>
                  <th style={{ padding: '0.9rem 1.2rem', textAlign: 'right' }}>Balance (₹)</th>
                  <th style={{ padding: '0.9rem 1.2rem', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredParties.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.9rem 1.2rem' }}>
                      <div style={{ fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {p.name}
                        {p.isCash && (
                          <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(20, 184, 166, 0.15)', color: 'var(--brand-teal)' }}>
                            CASH
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {p.station ? `Station: ${p.station} ` : ''}{p.state ? `• ${p.state}` : ''}
                      </div>
                    </td>
                    <td style={{ padding: '0.9rem 1.2rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        background: p.type === 'supplier' ? 'rgba(2, 132, 199, 0.15)' : 'rgba(20, 184, 166, 0.15)',
                        color: p.type === 'supplier' ? '#0284c7' : 'var(--brand-teal)'
                      }}>
                        {p.accountGroup || (p.type === 'supplier' ? 'SUNDRY CREDITORS' : 'SUNDRY DEBTORS')}
                      </span>
                    </td>
                    <td style={{ padding: '0.9rem 1.2rem' }}>
                      <div style={{ color: 'var(--text-primary)' }}>{p.mobile || p.phone || '—'}</div>
                      {p.contactPerson && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Attn: {p.contactPerson}</div>
                      )}
                    </td>
                    <td style={{ padding: '0.9rem 1.2rem' }}>
                      <div style={{ fontFamily: 'monospace', fontWeight: '600', color: 'var(--text-primary)' }}>{p.gstin || '—'}</div>
                      {p.panNo && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>PAN: {p.panNo}</div>
                      )}
                    </td>
                    <td style={{ padding: '0.9rem 1.2rem' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{p.drugLicenseNo || '—'}</div>
                      {p.dlExpiryDate && (
                        <div style={{ fontSize: '0.75rem', color: new Date(p.dlExpiryDate) < new Date() ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                          Exp: {new Date(p.dlExpiryDate).toLocaleDateString('en-IN')}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.9rem 1.2rem', textAlign: 'right', fontWeight: '700', color: p.outstandingBalance > 0 ? (p.type === 'supplier' ? '#ef4444' : '#16a34a') : 'var(--text-secondary)' }}>
                      ₹{p.outstandingBalance.toFixed(2)}
                    </td>
                    <td style={{ padding: '0.9rem 1.2rem', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'center' }}>
                        <button
                          onClick={() => handleOpenEditModal(p)}
                          style={{
                            padding: '0.4rem 0.7rem',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontSize: '0.8rem'
                          }}
                        >
                          <Edit2 size={13} /> Modify
                        </button>
                        {!p.isCash && (
                          <button
                            onClick={() => handleDeleteParty(p)}
                            style={{
                              padding: '0.4rem 0.6rem',
                              background: 'rgba(239, 68, 68, 0.12)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              borderRadius: '6px',
                              color: '#ef4444',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              fontSize: '0.8rem'
                            }}
                            title="Delete Party Ledger"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pharma MODIFY LEDGER / CREATE LEDGER Modal (Styled directly after Photo 1) */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 120,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '900px',
            maxHeight: '92vh',
            overflowY: 'auto',
            padding: '1.5rem',
            position: 'relative'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.8rem', marginBottom: '1.2rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Building2 style={{ color: 'var(--brand-teal)' }} />
                  {editingPartyId ? 'MODIFY LEDGER (PARTY MASTER)' : 'CREATE NEW LEDGER'}
                </h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Statutory Pharma Accounts, Drug License & GST Compliant Ledger
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem 0.7rem', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Sub-Section Navigation Tabs */}
            <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.8rem', marginBottom: '1.2rem' }}>
              {(['BASIC', 'CONTACT', 'STATUTORY', 'TERMS'] as const).map(sec => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setActiveSection(sec)}
                  style={{
                    padding: '0.4rem 0.9rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeSection === sec ? 'var(--brand-teal)' : 'var(--bg-secondary)',
                    color: activeSection === sec ? '#fff' : 'var(--text-secondary)',
                    fontWeight: '600',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  {sec === 'BASIC' ? '1. General Info & Address' : sec === 'CONTACT' ? '2. Contact Persons' : sec === 'STATUTORY' ? '3. Licences & GST (DL 20B/21B)' : '4. Credit & Terms'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSaveParty}>
              {/* 1. General Info & Address */}
              {activeSection === 'BASIC' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Ledger Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. ADMARIS PHARMACEUTICALS PVT. LTD."
                        value={name}
                        onChange={e => setName(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '600' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Station / City
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. LUCKNOW"
                        value={station}
                        onChange={e => setStation(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Account Group
                      </label>
                      <select
                        value={accountGroup}
                        onChange={e => setAccountGroup(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '600' }}
                      >
                        <option value="SUNDRY_CREDITORS">SUNDRY CREDITORS (SUPPLIERS)</option>
                        <option value="SUNDRY_DEBTORS">SUNDRY DEBTORS (CUSTOMERS)</option>
                        <option value="BANK">BANK ACCOUNTS</option>
                        <option value="CASH">CASH-IN-HAND</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Balancing Method
                      </label>
                      <select
                        value={balancingMethod}
                        onChange={e => setBalancingMethod(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      >
                        <option value="BILL_BY_BILL">Bill by Bill</option>
                        <option value="ON_ACCOUNT">On Account</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Opening Balance (₹)
                      </label>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <input
                          type="number"
                          step="0.01"
                          value={openingBalance}
                          onChange={e => setOpeningBalance(e.target.value)}
                          style={{ flex: 1, padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'right' }}
                        />
                        <select
                          value={openingBalanceType}
                          onChange={e => setOpeningBalanceType(e.target.value as 'DR' | 'CR')}
                          style={{ width: '70px', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '700' }}
                        >
                          <option value="CR">Cr</option>
                          <option value="DR">Dr</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                      Mail To (Mailing Display Name)
                    </label>
                    <input
                      type="text"
                      placeholder="Display Name for Invoices & Statements"
                      value={mailTo}
                      onChange={e => setMailTo(e.target.value)}
                      style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                      Street Address
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Shop/Unit No., Street, Area..."
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>PIN Code</label>
                      <input
                        type="text"
                        placeholder="e.g. 226020"
                        value={pincode}
                        onChange={e => setPincode(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>State & GST Code</label>
                      <input
                        type="text"
                        placeholder="e.g. 09-UTTAR PRADESH"
                        value={`${stateCode ? `${stateCode}-` : ''}${state}`}
                        onChange={e => {
                          const val = e.target.value;
                          if (val.includes('-')) {
                            const [code, ...st] = val.split('-');
                            setStateCode(code.trim());
                            setState(st.join('-').trim());
                          } else {
                            setState(val);
                          }
                        }}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Country</label>
                      <input
                        type="text"
                        value={country}
                        onChange={e => setCountry(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Contact Persons */}
              {activeSection === 'CONTACT' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Contact Person Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Priyadarshi Sharma"
                        value={contactPerson}
                        onChange={e => setContactPerson(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Designation</label>
                      <input
                        type="text"
                        placeholder="e.g. Sales Manager / Proprietor"
                        value={designation}
                        onChange={e => setDesignation(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Mobile Number *</label>
                      <input
                        type="text"
                        placeholder="10-digit mobile"
                        value={mobile}
                        onChange={e => setMobile(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '600' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Office Phone</label>
                      <input
                        type="text"
                        placeholder="Landline / Ext"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Fax Number</label>
                      <input
                        type="text"
                        placeholder="Fax"
                        value={faxNo}
                        onChange={e => setFaxNo(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Email Address</label>
                      <input
                        type="email"
                        placeholder="e.g. sales@admarispharma.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Website / Portal</label>
                      <input
                        type="text"
                        placeholder="e.g. www.admarispharma.com"
                        value={website}
                        onChange={e => setWebsite(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Licences & GST (DL 20B/21B) */}
              {activeSection === 'STATUTORY' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Drug License No. (D.L. No. 20B, 21B)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. WLF20B2025UP010333, WLF21B2025UP0"
                        value={drugLicenseNo}
                        onChange={e => setDrugLicenseNo(e.target.value.toUpperCase())}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '600' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        D.L. Expiry Date
                      </label>
                      <input
                        type="date"
                        value={dlExpiryDate}
                        onChange={e => setDlExpiryDate(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        G.S.T.IN No.
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 09AANCA1902B1Z4"
                        value={gstin}
                        onChange={e => handleGstinChange(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '700', fontFamily: 'monospace' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        I.T. PAN No.
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. AANCA1902B"
                        value={panNo}
                        onChange={e => setPanNo(e.target.value.toUpperCase())}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontFamily: 'monospace' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Ledger Category
                      </label>
                      <select
                        value={ledgerCategory}
                        onChange={e => setLedgerCategory(e.target.value as any)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      >
                        <option value="REGISTERED">REGISTERED (Regular GST)</option>
                        <option value="COMPOSITE">COMPOSITION DEALER</option>
                        <option value="UNREGISTERED">UNREGISTERED</option>
                        <option value="CONSUMER">CONSUMER</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Food Licence No. (FSSAI)
                      </label>
                      <input
                        type="text"
                        placeholder="FSSAI License No."
                        value={fssaiNo}
                        onChange={e => setFssaiNo(e.target.value.toUpperCase())}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        FSSAI Expiry Date
                      </label>
                      <input
                        type="date"
                        value={fssaiExpiryDate}
                        onChange={e => setFssaiExpiryDate(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 4. Credit & Terms */}
              {activeSection === 'TERMS' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Credit Limit (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00 for no limit"
                        value={creditLimit}
                        onChange={e => setCreditLimit(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Narco / Sch-H Item Billing
                      </label>
                      <select
                        value={scheduleHNotice}
                        onChange={e => setScheduleHNotice(e.target.value as any)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      >
                        <option value="ALLOW_ALL">Allow All Items</option>
                        <option value="WARNING">Prompt Warning for Rx</option>
                        <option value="BLOCK">Block Narcotics / Sch-H</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Default Doctor Name [F1]
                      </label>
                      <input
                        type="text"
                        placeholder="Dr. Name"
                        value={defaultDoctorName}
                        onChange={e => setDefaultDoctorName(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Doctor Reg. No.
                      </label>
                      <input
                        type="text"
                        placeholder="Medical Council Reg No"
                        value={defaultDoctorRegNo}
                        onChange={e => setDefaultDoctorRegNo(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-secondary)', padding: '0.9rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-primary)' }}>Hold Payment / Billing Lock</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Block automated payments if GSTR-1 not filed or credit overdue</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={holdPayment}
                      onChange={e => setHoldPayment(e.target.checked)}
                      style={{ width: '18px', height: '18px', accentColor: 'var(--brand-teal)' }}
                    />
                  </div>
                </div>
              )}

              {/* Modal Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <div>
                  {editingPartyId && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetParty = parties.find(p => p.id === editingPartyId);
                        if (targetParty) handleDeleteParty(targetParty);
                      }}
                      style={{
                        padding: '0.65rem 1rem',
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '6px',
                        color: '#ef4444',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.85rem',
                        fontWeight: '600'
                      }}
                    >
                      <Trash2 size={15} /> Delete Ledger
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.8rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{ padding: '0.65rem 1.2rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      padding: '0.65rem 1.5rem',
                      background: 'var(--brand-teal)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: '700',
                      cursor: submitting ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {submitting ? 'Saving Ledger...' : editingPartyId ? 'Update Ledger' : 'Save Ledger Entry'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

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
  CreditCard
} from 'lucide-react';

interface Party {
  id: string;
  name: string;
  type: 'supplier' | 'customer' | 'both';
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  drugLicenseNo?: string | null;
  dlExpiryDate?: string | null;
  isCash: boolean;
  creditLimit: number;
  outstandingBalance: number;
  createdAt: string;
}

export default function Parties() {
  const { activeCompany } = useAuth();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'customer' | 'supplier'>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [partyName, setPartyName] = useState('');
  const [partyType, setPartyType] = useState<'customer' | 'supplier' | 'both'>('customer');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [drugLicenseNo, setDrugLicenseNo] = useState('');
  const [dlExpiryDate, setDlExpiryDate] = useState('');
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
      const res = await api.get<{ parties: Party[] }>(url, {
        companyId: activeCompany.id
      });
      setParties(res.parties || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load parties');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany) return;

    try {
      setSubmitting(true);
      setError(null);

      await api.post('/api/parties', {
        name: partyName,
        type: partyType,
        phone,
        email,
        address,
        gstin: gstin.toUpperCase(),
        drugLicenseNo: drugLicenseNo.toUpperCase(),
        dlExpiryDate: dlExpiryDate || null,
        creditLimit: parseFloat(creditLimit) || 0
      }, {
        companyId: activeCompany.id
      });

      setShowAddModal(false);
      // Reset
      setPartyName('');
      setPartyType('customer');
      setPhone('');
      setEmail('');
      setAddress('');
      setGstin('');
      setDrugLicenseNo('');
      setDlExpiryDate('');
      setCreditLimit('0');

      await fetchParties();
    } catch (err: any) {
      setError(err.message || 'Failed to create party');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredParties = parties.filter(p => {
    const s = search.toLowerCase();
    return p.name.toLowerCase().includes(s) ||
      (p.phone && p.phone.toLowerCase().includes(s)) ||
      (p.gstin && p.gstin.toLowerCase().includes(s)) ||
      (p.drugLicenseNo && p.drugLicenseNo.toLowerCase().includes(s));
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
            Parties & Stakeholders (Suppliers & Customers)
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Manage wholesalers, distributor accounts, retail chemist clients, Drug Licenses (20B/21B), and GSTIN records.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} />
          Add Party
        </button>
      </div>

      {/* Filter Tabs & Search */}
      <div style={{
        background: 'var(--surface)',
        padding: '12px 16px',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('all')}
            className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            All Contacts ({parties.length})
          </button>
          <button
            onClick={() => setActiveTab('customer')}
            className={`btn ${activeTab === 'customer' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            Customers / Retail Chemists
          </button>
          <button
            onClick={() => setActiveTab('supplier')}
            className={`btn ${activeTab === 'supplier' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            Suppliers / Wholesalers
          </button>
        </div>

        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by name, phone, GSTIN, DL..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
            style={{ paddingLeft: '32px', fontSize: '12px', height: '34px' }}
          />
        </div>
      </div>

      {error && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#b91c1c',
          padding: '10px 14px',
          borderRadius: '6px',
          fontSize: '13px'
        }}>
          {error}
        </div>
      )}

      {/* Parties Table */}
      <div style={{
        background: 'var(--surface)',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>PARTY NAME</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>TYPE</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>CONTACT</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>DRUG LICENSE (20B / 21B)</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>GSTIN</th>
              <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>BALANCE (₹)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading parties...
                </td>
              </tr>
            ) : filteredParties.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Users size={36} style={{ color: '#cbd5e1', marginBottom: '8px' }} />
                  <div>No parties found.</div>
                </td>
              </tr>
            ) : (
              filteredParties.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {p.name}
                      {p.isCash && (
                        <span style={{
                          background: '#f0fdf4',
                          color: '#15803d',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 700
                        }}>
                          SYSTEM CASH
                        </span>
                      )}
                    </div>
                    {p.address && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.address}</div>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      textTransform: 'uppercase',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: p.type === 'supplier' ? '#eff6ff' : '#f0fdf4',
                      color: p.type === 'supplier' ? '#1d4ed8' : '#15803d'
                    }}>
                      {p.type}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {p.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={12} /> {p.phone}</div>}
                    {p.email && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.email}</div>}
                    {!p.phone && !p.email && '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>
                    {p.drugLicenseNo ? (
                      <div>
                        <div>{p.drugLicenseNo}</div>
                        {p.dlExpiryDate && (
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            Exp: {new Date(p.dlExpiryDate).toLocaleDateString('en-IN')}
                          </div>
                        )}
                      </div>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>
                    {p.gstin || '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>
                    ₹{p.outstandingBalance.toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Add Party */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '540px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={18} color="var(--brand-primary)" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Add New Party</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateParty} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="label">Business / Party Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apollo Pharmacy / Cipla Distributor"
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    className="input"
                  />
                </div>
                <div className="form-group">
                  <label className="label">Party Type</label>
                  <select
                    value={partyType}
                    onChange={(e) => setPartyType(e.target.value as any)}
                    className="input"
                  >
                    <option value="customer">Customer (Retail Chemist)</option>
                    <option value="supplier">Supplier (Wholesaler)</option>
                    <option value="both">Both Supplier & Customer</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="label">Phone / Mobile</label>
                  <input
                    type="text"
                    placeholder="10-digit mobile"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="input"
                  />
                </div>
                <div className="form-group">
                  <label className="label">Email Address</label>
                  <input
                    type="email"
                    placeholder="account@pharmacy.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="label">Full Address / Location</label>
                <input
                  type="text"
                  placeholder="Shop No, Complex, Street, City, State, PIN"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="label">GSTIN (15 Digits)</label>
                  <input
                    type="text"
                    placeholder="e.g. 07AAAAA0000A1Z5"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    className="input"
                    style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
                  />
                </div>
                <div className="form-group">
                  <label className="label">Drug License No (20B/21B)</label>
                  <input
                    type="text"
                    placeholder="e.g. DL-20B/12345, 21B/67890"
                    value={drugLicenseNo}
                    onChange={(e) => setDrugLicenseNo(e.target.value.toUpperCase())}
                    className="input"
                    style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="label">DL Expiry Date</label>
                  <input
                    type="date"
                    value={dlExpiryDate}
                    onChange={(e) => setDlExpiryDate(e.target.value)}
                    className="input"
                  />
                </div>
                <div className="form-group">
                  <label className="label">Credit Limit (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    className="input"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary"
                >
                  {submitting ? 'Saving Party...' : 'Save Party'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

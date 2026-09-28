import React, { useState, useEffect } from 'react';
import { useAuth, Company } from '../context/AuthContext';
import { api } from '../api/client';
import Medicines from './Medicines';
import Batches from './Batches';
import Parties from './Parties';
import Purchases from './Purchases';
import {
  Building2,
  LayoutDashboard,
  Pill,
  Layers,
  Users,
  AlertTriangle,
  Package,
  TrendingUp,
  Boxes,
  ChevronDown,
  LogOut,
  Plus,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  ArrowRight,
  Truck
} from 'lucide-react';

interface InventorySummary {
  totalMedicines: number;
  activeBatches: number;
  totalUnitsInStock: number;
  stockValueAtCost: number;
  stockValueAtRetail: number;
  nearExpiryCount: number;
  expiredCount: number;
}

export default function Dashboard({ onSwitchCompany }: { onSwitchCompany: () => void }) {
  const { user, activeCompany, companies, selectCompany, logout } = useAuth();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'medicines' | 'batches' | 'parties' | 'purchases'>('dashboard');
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard Overview', icon: LayoutDashboard },
    { id: 'medicines', label: 'Medicine Catalog', icon: Pill },
    { id: 'batches', label: 'Batches & Expiry', icon: Layers },
    { id: 'purchases', label: 'Purchases & Inward', icon: Truck },
    { id: 'parties', label: 'Suppliers & Clients', icon: Users },
  ];

  useEffect(() => {
    if (activeCompany) {
      fetchSummary();
    }
  }, [activeCompany?.id]);

  const fetchSummary = async () => {
    if (!activeCompany) return;
    try {
      setLoadingSummary(true);
      const res = await api.get<InventorySummary>('/api/inventory/summary', {
        companyId: activeCompany.id
      });
      setSummary(res);
    } catch (err) {
      console.error('Failed to load inventory summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  };

  return (
    <div className="app-layout">
      {/* Left Sidebar (Rule C5) */}
      <aside className="sidebar">
        {/* Brand Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            backgroundColor: '#0284c7',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Pill size={18} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px', color: '#ffffff', letterSpacing: '-0.01em' }}>
              Trade Flow v2
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              Pharma B2B & Retail ERP
            </div>
          </div>
        </div>

        {/* Current Active Company Indicator */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b', backgroundColor: '#090d16' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600, letterSpacing: '0.04em' }}>
            Active Company
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
              {activeCompany?.name}
            </span>
            <span className={`badge badge-${activeCompany?.role}`} style={{ fontSize: '10px' }}>
              {activeCompany?.role.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav style={{ padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as any);
                  if (item.id === 'dashboard') fetchSummary();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: isActive ? '#1e293b' : 'transparent',
                  color: isActive ? '#38bdf8' : '#94a3b8',
                  fontSize: '12.5px',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = '#1e293b';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Info & Footer */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
              {user?.username}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              {companies.length} company access
            </div>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content Layout */}
      <div className="main-wrapper">
        {/* Top Navbar */}
        <header className="top-navbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* Company Switcher Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setSwitcherOpen(!switcherOpen)}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
              >
                <Building2 size={14} color="#0284c7" />
                <span>{activeCompany?.name}</span>
                <ChevronDown size={14} />
              </button>

              {switcherOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '6px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                  width: '260px',
                  zIndex: 100,
                  overflow: 'hidden'
                }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                    Switch Company
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {companies.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          selectCompany(c);
                          setSwitcherOpen(false);
                        }}
                        style={{
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          backgroundColor: c.id === activeCompany?.id ? '#f0f9ff' : '#ffffff',
                          borderBottom: '1px solid #f1f5f9'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = c.id === activeCompany?.id ? '#f0f9ff' : '#ffffff'}
                      >
                        <span style={{ fontSize: '12.5px', fontWeight: c.id === activeCompany?.id ? 600 : 400, color: '#0f172a' }}>
                          {c.name}
                        </span>
                        <span className={`badge badge-${c.role}`} style={{ fontSize: '10px' }}>
                          {c.role}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '8px 12px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                    <button
                      onClick={() => {
                        setSwitcherOpen(false);
                        onSwitchCompany();
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', fontSize: '11.5px' }}
                    >
                      <Plus size={13} /> Manage / Add Company
                    </button>
                  </div>
                </div>
              )}
            </div>

            <span className={`badge badge-${activeCompany?.role}`}>
              {activeCompany?.role.toUpperCase()}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              User: <strong style={{ color: '#0f172a' }}>{user?.username}</strong>
            </span>
          </div>
        </header>

        {/* Page Body */}
        <main className="page-content">
          {activeTab === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Top Row Metric Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px'
              }}>
                <div className="card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                        Total Medicines
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>
                        {loadingSummary ? '...' : summary?.totalMedicines || 0}
                      </div>
                    </div>
                    <div style={{ background: '#e0f2fe', padding: '8px', borderRadius: '6px', color: '#0284c7' }}>
                      <Pill size={20} />
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('medicines')}
                    style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '11.5px', fontWeight: 600, padding: 0, marginTop: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    View Catalog <ArrowRight size={12} />
                  </button>
                </div>

                <div className="card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                        Stock Value (at Cost)
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>
                        ₹{loadingSummary ? '...' : (summary?.stockValueAtCost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div style={{ background: '#ecfdf5', padding: '8px', borderRadius: '6px', color: '#10b981' }}>
                      <Boxes size={20} />
                    </div>
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '12px' }}>
                    {summary?.activeBatches || 0} active batches in stock
                  </div>
                </div>

                <div className="card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                        Stock Value (at MRP)
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>
                        ₹{loadingSummary ? '...' : (summary?.stockValueAtRetail || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div style={{ background: '#fef3c7', padding: '8px', borderRadius: '6px', color: '#d97706' }}>
                      <TrendingUp size={20} />
                    </div>
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '12px' }}>
                    Retail gross valuation
                  </div>
                </div>

                <div className="card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                        Near-Expiry Alerts
                      </div>
                      <div style={{
                        fontSize: '24px',
                        fontWeight: 700,
                        color: (summary?.nearExpiryCount || 0) > 0 ? 'var(--status-danger)' : 'var(--status-success)',
                        marginTop: '4px'
                      }}>
                        {loadingSummary ? '...' : summary?.nearExpiryCount || 0}
                      </div>
                    </div>
                    <div style={{
                      background: (summary?.nearExpiryCount || 0) > 0 ? '#fef2f2' : '#f0fdf4',
                      padding: '8px',
                      borderRadius: '6px',
                      color: (summary?.nearExpiryCount || 0) > 0 ? '#ef4444' : '#16a34a'
                    }}>
                      <Calendar size={20} />
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('batches')}
                    style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '11.5px', fontWeight: 600, padding: 0, marginTop: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    Check Expiry Alerts <ArrowRight size={12} />
                  </button>
                </div>
              </div>

              {/* Quick Actions & Navigation */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '16px'
              }}>
                <div
                  onClick={() => setActiveTab('medicines')}
                  className="card"
                  style={{ cursor: 'pointer', padding: '20px', transition: 'transform 0.15s', border: '1px solid #e2e8f0' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ background: '#e0f2fe', padding: '10px', borderRadius: '8px', color: '#0284c7' }}>
                      <Pill size={22} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Medicine Catalog</h3>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Add medicine SKUs, GST & conversion units</div>
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab('batches')}
                  className="card"
                  style={{ cursor: 'pointer', padding: '20px', transition: 'transform 0.15s', border: '1px solid #e2e8f0' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '8px', color: '#d97706' }}>
                      <Layers size={22} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Batches & Expiry Tracker</h3>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Track batch numbers, MRP/PTR & 90-day expiries</div>
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab('purchases')}
                  className="card"
                  style={{ cursor: 'pointer', padding: '20px', transition: 'transform 0.15s', border: '1px solid #e2e8f0' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '8px', color: '#1d4ed8' }}>
                      <Truck size={22} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Purchases & Inward</h3>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Enter distributor bills & inward batch lots</div>
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab('parties')}
                  className="card"
                  style={{ cursor: 'pointer', padding: '20px', transition: 'transform 0.15s', border: '1px solid #e2e8f0' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ background: '#f0fdf4', padding: '10px', borderRadius: '8px', color: '#16a34a' }}>
                      <Users size={22} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Suppliers & Customers</h3>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Manage GSTIN, Drug License 20B/21B & contacts</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'medicines' && <Medicines />}
          {activeTab === 'batches' && <Batches />}
          {activeTab === 'purchases' && <Purchases />}
          {activeTab === 'parties' && <Parties />}
        </main>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useAuth, Company } from '../context/AuthContext';
import { api } from '../api/client';
import Medicines from './Medicines';
import Batches from './Batches';
import Parties from './Parties';
import Purchases from './Purchases';
import Sales from './Sales';
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
  Truck,
  ShoppingCart,
  RotateCcw,
  Search,
  X,
  IndianRupee,
  Sparkles
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

interface MedicineItem {
  id: string;
  name: string;
  sku: string;
  genericName?: string | null;
  unit: string;
  conversionFactor: number;
  gstRate: number;
  batches: Array<{
    id: string;
    batchNumber: string;
    expiryDate: string;
    mrp: number;
    ptr: number;
    pts: number;
    currentStock: number;
  }>;
}

export default function Dashboard({ onSwitchCompany }: { onSwitchCompany: () => void }) {
  const { user, activeCompany, companies, selectCompany, logout } = useAuth();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sales' | 'purchases' | 'medicines' | 'batches' | 'parties'>('dashboard');
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Quick Patient Return State (Dashboard Shortcut)
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [catalogItems, setCatalogItems] = useState<MedicineItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [returnSearch, setReturnSearch] = useState('');
  const [selectedMed, setSelectedMed] = useState<MedicineItem | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [returnStrips, setReturnStrips] = useState<number>(1);
  const [returnLoose, setReturnLoose] = useState<number>(0);
  const [customRefund, setCustomRefund] = useState<string>('');
  const [patientName, setPatientName] = useState('');
  const [returnReason, setReturnReason] = useState('Patient medicine return (Unused strips)');
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [returnSuccessMsg, setReturnSuccessMsg] = useState<string | null>(null);
  const [returnError, setReturnError] = useState<string | null>(null);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard Overview', icon: LayoutDashboard },
    { id: 'sales', label: 'Sales & POS Terminal', icon: ShoppingCart },
    { id: 'purchases', label: 'Purchases & Inward', icon: Truck },
    { id: 'medicines', label: 'Medicine Catalog', icon: Pill },
    { id: 'batches', label: 'Batches & Expiry', icon: Layers },
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

  const handleOpenReturnModal = async () => {
    setShowReturnModal(true);
    setReturnError(null);
    setReturnSuccessMsg(null);
    setSelectedMed(null);
    setSelectedBatchId('');
    setReturnStrips(1);
    setReturnLoose(0);
    setCustomRefund('');
    setPatientName('');

    if (catalogItems.length === 0 && activeCompany) {
      try {
        setLoadingItems(true);
        const res = await api.get<{ items: MedicineItem[] }>('/api/items?limit=2000', {
          companyId: activeCompany.id
        });
        setCatalogItems(res.items || []);
      } catch (err) {
        console.error('Failed to load items for return:', err);
      } finally {
        setLoadingItems(false);
      }
    }
  };

  const handleSelectReturnMed = (med: MedicineItem) => {
    setSelectedMed(med);
    setReturnSearch('');
    if (med.batches && med.batches.length > 0) {
      setSelectedBatchId(med.batches[0].id);
      const batch = med.batches[0];
      const factor = med.conversionFactor || 1;
      const ratePerStrip = Number(batch.pts) || Number(batch.mrp);
      setCustomRefund(String(ratePerStrip * 1));
    } else {
      setSelectedBatchId('');
      setCustomRefund('0');
    }
  };

  const updateReturnAmounts = (strips: number, loose: number, batchId?: string) => {
    setReturnStrips(strips);
    setReturnLoose(loose);
    const bId = batchId || selectedBatchId;
    if (selectedMed && bId) {
      const batch = selectedMed.batches.find(b => b.id === bId);
      if (batch) {
        const factor = selectedMed.conversionFactor || 1;
        const ratePerStrip = Number(batch.pts) || Number(batch.mrp);
        const amount = (strips * ratePerStrip) + (loose * (ratePerStrip / factor));
        setCustomRefund(String(Math.round(amount * 100) / 100));
      }
    }
  };

  const handleConfirmReturn = async () => {
    if (!activeCompany || !selectedMed || !selectedBatchId) {
      setReturnError('Please select a medicine and batch to return.');
      return;
    }

    const factor = selectedMed.conversionFactor || 1;
    const totalUnits = (returnStrips * factor) + returnLoose;
    if (totalUnits <= 0) {
      setReturnError('Please enter at least 1 strip or loose tablet.');
      return;
    }

    try {
      setSubmittingReturn(true);
      setReturnError(null);

      const res = await api.post<{
        success: boolean;
        message: string;
        medicineName: string;
        batchNumber: string;
        unitsAdded: number;
        newStock: number;
        refundAmount: number;
      }>('/api/inventory/quick-return', {
        batchId: selectedBatchId,
        strips: returnStrips,
        looseQty: returnLoose,
        refundAmount: customRefund !== '' ? parseFloat(customRefund) : undefined,
        patientName: patientName.trim() || undefined,
        reason: returnReason.trim() || undefined
      }, {
        companyId: activeCompany.id
      });

      setReturnSuccessMsg(`✓ ${res.message}! Live Stock: ${res.newStock} units. Refund to Patient: ₹${res.refundAmount.toFixed(2)}.`);
      
      // Update local item batch stock
      setCatalogItems(prev => prev.map(item => {
        if (item.id === selectedMed.id) {
          return {
            ...item,
            batches: item.batches.map(b => b.id === selectedBatchId ? { ...b, currentStock: res.newStock } : b)
          };
        }
        return item;
      }));

      // Refresh Dashboard metrics
      fetchSummary();

      setTimeout(() => {
        setSelectedMed(null);
        setSelectedBatchId('');
        setReturnStrips(1);
        setReturnLoose(0);
        setCustomRefund('');
        setPatientName('');
      }, 1500);

    } catch (err: any) {
      console.error('Failed to submit quick return:', err);
      setReturnError(err.response?.data?.error || err.message || 'Failed to process return');
    } finally {
      setSubmittingReturn(false);
    }
  };

  const activeReturnBatch = selectedMed?.batches.find(b => b.id === selectedBatchId);
  const factor = selectedMed?.conversionFactor || 1;
  const returnUnitsTotal = (returnStrips * factor) + returnLoose;
  const projectedStock = activeReturnBatch ? activeReturnBatch.currentStock + returnUnitsTotal : 0;

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

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Quick Patient Return Shortcut Button */}
            <button
              onClick={handleOpenReturnModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 13px',
                background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '7px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(13, 148, 136, 0.35)',
                transition: 'all 0.15s ease'
              }}
              title="Quick Patient Return (Direct Stock Inward & Cash Refund)"
            >
              <RotateCcw size={14} />
              <span>↩️ Quick Return</span>
            </button>

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
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px'
              }}>
                {/* 1-Click Patient Medicine Return Card */}
                <div
                  onClick={handleOpenReturnModal}
                  className="card"
                  style={{
                    cursor: 'pointer',
                    padding: '20px',
                    transition: 'all 0.15s ease',
                    border: '2px solid #0d9488',
                    background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.1) 0%, rgba(13, 148, 136, 0.2) 100%)',
                    boxShadow: '0 4px 12px rgba(13, 148, 136, 0.12)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ background: '#0f766e', padding: '10px', borderRadius: '8px', color: '#ffffff' }}>
                      <RotateCcw size={22} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f766e' }}>↩️ Patient Medicine Return</h3>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>1-Click stock credit & instant cash refund</div>
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab('sales')}
                  className="card"
                  style={{ cursor: 'pointer', padding: '20px', transition: 'transform 0.15s', border: '1px solid #e2e8f0', background: 'linear-gradient(135deg, rgba(20, 184, 166, 0.05) 0%, rgba(20, 184, 166, 0.15) 100%)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ background: '#ccfbf1', padding: '10px', borderRadius: '8px', color: '#0f766e' }}>
                      <ShoppingCart size={22} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f766e' }}>Sales & POS Terminal</h3>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Fast billing & FEFO batch allocation</div>
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
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Batches & Expiry</h3>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Track batch numbers, MRP/PTR & expiries</div>
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

          {activeTab === 'sales' && <Sales />}
          {activeTab === 'purchases' && <Purchases />}
          {activeTab === 'medicines' && <Medicines />}
          {activeTab === 'batches' && <Batches />}
          {activeTab === 'parties' && <Parties />}
        </main>
      </div>

      {/* Quick Patient Medicine Return Modal */}
      {showReturnModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 200,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            color: 'var(--text-primary, #0f172a)',
            width: '100%',
            maxWidth: '620px',
            maxHeight: '92vh',
            borderRadius: '14px',
            overflowY: 'auto',
            padding: '1.6rem',
            position: 'relative',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            border: '1px solid var(--border-color, #e2e8f0)'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.2rem', borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#0f766e', color: '#fff', padding: '8px', borderRadius: '8px' }}>
                  <RotateCcw size={20} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                    Patient Medicine Return
                  </h2>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
                    1-Click stock inward credit & refund calculation without past bill receipt
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowReturnModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary, #64748b)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Success Notification */}
            {returnSuccessMsg && (
              <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '0.8rem 1rem', borderRadius: '8px', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', fontWeight: 600 }}>
                <CheckCircle2 size={18} color="#10b981" />
                <span>{returnSuccessMsg}</span>
              </div>
            )}

            {/* Error Notification */}
            {returnError && (
              <div style={{ background: '#fef2f2', border: '1px solid #ef4444', color: '#991b1b', padding: '0.8rem 1rem', borderRadius: '8px', marginBottom: '1.2rem', fontSize: '0.85rem' }}>
                ⚠️ {returnError}
              </div>
            )}

            {/* Step 1: Search & Pick Medicine */}
            <div style={{ marginBottom: '1.2rem', position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary, #475569)', marginBottom: '0.4rem' }}>
                1. SEARCH RETURNED MEDICINE :
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#0f766e', pointerEvents: 'none' }}>
                  <Search size={16} />
                </span>
                <input
                  type="text"
                  placeholder="Type medicine name or generic name..."
                  value={selectedMed ? selectedMed.name : returnSearch}
                  onChange={e => {
                    setReturnSearch(e.target.value);
                    if (selectedMed) setSelectedMed(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '0.65rem 1rem 0.65rem 2.4rem',
                    background: 'var(--bg-secondary, #f8fafc)',
                    border: '1.5px solid var(--border-color, #cbd5e1)',
                    borderRadius: '8px',
                    color: 'var(--text-primary, #0f172a)',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    outline: 'none'
                  }}
                />
                {selectedMed && (
                  <button
                    onClick={() => {
                      setSelectedMed(null);
                      setReturnSearch('');
                      setSelectedBatchId('');
                    }}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Autocomplete dropdown */}
              {!selectedMed && returnSearch.trim().length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  marginTop: '4px',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  zIndex: 80,
                  boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
                }}>
                  {catalogItems
                    .filter(i => i.name.toLowerCase().includes(returnSearch.toLowerCase()) || (i.genericName && i.genericName.toLowerCase().includes(returnSearch.toLowerCase())))
                    .slice(0, 15)
                    .map(med => (
                      <div
                        key={med.id}
                        onClick={() => handleSelectReturnMed(med)}
                        style={{
                          padding: '0.7rem 1rem',
                          borderBottom: '1px solid #f1f5f9',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0fdfa'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.88rem' }}>{med.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {med.genericName ? `${med.genericName} • ` : ''}Pack: {med.conversionFactor > 1 ? `${med.conversionFactor}T` : med.unit}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f766e' }}>
                          {med.batches?.length || 0} batches
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Step 2: Batch Selection & Live Details */}
            {selectedMed && (
              <div style={{ background: 'var(--bg-secondary, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '10px', padding: '1rem', marginBottom: '1.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase' }}>
                    2. SELECT BATCH (PRINTED ON STRIP) :
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                    Pack: {selectedMed.conversionFactor > 1 ? `1 Strip = ${selectedMed.conversionFactor} Tabs` : selectedMed.unit}
                  </span>
                </div>

                {selectedMed.batches && selectedMed.batches.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {selectedMed.batches.map(b => {
                      const isSelected = selectedBatchId === b.id;
                      return (
                        <div
                          key={b.id}
                          onClick={() => {
                            setSelectedBatchId(b.id);
                            updateReturnAmounts(returnStrips, returnLoose, b.id);
                          }}
                          style={{
                            padding: '0.65rem 0.8rem',
                            border: isSelected ? '2px solid #0f766e' : '1px solid #cbd5e1',
                            borderRadius: '7px',
                            background: isSelected ? 'rgba(15, 118, 110, 0.08)' : '#ffffff',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.83rem'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="radio"
                              name="return_batch"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedBatchId(b.id);
                                updateReturnAmounts(returnStrips, returnLoose, b.id);
                              }}
                              style={{ accentColor: '#0f766e', cursor: 'pointer' }}
                            />
                            <div>
                              <strong style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#0f172a' }}>{b.batchNumber}</strong>
                              <span style={{ color: '#64748b', marginLeft: '8px', fontSize: '0.75rem' }}>
                                Exp: {new Date(b.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                              </span>
                            </div>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <span style={{ color: '#10b981', fontWeight: 700 }}>{b.currentStock} units in stock</span>
                            <span style={{ color: '#64748b', marginLeft: '10px', fontSize: '0.78rem' }}>MRP: ₹{Number(b.mrp).toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>No batch lots found for this medicine.</div>
                )}
              </div>
            )}

            {/* Step 3: Quantities, Stock Impact & Refund Calculation */}
            {selectedMed && activeReturnBatch && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary, #475569)', marginBottom: '0.3rem' }}>
                      RETURN STRIPS (Full Packs) :
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={returnStrips}
                      onFocus={e => e.target.select()}
                      onChange={e => updateReturnAmounts(Math.max(0, parseInt(e.target.value) || 0), returnLoose)}
                      style={{
                        width: '100%',
                        padding: '0.6rem',
                        background: 'var(--bg-secondary, #f8fafc)',
                        border: '1.5px solid var(--border-color, #cbd5e1)',
                        borderRadius: '7px',
                        color: 'var(--text-primary, #0f172a)',
                        fontWeight: 800,
                        fontSize: '1rem',
                        textAlign: 'center'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary, #475569)', marginBottom: '0.3rem' }}>
                      RETURN LOOSE TABLETS (Units) :
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={returnLoose}
                      onFocus={e => e.target.select()}
                      onChange={e => updateReturnAmounts(returnStrips, Math.max(0, parseInt(e.target.value) || 0))}
                      style={{
                        width: '100%',
                        padding: '0.6rem',
                        background: 'var(--bg-secondary, #f8fafc)',
                        border: '1.5px solid var(--border-color, #cbd5e1)',
                        borderRadius: '7px',
                        color: 'var(--text-primary, #0f172a)',
                        fontWeight: 800,
                        fontSize: '1rem',
                        textAlign: 'center'
                      }}
                    />
                  </div>
                </div>

                {/* Stock Preview Banner */}
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: '#166534', fontWeight: 600 }}>Stock Credit: </span>
                    <strong style={{ color: '#15803d' }}>+{returnUnitsTotal} units</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Batch Stock: </span>
                    <span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>{activeReturnBatch.currentStock}</span>
                    <span style={{ fontWeight: 800, color: '#15803d', marginLeft: '6px' }}>➔ {projectedStock} units</span>
                  </div>
                </div>

                {/* Refund & Patient Details */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem', marginBottom: '1.2rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#0f766e', marginBottom: '0.3rem' }}>
                      CASH REFUND TO PATIENT (₹) :
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={customRefund}
                      onFocus={e => e.target.select()}
                      onChange={e => setCustomRefund(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.6rem',
                        background: '#ffffff',
                        border: '2px solid #0f766e',
                        borderRadius: '7px',
                        color: '#0f766e',
                        fontWeight: 800,
                        fontSize: '1.1rem',
                        textAlign: 'right'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary, #475569)', marginBottom: '0.3rem' }}>
                      PATIENT NAME (Optional) :
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Cash Walk-in"
                      value={patientName}
                      onChange={e => setPatientName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.6rem',
                        background: 'var(--bg-secondary, #f8fafc)',
                        border: '1.5px solid var(--border-color, #cbd5e1)',
                        borderRadius: '7px',
                        color: 'var(--text-primary, #0f172a)',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                </div>

                {/* Confirm Action Buttons */}
                <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowReturnModal(false)}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      color: '#475569',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmReturn}
                    disabled={submittingReturn || returnUnitsTotal <= 0}
                    style={{
                      flex: 2,
                      padding: '0.75rem',
                      background: returnUnitsTotal <= 0 ? '#94a3b8' : 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.95rem',
                      cursor: (submittingReturn || returnUnitsTotal <= 0) ? 'not-allowed' : 'pointer',
                      boxShadow: returnUnitsTotal > 0 ? '0 4px 12px rgba(15, 118, 110, 0.35)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <CheckCircle2 size={18} />
                    {submittingReturn ? 'Crediting Stock...' : `Confirm Return & Credit (+${returnUnitsTotal} Units)`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

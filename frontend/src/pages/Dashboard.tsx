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

    if (activeCompany) {
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

  const handleSelectReturnMed = async (initialMed: MedicineItem) => {
    setSelectedMed(initialMed);
    setReturnSearch('');
    
    let med = initialMed;
    // Fetch live batch stocks directly from backend to avoid any stale cached stock
    try {
      if (activeCompany) {
        const detailRes = await api.get<{ item: MedicineItem }>(`/api/items/${initialMed.id}`, {
          companyId: activeCompany.id
        });
        if (detailRes.item) {
          med = detailRes.item;
          setSelectedMed(detailRes.item);
        }
      }
    } catch (e) {
      console.warn('Using cached med batches:', e);
    }

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

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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

            {/* User Pill */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: '7px',
              fontSize: '12px'
            }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#0284c7', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800 }}>
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{user?.username}</span>
            </div>

            {/* Prominent Top-Right Logout Button */}
            <button
              onClick={logout}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                background: '#fee2e2',
                color: '#dc2626',
                border: '1px solid #fca5a5',
                borderRadius: '7px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#fecaca'}
              onMouseLeave={e => e.currentTarget.style.background = '#fee2e2'}
              title="Log out of system"
            >
              <LogOut size={13} />
              <span>Log Out</span>
            </button>
          </div>
        </header>

        {/* Page Body */}
        <main className="page-content">
          {activeTab === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              
              {/* Premium Welcome Hero Banner */}
              <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f766e 100%)',
                color: '#ffffff',
                borderRadius: '14px',
                padding: '24px 28px',
                boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.3)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{ zIndex: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      🏥 Pharmacy Command Center
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>•</span>
                    <span style={{ color: '#cbd5e1', fontSize: '12px', fontWeight: 500 }}>
                      {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
                    {activeCompany?.name}
                  </h1>
                  <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                    Logged in as <strong style={{ color: '#38bdf8' }}>{user?.username}</strong> ({activeCompany?.role.toUpperCase()}) • Fast POS, Smart FEFO Inventory & Returns
                  </p>

                  {/* Active Store Ticker Chips */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
                    <span style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', padding: '3px 9px', borderRadius: '6px', fontSize: '11.5px', color: '#86efac', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      🟢 Live Inventory Sync
                    </span>
                    <span style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', padding: '3px 9px', borderRadius: '6px', fontSize: '11.5px', color: '#fef08a', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      🎁 10% Scheme Active (&gt; ₹500)
                    </span>
                    <span style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', padding: '3px 9px', borderRadius: '6px', fontSize: '11.5px', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      👨‍⚕️ Default: Dr. Priyadarshi Srivastava (UPMC 59048)
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', zIndex: 2, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setActiveTab('sales')}
                    style={{
                      background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 18px',
                      fontSize: '13.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 14px rgba(20, 184, 166, 0.4)',
                      transition: 'transform 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    <ShoppingCart size={17} />
                    <span>⚡ Launch POS Billing [F2]</span>
                  </button>
                  <button
                    onClick={handleOpenReturnModal}
                    style={{
                      background: 'rgba(255, 255, 255, 0.12)',
                      color: '#ffffff',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      backdropFilter: 'blur(4px)',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
                  >
                    <RotateCcw size={15} />
                    <span>↩️ Quick Return</span>
                  </button>
                </div>
              </div>

              {/* Top Row Metric Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px'
              }}>
                {/* Total Medicines */}
                <div className="card" style={{
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid #e0f2fe',
                  background: 'linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%)',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.05)',
                  position: 'relative'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#0284c7', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Medicines Catalog
                      </div>
                      <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                        {loadingSummary ? '...' : summary?.totalMedicines || 0}
                      </div>
                    </div>
                    <div style={{ background: '#0284c7', padding: '10px', borderRadius: '10px', color: '#ffffff', boxShadow: '0 4px 10px rgba(2, 132, 199, 0.3)' }}>
                      <Pill size={22} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>Active formulations & SKUs</span>
                    <button
                      onClick={() => setActiveTab('medicines')}
                      style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '11.5px', fontWeight: 700, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                    >
                      View All <ArrowRight size={12} />
                    </button>
                  </div>
                </div>

                {/* Stock Value (Cost) */}
                <div className="card" style={{
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid #dcfce7',
                  background: 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.05)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Stock Valuation (Cost)
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                        ₹{loadingSummary ? '...' : (summary?.stockValueAtCost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div style={{ background: '#10b981', padding: '10px', borderRadius: '10px', color: '#ffffff', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)' }}>
                      <Boxes size={22} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '11.5px', color: '#166534', fontWeight: 700 }}>
                      ✓ {summary?.activeBatches || 0} active batch lots
                    </span>
                    <button
                      onClick={() => setActiveTab('batches')}
                      style={{ background: 'none', border: 'none', color: '#16a34a', fontSize: '11.5px', fontWeight: 700, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                    >
                      Batches <ArrowRight size={12} />
                    </button>
                  </div>
                </div>

                {/* Stock Value (MRP) */}
                <div className="card" style={{
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid #fef3c7',
                  background: 'linear-gradient(180deg, #ffffff 0%, #fffbeb 100%)',
                  boxShadow: '0 4px 12px rgba(217, 119, 6, 0.05)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#d97706', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Retail Stock Value (MRP)
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                        ₹{loadingSummary ? '...' : (summary?.stockValueAtRetail || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div style={{ background: '#d97706', padding: '10px', borderRadius: '10px', color: '#ffffff', boxShadow: '0 4px 10px rgba(217, 119, 6, 0.3)' }}>
                      <TrendingUp size={22} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '11.5px', color: '#b45309', fontWeight: 600 }}>Gross Realizable Retail</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Tax Inclusive</span>
                  </div>
                </div>

                {/* Expiry Alerts */}
                <div className="card" style={{
                  padding: '20px',
                  borderRadius: '12px',
                  border: (summary?.nearExpiryCount || 0) > 0 ? '1px solid #fecaca' : '1px solid #dcfce7',
                  background: (summary?.nearExpiryCount || 0) > 0 ? 'linear-gradient(180deg, #ffffff 0%, #fef2f2 100%)' : 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.05)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: (summary?.nearExpiryCount || 0) > 0 ? '#dc2626' : '#16a34a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Near-Expiry & Expiry Alerts
                      </div>
                      <div style={{
                        fontSize: '28px',
                        fontWeight: 800,
                        color: (summary?.nearExpiryCount || 0) > 0 ? '#dc2626' : '#16a34a',
                        marginTop: '4px'
                      }}>
                        {loadingSummary ? '...' : summary?.nearExpiryCount || 0}
                      </div>
                    </div>
                    <div style={{
                      background: (summary?.nearExpiryCount || 0) > 0 ? '#dc2626' : '#16a34a',
                      padding: '10px',
                      borderRadius: '10px',
                      color: '#ffffff',
                      boxShadow: (summary?.nearExpiryCount || 0) > 0 ? '0 4px 10px rgba(220, 38, 38, 0.3)' : '0 4px 10px rgba(22, 163, 74, 0.3)'
                    }}>
                      <Calendar size={22} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '11.5px', color: (summary?.nearExpiryCount || 0) > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                      {(summary?.nearExpiryCount || 0) > 0 ? '⚠️ Action needed in 90 days' : '✓ All batches in safe period'}
                    </span>
                    <button
                      onClick={() => setActiveTab('batches')}
                      style={{ background: 'none', border: 'none', color: (summary?.nearExpiryCount || 0) > 0 ? '#dc2626' : '#16a34a', fontSize: '11.5px', fontWeight: 700, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                    >
                      Inspect <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Operations Command Hub Grid */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    ⚡ Operations & Workflows
                  </h2>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Click any module for instant access</span>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: '16px'
                }}>
                  {/* 1. Quick Return */}
                  <div
                    onClick={handleOpenReturnModal}
                    className="card"
                    style={{
                      cursor: 'pointer',
                      padding: '20px',
                      borderRadius: '12px',
                      border: '2px solid #0d9488',
                      background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.08) 0%, rgba(13, 148, 136, 0.2) 100%)',
                      boxShadow: '0 4px 14px rgba(13, 148, 136, 0.15)',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-3px)';
                      e.currentTarget.style.boxShadow = '0 8px 20px rgba(13, 148, 136, 0.25)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 14px rgba(13, 148, 136, 0.15)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ background: '#0f766e', padding: '12px', borderRadius: '10px', color: '#ffffff', boxShadow: '0 4px 10px rgba(15, 118, 110, 0.3)' }}>
                        <RotateCcw size={24} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f766e' }}>Patient Return</h3>
                          <span style={{ background: '#0f766e', color: '#fff', fontSize: '9.5px', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>1-CLICK</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '3px' }}>Instant stock credit & refund (No bill needed)</div>
                      </div>
                    </div>
                  </div>

                  {/* 2. Sales / POS Billing */}
                  <div
                    onClick={() => setActiveTab('sales')}
                    className="card"
                    style={{
                      cursor: 'pointer',
                      padding: '20px',
                      borderRadius: '12px',
                      border: '1px solid #ccfbf1',
                      background: 'linear-gradient(135deg, #ffffff 0%, #f0fdfa 100%)',
                      boxShadow: '0 4px 12px rgba(20, 184, 166, 0.08)',
                      transition: 'transform 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ background: '#0d9488', padding: '12px', borderRadius: '10px', color: '#ffffff', boxShadow: '0 4px 10px rgba(13, 148, 136, 0.3)' }}>
                        <ShoppingCart size={24} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Sales & POS Billing</h3>
                          <span style={{ background: '#dcfce7', color: '#166534', fontSize: '9.5px', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>10% SCHEME</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>Non-GST & GST retail bills, barcode scan [F2]</div>
                      </div>
                    </div>
                  </div>

                  {/* 3. Purchases & Inward */}
                  <div
                    onClick={() => setActiveTab('purchases')}
                    className="card"
                    style={{
                      cursor: 'pointer',
                      padding: '20px',
                      borderRadius: '12px',
                      border: '1px solid #e0e7ff',
                      background: 'linear-gradient(135deg, #ffffff 0%, #eef2ff 100%)',
                      boxShadow: '0 4px 12px rgba(79, 70, 229, 0.05)',
                      transition: 'transform 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ background: '#4f46e5', padding: '12px', borderRadius: '10px', color: '#ffffff', boxShadow: '0 4px 10px rgba(79, 70, 229, 0.3)' }}>
                        <Truck size={24} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Purchases & Inward</h3>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>Distributor bills, lot entries & PTR calculation</div>
                      </div>
                    </div>
                  </div>

                  {/* 4. Medicine Catalog */}
                  <div
                    onClick={() => setActiveTab('medicines')}
                    className="card"
                    style={{
                      cursor: 'pointer',
                      padding: '20px',
                      borderRadius: '12px',
                      border: '1px solid #e0f2fe',
                      background: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)',
                      boxShadow: '0 4px 12px rgba(2, 132, 199, 0.05)',
                      transition: 'transform 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ background: '#0284c7', padding: '12px', borderRadius: '10px', color: '#ffffff', boxShadow: '0 4px 10px rgba(2, 132, 199, 0.3)' }}>
                        <Pill size={24} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Medicine Catalog</h3>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>Add formulations, strip conversions & HSN codes</div>
                      </div>
                    </div>
                  </div>

                  {/* 5. Batches & Expiry */}
                  <div
                    onClick={() => setActiveTab('batches')}
                    className="card"
                    style={{
                      cursor: 'pointer',
                      padding: '20px',
                      borderRadius: '12px',
                      border: '1px solid #fef3c7',
                      background: 'linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)',
                      boxShadow: '0 4px 12px rgba(217, 119, 6, 0.05)',
                      transition: 'transform 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ background: '#d97706', padding: '12px', borderRadius: '10px', color: '#ffffff', boxShadow: '0 4px 10px rgba(217, 119, 6, 0.3)' }}>
                        <Layers size={24} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Batches & Expiry</h3>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>FEFO lot tracking, MRP/PTR & near-expiry list</div>
                      </div>
                    </div>
                  </div>

                  {/* 6. Parties & Ledger */}
                  <div
                    onClick={() => setActiveTab('parties')}
                    className="card"
                    style={{
                      cursor: 'pointer',
                      padding: '20px',
                      borderRadius: '12px',
                      border: '1px solid #dcfce7',
                      background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
                      boxShadow: '0 4px 12px rgba(22, 163, 74, 0.05)',
                      transition: 'transform 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ background: '#16a34a', padding: '12px', borderRadius: '10px', color: '#ffffff', boxShadow: '0 4px 10px rgba(22, 163, 74, 0.3)' }}>
                        <Users size={24} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Suppliers & Customers</h3>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>Distributors, Drug Licenses (20B/21B) & balances</div>
                      </div>
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
            <div style={{ marginBottom: '1.2rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary, #475569)', marginBottom: '0.4rem' }}>
                1. SEARCH RETURNED MEDICINE :
              </label>
              
              {!selectedMed ? (
                <div>
                  <div style={{ position: 'relative', marginBottom: returnSearch.trim().length > 0 ? '0.6rem' : '0' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#0f766e', pointerEvents: 'none' }}>
                      <Search size={17} />
                    </span>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Type brand name (e.g. AURDEP, PAN D, AUGMENTIN)..."
                      value={returnSearch}
                      onChange={e => setReturnSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem 0.75rem 2.5rem',
                        background: 'var(--bg-secondary, #f8fafc)',
                        border: '2px solid #0f766e',
                        borderRadius: '9px',
                        color: 'var(--text-primary, #0f172a)',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        outline: 'none',
                        boxShadow: '0 0 0 3px rgba(15, 118, 110, 0.15)'
                      }}
                    />
                    {returnSearch.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setReturnSearch('')}
                        style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: '#e2e8f0', border: 'none', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Professional Search Results List */}
                  {returnSearch.trim().length > 0 && (
                    <div style={{
                      background: '#ffffff',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '10px',
                      maxHeight: '260px',
                      overflowY: 'auto',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.08)'
                    }}>
                      {loadingItems ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                          Fetching medicine catalog...
                        </div>
                      ) : (
                        (() => {
                          const matches = catalogItems
                            .filter(i => 
                              i.name.toLowerCase().includes(returnSearch.toLowerCase()) ||
                              (i.genericName && i.genericName.toLowerCase().includes(returnSearch.toLowerCase())) ||
                              (i.sku && i.sku.toLowerCase().includes(returnSearch.toLowerCase()))
                            )
                            .slice(0, 25);

                          if (matches.length === 0) {
                            return (
                              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                                🔍 No medicines found matching "<strong>{returnSearch}</strong>"
                              </div>
                            );
                          }

                          return (
                            <div>
                              <div style={{ padding: '0.4rem 0.8rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {matches.length} matching medicines found (Click to select)
                              </div>
                              {matches.map(med => {
                                const totalStock = med.batches?.reduce((sum, b) => sum + b.currentStock, 0) || 0;
                                const factor = med.conversionFactor || 1;
                                const stripsCount = Math.floor(totalStock / factor);
                                return (
                                  <div
                                    key={med.id}
                                    onClick={() => handleSelectReturnMed(med)}
                                    style={{
                                      padding: '0.75rem 1rem',
                                      borderBottom: '1px solid #f1f5f9',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      transition: 'background 0.15s ease'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0fdfa'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                  >
                                    <div>
                                      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.92rem' }}>
                                        {med.name}
                                      </div>
                                      <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        {med.genericName && (
                                          <span style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', color: '#475569' }}>
                                            {med.genericName}
                                          </span>
                                        )}
                                        <span>Pack: 1 Strip = {factor > 1 ? `${factor} Tabs` : med.unit}</span>
                                      </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f766e' }}>
                                        {totalStock} units ({stripsCount} Strips)
                                      </div>
                                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                        {med.batches?.length || 0} active {med.batches?.length === 1 ? 'batch' : 'batches'}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Selected Medicine Badge */
                <div style={{
                  background: '#f0fdfa',
                  border: '1.5px solid #0f766e',
                  borderRadius: '9px',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ background: '#0f766e', color: '#fff', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800 }}>
                      ✓
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>
                        {selectedMed.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {selectedMed.genericName ? `${selectedMed.genericName} • ` : ''}Pack: 1 Strip = {selectedMed.conversionFactor > 1 ? `${selectedMed.conversionFactor} Tabs` : selectedMed.unit}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMed(null);
                      setReturnSearch('');
                      setSelectedBatchId('');
                    }}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: '#0f766e',
                      cursor: 'pointer'
                    }}
                  >
                    Change Medicine
                  </button>
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
                            <span style={{ color: '#10b981', fontWeight: 700 }}>
                              {b.currentStock} units ({Math.floor(b.currentStock / (selectedMed.conversionFactor || 1))} Strips{b.currentStock % (selectedMed.conversionFactor || 1) > 0 ? ` + ${b.currentStock % (selectedMed.conversionFactor || 1)} tabs` : ''})
                            </span>
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
                    <strong style={{ color: '#15803d' }}>
                      +{returnUnitsTotal} units ({returnStrips > 0 ? `${returnStrips} Strip${returnStrips > 1 ? 's' : ''}` : ''}{returnStrips > 0 && returnLoose > 0 ? ' + ' : ''}{returnLoose > 0 ? `${returnLoose} tabs` : ''})
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Batch Stock: </span>
                    <span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>
                      {activeReturnBatch.currentStock} ({Math.floor(activeReturnBatch.currentStock / factor)} Strips)
                    </span>
                    <span style={{ fontWeight: 800, color: '#15803d', marginLeft: '6px' }}>
                      ➔ {projectedStock} ({Math.floor(projectedStock / factor)} Strips)
                    </span>
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

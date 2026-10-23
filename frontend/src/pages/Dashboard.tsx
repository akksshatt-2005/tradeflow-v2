import React, { useState, useEffect } from 'react';
import { useAuth, Company } from '../context/AuthContext';
import { api } from '../api/client';
import Medicines from './Medicines';
import Batches from './Batches';
import Parties from './Parties';
import Purchases from './Purchases';
import Sales from './Sales';
import CreditNotes from './CreditNotes';
import Settlements from './Settlements';
import MultiPatientReturnModal from '../components/MultiPatientReturnModal';
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
  ChevronLeft,
  ChevronRight,
  LogOut,
  Plus,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  ArrowRight,
  Truck,
  ShoppingCart,
  RotateCcw,
  Handshake,
  Search,
  X,
  IndianRupee,
  Sparkles,
  FileText,
  Printer,
  Trash2,
  Receipt,
  FileCheck
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

interface SupplierReturnItem {
  itemId: string;
  itemName: string;
  unit: string;
  conversionFactor: number;
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  currentStock: number;
  strips: number;
  looseQty: number;
  ratePerStrip: number;
  gstRate: number;
  itemTotal: number;
}

export default function Dashboard({ onSwitchCompany }: { onSwitchCompany: () => void }) {
  const { user, activeCompany, companies, selectCompany, logout } = useAuth();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sales' | 'purchases' | 'medicines' | 'batches' | 'parties' | 'credit-notes' | 'settlements'>('dashboard');
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Collapsible Sidebar State (persisted in localStorage)
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('tradeflow_sidebar_open');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleSidebar = () => {
    setSidebarOpen(prev => {
      const next = !prev;
      try {
        localStorage.setItem('tradeflow_sidebar_open', String(next));
      } catch (e) {
        // ignore
      }
      return next;
    });
  };

  // Keyboard shortcut Ctrl+B / Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Quick Patient Return State (Dashboard Shortcut - Multi-Item)
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [catalogItems, setCatalogItems] = useState<MedicineItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);


  // Multi-Item Supplier Return (CN / Debit Note) State
  const [showSupplierReturnModal, setShowSupplierReturnModal] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [suppReturnReason, setSuppReturnReason] = useState('Expiry / Slow moving medicine return to distributor');
  const [suppReturnItems, setSuppReturnItems] = useState<SupplierReturnItem[]>([]);
  const [suppReturnSearch, setSuppReturnSearch] = useState('');
  const [selectedSuppMed, setSelectedSuppMed] = useState<MedicineItem | null>(null);
  const [selectedSuppBatchId, setSelectedSuppBatchId] = useState('');
  const [tempSuppStrips, setTempSuppStrips] = useState<number>(1);
  const [tempSuppLoose, setTempSuppLoose] = useState<number>(0);
  const [tempSuppRate, setTempSuppRate] = useState<number>(0);
  const [submittingSuppReturn, setSubmittingSuppReturn] = useState(false);
  const [suppReturnSuccessMsg, setSuppReturnSuccessMsg] = useState<string | null>(null);
  const [suppReturnError, setSuppReturnError] = useState<string | null>(null);
  const [savedReturnVoucher, setSavedReturnVoucher] = useState<any | null>(null);
  const [showReturnVoucherModal, setShowReturnVoucherModal] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard Overview', icon: LayoutDashboard, hotkey: 'Alt+D' },
    { id: 'sales', label: 'Sales & POS Terminal', icon: ShoppingCart, hotkey: 'Alt+S' },
    { id: 'purchases', label: 'Purchases & Inward', icon: Truck, hotkey: 'Alt+B' },
    { id: 'medicines', label: 'Medicine Catalog', icon: Pill, hotkey: 'Alt+M' },
    { id: 'batches', label: 'Batches & Expiry', icon: Layers },
    { id: 'parties', label: 'Suppliers & Clients', icon: Users },
    { id: 'credit-notes', label: 'Credit Notes (CN)', icon: RotateCcw, hotkey: 'Alt+C' },
    { id: 'settlements', label: 'Supplier Settlements', icon: Handshake, hotkey: 'Alt+T' },
  ];

  // Global Navigation Hotkeys (Option A)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 's') {
          e.preventDefault();
          setActiveTab('sales');
          window.dispatchEvent(new CustomEvent('tradeflow_close_pos'));
        } else if (k === 'p') {
          e.preventDefault();
          setActiveTab('sales');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('tradeflow_open_pos'));
          }, 40);
        } else if (k === 'm') {
          e.preventDefault();
          setActiveTab('medicines');
        } else if (k === 'b' || k === 'u') {
          e.preventDefault();
          setActiveTab('purchases');
        } else if (k === 'd') {
          e.preventDefault();
          setActiveTab('dashboard');
        } else if (k === 'c') {
          e.preventDefault();
          setActiveTab('credit-notes');
        } else if (k === 't' || k === 'l') {
          e.preventDefault();
          setActiveTab('settlements');
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

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

  const handleOpenReturnModal = () => {
    setShowReturnModal(true);
  };


  // Open Supplier Return Modal & fetch suppliers + catalog
  const handleOpenSupplierReturnModal = async () => {
    setShowSupplierReturnModal(true);
    setSuppReturnError(null);
    setSuppReturnSuccessMsg(null);
    setSuppReturnItems([]);
    setSelectedSuppMed(null);
    setSelectedSuppBatchId('');
    setTempSuppStrips(1);
    setTempSuppLoose(0);
    setTempSuppRate(0);

    if (activeCompany) {
      try {
        setLoadingItems(true);
        const [partiesRes, itemsRes] = await Promise.all([
          api.get<{ parties: any[] }>('/api/parties?type=SUPPLIER', { companyId: activeCompany.id }),
          api.get<{ items: MedicineItem[] }>('/api/items?limit=2000', { companyId: activeCompany.id })
        ]);
        const supps = partiesRes.parties || [];
        setSuppliers(supps);
        if (supps.length > 0 && !selectedSupplierId) {
          setSelectedSupplierId(supps[0].id);
        }
        setCatalogItems(itemsRes.items || []);
      } catch (err) {
        console.error('Failed to load suppliers/items for return:', err);
      } finally {
        setLoadingItems(false);
      }
    }
  };

  const handleSelectSuppMed = async (initialMed: MedicineItem) => {
    setSelectedSuppMed(initialMed);
    setSuppReturnSearch('');

    let med = initialMed;
    try {
      if (activeCompany) {
        const detailRes = await api.get<{ item: MedicineItem }>(`/api/items/${initialMed.id}`, {
          companyId: activeCompany.id
        });
        if (detailRes.item) {
          med = detailRes.item;
          setSelectedSuppMed(detailRes.item);
        }
      }
    } catch (e) {
      console.warn('Using cached med batches:', e);
    }

    if (med.batches && med.batches.length > 0) {
      setSelectedSuppBatchId(med.batches[0].id);
      const b = med.batches[0];
      setTempSuppRate(Number(b.ptr) || Number(b.pts) || Number(b.mrp));
    } else {
      setSelectedSuppBatchId('');
      setTempSuppRate(0);
    }
    setTempSuppStrips(1);
    setTempSuppLoose(0);
  };

  const handleAddSuppReturnItem = () => {
    if (!selectedSuppMed || !selectedSuppBatchId) {
      setSuppReturnError('Please select a medicine and batch to add to return list.');
      return;
    }
    const b = selectedSuppMed.batches.find(batch => batch.id === selectedSuppBatchId);
    if (!b) return;

    const factor = selectedSuppMed.conversionFactor || 1;
    const totalUnits = (tempSuppStrips * factor) + tempSuppLoose;
    if (totalUnits <= 0) {
      setSuppReturnError('Please enter a return quantity greater than 0.');
      return;
    }
    if (totalUnits > b.currentStock) {
      setSuppReturnError(`Cannot return ${totalUnits} units. Only ${b.currentStock} units currently in stock for batch ${b.batchNumber}.`);
      return;
    }

    const itemTotal = (tempSuppStrips * tempSuppRate) + (tempSuppLoose * (tempSuppRate / factor));
    
    // Check if item+batch already in list
    const existingIndex = suppReturnItems.findIndex(i => i.batchId === b.id);
    if (existingIndex >= 0) {
      const updated = [...suppReturnItems];
      updated[existingIndex] = {
        itemId: selectedSuppMed.id,
        itemName: selectedSuppMed.name,
        unit: selectedSuppMed.unit,
        conversionFactor: factor,
        batchId: b.id,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        currentStock: b.currentStock,
        strips: tempSuppStrips,
        looseQty: tempSuppLoose,
        ratePerStrip: tempSuppRate,
        gstRate: selectedSuppMed.gstRate || 0,
        itemTotal: Math.round(itemTotal * 100) / 100
      };
      setSuppReturnItems(updated);
    } else {
      setSuppReturnItems(prev => [
        ...prev,
        {
          itemId: selectedSuppMed.id,
          itemName: selectedSuppMed.name,
          unit: selectedSuppMed.unit,
          conversionFactor: factor,
          batchId: b.id,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate,
          currentStock: b.currentStock,
          strips: tempSuppStrips,
          looseQty: tempSuppLoose,
          ratePerStrip: tempSuppRate,
          gstRate: selectedSuppMed.gstRate || 0,
          itemTotal: Math.round(itemTotal * 100) / 100
        }
      ]);
    }

    setSuppReturnError(null);
    setSelectedSuppMed(null);
    setSelectedSuppBatchId('');
    setTempSuppStrips(1);
    setTempSuppLoose(0);
    setTempSuppRate(0);
  };

  const handleRemoveSuppReturnItem = (index: number) => {
    setSuppReturnItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleConfirmSupplierReturn = async () => {
    if (!activeCompany) return;
    if (!selectedSupplierId) {
      setSuppReturnError('Please select a supplier / distributor.');
      return;
    }
    if (suppReturnItems.length === 0) {
      setSuppReturnError('Please add at least one medicine item to return.');
      return;
    }

    try {
      setSubmittingSuppReturn(true);
      setSuppReturnError(null);

      const res = await api.post<{
        success: boolean;
        message: string;
        purchaseReturn: any;
      }>('/api/purchase-returns', {
        supplierId: selectedSupplierId,
        partyId: selectedSupplierId,
        reason: suppReturnReason.trim() || undefined,
        items: suppReturnItems.map(item => ({
          itemId: item.itemId,
          batchId: item.batchId,
          strips: item.strips,
          looseQty: item.looseQty,
          returnRate: item.ratePerStrip,
          ratePerStrip: item.ratePerStrip
        }))
      }, {
        companyId: activeCompany.id
      });

      setSavedReturnVoucher(res.purchaseReturn);
      setSuppReturnSuccessMsg(`✓ Debit Note ${res.purchaseReturn.returnNumber} generated! Total Credit: ₹${Number(res.purchaseReturn.totalAmount).toFixed(2)}.`);
      
      // Refresh inventory summary
      fetchSummary();

      setTimeout(() => {
        setShowSupplierReturnModal(false);
        setShowReturnVoucherModal(true);
      }, 1000);

    } catch (err: any) {
      console.error('Failed to submit supplier return:', err);
      setSuppReturnError(err.response?.data?.error || err.message || 'Failed to process supplier return');
    } finally {
      setSubmittingSuppReturn(false);
    }
  };

  const suppReturnGrandTotal = suppReturnItems.reduce((acc, curr) => acc + curr.itemTotal, 0);
  const selectedSupplierObj = suppliers.find(s => s.id === selectedSupplierId);

  return (
    <div className="app-layout">
      {/* Left Sidebar (Rule C5) */}
      <aside className={`sidebar ${sidebarOpen ? '' : 'closed'}`}>
        {/* Brand Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #0d3829',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div style={{
              width: '32px',
              height: '32px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Pill size={18} color="#ffffff" />
            </div>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', color: '#ffffff', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                Trade Flow v2
              </div>
              <div style={{ fontSize: '11px', color: '#a7f3d0', whiteSpace: 'nowrap' }}>
                Pharma B2B & Retail ERP
              </div>
            </div>
          </div>

          {/* Close Arrow Button with Motion */}
          <button
            onClick={toggleSidebar}
            className="sidebar-collapse-trigger"
            title="Close sidebar to expand screen [Ctrl+B]"
            aria-label="Close sidebar"
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        {/* Current Active Company Indicator */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #0d3829', backgroundColor: '#031711' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#6ee7b7', fontWeight: 600, letterSpacing: '0.04em' }}>
            Active Company
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ fontWeight: 600, fontSize: '13px', color: '#f0fdf4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
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
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: isActive ? '#0d3829' : 'transparent',
                  color: isActive ? '#34d399' : '#a7bdae',
                  fontSize: '12.5px',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: isActive ? 'inset 3px 0 0 #10b981' : 'none'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = '#0a2e21';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title={item.hotkey ? `${item.label} [${item.hotkey}]` : item.label}
              >
                <Icon size={16} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.hotkey && (
                  <span style={{ fontSize: '10px', opacity: 0.65, background: '#0a2e21', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                    {item.hotkey}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Info & Footer */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid #0d3829', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#f0fdf4' }}>
              {user?.username}
            </div>
            <div style={{ fontSize: '11px', color: '#6ee7b7' }}>
              {companies.length} company access
            </div>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            style={{ background: 'none', border: 'none', color: '#a7bdae', cursor: 'pointer', padding: '4px' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content Layout */}
      <div className="main-wrapper">
        {/* Top Navbar */}
        <header className="top-navbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Animated Motion Arrow Toggle Button */}
            <button
              onClick={toggleSidebar}
              className={`sidebar-motion-toggle ${sidebarOpen ? 'open' : 'closed'}`}
              title={sidebarOpen ? "Close sidebar to expand workspace [Ctrl+B]" : "Open navigation sidebar [Ctrl+B]"}
              aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              <div className="motion-arrow-icon">
                {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
              </div>
              <span className="motion-toggle-label">
                {sidebarOpen ? 'Collapse' : 'Menu'}
              </span>
            </button>

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
                background: 'linear-gradient(135deg, #ffffff 60%, #f0fdf4 100%)',
                color: '#0f172a',
                borderRadius: '14px',
                padding: '20px 24px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 16px -2px rgba(0, 0, 0, 0.04)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                position: 'relative'
              }}>
                <div style={{ zIndex: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{
                      background: '#ecfdf5',
                      color: '#047857',
                      border: '1px solid #a7f3d0',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      🏥 Pharmacy Command Center
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>•</span>
                    <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>
                      {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                    {activeCompany?.name}
                  </h1>
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
                  {/* 1. Patient Quick Return */}
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

                  {/* 1B. Supplier Return (Debit Note / CN) */}
                  <div
                    onClick={handleOpenSupplierReturnModal}
                    className="card"
                    style={{
                      cursor: 'pointer',
                      padding: '20px',
                      borderRadius: '12px',
                      border: '2px solid #6366f1',
                      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(99, 102, 241, 0.2) 100%)',
                      boxShadow: '0 4px 14px rgba(99, 102, 241, 0.15)',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-3px)';
                      e.currentTarget.style.boxShadow = '0 8px 20px rgba(99, 102, 241, 0.25)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 14px rgba(99, 102, 241, 0.15)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ background: '#4f46e5', padding: '12px', borderRadius: '10px', color: '#ffffff', boxShadow: '0 4px 10px rgba(79, 70, 229, 0.3)' }}>
                        <Truck size={24} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#4f46e5' }}>Supplier Return (CN)</h3>
                          <span style={{ background: '#4f46e5', color: '#fff', fontSize: '9.5px', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>DEBIT NOTE</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '3px' }}>Return expired/slow items, deduct balance & print CN</div>
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
          {activeTab === 'credit-notes' && <CreditNotes />}
          {activeTab === 'settlements' && <Settlements />}
        </main>
      </div>

      {/* Multi-Item Patient Medicine Return Modal */}
      <MultiPatientReturnModal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        onSuccess={() => {
          fetchSummary();
        }}
      />

      {/* Multi-Item Supplier Return (Debit Note / CN) Modal */}
      {showSupplierReturnModal && (
        <div className="modal-overlay" style={{
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
          <div className="modal-card" style={{
            background: 'var(--card-bg, #ffffff)',
            color: 'var(--text-primary, #0f172a)',
            width: '100%',
            maxWidth: '850px',
            maxHeight: 'min(92vh, 92dvh)',
            borderRadius: '14px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            border: '1px solid var(--border-color, #e2e8f0)'
          }}>
            {/* Modal Header */}
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color, #e2e8f0)', padding: '1.2rem 1.6rem', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#4f46e5', color: '#fff', padding: '8px', borderRadius: '8px' }}>
                  <Truck size={20} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                    Supplier Medicine Return (Credit Note / Debit Note)
                  </h2>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
                    Multi-item return voucher • Deducts live inventory stock & debits distributor ledger balance
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowSupplierReturnModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary, #64748b)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ flex: '1 1 auto', overflowY: 'auto', padding: '1.4rem 1.6rem' }}>
            {/* Success Notification */}
            {suppReturnSuccessMsg && (
              <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '0.8rem 1rem', borderRadius: '8px', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', fontWeight: 600 }}>
                <CheckCircle2 size={18} color="#10b981" />
                <span>{suppReturnSuccessMsg}</span>
              </div>
            )}

            {/* Error Notification */}
            {suppReturnError && (
              <div style={{ background: '#fef2f2', border: '1px solid #ef4444', color: '#991b1b', padding: '0.8rem 1rem', borderRadius: '8px', marginBottom: '1.2rem', fontSize: '0.85rem' }}>
                ⚠️ {suppReturnError}
              </div>
            )}

            {/* Top Bar: Supplier Selector & Reason */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1rem', marginBottom: '1.2rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #475569)', marginBottom: '0.3rem' }}>
                  1. SELECT SUPPLIER / DISTRIBUTOR * :
                </label>
                <select
                  value={selectedSupplierId}
                  onChange={e => setSelectedSupplierId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.8rem',
                    background: 'var(--bg-secondary, #f8fafc)',
                    border: '1.5px solid #6366f1',
                    borderRadius: '8px',
                    color: 'var(--text-primary, #0f172a)',
                    fontWeight: 700,
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="">-- Choose Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.phone ? `(${s.phone})` : ''} — Bal: ₹{Number(s.outstandingBalance || 0).toFixed(2)}
                    </option>
                  ))}
                </select>
                {selectedSupplierObj && (
                  <div style={{ fontSize: '0.75rem', color: '#4f46e5', fontWeight: 600, marginTop: '4px' }}>
                    Current Payable: ₹{Number(selectedSupplierObj.outstandingBalance || 0).toFixed(2)} {selectedSupplierObj.gstNumber ? `• GSTIN: ${selectedSupplierObj.gstNumber}` : ''}
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #475569)', marginBottom: '0.3rem' }}>
                  RETURN REASON / REMARKS :
                </label>
                <input
                  type="text"
                  placeholder="e.g. Expired lot return / Breakage"
                  value={suppReturnReason}
                  onChange={e => setSuppReturnReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.8rem',
                    background: 'var(--bg-secondary, #f8fafc)',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    borderRadius: '8px',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
            </div>

            {/* Medicine & Batch Selector Box */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', marginBottom: '1.2rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#4f46e5', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
                2. ADD MEDICINE TO RETURN VOUCHER :
              </div>

              {!selectedSuppMed ? (
                <div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#4f46e5', pointerEvents: 'none' }}>
                      <Search size={17} />
                    </span>
                    <input
                      type="text"
                      placeholder="Type brand name to search (e.g. AURDEP, AUGMENTIN, PAN D)..."
                      value={suppReturnSearch}
                      onChange={e => setSuppReturnSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.8rem 0.65rem 2.4rem',
                        background: '#ffffff',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        color: '#0f172a',
                        fontWeight: 600,
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>

                  {suppReturnSearch.trim().length > 0 && (
                    <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#ffffff', marginTop: '6px' }}>
                      {catalogItems.filter(m => m.name.toLowerCase().includes(suppReturnSearch.toLowerCase()) || (m.genericName && m.genericName.toLowerCase().includes(suppReturnSearch.toLowerCase()))).slice(0, 15).map(m => (
                        <div
                          key={m.id}
                          onClick={() => handleSelectSuppMed(m)}
                          style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                          onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
                        >
                          <div>
                            <strong style={{ color: '#0f172a', fontSize: '0.88rem' }}>{m.name}</strong>
                            <span style={{ color: '#64748b', fontSize: '0.75rem', marginLeft: '6px' }}>{m.genericName || ''}</span>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: '#4f46e5', fontWeight: 600 }}>{m.batches?.length || 0} batches available</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '8px', padding: '8px 12px', marginBottom: '0.8rem' }}>
                    <div>
                      <strong style={{ color: '#312e81', fontSize: '0.95rem' }}>{selectedSuppMed.name}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#6366f1', marginLeft: '8px' }}>
                        Pack: 1 Strip = {selectedSuppMed.conversionFactor > 1 ? `${selectedSuppMed.conversionFactor} Tabs` : selectedSuppMed.unit}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedSuppMed(null); setSuppReturnSearch(''); }}
                      style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '3px 8px', fontSize: '0.75rem', fontWeight: 700, color: '#4f46e5', cursor: 'pointer' }}
                    >
                      Change Medicine
                    </button>
                  </div>

                  {/* Batch Selector */}
                  <div style={{ marginBottom: '0.8rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.3rem' }}>
                      CHOOSE BATCH TO RETURN :
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {selectedSuppMed.batches?.map(b => {
                        const isSel = selectedSuppBatchId === b.id;
                        return (
                          <div
                            key={b.id}
                            onClick={() => {
                              setSelectedSuppBatchId(b.id);
                              setTempSuppRate(Number(b.ptr) || Number(b.pts) || Number(b.mrp));
                            }}
                            style={{
                              padding: '6px 10px',
                              border: isSel ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                              borderRadius: '6px',
                              background: isSel ? '#eef2ff' : '#ffffff',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '0.82rem'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <input type="radio" checked={isSel} onChange={() => {}} style={{ accentColor: '#4f46e5' }} />
                              <strong style={{ fontFamily: 'monospace' }}>{b.batchNumber}</strong>
                              <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                Exp: {new Date(b.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                              </span>
                            </div>
                            <div>
                              <span style={{ color: '#16a34a', fontWeight: 700 }}>
                                Stock: {b.currentStock} units ({Math.floor(b.currentStock / (selectedSuppMed.conversionFactor || 1))} Strips)
                              </span>
                              <span style={{ color: '#64748b', marginLeft: '10px' }}>PTR: ₹{Number(b.ptr || b.pts || b.mrp).toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Qty & Rate Inputs */}
                  {selectedSuppBatchId && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.8rem', alignItems: 'flex-end' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '0.2rem' }}>
                          RETURN STRIPS :
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={tempSuppStrips}
                          onFocus={e => e.target.select()}
                          onChange={e => setTempSuppStrips(Math.max(0, parseInt(e.target.value) || 0))}
                          style={{ width: '100%', padding: '0.5rem', background: '#fff', border: '1.5px solid #cbd5e1', borderRadius: '6px', fontWeight: 800, textAlign: 'center' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '0.2rem' }}>
                          RETURN LOOSE :
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={tempSuppLoose}
                          onFocus={e => e.target.select()}
                          onChange={e => setTempSuppLoose(Math.max(0, parseInt(e.target.value) || 0))}
                          style={{ width: '100%', padding: '0.5rem', background: '#fff', border: '1.5px solid #cbd5e1', borderRadius: '6px', fontWeight: 800, textAlign: 'center' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '0.2rem' }}>
                          RATE / STRIP (PTR ₹) :
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={tempSuppRate}
                          onFocus={e => e.target.select()}
                          onChange={e => setTempSuppRate(parseFloat(e.target.value) || 0)}
                          style={{ width: '100%', padding: '0.5rem', background: '#fff', border: '1.5px solid #cbd5e1', borderRadius: '6px', fontWeight: 800, textAlign: 'right' }}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleAddSuppReturnItem}
                        style={{
                          padding: '0.55rem 1rem',
                          background: '#4f46e5',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <Plus size={16} /> Add Item
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 3: Items in Return Voucher Table */}
            <div style={{ marginBottom: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
                  3. RETURN ITEMS LIST ({suppReturnItems.length}) :
                </span>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#4f46e5' }}>
                  Total CN Amount: ₹{suppReturnGrandTotal.toFixed(2)}
                </span>
              </div>

              {suppReturnItems.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b', fontSize: '0.85rem' }}>
                  No items added yet. Search a medicine above to add to this return voucher.
                </div>
              ) : (
                <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                      <tr>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>#</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Medicine Name</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Batch & Exp</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>Return Qty</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rate / Strip</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount (₹)</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suppReturnItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', color: '#64748b' }}>{idx + 1}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0f172a' }}>{item.itemName}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{item.batchNumber}</span>
                            <span style={{ color: '#64748b', fontSize: '0.72rem', marginLeft: '6px' }}>
                              ({new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })})
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>
                            {item.strips > 0 ? `${item.strips} Strips` : ''}
                            {item.strips > 0 && item.looseQty > 0 ? ' + ' : ''}
                            {item.looseQty > 0 ? `${item.looseQty} tabs` : ''}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>₹{item.ratePerStrip.toFixed(2)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>₹{item.itemTotal.toFixed(2)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveSuppReturnItem(idx)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                              title="Remove item"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 800 }}>
                      <tr>
                        <td colSpan={5} style={{ padding: '10px', textAlign: 'right', color: '#475569' }}>GRAND TOTAL RETURN VALUE (CN / DEBIT NOTE):</td>
                        <td style={{ padding: '10px', textAlign: 'right', color: '#4f46e5', fontSize: '1rem' }}>₹{suppReturnGrandTotal.toFixed(2)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

              </div>

            {/* Submit Action Buttons */}
            <div className="modal-footer" style={{
              display: 'flex',
              gap: '0.8rem',
              padding: '1rem 1.6rem',
              borderTop: '1px solid var(--border-color, #e2e8f0)',
              background: 'var(--card-bg, #ffffff)',
              flexShrink: 0,
              position: 'sticky',
              bottom: 0,
              zIndex: 10
            }}>
              <button
                type="button"
                onClick={() => setShowSupplierReturnModal(false)}
                style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSupplierReturn}
                disabled={submittingSuppReturn || suppReturnItems.length === 0 || !selectedSupplierId}
                style={{
                  flex: 2,
                  padding: '0.75rem',
                  background: (suppReturnItems.length === 0 || !selectedSupplierId) ? '#94a3b8' : 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: (submittingSuppReturn || suppReturnItems.length === 0 || !selectedSupplierId) ? 'not-allowed' : 'pointer',
                  boxShadow: suppReturnItems.length > 0 ? '0 4px 12px rgba(79, 70, 229, 0.35)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <CheckCircle2 size={18} />
                {submittingSuppReturn ? 'Processing Return...' : `Confirm Return & Generate CN Voucher (₹${suppReturnGrandTotal.toFixed(2)})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Supplier Return Voucher / Debit Note Modal */}
      {showReturnVoucherModal && savedReturnVoucher && (
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
          zIndex: 250,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            color: '#0f172a',
            width: '100%',
            maxWidth: '750px',
            maxHeight: '92vh',
            borderRadius: '12px',
            overflowY: 'auto',
            padding: '2rem',
            position: 'relative',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #cbd5e1'
          }}>
            {/* Top Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.8rem' }} className="no-print">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 800 }}>
                  ✓ RETURN SAVED TO LEDGER
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  <Printer size={15} /> Print Challan
                </button>
                <button
                  onClick={() => setShowReturnVoucherModal(false)}
                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '7px 12px', fontSize: '0.85rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Printable Document Area */}
            <div id="printable-return-challan" style={{ fontFamily: 'sans-serif' }}>
              {/* Header */}
              <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '1rem', marginBottom: '1rem' }}>
                <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, textTransform: 'uppercase', color: '#0f172a' }}>
                  {activeCompany?.name}
                </h1>
                <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '2px' }}>
                  Retail & Wholesale Pharmacy • Goods Return Debit Note
                </div>
                <div style={{ display: 'inline-block', background: '#0f172a', color: '#fff', fontWeight: 800, fontSize: '0.85rem', padding: '3px 12px', borderRadius: '4px', marginTop: '8px', letterSpacing: '0.5px' }}>
                  PURCHASE RETURN CHALLAN / DEBIT NOTE
                </div>
              </div>

              {/* Meta details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1rem', fontSize: '0.85rem', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>RETURNED TO (SUPPLIER) :</div>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{savedReturnVoucher.party?.name}</div>
                  {savedReturnVoucher.party?.phone && <div style={{ color: '#475569' }}>Phone: {savedReturnVoucher.party.phone}</div>}
                  {savedReturnVoucher.party?.gstNumber && <div style={{ color: '#475569' }}>GSTIN: {savedReturnVoucher.party.gstNumber}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div><span style={{ color: '#64748b' }}>Return No: </span><strong style={{ fontFamily: 'monospace', color: '#4f46e5' }}>{savedReturnVoucher.returnNumber}</strong></div>
                  <div><span style={{ color: '#64748b' }}>Date: </span><strong>{new Date(savedReturnVoucher.returnDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong></div>
                  {savedReturnVoucher.reason && <div><span style={{ color: '#64748b' }}>Reason: </span><span style={{ color: '#dc2626', fontWeight: 600 }}>{savedReturnVoucher.reason}</span></div>}
                </div>
              </div>

              {/* Items Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginBottom: '1.5rem' }}>
                <thead>
                  <tr style={{ background: '#0f172a', color: '#ffffff' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>S.N.</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Medicine Description</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Batch No.</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Exp Date</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Return Qty</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rate / Strip</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {savedReturnVoucher.items?.map((item: any, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 10px', color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700 }}>{item.item?.name || 'Medicine'}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>{item.batch?.batchNumber || 'N/A'}</td>
                      <td style={{ padding: '8px 10px', color: '#475569' }}>
                        {item.batch?.expiryDate ? new Date(item.batch.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : 'N/A'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>
                        {item.strips > 0 ? `${item.strips} Strips` : ''}
                        {item.strips > 0 && item.looseQty > 0 ? ' + ' : ''}
                        {item.looseQty > 0 ? `${item.looseQty} tabs` : ''}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>₹{Number(item.ratePerStrip).toFixed(2)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800 }}>₹{Number(item.total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #0f172a', fontWeight: 900, background: '#f8fafc' }}>
                    <td colSpan={6} style={{ padding: '10px', textAlign: 'right', fontSize: '0.9rem' }}>TOTAL DEBIT / CN VALUE :</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontSize: '1.05rem', color: '#4f46e5' }}>
                      ₹{Number(savedReturnVoucher.totalAmount).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Signatures & Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3rem', paddingTop: '1rem', borderTop: '1px dashed #cbd5e1', fontSize: '0.8rem', color: '#475569' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ borderTop: '1px solid #94a3b8', width: '180px', paddingTop: '6px', fontWeight: 700 }}>
                    Distributor / Driver Signature
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ borderTop: '1px solid #94a3b8', width: '180px', paddingTop: '6px', fontWeight: 700 }}>
                    For {activeCompany?.name} (Authorized Signatory)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

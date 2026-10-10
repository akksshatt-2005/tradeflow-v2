// TradeFlow v2.0 - Supplier Settlements Engine
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import {
  Handshake,
  Calendar,
  Building2,
  Search,
  Filter,
  RefreshCw,
  IndianRupee,
  CheckCircle2,
  AlertCircle,
  FileText,
  Printer,
  History,
  TrendingUp,
  Package,
  ArrowRight,
  Sparkles,
  ChevronDown,
  Layers,
  RotateCcw,
  Check,
  X,
  CreditCard,
  Eye,
  Trash2,
  Download,
  AlertTriangle
} from 'lucide-react';

interface SupplierParty {
  id: string;
  name: string;
  phone?: string | null;
  gstin?: string | null;
  station?: string | null;
  state?: string | null;
  outstandingBalance?: number;
}

interface BatchSettlementItem {
  batchId: string;
  itemId: string;
  medicineName: string;
  genericName: string | null;
  manufacturer: string | null;
  sku: string;
  batchNumber: string;
  expiryDate: string | null;
  unit: string;
  conversionFactor: number;
  ptr: number; // Purchase Rate per pack/strip (CP)
  mrp: number; // Retail Rate per pack/strip
  unitCostPrice: number;
  unitRetailPrice: number;
  grossSoldUnits: number;
  grossSoldStrips: number;
  grossSoldLoose: number;
  returnedUnits: number;
  returnedStrips: number;
  returnedLoose: number;
  netSoldUnits: number;
  netSoldStrips: number;
  netSoldLoose: number;
  grossCostPayable: number;
  returnCostDeduction: number;
  netPayableAmount: number;
  grossRetailAmount: number;
  netRetailAmount: number;
  marginAmount: number;
  invoicesCount: number;
}

interface SettlementSummary {
  periodStartDate: string;
  periodEndDate: string;
  manufacturer: string | null;
  supplierId: string | null;
  totalItemsCount: number;
  grossSoldUnits: number;
  grossSoldStrips: number;
  returnedUnits: number;
  returnedStrips: number;
  netSoldUnits: number;
  netSoldStrips: number;
  grossPayableCost: number;
  returnDeduction: number;
  netPayableAmount: number;
  retailSalesValue: number;
  realizedMargin: number;
  marginPercentage: number;
}

interface SavedSettlement {
  id: string;
  settlementNumber: string;
  manufacturer: string | null;
  supplierId: string | null;
  periodStartDate: string;
  periodEndDate: string;
  grossSoldUnits: number;
  returnedUnits: number;
  netSoldUnits: number;
  grossPayableCost: number;
  returnDeduction: number;
  netPayableAmount: number;
  retailSalesValue: number;
  realizedMargin: number;
  paidAmount: number;
  paymentMode: string;
  paymentRef: string | null;
  status: string;
  settlementDate: string;
  itemDetails: any;
  notes: string | null;
  supplier?: {
    name: string;
    phone?: string;
    gstin?: string;
  } | null;
  creator?: {
    username: string;
  };
}

export default function Settlements() {
  const { activeCompany, user } = useAuth();

  // Active View Tab: 'calculate' | 'history'
  const [activeTab, setActiveTab] = useState<'calculate' | 'history'>('calculate');

  // Filter Master Data
  const [manufacturers, setManufacturers] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierParty[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);

  // Selected Filters
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [timePreset, setTimePreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'custom'>('today');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Deduct Returns Toggle (default false so test returns don't corrupt clean sales)
  const [deductReturns, setDeductReturns] = useState<boolean>(false);

  // Live Calculation State
  const [summary, setSummary] = useState<SettlementSummary | null>(null);
  const [items, setItems] = useState<BatchSettlementItem[]>([]);
  const [loadingCalculation, setLoadingCalculation] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState('');

  // Payout / Record Modal State
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<string>('BANK_TRANSFER');
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [settlementNotes, setSettlementNotes] = useState<string>('');
  const [submittingPayout, setSubmittingPayout] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Printable Statement Slip Modal
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [statementData, setStatementData] = useState<{
    voucherNumber?: string;
    date: string;
    manufacturer: string;
    supplierName?: string;
    periodStart: string;
    periodEnd: string;
    summary: SettlementSummary;
    items: BatchSettlementItem[];
    paidAmount?: number;
    paymentMode?: string;
    paymentRef?: string;
    notes?: string;
  } | null>(null);

  // History State
  const [historyList, setHistoryList] = useState<SavedSettlement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  // Initial Date Helper
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setCustomStartDate(today);
    setCustomEndDate(today);
  }, []);

  // Fetch manufacturers and suppliers
  useEffect(() => {
    if (activeCompany) {
      loadMeta();
      if (activeTab === 'history') {
        loadHistory();
      }
    }
  }, [activeCompany?.id, activeTab]);

  const loadMeta = async () => {
    if (!activeCompany) return;
    try {
      setLoadingMeta(true);
      const res = await api.get<{ manufacturers: string[]; suppliers: SupplierParty[] }>(
        '/api/settlements/manufacturers',
        { companyId: activeCompany.id }
      );
      setManufacturers(res.manufacturers || []);
      setSuppliers(res.suppliers || []);

      // Manufacturers & suppliers loaded
    } catch (err: any) {
      console.error('Failed to load manufacturers/suppliers:', err);
    } finally {
      setLoadingMeta(false);
    }
  };

  // Compute actual date range based on preset
  const computedDateRange = useMemo(() => {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    if (timePreset === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (timePreset === 'yesterday') {
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    } else if (timePreset === 'week') {
      // Last 7 days
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (timePreset === 'month') {
      // Current calendar month
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (timePreset === 'last_month') {
      // Previous month
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (timePreset === 'custom') {
      if (customStartDate) {
        start = new Date(`${customStartDate}T00:00:00.000`);
      }
      if (customEndDate) {
        end = new Date(`${customEndDate}T23:59:59.999`);
      }
    }

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      displayLabel: timePreset === 'today'
        ? 'Today'
        : timePreset === 'yesterday'
          ? 'Yesterday'
          : timePreset === 'week'
            ? 'Last 7 Days (Week)'
            : timePreset === 'month'
              ? 'This Month'
              : timePreset === 'last_month'
                ? 'Last Month'
                : `${customStartDate} to ${customEndDate}`
    };
  }, [timePreset, customStartDate, customEndDate]);

  // Execute Settlement Calculation
  const calculateSettlement = async () => {
    if (!activeCompany) return;
    try {
      setLoadingCalculation(true);
      setCalcError(null);

      const queryParams = new URLSearchParams();
      queryParams.set('startDate', computedDateRange.startDate);
      queryParams.set('endDate', computedDateRange.endDate);
      queryParams.set('deductReturns', deductReturns ? 'true' : 'false');

      if (selectedManufacturer && selectedManufacturer.trim() && !selectedManufacturer.toLowerCase().includes('all manufacturer')) {
        queryParams.set('manufacturer', selectedManufacturer.trim());
      }
      if (selectedSupplierId) {
        queryParams.set('supplierId', selectedSupplierId);
      }

      const res = await api.get<{ summary: SettlementSummary; items: BatchSettlementItem[] }>(
        `/api/settlements/calculate?${queryParams.toString()}`,
        { companyId: activeCompany.id }
      );

      setSummary(res.summary);
      setItems(res.items || []);
      setPaidAmount(res.summary?.netPayableAmount || 0);
    } catch (err: any) {
      console.error('Calculation error:', err);
      setCalcError(err.message || 'Failed to calculate supplier settlement');
    } finally {
      setLoadingCalculation(false);
    }
  };

  // Recalculate whenever filters change
  useEffect(() => {
    if (activeCompany && activeTab === 'calculate') {
      calculateSettlement();
    }
  }, [activeCompany?.id, selectedManufacturer, selectedSupplierId, computedDateRange, deductReturns, activeTab]);

  // Filter items in table by local search
  const filteredItems = useMemo(() => {
    if (!itemSearch.trim()) return items;
    const q = itemSearch.toLowerCase();
    return items.filter(i =>
      i.medicineName.toLowerCase().includes(q) ||
      (i.genericName && i.genericName.toLowerCase().includes(q)) ||
      i.batchNumber.toLowerCase().includes(q) ||
      i.sku.toLowerCase().includes(q)
    );
  }, [items, itemSearch]);

  // Open Record Settlement Modal
  const handleOpenRecordModal = () => {
    if (!summary || summary.netPayableAmount <= 0) {
      alert('There is no net payable balance to settle for this period.');
      return;
    }
    setPaidAmount(summary.netPayableAmount);
    setRecordError(null);
    setShowRecordModal(true);
  };

  // Submit Settlement Payout
  const handleSavePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany || !summary) return;

    try {
      setSubmittingPayout(true);
      setRecordError(null);

      const payload = {
        manufacturer: selectedManufacturer || null,
        supplierId: selectedSupplierId || null,
        periodStartDate: summary.periodStartDate,
        periodEndDate: summary.periodEndDate,
        grossSoldUnits: summary.grossSoldUnits,
        returnedUnits: summary.returnedUnits,
        netSoldUnits: summary.netSoldUnits,
        grossPayableCost: summary.grossPayableCost,
        returnDeduction: summary.returnDeduction,
        netPayableAmount: summary.netPayableAmount,
        retailSalesValue: summary.retailSalesValue,
        realizedMargin: summary.realizedMargin,
        paidAmount: Number(paidAmount) >= 0 ? Number(paidAmount) : summary.netPayableAmount,
        paymentMode,
        paymentRef: paymentRef.trim() || null,
        notes: settlementNotes.trim() || null,
        items: items.map(i => ({
          medicineName: i.medicineName,
          sku: i.sku,
          batchNumber: i.batchNumber,
          expiryDate: i.expiryDate,
          conversionFactor: i.conversionFactor,
          grossSoldUnits: i.grossSoldUnits,
          returnedUnits: i.returnedUnits,
          netSoldUnits: i.netSoldUnits,
          ptr: i.ptr,
          mrp: i.mrp,
          netPayableAmount: i.netPayableAmount
        }))
      };

      const res = await api.post<{ message: string; settlement: SavedSettlement }>(
        '/api/settlements/record',
        payload,
        {
          companyId: activeCompany.id,
          idempotencyKey: `settle-${Date.now()}-${Math.random().toString(36).substring(7)}`
        }
      );

      setShowRecordModal(false);
      setSuccessToast(`Settlement #${res.settlement.settlementNumber} recorded successfully!`);
      setTimeout(() => setSuccessToast(null), 4000);

      // Open printable statement
      const supp = suppliers.find(s => s.id === selectedSupplierId);
      setStatementData({
        voucherNumber: res.settlement.settlementNumber,
        date: new Date().toISOString(),
        manufacturer: selectedManufacturer || (supp ? supp.name : 'All Manufacturers'),
        supplierName: supp?.name,
        periodStart: summary.periodStartDate,
        periodEnd: summary.periodEndDate,
        summary,
        items,
        paidAmount: Number(paidAmount),
        paymentMode,
        paymentRef,
        notes: settlementNotes
      });
      setShowPrintModal(true);

      // Clear notes & ref
      setPaymentRef('');
      setSettlementNotes('');
    } catch (err: any) {
      console.error('Save settlement error:', err);
      setRecordError(err.message || 'Failed to record payout settlement');
    } finally {
      setSubmittingPayout(false);
    }
  };

  // Open Preview / Print Statement
  const handleOpenPrintPreview = () => {
    if (!summary) return;
    const supp = suppliers.find(s => s.id === selectedSupplierId);
    setStatementData({
      voucherNumber: `PREVIEW-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toISOString(),
      manufacturer: selectedManufacturer || (supp ? supp.name : 'All Manufacturers'),
      supplierName: supp?.name,
      periodStart: summary.periodStartDate,
      periodEnd: summary.periodEndDate,
      summary,
      items,
      paidAmount: summary.netPayableAmount,
      paymentMode: 'PAY_ON_SALE_SETTLEMENT'
    });
    setShowPrintModal(true);
  };

  // Load Past Settlements History
  const loadHistory = async () => {
    if (!activeCompany) return;
    try {
      setLoadingHistory(true);
      const url = historySearch.trim()
        ? `/api/settlements/history?search=${encodeURIComponent(historySearch.trim())}`
        : '/api/settlements/history';
      const res = await api.get<{ settlements: SavedSettlement[] }>(url, {
        companyId: activeCompany.id
      });
      setHistoryList(res.settlements || []);
    } catch (err: any) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Open History Item Slip
  const handleViewHistoryItem = (s: SavedSettlement) => {
    const parsedItems: BatchSettlementItem[] = Array.isArray(s.itemDetails)
      ? s.itemDetails.map((i: any) => ({
          batchId: i.batchId || '',
          itemId: i.itemId || '',
          medicineName: i.medicineName || '',
          genericName: i.genericName || null,
          manufacturer: s.manufacturer || null,
          sku: i.sku || '',
          batchNumber: i.batchNumber || '',
          expiryDate: i.expiryDate || null,
          unit: i.unit || 'STRIP',
          conversionFactor: i.conversionFactor || 1,
          ptr: Number(i.ptr || 0),
          mrp: Number(i.mrp || 0),
          unitCostPrice: Number(i.ptr || 0) / (i.conversionFactor || 1),
          unitRetailPrice: Number(i.mrp || 0) / (i.conversionFactor || 1),
          grossSoldUnits: Number(i.grossSoldUnits || 0),
          grossSoldStrips: Math.floor(Number(i.grossSoldUnits || 0) / (i.conversionFactor || 1)),
          grossSoldLoose: Number(i.grossSoldUnits || 0) % (i.conversionFactor || 1),
          returnedUnits: Number(i.returnedUnits || 0),
          returnedStrips: Math.floor(Number(i.returnedUnits || 0) / (i.conversionFactor || 1)),
          returnedLoose: Number(i.returnedUnits || 0) % (i.conversionFactor || 1),
          netSoldUnits: Number(i.netSoldUnits || 0),
          netSoldStrips: Math.floor(Number(i.netSoldUnits || 0) / (i.conversionFactor || 1)),
          netSoldLoose: Number(i.netSoldUnits || 0) % (i.conversionFactor || 1),
          grossCostPayable: 0,
          returnCostDeduction: 0,
          netPayableAmount: Number(i.netPayableAmount || 0),
          grossRetailAmount: 0,
          netRetailAmount: 0,
          marginAmount: 0,
          invoicesCount: 1
        }))
      : [];

    setStatementData({
      voucherNumber: s.settlementNumber,
      date: s.settlementDate,
      manufacturer: s.manufacturer || (s.supplier ? s.supplier.name : 'Manufacturer'),
      supplierName: s.supplier?.name,
      periodStart: s.periodStartDate,
      periodEnd: s.periodEndDate,
      summary: {
        periodStartDate: s.periodStartDate,
        periodEndDate: s.periodEndDate,
        manufacturer: s.manufacturer,
        supplierId: s.supplierId,
        totalItemsCount: parsedItems.length,
        grossSoldUnits: s.grossSoldUnits,
        grossSoldStrips: 0,
        returnedUnits: s.returnedUnits,
        returnedStrips: 0,
        netSoldUnits: s.netSoldUnits,
        netSoldStrips: 0,
        grossPayableCost: Number(s.grossPayableCost),
        returnDeduction: Number(s.returnDeduction),
        netPayableAmount: Number(s.netPayableAmount),
        retailSalesValue: Number(s.retailSalesValue),
        realizedMargin: Number(s.realizedMargin),
        marginPercentage: Number(s.retailSalesValue) > 0 ? (Number(s.realizedMargin) / Number(s.retailSalesValue)) * 100 : 0
      },
      items: parsedItems,
      paidAmount: Number(s.paidAmount),
      paymentMode: s.paymentMode,
      paymentRef: s.paymentRef || undefined,
      notes: s.notes || undefined
    });
    setShowPrintModal(true);
  };

  // Delete History Item
  const handleDeleteHistory = async (id: string, voucherNo: string) => {
    if (!window.confirm(`Are you sure you want to delete Settlement #${voucherNo}?`)) return;
    try {
      await api.delete(`/api/settlements/${id}`, { companyId: activeCompany?.id });
      setHistoryList(prev => prev.filter(h => h.id !== id));
      setSuccessToast(`Settlement #${voucherNo} removed.`);
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to delete settlement');
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto', color: '#0f172a' }}>
      {/* Toast Notification */}
      {successToast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '24px',
          zIndex: 9999,
          background: '#065f46',
          color: '#ffffff',
          padding: '0.85rem 1.4rem',
          borderRadius: '10px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          fontWeight: 600,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <CheckCircle2 size={20} color="#34d399" />
          {successToast}
        </div>
      )}

      {/* Header Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
              color: '#fff',
              padding: '0.6rem',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
            }}>
              <Handshake size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, color: '#0f172a', letterSpacing: '-0.02em' }}>
                Supplier & Manufacturer Settlements
              </h1>
              <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.875rem' }}>
                Pay-on-Sale reconciliation: Calculate exact payouts strictly at Purchase Cost (CP/PTR) minus customer returns.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher & Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex',
            background: '#f1f5f9',
            padding: '0.25rem',
            borderRadius: '10px',
            border: '1px solid #e2e8f0'
          }}>
            <button
              onClick={() => setActiveTab('calculate')}
              style={{
                padding: '0.5rem 1.1rem',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'calculate' ? '#ffffff' : 'transparent',
                color: activeTab === 'calculate' ? '#0284c7' : '#64748b',
                fontWeight: activeTab === 'calculate' ? 700 : 500,
                fontSize: '0.875rem',
                cursor: 'pointer',
                boxShadow: activeTab === 'calculate' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.15s ease'
              }}
            >
              <TrendingUp size={16} /> Calculate & Settle Payout
            </button>
            <button
              onClick={() => setActiveTab('history')}
              style={{
                padding: '0.5rem 1.1rem',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'history' ? '#ffffff' : 'transparent',
                color: activeTab === 'history' ? '#0284c7' : '#64748b',
                fontWeight: activeTab === 'history' ? 700 : 500,
                fontSize: '0.875rem',
                cursor: 'pointer',
                boxShadow: activeTab === 'history' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.15s ease'
              }}
            >
              <History size={16} /> Settlement History & Vouchers
            </button>
          </div>

          {activeTab === 'calculate' && summary && summary.netPayableAmount > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleOpenPrintPreview}
                style={{
                  background: '#ffffff',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '9px',
                  padding: '0.55rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
              >
                <Printer size={16} /> Print Statement
              </button>
              <button
                onClick={handleOpenRecordModal}
                style={{
                  background: 'linear-gradient(135deg, #059669, #10b981)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '9px',
                  padding: '0.55rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                }}
              >
                <IndianRupee size={16} /> Settle & Pay ₹{summary.netPayableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </button>
            </div>
          )}
        </div>
      </div>

      {activeTab === 'calculate' ? (
        <>
          {/* Filter & Control Bar */}
          <div style={{
            background: '#ffffff',
            borderRadius: '14px',
            padding: '1.25rem',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            marginBottom: '1.5rem'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
              
              {/* Manufacturer Selector */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    1. Select Manufacturer
                  </label>
                  {selectedManufacturer ? (
                    <button
                      type="button"
                      onClick={() => setSelectedManufacturer('')}
                      style={{
                        background: '#e0f2fe',
                        border: '1px solid #7dd3fc',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: '#0369a1',
                        cursor: 'pointer',
                        padding: '0.12rem 0.5rem',
                        transition: 'all 0.15s ease'
                      }}
                      title="View total sale across all manufacturers combined"
                    >
                      Show All Manufacturers
                    </button>
                  ) : (
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '0.1rem 0.45rem', borderRadius: '4px' }}>
                      Viewing All (Grand Total)
                    </span>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <select
                    value={selectedManufacturer}
                    onChange={(e) => setSelectedManufacturer(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      border: selectedManufacturer ? '1px solid #0284c7' : '1px solid #10b981',
                      fontSize: '0.875rem',
                      outline: 'none',
                      background: selectedManufacturer ? '#f8fafc' : '#f0fdf4',
                      color: selectedManufacturer ? '#0f172a' : '#065f46',
                      fontWeight: 700
                    }}
                  >
                    <option value="">🌐 -- All Manufacturers (Combined Grand Total) --</option>
                    {manufacturers.map((m, idx) => (
                      <option key={idx} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Optional Supplier Distributor Filter */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  2. Supplier / Distributor (Optional)
                </label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                    outline: 'none',
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontWeight: 500
                  }}
                >
                  <option value="">-- All Linked Suppliers --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.station ? `(${s.station})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Time Preset Buttons */}
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  3. Settlement Timeframe
                </label>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {[
                    { id: 'today', label: 'Today' },
                    { id: 'yesterday', label: 'Yesterday' },
                    { id: 'week', label: 'Last 7 Days (Week)' },
                    { id: 'month', label: 'This Month' },
                    { id: 'last_month', label: 'Last Month' },
                    { id: 'custom', label: 'Custom Date Range' }
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setTimePreset(preset.id as any)}
                      style={{
                        padding: '0.45rem 0.85rem',
                        borderRadius: '7px',
                        border: timePreset === preset.id ? '1px solid #0284c7' : '1px solid #cbd5e1',
                        background: timePreset === preset.id ? '#e0f2fe' : '#ffffff',
                        color: timePreset === preset.id ? '#0369a1' : '#475569',
                        fontWeight: timePreset === preset.id ? 700 : 500,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Date Pickers (Shown only when timePreset === 'custom') */}
              {timePreset === 'custom' && (
                <div style={{ display: 'flex', gap: '0.5rem', gridColumn: 'span 2' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', marginBottom: '0.2rem' }}>
                      From Date
                    </label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '7px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', marginBottom: '0.2rem' }}>
                      To Date
                    </label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '7px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Active Query Status Indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '1rem',
              paddingTop: '0.85rem',
              borderTop: '1px dashed #e2e8f0',
              fontSize: '0.82rem',
              color: '#64748b'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <span style={{ fontWeight: 600, color: '#334155' }}>Reconciliation Window:</span>
                <span style={{
                  background: '#f1f5f9',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '5px',
                  fontWeight: 600,
                  color: '#0284c7'
                }}>
                  {computedDateRange.displayLabel}
                </span>
                <span>•</span>
                <span style={{ fontWeight: 600, color: '#334155' }}>Manufacturer:</span>
                <span style={{ fontWeight: 700, color: selectedManufacturer ? '#0f172a' : '#059669' }}>
                  {selectedManufacturer ? selectedManufacturer : 'All Manufacturers (Grand Total)'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {/* Deduct Patient Returns Toggle */}
                <button
                  type="button"
                  onClick={() => setDeductReturns(!deductReturns)}
                  style={{
                    background: deductReturns ? '#e0f2fe' : '#f8fafc',
                    border: deductReturns ? '1px solid #0284c7' : '1px solid #cbd5e1',
                    color: deductReturns ? '#0369a1' : '#64748b',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    transition: 'all 0.15s ease'
                  }}
                  title="Toggle whether verified patient return vouchers should deduct from the pay-on-sale payout"
                >
                  <RotateCcw size={12} color={deductReturns ? '#0284c7' : '#94a3b8'} />
                  Deduct Patient Returns: <span style={{ color: deductReturns ? '#0284c7' : '#0f172a' }}>{deductReturns ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  onClick={calculateSettlement}
                  disabled={loadingCalculation}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0284c7',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.82rem'
                  }}
                >
                  <RefreshCw size={14} className={loadingCalculation ? 'animate-spin' : ''} />
                  {loadingCalculation ? 'Re-calculating...' : 'Refresh Numbers'}
                </button>
              </div>
            </div>
          </div>

          {/* KPI Dashboard Cards */}
          {summary && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem'
            }}>
              {/* Card 1: NET PAYABLE AMOUNT (COST PRICE BASIS) */}
              <div style={{
                background: 'linear-gradient(135deg, #065f46, #047857)',
                color: '#ffffff',
                padding: '1.25rem',
                borderRadius: '14px',
                boxShadow: '0 4px 14px rgba(4, 120, 87, 0.25)',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#a7f3d0', fontWeight: 700 }}>
                      {selectedManufacturer ? `Net Payable to ${selectedManufacturer}` : 'Net Payable to All Manufacturers'}
                    </div>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, marginTop: '0.3rem', letterSpacing: '-0.02em' }}>
                      ₹{summary.netPayableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.15)', padding: '0.5rem', borderRadius: '10px' }}>
                    <IndianRupee size={22} color="#ffffff" />
                  </div>
                </div>

                <div style={{ marginTop: '0.85rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: '0.75rem', color: '#d1fae5' }}>
                  <span>Strictly at Purchase Cost (PTR)</span>
                  {summary.returnDeduction > 0 && (
                    <span style={{ float: 'right', fontWeight: 600 }}>
                      -₹{summary.returnDeduction.toFixed(2)} returns deducted
                    </span>
                  )}
                </div>
              </div>

              {/* Card 2: NET UNITS SOLD */}
              <div style={{
                background: '#ffffff',
                padding: '1.25rem',
                borderRadius: '14px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>
                      Net Units Sold
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.3rem', color: '#0f172a' }}>
                      {summary.netSoldUnits.toLocaleString('en-IN')} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#64748b' }}>units</span>
                    </div>
                  </div>
                  <div style={{ background: '#e0f2fe', padding: '0.5rem', borderRadius: '10px', color: '#0284c7' }}>
                    <Package size={22} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.85rem', fontSize: '0.75rem' }}>
                  <span style={{ background: '#f1f5f9', color: '#475569', padding: '0.2rem 0.45rem', borderRadius: '5px', fontWeight: 600 }}>
                    Gross: {summary.grossSoldUnits}
                  </span>
                  <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.2rem 0.45rem', borderRadius: '5px', fontWeight: 600 }}>
                    Returns: -{summary.returnedUnits}
                  </span>
                </div>
              </div>

              {/* Card 3: SALES RETURNS DEDUCTION */}
              <div style={{
                background: '#ffffff',
                padding: '1.25rem',
                borderRadius: '14px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#b91c1c', fontWeight: 700 }}>
                      Patient Returns Deducted
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.3rem', color: '#b91c1c' }}>
                      -₹{summary.returnDeduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div style={{ background: '#fee2e2', padding: '0.5rem', borderRadius: '10px', color: '#dc2626' }}>
                    <RotateCcw size={22} />
                  </div>
                </div>

                <div style={{ marginTop: '0.85rem', fontSize: '0.75rem', color: '#64748b' }}>
                  <span>{summary.returnedUnits} units returned at CP rate</span>
                </div>
              </div>

              {/* Card 4: REALIZED RETAIL VALUE & MARGIN */}
              <div style={{
                background: '#ffffff',
                padding: '1.25rem',
                borderRadius: '14px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>
                      Retail Sales Realized (MRP)
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.3rem', color: '#0f172a' }}>
                      ₹{summary.retailSalesValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div style={{ background: '#fef3c7', padding: '0.5rem', borderRadius: '10px', color: '#d97706' }}>
                    <TrendingUp size={22} />
                  </div>
                </div>

                <div style={{ marginTop: '0.85rem', fontSize: '0.75rem', color: '#059669', fontWeight: 700 }}>
                  <span>Pharmacy Margin: ₹{summary.realizedMargin.toFixed(2)} ({summary.marginPercentage.toFixed(1)}%)</span>
                </div>
              </div>
            </div>
          )}

          {/* Itemized Audit Breakdown Table */}
          <div style={{
            background: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            overflow: 'hidden'
          }}>
            {/* Table Header & Search */}
            <div style={{
              padding: '1rem 1.25rem',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              background: '#f8fafc'
            }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  Itemized Batch Reconciliation & Payout Table
                </h3>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                  Formula: (Gross Sold Units − Returned Units) × Batch Cost Price (PTR)
                </p>
              </div>

              <div style={{ position: 'relative', minWidth: '260px' }}>
                <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="Filter by medicine, batch or SKU..."
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.85rem 0.45rem 2rem',
                    borderRadius: '7px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.82rem',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
            </div>

            {/* Table View */}
            {loadingCalculation ? (
              <div style={{ padding: '3.5rem', textAlign: 'center', color: '#64748b' }}>
                <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 0.75rem', color: '#0284c7' }} />
                <div style={{ fontWeight: 600 }}>Calculating batch sales and returns...</div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
                <Package size={36} color="#cbd5e1" style={{ margin: '0 auto 0.75rem' }} />
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#334155' }}>
                  No Sold or Returned Items Found
                </div>
                <div style={{ fontSize: '0.85rem', marginTop: '0.3rem', maxWidth: '480px', margin: '0.3rem auto 0' }}>
                  {selectedManufacturer
                    ? `No billing or returns recorded for "${selectedManufacturer}" during ${computedDateRange.displayLabel}.`
                    : 'Select a manufacturer and time window above to calculate settlements.'}
                </div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>#</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Medicine & Generic</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Batch & Expiry</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Gross Sold</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#b91c1c' }}>Patient Returns</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 800 }}>Net Sold</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Cost Price (PTR)</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>MRP</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 800, color: '#065f46' }}>Net Payable (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item, idx) => (
                      <tr
                        key={item.batchId}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                          transition: 'background 0.1s ease'
                        }}
                      >
                        <td style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontSize: '0.78rem' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.medicineName}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {item.manufacturer && (
                              <span style={{
                                fontWeight: 700,
                                color: '#0284c7',
                                background: '#e0f2fe',
                                padding: '0.1rem 0.35rem',
                                borderRadius: '4px',
                                marginRight: '0.4rem',
                                fontSize: '0.7rem'
                              }}>
                                {item.manufacturer}
                              </span>
                            )}
                            {item.genericName || 'Formula'} • {item.unit} (Pack of {item.conversionFactor})
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{
                            background: '#e0f2fe',
                            color: '#0369a1',
                            padding: '0.2rem 0.45rem',
                            borderRadius: '4px',
                            fontWeight: 700,
                            fontSize: '0.75rem'
                          }}>
                            {item.batchNumber}
                          </span>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                            Exp: {item.expiryDate || 'N/A'}
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <div style={{ fontWeight: 600 }}>{item.grossSoldUnits} units</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            {item.grossSoldStrips} strips {item.grossSoldLoose > 0 ? `+ ${item.grossSoldLoose} loose` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: item.returnedUnits > 0 ? '#b91c1c' : '#94a3b8' }}>
                          {item.returnedUnits > 0 ? (
                            <>
                              <div style={{ fontWeight: 700 }}>-{item.returnedUnits} units</div>
                              <div style={{ fontSize: '0.72rem' }}>-₹{item.returnCostDeduction.toFixed(2)}</div>
                            </>
                          ) : (
                            '0'
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                          <div>{item.netSoldUnits} units</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>
                            {item.netSoldStrips} strips {item.netSoldLoose > 0 ? `+ ${item.netSoldLoose} loose` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <div style={{ fontWeight: 600 }}>₹{item.ptr.toFixed(2)}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            ₹{item.unitCostPrice.toFixed(2)}/tab
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <div style={{ fontWeight: 600 }}>₹{item.mrp.toFixed(2)}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 800, color: '#047857', fontSize: '0.95rem' }}>
                          ₹{item.netPayableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Summary Footer */}
                  <tfoot>
                    <tr style={{ background: '#f1f5f9', fontWeight: 800, borderTop: '2px solid #cbd5e1' }}>
                      <td colSpan={3} style={{ padding: '0.85rem 1rem', color: '#0f172a' }}>
                        TOTALS ({filteredItems.length} BATCHES)
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        {summary?.grossSoldUnits} units
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: '#b91c1c' }}>
                        -{summary?.returnedUnits} units
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        {summary?.netSoldUnits} units
                      </td>
                      <td colSpan={2} style={{ padding: '0.85rem 1rem', textAlign: 'right', color: '#64748b' }}>
                        Net Payout at PTR:
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: '#047857', fontSize: '1.05rem' }}>
                        ₹{summary?.netPayableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* History & Past Settlements View */
        <div style={{
          background: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '1.25rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            background: '#f8fafc'
          }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                Settlement Payout Records & Vouchers
              </h3>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                All historical Pay-on-Sale payments issued to manufacturers and distributors.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div style={{ position: 'relative', minWidth: '260px' }}>
                <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadHistory()}
                  placeholder="Search voucher, manufacturer, ref..."
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.85rem 0.45rem 2rem',
                    borderRadius: '7px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.82rem',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <button
                onClick={loadHistory}
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '0.45rem 0.9rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Search
              </button>
            </div>
          </div>

          {loadingHistory ? (
            <div style={{ padding: '3.5rem', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 0.75rem', color: '#0284c7' }} />
              <div style={{ fontWeight: 600 }}>Loading settlement history...</div>
            </div>
          ) : historyList.length === 0 ? (
            <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
              <History size={36} color="#cbd5e1" style={{ margin: '0 auto 0.75rem' }} />
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#334155' }}>
                No Settlement Records Found
              </div>
              <div style={{ fontSize: '0.85rem', marginTop: '0.3rem', color: '#64748b' }}>
                Settlements saved from the "Calculate & Settle Payout" tab will appear here.
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Voucher #</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Manufacturer / Supplier</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Reconciled Period</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Net Units Sold</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Payable (CP)</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#065f46', fontWeight: 800 }}>Paid Amount</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Payment Mode</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {historyList.map((h, idx) => (
                    <tr
                      key={h.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: idx % 2 === 0 ? '#ffffff' : '#fafafa'
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          background: '#e0f2fe',
                          color: '#0369a1',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '5px',
                          fontWeight: 700,
                          fontSize: '0.8rem'
                        }}>
                          {h.settlementNumber}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                        {new Date(h.settlementDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>
                          {h.manufacturer || h.supplier?.name || 'Manufacturer'}
                        </div>
                        {h.supplier && h.manufacturer && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            Supplier: {h.supplier.name}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: '#64748b' }}>
                        {new Date(h.periodStartDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} → {new Date(h.periodEndDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                        {h.netSoldUnits} units
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#475569' }}>
                        ₹{Number(h.netPayableAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 800, color: '#047857', fontSize: '0.95rem' }}>
                        ₹{Number(h.paidAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          background: '#f1f5f9',
                          color: '#334155',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}>
                          {h.paymentMode.replace('_', ' ')}
                        </span>
                        {h.paymentRef && (
                          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.15rem' }}>
                            Ref: {h.paymentRef}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem' }}>
                          <button
                            onClick={() => handleViewHistoryItem(h)}
                            title="View / Print Voucher Slip"
                            style={{
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              color: '#334155',
                              padding: '0.35rem 0.55rem',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: 600
                            }}
                          >
                            <Eye size={13} /> View
                          </button>
                          <button
                            onClick={() => handleDeleteHistory(h.id, h.settlementNumber)}
                            title="Delete settlement record"
                            style={{
                              background: '#fee2e2',
                              border: '1px solid #fca5a5',
                              color: '#b91c1c',
                              padding: '0.35rem 0.5rem',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* RECORD SETTLEMENT / PAYOUT MODAL */}
      {showRecordModal && summary && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              background: 'linear-gradient(135deg, #065f46, #047857)',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                  Record Manufacturer Payout
                </h3>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#a7f3d0' }}>
                  Pay-on-Sale Settlement for {selectedManufacturer || 'Supplier'}
                </p>
              </div>
              <button
                onClick={() => setShowRecordModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '0.2rem' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSavePayout} style={{ padding: '1.5rem' }}>
              {recordError && (
                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  fontSize: '0.85rem'
                }}>
                  {recordError}
                </div>
              )}

              {/* Settlement Summary Snapshot Card */}
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '10px',
                padding: '1rem',
                marginBottom: '1.25rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.82rem', color: '#166534' }}>
                  <span>Gross Sold Cost:</span>
                  <span style={{ fontWeight: 600 }}>₹{summary.grossPayableCost.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.82rem', color: '#b91c1c' }}>
                  <span>Sales Returns Deducted:</span>
                  <span style={{ fontWeight: 600 }}>-₹{summary.returnDeduction.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.4rem', borderTop: '1px dashed #86efac', fontSize: '1rem', fontWeight: 800, color: '#14532d' }}>
                  <span>Net Payable (Cost Price):</span>
                  <span>₹{summary.netPayableAmount.toFixed(2)}</span>
                </div>
              </div>

              {/* Form Fields */}
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '0.35rem' }}>
                    Amount Paid (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '1.1rem',
                      fontWeight: 800,
                      color: '#065f46',
                      background: '#ffffff'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '0.35rem' }}>
                      Payment Mode
                    </label>
                    <select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.875rem',
                        background: '#ffffff'
                      }}
                    >
                      <option value="BANK_TRANSFER">Bank Transfer / NEFT / RTGS</option>
                      <option value="UPI">UPI / GPay / PhonePe</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="CASH">Cash</option>
                      <option value="CREDIT_NOTE">Credit Note Adjustment</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '0.35rem' }}>
                      Reference / UTR / Cheque #
                    </label>
                    <input
                      type="text"
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                      placeholder="e.g. UTR12893892 or Chq# 4029"
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '0.35rem' }}>
                    Notes & Remarks
                  </label>
                  <textarea
                    rows={2}
                    value={settlementNotes}
                    onChange={(e) => setSettlementNotes(e.target.value)}
                    placeholder="e.g. Reconciled with Sun Pharma MR on 9th Oct..."
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowRecordModal(false)}
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPayout}
                  style={{
                    padding: '0.6rem 1.5rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #059669, #047857)',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(4, 120, 87, 0.25)'
                  }}
                >
                  {submittingPayout ? 'Recording...' : 'Confirm & Save Payout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINTABLE STATEMENT & VOUCHER SLIP MODAL */}
      {showPrintModal && statementData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '820px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            overflow: 'hidden'
          }}>
            {/* Modal Actions Bar (Invisible in print) */}
            <div className="no-print" style={{
              padding: '1rem 1.5rem',
              background: '#0f172a',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={18} color="#38bdf8" />
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  Settlement Statement Slip #{statementData.voucherNumber}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => window.print()}
                  style={{
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '7px',
                    padding: '0.45rem 1rem',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  <Printer size={15} /> Print Slip
                </button>
                <button
                  onClick={() => setShowPrintModal(false)}
                  style={{
                    background: '#334155',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '7px',
                    padding: '0.45rem 0.85rem',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Printable Content View */}
            <div style={{ padding: '2rem', overflowY: 'auto' }} id="printable-statement">
              {/* Pharmacy Header */}
              <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: '#0f172a' }}>
                      {activeCompany?.name || 'Pharmacy / Retail Store'}
                    </h2>
                    <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '0.2rem' }}>
                      {activeCompany?.address && `${activeCompany.address}, `}
                      {activeCompany?.city && `${activeCompany.city}, `}
                      {activeCompany?.state && `${activeCompany.state} - ${activeCompany?.pincode || ''}`}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.25rem' }}>
                      {activeCompany?.gstin && <span><strong>GSTIN:</strong> {activeCompany.gstin} &nbsp;|&nbsp; </span>}
                      {activeCompany?.drugLicenseNo && <span><strong>D.L. No:</strong> {activeCompany.drugLicenseNo}</span>}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      background: '#f1f5f9',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      color: '#0f172a',
                      display: 'inline-block'
                    }}>
                      PAY-ON-SALE SETTLEMENT
                    </div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0284c7', marginTop: '0.35rem' }}>
                      #{statementData.voucherNumber}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Date: {new Date(statementData.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Settlement Meta Information Box */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                marginBottom: '1.25rem',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1rem',
                fontSize: '0.82rem'
              }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>
                    Manufacturer / Entity
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a', marginTop: '0.15rem' }}>
                    {statementData.manufacturer}
                  </div>
                  {statementData.supplierName && (
                    <div style={{ color: '#475569', fontSize: '0.75rem' }}>
                      Distributor: {statementData.supplierName}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>
                    Reconciled Sales Period
                  </div>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginTop: '0.15rem' }}>
                    {new Date(statementData.periodStart).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    &nbsp;→&nbsp;
                    {new Date(statementData.periodEnd).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                </div>
              </div>

              {/* Itemized Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left', marginBottom: '1.25rem' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', color: '#334155', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '0.5rem 0.6rem' }}>#</th>
                    <th style={{ padding: '0.5rem 0.6rem' }}>Medicine & Pack</th>
                    <th style={{ padding: '0.5rem 0.6rem' }}>Batch No.</th>
                    <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>Gross Sold</th>
                    <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: '#b91c1c' }}>Returns</th>
                    <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 700 }}>Net Sold</th>
                    <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>Cost (PTR)</th>
                    <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 800 }}>Payable (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {statementData.items.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '0.45rem 0.6rem', color: '#94a3b8' }}>{idx + 1}</td>
                      <td style={{ padding: '0.45rem 0.6rem' }}>
                        <strong>{it.medicineName}</strong>
                        <span style={{ color: '#64748b', fontSize: '0.72rem' }}> ({it.unit || 'STRIP'})</span>
                      </td>
                      <td style={{ padding: '0.45rem 0.6rem', fontFamily: 'monospace' }}>{it.batchNumber}</td>
                      <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right' }}>{it.grossSoldUnits}</td>
                      <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: '#b91c1c' }}>
                        {it.returnedUnits > 0 ? `-${it.returnedUnits}` : '0'}
                      </td>
                      <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 700 }}>{it.netSoldUnits}</td>
                      <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right' }}>₹{it.ptr.toFixed(2)}</td>
                      <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 800 }}>₹{it.netPayableAmount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Settlement Summary Box */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
                <div style={{ width: '320px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569', marginBottom: '0.35rem' }}>
                    <span>Gross Sales Cost (PTR):</span>
                    <span>₹{statementData.summary.grossPayableCost.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#b91c1c', marginBottom: '0.35rem' }}>
                    <span>Sales Returns Deduction:</span>
                    <span>-₹{statementData.summary.returnDeduction.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', paddingTop: '0.35rem', borderTop: '1px solid #cbd5e1', marginBottom: '0.35rem' }}>
                    <span>Net Payable Payout:</span>
                    <span>₹{statementData.summary.netPayableAmount.toFixed(2)}</span>
                  </div>
                  {statementData.paidAmount !== undefined && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 800, color: '#059669', paddingTop: '0.25rem' }}>
                      <span>Amount Settled / Paid:</span>
                      <span>₹{statementData.paidAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {statementData.paymentMode && (
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.35rem', textAlign: 'right' }}>
                      Mode: {statementData.paymentMode.replace('_', ' ')}
                      {statementData.paymentRef ? ` (${statementData.paymentRef})` : ''}
                    </div>
                  )}
                </div>
              </div>

              {/* Authorized Signatures */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#475569' }}>
                <div>
                  <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '0.4rem', width: '200px', fontWeight: 600 }}>
                    Authorized Signatory / Store Mgr
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>For {activeCompany?.name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '0.4rem', width: '200px', marginLeft: 'auto', fontWeight: 600 }}>
                    Received / Acknowledged By
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Representative / Stockist Signature</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

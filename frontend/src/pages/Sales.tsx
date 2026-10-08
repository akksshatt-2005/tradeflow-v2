import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import * as XLSX from 'xlsx';
import POSBilling from './POSBilling';
import MultiPatientReturnModal, { MultiItemReturnSlip } from '../components/MultiPatientReturnModal';
import MultiItemReturnSlipModal from '../components/MultiItemReturnSlipModal';
import {
  ShoppingCart,
  Plus,
  Search,
  FileText,
  Calendar,
  IndianRupee,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  X,
  CreditCard,
  Printer,
  User,
  Filter,
  Trash2,
  Edit2,
  Download,
  RotateCcw,
  Receipt,
  TrendingUp,
  Package,
  Layers,
  ArrowDownLeft,
  Check
} from 'lucide-react';

interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  customerName: string;
  customerPhone?: string | null;
  doctorName?: string | null;
  patientName?: string | null;
  paymentMode: string;
  taxableAmount: number;
  totalTax: number;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  status: 'PAID' | 'PARTIAL' | 'UNPAID' | 'CANCELLED';
  notes?: string | null;
  party?: {
    id: string;
    name: string;
    mailTo?: string | null;
    phone?: string | null;
    gstin?: string | null;
  } | null;
  createdByUser: string;
  itemsCount: number;
  createdAt: string;
}

export interface PatientReturnItem {
  id: string;
  voucherNumber: string;
  createdAt: string;
  itemId: string;
  medicineName: string;
  sku: string;
  unit: string;
  conversionFactor: number;
  batchId: string;
  batchNumber: string;
  expiryDate?: string | null;
  mrp: number;
  pts: number;
  currentStock: number;
  unitsReturned: number;
  strips: number;
  looseQty: number;
  refundAmount: number;
  patientName: string;
  reason: string;
  rawNotes?: string | null;
  createdByUser: string;
}

type PeriodOption = 'TODAY' | 'WEEK' | 'MONTH' | 'ALL' | 'CUSTOM';
type SalesTab = 'INVOICES' | 'RETURNS';

export default function Sales() {
  const { activeCompany } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [patientReturns, setPatientReturns] = useState<PatientReturnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SalesTab>('INVOICES');
  const [period, setPeriod] = useState<PeriodOption>('TODAY');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // View / Creation State
  const [showPOS, setShowPOS] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Multi-Item Patient Return State
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [viewingMultiReturnSlip, setViewingMultiReturnSlip] = useState<MultiItemReturnSlip | null>(null);

  // Payment Recording State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);

  const getDateRangeForPeriod = (p: PeriodOption, customStart?: string, customEnd?: string) => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (p === 'TODAY') {
      return { startDate: todayStr, endDate: todayStr, label: "Today's Sale (1 Day)" };
    }
    if (p === 'WEEK') {
      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate: past7.toISOString().split('T')[0], endDate: todayStr, label: '1 Week Sale (Last 7 Days)' };
    }
    if (p === 'MONTH') {
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startDate: past30.toISOString().split('T')[0], endDate: todayStr, label: '1 Month Sale (Last 30 Days)' };
    }
    if (p === 'CUSTOM') {
      return {
        startDate: customStart || '',
        endDate: customEnd || '',
        label: customStart && customEnd ? `Custom (${customStart} to ${customEnd})` : 'Custom Date Range'
      };
    }
    return { startDate: '', endDate: '', label: 'All Records' };
  };

  useEffect(() => {
    if (period !== 'CUSTOM') {
      fetchSalesData(period);
    } else if (customStartDate && customEndDate) {
      fetchSalesData('CUSTOM', customStartDate, customEndDate);
    }
  }, [activeCompany?.id, period, customStartDate, customEndDate]);

  const fetchSalesData = async (overridePeriod?: PeriodOption, overrideStart?: string, overrideEnd?: string) => {
    if (!activeCompany) return;
    try {
      setLoading(true);
      setError(null);
      const activePeriod = overridePeriod ?? period;
      const { startDate, endDate } = getDateRangeForPeriod(
        activePeriod,
        overrideStart ?? customStartDate,
        overrideEnd ?? customEndDate
      );

      const queryParams: Record<string, string> = { limit: '1000' };
      if (startDate) queryParams.startDate = startDate;
      if (endDate) queryParams.endDate = endDate;

      const queryString = new URLSearchParams(queryParams).toString();

      const [invRes, retRes] = await Promise.all([
        api.get<{ invoices: InvoiceListItem[] }>(`/api/invoices?${queryString}`, {
          companyId: activeCompany.id
        }).catch(err => {
          console.error('Invoice fetch error:', err);
          return { invoices: [] };
        }),
        api.get<{ returns: PatientReturnItem[] }>(`/api/inventory/patient-returns?${queryString}`, {
          companyId: activeCompany.id
        }).catch(err => {
          console.error('Patient returns fetch error:', err);
          return { returns: [] };
        })
      ]);

      setInvoices(invRes.invoices || []);
      setPatientReturns(retRes.returns || []);
    } catch (err: any) {
      console.error('Failed to fetch sales data:', err);
      setError('Failed to load sales records. Please check connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportSales = () => {
    if (invoices.length === 0 && patientReturns.length === 0) {
      alert('No sales or return records to export for this period.');
      return;
    }

    const workbook = XLSX.utils.book_new();

    // Sheet 1: Invoices
    if (invoices.length > 0) {
      const invData = invoices.map((inv, idx) => ({
        'S.No': idx + 1,
        'Invoice #': inv.invoiceNumber,
        'Invoice Date': inv.invoiceDate ? inv.invoiceDate.split('T')[0] : '',
        'Customer / Party Name': (inv.customerName && inv.customerName !== 'Cash Customer') ? inv.customerName : (inv.party?.mailTo || inv.party?.name || inv.customerName),
        'Customer Phone': inv.customerPhone || inv.party?.phone || '',
        'Doctor Name': inv.doctorName || '',
        'Patient Name': inv.patientName || '',
        'Payment Mode': inv.paymentMode,
        'Items Count': inv.itemsCount,
        'Taxable (₹)': inv.taxableAmount,
        'Total Tax (₹)': inv.totalTax,
        'Grand Total (₹)': inv.grandTotal,
        'Paid Amount (₹)': inv.paidAmount,
        'Balance Due (₹)': inv.balanceAmount,
        'Status': inv.status,
        'Billed By': inv.createdByUser,
        'Notes': inv.notes || ''
      }));
      const wsInv = XLSX.utils.json_to_sheet(invData);
      XLSX.utils.book_append_sheet(workbook, wsInv, 'Sales Invoices (Gross)');
    }

    // Sheet 2: Patient Returns
    if (patientReturns.length > 0) {
      const retData = patientReturns.map((ret, idx) => ({
        'S.No': idx + 1,
        'Voucher #': ret.voucherNumber,
        'Return Date': new Date(ret.createdAt).toLocaleString('en-IN'),
        'Patient Name': ret.patientName,
        'Medicine Name': ret.medicineName,
        'Batch Number': ret.batchNumber,
        'Expiry Date': ret.expiryDate || '',
        'Strips Returned': ret.strips,
        'Loose Tabs Returned': ret.looseQty,
        'Total Units Inwarded': ret.unitsReturned,
        'MRP / Unit (₹)': ret.mrp,
        'Refund Amount (₹)': ret.refundAmount,
        'Return Reason': ret.reason,
        'Processed By': ret.createdByUser
      }));
      const wsRet = XLSX.utils.json_to_sheet(retData);
      XLSX.utils.book_append_sheet(workbook, wsRet, 'Patient Returns & Refunds');
    }

    // Sheet 3: Financial Period Summary
    const activeInvs = invoices.filter(inv => inv.status !== 'CANCELLED');
    const grossVal = activeInvs.reduce((sum, inv) => sum + inv.grandTotal, 0);
    const returnVal = patientReturns.reduce((sum, ret) => sum + ret.refundAmount, 0);
    const netVal = Math.max(0, grossVal - returnVal);
    const receivedVal = activeInvs.reduce((sum, inv) => sum + inv.paidAmount, 0);

    const summaryData = [
      { 'Metric': 'Selected Period', 'Value': getDateRangeForPeriod(period, customStartDate, customEndDate).label },
      { 'Metric': 'Gross Invoiced Sales (A)', 'Value': `₹${grossVal.toFixed(2)}` },
      { 'Metric': 'Patient Returns / Refunds (B)', 'Value': `-₹${returnVal.toFixed(2)}` },
      { 'Metric': 'NET REALIZED SALES (A - B)', 'Value': `₹${netVal.toFixed(2)}` },
      { 'Metric': 'Collected Cash / UPI', 'Value': `₹${receivedVal.toFixed(2)}` },
      { 'Metric': 'Total Invoices Count', 'Value': activeInvs.length },
      { 'Metric': 'Total Patient Returns Count', 'Value': patientReturns.length }
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, wsSummary, 'Sales & Returns Summary');

    const compName = (activeCompany?.name || 'Pharmacy').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(workbook, `Sales_and_Patient_Returns_${compName}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleViewInvoice = async (invoiceId: string) => {
    if (!activeCompany) return;
    try {
      setLoadingDetails(true);
      const res = await api.get<{ invoice: any }>(`/api/invoices/${invoiceId}`, {
        companyId: activeCompany.id
      });
      setViewingInvoice(res.invoice);
    } catch (err: any) {
      console.error('Failed to fetch invoice details:', err);
      setError('Could not load bill details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOpenPayment = (inv: InvoiceListItem) => {
    setViewingInvoice(inv);
    setPaymentAmount(String(inv.balanceAmount));
    setShowPaymentModal(true);
  };

  const handleRecordPayment = async () => {
    if (!activeCompany || !viewingInvoice) return;
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      setError('Please enter a valid payment amount');
      return;
    }

    try {
      setRecordingPayment(true);
      await api.post(`/api/invoices/${viewingInvoice.id}/payment`, {
        paymentAmount: amt,
        paymentMode: 'CASH',
        notes: 'Customer ledger settlement'
      }, {
        companyId: activeCompany.id,
        idempotencyKey: `pay-inv-${Date.now()}`
      });

      setShowPaymentModal(false);
      setViewingInvoice(null);
      fetchSalesData();
    } catch (err: any) {
      console.error('Failed to record customer payment:', err);
      setError(err.response?.data?.error || err.message || 'Failed to record payment');
    } finally {
      setRecordingPayment(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDeleteInvoice = async (invoiceId: string, invoiceNumber: string) => {
    if (!activeCompany) return;
    const target = invoices.find(inv => inv.id === invoiceId);
    const isCancelled = target?.status === 'CANCELLED';

    const confirmDelete = window.confirm(
      isCancelled
        ? `Permanently delete cancelled sale invoice #${invoiceNumber}?`
        : `Are you sure you want to cancel sale invoice #${invoiceNumber}?\n\nThis will atomically:\n- Mark invoice status as CANCELLED\n- Inward items and quantities back into batch inventory\n- Log append-only reversing audit ledger (ADJUSTMENT)\n- Reconcile customer balances`
    );
    if (!confirmDelete) return;

    try {
      setLoading(true);
      setError(null);
      await api.delete(`/api/invoices/${invoiceId}`, {
        companyId: activeCompany.id
      });
      if (viewingInvoice?.id === invoiceId) {
        setViewingInvoice(null);
      }
      await fetchSalesData();
    } catch (err: any) {
      console.error('Failed to cancel invoice:', err);
      setError(err.response?.data?.error || err.message || 'Failed to cancel invoice');
    } finally {
      setLoading(false);
    }
  };

  if (showPOS) {
    return (
      <POSBilling
        editingInvoiceId={editingInvoiceId}
        onBack={() => {
          setShowPOS(false);
          setEditingInvoiceId(null);
          fetchSalesData();
        }}
        onInvoiceCreated={() => {
          setEditingInvoiceId(null);
          fetchSalesData();
        }}
      />
    );
  }

  // Filter and sort invoices
  const filteredInvoices = [...invoices]
    .sort((a, b) => {
      const dateA = new Date(a.invoiceDate).getTime();
      const dateB = new Date(b.invoiceDate).getTime();
      if (dateB !== dateA) return dateB - dateA;
      const createdA = new Date(a.createdAt || a.invoiceDate).getTime();
      const createdB = new Date(b.createdAt || b.invoiceDate).getTime();
      return createdB - createdA;
    })
    .filter(inv =>
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      (inv.customerName && inv.customerName.toLowerCase().includes(search.toLowerCase())) ||
      (inv.patientName && inv.patientName.toLowerCase().includes(search.toLowerCase())) ||
      (inv.customerPhone && inv.customerPhone.includes(search)) ||
      (inv.doctorName && inv.doctorName.toLowerCase().includes(search.toLowerCase()))
    );

  // Filter patient returns
  const filteredReturns = [...patientReturns]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .filter(ret =>
      ret.medicineName.toLowerCase().includes(search.toLowerCase()) ||
      ret.patientName.toLowerCase().includes(search.toLowerCase()) ||
      ret.voucherNumber.toLowerCase().includes(search.toLowerCase()) ||
      ret.batchNumber.toLowerCase().includes(search.toLowerCase()) ||
      ret.reason.toLowerCase().includes(search.toLowerCase())
    );

  const activeInvoices = invoices.filter(inv => inv.status !== 'CANCELLED');
  const grossSalesVal = activeInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const totalReturnsVal = patientReturns.reduce((sum, ret) => sum + ret.refundAmount, 0);
  const netSalesVal = Math.max(0, grossSalesVal - totalReturnsVal);
  const totalReceivedVal = activeInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);

  return (
    <div className="sales-container" style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: '800', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, letterSpacing: '-0.02em' }}>
            <ShoppingCart style={{ color: 'var(--brand-teal)' }} /> Sales & Patient Returns
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
            Accurate Net Revenue = Gross Invoiced Sales − Patient Returns & Refunds
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleExportSales}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.7rem 1.1rem',
              fontSize: '0.88rem',
              fontWeight: '600',
              background: '#f8fafc',
              color: '#334155',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title="Export Sales Invoices, Patient Returns, and Net Summary to Excel"
          >
            <Download size={16} /> Export Excel
          </button>

          {/* Multi-Item Patient Return Action Button */}
          <button
            onClick={() => setShowReturnModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.7rem 1.25rem',
              fontSize: '0.9rem',
              fontWeight: '700',
              background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(225, 29, 72, 0.25)',
              transition: 'all 0.15s ease'
            }}
            title="Return 1 or multiple medicines brought back by a patient and issue refund / credit note"
          >
            <RotateCcw size={17} /> + Patient Return
          </button>

          {/* New Sale Button */}
          <button
            onClick={() => setShowPOS(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.7rem 1.35rem',
              fontSize: '0.92rem',
              fontWeight: '700',
              background: 'var(--brand-teal)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(20, 184, 166, 0.3)',
              transition: 'all 0.15s ease'
            }}
          >
            <Plus size={18} /> New Sale (POS)
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div style={{ background: 'rgba(34, 197, 94, 0.12)', border: '1px solid var(--accent-green)', padding: '0.8rem 1.2rem', borderRadius: '8px', color: 'var(--accent-green)', marginBottom: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '500', fontSize: '0.9rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Check size={18} /> {successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', padding: '0.8rem 1.2rem', borderRadius: '8px', color: 'var(--accent-red)', marginBottom: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '500', fontSize: '0.9rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
        </div>
      )}

      {/* 4-Metric Financial Cards (Gross, Returns, Net Sales, Received) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {/* 1. Gross Sales */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.15rem', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: '600' }}>
            <span>1. Gross Billed Sales</span>
            <FileText size={17} style={{ color: 'var(--brand-teal)' }} />
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '0.4rem', letterSpacing: '-0.02em' }}>
            ₹{grossSalesVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {activeInvoices.length} bills in {getDateRangeForPeriod(period, customStartDate, customEndDate).label.toLowerCase()}
          </div>
        </div>

        {/* 2. Patient Returns (Refunds) */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '12px', padding: '1.15rem', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#e11d48', fontSize: '0.82rem', fontWeight: '700' }}>
            <span>2. Patient Returns / Refunds</span>
            <RotateCcw size={17} style={{ color: '#e11d48' }} />
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: '800', color: '#e11d48', marginTop: '0.4rem', letterSpacing: '-0.02em' }}>
            −₹{totalReturnsVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ background: 'rgba(244, 63, 94, 0.1)', color: '#e11d48', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: '600' }}>
              {patientReturns.length} returns
            </span>
            <span>deducted from revenue</span>
          </div>
        </div>

        {/* 3. NET REALIZED SALES (Highlighted Master Metric) */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(20, 184, 166, 0.14) 100%)',
          border: '2px solid var(--accent-green)',
          borderRadius: '12px',
          padding: '1.15rem',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--accent-green)', fontSize: '0.85rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>⭐ Net Counter Sales</span>
            <TrendingUp size={19} style={{ color: 'var(--accent-green)' }} />
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: '900', color: 'var(--accent-green)', marginTop: '0.35rem', letterSpacing: '-0.02em' }}>
            ₹{netSalesVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem', fontWeight: '600' }}>
            True Revenue (Gross − Returns)
          </div>
        </div>

        {/* 4. Collected Cash & Digital */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.15rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: '600' }}>
            <span>Collected / Paid</span>
            <CheckCircle2 size={17} style={{ color: 'var(--accent-green)' }} />
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '0.4rem', letterSpacing: '-0.02em' }}>
            ₹{totalReceivedVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Direct counter & digital collections
          </div>
        </div>
      </div>

      {/* Period Filter & Navigation Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '1.2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem' }}>
          {/* Period Selector Chips */}
          <div style={{ display: 'flex', gap: '0.35rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.3rem', flexWrap: 'wrap' }}>
            {[
              { id: 'TODAY', label: '1 Day Sale (Today)' },
              { id: 'WEEK', label: '1 Week Sale' },
              { id: 'MONTH', label: '1 Month Sale' },
              { id: 'ALL', label: 'All Records' },
              { id: 'CUSTOM', label: 'Customized Date' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setPeriod(tab.id as PeriodOption);
                  if (tab.id === 'CUSTOM' && !customStartDate) {
                    const nowStr = new Date().toISOString().split('T')[0];
                    setCustomStartDate(nowStr);
                    setCustomEndDate(nowStr);
                  }
                }}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: period === tab.id ? 'var(--brand-teal)' : 'transparent',
                  color: period === tab.id ? '#fff' : 'var(--text-secondary)',
                  fontWeight: period === tab.id ? '700' : '500',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <Calendar size={14} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: '340px', maxWidth: '100%' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder={activeTab === 'INVOICES' ? "Search invoice #, customer, patient..." : "Search return slip #, medicine, patient..."}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.52rem 0.8rem 0.52rem 2.1rem',
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.85rem'
              }}
            />
          </div>
        </div>

        {/* Customized Date Range Pickers */}
        {period === 'CUSTOM' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.8rem',
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '0.7rem 1rem',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
              <Filter size={15} style={{ color: 'var(--brand-teal)' }} />
              <span>Select Custom Period:</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>From:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                style={{
                  padding: '0.4rem 0.6rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>To:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                style={{
                  padding: '0.4rem 0.6rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => fetchSalesData('CUSTOM', customStartDate, customEndDate)}
              style={{
                padding: '0.4rem 0.9rem',
                background: 'var(--brand-teal)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: '600',
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              Apply Filter
            </button>
            {(customStartDate || customEndDate) && (
              <button
                type="button"
                onClick={() => {
                  const nowStr = new Date().toISOString().split('T')[0];
                  setCustomStartDate(nowStr);
                  setCustomEndDate(nowStr);
                  fetchSalesData('CUSTOM', nowStr, nowStr);
                }}
                style={{
                  padding: '0.4rem 0.7rem',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Reset to Today
              </button>
            )}
          </div>
        )}
      </div>

      {/* Dual Tab Navigation (Sales Invoices vs. Patient Returns Log) */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('INVOICES')}
          style={{
            padding: '0.65rem 1.25rem',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'INVOICES' ? 'var(--card-bg)' : 'transparent',
            color: activeTab === 'INVOICES' ? 'var(--brand-teal)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'INVOICES' ? '800' : '600',
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: activeTab === 'INVOICES' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
            borderBottom: activeTab === 'INVOICES' ? '2px solid var(--brand-teal)' : 'none'
          }}
        >
          <Receipt size={17} />
          <span>Sales Invoices (Billed)</span>
          <span style={{
            background: activeTab === 'INVOICES' ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-secondary)',
            color: activeTab === 'INVOICES' ? 'var(--brand-teal)' : 'var(--text-muted)',
            padding: '0.15rem 0.5rem',
            borderRadius: '999px',
            fontSize: '0.78rem',
            fontWeight: '700'
          }}>
            {invoices.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('RETURNS')}
          style={{
            padding: '0.65rem 1.25rem',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'RETURNS' ? 'var(--card-bg)' : 'transparent',
            color: activeTab === 'RETURNS' ? '#e11d48' : 'var(--text-secondary)',
            fontWeight: activeTab === 'RETURNS' ? '800' : '600',
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: activeTab === 'RETURNS' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
            borderBottom: activeTab === 'RETURNS' ? '2px solid #e11d48' : 'none'
          }}
        >
          <RotateCcw size={17} />
          <span>Patient Returns & Refunds Log</span>
          <span style={{
            background: activeTab === 'RETURNS' ? 'rgba(244, 63, 94, 0.15)' : 'var(--bg-secondary)',
            color: activeTab === 'RETURNS' ? '#e11d48' : 'var(--text-muted)',
            padding: '0.15rem 0.5rem',
            borderRadius: '999px',
            fontSize: '0.78rem',
            fontWeight: '700'
          }}>
            {patientReturns.length} | −₹{totalReturnsVal.toFixed(2)}
          </span>
        </button>
      </div>

      {/* TAB 1: Invoices List Table */}
      {activeTab === 'INVOICES' && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading sales bills...
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <FileText size={40} style={{ opacity: 0.3, marginBottom: '0.8rem' }} />
              <p style={{ margin: 0, fontWeight: '600', fontSize: '1rem' }}>No sales invoices found for this period.</p>
              <p style={{ fontSize: '0.85rem', marginTop: '0.3rem', color: 'var(--text-muted)' }}>Click "New Sale (POS)" to bill your first prescription.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.9rem 1.2rem' }}>Invoice No.</th>
                    <th style={{ padding: '0.9rem 1.2rem' }}>Date & Time</th>
                    <th style={{ padding: '0.9rem 1.2rem' }}>Customer / Doctor</th>
                    <th style={{ padding: '0.9rem 1.2rem' }}>Items</th>
                    <th style={{ padding: '0.9rem 1.2rem' }}>Mode</th>
                    <th style={{ padding: '0.9rem 1.2rem', textAlign: 'right' }}>Total (₹)</th>
                    <th style={{ padding: '0.9rem 1.2rem', textAlign: 'right' }}>Balance Due (₹)</th>
                    <th style={{ padding: '0.9rem 1.2rem', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '0.9rem 1.2rem', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map(inv => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.9rem 1.2rem', fontWeight: '700', color: 'var(--brand-teal)' }}>
                        {inv.invoiceNumber}
                      </td>
                      <td style={{ padding: '0.9rem 1.2rem', color: 'var(--text-secondary)' }}>
                        {new Date(inv.invoiceDate).toLocaleDateString('en-IN')}
                      </td>
                      <td style={{ padding: '0.9rem 1.2rem' }}>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                          {inv.customerName && inv.customerName !== 'Cash Customer' 
                            ? inv.customerName 
                            : (inv.party?.mailTo || inv.customerName || inv.party?.name || 'Cash Customer')}
                        </div>
                        {inv.patientName && inv.patientName !== inv.customerName && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--brand-teal)', fontWeight: '500' }}>Patient: {inv.patientName}</div>
                        )}
                        {inv.party?.mailTo && inv.party?.name && inv.party.mailTo !== inv.party.name && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Legal: {inv.party.name}</div>
                        )}
                        {inv.doctorName && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{inv.doctorName.startsWith('Dr') ? inv.doctorName : `Dr. ${inv.doctorName}`}</div>
                        )}
                      </td>
                      <td style={{ padding: '0.9rem 1.2rem', color: 'var(--text-secondary)' }}>
                        {inv.itemsCount} medicines
                      </td>
                      <td style={{ padding: '0.9rem 1.2rem' }}>
                        <span style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          background: 'var(--bg-secondary)',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: 'var(--text-secondary)'
                        }}>
                          {inv.paymentMode}
                        </span>
                      </td>
                      <td style={{ padding: '0.9rem 1.2rem', textAlign: 'right', fontWeight: '700', color: 'var(--text-primary)' }}>
                        ₹{inv.grandTotal.toFixed(2)}
                      </td>
                      <td style={{
                        padding: '0.9rem 1.2rem',
                        textAlign: 'right',
                        fontWeight: '600',
                        color: inv.balanceAmount > 0 ? 'var(--accent-red)' : 'var(--text-secondary)'
                      }}>
                        {inv.balanceAmount > 0 ? `₹${inv.balanceAmount.toFixed(2)}` : '₹0.00'}
                      </td>
                      <td style={{ padding: '0.9rem 1.2rem', textAlign: 'center' }}>
                        <span style={{
                          padding: '0.25rem 0.6rem',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          background: inv.status === 'PAID'
                            ? 'rgba(34, 197, 94, 0.15)'
                            : inv.status === 'PARTIAL'
                            ? 'rgba(234, 179, 8, 0.15)'
                            : inv.status === 'CANCELLED'
                            ? 'rgba(148, 163, 184, 0.2)'
                            : 'rgba(239, 68, 68, 0.15)',
                          color: inv.status === 'PAID'
                            ? 'var(--accent-green)'
                            : inv.status === 'PARTIAL'
                            ? 'var(--accent-yellow)'
                            : inv.status === 'CANCELLED'
                            ? 'var(--text-muted)'
                            : 'var(--accent-red)'
                        }}>
                          {inv.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.9rem 1.2rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.45rem', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleViewInvoice(inv.id)}
                            style={{
                              padding: '0.4rem 0.6rem',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              fontSize: '0.8rem'
                            }}
                          >
                            <Eye size={14} /> View
                          </button>
                          {inv.status !== 'CANCELLED' && (
                            <button
                              onClick={() => {
                                setEditingInvoiceId(inv.id);
                                setShowPOS(true);
                              }}
                              style={{
                                padding: '0.4rem 0.6rem',
                                background: 'rgba(59, 130, 246, 0.12)',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                borderRadius: '6px',
                                color: '#2563eb',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                fontSize: '0.8rem',
                                fontWeight: '600'
                              }}
                              title="Edit this invoice"
                            >
                              <Edit2 size={14} /> Edit
                            </button>
                          )}
                          {inv.status !== 'CANCELLED' && inv.balanceAmount > 0 && (
                            <button
                              onClick={() => handleOpenPayment(inv)}
                              style={{
                                padding: '0.4rem 0.6rem',
                                background: 'rgba(20, 184, 166, 0.15)',
                                border: '1px solid var(--brand-teal)',
                                borderRadius: '6px',
                                color: 'var(--brand-teal)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                fontSize: '0.8rem',
                                fontWeight: '600'
                              }}
                            >
                              <CreditCard size={14} /> Settle
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteInvoice(inv.id, inv.invoiceNumber)}
                            style={{
                              padding: '0.4rem 0.6rem',
                              background: 'rgba(239, 68, 68, 0.12)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              borderRadius: '6px',
                              color: '#ef4444',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              fontSize: '0.8rem',
                              fontWeight: '600'
                            }}
                            title={inv.status === 'CANCELLED' ? "Permanently delete cancelled invoice" : "Cancel invoice and reverse stock"}
                          >
                            <Trash2 size={14} /> {inv.status === 'CANCELLED' ? 'Delete' : 'Cancel'}
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

      {/* TAB 2: Patient Medicine Returns & Refunds Log Table */}
      {activeTab === 'RETURNS' && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.2rem', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem' }}>
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <RotateCcw size={16} style={{ color: '#e11d48' }} /> Patient Returns & Credit Notes Audit Log
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                All inwarded returns are automatically added back into batch inventory stock and deducted from Net Sales.
              </div>
            </div>
            <button
              onClick={() => setShowReturnModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 1rem',
                fontSize: '0.85rem',
                fontWeight: '700',
                background: '#e11d48',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              <Plus size={15} /> + Log Patient Return
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading patient returns...
            </div>
          ) : filteredReturns.length === 0 ? (
            <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <RotateCcw size={42} style={{ opacity: 0.3, marginBottom: '0.8rem', color: '#e11d48' }} />
              <p style={{ margin: 0, fontWeight: '600', fontSize: '1.05rem' }}>No patient returns recorded in this period.</p>
              <p style={{ fontSize: '0.85rem', marginTop: '0.3rem', color: 'var(--text-muted)' }}>
                When a patient returns medicines, click <strong>"+ Patient Return"</strong> to log the refund and restore inventory.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.9rem 1.2rem' }}>Voucher / Slip #</th>
                    <th style={{ padding: '0.9rem 1.2rem' }}>Date & Time</th>
                    <th style={{ padding: '0.9rem 1.2rem' }}>Patient Name</th>
                    <th style={{ padding: '0.9rem 1.2rem' }}>Medicine & Batch</th>
                    <th style={{ padding: '0.9rem 1.2rem', textAlign: 'center' }}>Returned Qty</th>
                    <th style={{ padding: '0.9rem 1.2rem', textAlign: 'right' }}>Refund Amount (₹)</th>
                    <th style={{ padding: '0.9rem 1.2rem' }}>Return Reason</th>
                    <th style={{ padding: '0.9rem 1.2rem', textAlign: 'center' }}>Stock Status</th>
                    <th style={{ padding: '0.9rem 1.2rem', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReturns.map(ret => (
                    <tr key={ret.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.9rem 1.2rem', fontWeight: '700', color: '#e11d48' }}>
                        {ret.voucherNumber}
                      </td>
                      <td style={{ padding: '0.9rem 1.2rem', color: 'var(--text-secondary)' }}>
                        <div>{new Date(ret.createdAt).toLocaleDateString('en-IN')}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{new Date(ret.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td style={{ padding: '0.9rem 1.2rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                        {ret.patientName}
                      </td>
                      <td style={{ padding: '0.9rem 1.2rem' }}>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{ret.medicineName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--brand-teal)' }}>
                          Batch: <strong>{ret.batchNumber}</strong> {ret.expiryDate ? `(Exp: ${ret.expiryDate})` : ''}
                        </div>
                      </td>
                      <td style={{ padding: '0.9rem 1.2rem', textAlign: 'center' }}>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                          {ret.strips > 0 && ret.looseQty > 0
                            ? `${ret.strips} Str + ${ret.looseQty} Tab`
                            : ret.strips > 0
                            ? `${ret.strips} Strip(s)`
                            : `${ret.looseQty} Tab(s)`}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          ({ret.unitsReturned} base units)
                        </div>
                      </td>
                      <td style={{ padding: '0.9rem 1.2rem', textAlign: 'right', fontWeight: '800', color: '#e11d48', fontSize: '0.95rem' }}>
                        −₹{ret.refundAmount.toFixed(2)}
                      </td>
                      <td style={{ padding: '0.9rem 1.2rem', color: 'var(--text-secondary)', maxWidth: '220px' }}>
                        <span style={{ fontSize: '0.82rem' }}>{ret.reason}</span>
                      </td>
                      <td style={{ padding: '0.9rem 1.2rem', textAlign: 'center' }}>
                        <span style={{
                          padding: '0.2rem 0.55rem',
                          borderRadius: '999px',
                          background: 'rgba(34, 197, 94, 0.15)',
                          color: 'var(--accent-green)',
                          fontSize: '0.74rem',
                          fontWeight: '700',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}>
                          <Check size={12} /> +{ret.unitsReturned} Inwarded
                        </span>
                      </td>
                      <td style={{ padding: '0.9rem 1.2rem', textAlign: 'center' }}>
                        <button
                          onClick={() => {
                            // Find all items with this voucherNumber for multi-item view
                            const siblingReturns = patientReturns.filter(r => r.voucherNumber === ret.voucherNumber);
                            const totalRef = siblingReturns.reduce((s, r) => s + r.refundAmount, 0);
                            const totalUnits = siblingReturns.reduce((s, r) => s + r.unitsReturned, 0);

                            setViewingMultiReturnSlip({
                              voucherNumber: ret.voucherNumber,
                              createdAt: ret.createdAt,
                              patientName: ret.patientName,
                              reason: ret.reason,
                              totalRefundAmount: totalRef,
                              totalUnitsAdded: totalUnits,
                              createdByUser: ret.createdByUser,
                              items: siblingReturns.map(r => ({
                                medicineName: r.medicineName,
                                sku: r.sku,
                                batchNumber: r.batchNumber,
                                expiryDate: r.expiryDate,
                                unit: r.unit,
                                conversionFactor: r.conversionFactor,
                                strips: r.strips,
                                looseQty: r.looseQty,
                                unitsAdded: r.unitsReturned,
                                mrp: r.mrp,
                                refundAmount: r.refundAmount
                              }))
                            });
                          }}
                          style={{
                            padding: '0.4rem 0.65rem',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontSize: '0.8rem',
                            fontWeight: '600'
                          }}
                        >
                          <Printer size={14} /> Slip
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MULTI-ITEM PATIENT RETURN TERMINAL MODAL */}
      <MultiPatientReturnModal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        onSuccess={() => {
          fetchSalesData();
        }}
      />

      {/* MULTI-ITEM PATIENT RETURN VOUCHER / SLIP MODAL */}
      <MultiItemReturnSlipModal
        slip={viewingMultiReturnSlip}
        onClose={() => setViewingMultiReturnSlip(null)}
      />


      {/* INVOICE DETAILS MODAL */}
      {viewingInvoice && !showPaymentModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '850px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.5rem',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                    Invoice #{viewingInvoice.invoiceNumber}
                  </h2>
                  {Number(viewingInvoice.totalTax || 0) === 0 ? (
                    <span style={{ fontSize: '0.72rem', color: '#0284c7', background: 'rgba(2, 132, 199, 0.12)', border: '1px solid rgba(2, 132, 199, 0.25)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: '700' }}>
                      Non-GST Bill
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.72rem', color: '#0f766e', background: 'rgba(15, 118, 110, 0.12)', border: '1px solid rgba(15, 118, 110, 0.25)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: '700' }}>
                      GST Tax Invoice
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Billed on {new Date(viewingInvoice.invoiceDate).toLocaleDateString('en-IN')} by {viewingInvoice.createdByUser || 'Staff'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {viewingInvoice.status !== 'CANCELLED' && (
                  <button
                    onClick={() => {
                      const id = viewingInvoice.id;
                      setViewingInvoice(null);
                      setEditingInvoiceId(id);
                      setShowPOS(true);
                    }}
                    style={{
                      padding: '0.5rem 0.9rem',
                      background: 'rgba(59, 130, 246, 0.12)',
                      color: '#2563eb',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.85rem',
                      fontWeight: '600'
                    }}
                    title="Edit invoice"
                  >
                    <Edit2 size={15} /> Edit
                  </button>
                )}
                <button
                  onClick={() => handleDeleteInvoice(viewingInvoice.id, viewingInvoice.invoiceNumber)}
                  style={{
                    padding: '0.5rem 0.9rem',
                    background: 'rgba(239, 68, 68, 0.12)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.85rem',
                    fontWeight: '600'
                  }}
                  title={viewingInvoice.status === 'CANCELLED' ? "Permanently delete cancelled invoice" : "Cancel invoice"}
                >
                  <Trash2 size={15} /> {viewingInvoice.status === 'CANCELLED' ? 'Delete' : 'Cancel'}
                </button>
                <button
                  onClick={handlePrint}
                  style={{
                    padding: '0.5rem 0.9rem',
                    background: 'var(--brand-teal)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.85rem',
                    fontWeight: '600'
                  }}
                >
                  <Printer size={15} /> Print
                </button>
                <button
                  onClick={() => setViewingInvoice(null)}
                  style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem 0.7rem', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Customer & Prescription Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1.2rem', fontSize: '0.85rem' }}>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Customer Details</div>
                <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '1rem' }}>{viewingInvoice.customerName}</div>
                {viewingInvoice.customerPhone && <div>Phone: {viewingInvoice.customerPhone}</div>}
                {viewingInvoice.customerGstin && <div>GSTIN: {viewingInvoice.customerGstin}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Prescription & Payment</div>
                {viewingInvoice.doctorName && <div>Doctor: <strong>{viewingInvoice.doctorName.startsWith('Dr') ? viewingInvoice.doctorName : `Dr. ${viewingInvoice.doctorName}`}</strong></div>}
                {viewingInvoice.doctorRegNo && <div>Reg No: <strong>{viewingInvoice.doctorRegNo}</strong></div>}
                {viewingInvoice.patientName && <div>Patient: {viewingInvoice.patientName}</div>}
                <div>Payment Mode: <strong>{viewingInvoice.paymentMode}</strong></div>
              </div>
            </div>

            {/* Items Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '1.2rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.6rem 0.4rem' }}>#</th>
                  <th style={{ padding: '0.6rem 0.4rem' }}>Medicine</th>
                  <th style={{ padding: '0.6rem 0.4rem' }}>Batch</th>
                  <th style={{ padding: '0.6rem 0.4rem' }}>Exp</th>
                  <th style={{ padding: '0.6rem 0.4rem', textAlign: 'center' }}>Qty</th>
                  <th style={{ padding: '0.6rem 0.4rem', textAlign: 'right' }}>Rate (₹)</th>
                  <th style={{ padding: '0.6rem 0.4rem', textAlign: 'right' }}>GST</th>
                  <th style={{ padding: '0.6rem 0.4rem', textAlign: 'right' }}>Total (₹)</th>
                </tr>
              </thead>
              <tbody>
                {viewingInvoice.items?.map((item: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.6rem 0.4rem', color: 'var(--text-secondary)' }}>{i + 1}</td>
                    <td style={{ padding: '0.6rem 0.4rem' }}>
                      <div style={{ fontWeight: '600' }}>{item.medicineName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.sku}</div>
                    </td>
                    <td style={{ padding: '0.6rem 0.4rem' }}>{item.batchNumber}</td>
                    <td style={{ padding: '0.6rem 0.4rem', color: 'var(--text-secondary)' }}>
                      {new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                    </td>
                    <td style={{ padding: '0.6rem 0.4rem', textAlign: 'center', fontWeight: '600' }}>
                      {item.strips > 0 && item.looseQty > 0
                        ? `${item.strips} Str + ${item.looseQty} Tab`
                        : item.strips > 0
                        ? `${item.strips} Strip`
                        : item.looseQty > 0
                        ? `${item.looseQty} Tab`
                        : item.quantity}
                      {item.freeQuantity > 0 ? ` (+${item.freeQuantity} free)` : ''}
                    </td>
                    <td style={{ padding: '0.6rem 0.4rem', textAlign: 'right' }}>₹{Number(item.unitPrice).toFixed(2)}</td>
                    <td style={{ padding: '0.6rem 0.4rem', textAlign: 'right' }}>{item.gstRate}%</td>
                    <td style={{ padding: '0.6rem 0.4rem', textAlign: 'right', fontWeight: '700' }}>₹{Number(item.totalAmount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Total Calculations */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', fontSize: '0.9rem' }}>
              <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {Number(viewingInvoice.billDiscountAmt || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-red)' }}>
                    <span>Discount ({Number(viewingInvoice.billDiscountPct || 0)}%{Number(viewingInvoice.billDiscountPct || 0) === 10 ? ' Scheme' : ''}):</span>
                    <span style={{ fontWeight: '700' }}>-₹{Number(viewingInvoice.billDiscountAmt).toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Taxable Amount:</span>
                  <span>₹{Number(viewingInvoice.taxableAmount).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>{Number(viewingInvoice.totalTax || 0) > 0 ? 'Total Tax (GST):' : 'GST (0% / Exempt):'}</span>
                  <span>₹{Number(viewingInvoice.totalTax || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '800', fontSize: '1.1rem', color: 'var(--brand-teal)', borderTop: '1px solid var(--border-color)', paddingTop: '0.4rem' }}>
                  <span>Grand Total:</span>
                  <span>₹{Number(viewingInvoice.grandTotal).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-green)' }}>
                  <span>Amount Paid:</span>
                  <span>₹{Number(viewingInvoice.paidAmount).toFixed(2)}</span>
                </div>
                {Number(viewingInvoice.balanceAmount) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-red)', fontWeight: '700' }}>
                    <span>Balance Due:</span>
                    <span>₹{Number(viewingInvoice.balanceAmount).toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SETTLE BALANCE PAYMENT MODAL */}
      {showPaymentModal && viewingInvoice && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 110,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '450px',
            padding: '1.5rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                Settle Invoice Balance
              </h3>
              <button onClick={() => setShowPaymentModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <div>Invoice: <strong>{viewingInvoice.invoiceNumber}</strong></div>
              <div>Customer: <strong>{viewingInvoice.customerName}</strong></div>
              <div style={{ color: 'var(--accent-red)', marginTop: '0.4rem', fontWeight: '700' }}>
                Outstanding Balance: ₹{Number(viewingInvoice.balanceAmount).toFixed(2)}
              </div>
            </div>

            <div style={{ marginBottom: '1.2rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                Payment Amount (₹)
              </label>
              <input
                type="number"
                step="0.01"
                max={viewingInvoice.balanceAmount}
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.7rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontWeight: '700',
                  fontSize: '1rem'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button
                onClick={() => setShowPaymentModal(false)}
                style={{ flex: 1, padding: '0.7rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={recordingPayment}
                style={{ flex: 1, padding: '0.7rem', background: 'var(--brand-teal)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '700', cursor: 'pointer' }}
              >
                {recordingPayment ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

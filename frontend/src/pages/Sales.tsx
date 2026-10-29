import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { getLocalDateString } from '../utils/dateUtils';
import * as XLSX from 'xlsx';

import POSBilling from './POSBilling';
import ErrorBoundary from '../components/ErrorBoundary';
import MultiPatientReturnModal, { MultiItemReturnSlip } from '../components/MultiPatientReturnModal';
import MultiItemReturnSlipModal from '../components/MultiItemReturnSlipModal';
import { TaxInvoiceModal } from '../components/TaxInvoiceModal';
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
  Check,
  ChevronDown,
  ChevronRight,
  Banknote,
  QrCode
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
  costAmount?: number;
  mrpTotal?: number;
  profitAmount?: number;
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
  ptr?: number;
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

function formatInwardUnits(itm: {
  unitsReturned: number;
  strips: number;
  looseQty: number;
  conversionFactor?: number;
  unit?: string;
  medicineName?: string;
}) {
  const factor = itm.conversionFactor || 1;
  const unitUpper = (itm.unit || '').toUpperCase();
  const nameUpper = (itm.medicineName || '').toUpperCase();

  const isCap = unitUpper.includes('CAP') || nameUpper.includes('CAP');
  const isTab = unitUpper.includes('TAB') || nameUpper.includes('TAB');

  let baseUnitLabel = 'units';
  if (isCap) {
    baseUnitLabel = 'Cap';
  } else if (isTab || factor > 1) {
    baseUnitLabel = 'Tab';
  } else if (itm.unit) {
    baseUnitLabel = itm.unit;
  }

  // If item comes in strips/packs of multiple tablets/capsules
  if (factor > 1) {
    if (itm.strips > 0 && itm.looseQty > 0) {
      return `+${itm.unitsReturned} ${baseUnitLabel}s (${itm.strips} Str + ${itm.looseQty} ${baseUnitLabel})`;
    }
    if (itm.strips > 0) {
      return `+${itm.unitsReturned} ${baseUnitLabel}s (${itm.strips} ${itm.strips === 1 ? 'Strip' : 'Strips'})`;
    }
    // Only loose tablets returned
    return `+${itm.looseQty || itm.unitsReturned} ${baseUnitLabel}(s)`;
  }

  // Factor is 1 (bottles, syrups, injections, single packs)
  return `+${itm.unitsReturned} ${itm.unit || 'units'}`;
}

export interface GroupedPatientReturn {
  voucherNumber: string;
  createdAt: string;
  patientName: string;
  reason: string;
  createdByUser: string;
  totalRefundAmount: number;
  totalUnitsReturned: number;
  items: PatientReturnItem[];
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

  // Global hotkeys for Sales & POS
  useEffect(() => {
    const onOpenPOS = () => setShowPOS(true);
    const onClosePOS = () => setShowPOS(false);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setShowPOS(true);
      } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        setShowPOS(false);
      }
    };
    window.addEventListener('tradeflow_open_pos', onOpenPOS);
    window.addEventListener('tradeflow_close_pos', onClosePOS);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('tradeflow_open_pos', onOpenPOS);
      window.removeEventListener('tradeflow_close_pos', onClosePOS);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Multi-Item Patient Return State
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [viewingMultiReturnSlip, setViewingMultiReturnSlip] = useState<MultiItemReturnSlip | null>(null);
  const [expandedVouchers, setExpandedVouchers] = useState<Record<string, boolean>>({});

  const toggleExpandVoucher = (vNo: string) => {
    setExpandedVouchers(prev => ({
      ...prev,
      [vNo]: !prev[vNo]
    }));
  };

  // Payment Recording State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(getLocalDateString());
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER'>('CASH');
  const [referenceNo, setReferenceNo] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);

  const getDateRangeForPeriod = (p: PeriodOption, customStart?: string, customEnd?: string) => {
    const now = new Date();
    const todayStr = getLocalDateString(now);

    if (p === 'TODAY') {
      return { startDate: todayStr, endDate: todayStr, label: "Today's Sale (1 Day)" };
    }
    if (p === 'WEEK') {
      const past7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      return { startDate: getLocalDateString(past7), endDate: todayStr, label: '1 Week Sale (Last 7 Days)' };
    }
    if (p === 'MONTH') {
      const past30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
      return { startDate: getLocalDateString(past30), endDate: todayStr, label: '1 Month Sale (Last 30 Days)' };
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
        'Invoice Date': inv.invoiceDate ? getLocalDateString(new Date(inv.invoiceDate)) : '',
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

    // Sheet 2: Patient Return Vouchers (Grouped)
    if (groupedReturns.length > 0) {
      const retVoucherData = groupedReturns.map((grp, idx) => ({
        'S.No': idx + 1,
        'Voucher #': grp.voucherNumber,
        'Return Date': new Date(grp.createdAt).toLocaleString('en-IN'),
        'Patient Name': grp.patientName,
        'Items Count': grp.items.length,
        'Medicines Summary': grp.items.map(i => `${i.medicineName} (${i.unitsReturned} units)`).join('; '),
        'Total Units Inwarded': grp.totalUnitsReturned,
        'Total Refund Amount (₹)': grp.totalRefundAmount,
        'Return Reason': grp.reason,
        'Processed By': grp.createdByUser
      }));
      const wsRetVouchers = XLSX.utils.json_to_sheet(retVoucherData);
      XLSX.utils.book_append_sheet(workbook, wsRetVouchers, 'Patient Returns (Vouchers)');

      // Sheet 3: Itemized Return Lines
      const retItemData = patientReturns.map((ret, idx) => ({
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
      const wsRetItems = XLSX.utils.json_to_sheet(retItemData);
      XLSX.utils.book_append_sheet(workbook, wsRetItems, 'Return Lines (Itemized)');
    }

    // Sheet 4: Financial Period Summary
    const activeInvs = invoices.filter(inv => inv.status !== 'CANCELLED');
    const grossVal = activeInvs.reduce((sum, inv) => sum + inv.grandTotal, 0);
    const returnVal = patientReturns.reduce((sum, ret) => sum + ret.refundAmount, 0);
    const netVal = Math.max(0, grossVal - returnVal);
    const receivedVal = activeInvs.reduce((sum, inv) => sum + inv.paidAmount, 0);

    const grossCost = activeInvs.reduce((sum, inv) => sum + (inv.costAmount || 0), 0);
    const retCost = patientReturns.reduce((sum, ret) => {
      const factor = ret.conversionFactor || 1;
      const ptr = ret.ptr || 0;
      const cost = (ret.strips > 0 || ret.looseQty > 0)
        ? (ret.strips * ptr) + (ret.looseQty * (ptr / factor))
        : (ret.unitsReturned * (ptr / factor));
      return sum + cost;
    }, 0);
    const netCost = Math.max(0, grossCost - retCost);
    const netProfit = Math.max(0, netVal - netCost);
    const marginPct = netVal > 0 ? ((netProfit / netVal) * 100).toFixed(1) : '0.0';

    const cashVal = activeInvs.filter(inv => (inv.paymentMode || '').toUpperCase() === 'CASH').reduce((sum, inv) => sum + inv.paidAmount, 0);
    const upiVal = activeInvs.filter(inv => (inv.paymentMode || '').toUpperCase() === 'UPI').reduce((sum, inv) => sum + inv.paidAmount, 0);
    const cardVal = activeInvs.filter(inv => (inv.paymentMode || '').toUpperCase() === 'CARD').reduce((sum, inv) => sum + inv.paidAmount, 0);

    const summaryData = [
      { 'Metric': 'Selected Period', 'Value': getDateRangeForPeriod(period, customStartDate, customEndDate).label },
      { 'Metric': 'Gross Invoiced Sales (A)', 'Value': `₹${grossVal.toFixed(2)}` },
      { 'Metric': 'Patient Returns / Refunds (B)', 'Value': `-₹${returnVal.toFixed(2)}` },
      { 'Metric': 'NET REALIZED SALES (A - B)', 'Value': `₹${netVal.toFixed(2)}` },
      { 'Metric': 'Total Purchase Cost / Inward PTR', 'Value': `₹${netCost.toFixed(2)}` },
      { 'Metric': 'TOTAL ESTIMATED PROFIT (MRP - Purchase Cost)', 'Value': `₹${netProfit.toFixed(2)}` },
      { 'Metric': 'Profit Margin (%)', 'Value': `${marginPct}%` },
      { 'Metric': 'Collected Cash / UPI Total', 'Value': `₹${receivedVal.toFixed(2)}` },
      { 'Metric': '  ↳ Cash Sales Collected', 'Value': `₹${cashVal.toFixed(2)}` },
      { 'Metric': '  ↳ UPI Sales Collected', 'Value': `₹${upiVal.toFixed(2)}` },
      ...(cardVal > 0 ? [{ 'Metric': '  ↳ Card Sales Collected', 'Value': `₹${cardVal.toFixed(2)}` }] : []),
      { 'Metric': 'Total Invoices Count', 'Value': activeInvs.length },
      { 'Metric': 'Total Return Vouchers Count', 'Value': groupedReturns.length },
      { 'Metric': 'Total Return Items Count', 'Value': patientReturns.length }
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, wsSummary, 'Sales & Returns Summary');

    const compName = (activeCompany?.name || 'Pharmacy').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(workbook, `Sales_and_Patient_Returns_${compName}_${getLocalDateString()}.xlsx`);
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
    setPaymentAmount('');
    setPaymentDate(getLocalDateString());
    setPaymentMode('CASH');
    setReferenceNo('');
    setShowPaymentModal(true);
  };

  const handleVoidInvoicePayment = async (paymentId: string) => {
    if (!activeCompany || !viewingInvoice) return;
    if (!window.confirm('Are you sure you want to void / delete this payment voucher? The invoice balance and customer ledger will be updated automatically.')) {
      return;
    }
    try {
      await api.delete(`/api/invoices/payments/${paymentId}`, {
        companyId: activeCompany.id
      });
      alert('Payment voucher voided successfully');
      await handleViewInvoice(viewingInvoice.id);
      fetchSalesData();
    } catch (err: any) {
      console.error('Failed to void payment:', err);
      alert('Failed to void payment: ' + (err.message || 'Unknown error'));
    }
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
        paymentDate,
        paymentMode,
        referenceNo: referenceNo.trim() || undefined,
        notes: `Customer settlement for Bill #${viewingInvoice.invoiceNumber}`
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
      (inv.doctorName && inv.doctorName.toLowerCase().includes(search.toLowerCase())) ||
      (inv.paymentMode && inv.paymentMode.toLowerCase().includes(search.toLowerCase()))
    );

  // Group patient returns by voucherNumber so multi-item returns appear as 1 return entry
  const groupedReturns = useMemo<GroupedPatientReturn[]>(() => {
    const map = new Map<string, GroupedPatientReturn>();

    for (const ret of patientReturns) {
      const vKey = ret.voucherNumber || ret.id;
      if (!map.has(vKey)) {
        map.set(vKey, {
          voucherNumber: ret.voucherNumber || `RET-${ret.id.slice(0, 8)}`,
          createdAt: ret.createdAt,
          patientName: ret.patientName || 'Cash Customer',
          reason: ret.reason || 'Patient Return',
          createdByUser: ret.createdByUser || 'Staff',
          totalRefundAmount: 0,
          totalUnitsReturned: 0,
          items: []
        });
      }
      const grp = map.get(vKey)!;
      grp.totalRefundAmount += ret.refundAmount;
      grp.totalUnitsReturned += ret.unitsReturned;
      grp.items.push(ret);
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [patientReturns]);

  // Filter grouped patient returns
  const filteredGroupedReturns = useMemo<GroupedPatientReturn[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groupedReturns;
    return groupedReturns.filter(grp =>
      grp.voucherNumber.toLowerCase().includes(q) ||
      grp.patientName.toLowerCase().includes(q) ||
      grp.reason.toLowerCase().includes(q) ||
      grp.items.some(
        itm =>
          itm.medicineName.toLowerCase().includes(q) ||
          itm.batchNumber.toLowerCase().includes(q) ||
          itm.sku.toLowerCase().includes(q)
      )
    );
  }, [groupedReturns, search]);

  const activeInvoices = invoices.filter(inv => inv.status !== 'CANCELLED');
  const grossSalesVal = activeInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const totalReturnsVal = patientReturns.reduce((sum, ret) => sum + ret.refundAmount, 0);
  const netSalesVal = Math.max(0, grossSalesVal - totalReturnsVal);
  const totalReceivedVal = activeInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);

  // Breakdown of collections by payment mode (Cash flow & Digital)
  const cashReceivedVal = activeInvoices
    .filter(inv => (inv.paymentMode || '').toUpperCase() === 'CASH')
    .reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);

  const upiReceivedVal = activeInvoices
    .filter(inv => (inv.paymentMode || '').toUpperCase() === 'UPI')
    .reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);

  const cardReceivedVal = activeInvoices
    .filter(inv => (inv.paymentMode || '').toUpperCase() === 'CARD')
    .reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);

  const otherReceivedVal = Math.max(0, totalReceivedVal - cashReceivedVal - upiReceivedVal - cardReceivedVal);

  const cashCount = activeInvoices.filter(inv => (inv.paymentMode || '').toUpperCase() === 'CASH').length;
  const upiCount = activeInvoices.filter(inv => (inv.paymentMode || '').toUpperCase() === 'UPI').length;
  const cardCount = activeInvoices.filter(inv => (inv.paymentMode || '').toUpperCase() === 'CARD').length;

  // Total Purchase Cost & Profit (MRP - Purchase Price / PTR minus returns)
  const grossCostVal = activeInvoices.reduce((sum, inv) => sum + (inv.costAmount || 0), 0);
  const returnedCostVal = patientReturns.reduce((sum, ret) => {
    const factor = ret.conversionFactor || 1;
    const ptr = ret.ptr || 0;
    const cost = (ret.strips > 0 || ret.looseQty > 0)
      ? (ret.strips * ptr) + (ret.looseQty * (ptr / factor))
      : (ret.unitsReturned * (ptr / factor));
    return sum + cost;
  }, 0);
  const netCostVal = Math.max(0, grossCostVal - returnedCostVal);

  const grossProfitVal = activeInvoices.reduce((sum, inv) => sum + (inv.profitAmount || 0), 0);
  const netProfitVal = Math.max(0, grossProfitVal - Math.max(0, totalReturnsVal - returnedCostVal));
  const profitMarginPct = netSalesVal > 0 ? ((netProfitVal / netSalesVal) * 100) : 0;

  if (showPOS) {
    return (
      <ErrorBoundary
        fallbackTitle="POS Billing Terminal Encountered An Issue"
        onReset={() => {
          setShowPOS(false);
          setEditingInvoiceId(null);
          fetchSalesData();
        }}
      >
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
      </ErrorBoundary>
    );
  }

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
            <RotateCcw size={17} /> Patient Return
          </button>

          {/* New Sale Button */}
          <button
            onClick={() => setShowPOS(true)}
            title="Start new POS Sale [Alt+P]"
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
            <Plus size={18} /> New Sale (POS) <span style={{ fontSize: '0.72rem', background: 'rgba(255, 255, 255, 0.25)', padding: '2px 6px', borderRadius: '4px', marginLeft: '2px', fontWeight: 800 }}>Alt+P</span>
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
              {groupedReturns.length} return voucher{groupedReturns.length !== 1 ? 's' : ''} ({patientReturns.length} item{patientReturns.length !== 1 ? 's' : ''})
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
            <span>Net Counter Sales</span>
            <TrendingUp size={19} style={{ color: 'var(--accent-green)' }} />
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: '900', color: 'var(--accent-green)', marginTop: '0.35rem', letterSpacing: '-0.02em' }}>
            ₹{netSalesVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem', fontWeight: '600' }}>
            True Revenue (Gross − Returns)
          </div>

          {/* Total Profit */}
          <div style={{
            marginTop: '0.75rem',
            paddingTop: '0.65rem',
            borderTop: '1px dashed rgba(16, 185, 129, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.78rem',
            color: '#065f46'
          }}>
            <span style={{ fontWeight: 600 }}>Est. Profit:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <strong style={{ fontSize: '0.95rem', color: '#047857' }}>
                ₹{netProfitVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
              {profitMarginPct > 0 && (
                <span style={{ background: '#d1fae5', color: '#065f46', padding: '1px 5px', borderRadius: '4px', fontWeight: 700, fontSize: '0.7rem' }}>
                  ({profitMarginPct.toFixed(1)}%)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 4. Collected Cash & Digital */}
        <div style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '1.15rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
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

          {/* Cash flow & UPI breakdown note */}
          <div style={{
            marginTop: '0.75rem',
            paddingTop: '0.65rem',
            borderTop: '1px dashed var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem'
          }}>
            {/* Cash Sales Note (only if > 0) */}
            {cashReceivedVal > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.78rem'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  <Banknote size={15} style={{ color: '#10b981' }} />
                  <span>Cash Sales:</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <strong style={{ fontSize: '0.9rem', color: '#047857', fontWeight: 700 }}>
                    ₹{cashReceivedVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                  {totalReceivedVal > 0 && (
                    <span
                      title={`${cashCount} cash bill${cashCount !== 1 ? 's' : ''}`}
                      style={{
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: '#065f46',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        fontWeight: 700,
                        fontSize: '0.68rem'
                      }}
                    >
                      {((cashReceivedVal / totalReceivedVal) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* UPI Sales Note (only if > 0) */}
            {upiReceivedVal > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.78rem'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  <QrCode size={15} style={{ color: '#0284c7' }} />
                  <span>UPI Sales:</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <strong style={{ fontSize: '0.9rem', color: '#0284c7', fontWeight: 700 }}>
                    ₹{upiReceivedVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                  {totalReceivedVal > 0 && (
                    <span
                      title={`${upiCount} UPI bill${upiCount !== 1 ? 's' : ''}`}
                      style={{
                        background: 'rgba(2, 132, 199, 0.12)',
                        color: '#0369a1',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        fontWeight: 700,
                        fontSize: '0.68rem'
                      }}
                    >
                      {((upiReceivedVal / totalReceivedVal) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Fallback if no collections in period */}
            {totalReceivedVal === 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '0.2rem 0' }}>
                No collections recorded for this period
              </div>
            )}

            {/* Card Sales Note (only if > 0) */}
            {cardReceivedVal > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.78rem'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  <CreditCard size={15} style={{ color: '#8b5cf6' }} />
                  <span>Card Sales:</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <strong style={{ fontSize: '0.9rem', color: '#7c3aed', fontWeight: 700 }}>
                    ₹{cardReceivedVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                  {totalReceivedVal > 0 && (
                    <span
                      title={`${cardCount} card bill${cardCount !== 1 ? 's' : ''}`}
                      style={{
                        background: 'rgba(139, 92, 246, 0.12)',
                        color: '#7c3aed',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        fontWeight: 700,
                        fontSize: '0.68rem'
                      }}
                    >
                      {((cardReceivedVal / totalReceivedVal) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Other / Credit collections (only if > 0) */}
            {otherReceivedVal > 0.01 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.78rem'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  <CreditCard size={15} style={{ color: '#f59e0b' }} />
                  <span>Other / Credit:</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <strong style={{ fontSize: '0.9rem', color: '#b45309', fontWeight: 700 }}>
                    ₹{otherReceivedVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                  {totalReceivedVal > 0 && (
                    <span
                      style={{
                        background: 'rgba(245, 158, 11, 0.12)',
                        color: '#b45309',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        fontWeight: 700,
                        fontSize: '0.68rem'
                      }}
                    >
                      {((otherReceivedVal / totalReceivedVal) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            )}
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
                    const nowStr = getLocalDateString();
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
                  const nowStr = getLocalDateString();
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
            {groupedReturns.length} voucher{groupedReturns.length !== 1 ? 's' : ''} | −₹{totalReturnsVal.toFixed(2)}
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
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                    <th style={{ padding: '0.6rem 0.9rem' }}>Invoice No.</th>
                    <th style={{ padding: '0.6rem 0.9rem' }}>Date</th>
                    <th style={{ padding: '0.6rem 0.9rem' }}>Customer / Doctor</th>
                    <th style={{ padding: '0.6rem 0.9rem', textAlign: 'center' }}>Items</th>
                    <th style={{ padding: '0.6rem 0.9rem', textAlign: 'center' }}>Mode</th>
                    <th style={{ padding: '0.6rem 0.9rem', textAlign: 'right' }}>Total (₹)</th>
                    <th style={{ padding: '0.6rem 0.9rem', textAlign: 'right' }}>Balance Due (₹)</th>
                    <th style={{ padding: '0.6rem 0.9rem', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '0.6rem 0.9rem', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map(inv => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                      <td style={{ padding: '0.5rem 0.9rem', fontWeight: '700', color: 'var(--brand-teal)', whiteSpace: 'nowrap' }}>
                        {inv.invoiceNumber}
                      </td>
                      <td style={{ padding: '0.5rem 0.9rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {new Date(inv.invoiceDate).toLocaleDateString('en-IN')}
                      </td>
                      <td style={{ padding: '0.5rem 0.9rem', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                          {inv.customerName && inv.customerName !== 'Cash Customer' 
                            ? inv.customerName 
                            : (inv.party?.mailTo || inv.customerName || inv.party?.name || 'Cash Customer')}
                        </span>
                        {inv.doctorName && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                            • {inv.doctorName.startsWith('Dr') ? inv.doctorName : `Dr. ${inv.doctorName}`}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem 0.9rem', color: 'var(--text-secondary)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {inv.itemsCount} meds
                      </td>
                      <td style={{ padding: '0.5rem 0.9rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span style={{
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          background: inv.paymentMode === 'UPI'
                            ? 'rgba(2, 132, 199, 0.12)'
                            : inv.paymentMode === 'CASH'
                            ? 'rgba(16, 185, 129, 0.12)'
                            : inv.paymentMode === 'CARD'
                            ? 'rgba(139, 92, 246, 0.12)'
                            : 'var(--bg-secondary)',
                          color: inv.paymentMode === 'UPI'
                            ? '#0284c7'
                            : inv.paymentMode === 'CASH'
                            ? '#059669'
                            : inv.paymentMode === 'CARD'
                            ? '#7c3aed'
                            : 'var(--text-secondary)'
                        }}>
                          {inv.paymentMode}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem 0.9rem', textAlign: 'right', fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        ₹{inv.grandTotal.toFixed(2)}
                      </td>
                      <td style={{
                        padding: '0.5rem 0.9rem',
                        textAlign: 'right',
                        fontWeight: '600',
                        color: inv.balanceAmount > 0 ? 'var(--accent-red)' : 'var(--text-secondary)',
                        whiteSpace: 'nowrap'
                      }}>
                        {inv.balanceAmount > 0 ? `₹${inv.balanceAmount.toFixed(2)}` : '₹0.00'}
                      </td>
                      <td style={{ padding: '0.5rem 0.9rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span style={{
                          padding: '0.2rem 0.55rem',
                          borderRadius: '999px',
                          fontSize: '0.72rem',
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
                      <td style={{ padding: '0.5rem 0.9rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '0.35rem', justifyContent: 'center', alignItems: 'center' }}>
                          <button
                            onClick={() => handleViewInvoice(inv.id)}
                            style={{
                              padding: '0.28rem 0.55rem',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '5px',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: '600'
                            }}
                            title="View Invoice"
                          >
                            <Eye size={13} /> View
                          </button>
                          {inv.status !== 'CANCELLED' && (
                            <button
                              onClick={() => {
                                setEditingInvoiceId(inv.id);
                                setShowPOS(true);
                              }}
                              style={{
                                padding: '0.28rem 0.55rem',
                                background: 'rgba(59, 130, 246, 0.12)',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                borderRadius: '5px',
                                color: '#2563eb',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '0.75rem',
                                fontWeight: '600'
                              }}
                              title="Edit this invoice"
                            >
                              <Edit2 size={13} /> Edit
                            </button>
                          )}
                          {inv.status !== 'CANCELLED' && inv.balanceAmount > 0 && (
                            <button
                              onClick={() => handleOpenPayment(inv)}
                              style={{
                                padding: '0.28rem 0.55rem',
                                background: 'rgba(20, 184, 166, 0.15)',
                                border: '1px solid var(--brand-teal)',
                                borderRadius: '5px',
                                color: 'var(--brand-teal)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '0.75rem',
                                fontWeight: '600'
                              }}
                              title="Settle balance due"
                            >
                              <CreditCard size={13} /> Settle
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteInvoice(inv.id, inv.invoiceNumber)}
                            style={{
                              padding: '0.28rem 0.55rem',
                              background: 'rgba(239, 68, 68, 0.12)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              borderRadius: '5px',
                              color: '#ef4444',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: '600'
                            }}
                            title={inv.status === 'CANCELLED' ? "Permanently delete cancelled invoice" : "Cancel invoice and reverse stock"}
                          >
                            <Trash2 size={13} /> {inv.status === 'CANCELLED' ? 'Delete' : 'Cancel'}
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
                Multi-medicine returns for a patient are unified into single vouchers. All inwarded medicines are automatically restored to stock.
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
              <Plus size={15} /> Log Patient Return
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading patient returns...
            </div>
          ) : filteredGroupedReturns.length === 0 ? (
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
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                    <th style={{ padding: '0.6rem 0.9rem', width: '36px', textAlign: 'center' }}></th>
                    <th style={{ padding: '0.6rem 0.9rem' }}>Voucher / Slip #</th>
                    <th style={{ padding: '0.6rem 0.9rem' }}>Date</th>
                    <th style={{ padding: '0.6rem 0.9rem' }}>Patient Name</th>
                    <th style={{ padding: '0.6rem 0.9rem', textAlign: 'right' }}>Refund Amount (₹)</th>
                    <th style={{ padding: '0.6rem 0.9rem', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGroupedReturns.map(grp => {
                    const isExpanded = !!expandedVouchers[grp.voucherNumber];
                    const itemsCount = grp.items.length;

                    return (
                      <React.Fragment key={grp.voucherNumber}>
                        <tr
                          style={{
                            borderBottom: isExpanded ? 'none' : '1px solid var(--border-color)',
                            background: isExpanded ? 'rgba(225, 29, 72, 0.03)' : 'transparent',
                            transition: 'background 0.2s',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              onClick={() => toggleExpandVoucher(grp.voucherNumber)}
                              title={isExpanded ? 'Collapse medicines breakdown' : 'Expand medicines breakdown'}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: isExpanded ? '#e11d48' : 'var(--text-muted)',
                                padding: '2px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                            </button>
                          </td>
                          <td style={{ padding: '0.5rem 0.9rem', fontWeight: '700', color: '#e11d48', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span>{grp.voucherNumber}</span>
                              <span
                                style={{
                                  background: 'rgba(225, 29, 72, 0.1)',
                                  color: '#e11d48',
                                  fontSize: '0.72rem',
                                  fontWeight: '700',
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: '4px'
                                }}
                              >
                                {itemsCount} {itemsCount === 1 ? 'med' : 'meds'}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '0.5rem 0.9rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {new Date(grp.createdAt).toLocaleDateString('en-IN')}
                          </td>
                          <td style={{ padding: '0.5rem 0.9rem', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                            {grp.patientName}
                          </td>
                          <td style={{ padding: '0.5rem 0.9rem', textAlign: 'right', fontWeight: '800', color: '#e11d48', fontSize: '0.92rem', whiteSpace: 'nowrap' }}>
                            −₹{grp.totalRefundAmount.toFixed(2)}
                          </td>
                          <td style={{ padding: '0.5rem 0.9rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                              <button
                                onClick={() => {
                                  setViewingMultiReturnSlip({
                                    voucherNumber: grp.voucherNumber,
                                    createdAt: grp.createdAt,
                                    patientName: grp.patientName,
                                    reason: grp.reason,
                                    totalRefundAmount: grp.totalRefundAmount,
                                    totalUnitsAdded: grp.totalUnitsReturned,
                                    createdByUser: grp.createdByUser,
                                    items: grp.items.map(r => ({
                                      medicineName: r.medicineName,
                                      sku: r.sku,
                                      batchNumber: r.batchNumber,
                                      expiryDate: r.expiryDate || null,
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
                                  padding: '0.28rem 0.55rem',
                                  background: 'var(--bg-secondary)',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '5px',
                                  color: 'var(--text-primary)',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  fontSize: '0.75rem',
                                  fontWeight: '600'
                                }}
                              >
                                <Printer size={13} /> Slip
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Itemized Medicines Breakdown */}
                        {isExpanded && (
                          <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                            <td colSpan={6} style={{ padding: '0.8rem 1.2rem 1.2rem 3rem' }}>
                              <div
                                style={{
                                  background: 'var(--card-bg)',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '8px',
                                  overflow: 'hidden',
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                                }}
                              >
                                <div style={{ padding: '0.5rem 0.8rem', background: 'rgba(225, 29, 72, 0.05)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#e11d48' }}>
                                      Itemized Medicines Returned in Voucher {grp.voucherNumber} ({itemsCount} Medicines)
                                    </span>
                                    {grp.reason && (
                                      <span style={{ fontSize: '0.74rem', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                                        Reason: <strong>{grp.reason}</strong>
                                      </span>
                                    )}
                                  </div>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    Logged by {grp.createdByUser}
                                  </span>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                  <thead>
                                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase' }}>
                                      <th style={{ padding: '0.5rem 0.8rem', width: '32px' }}>#</th>
                                      <th style={{ padding: '0.5rem 0.8rem' }}>Medicine Name</th>
                                      <th style={{ padding: '0.5rem 0.8rem' }}>Batch #</th>
                                      <th style={{ padding: '0.5rem 0.8rem' }}>Expiry</th>
                                      <th style={{ padding: '0.5rem 0.8rem', textAlign: 'center' }}>Return Packaging</th>
                                      <th style={{ padding: '0.5rem 0.8rem', textAlign: 'center' }}>Units Added to Stock</th>
                                      <th style={{ padding: '0.5rem 0.8rem', textAlign: 'right' }}>MRP / Unit</th>
                                      <th style={{ padding: '0.5rem 0.8rem', textAlign: 'right' }}>Line Refund (₹)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {grp.items.map((itm, i) => (
                                      <tr key={itm.id || i} style={{ borderBottom: i === grp.items.length - 1 ? 'none' : '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '0.5rem 0.8rem', color: 'var(--text-muted)' }}>{i + 1}</td>
                                        <td style={{ padding: '0.5rem 0.8rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                                          {itm.medicineName}
                                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SKU: {itm.sku}</div>
                                        </td>
                                        <td style={{ padding: '0.5rem 0.8rem', fontFamily: 'monospace', fontWeight: '600' }}>
                                          {itm.batchNumber}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.8rem', color: 'var(--text-secondary)' }}>
                                          {itm.expiryDate || 'N/A'}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.8rem', textAlign: 'center', fontWeight: '600' }}>
                                          {itm.strips > 0 && itm.looseQty > 0
                                            ? `${itm.strips} Str + ${itm.looseQty} Tab`
                                            : itm.strips > 0
                                            ? `${itm.strips} Strip(s)`
                                            : `${itm.looseQty} Tab(s)`}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.8rem', textAlign: 'center', color: 'var(--accent-green)', fontWeight: '700' }}>
                                          {formatInwardUnits(itm)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.8rem', textAlign: 'right', color: 'var(--text-secondary)' }}>
                                          ₹{itm.mrp.toFixed(2)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.8rem', textAlign: 'right', fontWeight: '700', color: '#e11d48' }}>
                                          −₹{itm.refundAmount.toFixed(2)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr style={{ background: 'var(--bg-secondary)', fontWeight: '700', borderTop: '1px solid var(--border-color)' }}>
                                      <td colSpan={5} style={{ padding: '0.5rem 0.8rem', textAlign: 'right' }}>Total Voucher Inward & Refund:</td>
                                      <td style={{ padding: '0.5rem 0.8rem', textAlign: 'center', color: 'var(--accent-green)' }}>
                                        +{grp.totalUnitsReturned} units
                                      </td>
                                      <td></td>
                                      <td style={{ padding: '0.5rem 0.8rem', textAlign: 'right', color: '#e11d48', fontSize: '0.9rem' }}>
                                        −₹{grp.totalRefundAmount.toFixed(2)}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
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


      {/* PROFESSIONAL GST TAX INVOICE MODAL & PRINT ENGINE */}
      {viewingInvoice && !showPaymentModal && (
        <TaxInvoiceModal
          invoice={viewingInvoice}
          activeCompany={activeCompany}
          onClose={() => setViewingInvoice(null)}
          onEdit={(id) => {
            setViewingInvoice(null);
            setEditingInvoiceId(id);
            setShowPOS(true);
          }}
          onDelete={(id, num) => handleDeleteInvoice(id, num)}
          onVoidPayment={handleVoidInvoicePayment}
        />
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
            maxHeight: 'min(92vh, 92dvh)',
            overflowY: 'auto',
            padding: '1.5rem',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                Settle Invoice Balance
              </h3>
              <button onClick={() => setShowPaymentModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Invoice:</span>
                <strong>{viewingInvoice.invoiceNumber}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Customer:</span>
                <strong>{viewingInvoice.customerName}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', paddingTop: '0.6rem', borderTop: '1px dashed var(--border-color)', textAlign: 'center' }}>
                <div style={{ background: 'var(--card-bg)', padding: '6px', borderRadius: '4px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Bill</div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>₹{Number(viewingInvoice.grandTotal || 0).toFixed(2)}</div>
                </div>
                <div style={{ background: 'var(--card-bg)', padding: '6px', borderRadius: '4px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Already Paid</div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent-green)' }}>₹{Number(viewingInvoice.paidAmount || 0).toFixed(2)}</div>
                </div>
                <div style={{ background: 'var(--card-bg)', padding: '6px', borderRadius: '4px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Balance Due</div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--accent-red)' }}>₹{Number(viewingInvoice.balanceAmount || 0).toFixed(2)}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1.2rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  Payment Date *
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontWeight: '600',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  Payment Mode
                </label>
                <select
                  value={paymentMode}
                  onChange={e => setPaymentMode(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '0.65rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontWeight: '600',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="CARD">Card</option>
                  <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  Payment Amount (₹) *
                </label>
                <button
                  type="button"
                  onClick={() => setPaymentAmount(String(viewingInvoice.balanceAmount || 0))}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--brand-teal)',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Pay Full (₹{Number(viewingInvoice.balanceAmount || 0).toFixed(2)})
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={viewingInvoice.balanceAmount}
                placeholder={`e.g. 10.00 (Max: ₹${Number(viewingInvoice.balanceAmount || 0).toFixed(2)})`}
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
                  fontSize: '1rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '1.2rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                Reference / Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. UPI Ref / Cheque / Settlement note"
                value={referenceNo}
                onChange={e => setReferenceNo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
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

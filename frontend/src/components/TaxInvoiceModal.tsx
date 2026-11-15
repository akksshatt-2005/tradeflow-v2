import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Printer, Edit2, Trash2, X, ChevronDown, ChevronUp, FileText, Settings2, Check, Upload } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { CompanySettings, getCompanySettings } from '../utils/companySettings';
import { CompanySettingsModal } from './CompanySettingsModal';
import { Company } from '../context/AuthContext';
import { numberToIndianWords, normalizeIndianState } from '../utils/numberToWords';

export interface InvoiceModalItem {
  id?: string;
  itemId?: string;
  medicineName?: string;
  genericName?: string;
  sku?: string;
  pack?: string;
  batchNumber?: string;
  expiryDate?: string;
  quantity?: number;
  freeQuantity?: number;
  strips?: number;
  looseQty?: number;
  unitPrice?: number | string;
  mrp?: number | string;
  discountPercent?: number | string;
  taxableAmount?: number | string;
  gstRate?: number | string;
  cgstAmount?: number | string;
  sgstAmount?: number | string;
  totalAmount?: number | string;
  hsnCode?: string;
  unit?: string;
}

export interface InvoiceModalData {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
  customerGstin?: string | null;
  doctorName?: string | null;
  doctorRegNo?: string | null;
  patientName?: string | null;
  patientAddress?: string | null;
  paymentMode: string;
  subtotal: number | string;
  itemDiscount?: number | string;
  billDiscountPct?: number | string;
  billDiscountAmt?: number | string;
  taxableAmount: number | string;
  cgstAmount?: number | string;
  sgstAmount?: number | string;
  igstAmount?: number | string;
  totalTax: number | string;
  roundOff?: number | string;
  grandTotal: number | string;
  paidAmount: number | string;
  balanceAmount: number | string;
  status: string;
  notes?: string | null;
  createdByUser?: string;
  company?: any;
  party?: any;
  payments?: any[];
  items?: InvoiceModalItem[];
}

interface TaxInvoiceModalProps {
  invoice: InvoiceModalData;
  activeCompany: Company | null;
  onClose: () => void;
  onEdit?: (invoiceId: string) => void;
  onDelete?: (invoiceId: string, invoiceNumber: string) => void;
  onVoidPayment?: (paymentId: string) => void;
}

type CopyMode = 'CUSTOMER' | 'SHOP' | 'BOTH';
type InvoiceLayout = 'B2B_WHOLESALE' | 'RETAIL_STANDARD';

interface VendorBankDetails {
  bankName: string;
  accountNo: string;
  ifscCode: string;
  branch: string;
  accountName: string;
  signatureImage?: string;
}

interface VendorDispatchDetails {
  transport: string;
  lrNo: string;
  lrDate: string;
  cases: string;
  ewayBill: string;
}

export const TaxInvoiceModal: React.FC<TaxInvoiceModalProps> = ({
  invoice,
  activeCompany,
  onClose,
  onEdit,
  onDelete,
  onVoidPayment
}) => {
  const [copyMode, setCopyMode] = useState<CopyMode>('CUSTOMER');
  const [layoutMode, setLayoutMode] = useState<InvoiceLayout>('B2B_WHOLESALE');
  const [showVouchers, setShowVouchers] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const modalBackdropRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when switching copy mode (e.g. Both Copies) or layout
  useEffect(() => {
    if (modalBackdropRef.current) {
      modalBackdropRef.current.scrollTop = 0;
    }
  }, [copyMode, layoutMode]);

  // Active company resolution (Strict tenant isolation)
  const comp = invoice.company || activeCompany || {};
  const companyId = comp.id || 'default_comp';
  const companyName = comp.name || 'Medical Store';
  const companyAddress = comp.address && comp.address.trim()
    ? `${comp.address.trim()}${comp.city ? `, ${comp.city.trim()}` : ''}${comp.pincode ? ` - ${comp.pincode.trim()}` : ''}`
    : '';

  // Correct state spelling to UTTAR PRADESH and state code to 09
  const { stateName: companyState, stateCode: companyStateCode } = normalizeIndianState(comp.state, comp.gstin);

  // Phone number (company specific)
  let companyPhone = '';
  if (comp.phone && comp.phone.trim()) {
    companyPhone = comp.phone.trim();
  }

  // Only display email if explicitly configured and not dummy domain
  const companyEmail = comp.email && !comp.email.includes('tradeflowpharmacy.com') && !comp.email.includes('abctestmail')
    ? comp.email.trim()
    : '';

  // Only display GSTIN or DL Number if actually provided and not dummy placeholder
  const companyGstin = comp.gstin && !comp.gstin.includes('XXXX') && comp.gstin.trim().length > 5
    ? comp.gstin.trim()
    : '';
  const companyDlNo = comp.drugLicenseNo && !comp.drugLicenseNo.includes('2026-90412') && comp.drugLicenseNo.trim().length > 3
    ? comp.drugLicenseNo.trim()
    : '';

  // Buyer / Party details
  const party = invoice.party || {};
  const buyerName = invoice.customerName || party.name || 'Walk-in Customer';
  const buyerAddress = invoice.customerAddress || party.address || '';
  const { stateName: buyerState, stateCode: buyerStateCode } = normalizeIndianState(
    party.state || invoice.patientAddress || comp.state,
    invoice.customerGstin
  );
  const buyerGstin = invoice.customerGstin && !invoice.customerGstin.includes('URP') && invoice.customerGstin.trim().length > 3
    ? invoice.customerGstin.trim()
    : (party.gstin && !party.gstin.includes('URP') && party.gstin.trim().length > 3 ? party.gstin.trim() : '');
  const buyerPan = party.panNo && party.panNo.trim().length > 3 ? party.panNo.trim() : '';
  const buyerPhone = invoice.customerPhone || party.phone || party.mobile || '';

  // Doctor & Patient details
  const doctorName = invoice.doctorName
    ? (invoice.doctorName.startsWith('Dr') ? invoice.doctorName : `Dr. ${invoice.doctorName}`)
    : '';
  const doctorRegNo = invoice.doctorRegNo ? invoice.doctorRegNo.trim() : '';
  const patientName = invoice.patientName || (invoice.customerName && invoice.customerName !== 'Cash Customer' ? invoice.customerName : '');

  // Numeric totals
  const subtotal = Number(invoice.subtotal || 0);
  const taxableAmount = Number(invoice.taxableAmount || 0);
  const totalTax = Number(invoice.totalTax || 0);
  const cgstAmount = Number(invoice.cgstAmount || (totalTax / 2));
  const sgstAmount = Number(invoice.sgstAmount || (totalTax / 2));
  const discountAmt = Number(invoice.billDiscountAmt || 0);
  const discountPct = Number(invoice.billDiscountPct || 0);
  const grandTotal = Number(invoice.grandTotal || 0);
  const roundOff = Number(invoice.roundOff || 0);

  // Vendor Bank Details (Scoped strictly by company ID to ensure 100% uniqueness per vendor)
  const bankStorageKey = `tradeflow_bank_${companyId}`;
  const [bankDetails, setBankDetails] = useState<VendorBankDetails>(() => {
    try {
      const saved = localStorage.getItem(bankStorageKey);
      if (saved) return JSON.parse(saved);
    } catch { }
    return {
      bankName: 'Bank Of India',
      accountNo: '777140000006',
      ifscCode: 'BIN0537594',
      branch: comp.city ? `${comp.city}-Branch` : 'Main Branch',
      accountName: companyName
    };
  });

  // Vendor Dispatch Details (Scoped by invoice ID or default)
  const dispatchStorageKey = `tradeflow_dispatch_${invoice.id}`;
  const [dispatchDetails, setDispatchDetails] = useState<VendorDispatchDetails>(() => {
    try {
      const saved = localStorage.getItem(dispatchStorageKey);
      if (saved) return JSON.parse(saved);
    } catch { }
    return {
      transport: 'Self / Hand Delivery',
      lrNo: '—',
      lrDate: '—',
      cases: '1',
      ewayBill: '—'
    };
  });

  const [editBankForm, setEditBankForm] = useState(bankDetails);
  const [editDispatchForm, setEditDispatchForm] = useState(dispatchDetails);

  // Comprehensive Firm Settings (Bank, UPI QR, DL 20B/21B, FSSAI, Terms, Paper, Logo, Mohar)
  const [companySettings, setCompanySettings] = useState<CompanySettings>(() => getCompanySettings(companyId, comp));

  // Sync settings whenever updated
  useEffect(() => {
    const handleUpdate = () => {
      const updated = getCompanySettings(companyId, comp);
      setCompanySettings(updated);
      setBankDetails(prev => ({
        ...prev,
        bankName: updated.bankName,
        accountNo: updated.accountNo,
        ifscCode: updated.ifscCode,
        branch: updated.branch,
        accountName: updated.accountName,
        signatureImage: updated.signatureImage
      }));
    };
    window.addEventListener('tradeflow_settings_updated', handleUpdate);
    window.addEventListener('tradeflow_bank_updated', handleUpdate);
    return () => {
      window.removeEventListener('tradeflow_settings_updated', handleUpdate);
      window.removeEventListener('tradeflow_bank_updated', handleUpdate);
    };
  }, [companyId, comp]);

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('File size exceeds 2MB limit. Please upload a smaller image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setEditBankForm(prev => ({ ...prev, signatureImage: event.target!.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setBankDetails(editBankForm);
    setDispatchDetails(editDispatchForm);
    localStorage.setItem(bankStorageKey, JSON.stringify(editBankForm));
    localStorage.setItem(dispatchStorageKey, JSON.stringify(editDispatchForm));
    window.dispatchEvent(new Event('tradeflow_bank_updated'));
    setShowSettingsModal(false);
  };

  useEffect(() => {
    document.body.classList.add('tax-invoice-open');
    return () => {
      document.body.classList.remove('tax-invoice-open');
    };
  }, []);

  // Keyboard Shortcut: Escape to close modal (or dismiss nested sub-modals/popups first)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSettingsModal) {
          setShowSettingsModal(false);
          return;
        }
        if (showVouchers) {
          setShowVouchers(false);
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showSettingsModal, showVouchers]);

  const currentItems = invoice.items || [];
  // Proportional filler rows calculation
  const fillerRowCount = Math.max(1, 10 - currentItems.length);

  // 4 Standard GST Slabs Breakdown Calculation (5%, 12%, 18%, 28%)
  const { gstSlabs, slabTotals } = useMemo(() => {
    const slabs: Record<string, { classLabel: string; total: number; scheme: number; discount: number; sgst: number; cgst: number; totalGst: number }> = {
      '5.00%': { classLabel: 'GST 5.00%', total: 0, scheme: 0, discount: 0, sgst: 0, cgst: 0, totalGst: 0 },
      '12.00%': { classLabel: 'GST 12.00%', total: 0, scheme: 0, discount: 0, sgst: 0, cgst: 0, totalGst: 0 },
      '18.00%': { classLabel: 'GST 18.00%', total: 0, scheme: 0, discount: 0, sgst: 0, cgst: 0, totalGst: 0 },
      '28.00%': { classLabel: 'GST 28 %', total: 0, scheme: 0, discount: 0, sgst: 0, cgst: 0, totalGst: 0 },
    };

    let grandSumTotal = 0;
    let grandSumScheme = 0;
    let grandSumDiscount = 0;
    let grandSumSgst = 0;
    let grandSumCgst = 0;
    let grandSumGst = 0;

    currentItems.forEach(item => {
      const rate = Number(item.gstRate || 0);
      let key = '5.00%';
      if (rate >= 27) key = '28.00%';
      else if (rate >= 17) key = '18.00%';
      else if (rate >= 11) key = '12.00%';
      else key = '5.00%';

      const itemTaxable = Number(item.taxableAmount || item.totalAmount || 0);
      const itemSgst = Number(item.sgstAmount || (itemTaxable * (rate / 200)));
      const itemCgst = Number(item.cgstAmount || (itemTaxable * (rate / 200)));
      const itemGst = itemSgst + itemCgst;
      const itemDis = item.discountPercent ? (itemTaxable * Number(item.discountPercent) / 100) : 0;

      slabs[key].total += itemTaxable;
      slabs[key].discount += itemDis;
      slabs[key].sgst += itemSgst;
      slabs[key].cgst += itemCgst;
      slabs[key].totalGst += itemGst;

      grandSumTotal += itemTaxable;
      grandSumDiscount += itemDis;
      grandSumSgst += itemSgst;
      grandSumCgst += itemCgst;
      grandSumGst += itemGst;
    });

    // If no items or only 0% tax, make sure taxable is reflected
    if (currentItems.length === 0 && taxableAmount > 0) {
      slabs['5.00%'].total = taxableAmount;
      slabs['5.00%'].sgst = sgstAmount;
      slabs['5.00%'].cgst = cgstAmount;
      slabs['5.00%'].totalGst = totalTax;
      grandSumTotal = taxableAmount;
      grandSumSgst = sgstAmount;
      grandSumCgst = cgstAmount;
      grandSumGst = totalTax;
    }

    return {
      gstSlabs: slabs,
      slabTotals: {
        total: grandSumTotal,
        scheme: grandSumScheme,
        discount: grandSumDiscount + discountAmt,
        sgst: grandSumSgst,
        cgst: grandSumCgst,
        totalGst: grandSumGst
      }
    };
  }, [currentItems, taxableAmount, totalTax, sgstAmount, cgstAmount, discountAmt]);

  // Compute total billed quantity units
  const totalQuantitySum = useMemo(() => {
    let stripsCount = 0;
    let tabsCount = 0;
    let baseUnits = 0;

    currentItems.forEach(item => {
      const s = Number(item.strips || 0);
      const l = Number(item.looseQty || 0);
      const q = Number(item.quantity || 0);

      if (s > 0 || l > 0) {
        stripsCount += s;
        tabsCount += l;
      } else {
        baseUnits += q;
      }
    });

    const parts: string[] = [];
    if (stripsCount > 0) parts.push(`${stripsCount} Strip`);
    if (tabsCount > 0) parts.push(`${tabsCount} Tab`);
    if (baseUnits > 0 && stripsCount === 0 && tabsCount === 0) parts.push(`${baseUnits} pcs`);

    return parts.length > 0 ? parts.join(' + ') : `${currentItems.length} items`;
  }, [currentItems]);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime())
        ? '—'
        : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // -------------------------------------------------------------
  // FORMAT A: AUTHENTIC B2B WHOLESALE GST INVOICE (USER'S IMAGE)
  // -------------------------------------------------------------
  const renderWholesaleB2BInvoiceSheet = (copyTitle: string, copySubtitle: string) => (
    <div className="tax-invoice-sheet" style={{
      boxSizing: 'border-box',
      width: '100%',
      maxWidth: '210mm',
      margin: '0 auto',
      background: '#ffffff',
      color: '#000000',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      fontSize: '9.5px',
      lineHeight: 1.3,
      border: '1.5px solid #000000',
      pageBreakInside: 'avoid',
      breakInside: 'avoid',
      position: 'relative'
    }}>
      {/* ── TOP 3-BOX HEADER ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '37% 37% 26%', borderBottom: '1.5px solid #000000' }}>

        {/* Box 1: Left - Company Details */}
        <div style={{ padding: '6px 8px', borderRight: '1.5px solid #000000', fontSize: '9.5px', lineHeight: 1.35 }}>
          {companySettings.companyLogo && (
            <div style={{ marginBottom: '4px' }}>
              <img
                src={companySettings.companyLogo}
                alt="Logo"
                style={{ maxHeight: '34px', maxWidth: '130px', objectFit: 'contain' }}
              />
            </div>
          )}
          <div style={{ fontSize: '13px', fontWeight: 900, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>
            {companyName}
          </div>
          <div style={{ fontWeight: 600, color: '#111827', textTransform: 'uppercase', fontSize: '9px' }}>
            {comp.address || 'MAIN ROAD, PHARMA MARKET'}
          </div>
          <div style={{ fontWeight: 600, color: '#111827', textTransform: 'uppercase', fontSize: '9px' }}>
            {comp.city || 'LOCAL CITY'}{comp.pincode ? ` - ${comp.pincode}` : ''}{comp.state ? `, ${comp.state}` : ''}
          </div>
          <div style={{ marginTop: '2px' }}>
            Phone : <strong style={{ fontFamily: 'monospace' }}>{companyPhone || '—'}</strong>
          </div>
          <div>
            D.L.No. : <strong style={{ fontFamily: 'monospace' }}>
              {companySettings.dl20b ? `${companySettings.dl20b}${companySettings.dl21b ? `, ${companySettings.dl21b}` : ''}` : (companyDlNo || '20B-194000, 21B-194001')}
            </strong>
          </div>
          {companySettings.fssaiNo && (
            <div>
              FSSAI No. : <strong style={{ fontFamily: 'monospace' }}>{companySettings.fssaiNo}</strong>
            </div>
          )}
          <div style={{ marginTop: '1px' }}>
            GSTIN : <strong style={{ fontFamily: 'monospace', fontSize: '10px' }}>{companyGstin || 'URP / UNREGISTERED'}</strong>
          </div>
        </div>

        {/* Box 2: Middle - GST INVOICE Banner & Dispatch Grid */}
        <div style={{ borderRight: '1.5px solid #000000', display: 'flex', flexDirection: 'column' }}>
          {/* Blue Title Banner */}
          <div style={{
            background: '#dbeafe',
            borderBottom: '1.5px solid #000000',
            textAlign: 'center',
            padding: '3px 4px',
            color: '#1e3a8a',
            textTransform: 'uppercase'
          }}>
            <div style={{ fontWeight: 900, fontSize: '12px', letterSpacing: '1px', lineHeight: 1.15 }}>
              GST INVOICE
            </div>
            <div style={{ fontSize: '8px', fontWeight: 800, color: '#1e40af', letterSpacing: '0.3px', marginTop: '1px' }}>
              {copyTitle} {copySubtitle}
            </div>
          </div>

          {/* 2 Sub-Columns */}
          <div style={{ display: 'grid', gridTemplateColumns: '50% 50%', flex: 1, fontSize: '9px' }}>
            {/* Sub-col 1: Invoice Meta */}
            <div style={{ padding: '4px 6px', borderRight: '1px solid #000000', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div>Invoice No : <strong style={{ fontFamily: 'monospace' }}>{invoice.invoiceNumber}</strong></div>
              <div>Invoice Date : <strong>{formatDate(invoice.invoiceDate)}</strong></div>
              <div>Due Date : <strong>{formatDate(invoice.dueDate)}</strong></div>
              <div>Order No. : <strong>{invoice.notes || '—'}</strong></div>
              <div>Order Date : <strong>{formatDate(invoice.invoiceDate)}</strong></div>
            </div>

            {/* Sub-col 2: Dispatch / Transport */}
            <div style={{ padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div>Transport : <strong>{dispatchDetails.transport}</strong></div>
              <div>L.R. No. : <strong>{dispatchDetails.lrNo}</strong></div>
              <div>L.R. Date : <strong>{dispatchDetails.lrDate}</strong></div>
              <div>Cases : <strong>{dispatchDetails.cases}</strong></div>
              <div>E-Way Bill : <strong style={{ fontFamily: 'monospace' }}>{dispatchDetails.ewayBill}</strong></div>
            </div>
          </div>
        </div>

        {/* Box 3: Right - Party / Buyer Details */}
        <div style={{ padding: '6px 8px', fontSize: '9.5px', lineHeight: 1.35, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#374151', textTransform: 'uppercase', fontSize: '8.5px', marginBottom: '1px' }}>
              Party Name :
            </div>
            <div style={{ fontWeight: 900, color: '#000000', fontSize: '11px', textTransform: 'uppercase' }}>
              {buyerName}
            </div>
            <div style={{ color: '#1f2937', marginTop: '2px', fontSize: '9px' }}>
              {buyerAddress || 'LOCAL PHARMACY / CLINIC'}
            </div>
            {buyerState && (
              <div style={{ color: '#4b5563', fontSize: '8.5px' }}>
                {buyerState} ({buyerStateCode})
              </div>
            )}
          </div>
          <div style={{ marginTop: '4px', paddingTop: '3px', borderTop: '1px dashed #d1d5db' }}>
            <div>PHONE : <strong style={{ fontFamily: 'monospace' }}>{buyerPhone || '—'}</strong></div>
            <div>D.L.No. : <strong style={{ fontFamily: 'monospace' }}>{party.drugLicenseNo || '—'}</strong></div>
            <div>GSTIN : <strong style={{ fontFamily: 'monospace' }}>{buyerGstin || 'UNREGISTERED'}</strong></div>
          </div>
        </div>
      </div>

      {/* ── 15-COLUMN ITEM TABLE GRID ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1.5px solid #000000', background: '#f8fafc', fontWeight: 900, textAlign: 'center', fontSize: '8.5px' }}>
            <th style={{ borderRight: '1px solid #000000', padding: '4px 2px', width: '28px' }}>S.N</th>
            <th style={{ borderRight: '1px solid #000000', padding: '4px 2px', width: '38px' }}>Qty.</th>
            <th style={{ borderRight: '1px solid #000000', padding: '4px 2px', width: '30px' }}>Free</th>
            <th style={{ borderRight: '1px solid #000000', padding: '4px 3px', width: '48px' }}>Pack</th>
            <th style={{ borderRight: '1px solid #000000', padding: '4px 6px', textAlign: 'left' }}>Product Name</th>
            <th style={{ borderRight: '1px solid #000000', padding: '4px 3px', width: '60px' }}>Batch</th>
            <th style={{ borderRight: '1px solid #000000', padding: '4px 2px', width: '46px' }}>Exp</th>
            <th style={{ borderRight: '1px solid #000000', padding: '4px 2px', width: '55px' }}>HSN</th>
            <th style={{ borderRight: '1px solid #000000', padding: '4px 3px', width: '48px', textAlign: 'right' }}>M.R.P</th>
            <th style={{ borderRight: '1px solid #000000', padding: '4px 3px', width: '48px', textAlign: 'right' }}>Rate</th>
            <th style={{ borderRight: '1px solid #000000', padding: '4px 2px', width: '36px', textAlign: 'right' }}>DIS</th>
            <th style={{ borderRight: '1px solid #000000', padding: '4px 2px', width: '36px', textAlign: 'right' }}>SGST</th>
            <th style={{ borderRight: '1px solid #000000', padding: '4px 2px', width: '36px', textAlign: 'right' }}>CGST</th>
            <th style={{ borderRight: '1px solid #000000', padding: '4px 4px', width: '52px', textAlign: 'right' }}>GST Value</th>
            <th style={{ padding: '4px 6px', width: '64px', textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {currentItems.map((item, idx) => {
            const expFormatted = item.expiryDate
              ? new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
              : '—';

            const qtyNum = item.strips ? item.strips : (item.quantity || 1);
            const freeNum = item.freeQuantity || 0;
            const packLabel = item.pack || (item.strips ? '10 STRIP' : (item.unit || '10 TAB'));
            const mrpVal = Number(item.mrp || item.unitPrice || 0);
            const rateVal = Number(item.unitPrice || 0);
            const disVal = item.discountPercent ? Number(item.discountPercent).toFixed(1) : '0.00';
            const gstRate = Number(item.gstRate || 0);
            const halfGst = gstRate / 2;
            const lineTaxable = Number(item.taxableAmount || item.totalAmount || 0);
            const lineGstVal = (lineTaxable * (gstRate / 100));
            const lineAmount = Number(item.totalAmount || 0);

            return (
              <tr key={idx} style={{ borderBottom: '1px solid #000000' }}>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 2px', textAlign: 'center', color: '#444' }}>
                  {idx + 1}
                </td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 2px', textAlign: 'center', fontWeight: 800 }}>
                  {qtyNum}
                </td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 2px', textAlign: 'center', color: '#6b7280' }}>
                  {freeNum}
                </td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 3px', textAlign: 'center' }}>
                  {packLabel}
                </td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 6px' }}>
                  <div style={{ fontWeight: 800, color: '#000000' }}>
                    {item.medicineName || 'Medicine'}
                  </div>
                  {item.genericName && (
                    <div style={{ fontSize: '8px', color: '#4b5563' }}>{item.genericName}</div>
                  )}
                </td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 3px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 600 }}>
                  {item.batchNumber || '—'}
                </td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 2px', textAlign: 'center' }}>
                  {expFormatted}
                </td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 2px', textAlign: 'center', fontFamily: 'monospace' }}>
                  {item.hsnCode || '30049099'}
                </td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 3px', textAlign: 'right', fontFamily: 'monospace' }}>
                  {mrpVal.toFixed(2)}
                </td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 3px', textAlign: 'right', fontFamily: 'monospace' }}>
                  {rateVal.toFixed(2)}
                </td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 2px', textAlign: 'right' }}>
                  {disVal}
                </td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 2px', textAlign: 'right' }}>
                  {halfGst.toFixed(2)}%
                </td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 2px', textAlign: 'right' }}>
                  {halfGst.toFixed(2)}%
                </td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 4px', textAlign: 'right', fontFamily: 'monospace' }}>
                  {lineGstVal.toFixed(2)}
                </td>
                <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 800, fontFamily: 'monospace' }}>
                  {lineAmount.toFixed(2)}
                </td>
              </tr>
            );
          })}

          {/* Continuous vertical grid dividers */}
          {Array.from({ length: fillerRowCount }).map((_, fIdx) => (
            <tr key={`fill_${fIdx}`} style={{ height: '16px' }}>
              <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
              <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
              <td>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── FOOTER SEGMENT 1: GST BREAKDOWN (LEFT) & TOTALS (RIGHT) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '56% 14% 30%', borderTop: '1.5px solid #000000', borderBottom: '1.5px solid #000000' }}>

        {/* Left: GST Slabs Breakdown (7 Columns) */}
        <div style={{ borderRight: '1.5px solid #000000' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px', textAlign: 'center' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #000000', background: '#f8fafc', fontWeight: 800 }}>
                <th style={{ borderRight: '1px solid #000000', padding: '3px 2px', width: '56px' }}>CLASS</th>
                <th style={{ borderRight: '1px solid #000000', padding: '3px 2px' }}>TOTAL</th>
                <th style={{ borderRight: '1px solid #000000', padding: '3px 2px' }}>SCHEME</th>
                <th style={{ borderRight: '1px solid #000000', padding: '3px 2px' }}>DISCOUNT</th>
                <th style={{ borderRight: '1px solid #000000', padding: '3px 2px' }}>SGST</th>
                <th style={{ borderRight: '1px solid #000000', padding: '3px 2px' }}>CGST</th>
                <th style={{ padding: '3px 2px' }}>TOTAL GST</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(gstSlabs).map(([rateKey, slab]) => (
                <tr key={rateKey} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ borderRight: '1px solid #000000', padding: '2px', fontWeight: 700 }}>{slab.classLabel}</td>
                  <td style={{ borderRight: '1px solid #000000', padding: '2px', textAlign: 'right', fontFamily: 'monospace' }}>{slab.total.toFixed(2)}</td>
                  <td style={{ borderRight: '1px solid #000000', padding: '2px', textAlign: 'right', fontFamily: 'monospace' }}>{slab.scheme.toFixed(2)}</td>
                  <td style={{ borderRight: '1px solid #000000', padding: '2px', textAlign: 'right', fontFamily: 'monospace' }}>{slab.discount.toFixed(2)}</td>
                  <td style={{ borderRight: '1px solid #000000', padding: '2px', textAlign: 'right', fontFamily: 'monospace' }}>{slab.sgst.toFixed(2)}</td>
                  <td style={{ borderRight: '1px solid #000000', padding: '2px', textAlign: 'right', fontFamily: 'monospace' }}>{slab.cgst.toFixed(2)}</td>
                  <td style={{ padding: '2px', textAlign: 'right', fontFamily: 'monospace' }}>{slab.totalGst.toFixed(2)}</td>
                </tr>
              ))}
              {/* TOTAL ROW */}
              <tr style={{ borderTop: '1px solid #000000', background: '#f8fafc', fontWeight: 900 }}>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 2px' }}>TOTAL</td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 2px', textAlign: 'right', fontFamily: 'monospace' }}>{slabTotals.total.toFixed(2)}</td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 2px', textAlign: 'right', fontFamily: 'monospace' }}>{slabTotals.scheme.toFixed(2)}</td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 2px', textAlign: 'right', fontFamily: 'monospace' }}>{slabTotals.discount.toFixed(2)}</td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 2px', textAlign: 'right', fontFamily: 'monospace' }}>{slabTotals.sgst.toFixed(2)}</td>
                <td style={{ borderRight: '1px solid #000000', padding: '3px 2px', textAlign: 'right', fontFamily: 'monospace' }}>{slabTotals.cgst.toFixed(2)}</td>
                <td style={{ padding: '3px 2px', textAlign: 'right', fontFamily: 'monospace' }}>{slabTotals.totalGst.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Middle: Total Items & Total Qty */}
        <div style={{ borderRight: '1.5px solid #000000', padding: '6px 4px', fontSize: '8.5px', display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }}>
          <div>Total Items :- <strong>{currentItems.length}</strong></div>
          <div>Total Qty :- <strong>{totalQuantitySum}</strong></div>
        </div>

        {/* Right: Calculations Summary */}
        <div style={{ padding: '4px 6px', fontSize: '9px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: '1.5px 0', fontWeight: 700 }}>TOTAL</td>
                <td style={{ padding: '1.5px 0', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{taxableAmount.toFixed(2)}</td>
              </tr>
              <tr>
                <td style={{ padding: '1.5px 0', fontWeight: 700 }}>DIS AMT.</td>
                <td style={{ padding: '1.5px 0', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{discountAmt.toFixed(2)}</td>
              </tr>
              <tr>
                <td style={{ padding: '1.5px 0', fontWeight: 700 }}>SGST PAYBLE</td>
                <td style={{ padding: '1.5px 0', textAlign: 'right', fontFamily: 'monospace' }}>{sgstAmount.toFixed(2)}</td>
              </tr>
              <tr>
                <td style={{ padding: '1.5px 0', fontWeight: 700 }}>CGST PAYBLE</td>
                <td style={{ padding: '1.5px 0', textAlign: 'right', fontFamily: 'monospace' }}>{cgstAmount.toFixed(2)}</td>
              </tr>
              <tr>
                <td style={{ padding: '1.5px 0', fontWeight: 700 }}>CR/DR NOTE</td>
                <td style={{ padding: '1.5px 0', textAlign: 'right', fontFamily: 'monospace' }}>0.00</td>
              </tr>
              <tr style={{ borderTop: '1px solid #000000', fontSize: '11px', fontWeight: 900 }}>
                <td style={{ padding: '3px 0 1px 0' }}>Grand Total</td>
                <td style={{ padding: '3px 0 1px 0', textAlign: 'right', fontFamily: 'monospace' }}>₹{grandTotal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── FOOTER SEGMENT 2: WORDS, TERMS, BANK & SIGNATURE ── */}
      <div style={{ padding: '4px 8px', fontSize: '9.5px', borderBottom: '1px solid #000000', background: '#fafafa' }}>
        <strong>Rs. {numberToIndianWords(grandTotal)}</strong>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '60% 40%', fontSize: '8.5px' }}>
        {/* Left: Terms & Conditions + Bank Details + UPI QR */}
        <div style={{ borderRight: '1.5px solid #000000', padding: '5px 8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div>
            <div style={{ fontWeight: 800, textDecoration: 'underline', marginBottom: '2px' }}>Terms & Conditions</div>
            <div style={{ color: '#1f2937' }}>{companySettings.termsLine1 || 'Goods once sold will not be taken back or exchanged.'}</div>
            <div style={{ color: '#1f2937' }}>{companySettings.termsLine2 || `All disputes subject to ${companySettings.jurisdiction || 'Jurisdiction only.'}`}</div>
            <div style={{ color: '#1f2937' }}>{companySettings.termsLine3 || `Bills not paid due date will attract ${companySettings.creditInterestRate || '24'}% interest.`}</div>
          </div>

          <div style={{ borderTop: '1px dashed #9ca3af', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, textDecoration: 'underline', marginBottom: '2px' }}>Bank Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
                <div>Bank Name : <strong>{companySettings.bankName || bankDetails.bankName}</strong></div>
                <div>A/C No. : <strong style={{ fontFamily: 'monospace' }}>{companySettings.accountNo || bankDetails.accountNo}</strong></div>
                <div>IFSC Code : <strong style={{ fontFamily: 'monospace' }}>{companySettings.ifscCode || bankDetails.ifscCode}</strong></div>
                <div>Branch : <strong>{companySettings.branch || bankDetails.branch}</strong></div>
              </div>
              <div style={{ marginTop: '1px' }}>
                Account Name : <strong>{companySettings.accountName || bankDetails.accountName || companyName}</strong>
              </div>
            </div>

            {/* Dynamic UPI QR Code */}
            {companySettings.showUpiQrOnInvoice && companySettings.upiId && (
              <div style={{ textAlign: 'center', marginLeft: '8px', borderLeft: '1px dashed #cbd5e1', paddingLeft: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <QRCodeSVG
                  value={`upi://pay?pa=${companySettings.upiId}&pn=${encodeURIComponent(companySettings.upiPayeeName || companyName)}&am=${grandTotal.toFixed(2)}&cu=INR`}
                  size={48}
                  level="M"
                />
                <div style={{ fontSize: '7px', fontWeight: 800, color: '#0f766e', marginTop: '2px', textTransform: 'uppercase' }}>Scan & Pay UPI</div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Signature Box */}
        <div style={{
          padding: '6px 10px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'center',
          textAlign: 'center'
        }}>
          <div style={{
            fontWeight: 900,
            fontSize: '10.5px',
            textTransform: 'uppercase',
            textAlign: 'center',
            width: '100%',
            color: '#000000',
            letterSpacing: '0.4px'
          }}>
            FOR {companyName}
          </div>
          <div style={{
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            margin: '2px 0'
          }}>
            {(companySettings.signatureImage || bankDetails.signatureImage) ? (
              <img
                src={companySettings.signatureImage || bankDetails.signatureImage}
                alt={`Official Stamp / Signature for ${companyName}`}
                style={{
                  maxHeight: '44px',
                  maxWidth: '140px',
                  objectFit: 'contain',
                  display: 'block',
                  margin: '0 auto'
                }}
              />
            ) : (
              <div style={{ height: '40px' }} />
            )}
          </div>
          <div style={{
            borderTop: '1px solid #000000',
            paddingTop: '3px',
            fontWeight: 800,
            fontSize: '9px',
            textAlign: 'center',
            width: '100%',
            color: '#000000'
          }}>
            Authorized Signatory
          </div>
        </div>
      </div>
    </div>
  );

  // -------------------------------------------------------------
  // FORMAT B: STANDARD RETAIL TAX INVOICE
  // -------------------------------------------------------------
  const renderRetailInvoiceSheet = (copyTitle: string, copySubtitle: string) => (
    <div className="tax-invoice-sheet" style={{
      boxSizing: 'border-box',
      width: '100%',
      maxWidth: '210mm',
      margin: '0 auto',
      background: '#ffffff',
      color: '#000000',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      fontSize: '11px',
      lineHeight: 1.35,
      border: '1.5px solid #000000',
      pageBreakInside: 'avoid',
      breakInside: 'avoid'
    }}>
      {/* Top Header */}
      <div style={{ position: 'relative', borderBottom: '1.5px solid #000000', padding: '8px 12px 10px 12px', textAlign: 'center' }}>
        <div style={{ position: 'absolute', right: '12px', top: '8px', textAlign: 'right' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {copyTitle}
          </div>
          <div style={{ fontSize: '9px', fontWeight: 600, color: '#333333' }}>
            {copySubtitle}
          </div>
        </div>

        <div style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '2px' }}>
          TAX INVOICE
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: '#0f766e',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 900,
            fontSize: '14px'
          }}>
            ✚
          </div>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#000', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {companyName}
          </h1>
        </div>

        {companyAddress && (
          <div style={{ fontSize: '10.5px', marginTop: '2px', color: '#111' }}>
            {companyAddress}
          </div>
        )}
        <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: 600 }}>
          <span>State : <strong>{companyState}</strong></span>
          <span style={{ margin: '0 8px' }}>•</span>
          <span>Code : <strong>{companyStateCode}</strong></span>
          {companyPhone && (
            <>
              <span style={{ margin: '0 8px' }}>•</span>
              <span>Phone : <strong>{companyPhone}</strong></span>
            </>
          )}
        </div>
        {(companyGstin || companyDlNo) && (
          <div style={{ fontSize: '10px', marginTop: '2px', fontWeight: 700 }}>
            {companyGstin && <span>GSTIN: <span style={{ fontFamily: 'monospace' }}>{companyGstin}</span></span>}
            {companyGstin && companyDlNo && <span style={{ margin: '0 8px' }}>|</span>}
            {companyDlNo && <span>D.L. No.: <span style={{ fontFamily: 'monospace' }}>{companyDlNo}</span></span>}
          </div>
        )}
      </div>

      {/* Buyer & Invoice Meta */}
      <div style={{ display: 'grid', gridTemplateColumns: '56% 44%', borderBottom: '1.5px solid #000000' }}>
        <div style={{ padding: '8px 12px', borderRight: '1.5px solid #000000', fontSize: '11px' }}>
          <div style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '9.5px', borderBottom: '1px solid #ddd', paddingBottom: '2px', marginBottom: '4px' }}>
            Details for Buyer
          </div>
          <div style={{ fontSize: '12px', fontWeight: 900, color: '#000', textTransform: 'uppercase' }}>
            {buyerName}
          </div>
          {buyerAddress && <div style={{ color: '#222', marginTop: '2px' }}>{buyerAddress}</div>}
          <div style={{ marginTop: '2px' }}>
            Phone: <strong>{buyerPhone || '—'}</strong> | GSTIN: <strong>{buyerGstin || 'URP'}</strong>
          </div>
        </div>

        <div style={{ padding: '8px 12px', fontSize: '11px' }}>
          <div>Invoice No : <strong style={{ fontFamily: 'monospace' }}>{invoice.invoiceNumber}</strong></div>
          <div>Date : <strong>{formatDate(invoice.invoiceDate)}</strong></div>
          <div>Payment Mode : <strong>{invoice.paymentMode || 'CASH'}</strong></div>
          <div>Place of Supply : <strong>{buyerState} ({buyerStateCode})</strong></div>
        </div>
      </div>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
        <thead>
          <tr style={{ borderBottom: '1.5px solid #000000', background: '#f8fafc', fontWeight: 800 }}>
            <th style={{ borderRight: '1px solid #000000', padding: '5px 4px', width: '32px', textAlign: 'center' }}>Sr</th>
            <th style={{ borderRight: '1px solid #000000', padding: '5px 8px', textAlign: 'left' }}>Item Description</th>
            <th style={{ borderRight: '1px solid #000000', padding: '5px 4px', width: '60px', textAlign: 'center' }}>HSN</th>
            <th style={{ borderRight: '1px solid #000000', padding: '5px 4px', width: '70px', textAlign: 'center' }}>Batch</th>
            <th style={{ borderRight: '1px solid #000000', padding: '5px 4px', width: '56px', textAlign: 'center' }}>Exp</th>
            <th style={{ borderRight: '1px solid #000000', padding: '5px 4px', width: '60px', textAlign: 'center' }}>Qty</th>
            <th style={{ borderRight: '1px solid #000000', padding: '5px 8px', width: '70px', textAlign: 'right' }}>Rate</th>
            <th style={{ padding: '5px 8px', width: '85px', textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {currentItems.map((item, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #000000' }}>
              <td style={{ borderRight: '1px solid #000000', padding: '4px', textAlign: 'center' }}>{idx + 1}</td>
              <td style={{ borderRight: '1px solid #000000', padding: '4px 8px', fontWeight: 700 }}>{item.medicineName}</td>
              <td style={{ borderRight: '1px solid #000000', padding: '4px', textAlign: 'center', fontFamily: 'monospace' }}>{item.hsnCode || '3004'}</td>
              <td style={{ borderRight: '1px solid #000000', padding: '4px', textAlign: 'center', fontFamily: 'monospace' }}>{item.batchNumber || '—'}</td>
              <td style={{ borderRight: '1px solid #000000', padding: '4px', textAlign: 'center' }}>
                {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : '—'}
              </td>
              <td style={{ borderRight: '1px solid #000000', padding: '4px', textAlign: 'center', fontWeight: 800 }}>{item.quantity || item.strips || 1}</td>
              <td style={{ borderRight: '1px solid #000000', padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{Number(item.unitPrice || 0).toFixed(2)}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 800, fontFamily: 'monospace' }}>{Number(item.totalAmount || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer */}
      <div style={{ padding: '8px 12px', borderTop: '1.5px solid #000000', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>Total Words:</strong> {numberToIndianWords(grandTotal)}
        </div>
        <div style={{ fontSize: '14px', fontWeight: 900 }}>
          Grand Total: ₹{grandTotal.toFixed(2)}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="invoice-modal-backdrop"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.8)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        overflow: 'hidden',
        padding: 0
      }}
    >
      {/* ── PROFESSIONAL ERP COMMAND RIBBON (PERMANENTLY PINNED AT TOP - NEVER SCROLLS) ── */}
      <div
        className="no-print"
        style={{
          width: '100%',
          flexShrink: 0,
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'center',
          boxSizing: 'border-box',
          zIndex: 110,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)'
        }}
      >
        <div style={{
          width: '100%',
          maxWidth: '210mm',
          background: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.25)',
          overflow: 'hidden'
        }}>
        {/* Tier 1: Document Meta & Status Header */}
        <div style={{
          padding: '8px 14px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          {/* Left: Invoice Badge, Number, Firm and Buyer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{
              background: '#0f766e',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 800,
              padding: '2.5px 8px',
              borderRadius: '4px',
              letterSpacing: '0.4px',
              textTransform: 'uppercase'
            }}>
              TAX INVOICE
            </span>
            <strong style={{ fontSize: '13px', color: '#0f172a', fontFamily: 'monospace', letterSpacing: '0.5px' }}>
              #{invoice.invoiceNumber}
            </strong>

            <span style={{ color: '#cbd5e1' }}>•</span>

            <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>
              🏢 <strong style={{ color: '#0f172a' }}>{companyName}</strong>
            </span>

            <span style={{ color: '#cbd5e1' }}>•</span>

            <span style={{ fontSize: '11.5px', color: '#475569' }}>
              Buyer: <strong style={{ color: '#0f172a' }}>{buyerName}</strong>
            </span>
          </div>

          {/* Right: Status Pill & Close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              padding: '2.5px 8px',
              borderRadius: '4px',
              fontSize: '10.5px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              background: invoice.status === 'PAID' ? '#dcfce7' : (invoice.status === 'CANCELLED' ? '#fee2e2' : '#fef3c7'),
              color: invoice.status === 'PAID' ? '#166534' : (invoice.status === 'CANCELLED' ? '#991b1b' : '#92400e'),
              border: `1px solid ${invoice.status === 'PAID' ? '#86efac' : (invoice.status === 'CANCELLED' ? '#fca5a5' : '#fde68a')}`
            }}>
              {invoice.status || 'ISSUED'}
            </span>

            <button
              type="button"
              onClick={onClose}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '26px',
                height: '26px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '5px',
                color: '#64748b',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Close [Esc]"
              onMouseEnter={e => {
                e.currentTarget.style.color = '#dc2626';
                e.currentTarget.style.borderColor = '#fca5a5';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = '#64748b';
                e.currentTarget.style.borderColor = '#cbd5e1';
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Tier 2: Print Layout & Action Controls */}
        <div style={{
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          {/* Left Group: Format & Copy Toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Format Toggle */}
            <div style={{
              display: 'inline-flex',
              background: '#f1f5f9',
              borderRadius: '6px',
              padding: '2px',
              border: '1px solid #cbd5e1'
            }}>
              <button
                type="button"
                onClick={() => setLayoutMode('B2B_WHOLESALE')}
                style={{
                  border: 'none',
                  background: layoutMode === 'B2B_WHOLESALE' ? '#0f766e' : 'transparent',
                  color: layoutMode === 'B2B_WHOLESALE' ? '#ffffff' : '#475569',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Standard Indian Pharma Wholesale GST Invoice"
              >
                🏢 Wholesale Format
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('RETAIL_STANDARD')}
                style={{
                  border: 'none',
                  background: layoutMode === 'RETAIL_STANDARD' ? '#0f766e' : 'transparent',
                  color: layoutMode === 'RETAIL_STANDARD' ? '#ffffff' : '#475569',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Retail Clinic Tax Invoice"
              >
                🧾 Retail Format
              </button>
            </div>

            {/* Copy Mode Toggle */}
            <div style={{
              display: 'inline-flex',
              background: '#f1f5f9',
              borderRadius: '6px',
              padding: '2px',
              border: '1px solid #cbd5e1'
            }}>
              <button
                type="button"
                onClick={() => setCopyMode('CUSTOMER')}
                style={{
                  border: 'none',
                  background: copyMode === 'CUSTOMER' ? '#1e3a8a' : 'transparent',
                  color: copyMode === 'CUSTOMER' ? '#ffffff' : '#475569',
                  padding: '4px 9px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Customer Copy
              </button>
              <button
                type="button"
                onClick={() => setCopyMode('SHOP')}
                style={{
                  border: 'none',
                  background: copyMode === 'SHOP' ? '#1e3a8a' : 'transparent',
                  color: copyMode === 'SHOP' ? '#ffffff' : '#475569',
                  padding: '4px 9px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Shop Copy
              </button>
              <button
                type="button"
                onClick={() => setCopyMode('BOTH')}
                style={{
                  border: 'none',
                  background: copyMode === 'BOTH' ? '#1e3a8a' : 'transparent',
                  color: copyMode === 'BOTH' ? '#ffffff' : '#475569',
                  padding: '4px 9px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Both Copies (2 Pages)
              </button>
            </div>
          </div>

          {/* Right Group: Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer'
              }}
              title="Configure Bank Details, UPI QR, Logo & Official Stamp"
            >
              <Settings2 size={13} color="#0f766e" />
              <span>Firm Settings</span>
            </button>

            {invoice.payments && invoice.payments.length > 0 && (
              <button
                type="button"
                onClick={() => setShowVouchers(!showVouchers)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#334155',
                  cursor: 'pointer'
                }}
              >
                <FileText size={13} />
                <span>Vouchers ({invoice.payments.length})</span>
                {showVouchers ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            )}

            {onEdit && invoice.status !== 'CANCELLED' && (
              <button
                type="button"
                onClick={() => onEdit(invoice.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: '#2563eb',
                  cursor: 'pointer'
                }}
              >
                <Edit2 size={12} /> <span>Edit</span>
              </button>
            )}

            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(invoice.id, invoice.invoiceNumber)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: '#dc2626',
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={12} /> <span>{invoice.status === 'CANCELLED' ? 'Delete' : 'Cancel'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 14px',
                background: '#0f766e',
                border: '1px solid #0f766e',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 800,
                color: '#ffffff',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(15, 118, 110, 0.25)'
              }}
            >
              <Printer size={13} />
              <span>Print Invoice</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Close Invoice [Esc]"
              onMouseEnter={e => {
                e.currentTarget.style.color = '#dc2626';
                e.currentTarget.style.borderColor = '#fca5a5';
                e.currentTarget.style.background = '#fef2f2';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = '#475569';
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.background = '#ffffff';
              }}
            >
              <X size={13} />
              <span>Close <span style={{ fontSize: '10px', opacity: 0.7 }}>(Esc)</span></span>
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* ── INDEPENDENT SCROLLABLE INVOICE SHEET CONTAINER (ONLY THIS SCROLLS) ── */}
    <div
      ref={modalBackdropRef}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{
        flex: '1 1 auto',
        width: '100%',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 16px 48px 16px',
        boxSizing: 'border-box'
      }}
    >
      {/* ── ALL 7 PROFESSIONAL COMPANY SETTINGS MODAL ── */}
      <CompanySettingsModal
        activeCompany={comp}
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onSaved={(updated) => {
          setCompanySettings(updated);
          setBankDetails(prev => ({
            ...prev,
            bankName: updated.bankName,
            accountNo: updated.accountNo,
            ifscCode: updated.ifscCode,
            branch: updated.branch,
            accountName: updated.accountName,
            signatureImage: updated.signatureImage
          }));
        }}
      />

      {/* ── PRINTABLE INVOICE CONTAINER ── */}
      <div id="printable-tax-invoice" className="tax-invoice-print-container" style={{
        width: '100%',
        maxWidth: '210mm',
        boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
        borderRadius: '2px'
      }}>
        {/* Customer Copy */}
        {(copyMode === 'CUSTOMER' || copyMode === 'BOTH') && (
          <div style={{ pageBreakAfter: copyMode === 'BOTH' ? 'always' : 'auto' }}>
            {copyMode === 'BOTH' && (
              <div className="no-print" style={{
                background: '#0f766e',
                color: '#ffffff',
                fontSize: '10.5px',
                fontWeight: 800,
                padding: '3px 10px',
                borderRadius: '4px 4px 0 0',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                letterSpacing: '0.4px',
                marginBottom: '0px'
              }}>
                📄 PAGE 1 : ORIGINAL FOR RECIPIENT (CUSTOMER COPY)
              </div>
            )}
            {layoutMode === 'B2B_WHOLESALE'
              ? renderWholesaleB2BInvoiceSheet('ORIGINAL FOR RECIPIENT', '(CUSTOMER COPY)')
              : renderRetailInvoiceSheet('ORIGINAL FOR RECIPIENT', '(CUSTOMER COPY)')}
          </div>
        )}

        {/* Separator if displaying both on screen */}
        {copyMode === 'BOTH' && (
          <div className="no-print" style={{
            margin: '24px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            width: '100%'
          }}>
            <div style={{ flex: 1, height: '1.5px', background: '#94a3b8', opacity: 0.5 }} />
            <span style={{
              background: '#1e3a8a',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 800,
              padding: '4px 14px',
              borderRadius: '20px',
              letterSpacing: '0.5px',
              boxShadow: '0 4px 12px rgba(30, 58, 138, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              ✂️ PAGE 2 : DUPLICATE FOR SUPPLIER (SHOP / AUDIT COPY)
            </span>
            <div style={{ flex: 1, height: '1.5px', background: '#94a3b8', opacity: 0.5 }} />
          </div>
        )}

        {/* Shop / Supplier Copy */}
        {(copyMode === 'SHOP' || copyMode === 'BOTH') && (
          <div>
            {copyMode === 'BOTH' && (
              <div className="no-print" style={{
                background: '#1e3a8a',
                color: '#ffffff',
                fontSize: '10.5px',
                fontWeight: 800,
                padding: '3px 10px',
                borderRadius: '4px 4px 0 0',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                letterSpacing: '0.4px',
                marginBottom: '0px'
              }}>
                📄 PAGE 2 : DUPLICATE FOR SUPPLIER (SHOP / AUDIT COPY)
              </div>
            )}
            {layoutMode === 'B2B_WHOLESALE'
              ? renderWholesaleB2BInvoiceSheet('DUPLICATE FOR SUPPLIER', '(SHOP / AUDIT COPY)')
              : renderRetailInvoiceSheet('DUPLICATE FOR SUPPLIER', '(SHOP / AUDIT COPY)')}
          </div>
        )}
      </div>
    </div>
  </div>
);
};

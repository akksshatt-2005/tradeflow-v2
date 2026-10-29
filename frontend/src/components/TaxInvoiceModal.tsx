import React, { useState } from 'react';
import { Printer, Edit2, Trash2, X, ChevronDown, ChevronUp, FileText } from 'lucide-react';
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

export const TaxInvoiceModal: React.FC<TaxInvoiceModalProps> = ({
  invoice,
  activeCompany,
  onClose,
  onEdit,
  onDelete,
  onVoidPayment
}) => {
  const [copyMode, setCopyMode] = useState<CopyMode>('CUSTOMER');
  const [showVouchers, setShowVouchers] = useState(false);

  // Active company details
  const comp = invoice.company || activeCompany || {};
  const companyName = comp.name || 'NEURO HARMONY CLINIC';
  const companyAddress = comp.address && comp.address.trim()
    ? `${comp.address.trim()}${comp.city ? `, ${comp.city.trim()}` : ''}${comp.pincode ? ` - ${comp.pincode.trim()}` : ''}`
    : '';

  // Correct state spelling to UTTAR PRADESH and state code to 09
  const { stateName: companyState, stateCode: companyStateCode } = normalizeIndianState(comp.state, comp.gstin);

  // Phone number (enforce Contact : 9703533694 only)
  let companyPhone = '9703533694';
  if (comp.phone && comp.phone.trim()) {
    companyPhone = comp.phone.trim().replace('9703433694', '9703533694');
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

  // Buyer details
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
    : 'Dr. Priyadarshi Srivastava';
  const doctorRegNo = invoice.doctorRegNo || 'UPMC 59048';
  const patientName = invoice.patientName || invoice.customerName;

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

  // Proportional ERP filler row calculation (ensures clean column lines down to TOTAL row without page overflow)
  const currentItems = invoice.items || [];
  // For 1 item: 45mm, 3 items: 35mm, 5 items: 25mm, 8 items: 15mm, 10+ items: 10mm
  const fillerRowHeightMm = Math.max(10, Math.round(50 - (currentItems.length * 5)));

  // Group items for HSN/SAC Tax Summary
  const hsnGroups = React.useMemo(() => {
    const groups: Record<string, { hsn: string; taxable: number; gstRate: number; cgst: number; sgst: number; totalTax: number }> = {};
    const items = invoice.items || [];

    if (items.length === 0) {
      groups['3004'] = {
        hsn: '3004',
        taxable: taxableAmount,
        gstRate: totalTax > 0 && taxableAmount > 0 ? Math.round((totalTax / taxableAmount) * 100) : 0,
        cgst: cgstAmount,
        sgst: sgstAmount,
        totalTax: totalTax
      };
      return Object.values(groups);
    }

    items.forEach((item) => {
      const hsn = item.hsnCode || '3004';
      const rate = Number(item.gstRate || 0);
      const key = `${hsn}-${rate}`;
      const itemTaxable = Number(item.taxableAmount || item.totalAmount || 0);
      const itemCgst = Number(item.cgstAmount || (itemTaxable * (rate / 200)));
      const itemSgst = Number(item.sgstAmount || (itemTaxable * (rate / 200)));
      const itemTax = itemCgst + itemSgst;

      if (!groups[key]) {
        groups[key] = {
          hsn,
          taxable: 0,
          gstRate: rate,
          cgst: 0,
          sgst: 0,
          totalTax: 0
        };
      }

      groups[key].taxable += itemTaxable;
      groups[key].cgst += itemCgst;
      groups[key].sgst += itemSgst;
      groups[key].totalTax += itemTax;
    });

    return Object.values(groups);
  }, [invoice.items, taxableAmount, totalTax, cgstAmount, sgstAmount]);

  // Compute total billed quantity units
  const totalQuantitySum = React.useMemo(() => {
    const items = invoice.items || [];
    let stripsCount = 0;
    let tabsCount = 0;
    let baseUnits = 0;

    items.forEach(item => {
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

    return parts.length > 0 ? parts.join(' + ') : `${items.length} items`;
  }, [invoice.items]);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime())
        ? '—'
        : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const renderSingleInvoiceSheet = (copyTitle: string, copySubtitle: string) => (
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
      {/* TOP HEADER */}
        <div style={{ position: 'relative', borderBottom: '1.5px solid #000000', padding: '8px 12px 10px 12px', textAlign: 'center' }}>
          {/* Copy Indicator */}
          <div style={{ position: 'absolute', right: '12px', top: '8px', textAlign: 'right' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {copyTitle}
            </div>
            <div style={{ fontSize: '9px', fontWeight: 600, color: '#333333' }}>
              {copySubtitle}
            </div>
          </div>

          {/* Invoice Title */}
          <div style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '2px' }}>
            TAX INVOICE
          </div>

          {/* Company Identity */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <div style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: '#0f766e',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '15px'
            }}>
              ✚
            </div>
            <h1 style={{ margin: 0, fontSize: '19px', fontWeight: 900, color: '#000', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {companyName}
            </h1>
          </div>

          {companyAddress && (
            <div style={{ fontSize: '10.5px', marginTop: '2px', color: '#111' }}>
              {companyAddress}
            </div>
          )}
          <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: 600 }}>
            <span>State Name : <strong>{companyState}</strong></span>
            <span style={{ margin: '0 10px' }}>&nbsp;</span>
            <span>State Code : <strong>{companyStateCode}</strong></span>
          </div>
          <div style={{ fontSize: '11px', marginTop: '2px', color: '#111', fontWeight: 600 }}>
            Contact : <strong>{companyPhone}</strong>
            {companyEmail && (
              <span style={{ marginLeft: '12px' }}>E-Mail : <strong>{companyEmail}</strong></span>
            )}
          </div>
          {(companyGstin || companyDlNo) && (
            <div style={{ fontSize: '10.5px', marginTop: '2px', fontWeight: 700 }}>
              {companyGstin && <span>GSTIN/UIN: <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{companyGstin}</span></span>}
              {companyGstin && companyDlNo && <span style={{ margin: '0 8px' }}>|</span>}
              {companyDlNo && <span>D.L. No.: <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{companyDlNo}</span></span>}
            </div>
          )}
        </div>

        {/* DETAILS FOR BUYER & INVOICE META (TWO COLUMNS) */}
        <div style={{ display: 'grid', gridTemplateColumns: '56% 44%', borderBottom: '1.5px solid #000000' }}>
          {/* Buyer Details */}
          <div style={{ padding: '8px 12px', borderRight: '1.5px solid #000000', fontSize: '11px' }}>
            <div style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '10px', borderBottom: '1px solid #ddd', paddingBottom: '3px', marginBottom: '5px', letterSpacing: '0.3px' }}>
              Details for Buyer (Billed & Shipped To)
            </div>
            <div style={{ fontSize: '13px', fontWeight: 900, color: '#000', textTransform: 'uppercase' }}>
              {buyerName}
            </div>
            {buyerAddress && buyerAddress !== 'Local' && (
              <div style={{ color: '#222', marginTop: '2px' }}>{buyerAddress}</div>
            )}
            <div style={{ marginTop: '3px' }}>
              State Name : <strong>{buyerState}</strong> &nbsp;&nbsp;&nbsp; Code : <strong>{buyerStateCode}</strong>
            </div>
            {buyerGstin && (
              <div style={{ marginTop: '2px' }}>
                <span>GSTIN No : <strong>{buyerGstin}</strong></span>
                {buyerPan && <span style={{ marginLeft: '12px' }}>PAN No : <strong>{buyerPan}</strong></span>}
              </div>
            )}
            {buyerPhone && (
              <div style={{ marginTop: '2px' }}>
                Contact Details : <strong>{buyerPhone}</strong>
              </div>
            )}

            {/* Doctor / Patient Prescription Details */}
            <div style={{ marginTop: '5px', paddingTop: '5px', borderTop: '1px dashed #ccc', fontSize: '10.5px', color: '#111' }}>
              <div>Doctor : <strong>{doctorName}</strong> {doctorRegNo && <span style={{ color: '#333' }}>(Reg No: <strong>{doctorRegNo}</strong>)</span>}</div>
              <div>Patient : <strong>{patientName}</strong></div>
            </div>
          </div>

          {/* Invoice Meta */}
          <div style={{ padding: '8px 12px', fontSize: '11px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '3px 0', color: '#333', width: '42%' }}>Invoice No.</td>
                  <td style={{ padding: '3px 0', fontWeight: 900, fontFamily: 'monospace', fontSize: '12.5px' }}>: {invoice.invoiceNumber}</td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 0', color: '#333' }}>Dated</td>
                  <td style={{ padding: '3px 0', fontWeight: 700 }}>: {formatDate(invoice.invoiceDate)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 0', color: '#333' }}>Terms of Delivery</td>
                  <td style={{ padding: '3px 0', fontWeight: 600 }}>: IMMEDIATE / COUNTER SALE</td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 0', color: '#333' }}>Mode of Payment</td>
                  <td style={{ padding: '3px 0', fontWeight: 800 }}>: {invoice.paymentMode || 'CASH'}</td>
                </tr>
                {invoice.dueDate && (
                  <tr>
                    <td style={{ padding: '3px 0', color: '#333' }}>Due Date</td>
                    <td style={{ padding: '3px 0', fontWeight: 700, color: '#b91c1c' }}>: {formatDate(invoice.dueDate)}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '3px 0', color: '#333' }}>Place of Supply</td>
                  <td style={{ padding: '3px 0', fontWeight: 600 }}>: {buyerState} ({buyerStateCode})</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ITEMS GRID TABLE (WITH FILLER ROWS FOR FULL-PAGE PRESENCE) */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid #000000', background: '#f8fafc', fontWeight: 800 }}>
              <th style={{ borderRight: '1px solid #000000', padding: '5px 4px', width: '32px', textAlign: 'center' }}>Sr<br/>No</th>
              <th style={{ borderRight: '1px solid #000000', padding: '5px 8px', textAlign: 'left' }}>Item Description</th>
              <th style={{ borderRight: '1px solid #000000', padding: '5px 4px', width: '60px', textAlign: 'center' }}>HSN<br/>Code</th>
              <th style={{ borderRight: '1px solid #000000', padding: '5px 4px', width: '75px', textAlign: 'center' }}>Batch</th>
              <th style={{ borderRight: '1px solid #000000', padding: '5px 4px', width: '56px', textAlign: 'center' }}>Exp</th>
              <th style={{ borderRight: '1px solid #000000', padding: '5px 4px', width: '76px', textAlign: 'center' }}>Billed<br/>Qty</th>
              <th style={{ borderRight: '1px solid #000000', padding: '5px 4px', width: '45px', textAlign: 'center' }}>Per</th>
              <th style={{ borderRight: '1px solid #000000', padding: '5px 8px', width: '70px', textAlign: 'right' }}>Rate<br/>(₹)</th>
              <th style={{ padding: '5px 8px', width: '85px', textAlign: 'right' }}>Gross<br/>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {currentItems.map((item, idx) => {
              const expFormatted = item.expiryDate
                ? new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
                : '—';

              const perLabel = item.strips && item.strips > 0
                ? 'Strip'
                : (item.looseQty && item.looseQty > 0 ? 'Tab' : (item.unit || 'pcs'));

              const qtyLabel = (item.strips && item.strips > 0 && item.looseQty && item.looseQty > 0)
                ? `${item.strips} Str + ${item.looseQty} Tab`
                : (item.strips && item.strips > 0
                  ? `${item.strips} Strip`
                  : (item.looseQty && item.looseQty > 0
                    ? `${item.looseQty} Tab`
                    : `${item.quantity || 1} pcs`));

              return (
                <tr key={idx} style={{ borderBottom: '1px solid #000000' }}>
                  <td style={{ borderRight: '1px solid #000000', padding: '5px 4px', textAlign: 'center', verticalAlign: 'top', color: '#444' }}>
                    {idx + 1}
                  </td>
                  <td style={{ borderRight: '1px solid #000000', padding: '5px 8px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 800, fontSize: '11px', color: '#000' }}>
                      {item.medicineName || 'Medicine Item'}
                    </div>
                    {(item.sku || item.genericName) && (
                      <div style={{ fontSize: '9px', color: '#555', marginTop: '1px' }}>
                        {item.sku} {item.genericName ? `• ${item.genericName}` : ''}
                      </div>
                    )}
                  </td>
                  <td style={{ borderRight: '1px solid #000000', padding: '5px 4px', textAlign: 'center', verticalAlign: 'top', fontFamily: 'monospace' }}>
                    {item.hsnCode || '3004'}
                  </td>
                  <td style={{ borderRight: '1px solid #000000', padding: '5px 4px', textAlign: 'center', verticalAlign: 'top', fontFamily: 'monospace', fontWeight: 600 }}>
                    {item.batchNumber || '—'}
                  </td>
                  <td style={{ borderRight: '1px solid #000000', padding: '5px 4px', textAlign: 'center', verticalAlign: 'top', color: '#222' }}>
                    {expFormatted}
                  </td>
                  <td style={{ borderRight: '1px solid #000000', padding: '5px 4px', textAlign: 'center', verticalAlign: 'top', fontWeight: 700 }}>
                    {qtyLabel}
                    {Number(item.freeQuantity || 0) > 0 && (
                      <div style={{ fontSize: '8.5px', color: '#047857' }}>+{item.freeQuantity} free</div>
                    )}
                  </td>
                  <td style={{ borderRight: '1px solid #000000', padding: '5px 4px', textAlign: 'center', verticalAlign: 'top', color: '#555' }}>
                    {perLabel}
                  </td>
                  <td style={{ borderRight: '1px solid #000000', padding: '5px 8px', textAlign: 'right', verticalAlign: 'top', fontFamily: 'monospace' }}>
                    {Number(item.unitPrice || 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', verticalAlign: 'top', fontWeight: 800, fontFamily: 'monospace' }}>
                    {Number(item.totalAmount || 0).toFixed(2)}
                  </td>
                </tr>
              );
            })}

            {/* CONTINUOUS EXTENDED VERTICAL COLUMN DIVIDERS (AUTHENTIC TALLY / MARG ERP PHARMA STYLE) */}
            <tr style={{ height: `${fillerRowHeightMm}mm` }}>
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

            {/* TOTAL ROW */}
            <tr style={{ borderBottom: '1.5px solid #000000', background: '#f8fafc', fontWeight: 900 }}>
              <td colSpan={5} style={{ borderRight: '1px solid #000000', padding: '5px 8px', textAlign: 'center', letterSpacing: '1px' }}>
                TOTAL
              </td>
              <td style={{ borderRight: '1px solid #000000', padding: '5px 4px', textAlign: 'center' }}>
                {totalQuantitySum}
              </td>
              <td style={{ borderRight: '1px solid #000000', padding: '5px 4px', textAlign: 'center' }}>
                —
              </td>
              <td style={{ borderRight: '1px solid #000000', padding: '5px 8px', textAlign: 'right' }}>
                —
              </td>
              <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontSize: '11.5px' }}>
                ₹{subtotal.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* TAX BREAKDOWN & AMOUNT CALCULATIONS (TWO COLUMNS) */}
        <div style={{ display: 'grid', gridTemplateColumns: '58% 42%', borderBottom: '1.5px solid #000000' }}>
          {/* Left: HSN/SAC Tax Summary Table */}
          <div style={{ borderRight: '1.5px solid #000000' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', textAlign: 'center' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #000000', background: '#f1f5f9', fontWeight: 800 }}>
                  <th rowSpan={2} style={{ borderRight: '1px solid #000000', padding: '4px 3px', width: '50px' }}>HSN/SAC</th>
                  <th rowSpan={2} style={{ borderRight: '1px solid #000000', padding: '4px 6px' }}>Taxable<br/>Value (₹)</th>
                  <th colSpan={2} style={{ borderRight: '1px solid #000000', padding: '3px 2px', borderBottom: '1px solid #000000' }}>Central Tax</th>
                  <th colSpan={2} style={{ borderRight: '1px solid #000000', padding: '3px 2px', borderBottom: '1px solid #000000' }}>State Tax</th>
                  <th rowSpan={2} style={{ padding: '4px 6px', width: '65px' }}>Total Tax<br/>Amount (₹)</th>
                </tr>
                <tr style={{ borderBottom: '1px solid #000000', background: '#f1f5f9', fontWeight: 700, fontSize: '9px' }}>
                  <th style={{ borderRight: '1px solid #000000', padding: '3px 2px', width: '32px' }}>Rate</th>
                  <th style={{ borderRight: '1px solid #000000', padding: '3px 4px' }}>Amount</th>
                  <th style={{ borderRight: '1px solid #000000', padding: '3px 2px', width: '32px' }}>Rate</th>
                  <th style={{ borderRight: '1px solid #000000', padding: '3px 4px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {hsnGroups.map((grp, gIdx) => {
                  const halfRate = (grp.gstRate / 2).toFixed(2);
                  return (
                    <tr key={gIdx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ borderRight: '1px solid #000000', padding: '3.5px 2px', fontFamily: 'monospace' }}>{grp.hsn}</td>
                      <td style={{ borderRight: '1px solid #000000', padding: '3.5px 4px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {grp.taxable.toFixed(2)}
                      </td>
                      <td style={{ borderRight: '1px solid #000000', padding: '3.5px 2px' }}>{halfRate}%</td>
                      <td style={{ borderRight: '1px solid #000000', padding: '3.5px 4px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {grp.cgst.toFixed(2)}
                      </td>
                      <td style={{ borderRight: '1px solid #000000', padding: '3.5px 2px' }}>{halfRate}%</td>
                      <td style={{ borderRight: '1px solid #000000', padding: '3.5px 4px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {grp.sgst.toFixed(2)}
                      </td>
                      <td style={{ padding: '3.5px 4px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                        {grp.totalTax.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
                {/* Tax Total Row */}
                <tr style={{ borderTop: '1px solid #000000', background: '#f8fafc', fontWeight: 900 }}>
                  <td style={{ borderRight: '1px solid #000000', padding: '4px 4px' }}>Total</td>
                  <td style={{ borderRight: '1px solid #000000', padding: '4px 4px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {taxableAmount.toFixed(2)}
                  </td>
                  <td style={{ borderRight: '1px solid #000000', padding: '4px 2px' }}>—</td>
                  <td style={{ borderRight: '1px solid #000000', padding: '4px 4px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {cgstAmount.toFixed(2)}
                  </td>
                  <td style={{ borderRight: '1px solid #000000', padding: '4px 2px' }}>—</td>
                  <td style={{ borderRight: '1px solid #000000', padding: '4px 4px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {sgstAmount.toFixed(2)}
                  </td>
                  <td style={{ padding: '4px 4px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {totalTax.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Right: Calculations & Invoice Total */}
          <div style={{ padding: '6px 12px', fontSize: '11px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '2.5px 0', color: '#333' }}>Total Amount Before Tax</td>
                  <td style={{ padding: '2.5px 0', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                    ₹{taxableAmount.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '2.5px 0', color: '#333' }}>CGST (Central Tax)</td>
                  <td style={{ padding: '2.5px 0', textAlign: 'right', fontFamily: 'monospace' }}>
                    ₹{cgstAmount.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '2.5px 0', color: '#333' }}>SGST (State Tax)</td>
                  <td style={{ padding: '2.5px 0', textAlign: 'right', fontFamily: 'monospace' }}>
                    ₹{sgstAmount.toFixed(2)}
                  </td>
                </tr>
                {discountAmt > 0 && (
                  <tr style={{ color: '#b91c1c' }}>
                    <td style={{ padding: '2.5px 0' }}>Discount {discountPct > 0 ? `(${discountPct}%)` : ''}</td>
                    <td style={{ padding: '2.5px 0', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                      -₹{discountAmt.toFixed(2)}
                    </td>
                  </tr>
                )}
                {roundOff !== 0 && (
                  <tr>
                    <td style={{ padding: '2.5px 0', color: '#333' }}>Round Off</td>
                    <td style={{ padding: '2.5px 0', textAlign: 'right', fontFamily: 'monospace' }}>
                      {roundOff > 0 ? `+₹${roundOff.toFixed(2)}` : `-₹${Math.abs(roundOff).toFixed(2)}`}
                    </td>
                  </tr>
                )}
                <tr style={{ borderTop: '1.5px solid #000000' }}>
                  <td style={{ padding: '6px 0 2px 0', fontSize: '13px', fontWeight: 900 }}>Invoice Total</td>
                  <td style={{ padding: '6px 0 2px 0', textAlign: 'right', fontSize: '15px', fontWeight: 900, fontFamily: 'monospace' }}>
                    ₹{grandTotal.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Amount in Words */}
        <div style={{
          borderBottom: '1.5px solid #000000',
          padding: '7px 12px',
          fontSize: '11px',
          background: '#fafafa'
        }}>
          <strong>Amount In Words :</strong> {numberToIndianWords(grandTotal)}
        </div>

        {/* Clean, Authentic Clinic Terms & Signatory Box */}
        <div style={{ display: 'grid', gridTemplateColumns: '60% 40%' }}>
          {/* Clinic Dispensing Policy & Terms */}
          <div style={{ padding: '8px 12px', borderRight: '1.5px solid #000000', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '10px', marginBottom: '4px', letterSpacing: '0.4px', color: '#111' }}>
                Terms & Conditions :
              </div>
              <ol style={{ margin: 0, paddingLeft: '16px', fontSize: '9px', lineHeight: 1.45, color: '#222' }}>
                <li>Medicines dispensed strictly against a registered medical practitioner's prescription.</li>
                <li>Store medicines in a cool, dry place protected from heat and direct sunlight.</li>
                <li>Unbroken items in original packaging may be exchanged within 7 days against this bill.</li>
                <li>Please consult your treating doctor for dosage instructions and regular follow-up.</li>
              </ol>
            </div>
            <div style={{ fontSize: '9px', fontStyle: 'italic', color: '#0f766e', fontWeight: 700, marginTop: '8px', paddingBottom: '4px' }}>
              ✦ Thank you for visiting! Wishing you a speedy recovery & good health.
            </div>
          </div>

          {/* Authorised Signatory */}
          <div style={{ padding: '8px 12px', textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800 }}>For {companyName}</div>
            </div>
            <div style={{ height: '36px' }}>
              {/* Clean physical signature whitespace */}
            </div>
            <div style={{ borderTop: '1px solid #000000', paddingTop: '4px', paddingBottom: '4px', fontSize: '10.5px', fontWeight: 800 }}>
              Authorised Signatory
            </div>
          </div>
        </div>
      </div>
  );

  return (
    <div className="invoice-modal-backdrop" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(3px)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      overflowY: 'auto',
      padding: '1rem'
    }}>
      {/* ── ON-SCREEN TOOLBAR (NO-PRINT) ── */}
      <div className="no-print" style={{
        width: '100%',
        maxWidth: '210mm',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
        padding: '0.65rem 1rem',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.8rem',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
      }}>
        {/* Left: Invoice Badge & Copy Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{
              background: '#0f766e',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: '4px',
              letterSpacing: '0.5px'
            }}>
              TAX INVOICE
            </span>
            <strong style={{ fontSize: '13px', color: '#0f172a' }}>#{invoice.invoiceNumber}</strong>
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
                background: copyMode === 'CUSTOMER' ? '#0f766e' : 'transparent',
                color: copyMode === 'CUSTOMER' ? '#ffffff' : '#334155',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Prints 1 single full-page marked Original for Recipient"
            >
              Customer Copy (1 Full Page)
            </button>
            <button
              type="button"
              onClick={() => setCopyMode('SHOP')}
              style={{
                border: 'none',
                background: copyMode === 'SHOP' ? '#0f766e' : 'transparent',
                color: copyMode === 'SHOP' ? '#ffffff' : '#334155',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Prints 1 full page marked Duplicate for Supplier"
            >
              Shop Copy
            </button>
            <button
              type="button"
              onClick={() => setCopyMode('BOTH')}
              style={{
                border: 'none',
                background: copyMode === 'BOTH' ? '#0f766e' : 'transparent',
                color: copyMode === 'BOTH' ? '#ffffff' : '#334155',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Prints both Original and Duplicate copies"
            >
              Both Copies (2 Pages)
            </button>
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {invoice.payments && invoice.payments.length > 0 && (
            <button
              type="button"
              onClick={() => setShowVouchers(!showVouchers)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.45rem 0.75rem',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              <FileText size={13} />
              Vouchers ({invoice.payments.length})
              {showVouchers ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}

          {onEdit && invoice.status !== 'CANCELLED' && (
            <button
              type="button"
              onClick={() => onEdit(invoice.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.45rem 0.75rem',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 700,
                color: '#2563eb',
                cursor: 'pointer'
              }}
            >
              <Edit2 size={13} /> Edit
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(invoice.id, invoice.invoiceNumber)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.45rem 0.75rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 700,
                color: '#dc2626',
                cursor: 'pointer'
              }}
            >
              <Trash2 size={13} /> {invoice.status === 'CANCELLED' ? 'Delete' : 'Cancel'}
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 1rem',
              background: '#0f766e',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 800,
              color: '#ffffff',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(15, 118, 110, 0.3)'
            }}
          >
            <Printer size={15} /> Print {copyMode === 'CUSTOMER' ? 'Customer Copy' : (copyMode === 'SHOP' ? 'Shop Copy' : 'Both')}
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              color: '#475569',
              cursor: 'pointer'
            }}
            title="Close [Esc]"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── ON-SCREEN COLLAPSIBLE PAYMENT VOUCHERS PANEL (NO-PRINT) ── */}
      {showVouchers && invoice.payments && invoice.payments.length > 0 && (
        <div className="no-print" style={{
          width: '100%',
          maxWidth: '210mm',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '0.8rem 1rem',
          marginBottom: '1rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
        }}>
          <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.5px' }}>
            Recorded Payment Vouchers (Audit Ledger)
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '4px 6px' }}>Voucher #</th>
                <th style={{ padding: '4px 6px' }}>Date</th>
                <th style={{ padding: '4px 6px' }}>Mode</th>
                <th style={{ padding: '4px 6px', textAlign: 'right' }}>Amount</th>
                {onVoidPayment && <th style={{ padding: '4px 6px', textAlign: 'center' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {invoice.payments.map((p: any) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '5px 6px', fontFamily: 'monospace', fontWeight: 700 }}>{p.voucherNo}</td>
                  <td style={{ padding: '5px 6px', color: '#64748b' }}>{formatDate(p.paymentDate)}</td>
                  <td style={{ padding: '5px 6px' }}>
                    <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#f1f5f9', fontWeight: 600 }}>{p.paymentMode}</span>
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 800, color: '#047857' }}>
                    ₹{Number(p.amount).toFixed(2)}
                  </td>
                  {onVoidPayment && (
                    <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => onVoidPayment(p.id)}
                        style={{
                          background: '#fee2e2',
                          color: '#dc2626',
                          border: '1px solid #fca5a5',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                        title="Void payment voucher"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PRINTABLE CONTAINER ── */}
      <div id="printable-tax-invoice" className="tax-invoice-print-container" style={{
        width: '100%',
        maxWidth: '210mm',
        boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
        borderRadius: '2px'
      }}>
        {/* Customer Copy */}
        {(copyMode === 'CUSTOMER' || copyMode === 'BOTH') && (
          <div style={{ pageBreakAfter: copyMode === 'BOTH' ? 'always' : 'auto' }}>
            {renderSingleInvoiceSheet('ORIGINAL FOR RECIPIENT', '(CUSTOMER COPY)')}
          </div>
        )}

        {/* Separator if printing both */}
        {copyMode === 'BOTH' && (
          <div className="no-print" style={{ height: '24px', background: 'transparent' }} />
        )}

        {/* Shop / Supplier Copy */}
        {(copyMode === 'SHOP' || copyMode === 'BOTH') && (
          <div>
            {renderSingleInvoiceSheet('DUPLICATE FOR SUPPLIER', '(SHOP / AUDIT COPY)')}
          </div>
        )}
      </div>
    </div>
  );
};

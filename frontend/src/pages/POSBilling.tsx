import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import {
  ShoppingCart,
  Plus,
  Trash2,
  Search,
  User,
  Phone,
  Stethoscope,
  Receipt,
  Save,
  Printer,
  X,
  CreditCard,
  Building2,
  Sparkles,
  Layers,
  ChevronDown,
  ArrowRight,
  Pill,
  Clock
} from 'lucide-react';

interface MedicineItem {
  id: string;
  name: string;
  sku: string;
  genericName?: string | null;
  unit: string;
  conversionFactor: number;
  gstRate: number;
  totalStock: number;
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

interface CustomerParty {
  id: string;
  name: string;
  mailTo?: string | null;
  type: string;
  station?: string | null;
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
  defaultDoctorName?: string | null;
  defaultDoctorRegNo?: string | null;
  isCash: boolean;
  outstandingBalance: number;
}

interface SaleLineItem {
  itemId: string;
  medicineName: string;
  genericName?: string | null;
  sku: string;
  pack: string;
  conversionFactor: number;
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  currentStock: number;
  strips: number; // STRI (Full strips)
  looseQty: number; // TAB. (Loose tablets/units)
  quantity: number; // Total units = (strips * conversionFactor) + looseQty
  freeQuantity: number;
  unitPrice: number; // Rate per strip / pack
  mrp: number;
  discountPercent: number;
  gstRate: number;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
}

interface POSBillingProps {
  onBack: () => void;
  onInvoiceCreated?: () => void;
  editingInvoiceId?: string | null;
}

export default function POSBilling({ onBack, onInvoiceCreated, editingInvoiceId }: POSBillingProps) {
  const { activeCompany } = useAuth();

  // Search & Master Data
  const [items, setItems] = useState<MedicineItem[]>([]);
  const [customers, setCustomers] = useState<CustomerParty[]>([]);
  const [nextInvoiceNo, setNextInvoiceNo] = useState('');
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Form Header State (Photo 3: Marg ERP Sale Entry)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerParty | null>(null);
  const [customerName, setCustomerName] = useState('Cash Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [patientAddress, setPatientAddress] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [doctorRegNo, setDoctorRegNo] = useState('');
  const [patientName, setPatientName] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Invoice Date & Payment
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'CARD' | 'CREDIT'>('CASH');
  const [billDiscountPct, setBillDiscountPct] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [isInterState, setIsInterState] = useState(false);
  const [notes, setNotes] = useState('');

  // Invoice Items
  const [invoiceItems, setInvoiceItems] = useState<SaleLineItem[]>([]);
  const [medicineSearch, setMedicineSearch] = useState('');
  const [showMedicineDropdown, setShowMedicineDropdown] = useState(false);
  const [activeRowIndex, setActiveRowIndex] = useState<number>(0);

  // Status & Print Modals
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInvoice, setCreatedInvoice] = useState<any | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const medicineInputRef = useRef<HTMLInputElement>(null);
  const patientInputRef = useRef<HTMLInputElement>(null);
  const doctorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMasterData();
  }, [activeCompany?.id, editingInvoiceId]);

  const loadMasterData = async () => {
    if (!activeCompany) return;
    try {
      setLoadingInitial(true);
      setError(null);

      const [itemsRes, partiesRes, nextNumRes] = await Promise.all([
        api.get<{ items: MedicineItem[] }>('/api/items?limit=2000', {
          companyId: activeCompany.id
        }),
        api.get<{ parties: CustomerParty[] }>('/api/parties?type=customer', {
          companyId: activeCompany.id
        }),
        api.get<{ invoiceNumber: string }>('/api/invoices/next-number', {
          companyId: activeCompany.id
        })
      ]);

      setItems(itemsRes.items || []);
      setCustomers(partiesRes.parties || []);
      setNextInvoiceNo(nextNumRes.invoiceNumber || 'INV-0001');

      if (editingInvoiceId) {
        const editRes = await api.get<{ invoice: any }>(`/api/invoices/${editingInvoiceId}`, {
          companyId: activeCompany.id
        });

        const inv = editRes.invoice;
        if (inv) {
          setNextInvoiceNo(inv.invoiceNumber);
          setInvoiceDate(inv.invoiceDate ? inv.invoiceDate.split('T')[0] : new Date().toISOString().split('T')[0]);
          setCustomerName(inv.customerName || 'Cash Customer');
          setCustomerPhone(inv.customerPhone || '');
          setPatientAddress(inv.patientAddress || inv.customerAddress || '');
          setCustomerGstin(inv.customerGstin || '');
          setDoctorName(inv.doctorName || '');
          setDoctorRegNo(inv.doctorRegNo || '');
          setPatientName(inv.patientName || '');
          setPaymentMode((inv.paymentMode as any) || 'CASH');
          setBillDiscountPct(Number(inv.billDiscountPct) || 0);
          setPaidAmount(String(inv.paidAmount ?? ''));
          setNotes(inv.notes || '');

          if (inv.partyId && partiesRes.parties) {
            const found = partiesRes.parties.find((p: CustomerParty) => p.id === inv.partyId);
            if (found) setSelectedCustomer(found);
          }

          if (inv.items && Array.isArray(inv.items)) {
            const mappedItems: SaleLineItem[] = inv.items.map((i: any) => {
              const matchedItem = itemsRes.items?.find((m: MedicineItem) => m.id === (i.itemId || i.item?.id));
              const matchedBatch = matchedItem?.batches?.find((b: any) => b.id === (i.batchId || i.batch?.id));

              return {
                itemId: i.itemId || i.item?.id || '',
                medicineName: i.medicineName || i.item?.name || matchedItem?.name || 'Medicine Item',
                genericName: i.genericName || i.item?.genericName || matchedItem?.genericName || '',
                sku: i.sku || i.item?.sku || matchedItem?.sku || '',
                pack: i.pack || '10 TAB',
                conversionFactor: matchedItem?.conversionFactor || 1,
                batchId: i.batchId || i.batch?.id || matchedBatch?.id || '',
                batchNumber: i.batchNumber || i.batch?.batchNumber || matchedBatch?.batchNumber || 'BATCH',
                expiryDate: i.expiryDate || i.batch?.expiryDate || matchedBatch?.expiryDate || '',
                currentStock: matchedBatch?.currentStock || 999,
                strips: i.strips || 0,
                looseQty: i.looseQty || 0,
                quantity: i.quantity || 1,
                freeQuantity: i.freeQuantity || 0,
                unitPrice: Number(i.unitPrice || 0),
                mrp: Number(i.mrp || 0),
                discountPercent: Number(i.discountPercent || 0),
                gstRate: Number(i.gstRate || 0),
                taxableAmount: Number(i.taxableAmount || 0),
                gstAmount: Number(i.cgstAmount || 0) + Number(i.sgstAmount || 0) + Number(i.igstAmount || 0),
                totalAmount: Number(i.totalAmount || 0)
              };
            });
            setInvoiceItems(mappedItems);
          }
        }
      } else {
        // Default to cash customer if available
        const cashParty = partiesRes.parties?.find((p: CustomerParty) => p.isCash);
        if (cashParty) {
          setSelectedCustomer(cashParty);
          setCustomerName(cashParty.name);
        }
      }
    } catch (err: any) {
      console.error('Failed to load POS master data:', err);
      setError('Could not load inventory items. Please check connection.');
    } finally {
      setLoadingInitial(false);
    }
  };

  // Select Item & Auto-Pick FEFO Batch
  const handleSelectItem = (item: MedicineItem) => {
    const availableBatches = (item.batches || [])
      .filter(b => b.currentStock > 0)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

    if (availableBatches.length === 0) {
      setError(`"${item.name}" has zero stock across all batches.`);
      return;
    }

    const fefoBatch = availableBatches[0];
    const unitPrice = Number(fefoBatch.pts) || Number(fefoBatch.mrp);
    const gstRate = Number(item.gstRate) !== undefined && !isNaN(Number(item.gstRate)) ? Number(item.gstRate) : 5.0;
    const factor = item.conversionFactor || 1;

    // Default 1 Strip
    const strips = 1;
    const looseQty = 0;
    const totalUnits = (strips * factor) + looseQty;

    const lineGross = (strips * unitPrice) + (looseQty * (unitPrice / factor));
    const lineTaxable = lineGross;
    const lineGst = (lineTaxable * gstRate) / 100;
    const lineTotal = lineTaxable + lineGst;

    const newItem: SaleLineItem = {
      itemId: item.id,
      medicineName: item.name,
      genericName: item.genericName,
      sku: item.sku,
      pack: factor > 1 ? `${factor} ${item.unit}` : item.unit,
      conversionFactor: factor,
      batchId: fefoBatch.id,
      batchNumber: fefoBatch.batchNumber,
      expiryDate: fefoBatch.expiryDate,
      currentStock: fefoBatch.currentStock,
      strips: 1,
      looseQty: 0,
      quantity: totalUnits,
      freeQuantity: 0,
      unitPrice,
      mrp: Number(fefoBatch.mrp),
      discountPercent: 0,
      gstRate,
      taxableAmount: lineTaxable,
      gstAmount: lineGst,
      totalAmount: lineTotal
    };

    setInvoiceItems([...invoiceItems, newItem]);
    setActiveRowIndex(invoiceItems.length);
    setMedicineSearch('');
    setShowMedicineDropdown(false);
    setError(null);
  };

  // Update specific field in item row
  const updateLineItem = (index: number, updates: Partial<SaleLineItem>) => {
    setInvoiceItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], ...updates };

      const strips = Math.max(0, item.strips || 0);
      const loose = Math.max(0, item.looseQty || 0);
      const factor = item.conversionFactor || 1;
      const totalUnits = (strips * factor) + loose;

      const pricePerStrip = Math.max(0, item.unitPrice);
      const discPct = Math.max(0, Math.min(100, item.discountPercent));
      const gstRate = item.gstRate;

      // Price calculation: full strips * strip price + loose tablets * per tablet price
      const lineGross = (strips * pricePerStrip) + (loose * (pricePerStrip / factor));
      const lineDisc = (lineGross * discPct) / 100;
      const lineTaxable = Math.max(0, lineGross - lineDisc);
      const lineGst = (lineTaxable * gstRate) / 100;
      const lineTotal = lineTaxable + lineGst;

      item.strips = strips;
      item.looseQty = loose;
      item.quantity = Math.max(1, totalUnits);
      item.unitPrice = pricePerStrip;
      item.discountPercent = discPct;
      item.taxableAmount = Math.round(lineTaxable * 100) / 100;
      item.gstAmount = Math.round(lineGst * 100) / 100;
      item.totalAmount = Math.round(lineTotal * 100) / 100;

      updated[index] = item;
      return updated;
    });
  };

  const removeLineItem = (index: number) => {
    setInvoiceItems(prev => prev.filter((_, i) => i !== index));
    if (activeRowIndex >= invoiceItems.length - 1) {
      setActiveRowIndex(Math.max(0, invoiceItems.length - 2));
    }
  };

  // Financial Calculations
  const valueOfGoods = invoiceItems.reduce((sum, item) => sum + (item.strips * item.unitPrice + item.looseQty * (item.unitPrice / (item.conversionFactor || 1))), 0);
  const totalItemDiscount = invoiceItems.reduce((sum, item) => sum + ((item.taxableAmount * item.discountPercent) / 100), 0);
  const grossTaxable = Math.max(0, valueOfGoods - totalItemDiscount);

  const billDiscountAmt = (grossTaxable * Math.max(0, Math.min(100, billDiscountPct))) / 100;
  const netTaxable = Math.max(0, grossTaxable - billDiscountAmt);

  const avgGstRate = invoiceItems.length > 0
    ? invoiceItems.reduce((sum, i) => sum + i.gstRate, 0) / invoiceItems.length
    : 5;

  const totalGstAmount = (netTaxable * avgGstRate) / 100;
  const cgstAmount = isInterState ? 0 : totalGstAmount / 2;
  const sgstAmount = isInterState ? 0 : totalGstAmount / 2;
  const igstAmount = isInterState ? totalGstAmount : 0;

  const rawGrandTotal = netTaxable + totalGstAmount;
  const grandTotal = Math.round(rawGrandTotal);
  const roundOff = Math.round((grandTotal - rawGrandTotal) * 100) / 100;

  const numericPaid = paidAmount === ''
    ? (paymentMode === 'CREDIT' ? 0 : grandTotal)
    : Math.max(0, parseFloat(paidAmount) || 0);

  const balanceDue = Math.max(0, grandTotal - numericPaid);

  // Keyboard Navigation: F1 (Doctor), F2 (Patient/Complete), F3 (Search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        doctorInputRef.current?.focus();
      } else if (e.key === 'F2') {
        e.preventDefault();
        if (invoiceItems.length > 0 && !submitting) {
          handleSaveInvoice();
        } else {
          patientInputRef.current?.focus();
        }
      } else if (e.key === 'F3') {
        e.preventDefault();
        medicineInputRef.current?.focus();
      } else if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (invoiceItems.length > 0 && !submitting) {
          handleSaveInvoice();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [invoiceItems, paymentMode, paidAmount, customerName, submitting]);

  const handleSaveInvoice = async () => {
    if (!activeCompany) return;
    if (invoiceItems.length === 0) {
      setError('Please add at least one medicine item to generate invoice.');
      return;
    }

    for (const item of invoiceItems) {
      if (item.quantity > item.currentStock) {
        setError(`Insufficient stock for "${item.medicineName}" (Batch: ${item.batchNumber}). Available: ${item.currentStock} units, Entered: ${item.quantity}`);
        return;
      }
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        partyId: selectedCustomer?.id || null,
        customerName: customerName.trim() || 'Cash Customer',
        customerPhone: customerPhone.trim() || null,
        customerAddress: patientAddress.trim() || null,
        customerGstin: customerGstin.trim() || null,
        doctorName: doctorName.trim() || null,
        doctorRegNo: doctorRegNo.trim() || null,
        patientName: patientName.trim() || null,
        invoiceNumber: nextInvoiceNo,
        invoiceDate,
        paymentMode,
        paidAmount: numericPaid,
        billDiscountPct,
        isInterState,
        roundOff,
        notes: notes.trim() || null,
        items: invoiceItems.map(i => ({
          itemId: i.itemId,
          batchId: i.batchId,
          batchNumber: i.batchNumber,
          pack: i.pack,
          strips: i.strips,
          looseQty: i.looseQty,
          quantity: i.quantity,
          freeQuantity: i.freeQuantity,
          unitPrice: i.unitPrice,
          mrp: i.mrp,
          discountPercent: i.discountPercent,
          gstRate: i.gstRate
        }))
      };

      let invoiceId = editingInvoiceId;

      if (editingInvoiceId) {
        await api.put<{ invoice: any }>(`/api/invoices/${editingInvoiceId}`, payload, {
          companyId: activeCompany.id,
          idempotencyKey: `pos-edit-${Date.now()}`
        });
      } else {
        const res = await api.post<{ invoice: any }>('/api/invoices', payload, {
          companyId: activeCompany.id,
          idempotencyKey: `pos-${Date.now()}`
        });
        invoiceId = res.invoice.id;
      }

      const detailsRes = await api.get<{ invoice: any }>(`/api/invoices/${invoiceId}`, {
        companyId: activeCompany.id
      });

      setCreatedInvoice(detailsRes.invoice);
      setShowPrintModal(true);

      if (onInvoiceCreated) {
        onInvoiceCreated();
      }
    } catch (err: any) {
      console.error('Invoice creation/update error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to complete sale transaction');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const activeRow = invoiceItems[activeRowIndex] || invoiceItems[0];
  const activeMedicine = items.find(i => i.id === activeRow?.itemId);

  return (
    <div style={{ padding: '1.2rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.8rem' }}>
        <div>
          <button
            onClick={onBack}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', fontSize: '0.8rem' }}
          >
            ← Back to Sales List
          </button>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <ShoppingCart style={{ color: 'var(--brand-teal)' }} />
            {editingInvoiceId ? `EDIT SALE INVOICE #${nextInvoiceNo}` : 'SALE ENTRY / POS BILLING TERMINAL'}
          </h1>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Keyboard Shortcuts: <strong>[F1]</strong> Doctor • <strong>[F2]</strong> Patient/Save • <strong>[F3]</strong> Product Search • <strong>[Ctrl+Enter]</strong> Complete & Print
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <div style={{ padding: '0.4rem 0.8rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Bill No.</div>
            <div style={{ fontWeight: '800', color: 'var(--brand-teal)', fontSize: '0.95rem' }}>{nextInvoiceNo}</div>
          </div>
          <div style={{ padding: '0.4rem 0.8rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Date</div>
            <input
              type="date"
              value={invoiceDate}
              onChange={e => setInvoiceDate(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontWeight: '700', outline: 'none', fontSize: '0.85rem' }}
            />
          </div>
          <button
            onClick={handleSaveInvoice}
            disabled={submitting || invoiceItems.length === 0}
            style={{
              padding: '0.65rem 1.4rem',
              background: invoiceItems.length === 0 ? '#94a3b8' : '#0f766e',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '0.95rem',
              cursor: (submitting || invoiceItems.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (submitting || invoiceItems.length === 0) ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: invoiceItems.length > 0 ? '0 4px 12px rgba(15, 118, 110, 0.35)' : 'none'
            }}
          >
            <Receipt size={16} />
            {submitting ? 'Saving...' : editingInvoiceId ? `Update Invoice (₹${grandTotal.toFixed(0)})` : `Complete Sale (₹${grandTotal.toFixed(0)})`}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', padding: '0.7rem 1.2rem', borderRadius: '8px', color: 'var(--accent-red)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Patient & Doctor Header Bar (Responsive Grid) */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', alignItems: 'end' }}>
          
          {/* Patient [F2] */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--brand-teal)', marginBottom: '0.3rem' }}>
              PATIENT [F2] / CUSTOMER :
            </label>
            <input
              ref={patientInputRef}
              type="text"
              placeholder="Patient / Customer Name"
              value={customerName}
              onChange={e => {
                setCustomerName(e.target.value);
                setShowCustomerDropdown(true);
              }}
              style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '600' }}
            />
          </div>

          {/* Patient Address & Phone */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              ADDRESS / MOBILE :
            </label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input
                type="text"
                placeholder="Mobile"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                style={{ width: '105px', padding: '0.55rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
              />
              <input
                type="text"
                placeholder="Patient Address"
                value={patientAddress}
                onChange={e => setPatientAddress(e.target.value)}
                style={{ flex: 1, minWidth: '100px', padding: '0.55rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {/* Doctor [F1] */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#0284c7', marginBottom: '0.3rem' }}>
              DOCTOR [F1] :
            </label>
            <input
              ref={doctorInputRef}
              type="text"
              placeholder="Dr. Name (Prescribing Doctor)"
              value={doctorName}
              onChange={e => setDoctorName(e.target.value)}
              style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '600' }}
            />
          </div>

          {/* Reg. No. */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              REG. NO. :
            </label>
            <input
              type="text"
              placeholder="Doctor MCI Reg No."
              value={doctorRegNo}
              onChange={e => setDoctorRegNo(e.target.value.toUpperCase())}
              style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
      </div>

      {/* Main Medicine Search & Bill Grid (Photo 3 Middle Table) */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', marginBottom: '1rem' }}>
        
        {/* Medicine Search Bar */}
        <div style={{ padding: '0.8rem 1rem', borderBottom: '1px solid var(--border-color)', position: 'relative', background: 'var(--bg-secondary)' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#0f766e', display: 'flex', alignItems: 'center', pointerEvents: 'none', zIndex: 2 }}>
              <Search size={16} />
            </span>
            <input
              ref={medicineInputRef}
              type="text"
              placeholder="Search by brand name, generic name, or scan barcode... [F3]"
              value={medicineSearch}
              onChange={e => {
                setMedicineSearch(e.target.value);
                setShowMedicineDropdown(true);
              }}
              onFocus={() => setShowMedicineDropdown(true)}
              onBlur={() => setTimeout(() => setShowMedicineDropdown(false), 200)}
              style={{
                width: '100%',
                padding: '0.65rem 1rem 0.65rem 2.4rem',
                background: '#ffffff',
                border: '2px solid #e2e8f0',
                borderRadius: '8px',
                color: '#0f172a',
                fontWeight: '600',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />

            {showMedicineDropdown && medicineSearch.trim().length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                marginTop: '4px',
                maxHeight: '260px',
                overflowY: 'auto',
                zIndex: 70,
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
              }}>
                {items
                  .filter(i => i.name.toLowerCase().includes(medicineSearch.toLowerCase()) || (i.genericName && i.genericName.toLowerCase().includes(medicineSearch.toLowerCase())) || i.sku.toLowerCase().includes(medicineSearch.toLowerCase()))
                  .map(med => {
                    const totalStock = med.totalStock ?? med.batches?.reduce((s, b) => s + b.currentStock, 0) ?? 0;
                    const topBatch = med.batches?.[0];
                    return (
                      <div
                        key={med.id}
                        onClick={() => handleSelectItem(med)}
                        style={{
                          padding: '0.7rem 1rem',
                          borderBottom: '1px solid var(--border-color)',
                          cursor: totalStock > 0 ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div>
                          <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{med.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {med.genericName ? `${med.genericName} • ` : ''}Pack: {med.conversionFactor > 1 ? `${med.conversionFactor}T` : med.unit}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: '800', color: totalStock > 0 ? 'var(--brand-teal)' : 'var(--accent-red)' }}>
                            {totalStock > 0 ? `${totalStock} in stock` : 'Out of stock'}
                          </div>
                          {topBatch && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              MRP: ₹{Number(topBatch.mrp).toFixed(2)} | Exp: {new Date(topBatch.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Sale Entry Grid (Responsive & Horizontal Scroll Protected) */}
        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <table style={{ width: '100%', minWidth: '920px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '0.75rem 0.6rem', width: '35px', textAlign: 'center' }}>#</th>
                <th style={{ padding: '0.75rem 0.8rem', minWidth: '200px' }}>PRODUCT</th>
                <th style={{ padding: '0.75rem 0.6rem', width: '85px', textAlign: 'center' }}>PACK</th>
                <th style={{ padding: '0.75rem 0.8rem', minWidth: '150px' }}>BATCH</th>
                <th style={{ padding: '0.75rem 0.6rem', width: '85px', textAlign: 'center' }} title="Full Strips / Packs">STRIPS</th>
                <th style={{ padding: '0.75rem 0.6rem', width: '85px', textAlign: 'center' }} title="Loose Tablets (e.g. 2 tabs or 12 tabs)">LOOSE TABS</th>
                <th style={{ padding: '0.75rem 0.6rem', width: '95px', textAlign: 'right' }}>M.R.P./S</th>
                <th style={{ padding: '0.75rem 0.6rem', width: '75px', textAlign: 'center' }}>DIS%</th>
                <th style={{ padding: '0.75rem 0.6rem', width: '70px', textAlign: 'center' }}>GST%</th>
                <th style={{ padding: '0.75rem 0.8rem', width: '115px', textAlign: 'right' }}>AMOUNT (₹)</th>
                <th style={{ padding: '0.75rem 0.5rem', width: '35px' }}></th>
              </tr>
            </thead>
            <tbody>
              {invoiceItems.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <Pill size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                    <p style={{ margin: 0, fontWeight: '500' }}>No medicines added to bill yet.</p>
                    <p style={{ fontSize: '0.8rem', marginTop: '0.2rem', color: 'var(--text-muted)' }}>Press [F3] or search product above to add.</p>
                  </td>
                </tr>
              ) : (
                invoiceItems.map((item, idx) => {
                  const isFocused = activeRowIndex === idx;
                  const medicine = items.find(i => i.id === item.itemId);
                  const batches = medicine?.batches || [];

                  return (
                    <tr
                      key={idx}
                      onClick={() => setActiveRowIndex(idx)}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        background: isFocused ? 'rgba(20, 184, 166, 0.08)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '0.6rem 0.6rem', textAlign: 'center', color: 'var(--text-secondary)' }}>{idx + 1}</td>

                      {/* Product Name */}
                      <td style={{ padding: '0.6rem 0.8rem' }}>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{item.medicineName}</div>
                        {item.genericName && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.genericName}</div>
                        )}
                      </td>

                      {/* Pack */}
                      <td style={{ padding: '0.6rem 0.6rem', color: 'var(--text-secondary)', textAlign: 'center', fontWeight: '500' }}>
                        {item.pack}
                      </td>

                      {/* Batch Selection */}
                      <td style={{ padding: '0.6rem 0.8rem' }}>
                        {batches.length > 1 ? (
                          <select
                            value={item.batchId}
                            onChange={e => {
                              const b = batches.find(x => x.id === e.target.value);
                              if (b) {
                                updateLineItem(idx, {
                                  batchId: b.id,
                                  batchNumber: b.batchNumber,
                                  expiryDate: b.expiryDate,
                                  currentStock: b.currentStock,
                                  mrp: Number(b.mrp),
                                  unitPrice: Number(b.pts) || Number(b.mrp)
                                });
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '0.4rem 0.5rem',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontSize: '0.82rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              outline: 'none'
                            }}
                          >
                            {batches.map(b => (
                              <option key={b.id} value={b.id}>
                                {b.batchNumber} (Stock: {b.currentStock})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            background: 'rgba(20, 184, 166, 0.08)',
                            color: 'var(--brand-teal)',
                            padding: '0.3rem 0.6rem',
                            borderRadius: '5px',
                            border: '1px solid rgba(20, 184, 166, 0.2)',
                            fontFamily: 'monospace',
                            fontWeight: '700',
                            fontSize: '0.85rem'
                          }}>
                            <span>{item.batchNumber}</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                              ({item.currentStock ?? medicine?.batches?.[0]?.currentStock ?? 0})
                            </span>
                          </div>
                        )}
                      </td>

                      {/* STRI (Full Strips) */}
                      <td style={{ padding: '0.6rem 0.6rem' }}>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={item.strips === 0 ? '' : item.strips}
                          onFocus={e => e.target.select()}
                          onChange={e => {
                            const val = e.target.value;
                            updateLineItem(idx, { strips: val === '' ? 0 : Math.max(0, parseInt(val) || 0) });
                          }}
                          style={{ width: '100%', padding: '0.4rem 0.3rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center', fontWeight: '700' }}
                        />
                      </td>

                      {/* LOOSE TABS (Loose Units) */}
                      <td style={{ padding: '0.6rem 0.6rem' }}>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          title="Loose Tablets (e.g. 2 tabs)"
                          value={item.looseQty === 0 ? '' : item.looseQty}
                          onFocus={e => e.target.select()}
                          onChange={e => {
                            const val = e.target.value;
                            updateLineItem(idx, { looseQty: val === '' ? 0 : Math.max(0, parseInt(val) || 0) });
                          }}
                          style={{ width: '100%', padding: '0.4rem 0.3rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center' }}
                        />
                      </td>

                      {/* MRP / Strip Price */}
                      <td style={{ padding: '0.6rem 0.6rem' }}>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={item.unitPrice === 0 ? '' : item.unitPrice}
                          onFocus={e => e.target.select()}
                          onChange={e => {
                            const val = e.target.value;
                            updateLineItem(idx, { unitPrice: val === '' ? 0 : Math.max(0, parseFloat(val) || 0) });
                          }}
                          style={{ width: '100%', padding: '0.4rem 0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'right', fontWeight: '600' }}
                        />
                      </td>

                      {/* Discount % */}
                      <td style={{ padding: '0.6rem 0.6rem' }}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="0"
                          value={item.discountPercent === 0 ? '' : item.discountPercent}
                          onFocus={e => e.target.select()}
                          onChange={e => {
                            const val = e.target.value;
                            updateLineItem(idx, { discountPercent: val === '' ? 0 : Math.min(100, Math.max(0, parseFloat(val) || 0)) });
                          }}
                          style={{ width: '100%', padding: '0.4rem 0.3rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center' }}
                        />
                      </td>

                      {/* GST % */}
                      <td style={{ padding: '0.6rem 0.6rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '600' }}>
                        {item.gstRate}%
                      </td>

                      {/* Line Amount */}
                      <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontWeight: '800', color: 'var(--text-primary)' }}>
                        ₹{item.totalAmount.toFixed(2)}
                      </td>

                      {/* Remove */}
                      <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                        <button
                          onClick={() => removeLineItem(idx)}
                          style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.3rem', borderRadius: '4px' }}
                          title="Remove item"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Split Bottom Multi-Pane HUD (Responsive) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.2rem', alignItems: 'stretch' }}>
        
        {/* Left HUD: Active Selected Line Item Details */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--brand-teal)', textTransform: 'uppercase', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Layers size={14} /> ACTIVE ROW HUD (ROW #{activeRowIndex + 1})
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.8rem', fontSize: '0.85rem' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Item : </span>
                <strong style={{ color: 'var(--text-primary)' }}>{activeRow?.medicineName || '—'}</strong>
                {activeRow?.genericName && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{activeRow.genericName}</div>}
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Batch : </span>
                <strong style={{ fontFamily: 'monospace' }}>{activeRow?.batchNumber || '—'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Expiry : </span>
                <strong>{activeRow ? new Date(activeRow.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : '—'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Live Stock : </span>
                <strong style={{ color: '#10b981' }}>{activeRow?.currentStock ?? 0} units</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>M.R.P. : </span>
                <strong>₹{Number(activeRow?.mrp || 0).toFixed(2)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Total Qty Units : </span>
                <strong style={{ color: 'var(--brand-teal)' }}>{activeRow?.quantity ?? 0} tabs</strong>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px dashed var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Payment Mode:</span>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              {(['CASH', 'UPI', 'CARD', 'CREDIT'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setPaymentMode(mode);
                    if (mode === 'CREDIT') setPaidAmount('0');
                    else setPaidAmount(String(grandTotal));
                  }}
                  style={{
                    padding: '0.3rem 0.6rem',
                    borderRadius: '4px',
                    border: paymentMode === mode ? '1px solid var(--brand-teal)' : '1px solid var(--border-color)',
                    background: paymentMode === mode ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-secondary)',
                    color: paymentMode === mode ? 'var(--brand-teal)' : 'var(--text-primary)',
                    fontWeight: '700',
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right HUD: Financial Summary & Actions (Photo 3 Right Pane) */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>
            VALUE OF GOODS & TAXES
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
              <span>VALUE OF GOODS :</span>
              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>₹{valueOfGoods.toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-red)' }}>
              <span>DISCOUNT :</span>
              <span>- ₹{(totalItemDiscount + billDiscountAmt).toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
              <span>GST (CGST/SGST/IGST) :</span>
              <span>₹{totalGstAmount.toFixed(2)}</span>
            </div>

            {roundOff !== 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                <span>ROUND OFF :</span>
                <span>₹{roundOff > 0 ? `+${roundOff.toFixed(2)}` : roundOff.toFixed(2)}</span>
              </div>
            )}

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: '0.6rem',
              marginTop: '0.3rem',
              borderTop: '2px solid var(--border-color)',
              fontSize: '1.2rem',
              fontWeight: '800',
              color: '#0f766e'
            }}>
              <span>BILL TOTAL :</span>
              <span>₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Paid Amount & Balance */}
          <div style={{ marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px dashed var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>PAID (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder={paymentMode === 'CREDIT' ? '0' : String(grandTotal.toFixed(0))}
                value={paidAmount}
                onFocus={e => e.target.select()}
                onChange={e => setPaidAmount(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '700', fontSize: '0.9rem', textAlign: 'right' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>BALANCE DUE (₹)</label>
              <div style={{ padding: '0.45rem', background: balanceDue > 0 ? '#fee2e2' : '#dcfce7', border: '1px solid ' + (balanceDue > 0 ? '#fca5a5' : '#86efac'), borderRadius: '6px', fontWeight: '800', fontSize: '0.9rem', textAlign: 'right', color: balanceDue > 0 ? '#dc2626' : '#16a34a' }}>
                ₹{balanceDue.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Complete Sale Button */}
          <div style={{ marginTop: '1rem' }}>
            <button
              onClick={handleSaveInvoice}
              disabled={submitting || invoiceItems.length === 0}
              style={{
                width: '100%',
                padding: '0.85rem',
                background: invoiceItems.length === 0 ? '#94a3b8' : '#0f766e',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '800',
                fontSize: '1rem',
                cursor: (submitting || invoiceItems.length === 0) ? 'not-allowed' : 'pointer',
                opacity: (submitting || invoiceItems.length === 0) ? 0.6 : 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: invoiceItems.length > 0 ? '0 4px 16px rgba(15, 118, 110, 0.4)' : 'none',
                letterSpacing: '0.02em'
              }}
            >
              <Receipt size={18} />
              {submitting ? 'Generating Invoice...' : '⚡ COMPLETE SALE & PRINT (F2)'}
            </button>
          </div>
        </div>
      </div>

      {/* Printable GST Tax Invoice Modal */}
      {showPrintModal && createdInvoice && (
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
          zIndex: 150,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            color: '#111827',
            width: '100%',
            maxWidth: '800px',
            maxHeight: '90vh',
            borderRadius: '12px',
            overflowY: 'auto',
            padding: '2rem',
            position: 'relative'
          }}>
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem' }}>
              <button
                onClick={handlePrint}
                style={{
                  padding: '0.6rem 1.2rem',
                  background: '#0f766e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <Printer size={16} /> Print Tax Invoice
              </button>
              <button
                onClick={() => {
                  setShowPrintModal(false);
                  onBack();
                }}
                style={{
                  padding: '0.6rem 1rem',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Close & Next Bill
              </button>
            </div>

            <div id="printable-tax-invoice" style={{ fontFamily: 'monospace, sans-serif' }}>
              <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '0.8rem', marginBottom: '1rem' }}>
                <h2 style={{ margin: '0 0 0.2rem 0', fontSize: '1.4rem', fontWeight: 'bold' }}>{createdInvoice.company?.name || activeCompany?.name}</h2>
                <div style={{ fontSize: '0.85rem' }}>TAX INVOICE (PHARMA RETAIL / B2B)</div>
                <div style={{ fontSize: '0.8rem', color: '#4b5563' }}>Drug License 20B/21B Compliant</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem', marginBottom: '1rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.8rem' }}>
                <div>
                  <div><strong>Bill No:</strong> {createdInvoice.invoiceNumber}</div>
                  <div><strong>Date:</strong> {new Date(createdInvoice.invoiceDate).toLocaleDateString('en-IN')}</div>
                  <div><strong>Payment Mode:</strong> {createdInvoice.paymentMode}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div><strong>Patient/Customer:</strong> {createdInvoice.customerName}</div>
                  {createdInvoice.customerPhone && <div><strong>Mobile:</strong> {createdInvoice.customerPhone}</div>}
                  {createdInvoice.doctorName && <div><strong>Doctor:</strong> Dr. {createdInvoice.doctorName}</div>}
                  {createdInvoice.doctorRegNo && <div><strong>Reg No:</strong> {createdInvoice.doctorRegNo}</div>}
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginBottom: '1rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #000', textAlign: 'left' }}>
                    <th style={{ padding: '0.4rem 0' }}>#</th>
                    <th style={{ padding: '0.4rem 0' }}>Description</th>
                    <th style={{ padding: '0.4rem 0' }}>Batch</th>
                    <th style={{ padding: '0.4rem 0' }}>Exp</th>
                    <th style={{ padding: '0.4rem 0', textAlign: 'center' }}>Qty</th>
                    <th style={{ padding: '0.4rem 0', textAlign: 'right' }}>MRP</th>
                    <th style={{ padding: '0.4rem 0', textAlign: 'right' }}>Rate</th>
                    <th style={{ padding: '0.4rem 0', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {createdInvoice.items?.map((item: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px dashed #e5e7eb' }}>
                      <td style={{ padding: '0.4rem 0' }}>{i + 1}</td>
                      <td style={{ padding: '0.4rem 0' }}>{item.medicineName}</td>
                      <td style={{ padding: '0.4rem 0' }}>{item.batchNumber}</td>
                      <td style={{ padding: '0.4rem 0' }}>{new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}</td>
                      <td style={{ padding: '0.4rem 0', textAlign: 'center' }}>
                        {item.strips > 0 && item.looseQty > 0
                          ? `${item.strips} Str + ${item.looseQty} Tab`
                          : item.strips > 0
                          ? `${item.strips} Strip`
                          : item.looseQty > 0
                          ? `${item.looseQty} Tab`
                          : item.quantity}
                      </td>
                      <td style={{ padding: '0.4rem 0', textAlign: 'right' }}>₹{Number(item.mrp).toFixed(2)}</td>
                      <td style={{ padding: '0.4rem 0', textAlign: 'right' }}>₹{Number(item.unitPrice).toFixed(2)}</td>
                      <td style={{ padding: '0.4rem 0', textAlign: 'right', fontWeight: 'bold' }}>₹{Number(item.totalAmount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #000', paddingTop: '0.6rem', fontSize: '0.85rem' }}>
                <div style={{ width: '250px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span>Taxable Amount:</span>
                    <span>₹{Number(createdInvoice.taxableAmount).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span>GST:</span>
                    <span>₹{Number(createdInvoice.totalTax).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1rem', borderTop: '1px solid #000', paddingTop: '0.4rem' }}>
                    <span>Grand Total:</span>
                    <span>₹{Number(createdInvoice.grandTotal).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a', marginTop: '0.2rem' }}>
                    <span>Amount Paid:</span>
                    <span>₹{Number(createdInvoice.paidAmount).toFixed(2)}</span>
                  </div>
                  {Number(createdInvoice.balanceAmount) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626', fontWeight: 'bold' }}>
                      <span>Balance Due:</span>
                      <span>₹{Number(createdInvoice.balanceAmount).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

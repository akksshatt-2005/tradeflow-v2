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
  ChevronDown
} from 'lucide-react';

interface MedicineItem {
  id: string;
  name: string;
  sku: string;
  genericName?: string | null;
  unit: string;
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
  type: string;
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
  isCash: boolean;
  outstandingBalance: number;
}

interface SaleLineItem {
  itemId: string;
  medicineName: string;
  sku: string;
  unit: string;
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  currentStock: number;
  quantity: number;
  freeQuantity: number;
  unitPrice: number;
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
}

export default function POSBilling({ onBack, onInvoiceCreated }: POSBillingProps) {
  const { activeCompany } = useAuth();

  // Search & Master Data
  const [items, setItems] = useState<MedicineItem[]>([]);
  const [customers, setCustomers] = useState<CustomerParty[]>([]);
  const [nextInvoiceNo, setNextInvoiceNo] = useState('');
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Customer Form State
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerParty | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerName, setCustomerName] = useState('Cash Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [patientName, setPatientName] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Invoice Items
  const [invoiceItems, setInvoiceItems] = useState<SaleLineItem[]>([]);
  const [medicineSearch, setMedicineSearch] = useState('');
  const [showMedicineDropdown, setShowMedicineDropdown] = useState(false);

  // Billing & Payment
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'CARD' | 'CREDIT'>('CASH');
  const [billDiscountPct, setBillDiscountPct] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [isInterState, setIsInterState] = useState(false);
  const [notes, setNotes] = useState('');

  // Status & Print Modals
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInvoice, setCreatedInvoice] = useState<any | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const medicineInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMasterData();
  }, [activeCompany?.id]);

  const loadMasterData = async () => {
    if (!activeCompany) return;
    try {
      setLoadingInitial(true);
      setError(null);

      const [itemsRes, partiesRes, nextNumRes] = await Promise.all([
        api.get<{ items: MedicineItem[] }>('/api/items?limit=100', {
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

      // Default to cash customer if available
      const cashParty = partiesRes.parties?.find((p: CustomerParty) => p.isCash);
      if (cashParty) {
        setSelectedCustomer(cashParty);
        setCustomerName(cashParty.name);
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
    // Filter available batches with stock > 0, ordered by expiry date asc
    const now = new Date();
    const availableBatches = (item.batches || [])
      .filter(b => b.currentStock > 0)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

    if (availableBatches.length === 0) {
      setError(`"${item.name}" has zero stock across all batches.`);
      return;
    }

    const fefoBatch = availableBatches[0];
    const unitPrice = Number(fefoBatch.pts) || Number(fefoBatch.mrp);
    const gstRate = Number(item.gstRate) || 12.0;

    const lineGross = 1 * unitPrice;
    const lineTaxable = lineGross;
    const lineGst = (lineTaxable * gstRate) / 100;
    const lineTotal = lineTaxable + lineGst;

    const newItem: SaleLineItem = {
      itemId: item.id,
      medicineName: item.name,
      sku: item.sku,
      unit: item.unit,
      batchId: fefoBatch.id,
      batchNumber: fefoBatch.batchNumber,
      expiryDate: fefoBatch.expiryDate,
      currentStock: fefoBatch.currentStock,
      quantity: 1,
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
    setMedicineSearch('');
    setShowMedicineDropdown(false);
    setError(null);
  };

  // Change batch for an item row
  const handleChangeBatch = (index: number, batchId: string) => {
    const itemRow = invoiceItems[index];
    const medicine = items.find(i => i.id === itemRow.itemId);
    if (!medicine) return;

    const batch = medicine.batches.find(b => b.id === batchId);
    if (!batch) return;

    const unitPrice = Number(batch.pts) || Number(batch.mrp);
    updateLineItem(index, {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      currentStock: batch.currentStock,
      mrp: Number(batch.mrp),
      unitPrice
    });
  };

  // Update specific field in item row
  const updateLineItem = (index: number, updates: Partial<SaleLineItem>) => {
    setInvoiceItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], ...updates };

      const qty = Math.max(1, item.quantity);
      const price = Math.max(0, item.unitPrice);
      const discPct = Math.max(0, Math.min(100, item.discountPercent));
      const gstRate = item.gstRate;

      const lineGross = qty * price;
      const lineDisc = (lineGross * discPct) / 100;
      const lineTaxable = Math.max(0, lineGross - lineDisc);
      const lineGst = (lineTaxable * gstRate) / 100;
      const lineTotal = lineTaxable + lineGst;

      item.quantity = qty;
      item.unitPrice = price;
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
  };

  // Invoice Total Calculations
  const subtotal = invoiceItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const totalItemDiscount = invoiceItems.reduce((sum, item) => sum + ((item.quantity * item.unitPrice * item.discountPercent) / 100), 0);
  const grossTaxable = Math.max(0, subtotal - totalItemDiscount);

  const billDiscountAmt = (grossTaxable * Math.max(0, Math.min(100, billDiscountPct))) / 100;
  const netTaxable = Math.max(0, grossTaxable - billDiscountAmt);

  // Tax breakdown
  const avgGstRate = invoiceItems.length > 0
    ? invoiceItems.reduce((sum, i) => sum + i.gstRate, 0) / invoiceItems.length
    : 12;

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

  // Keyboard Shortcuts (F2 / Ctrl+Enter to complete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key === 'Enter') || e.key === 'F2') {
        e.preventDefault();
        if (invoiceItems.length > 0 && !submitting) {
          handleSaveInvoice();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [invoiceItems, paymentMode, paidAmount, customerName, submitting]);

  // Submit Sale Invoice
  const handleSaveInvoice = async () => {
    if (!activeCompany) return;
    if (invoiceItems.length === 0) {
      setError('Please add at least one medicine item to generate invoice.');
      return;
    }

    // Check stock limits
    for (const item of invoiceItems) {
      const totalUnits = item.quantity + item.freeQuantity;
      if (totalUnits > item.currentStock) {
        setError(`Insufficient stock for "${item.medicineName}" (Batch: ${item.batchNumber}). Available: ${item.currentStock}, Entered: ${totalUnits}`);
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
        customerGstin: customerGstin.trim() || null,
        doctorName: doctorName.trim() || null,
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
          quantity: i.quantity,
          freeQuantity: i.freeQuantity,
          unitPrice: i.unitPrice,
          mrp: i.mrp,
          discountPercent: i.discountPercent,
          gstRate: i.gstRate
        }))
      };

      const res = await api.post<{ invoice: any }>('/api/invoices', payload, {
        companyId: activeCompany.id,
        idempotencyKey: `pos-${Date.now()}`
      });

      // Fetch full invoice with company details for printing
      const detailsRes = await api.get<{ invoice: any }>(`/api/invoices/${res.invoice.id}`, {
        companyId: activeCompany.id
      });

      setCreatedInvoice(detailsRes.invoice);
      setShowPrintModal(true);

      if (onInvoiceCreated) {
        onInvoiceCreated();
      }
    } catch (err: any) {
      console.error('Invoice creation error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to complete sale transaction');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredMedicines = items.filter(i =>
    i.name.toLowerCase().includes(medicineSearch.toLowerCase()) ||
    (i.genericName && i.genericName.toLowerCase().includes(medicineSearch.toLowerCase())) ||
    i.sku.toLowerCase().includes(medicineSearch.toLowerCase())
  );

  return (
    <div className="pos-billing-container" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <button
            onClick={onBack}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', fontSize: '0.85rem' }}
          >
            ← Back to Sales
          </button>
          <h1 style={{ fontSize: '1.6rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
            <ShoppingCart style={{ color: 'var(--brand-teal)' }} /> POS Fast Billing Terminal
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.2rem 0 0 0', fontSize: '0.9rem' }}>
            Quick GST Invoicing with automatic FEFO batch allocation & instant ledger deduction
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          <div style={{ padding: '0.5rem 1rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Invoice No.</div>
            <div style={{ fontWeight: '700', color: 'var(--brand-teal)', fontSize: '1rem' }}>{nextInvoiceNo}</div>
          </div>
          <div style={{ padding: '0.5rem 1rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Date</div>
            <input
              type="date"
              value={invoiceDate}
              onChange={e => setInvoiceDate(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontWeight: '600', outline: 'none' }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', padding: '0.8rem 1.2rem', borderRadius: '8px', color: 'var(--accent-red)', marginBottom: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Main Grid: Left = Item Entry & Items Table; Right = Customer & Payment Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Left Column */}
        <div>
          {/* Medicine Search Bar with FEFO Picker */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem', marginBottom: '1.2rem', position: 'relative' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              🔍 Search Medicine / Product (Press Enter or Click to Add with FEFO Batch)
            </label>
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  ref={medicineInputRef}
                  type="text"
                  placeholder="Type medicine name, generic name, or SKU..."
                  value={medicineSearch}
                  onChange={e => {
                    setMedicineSearch(e.target.value);
                    setShowMedicineDropdown(true);
                  }}
                  onFocus={() => setShowMedicineDropdown(true)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem 0.75rem 2.5rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '0.95rem'
                  }}
                />

                {/* Autocomplete Dropdown */}
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
                    maxHeight: '280px',
                    overflowY: 'auto',
                    zIndex: 50,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                  }}>
                    {filteredMedicines.length === 0 ? (
                      <div style={{ padding: '1rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                        No medicines matching "{medicineSearch}"
                      </div>
                    ) : (
                      filteredMedicines.map(med => {
                        const totalStock = med.totalStock ?? med.batches?.reduce((s, b) => s + b.currentStock, 0) ?? 0;
                        const firstBatch = med.batches?.[0];
                        return (
                          <div
                            key={med.id}
                            onClick={() => handleSelectItem(med)}
                            style={{
                              padding: '0.8rem 1rem',
                              borderBottom: '1px solid var(--border-color)',
                              cursor: totalStock > 0 ? 'pointer' : 'not-allowed',
                              opacity: totalStock > 0 ? 1 : 0.6,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              transition: 'background 0.15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <div>
                              <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{med.name}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                {med.genericName ? `${med.genericName} • ` : ''}SKU: {med.sku} • Unit: {med.unit}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{
                                fontWeight: '700',
                                color: totalStock > 0 ? 'var(--brand-teal)' : 'var(--accent-red)',
                                fontSize: '0.9rem'
                              }}>
                                {totalStock > 0 ? `${totalStock} in stock` : 'Out of Stock'}
                              </div>
                              {firstBatch && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  MRP: ₹{Number(firstBatch.mrp).toFixed(2)} | Exp: {new Date(firstBatch.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '0.9rem 1.2rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Layers size={18} style={{ color: 'var(--brand-teal)' }} /> Bill Items ({invoiceItems.length})
              </h3>
              {invoiceItems.length > 0 && (
                <button
                  onClick={() => setInvoiceItems([])}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-red)', fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  Clear All
                </button>
              )}
            </div>

            {invoiceItems.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <ShoppingCart size={40} style={{ opacity: 0.3, marginBottom: '0.8rem' }} />
                <p style={{ margin: 0, fontWeight: '500' }}>No medicines added to bill yet.</p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.3rem', color: 'var(--text-muted)' }}>Search and pick medicines above to begin billing.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.8rem 1rem' }}>#</th>
                      <th style={{ padding: '0.8rem 1rem' }}>Medicine</th>
                      <th style={{ padding: '0.8rem 1rem' }}>Batch & Expiry</th>
                      <th style={{ padding: '0.8rem 1rem', width: '90px' }}>Qty</th>
                      <th style={{ padding: '0.8rem 1rem', width: '80px' }}>Free</th>
                      <th style={{ padding: '0.8rem 1rem', width: '100px' }}>Rate (₹)</th>
                      <th style={{ padding: '0.8rem 1rem', width: '80px' }}>Disc %</th>
                      <th style={{ padding: '0.8rem 1rem', width: '70px' }}>GST %</th>
                      <th style={{ padding: '0.8rem 1rem', textAlign: 'right' }}>Total (₹)</th>
                      <th style={{ padding: '0.8rem 0.5rem', width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceItems.map((item, idx) => {
                      const medicine = items.find(i => i.id === item.itemId);
                      const batches = medicine?.batches || [];

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.8rem 1rem', color: 'var(--text-secondary)' }}>{idx + 1}</td>
                          <td style={{ padding: '0.8rem 1rem' }}>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{item.medicineName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.sku} ({item.unit})</div>
                          </td>
                          <td style={{ padding: '0.8rem 1rem' }}>
                            {batches.length > 1 ? (
                              <select
                                value={item.batchId}
                                onChange={e => handleChangeBatch(idx, e.target.value)}
                                style={{
                                  padding: '0.4rem 0.6rem',
                                  background: 'var(--bg-secondary)',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '6px',
                                  color: 'var(--text-primary)',
                                  fontSize: '0.8rem'
                                }}
                              >
                                {batches.map(b => (
                                  <option key={b.id} value={b.id}>
                                    {b.batchNumber} (Exp: {new Date(b.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}, Stock: {b.currentStock})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div>
                                <span style={{ fontWeight: '600' }}>{item.batchNumber}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>
                                  Exp: {new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })} (Stock: {item.currentStock})
                                </span>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '0.8rem 1rem' }}>
                            <input
                              type="number"
                              min="1"
                              max={item.currentStock}
                              value={item.quantity}
                              onChange={e => updateLineItem(idx, { quantity: parseInt(e.target.value) || 1 })}
                              style={{
                                width: '100%',
                                padding: '0.4rem',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                color: 'var(--text-primary)',
                                textAlign: 'center',
                                fontWeight: '600'
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.8rem 1rem' }}>
                            <input
                              type="number"
                              min="0"
                              value={item.freeQuantity}
                              onChange={e => updateLineItem(idx, { freeQuantity: parseInt(e.target.value) || 0 })}
                              style={{
                                width: '100%',
                                padding: '0.4rem',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                color: 'var(--text-primary)',
                                textAlign: 'center'
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.8rem 1rem' }}>
                            <input
                              type="number"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={e => updateLineItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                              style={{
                                width: '100%',
                                padding: '0.4rem',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                color: 'var(--text-primary)',
                                textAlign: 'right'
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.8rem 1rem' }}>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={item.discountPercent}
                              onChange={e => updateLineItem(idx, { discountPercent: parseFloat(e.target.value) || 0 })}
                              style={{
                                width: '100%',
                                padding: '0.4rem',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                color: 'var(--text-primary)',
                                textAlign: 'center'
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.8rem 1rem', color: 'var(--text-secondary)' }}>
                            {item.gstRate}%
                          </td>
                          <td style={{ padding: '0.8rem 1rem', textAlign: 'right', fontWeight: '700', color: 'var(--text-primary)' }}>
                            ₹{item.totalAmount.toFixed(2)}
                          </td>
                          <td style={{ padding: '0.8rem 0.5rem', textAlign: 'center' }}>
                            <button
                              onClick={() => removeLineItem(idx)}
                              style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Customer Details, Calculations & Checkout */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          
          {/* Customer & Prescription Details */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <User size={16} style={{ color: 'var(--brand-teal)' }} /> Customer & Rx Details
            </h3>

            {/* Customer Search / Selection */}
            <div style={{ marginBottom: '0.8rem', position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Customer Name</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => {
                    setCustomerName(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="Enter name or select registered customer"
                  style={{
                    flex: 1,
                    padding: '0.6rem 0.8rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                />
                {selectedCustomer && !selectedCustomer.isCash && (
                  <button
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerName('Cash Customer');
                      setCustomerPhone('');
                      setCustomerGstin('');
                    }}
                    style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem 0.6rem', color: 'var(--text-secondary)', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {showCustomerDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  marginTop: '4px',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  zIndex: 40,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.25)'
                }}>
                  {customers.map(c => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setSelectedCustomer(c);
                        setCustomerName(c.name);
                        setCustomerPhone(c.phone || '');
                        setCustomerGstin(c.gstin || '');
                        setShowCustomerDropdown(false);
                      }}
                      style={{ padding: '0.5rem 0.8rem', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '0.85rem' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{c.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {c.phone ? `Ph: ${c.phone} ` : ''}{c.outstandingBalance > 0 ? `| Bal: ₹${c.outstandingBalance}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Phone</label>
                <input
                  type="text"
                  placeholder="Mobile No."
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>GSTIN</label>
                <input
                  type="text"
                  placeholder="Customer GSTIN"
                  value={customerGstin}
                  onChange={e => setCustomerGstin(e.target.value.toUpperCase())}
                  style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Doctor Name</label>
                <input
                  type="text"
                  placeholder="Dr. Name"
                  value={doctorName}
                  onChange={e => setDoctorName(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Patient Name</label>
                <input
                  type="text"
                  placeholder="Patient Name"
                  value={patientName}
                  onChange={e => setPatientName(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </div>
            </div>
          </div>

          {/* Bill Calculation & Payment */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Receipt size={16} style={{ color: 'var(--brand-teal)' }} /> Billing & GST Summary
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Subtotal (Gross):</span>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>₹{subtotal.toFixed(2)}</span>
              </div>

              {totalItemDiscount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-red)' }}>
                  <span>Item Discounts:</span>
                  <span>- ₹{totalItemDiscount.toFixed(2)}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
                <span>Bill Discount %:</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={billDiscountPct}
                  onChange={e => setBillDiscountPct(parseFloat(e.target.value) || 0)}
                  style={{ width: '70px', padding: '0.3rem 0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'right' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Taxable Amount:</span>
                <span>₹{netTaxable.toFixed(2)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Inter-state Sale (IGST):</span>
                <input
                  type="checkbox"
                  checked={isInterState}
                  onChange={e => setIsInterState(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--brand-teal)' }}
                />
              </div>

              {!isInterState ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    <span>CGST (Avg):</span>
                    <span>₹{cgstAmount.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    <span>SGST (Avg):</span>
                    <span>₹{sgstAmount.toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  <span>IGST (Avg):</span>
                  <span>₹{igstAmount.toFixed(2)}</span>
                </div>
              )}

              {roundOff !== 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  <span>Round Off:</span>
                  <span>₹{roundOff > 0 ? `+${roundOff.toFixed(2)}` : roundOff.toFixed(2)}</span>
                </div>
              )}

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '0.8rem',
                marginTop: '0.4rem',
                borderTop: '2px dashed var(--border-color)',
                fontSize: '1.2rem',
                fontWeight: '800',
                color: 'var(--brand-teal)'
              }}>
                <span>Grand Total:</span>
                <span>₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Mode Selector */}
            <div style={{ marginTop: '1.2rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Payment Mode
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem', marginBottom: '0.8rem' }}>
                {(['CASH', 'UPI', 'CARD', 'CREDIT'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setPaymentMode(mode);
                      if (mode === 'CREDIT') {
                        setPaidAmount('0');
                      } else {
                        setPaidAmount(String(grandTotal));
                      }
                    }}
                    style={{
                      padding: '0.5rem 0.2rem',
                      borderRadius: '6px',
                      border: paymentMode === mode ? '2px solid var(--brand-teal)' : '1px solid var(--border-color)',
                      background: paymentMode === mode ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-secondary)',
                      color: paymentMode === mode ? 'var(--brand-teal)' : 'var(--text-primary)',
                      fontWeight: '600',
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Paid (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Paid Amt"
                    value={paidAmount}
                    onChange={e => setPaidAmount(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.9rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Balance Due (₹)</label>
                  <div style={{
                    padding: '0.5rem',
                    background: balanceDue > 0 ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: balanceDue > 0 ? 'var(--accent-red)' : 'var(--brand-teal)',
                    fontWeight: '700',
                    fontSize: '0.9rem'
                  }}>
                    ₹{balanceDue.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ marginTop: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <button
                onClick={handleSaveInvoice}
                disabled={submitting || invoiceItems.length === 0}
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  background: 'var(--brand-teal)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '1rem',
                  cursor: (submitting || invoiceItems.length === 0) ? 'not-allowed' : 'pointer',
                  opacity: (submitting || invoiceItems.length === 0) ? 0.6 : 1,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 12px rgba(20, 184, 166, 0.3)'
                }}
              >
                {submitting ? 'Generating Invoice...' : '⚡ Complete Sale & Print (F2)'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Printable Invoice Modal */}
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
          zIndex: 100,
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
            {/* Modal Controls (Hidden in Print) */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.8rem' }}>
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
              </div>
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

            {/* Printable Tax Invoice Layout */}
            <div id="printable-tax-invoice" style={{ fontFamily: 'monospace, sans-serif' }}>
              <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '0.8rem', marginBottom: '1rem' }}>
                <h2 style={{ margin: '0 0 0.2rem 0', fontSize: '1.4rem', fontWeight: 'bold' }}>{createdInvoice.company?.name || activeCompany?.name}</h2>
                <div style={{ fontSize: '0.85rem' }}>TAX INVOICE (GST REGULATION COMPLIANT)</div>
                <div style={{ fontSize: '0.8rem', color: '#4b5563' }}>Pharma Wholesale & Retail Billing</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem', marginBottom: '1rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.8rem' }}>
                <div>
                  <div><strong>Invoice No:</strong> {createdInvoice.invoiceNumber}</div>
                  <div><strong>Date:</strong> {new Date(createdInvoice.invoiceDate).toLocaleDateString('en-IN')}</div>
                  <div><strong>Payment Mode:</strong> {createdInvoice.paymentMode}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div><strong>Customer:</strong> {createdInvoice.customerName}</div>
                  {createdInvoice.customerPhone && <div><strong>Phone:</strong> {createdInvoice.customerPhone}</div>}
                  {createdInvoice.customerGstin && <div><strong>GSTIN:</strong> {createdInvoice.customerGstin}</div>}
                  {createdInvoice.doctorName && <div><strong>Doctor:</strong> {createdInvoice.doctorName}</div>}
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
                    <th style={{ padding: '0.4rem 0', textAlign: 'right' }}>GST</th>
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
                      <td style={{ padding: '0.4rem 0', textAlign: 'center' }}>{item.quantity}{item.freeQuantity > 0 ? `+${item.freeQuantity}` : ''}</td>
                      <td style={{ padding: '0.4rem 0', textAlign: 'right' }}>₹{Number(item.mrp).toFixed(2)}</td>
                      <td style={{ padding: '0.4rem 0', textAlign: 'right' }}>₹{Number(item.unitPrice).toFixed(2)}</td>
                      <td style={{ padding: '0.4rem 0', textAlign: 'right' }}>{item.gstRate}%</td>
                      <td style={{ padding: '0.4rem 0', textAlign: 'right', fontWeight: 'bold' }}>₹{Number(item.totalAmount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #000', paddingTop: '0.6rem', fontSize: '0.85rem' }}>
                <div style={{ width: '250px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span>Taxable Value:</span>
                    <span>₹{Number(createdInvoice.taxableAmount).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span>Total Tax:</span>
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

              <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.75rem', color: '#6b7280', borderTop: '1px solid #e5e7eb', paddingTop: '0.8rem' }}>
                Thank you for your business! Medicines once sold can only be returned per Drug & Cosmetics Rules.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

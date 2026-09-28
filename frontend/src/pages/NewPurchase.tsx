import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import {
  Truck,
  Plus,
  Trash2,
  Calendar,
  IndianRupee,
  FileText,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Search,
  Package,
  Layers,
  Save,
  Building2
} from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  station?: string | null;
  gstin?: string | null;
  drugLicenseNo?: string | null;
  outstandingBalance: number;
}

interface MedicineItem {
  id: string;
  sku: string;
  name: string;
  genericName?: string | null;
  unit: string;
  conversionFactor: number;
  gstRate: number;
  totalStock?: number;
  batches?: Array<{
    id: string;
    batchNumber: string;
    expiryDate: string;
    mrp: number;
    ptr: number;
    pts: number;
    currentStock: number;
  }>;
}

interface PurchaseRow {
  id: string;
  itemId: string;
  medicineName: string;
  genericName?: string;
  sku: string;
  pack: string;
  batchNumber: string;
  expiryMonth: string;
  expiryYear: string;
  quantity: string;
  freeQuantity: string;
  purchaseRate: string; // P.RATE/S (PTR)
  mrp: string;
  pts: string; // SRate (Selling Rate)
  discountPercent: string; // DIS1%
  gstRate: string;
}

export default function NewPurchase({ onBack, onCreated }: { onBack: () => void; onCreated: () => void }) {
  const { activeCompany } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [medicines, setMedicines] = useState<MedicineItem[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);

  // Form Header State (Photo 2)
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [entryNo, setEntryNo] = useState(`PUR-${Date.now().toString().slice(-4)}`);
  const [partyBillNo, setPartyBillNo] = useState(''); // Party No. (Supplier Bill No)
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]); // Dt:
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]); // Date:
  const [purchaseType, setPurchaseType] = useState<'TAX' | 'RETAIL' | 'CHALLAN'>('TAX'); // Type:
  const [dueDate, setDueDate] = useState('');
  const [paymentMode, setPaymentMode] = useState<'CREDIT' | 'CASH' | 'BANK_TRANSFER' | 'UPI'>('CREDIT');
  const [paidAmount, setPaidAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Active Row Focus for Footer Inspection HUD
  const [activeRowIndex, setActiveRowIndex] = useState<number>(0);

  // Rows State
  const [rows, setRows] = useState<PurchaseRow[]>([
    {
      id: 'row-1',
      itemId: '',
      medicineName: '',
      sku: '',
      pack: '10 TAB',
      batchNumber: '',
      expiryMonth: '12',
      expiryYear: String(new Date().getFullYear() + 2),
      quantity: '10',
      freeQuantity: '0',
      purchaseRate: '100',
      mrp: '140',
      pts: '120',
      discountPercent: '0',
      gstRate: '12'
    }
  ]);

  // Autocomplete search states
  const [activeSearchRowIndex, setActiveSearchRowIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchInitialData();
  }, [activeCompany?.id]);

  const fetchInitialData = async () => {
    if (!activeCompany) return;
    try {
      setLoadingSuppliers(true);
      const [supRes, medRes] = await Promise.all([
        api.get<{ parties: Supplier[] }>('/api/parties?type=supplier', { companyId: activeCompany.id }),
        api.get<{ items: MedicineItem[] }>('/api/items?limit=100', { companyId: activeCompany.id })
      ]);
      setSuppliers(supRes.parties || []);
      setMedicines(medRes.items || []);
      if (supRes.parties && supRes.parties.length > 0) {
        setSelectedSupplierId(supRes.parties[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load initial data');
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const handleAddRow = () => {
    const newRow: PurchaseRow = {
      id: `row-${Date.now()}`,
      itemId: '',
      medicineName: '',
      sku: '',
      pack: '10 TAB',
      batchNumber: '',
      expiryMonth: '12',
      expiryYear: String(new Date().getFullYear() + 2),
      quantity: '10',
      freeQuantity: '0',
      purchaseRate: '100',
      mrp: '140',
      pts: '120',
      discountPercent: '0',
      gstRate: '12'
    };
    setRows(prev => [...prev, newRow]);
    setActiveRowIndex(rows.length);
  };

  const handleRemoveRow = (index: number) => {
    if (rows.length === 1) return;
    setRows(prev => prev.filter((_, i) => i !== index));
    if (activeRowIndex >= rows.length - 1) {
      setActiveRowIndex(Math.max(0, rows.length - 2));
    }
  };

  const handleRowChange = (index: number, field: keyof PurchaseRow, value: string) => {
    setRows(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSelectMedicine = (index: number, med: MedicineItem) => {
    setRows(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        itemId: med.id,
        medicineName: med.name,
        genericName: med.genericName || '',
        sku: med.sku,
        pack: med.conversionFactor > 1 ? `${med.conversionFactor} ${med.unit}` : med.unit,
        gstRate: String(med.gstRate || 12)
      };
      return updated;
    });
    setActiveSearchRowIndex(null);
    setSearchQuery('');
  };

  // Row financial calculations
  const calculateRowTotal = (row: PurchaseRow) => {
    const qty = parseFloat(row.quantity) || 0;
    const rate = parseFloat(row.purchaseRate) || 0;
    const discPct = Math.max(0, Math.min(100, parseFloat(row.discountPercent) || 0));
    const gross = qty * rate;
    const disc = (gross * discPct) / 100;
    const taxable = gross - disc;
    const gstRate = parseFloat(row.gstRate) || 0;
    const gstAmt = (taxable * gstRate) / 100;
    return {
      gross,
      disc,
      taxable,
      gstAmt,
      total: taxable + gstAmt
    };
  };

  // Bill Totals (Photo 2 Right Pane)
  const valueOfGoods = rows.reduce((sum, r) => sum + calculateRowTotal(r).gross, 0);
  const totalDiscount = rows.reduce((sum, r) => sum + calculateRowTotal(r).disc, 0);
  const taxableValue = rows.reduce((sum, r) => sum + calculateRowTotal(r).taxable, 0);
  const totalGst = rows.reduce((sum, r) => sum + calculateRowTotal(r).gstAmt, 0);
  const rawTotal = taxableValue + totalGst;
  const grandTotal = Math.round(rawTotal);
  const roundOff = Math.round((grandTotal - rawTotal) * 100) / 100;

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);
  const activeRow = rows[activeRowIndex] || rows[0];
  const activeMedicine = medicines.find(m => m.id === activeRow?.itemId);

  const handleSubmit = async () => {
    if (!activeCompany) return;
    if (!selectedSupplierId) {
      setError('Please select a Supplier Ledger');
      return;
    }
    if (!partyBillNo.trim()) {
      setError('Please enter Supplier Bill / Invoice No. (Party No.)');
      return;
    }

    // Validate rows
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.itemId || !r.batchNumber.trim()) {
        setError(`Row #${i + 1}: Please select a medicine and enter a valid batch number`);
        return;
      }
      const qty = parseInt(r.quantity) || 0;
      if (qty <= 0) {
        setError(`Row #${i + 1}: Quantity must be greater than 0`);
        return;
      }
    }

    try {
      setSubmitting(true);
      setError(null);

      const items = rows.map(r => {
        const mm = r.expiryMonth.padStart(2, '0');
        const yyyy = r.expiryYear.length === 2 ? `20${r.expiryYear}` : r.expiryYear;
        // Last day of the expiry month
        const lastDay = new Date(parseInt(yyyy), parseInt(mm), 0).getDate();
        const expiryDate = `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`;

        return {
          itemId: r.itemId,
          batchNumber: r.batchNumber.trim().toUpperCase(),
          expiryDate,
          pack: r.pack,
          quantity: parseInt(r.quantity) || 1,
          freeQuantity: parseInt(r.freeQuantity) || 0,
          purchaseRate: parseFloat(r.purchaseRate) || 0,
          mrp: parseFloat(r.mrp) || parseFloat(r.purchaseRate) || 0,
          pts: parseFloat(r.pts) || parseFloat(r.purchaseRate) || 0,
          discountPercent: parseFloat(r.discountPercent) || 0,
          gstRate: parseFloat(r.gstRate) || 12
        };
      });

      const payload = {
        supplierId: selectedSupplierId,
        invoiceNumber: partyBillNo.trim(),
        purchaseDate: billDate,
        dueDate: dueDate || null,
        paymentMode,
        paidAmount: parseFloat(paidAmount) || 0,
        roundOff,
        notes: notes.trim() || null,
        items
      };

      await api.post('/api/purchases', payload, {
        companyId: activeCompany.id,
        idempotencyKey: `pur-${Date.now()}`
      });

      onCreated();
    } catch (err: any) {
      console.error('Purchase error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to record purchase entry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <button
            onClick={onBack}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', fontSize: '0.85rem' }}
          >
            ← Back to Purchases List
          </button>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Truck style={{ color: '#0284c7' }} /> PURCHASE CHALLAN / INWARD BILL ENTRY
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.2rem 0 0 0', fontSize: '0.85rem' }}>
            High-speed distributor bill entry with batch lot generation & automated stock ledger posting
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: '0.65rem 1.4rem',
              background: '#0284c7',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '700',
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
            }}
          >
            <Save size={16} /> {submitting ? 'Posting Bill...' : 'Save Inward Bill (F2)'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', padding: '0.8rem 1.2rem', borderRadius: '8px', color: 'var(--accent-red)', marginBottom: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Marg-Style Purchase Header Form (Photo 2 Top Section) */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem', marginBottom: '1.2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '1rem', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              NAME : (SUPPLIER LEDGER) *
            </label>
            <select
              value={selectedSupplierId}
              onChange={e => setSelectedSupplierId(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '700' }}
            >
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.station ? `(${s.station})` : ''} {s.gstin ? `[GST: ${s.gstin}]` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              ENTRY NO. :
            </label>
            <input
              type="text"
              value={entryNo}
              onChange={e => setEntryNo(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '600' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              DATE :
            </label>
            <input
              type="date"
              value={entryDate}
              onChange={e => setEntryDate(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              PARTY NO. (BILL NO) * :
            </label>
            <input
              type="text"
              placeholder="e.g. INV-9901"
              value={partyBillNo}
              onChange={e => setPartyBillNo(e.target.value.toUpperCase())}
              style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '700' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              DT: (BILL DATE) :
            </label>
            <input
              type="date"
              value={billDate}
              onChange={e => setBillDate(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
      </div>

      {/* Product Entry Grid Table (Photo 2 Grid) */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.2rem' }}>
        <div style={{ padding: '0.8rem 1.2rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Package size={16} style={{ color: '#0284c7' }} /> Inward Line Items ({rows.length})
          </div>
          <button
            onClick={handleAddRow}
            style={{
              padding: '0.4rem 0.8rem',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem'
            }}
          >
            <Plus size={14} /> Add Product Line (+ key)
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '0.75rem 0.8rem', width: '35px' }}>#</th>
                <th style={{ padding: '0.75rem 0.8rem', minWidth: '220px' }}>PRODUCT</th>
                <th style={{ padding: '0.75rem 0.8rem', width: '90px' }}>PACK</th>
                <th style={{ padding: '0.75rem 0.8rem', width: '130px' }}>BATCH</th>
                <th style={{ padding: '0.75rem 0.8rem', width: '110px' }}>EXPIRY</th>
                <th style={{ padding: '0.75rem 0.8rem', width: '75px', textAlign: 'center' }}>QTY</th>
                <th style={{ padding: '0.75rem 0.8rem', width: '70px', textAlign: 'center' }}>FREE</th>
                <th style={{ padding: '0.75rem 0.8rem', width: '95px', textAlign: 'right' }}>P.RATE/S</th>
                <th style={{ padding: '0.75rem 0.8rem', width: '80px', textAlign: 'center' }}>DIS1%</th>
                <th style={{ padding: '0.75rem 0.8rem', width: '75px', textAlign: 'center' }}>GST%</th>
                <th style={{ padding: '0.75rem 0.8rem', width: '110px', textAlign: 'right' }}>AMOUNT (₹)</th>
                <th style={{ padding: '0.75rem 0.5rem', width: '35px' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const rowCalc = calculateRowTotal(row);
                const isFocused = activeRowIndex === idx;

                return (
                  <tr
                    key={row.id}
                    onClick={() => setActiveRowIndex(idx)}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      background: isFocused ? 'rgba(2, 132, 199, 0.05)' : 'transparent',
                      transition: 'background 0.1s'
                    }}
                  >
                    <td style={{ padding: '0.6rem 0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>{idx + 1}</td>

                    {/* Medicine Autocomplete */}
                    <td style={{ padding: '0.6rem 0.8rem', position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Search medicine..."
                        value={activeSearchRowIndex === idx ? searchQuery : row.medicineName}
                        onFocus={() => {
                          setActiveSearchRowIndex(idx);
                          setActiveRowIndex(idx);
                          setSearchQuery(row.medicineName);
                        }}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.4rem 0.6rem',
                          background: 'var(--bg-secondary)',
                          border: isFocused ? '1px solid #0284c7' : '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          fontWeight: '600'
                        }}
                      />

                      {activeSearchRowIndex === idx && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          left: '0.8rem',
                          right: '0.8rem',
                          background: 'var(--card-bg)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          maxHeight: '200px',
                          overflowY: 'auto',
                          zIndex: 60,
                          boxShadow: '0 6px 20px rgba(0,0,0,0.3)'
                        }}>
                          {medicines
                            .filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.sku.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map(med => (
                              <div
                                key={med.id}
                                onClick={() => handleSelectMedicine(idx, med)}
                                style={{ padding: '0.5rem 0.8rem', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '0.8rem' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{med.name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>SKU: {med.sku} • GST: {med.gstRate}%</div>
                              </div>
                            ))}
                        </div>
                      )}
                    </td>

                    {/* Pack */}
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      <input
                        type="text"
                        value={row.pack}
                        onChange={e => handleRowChange(idx, 'pack', e.target.value)}
                        style={{ width: '100%', padding: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center' }}
                      />
                    </td>

                    {/* Batch */}
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      <input
                        type="text"
                        placeholder="BATCH NO"
                        value={row.batchNumber}
                        onChange={e => handleRowChange(idx, 'batchNumber', e.target.value.toUpperCase())}
                        style={{ width: '100%', padding: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '700', fontFamily: 'monospace' }}
                      />
                    </td>

                    {/* Expiry MM/YY */}
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                        <input
                          type="text"
                          maxLength={2}
                          placeholder="MM"
                          value={row.expiryMonth}
                          onChange={e => handleRowChange(idx, 'expiryMonth', e.target.value)}
                          style={{ width: '38px', padding: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center' }}
                        />
                        <span>/</span>
                        <input
                          type="text"
                          maxLength={4}
                          placeholder="YYYY"
                          value={row.expiryYear}
                          onChange={e => handleRowChange(idx, 'expiryYear', e.target.value)}
                          style={{ width: '52px', padding: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center' }}
                        />
                      </div>
                    </td>

                    {/* Quantity */}
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      <input
                        type="number"
                        min="1"
                        value={row.quantity}
                        onChange={e => handleRowChange(idx, 'quantity', e.target.value)}
                        style={{ width: '100%', padding: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center', fontWeight: '700' }}
                      />
                    </td>

                    {/* Free Qty */}
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      <input
                        type="number"
                        min="0"
                        value={row.freeQuantity}
                        onChange={e => handleRowChange(idx, 'freeQuantity', e.target.value)}
                        style={{ width: '100%', padding: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center' }}
                      />
                    </td>

                    {/* Purchase Rate (PTR) */}
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      <input
                        type="number"
                        step="0.01"
                        value={row.purchaseRate}
                        onChange={e => handleRowChange(idx, 'purchaseRate', e.target.value)}
                        style={{ width: '100%', padding: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'right', fontWeight: '600' }}
                      />
                    </td>

                    {/* Discount % */}
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={row.discountPercent}
                        onChange={e => handleRowChange(idx, 'discountPercent', e.target.value)}
                        style={{ width: '100%', padding: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center' }}
                      />
                    </td>

                    {/* GST % */}
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      <input
                        type="number"
                        value={row.gstRate}
                        onChange={e => handleRowChange(idx, 'gstRate', e.target.value)}
                        style={{ width: '100%', padding: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center' }}
                      />
                    </td>

                    {/* Line Amount */}
                    <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontWeight: '700', color: 'var(--text-primary)' }}>
                      ₹{rowCalc.total.toFixed(2)}
                    </td>

                    {/* Delete */}
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                      {rows.length > 1 && (
                        <button
                          onClick={() => handleRemoveRow(idx)}
                          style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Split Bottom HUD (Photo 2 Bottom Section) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.2rem', alignItems: 'stretch' }}>
        
        {/* Left Bottom HUD: Active Selected Line Item Details */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#0284c7', textTransform: 'uppercase', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Layers size={14} /> Active Item Inspection HUD (Row #{activeRowIndex + 1})
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', fontSize: '0.85rem' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Item : </span>
                <strong style={{ color: 'var(--text-primary)' }}>{activeRow?.medicineName || '—'}</strong>
                {activeRow?.genericName && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{activeRow.genericName}</div>}
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Batch : </span>
                <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{activeRow?.batchNumber || '—'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Expiry : </span>
                <strong>{activeRow?.expiryMonth}/{activeRow?.expiryYear}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Live Stock : </span>
                <strong style={{ color: '#10b981' }}>{activeMedicine?.totalStock ?? 0} units in stock</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>M.R.P. (₹) : </span>
                <input
                  type="number"
                  step="0.01"
                  value={activeRow?.mrp}
                  onChange={e => handleRowChange(activeRowIndex, 'mrp', e.target.value)}
                  style={{ width: '80px', padding: '0.2rem 0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', marginLeft: '0.4rem' }}
                />
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>SRate (PTS ₹) : </span>
                <input
                  type="number"
                  step="0.01"
                  value={activeRow?.pts}
                  onChange={e => handleRowChange(activeRowIndex, 'pts', e.target.value)}
                  style={{ width: '80px', padding: '0.2rem 0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', marginLeft: '0.4rem' }}
                />
              </div>
            </div>
          </div>

          <div style={{ marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px dashed var(--border-color)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Supplier: <strong>{selectedSupplier?.name}</strong> | Station: {selectedSupplier?.station || 'Local'}
          </div>
        </div>

        {/* Right Bottom HUD: Financial Breakdown (Photo 2 Right Pane) */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>
            Financial Summary & Taxes
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
              <span>VALUE OF GOODS :</span>
              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>₹{valueOfGoods.toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-red)' }}>
              <span>DISCOUNT :</span>
              <span>- ₹{totalDiscount.toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
              <span>TAXABLE VALUE :</span>
              <span>₹{taxableValue.toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
              <span>GST (CGST + SGST / IGST) :</span>
              <span>₹{totalGst.toFixed(2)}</span>
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
              paddingTop: '0.8rem',
              marginTop: '0.3rem',
              borderTop: '2px solid var(--border-color)',
              fontSize: '1.2rem',
              fontWeight: '800',
              color: '#0284c7'
            }}>
              <span>BILL TOTAL / NET :</span>
              <span>₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

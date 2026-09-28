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
  Building2,
  Sparkles,
  PlusCircle,
  X
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
  manufacturer?: string | null;
  hsnCode?: string;
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
  manufacturer?: string;
  hsnCode?: string;
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
  isNewCatalog?: boolean;
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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Active Row Focus for Footer Inspection HUD
  const [activeRowIndex, setActiveRowIndex] = useState<number>(0);

  // Rows State
  const [rows, setRows] = useState<PurchaseRow[]>([
    {
      id: 'row-1',
      itemId: '',
      medicineName: '',
      genericName: '',
      manufacturer: '',
      hsnCode: '3004',
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
      gstRate: '12',
      isNewCatalog: false
    }
  ]);

  // Autocomplete search states
  const [activeSearchRowIndex, setActiveSearchRowIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Quick Add Medicine Modal State
  const [showAddMedicineModal, setShowAddMedicineModal] = useState(false);
  const [newMedForm, setNewMedForm] = useState({
    name: '',
    genericName: '',
    manufacturer: '',
    pack: '10 TAB',
    unit: 'STRIP',
    conversionFactor: 10,
    hsnCode: '3004',
    gstRate: 12,
    defaultPtr: 100,
    defaultMrp: 140,
    defaultPts: 120
  });
  const [savingNewMed, setSavingNewMed] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, [activeCompany?.id]);

  // Keyboard shortcut listener (F2: Save, F4: Quick Add Med)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'F4') {
        e.preventDefault();
        setShowAddMedicineModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rows, selectedSupplierId, partyBillNo, billDate, paidAmount, paymentMode]);

  const fetchInitialData = async () => {
    if (!activeCompany) return;
    try {
      setLoadingSuppliers(true);
      const [supRes, medRes] = await Promise.all([
        api.get<{ parties: Supplier[] }>('/api/parties?type=supplier', { companyId: activeCompany.id }),
        api.get<{ items: MedicineItem[] }>('/api/items?limit=200', { companyId: activeCompany.id })
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
      genericName: '',
      manufacturer: '',
      hsnCode: '3004',
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
      gstRate: '12',
      isNewCatalog: false
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

  const handleRowChange = (index: number, field: keyof PurchaseRow, value: any) => {
    setRows(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSelectExistingMedicine = (index: number, med: MedicineItem) => {
    setRows(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        itemId: med.id,
        medicineName: med.name,
        genericName: med.genericName || '',
        manufacturer: med.manufacturer || '',
        hsnCode: med.hsnCode || '3004',
        sku: med.sku,
        pack: med.conversionFactor > 1 ? `${med.conversionFactor} ${med.unit}` : med.unit,
        gstRate: String(med.gstRate || 12),
        isNewCatalog: false
      };
      return updated;
    });
    setActiveSearchRowIndex(null);
    setSearchQuery('');
  };

  const handleCreateNewMedicineInline = (index: number, customName: string) => {
    const cleanName = customName.trim();
    if (!cleanName) return;

    setRows(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        itemId: '',
        medicineName: cleanName,
        genericName: '',
        manufacturer: '',
        hsnCode: '3004',
        sku: '',
        pack: updated[index].pack || '10 TAB',
        gstRate: updated[index].gstRate || '12',
        isNewCatalog: true
      };
      return updated;
    });
    setActiveSearchRowIndex(null);
    setSearchQuery('');
  };

  const handleQuickAddMedicineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany) return;
    if (!newMedForm.name.trim()) {
      setError('Medicine name is required');
      return;
    }

    try {
      setSavingNewMed(true);
      const res = await api.post<{ item: MedicineItem }>('/api/items', {
        name: newMedForm.name.trim(),
        genericName: newMedForm.genericName.trim() || null,
        manufacturer: newMedForm.manufacturer.trim() || null,
        hsnCode: newMedForm.hsnCode || '3004',
        gstRate: Number(newMedForm.gstRate) || 12,
        unit: newMedForm.unit || 'STRIP',
        conversionFactor: Number(newMedForm.conversionFactor) || 1
      }, {
        companyId: activeCompany.id
      });

      const createdMed = res.item;
      setMedicines(prev => [...prev, createdMed]);

      // Populate into active row or current row
      if (rows.length > 0 && activeRowIndex < rows.length) {
        setRows(prev => {
          const updated = [...prev];
          updated[activeRowIndex] = {
            ...updated[activeRowIndex],
            itemId: createdMed.id,
            medicineName: createdMed.name,
            genericName: createdMed.genericName || '',
            manufacturer: createdMed.manufacturer || '',
            hsnCode: createdMed.hsnCode || '3004',
            sku: createdMed.sku,
            pack: createdMed.conversionFactor > 1 ? `${createdMed.conversionFactor} ${createdMed.unit}` : createdMed.unit,
            gstRate: String(createdMed.gstRate || 12),
            purchaseRate: String(newMedForm.defaultPtr || 100),
            mrp: String(newMedForm.defaultMrp || 140),
            pts: String(newMedForm.defaultPts || 120),
            isNewCatalog: false
          };
          return updated;
        });
      }

      setShowAddMedicineModal(false);
      setSuccessMsg(`Medicine "${createdMed.name}" added to catalog!`);
      setTimeout(() => setSuccessMsg(null), 4000);
      // Reset form
      setNewMedForm({
        name: '',
        genericName: '',
        manufacturer: '',
        pack: '10 TAB',
        unit: 'STRIP',
        conversionFactor: 10,
        hsnCode: '3004',
        gstRate: 12,
        defaultPtr: 100,
        defaultMrp: 140,
        defaultPts: 120
      });
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to create medicine');
    } finally {
      setSavingNewMed(false);
    }
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
      const medName = (r.medicineName || '').trim();
      if (!r.itemId && !medName) {
        setError(`Row #${i + 1}: Please enter or select a medicine name`);
        return;
      }
      if (!r.batchNumber.trim()) {
        setError(`Row #${i + 1}: Please enter a valid batch number for ${medName || 'item'}`);
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
          itemId: r.itemId || undefined,
          medicineName: r.medicineName.trim(),
          genericName: r.genericName?.trim() || undefined,
          manufacturer: r.manufacturer?.trim() || undefined,
          hsnCode: r.hsnCode?.trim() || '3004',
          pack: r.pack,
          batchNumber: r.batchNumber.trim().toUpperCase(),
          expiryDate,
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
    <div style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
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
            High-speed distributor bill entry with <strong style={{ color: '#0284c7' }}>Auto-Medicine Cataloging</strong> & automated stock ledger posting
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setShowAddMedicineModal(true)}
            style={{
              padding: '0.6rem 1rem',
              background: 'rgba(2, 132, 199, 0.1)',
              color: '#0284c7',
              border: '1px solid #0284c7',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem'
            }}
          >
            <PlusCircle size={15} /> + Quick Add Medicine (F4)
          </button>

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
            <Save size={16} /> {submitting ? 'Posting Bill & Cataloging...' : 'Save Inward Bill (F2)'}
          </button>
        </div>
      </div>

      {successMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid #10b981', padding: '0.8rem 1.2rem', borderRadius: '8px', color: '#10b981', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} /> {successMsg}
        </div>
      )}

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
        <div style={{ padding: '0.8rem 1.2rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(2, 132, 199, 0.03)' }}>
          <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Package size={16} style={{ color: '#0284c7' }} /> Inward Line Items ({rows.length})
            <span style={{ fontSize: '0.75rem', fontWeight: '500', color: '#0284c7', background: 'rgba(2, 132, 199, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
              ✨ Type any new medicine name to auto-save to Catalog
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
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
              <Plus size={14} /> Add Product Line (+)
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '0.75rem 0.8rem', width: '35px' }}>#</th>
                <th style={{ padding: '0.75rem 0.8rem', minWidth: '240px' }}>PRODUCT / MEDICINE NAME</th>
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
                const filteredMedicines = medicines.filter(m =>
                  m.name.toLowerCase().includes((searchQuery || '').toLowerCase()) ||
                  m.sku.toLowerCase().includes((searchQuery || '').toLowerCase()) ||
                  (m.genericName && m.genericName.toLowerCase().includes((searchQuery || '').toLowerCase()))
                );

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

                    {/* Medicine Autocomplete & Direct Entry */}
                    <td style={{ padding: '0.6rem 0.8rem', position: 'relative' }}>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder="Type medicine name or select..."
                          value={activeSearchRowIndex === idx ? searchQuery : row.medicineName}
                          onFocus={() => {
                            setActiveSearchRowIndex(idx);
                            setActiveRowIndex(idx);
                            setSearchQuery(row.medicineName);
                          }}
                          onChange={e => {
                            const val = e.target.value;
                            setSearchQuery(val);
                            handleRowChange(idx, 'medicineName', val);
                            if (!medicines.some(m => m.name.toLowerCase() === val.toLowerCase())) {
                              handleRowChange(idx, 'isNewCatalog', true);
                              handleRowChange(idx, 'itemId', '');
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '0.4rem 0.6rem',
                            paddingRight: row.isNewCatalog ? '85px' : '0.6rem',
                            background: 'var(--bg-secondary)',
                            border: isFocused ? '1px solid #0284c7' : '1px solid var(--border-color)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            fontWeight: '600'
                          }}
                        />
                        {row.isNewCatalog && row.medicineName && (
                          <span style={{
                            position: 'absolute',
                            right: '6px',
                            fontSize: '0.65rem',
                            background: '#0284c7',
                            color: '#fff',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px'
                          }}>
                            <Sparkles size={10} /> Auto-Save
                          </span>
                        )}
                      </div>

                      {activeSearchRowIndex === idx && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          left: '0.8rem',
                          right: '0.8rem',
                          background: 'var(--card-bg)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          maxHeight: '260px',
                          overflowY: 'auto',
                          zIndex: 80,
                          boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                        }}>
                          {/* Option to create new if user typed something */}
                          {searchQuery.trim().length > 0 && !medicines.some(m => m.name.toLowerCase() === searchQuery.trim().toLowerCase()) && (
                            <div
                              onClick={() => handleCreateNewMedicineInline(idx, searchQuery)}
                              style={{
                                padding: '0.6rem 0.8rem',
                                borderBottom: '1px solid var(--border-color)',
                                cursor: 'pointer',
                                background: 'rgba(2, 132, 199, 0.08)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(2, 132, 199, 0.15)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(2, 132, 199, 0.08)'}
                            >
                              <Sparkles size={15} style={{ color: '#0284c7' }} />
                              <div>
                                <div style={{ fontWeight: '700', color: '#0284c7', fontSize: '0.82rem' }}>
                                  + Create & Catalog new medicine: "{searchQuery.trim()}"
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                  Will automatically be saved to Medicine Master on bill save
                                </div>
                              </div>
                            </div>
                          )}

                          {filteredMedicines.map(med => (
                            <div
                              key={med.id}
                              onClick={() => handleSelectExistingMedicine(idx, med)}
                              style={{ padding: '0.55rem 0.8rem', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '0.8rem' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{med.name}</span>
                                <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: '600' }}>Stock: {med.totalStock ?? 0}</span>
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                {med.genericName ? `${med.genericName} • ` : ''}SKU: {med.sku} • GST: {med.gstRate}%
                              </div>
                            </div>
                          ))}

                          {filteredMedicines.length === 0 && searchQuery.trim().length === 0 && (
                            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              No medicines in catalog yet. Type a medicine name above to create one!
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Pack */}
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      <input
                        type="text"
                        value={row.pack}
                        placeholder="10 TAB"
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#0284c7', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Layers size={14} /> Active Item Inspection HUD (Row #{activeRowIndex + 1})
              </div>
              {activeRow?.isNewCatalog && (
                <span style={{ fontSize: '0.72rem', background: 'rgba(2, 132, 199, 0.15)', color: '#0284c7', border: '1px solid #0284c7', padding: '2px 8px', borderRadius: '4px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Sparkles size={11} /> Will Auto-Catalog to Master
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', fontSize: '0.85rem' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Item : </span>
                <strong style={{ color: 'var(--text-primary)' }}>{activeRow?.medicineName || '—'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Batch : </span>
                <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{activeRow?.batchNumber || '—'}</strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Generic/Salt : </span>
                <input
                  type="text"
                  placeholder="e.g. Paracetamol"
                  value={activeRow?.genericName || ''}
                  onChange={e => handleRowChange(activeRowIndex, 'genericName', e.target.value)}
                  style={{ width: '130px', padding: '0.2rem 0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', marginLeft: '0.3rem', fontSize: '0.8rem' }}
                />
              </div>

              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Manufacturer : </span>
                <input
                  type="text"
                  placeholder="e.g. Cipla / Sun"
                  value={activeRow?.manufacturer || ''}
                  onChange={e => handleRowChange(activeRowIndex, 'manufacturer', e.target.value)}
                  style={{ width: '130px', padding: '0.2rem 0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', marginLeft: '0.3rem', fontSize: '0.8rem' }}
                />
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
                <span>{roundOff > 0 ? `+ ₹${roundOff.toFixed(2)}` : `- ₹${Math.abs(roundOff).toFixed(2)}`}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '0.6rem', marginTop: '0.2rem', fontSize: '1.1rem', fontWeight: '800', color: '#0284c7' }}>
              <span>NET PAYABLE :</span>
              <span>₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Details */}
          <div style={{ marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px dashed var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                MODE :
              </label>
              <select
                value={paymentMode}
                onChange={e => setPaymentMode(e.target.value as any)}
                style={{ width: '100%', padding: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
              >
                <option value="CREDIT">CREDIT (Pay Later)</option>
                <option value="CASH">CASH</option>
                <option value="BANK_TRANSFER">BANK TRANSFER</option>
                <option value="UPI">UPI</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                PAID AMOUNT (₹) :
              </label>
              <input
                type="number"
                step="0.01"
                value={paidAmount}
                onChange={e => setPaidAmount(e.target.value)}
                style={{ width: '100%', padding: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '700', fontSize: '0.85rem' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Add Medicine Modal */}
      {showAddMedicineModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            padding: '1.5rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.4)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ padding: '0.4rem', borderRadius: '8px', background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7' }}>
                  <PlusCircle size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>Quick Add Medicine to Catalog</h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Creates master entry & binds to current purchase row</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddMedicineModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleQuickAddMedicineSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    MEDICINE NAME *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Augmentin 625 Duo Tablet"
                    value={newMedForm.name}
                    onChange={e => setNewMedForm({ ...newMedForm, name: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '700' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    COMPOSITION / SALT
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Amoxycillin & Clavulanate"
                    value={newMedForm.genericName}
                    onChange={e => setNewMedForm({ ...newMedForm, genericName: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    MANUFACTURER / COMPANY
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GSK / Sun Pharma"
                    value={newMedForm.manufacturer}
                    onChange={e => setNewMedForm({ ...newMedForm, manufacturer: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    UNIT & PACK SIZE
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                    <select
                      value={newMedForm.unit}
                      onChange={e => setNewMedForm({ ...newMedForm, unit: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                    >
                      <option value="STRIP">STRIP</option>
                      <option value="TAB">TAB</option>
                      <option value="CAP">CAP</option>
                      <option value="BOTTLE">BOTTLE</option>
                      <option value="VIAL">VIAL</option>
                      <option value="TUBE">TUBE</option>
                      <option value="BOX">BOX</option>
                    </select>
                    <input
                      type="number"
                      min="1"
                      placeholder="Units"
                      value={newMedForm.conversionFactor}
                      onChange={e => setNewMedForm({ ...newMedForm, conversionFactor: parseInt(e.target.value) || 1 })}
                      style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    HSN CODE & GST %
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                    <input
                      type="text"
                      value={newMedForm.hsnCode}
                      onChange={e => setNewMedForm({ ...newMedForm, hsnCode: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                    />
                    <select
                      value={newMedForm.gstRate}
                      onChange={e => setNewMedForm({ ...newMedForm, gstRate: parseFloat(e.target.value) })}
                      style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                    >
                      <option value={0}>0%</option>
                      <option value={5}>5%</option>
                      <option value={12}>12%</option>
                      <option value={18}>18%</option>
                      <option value={28}>28%</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    DEFAULT P.RATE (PTR ₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newMedForm.defaultPtr}
                    onChange={e => setNewMedForm({ ...newMedForm, defaultPtr: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    DEFAULT M.R.P. (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newMedForm.defaultMrp}
                    onChange={e => setNewMedForm({ ...newMedForm, defaultMrp: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAddMedicineModal(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingNewMed}
                  style={{
                    padding: '0.55rem 1.2rem',
                    background: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '700',
                    cursor: savingNewMed ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.85rem'
                  }}
                >
                  <Save size={15} /> {savingNewMed ? 'Saving...' : 'Add to Catalog & Use'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

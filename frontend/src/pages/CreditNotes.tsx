import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { getLocalDateString } from '../utils/dateUtils';
import { numberToIndianWords } from '../utils/numberToWords';
import { getCompanySettings } from '../utils/companySettings';

import {
  FileText,
  Plus,
  Search,
  Printer,
  Edit2,
  Trash2,
  RotateCcw,
  Truck,
  CheckCircle2,
  AlertCircle,
  X,
  Layers,
  IndianRupee,
  Check,
  Building2,
  ChevronDown,
  ChevronRight,
  Eye
} from 'lucide-react';

interface SupplierParty {
  id: string;
  name: string;
  mailTo?: string | null;
  phone?: string | null;
  gstin?: string | null;
  station?: string | null;
  outstandingBalance?: number;
}

interface MedicineBatch {
  id: string;
  batchNumber: string;
  expiryDate: string;
  mrp: number;
  ptr?: number;
  currentStock: number;
}

interface MedicineItem {
  id: string;
  name: string;
  genericName?: string;
  sku: string;
  unit: string;
  conversionFactor: number;
  gstRate?: number;
  batches?: MedicineBatch[];
}

interface CNLineItem {
  id?: string;
  itemId: string;
  medicineName: string;
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  pack: string;
  conversionFactor: number;
  strips: number;
  looseQty: number;
  quantity: number; // base units
  returnRate: number;
  mrp: number;
  gstRate: number;
  taxableValue: number;
  gstAmount: number;
  totalAmount: number;
  maxAvailableStock?: number;
}

export interface CreditNoteRecord {
  id: string;
  returnNumber: string;
  returnDate: string;
  supplierId: string;
  supplierName: string;
  supplierGstin?: string | null;
  supplierPhone?: string | null;
  supplierDrugLicenseNo?: string | null;
  subtotal: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  reason?: string;
  notes?: string;
  itemCount: number;
  items: Array<{
    id: string;
    itemId?: string;
    batchId?: string;
    medicineName: string;
    sku: string;
    batchNumber: string;
    expiryDate: string;
    pack: string;
    strips: number;
    looseQty: number;
    quantity: number;
    returnRate: number;
    mrp: number;
    taxableValue: number;
    gstRate: number;
    gstAmount: number;
    totalAmount: number;
  }>;
  createdBy: string;
  createdAt: string;
}

export default function CreditNotes() {
  const { activeCompany } = useAuth();
  const [creditNotes, setCreditNotes] = useState<CreditNoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Expanded row states for inline accordion
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  // Modals
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editingCNId, setEditingCNId] = useState<string | null>(null);
  const [viewingCN, setViewingCN] = useState<CreditNoteRecord | null>(null);
  const [deleteConfirmCN, setDeleteConfirmCN] = useState<CreditNoteRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form State
  const [suppliers, setSuppliers] = useState<SupplierParty[]>([]);
  const [catalogMedicines, setCatalogMedicines] = useState<MedicineItem[]>([]);
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formReturnDate, setFormReturnDate] = useState(getLocalDateString());
  const [formReason, setFormReason] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<CNLineItem[]>([]);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Settings for branding & stamp
  const compSettings = useMemo(() => getCompanySettings(activeCompany?.id || '', activeCompany), [activeCompany]);

  // Apply print engine class when viewing a credit note slip
  useEffect(() => {
    if (viewingCN) {
      document.body.classList.add('credit-note-open');
      return () => {
        document.body.classList.remove('credit-note-open');
      };
    }
  }, [viewingCN]);

  // Medicine Picker Search within Modal
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [selectedMedToAdd, setSelectedMedToAdd] = useState<MedicineItem | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [tempStrips, setTempStrips] = useState<number>(1);
  const [tempLoose, setTempLoose] = useState<number>(0);
  const [tempRate, setTempRate] = useState<number>(0);
  const [tempGstRate, setTempGstRate] = useState<number>(5);

  useEffect(() => {
    if (activeCompany) {
      fetchCreditNotes();
      fetchMasterData();
    }
  }, [activeCompany?.id]);

  const fetchCreditNotes = async () => {
    if (!activeCompany) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<{ returns: CreditNoteRecord[] }>('/api/purchase-returns', {
        companyId: activeCompany.id
      });
      setCreditNotes(res.returns || []);
    } catch (err: any) {
      console.error('Failed to fetch credit notes:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load credit notes');
    } finally {
      setLoading(false);
    }
  };

  const fetchMasterData = async () => {
    if (!activeCompany) return;
    try {
      const [partiesRes, itemsRes] = await Promise.all([
        api.get<{ parties: any[] }>('/api/parties?type=SUPPLIER', { companyId: activeCompany.id }),
        api.get<{ items: MedicineItem[] }>('/api/items?limit=2500', { companyId: activeCompany.id })
      ]);
      setSuppliers(partiesRes.parties || []);
      setCatalogMedicines(itemsRes.items || []);
    } catch (err) {
      console.error('Failed to load master suppliers or items:', err);
    }
  };

  const toggleExpand = (cnId: string) => {
    setExpandedNotes(prev => ({
      ...prev,
      [cnId]: !prev[cnId]
    }));
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingCNId(null);
    setFormSupplierId(suppliers.length > 0 ? suppliers[0].id : '');
    setFormReturnDate(getLocalDateString());
    setFormReason('');
    setFormNotes('');
    setFormItems([]);
    resetMedicinePicker();
    setShowEditorModal(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = async (cn: CreditNoteRecord) => {
    try {
      setEditingCNId(cn.id);
      setFormSupplierId(cn.supplierId);
      setFormReturnDate(cn.returnDate ? getLocalDateString(new Date(cn.returnDate)) : getLocalDateString());
      setFormReason(cn.reason || '');
      setFormNotes(cn.notes || '');

      // Map existing lines
      const mappedLines: CNLineItem[] = cn.items.map(i => {
        const factor = 10;
        return {
          id: i.id,
          itemId: i.itemId || '',
          medicineName: i.medicineName,
          batchId: i.batchId || '',
          batchNumber: i.batchNumber,
          expiryDate: i.expiryDate ? i.expiryDate.split('T')[0] : '',
          pack: i.pack || '1*10',
          conversionFactor: factor,
          strips: i.strips,
          looseQty: i.looseQty,
          quantity: i.quantity,
          returnRate: i.returnRate,
          mrp: i.mrp,
          gstRate: i.gstRate,
          taxableValue: i.taxableValue,
          gstAmount: i.gstAmount,
          totalAmount: i.totalAmount
        };
      });

      setFormItems(mappedLines);
      resetMedicinePicker();
      setShowEditorModal(true);
    } catch (err: any) {
      setError('Failed to load credit note for editing');
    }
  };

  const resetMedicinePicker = () => {
    setItemSearchQuery('');
    setSelectedMedToAdd(null);
    setSelectedBatchId('');
    setTempStrips(1);
    setTempLoose(0);
    setTempRate(0);
    setTempGstRate(5);
  };

  const handleSelectMedForPicker = async (med: MedicineItem) => {
    setSelectedMedToAdd(med);
    setItemSearchQuery('');

    // Fetch full batch details
    try {
      const res = await api.get<{ item: MedicineItem }>(`/api/items/${med.id}`, {
        companyId: activeCompany?.id
      });
      const fullMed = res.item || med;
      setSelectedMedToAdd(fullMed);

      if (fullMed.batches && fullMed.batches.length > 0) {
        const firstB = fullMed.batches[0];
        setSelectedBatchId(firstB.id);
        const rate = Number(firstB.ptr) || Number(firstB.mrp) || 0;
        setTempRate(rate);
      } else {
        setSelectedBatchId('');
        setTempRate(0);
      }
      setTempGstRate(Number(fullMed.gstRate || 5));
      setTempStrips(1);
      setTempLoose(0);
    } catch (e) {
      console.warn('Failed to load full item batches', e);
    }
  };

  const handleAddLineItem = () => {
    if (!selectedMedToAdd) return;
    const batch = selectedMedToAdd.batches?.find(b => b.id === selectedBatchId);
    if (!batch) {
      alert('Please select a valid batch for this medicine');
      return;
    }

    const factor = selectedMedToAdd.conversionFactor || 1;
    const strips = Math.max(0, parseInt(String(tempStrips || 0)) || 0);
    const loose = Math.max(0, parseInt(String(tempLoose || 0)) || 0);
    const totalUnits = (strips * factor) + loose;

    if (totalUnits <= 0) {
      alert('Please enter a return quantity greater than 0');
      return;
    }

    const rate = Math.max(0, parseFloat(String(tempRate || 0)) || 0);
    const lineTaxable = Math.round(((strips * rate) + (loose * (rate / factor))) * 100) / 100;
    const lineGst = Math.round(((lineTaxable * tempGstRate) / 100) * 100) / 100;
    const lineTotal = Math.round((lineTaxable + lineGst) * 100) / 100;

    const newLine: CNLineItem = {
      itemId: selectedMedToAdd.id,
      medicineName: selectedMedToAdd.name,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate ? batch.expiryDate.split('T')[0] : '',
      pack: factor > 1 ? `1*${factor}` : selectedMedToAdd.unit,
      conversionFactor: factor,
      strips,
      looseQty: loose,
      quantity: totalUnits,
      returnRate: rate,
      mrp: Number(batch.mrp || 0),
      gstRate: tempGstRate,
      taxableValue: lineTaxable,
      gstAmount: lineGst,
      totalAmount: lineTotal,
      maxAvailableStock: batch.currentStock
    };

    setFormItems(prev => [...prev, newLine]);
    resetMedicinePicker();
  };

  const handleRemoveLineItem = (idx: number) => {
    setFormItems(prev => prev.filter((_, i) => i !== idx));
  };

  // Submit Create or Edit
  const handleSubmitCN = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany) return;
    if (!formSupplierId) {
      setError('Please select a supplier / distributor');
      return;
    }
    if (formItems.length === 0) {
      setError('Please add at least one returned medicine item');
      return;
    }

    try {
      setFormSubmitting(true);
      setError(null);

      const payload = {
        supplierId: formSupplierId,
        partyId: formSupplierId,
        returnDate: formReturnDate,
        reason: formReason.trim() || undefined,
        notes: formNotes.trim() || undefined,
        items: formItems.map(item => ({
          itemId: item.itemId,
          batchId: item.batchId,
          strips: item.strips,
          looseQty: item.looseQty,
          returnRate: item.returnRate,
          gstRate: item.gstRate
        }))
      };

      if (editingCNId) {
        // Edit existing
        await api.put(`/api/purchase-returns/${editingCNId}`, payload, {
          companyId: activeCompany.id
        });
        setSuccessMsg(`✓ Credit Note #${editingCNId} updated successfully!`);
      } else {
        // Create new
        const res = await api.post<{ purchaseReturn: any }>('/api/purchase-returns', payload, {
          companyId: activeCompany.id
        });
        setSuccessMsg(`✓ Credit Note #${res.purchaseReturn.returnNumber} generated successfully!`);
      }

      setShowEditorModal(false);
      fetchCreditNotes();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error('Failed to save credit note:', err);
      setError(err.response?.data?.error || err.message || 'Failed to save credit note');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Delete / Cancel CN
  const handleConfirmDeleteCN = async () => {
    if (!activeCompany || !deleteConfirmCN) return;
    try {
      setDeleting(true);
      await api.delete(`/api/purchase-returns/${deleteConfirmCN.id}`, {
        companyId: activeCompany.id
      });
      setSuccessMsg(`✓ Credit Note #${deleteConfirmCN.returnNumber} was deleted and stock was restored to inventory.`);
      setDeleteConfirmCN(null);
      fetchCreditNotes();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error('Failed to delete credit note:', err);
      setError(err.response?.data?.error || err.message || 'Failed to delete credit note');
    } finally {
      setDeleting(false);
    }
  };

  // Calculations for Form
  const formTaxableSum = formItems.reduce((s, i) => s + i.taxableValue, 0);
  const formGstSum = formItems.reduce((s, i) => s + i.gstAmount, 0);
  const formGrandTotal = formTaxableSum + formGstSum;

  // Filtered List
  const filteredCNs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return creditNotes;
    return creditNotes.filter(cn =>
      cn.returnNumber.toLowerCase().includes(q) ||
      cn.supplierName.toLowerCase().includes(q) ||
      (cn.supplierGstin && cn.supplierGstin.toLowerCase().includes(q)) ||
      (cn.reason && cn.reason.toLowerCase().includes(q)) ||
      cn.items.some(i => i.medicineName.toLowerCase().includes(q) || i.batchNumber.toLowerCase().includes(q))
    );
  }, [creditNotes, search]);

  const totalCNsCount = creditNotes.length;
  const totalCNValue = creditNotes.reduce((s, cn) => s + cn.totalAmount, 0);
  const totalUnitsReturned = creditNotes.reduce(
    (s, cn) => s + cn.items.reduce((sub, i) => sub + i.quantity, 0),
    0
  );

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
            <RotateCcw style={{ color: '#6366f1' }} /> Credit Notes & Supplier Returns (CN)
          </h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Manage distributor returns, debits, stock reconciliations, and voucher printouts.
          </div>
        </div>

        <button
          onClick={handleOpenCreateModal}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.65rem 1.25rem',
            background: '#4f46e5',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)'
          }}
        >
          <Plus size={16} /> Create New CN (Supplier Return)
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '0.8rem 1.2rem', borderRadius: '8px', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
          <CheckCircle2 size={18} color="#10b981" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #ef4444', color: '#991b1b', padding: '0.8rem 1.2rem', borderRadius: '8px', marginBottom: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* 3 Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.15rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 700 }}>
            <span>Total Credit Notes</span>
            <FileText size={18} style={{ color: '#6366f1' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.4rem' }}>
            {totalCNsCount} Vouchers
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Issued to distributors / wholesalers
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: '12px', padding: '1.15rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#4f46e5', fontSize: '0.82rem', fontWeight: 700 }}>
            <span>Total Returned Value (Debited)</span>
            <IndianRupee size={18} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4f46e5', marginTop: '0.4rem' }}>
            ₹{totalCNValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Credited against supplier payables
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.15rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 700 }}>
            <span>Stock Units Returned</span>
            <Layers size={18} style={{ color: '#10b981' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981', marginTop: '0.4rem' }}>
            {totalUnitsReturned} units
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Deducted out of batch inventory
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '380px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by CN #, Supplier, Medicine, GSTIN..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '0.65rem 0.8rem 0.65rem 2.4rem',
              background: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.85rem'
            }}
          />
        </div>
      </div>

      {/* Credit Notes Table */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading credit notes and supplier returns...
          </div>
        ) : filteredCNs.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <RotateCcw size={42} style={{ opacity: 0.3, marginBottom: '0.8rem', color: '#6366f1' }} />
            <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem' }}>No Credit Notes / Supplier Returns Found</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              Click <strong>"+ Create New CN"</strong> to return medicines to distributors and debit ledger balances.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.9rem 1rem', width: '36px' }}></th>
                  <th style={{ padding: '0.9rem 1rem' }}>CN Number</th>
                  <th style={{ padding: '0.9rem 1rem' }}>Return Date</th>
                  <th style={{ padding: '0.9rem 1rem' }}>Supplier / Wholesaler</th>
                  <th style={{ padding: '0.9rem 1rem' }}>Medicines Summary</th>
                  <th style={{ padding: '0.9rem 1rem', textAlign: 'center' }}>Total Qty</th>
                  <th style={{ padding: '0.9rem 1rem', textAlign: 'right' }}>Taxable (₹)</th>
                  <th style={{ padding: '0.9rem 1rem', textAlign: 'right' }}>Total Credit (₹)</th>
                  <th style={{ padding: '0.9rem 1rem' }}>Reason</th>
                  <th style={{ padding: '0.9rem 1rem', textAlign: 'center', minWidth: '180px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCNs.map(cn => {
                  const isExpanded = !!expandedNotes[cn.id];
                  const itemCount = cn.items.length;
                  const totalUnits = cn.items.reduce((acc, curr) => acc + curr.quantity, 0);

                  return (
                    <React.Fragment key={cn.id}>
                      <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border-color)', background: isExpanded ? 'rgba(99, 102, 241, 0.04)' : 'transparent' }}>
                        <td style={{ padding: '0.9rem 0.6rem 0.9rem 1rem', textAlign: 'center' }}>
                          <button
                            onClick={() => toggleExpand(cn.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: isExpanded ? '#4f46e5' : 'var(--text-muted)', padding: '2px', display: 'inline-flex', alignItems: 'center' }}
                            title={isExpanded ? 'Collapse items' : 'Expand items'}
                          >
                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </button>
                        </td>
                        <td style={{ padding: '0.9rem 1rem', fontWeight: 800, color: '#4f46e5', fontFamily: 'monospace' }}>
                          {cn.returnNumber}
                        </td>
                        <td style={{ padding: '0.9rem 1rem', color: 'var(--text-secondary)' }}>
                          <div>{new Date(cn.returnDate).toLocaleDateString('en-IN')}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{new Date(cn.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td style={{ padding: '0.9rem 1rem' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{cn.supplierName}</div>
                          {cn.supplierGstin && (
                            <div style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 600 }}>GSTIN: {cn.supplierGstin}</div>
                          )}
                        </td>
                        <td style={{ padding: '0.9rem 1rem', maxWidth: '280px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {cn.items.slice(0, 2).map((itm, i) => (
                              <div key={i} style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{itm.medicineName}</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--brand-teal)' }}>({itm.batchNumber})</span>
                              </div>
                            ))}
                            {itemCount > 2 && (
                              <button
                                onClick={() => toggleExpand(cn.id)}
                                style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', textAlign: 'left', padding: 0 }}
                              >
                                +{itemCount - 2} more medicines (click to view)
                              </button>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '0.9rem 1rem', textAlign: 'center' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{itemCount} {itemCount === 1 ? 'item' : 'items'}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({totalUnits} units)</div>
                        </td>
                        <td style={{ padding: '0.9rem 1rem', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          ₹{cn.taxableAmount.toFixed(2)}
                        </td>
                        <td style={{ padding: '0.9rem 1rem', textAlign: 'right', fontWeight: 800, color: '#4f46e5', fontSize: '0.95rem' }}>
                          ₹{cn.totalAmount.toFixed(2)}
                        </td>
                        <td style={{ padding: '0.9rem 1rem', color: 'var(--text-secondary)', maxWidth: '180px' }}>
                          <span style={{ fontSize: '0.8rem' }}>{cn.reason || 'Supplier Return'}</span>
                        </td>
                        <td style={{ padding: '0.9rem 1rem', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              onClick={() => setViewingCN(cn)}
                              style={{
                                padding: '5px 9px',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.78rem',
                                fontWeight: 600
                              }}
                              title="Print / View Voucher"
                            >
                              <Printer size={13} /> Slip
                            </button>

                            <button
                              onClick={() => handleOpenEditModal(cn)}
                              style={{
                                padding: '5px 9px',
                                background: 'rgba(99, 102, 241, 0.1)',
                                border: '1px solid rgba(99, 102, 241, 0.3)',
                                borderRadius: '6px',
                                color: '#4f46e5',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.78rem',
                                fontWeight: 600
                              }}
                              title="Modify / Edit Credit Note"
                            >
                              <Edit2 size={13} /> Edit
                            </button>

                            <button
                              onClick={() => setDeleteConfirmCN(cn)}
                              style={{
                                padding: '5px 8px',
                                background: 'rgba(239, 68, 68, 0.08)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                borderRadius: '6px',
                                color: '#ef4444',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.78rem',
                                fontWeight: 600
                              }}
                              title="Cancel / Delete Credit Note"
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Itemized Breakdown Table */}
                      {isExpanded && (
                        <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                          <td colSpan={10} style={{ padding: '0.8rem 1.2rem 1.2rem 2.8rem' }}>
                            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                              <div style={{ padding: '0.5rem 0.8rem', background: 'rgba(99, 102, 241, 0.06)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4f46e5' }}>
                                  Returned Medicines in CN #{cn.returnNumber} ({itemCount} Medicines)
                                </span>
                                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                  Logged by {cn.createdBy}
                                </span>
                              </div>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left', fontSize: '0.74rem' }}>
                                    <th style={{ padding: '0.5rem 0.8rem', width: '30px' }}>#</th>
                                    <th style={{ padding: '0.5rem 0.8rem' }}>Medicine Name</th>
                                    <th style={{ padding: '0.5rem 0.8rem' }}>Batch #</th>
                                    <th style={{ padding: '0.5rem 0.8rem' }}>Expiry</th>
                                    <th style={{ padding: '0.5rem 0.8rem', textAlign: 'center' }}>Pack</th>
                                    <th style={{ padding: '0.5rem 0.8rem', textAlign: 'center' }}>Qty (Str + Tab)</th>
                                    <th style={{ padding: '0.5rem 0.8rem', textAlign: 'center' }}>Total Units</th>
                                    <th style={{ padding: '0.5rem 0.8rem', textAlign: 'right' }}>Rate / Strip</th>
                                    <th style={{ padding: '0.5rem 0.8rem', textAlign: 'center' }}>GST%</th>
                                    <th style={{ padding: '0.5rem 0.8rem', textAlign: 'right' }}>Total (₹)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cn.items.map((itm, idx) => (
                                    <tr key={itm.id || idx} style={{ borderBottom: idx === cn.items.length - 1 ? 'none' : '1px solid var(--border-color)' }}>
                                      <td style={{ padding: '0.5rem 0.8rem', color: 'var(--text-muted)' }}>{idx + 1}</td>
                                      <td style={{ padding: '0.5rem 0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {itm.medicineName}
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SKU: {itm.sku}</div>
                                      </td>
                                      <td style={{ padding: '0.5rem 0.8rem', fontFamily: 'monospace', fontWeight: 600 }}>{itm.batchNumber}</td>
                                      <td style={{ padding: '0.5rem 0.8rem', color: 'var(--text-secondary)' }}>
                                        {itm.expiryDate ? new Date(itm.expiryDate).toLocaleDateString('en-IN') : 'N/A'}
                                      </td>
                                      <td style={{ padding: '0.5rem 0.8rem', textAlign: 'center' }}>{itm.pack}</td>
                                      <td style={{ padding: '0.5rem 0.8rem', textAlign: 'center', fontWeight: 600 }}>
                                        {itm.strips > 0 && itm.looseQty > 0
                                          ? `${itm.strips} Str + ${itm.looseQty} Tab`
                                          : itm.strips > 0
                                          ? `${itm.strips} Strip(s)`
                                          : `${itm.looseQty} Tab(s)`}
                                      </td>
                                      <td style={{ padding: '0.5rem 0.8rem', textAlign: 'center', color: '#10b981', fontWeight: 700 }}>
                                        -{itm.quantity} units
                                      </td>
                                      <td style={{ padding: '0.5rem 0.8rem', textAlign: 'right' }}>₹{itm.returnRate.toFixed(2)}</td>
                                      <td style={{ padding: '0.5rem 0.8rem', textAlign: 'center' }}>{itm.gstRate}%</td>
                                      <td style={{ padding: '0.5rem 0.8rem', textAlign: 'right', fontWeight: 700, color: '#4f46e5' }}>
                                        ₹{itm.totalAmount.toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr style={{ background: 'var(--bg-secondary)', fontWeight: 700, borderTop: '1px solid var(--border-color)' }}>
                                    <td colSpan={6} style={{ padding: '0.5rem 0.8rem', textAlign: 'right' }}>Voucher Total:</td>
                                    <td style={{ padding: '0.5rem 0.8rem', textAlign: 'center', color: '#10b981' }}>-{totalUnits} units</td>
                                    <td colSpan={2}></td>
                                    <td style={{ padding: '0.5rem 0.8rem', textAlign: 'right', color: '#4f46e5', fontSize: '0.9rem' }}>
                                      ₹{cn.totalAmount.toFixed(2)}
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

      {/* CREATE / EDIT CREDIT NOTE MODAL */}
      {showEditorModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 300, padding: '1rem' }}>
          <div className="modal-card" style={{ background: '#ffffff', color: '#0f172a', borderRadius: '12px', width: '100%', maxWidth: '900px', maxHeight: 'min(92vh, 92dvh)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', padding: '1.2rem 1.5rem', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ background: '#4f46e5', color: '#fff', padding: '6px', borderRadius: '6px' }}>
                  <RotateCcw size={18} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                    {editingCNId ? `Modify / Edit Credit Note #${editingCNId}` : 'Create New Supplier Credit Note (Debit Return)'}
                  </h2>
                  <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                    Select supplier, pick medicines & batches, and outward return stock with debit ledger adjustment.
                  </div>
                </div>
              </div>
              <button onClick={() => setShowEditorModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitCN} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, overflow: 'hidden', margin: 0 }}>
              <div className="modal-body" style={{ flex: '1 1 auto', overflowY: 'auto', padding: '1.5rem' }}>
              {/* Supplier & Date Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                    Supplier / Wholesaler *
                  </label>
                  <select
                    value={formSupplierId}
                    onChange={e => setFormSupplierId(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      height: '42px',
                      boxSizing: 'border-box',
                      padding: '8px 12px',
                      border: '1.5px solid #0f766e',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      background: '#ffffff',
                      color: '#0f172a'
                    }}
                  >
                    <option value="">-- Select Supplier --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.station ? `(${s.station})` : ''} {s.gstin ? `[GSTIN: ${s.gstin}]` : ''} — Bal: ₹{Number(s.outstandingBalance || 0).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                    Return Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formReturnDate}
                    onChange={e => setFormReturnDate(e.target.value)}
                    style={{
                      width: '100%',
                      height: '42px',
                      boxSizing: 'border-box',
                      padding: '8px 12px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '0.88rem',
                      background: '#ffffff'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                  Return Reason / Remarks <span style={{ fontWeight: 500, color: '#64748b' }}>(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Expired lot return, damaged stock, excess return (Optional)"
                  value={formReason}
                  onChange={e => setFormReason(e.target.value)}
                  style={{
                    width: '100%',
                    height: '42px',
                    boxSizing: 'border-box',
                    padding: '8px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    background: '#ffffff'
                  }}
                />
              </div>

              {/* Medicine Picker Section */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#4f46e5', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
                  + Add Medicine Item to Return:
                </div>

                {!selectedMedToAdd ? (
                  <div>
                    <div style={{ position: 'relative' }}>
                      <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#6366f1' }} />
                      <input
                        type="text"
                        placeholder="Search catalog medicine by name or SKU..."
                        value={itemSearchQuery}
                        onChange={e => setItemSearchQuery(e.target.value)}
                        style={{ width: '100%', padding: '0.6rem 0.8rem 0.6rem 2.2rem', border: '1.5px solid #cbd5e1', borderRadius: '6px', fontSize: '0.88rem' }}
                      />
                    </div>
                    {itemSearchQuery.trim().length > 0 && (
                      <div style={{ maxHeight: '160px', overflowY: 'auto', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', marginTop: '4px' }}>
                        {catalogMedicines
                          .filter(m => m.name.toLowerCase().includes(itemSearchQuery.toLowerCase()) || (m.genericName && m.genericName.toLowerCase().includes(itemSearchQuery.toLowerCase())))
                          .slice(0, 15)
                          .map(m => (
                            <div
                              key={m.id}
                              onClick={() => handleSelectMedForPicker(m)}
                              style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                              <div>
                                <strong style={{ color: '#0f172a' }}>{m.name}</strong>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '6px' }}>{m.genericName || ''}</span>
                              </div>
                              <span style={{ fontSize: '0.75rem', color: '#4f46e5', fontWeight: 600 }}>{m.batches?.length || 0} batches</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '6px', padding: '6px 10px', marginBottom: '0.8rem' }}>
                      <div>
                        <strong style={{ color: '#312e81' }}>{selectedMedToAdd.name}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#6366f1', marginLeft: '6px' }}>
                          Pack: 1 Strip = {selectedMedToAdd.conversionFactor || 1} Tabs
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={resetMedicinePicker}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                      >
                        ✕ Change Medicine
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 2.2fr) minmax(75px, 0.8fr) minmax(75px, 0.8fr) minmax(110px, 1fr) minmax(75px, 0.8fr) auto', gap: '8px', alignItems: 'flex-end' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '2px' }}>
                          Batch *
                        </label>
                        <select
                          value={selectedBatchId}
                          onChange={e => {
                            const bId = e.target.value;
                            setSelectedBatchId(bId);
                            const foundB = selectedMedToAdd.batches?.find(b => b.id === bId);
                            if (foundB) {
                              setTempRate(Number(foundB.ptr) || Number(foundB.mrp) || 0);
                            }
                          }}
                          style={{
                            width: '100%',
                            height: '40px',
                            boxSizing: 'border-box',
                            padding: '4px 8px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            background: '#ffffff'
                          }}
                        >
                          {selectedMedToAdd.batches && selectedMedToAdd.batches.length > 0 ? (
                            selectedMedToAdd.batches.map(b => {
                              const expDateFormatted = b.expiryDate
                                ? new Date(b.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
                                : 'N/A';
                              return (
                                <option key={b.id} value={b.id}>
                                  Batch: {b.batchNumber} • Exp: {expDateFormatted} • Stk: {b.currentStock}
                                </option>
                              );
                            })
                          ) : (
                            <option value="">No stock batches</option>
                          )}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '2px' }}>
                          Strips
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={tempStrips}
                          onChange={e => setTempStrips(parseInt(e.target.value) || 0)}
                          style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'center', fontWeight: 700 }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '2px' }}>
                          Loose Tabs
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={tempLoose}
                          onChange={e => setTempLoose(parseInt(e.target.value) || 0)}
                          style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'center' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '2px' }}>
                          Rate / Strip (₹)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={tempRate}
                          onChange={e => setTempRate(parseFloat(e.target.value) || 0)}
                          style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', fontWeight: 700 }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '2px' }}>
                          GST%
                        </label>
                        <input
                          type="number"
                          value={tempGstRate}
                          onChange={e => setTempGstRate(parseFloat(e.target.value) || 0)}
                          style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'center' }}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleAddLineItem}
                        style={{ padding: '0.5rem 0.9rem', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}
                      >
                        + Add Line
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Added Lines Table */}
              <div style={{ marginBottom: '1.2rem', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '0.5rem 0.8rem' }}>Medicine</th>
                      <th style={{ padding: '0.5rem 0.8rem' }}>Batch #</th>
                      <th style={{ padding: '0.5rem 0.8rem', textAlign: 'center' }}>Returned Qty</th>
                      <th style={{ padding: '0.5rem 0.8rem', textAlign: 'right' }}>Rate / Strip</th>
                      <th style={{ padding: '0.5rem 0.8rem', textAlign: 'right' }}>Taxable (₹)</th>
                      <th style={{ padding: '0.5rem 0.8rem', textAlign: 'right' }}>Total (₹)</th>
                      <th style={{ padding: '0.5rem 0.4rem', width: '30px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>
                          No medicines added to this return yet. Use the selector above to add lines.
                        </td>
                      </tr>
                    ) : (
                      formItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.5rem 0.8rem', fontWeight: 600 }}>{item.medicineName}</td>
                          <td style={{ padding: '0.5rem 0.8rem', fontFamily: 'monospace' }}>{item.batchNumber}</td>
                          <td style={{ padding: '0.5rem 0.8rem', textAlign: 'center', fontWeight: 700 }}>
                            {item.strips > 0 && item.looseQty > 0
                              ? `${item.strips} Str + ${item.looseQty} Tab`
                              : item.strips > 0
                              ? `${item.strips} Str`
                              : `${item.looseQty} Tab`} ({item.quantity} units)
                          </td>
                          <td style={{ padding: '0.5rem 0.8rem', textAlign: 'right' }}>₹{item.returnRate.toFixed(2)}</td>
                          <td style={{ padding: '0.5rem 0.8rem', textAlign: 'right' }}>₹{item.taxableValue.toFixed(2)}</td>
                          <td style={{ padding: '0.5rem 0.8rem', textAlign: 'right', fontWeight: 700, color: '#4f46e5' }}>
                            ₹{item.totalAmount.toFixed(2)}
                          </td>
                          <td style={{ padding: '0.5rem 0.4rem', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveLineItem(idx)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {formItems.length > 0 && (
                    <tfoot>
                      <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                        <td colSpan={4} style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Total Credit Amount:</td>
                        <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>₹{formTaxableSum.toFixed(2)}</td>
                        <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', color: '#4f46e5', fontSize: '0.95rem' }}>
                          ₹{formGrandTotal.toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              </div>

              <div className="modal-footer" style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                padding: '1rem 1.5rem',
                borderTop: '1px solid #e2e8f0',
                background: '#ffffff',
                flexShrink: 0,
                position: 'sticky',
                bottom: 0,
                zIndex: 10
              }}>
                <button
                  type="button"
                  onClick={() => setShowEditorModal(false)}
                  style={{ padding: '0.65rem 1.2rem', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting || formItems.length === 0}
                  style={{ padding: '0.65rem 1.4rem', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {formSubmitting ? 'Saving...' : editingCNId ? 'Save CN Changes' : 'Confirm & Generate CN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── PROFESSIONAL A4 PURCHASE RETURN / DEBIT VOUCHER MODAL (ERP ENGINE) ── */}
      {viewingCN && (
        <div className="invoice-modal-backdrop" style={{
          position: 'fixed',
          inset: 0,
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                background: '#0f766e',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '4px',
                letterSpacing: '0.5px'
              }}>
                DEBIT NOTE / PURCHASE RETURN
              </span>
              <strong style={{ fontSize: '13px', color: '#0f172a' }}>#{viewingCN.returnNumber}</strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={() => setViewingCN(null)}
                style={{
                  padding: '6px 14px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '12px',
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  padding: '6px 16px',
                  background: '#0f766e',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(15,118,110,0.3)'
                }}
              >
                <Printer size={15} /> Print Debit Voucher
              </button>
            </div>
          </div>

          {/* ── PRINTABLE SHEET CONTAINER (MATCHES TAX INVOICE PRINT ENGINE) ── */}
          <div id="printable-credit-note" className="credit-note-print-container" style={{
            width: '100%',
            maxWidth: '210mm',
            boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
            borderRadius: '2px',
            background: '#ffffff'
          }}>
            <div className="credit-note-sheet" style={{
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
              breakInside: 'avoid'
            }}>
              {/* ── TOP 3-BOX ERP HEADER ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '37% 33% 30%', borderBottom: '1.5px solid #000000' }}>
                {/* Box 1: Left - Our Firm Details */}
                <div style={{ padding: '6px 8px', borderRight: '1.5px solid #000000', fontSize: '9.5px', lineHeight: 1.35 }}>
                  {compSettings.companyLogo && (
                    <div style={{ marginBottom: '3px' }}>
                      <img src={compSettings.companyLogo} alt="Logo" style={{ maxHeight: '32px', maxWidth: '120px', objectFit: 'contain' }} />
                    </div>
                  )}
                  <div style={{ fontSize: '13px', fontWeight: 900, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>
                    {activeCompany?.name || 'PHARMACY STORE'}
                  </div>
                  <div style={{ fontWeight: 600, color: '#111827', textTransform: 'uppercase', fontSize: '9px' }}>
                    {activeCompany?.address || 'MAIN ROAD, PHARMA MARKET'}
                  </div>
                  <div style={{ fontWeight: 600, color: '#111827', textTransform: 'uppercase', fontSize: '9px' }}>
                    {activeCompany?.city || 'LOCAL CITY'}{activeCompany?.pincode ? ` - ${activeCompany.pincode}` : ''}{activeCompany?.state ? `, ${activeCompany.state}` : ''}
                  </div>
                  <div style={{ marginTop: '2px' }}>
                    Phone : <strong style={{ fontFamily: 'monospace' }}>{activeCompany?.phone || '—'}</strong>
                  </div>
                  <div>
                    D.L.No. : <strong style={{ fontFamily: 'monospace' }}>
                      {compSettings.dl20b ? `${compSettings.dl20b}${compSettings.dl21b ? `, ${compSettings.dl21b}` : ''}` : (activeCompany?.drugLicenseNo || '20B-194000, 21B-194001')}
                    </strong>
                  </div>
                  <div style={{ marginTop: '1px' }}>
                    GSTIN : <strong style={{ fontFamily: 'monospace', fontSize: '10px' }}>{activeCompany?.gstin || 'URP / UNREGISTERED'}</strong>
                  </div>
                </div>

                {/* Box 2: Middle - Banner & Voucher Meta */}
                <div style={{ borderRight: '1.5px solid #000000', display: 'flex', flexDirection: 'column' }}>
                  <div style={{
                    background: '#dbeafe',
                    borderBottom: '1.5px solid #000000',
                    textAlign: 'center',
                    padding: '3px 0',
                    fontWeight: 900,
                    fontSize: '11px',
                    letterSpacing: '0.5px',
                    color: '#1e3a8a',
                    textTransform: 'uppercase'
                  }}>
                    PURCHASE RETURN / DEBIT NOTE
                  </div>
                  <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '9px' }}>
                    <div>Debit Note No : <strong style={{ fontFamily: 'monospace', color: '#1e3a8a', fontSize: '10.5px' }}>{viewingCN.returnNumber}</strong></div>
                    <div>Return Date : <strong>{new Date(viewingCN.returnDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></div>
                    <div>Voucher Type : <strong>PURCHASE RETURN (DEBIT)</strong></div>
                    <div>Reason : <strong>{viewingCN.reason || 'Expired / Stock Reversal'}</strong></div>
                  </div>
                </div>

                {/* Box 3: Right - Supplier / Wholesaler Details */}
                <div style={{ padding: '6px 8px', fontSize: '9.5px', lineHeight: 1.35 }}>
                  <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', marginBottom: '2px' }}>
                    TO WHOLESALER / SUPPLIER:
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', color: '#000000' }}>
                    {viewingCN.supplierName}
                  </div>
                  {viewingCN.supplierPhone && <div>Phone : <strong style={{ fontFamily: 'monospace' }}>{viewingCN.supplierPhone}</strong></div>}
                  <div>
                    GSTIN : <strong style={{ fontFamily: 'monospace', fontSize: '9.5px' }}>{viewingCN.supplierGstin || 'URP / UNREGISTERED'}</strong>
                  </div>
                  <div style={{ marginTop: '2px', fontSize: '8.5px', color: '#475569' }}>
                    Mode: <strong>CREDIT NOTE / LEDGER ADJUSTMENT</strong>
                  </div>
                </div>
              </div>

              {/* ── ITEMS TABLE WITH CONTINUOUS VERTICAL LINES ── */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #000000', background: '#f8fafc', fontWeight: 800 }}>
                    <th style={{ borderRight: '1px solid #000000', padding: '4px 3px', width: '28px', textAlign: 'center' }}>S.N.</th>
                    <th style={{ borderRight: '1px solid #000000', padding: '4px 6px', textAlign: 'left' }}>Description of Returned Goods</th>
                    <th style={{ borderRight: '1px solid #000000', padding: '4px 3px', width: '50px', textAlign: 'center' }}>HSN</th>
                    <th style={{ borderRight: '1px solid #000000', padding: '4px 4px', width: '70px', textAlign: 'center' }}>Batch</th>
                    <th style={{ borderRight: '1px solid #000000', padding: '4px 3px', width: '52px', textAlign: 'center' }}>Exp</th>
                    <th style={{ borderRight: '1px solid #000000', padding: '4px 4px', width: '65px', textAlign: 'center' }}>Ret Qty</th>
                    <th style={{ borderRight: '1px solid #000000', padding: '4px 6px', width: '65px', textAlign: 'right' }}>Rate/Strip</th>
                    <th style={{ borderRight: '1px solid #000000', padding: '4px 3px', width: '45px', textAlign: 'center' }}>GST%</th>
                    <th style={{ borderRight: '1px solid #000000', padding: '4px 6px', width: '70px', textAlign: 'right' }}>Taxable</th>
                    <th style={{ padding: '4px 6px', width: '75px', textAlign: 'right' }}>Total (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingCN.items.map((itm, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #000000' }}>
                      <td style={{ borderRight: '1px solid #000000', padding: '4px 3px', textAlign: 'center' }}>{i + 1}</td>
                      <td style={{ borderRight: '1px solid #000000', padding: '4px 6px', fontWeight: 700 }}>{itm.medicineName}</td>
                      <td style={{ borderRight: '1px solid #000000', padding: '4px 3px', textAlign: 'center', fontFamily: 'monospace' }}>3004</td>
                      <td style={{ borderRight: '1px solid #000000', padding: '4px 4px', textAlign: 'center', fontFamily: 'monospace' }}>{itm.batchNumber}</td>
                      <td style={{ borderRight: '1px solid #000000', padding: '4px 3px', textAlign: 'center' }}>
                        {itm.expiryDate ? new Date(itm.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : '—'}
                      </td>
                      <td style={{ borderRight: '1px solid #000000', padding: '4px 4px', textAlign: 'center', fontWeight: 800 }}>
                        {itm.strips > 0 && itm.looseQty > 0
                          ? `${itm.strips} Str + ${itm.looseQty} Tab`
                          : itm.strips > 0
                          ? `${itm.strips} Strip`
                          : `${itm.looseQty} Tab`}
                      </td>
                      <td style={{ borderRight: '1px solid #000000', padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{itm.returnRate.toFixed(2)}</td>
                      <td style={{ borderRight: '1px solid #000000', padding: '4px 3px', textAlign: 'center' }}>{itm.gstRate || 5}%</td>
                      <td style={{ borderRight: '1px solid #000000', padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {(itm.taxableValue || (itm.totalAmount / 1.05)).toFixed(2)}
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 800, fontFamily: 'monospace' }}>
                        {itm.totalAmount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {/* Proportional filler rows */}
                  {Array.from({ length: Math.max(1, 6 - viewingCN.items.length) }).map((_, fIdx) => (
                    <tr key={`fill-${fIdx}`} style={{ borderBottom: '1px solid #e2e8f0', height: '18px' }}>
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

              {/* ── TOTAL IN WORDS BAR ── */}
              <div style={{
                borderTop: '1.5px solid #000000',
                borderBottom: '1px solid #000000',
                padding: '4px 8px',
                background: '#f8fafc',
                fontSize: '9.5px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <strong>Amount in Words:</strong> Rs. {numberToIndianWords(viewingCN.totalAmount)}
                </div>
                <div>
                  <strong>Total Return Value:</strong> ₹{viewingCN.totalAmount.toFixed(2)}
                </div>
              </div>

              {/* ── FOOTER: REMARKS, TAX BREAKDOWN & SIGNATURE ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '55% 45%', fontSize: '8.5px' }}>
                {/* Left: Remarks & Audit trail */}
                <div style={{ borderRight: '1.5px solid #000000', padding: '5px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 800, textDecoration: 'underline', marginBottom: '2px' }}>Remarks & Ledger Reversal Note</div>
                    <div style={{ color: '#1f2937' }}>• Medicine stock outwarded from batch inventory and returned to wholesaler.</div>
                    <div style={{ color: '#1f2937' }}>• Wholesaler payable ledger debited by ₹{viewingCN.totalAmount.toFixed(2)}.</div>
                    {viewingCN.reason && (
                      <div style={{ color: '#0f766e', fontWeight: 700, marginTop: '2px' }}>
                        Reason: {viewingCN.reason}
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: '14px', paddingTop: '4px', borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                      <div>Generated By: <strong>{viewingCN.createdBy || 'admin'}</strong></div>
                      <div style={{ fontSize: '7.5px', color: '#64748b' }}>TradeFlow ERP • Document verified</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: '120px' }}>
                      <div style={{ height: '24px' }}></div>
                      <div style={{ borderTop: '1px solid #000000', paddingTop: '2px', fontWeight: 700 }}>
                        Supplier's Signature / Seal
                      </div>
                    </div>
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
                    FOR {activeCompany?.name || 'PHARMACY STORE'}
                  </div>
                  <div style={{
                    minHeight: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    margin: '2px 0'
                  }}>
                    {compSettings.signatureImage ? (
                      <img
                        src={compSettings.signatureImage}
                        alt="Stamp / Mohar"
                        style={{ maxHeight: '44px', maxWidth: '140px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
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
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmCN && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 400, padding: '1rem' }}>
          <div style={{ background: '#ffffff', color: '#0f172a', borderRadius: '12px', width: '100%', maxWidth: '480px', padding: '1.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
              <div style={{ background: '#fee2e2', color: '#ef4444', padding: '8px', borderRadius: '8px' }}>
                <Trash2 size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#991b1b' }}>
                  Cancel & Delete Credit Note #{deleteConfirmCN.returnNumber}?
                </h3>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.5, margin: '0 0 1.2rem 0' }}>
              Are you sure you want to delete this supplier return voucher?
              <br /><br />
              <strong>Automated Reversal Actions:</strong>
              <br />
              • All returned medicine stock (<strong>{deleteConfirmCN.items.reduce((s, i) => s + i.quantity, 0)} units</strong>) will be restored back to your batch inventory.
              <br />
              • The supplier's outstanding balance will be restored by <strong>₹{deleteConfirmCN.totalAmount.toFixed(2)}</strong>.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setDeleteConfirmCN(null)}
                disabled={deleting}
                style={{ padding: '0.6rem 1.2rem', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
              >
                Keep Credit Note
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCN}
                disabled={deleting}
                style={{ padding: '0.6rem 1.4rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete & Restore Stock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import {
  RotateCcw,
  Search,
  Plus,
  Trash2,
  Printer,
  CheckCircle2,
  AlertCircle,
  X,
  Layers,
  Pill,
  Check
} from 'lucide-react';

export interface ReturnCartItem {
  id: string;
  batchId: string;
  itemId: string;
  medicineName: string;
  sku: string;
  batchNumber: string;
  expiryDate?: string | null;
  unit: string;
  conversionFactor: number;
  strips: number;
  looseQty: number;
  unitsToAdd: number;
  unitRetailPrice: number;
  itemRefund: number;
}

export interface MultiItemReturnSlip {
  voucherNumber: string;
  createdAt: string;
  patientName: string;
  reason: string;
  totalRefundAmount: number;
  totalUnitsAdded: number;
  createdByUser: string;
  items: Array<{
    medicineName: string;
    sku: string;
    batchNumber: string;
    expiryDate?: string | null;
    unit: string;
    conversionFactor: number;
    strips: number;
    looseQty: number;
    unitsAdded: number;
    mrp: number;
    refundAmount: number;
  }>;
}

interface MultiPatientReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (slip: MultiItemReturnSlip) => void;
}

export const MultiPatientReturnModal: React.FC<MultiPatientReturnModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { activeCompany } = useAuth();

  const [returnCart, setReturnCart] = useState<ReturnCartItem[]>([]);
  const [returnPatientName, setReturnPatientName] = useState<string>('');
  const [returnReason, setReturnReason] = useState<string>('Doctor changed medicine / prescription');
  const [customGrandTotalRefund, setCustomGrandTotalRefund] = useState<string>('');
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  // Single Item Picker inside Return Modal
  const [returnSearchQuery, setReturnSearchQuery] = useState('');
  const [returnMedicinesList, setReturnMedicinesList] = useState<any[]>([]);
  const [searchingReturnMedicines, setSearchingReturnMedicines] = useState(false);
  const [selectedReturnItem, setSelectedReturnItem] = useState<any | null>(null);
  const [selectedReturnBatch, setSelectedReturnBatch] = useState<any | null>(null);
  const [returnStrips, setReturnStrips] = useState<string>('1');
  const [returnLoose, setReturnLoose] = useState<string>('0');
  const [currentItemRefund, setCurrentItemRefund] = useState<string>('');

  // Voucher Slip View
  const [viewingSlip, setViewingSlip] = useState<MultiItemReturnSlip | null>(null);

  // Search medicines debounce
  useEffect(() => {
    if (!isOpen || !activeCompany) return;

    if (!returnSearchQuery.trim()) {
      // Load initial catalog sample
      const loadInitialCatalog = async () => {
        try {
          setSearchingReturnMedicines(true);
          const res = await api.get<{ items: any[] }>('/api/items?limit=25', {
            companyId: activeCompany.id
          });
          setReturnMedicinesList(res.items || []);
        } catch (err) {
          console.error('Initial catalog load error:', err);
        } finally {
          setSearchingReturnMedicines(false);
        }
      };
      loadInitialCatalog();
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchingReturnMedicines(true);
        const res = await api.get<{ items: any[] }>(
          `/api/items?search=${encodeURIComponent(returnSearchQuery)}&limit=35`,
          {
            companyId: activeCompany.id
          }
        );
        setReturnMedicinesList(res.items || []);
      } catch (err) {
        console.error('Search return medicines error:', err);
      } finally {
        setSearchingReturnMedicines(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [returnSearchQuery, isOpen, activeCompany?.id]);

  // Reset modal state when opening
  useEffect(() => {
    if (isOpen) {
      setReturnCart([]);
      setSelectedReturnItem(null);
      setSelectedReturnBatch(null);
      setReturnSearchQuery('');
      setReturnStrips('1');
      setReturnLoose('0');
      setReturnPatientName('');
      setCustomGrandTotalRefund('');
      setReturnReason('Doctor changed medicine / prescription');
      setReturnError(null);
      setViewingSlip(null);
    }
  }, [isOpen]);

  const handleSelectReturnItem = async (initialMed: any) => {
    let item = initialMed;
    try {
      if (activeCompany) {
        const detailRes = await api.get<{ item: any }>(`/api/items/${initialMed.id}`, {
          companyId: activeCompany.id
        });
        if (detailRes.item) {
          item = detailRes.item;
        }
      }
    } catch (e) {
      console.warn('Using cached item batches:', e);
    }

    setSelectedReturnItem(item);
    if (item.batches && item.batches.length > 0) {
      setSelectedReturnBatch(item.batches[0]);
    } else {
      setSelectedReturnBatch(null);
    }
    setReturnStrips('1');
    setReturnLoose('0');
    setCurrentItemRefund('');
    setReturnError(null);
  };

  // Auto calculate item refund based on MRP
  const calculatedCurrentItemRefund = React.useMemo(() => {
    if (!selectedReturnBatch || !selectedReturnItem) return 0;
    const factor = selectedReturnItem.conversionFactor || 1;
    const strips = Math.max(0, parseInt(returnStrips) || 0);
    const loose = Math.max(0, parseInt(returnLoose) || 0);
    const mrp =
      Number(selectedReturnBatch.mrp) > 0
        ? Number(selectedReturnBatch.mrp)
        : Number(selectedReturnBatch.pts || 0);
    const total = strips * mrp + loose * (mrp / factor);
    return Math.round(total * 100) / 100;
  }, [selectedReturnBatch, selectedReturnItem, returnStrips, returnLoose]);

  const effectiveCurrentItemRefund =
    currentItemRefund.trim() !== ''
      ? Math.max(0, parseFloat(currentItemRefund) || 0)
      : calculatedCurrentItemRefund;

  // Add Medicine to Return Cart
  const handleAddMedicineToCart = () => {
    if (!selectedReturnItem || !selectedReturnBatch) {
      setReturnError('Please select a medicine and batch to return');
      return;
    }

    const factor = selectedReturnItem.conversionFactor || 1;
    const strips = Math.max(0, parseInt(returnStrips) || 0);
    const loose = Math.max(0, parseInt(returnLoose) || 0);
    const totalUnits = strips * factor + loose;

    if (totalUnits <= 0) {
      setReturnError('Please enter at least 1 strip or loose tablet for this medicine');
      return;
    }

    const unitPrice =
      Number(selectedReturnBatch.mrp) > 0
        ? Number(selectedReturnBatch.mrp)
        : Number(selectedReturnBatch.pts || 0);

    const newItem: ReturnCartItem = {
      id: `cart-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      batchId: selectedReturnBatch.id,
      itemId: selectedReturnItem.id,
      medicineName: selectedReturnItem.name,
      sku: selectedReturnItem.sku || '',
      batchNumber: selectedReturnBatch.batchNumber,
      expiryDate: selectedReturnBatch.expiryDate,
      unit: selectedReturnItem.unit || 'TAB',
      conversionFactor: factor,
      strips,
      looseQty: loose,
      unitsToAdd: totalUnits,
      unitRetailPrice: unitPrice,
      itemRefund: effectiveCurrentItemRefund
    };

    setReturnCart(prev => [...prev, newItem]);

    // Reset current item picker to immediately allow adding the next medicine
    setSelectedReturnItem(null);
    setSelectedReturnBatch(null);
    setReturnSearchQuery('');
    setReturnStrips('1');
    setReturnLoose('0');
    setCurrentItemRefund('');
    setReturnError(null);
  };

  const handleRemoveCartItem = (id: string) => {
    setReturnCart(prev => prev.filter(i => i.id !== id));
  };

  // Grand Total of Return Cart
  const sumOfCartRefunds = React.useMemo(() => {
    return Math.round(returnCart.reduce((sum, itm) => sum + itm.itemRefund, 0) * 100) / 100;
  }, [returnCart]);

  const effectiveGrandTotalRefund =
    customGrandTotalRefund.trim() !== ''
      ? Math.max(0, parseFloat(customGrandTotalRefund) || 0)
      : sumOfCartRefunds;

  // Submit Multi-Item Patient Return
  const handleProcessPatientReturn = async () => {
    if (!activeCompany) return;

    let itemsToSubmit = [...returnCart];

    // If staff picked a medicine but forgot to click "+ Add Medicine", auto-add it
    if (selectedReturnItem && selectedReturnBatch) {
      const factor = selectedReturnItem.conversionFactor || 1;
      const strips = Math.max(0, parseInt(returnStrips) || 0);
      const loose = Math.max(0, parseInt(returnLoose) || 0);
      const totalUnits = strips * factor + loose;

      if (totalUnits > 0) {
        const unitPrice =
          Number(selectedReturnBatch.mrp) > 0
            ? Number(selectedReturnBatch.mrp)
            : Number(selectedReturnBatch.pts || 0);
        itemsToSubmit.push({
          id: `cart-auto-${Date.now()}`,
          batchId: selectedReturnBatch.id,
          itemId: selectedReturnItem.id,
          medicineName: selectedReturnItem.name,
          sku: selectedReturnItem.sku || '',
          batchNumber: selectedReturnBatch.batchNumber,
          expiryDate: selectedReturnBatch.expiryDate,
          unit: selectedReturnItem.unit || 'TAB',
          conversionFactor: factor,
          strips,
          looseQty: loose,
          unitsToAdd: totalUnits,
          unitRetailPrice: unitPrice,
          itemRefund: effectiveCurrentItemRefund
        });
      }
    }

    if (itemsToSubmit.length === 0) {
      setReturnError('Please add at least 1 medicine to the return list');
      return;
    }

    try {
      setIsProcessingReturn(true);
      setReturnError(null);

      const res = await api.post<any>(
        '/api/inventory/quick-return',
        {
          patientName: returnPatientName.trim() || 'Cash Customer',
          reason: returnReason.trim() || 'Patient Return',
          totalRefundAmount:
            effectiveGrandTotalRefund > 0
              ? effectiveGrandTotalRefund
              : itemsToSubmit.reduce((s, i) => s + i.itemRefund, 0),
          items: itemsToSubmit.map(i => ({
            batchId: i.batchId,
            strips: i.strips,
            looseQty: i.looseQty,
            quantity: i.unitsToAdd,
            refundAmount: i.itemRefund
          }))
        },
        {
          companyId: activeCompany.id,
          idempotencyKey: `multi-ret-${Date.now()}`
        }
      );

      const totalRefund =
        res.totalRefundAmount || itemsToSubmit.reduce((s, i) => s + i.itemRefund, 0);

      // Create multi-item return slip for print & callback
      const slip: MultiItemReturnSlip = {
        voucherNumber: res.voucherNumber || `RET-${Date.now()}`,
        createdAt: new Date().toISOString(),
        patientName: returnPatientName.trim() || 'Cash Customer',
        reason: returnReason.trim() || 'Patient Return',
        totalRefundAmount: totalRefund,
        totalUnitsAdded:
          res.totalUnitsAdded || itemsToSubmit.reduce((s, i) => s + i.unitsToAdd, 0),
        createdByUser: 'Staff',
        items: itemsToSubmit.map(i => ({
          medicineName: i.medicineName,
          sku: i.sku,
          batchNumber: i.batchNumber,
          expiryDate: i.expiryDate,
          unit: i.unit,
          conversionFactor: i.conversionFactor,
          strips: i.strips,
          looseQty: i.looseQty,
          unitsAdded: i.unitsToAdd,
          mrp: i.unitRetailPrice,
          refundAmount: i.itemRefund
        }))
      };

      setViewingSlip(slip);
      if (onSuccess) {
        onSuccess(slip);
      }
    } catch (err: any) {
      console.error('Failed to log multi-item patient return:', err);
      setReturnError(
        err.response?.data?.error || err.message || 'Failed to process return'
      );
    } finally {
      setIsProcessingReturn(false);
    }
  };

  const handlePrintSlip = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* VOUCHER / SLIP VIEW (after successful submission) */}
      {viewingSlip ? (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 300,
            padding: '1rem'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              color: '#0f172a',
              border: '1px solid #cbd5e1',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '2rem',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              position: 'relative'
            }}
          >
            <div
              style={{
                textAlign: 'center',
                borderBottom: '2px dashed #94a3b8',
                paddingBottom: '1rem',
                marginBottom: '1.2rem'
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: '1.4rem',
                  fontWeight: '900',
                  color: '#0f172a',
                  textTransform: 'uppercase'
                }}
              >
                {activeCompany?.name || 'PHARMACY'}
              </h2>
              <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '0.2rem' }}>
                PATIENT MEDICINE RETURN & REFUND VOUCHER (CREDIT NOTE)
              </div>
              <div
                style={{
                  fontSize: '0.9rem',
                  fontWeight: '800',
                  color: '#e11d48',
                  marginTop: '0.4rem'
                }}
              >
                Voucher #: {viewingSlip.voucherNumber}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Date: {new Date(viewingSlip.createdAt).toLocaleString('en-IN')}
              </div>
            </div>

            <div
              style={{
                fontSize: '0.88rem',
                marginBottom: '1.2rem',
                display: 'flex',
                justifyContent: 'space-between',
                background: '#f8fafc',
                padding: '0.8rem 1rem',
                borderRadius: '8px'
              }}
            >
              <div>
                <span style={{ color: '#64748b' }}>Patient Name: </span>
                <strong style={{ color: '#0f172a' }}>{viewingSlip.patientName}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Reason: </span>
                <span style={{ color: '#0f172a' }}>{viewingSlip.reason}</span>
              </div>
            </div>

            {/* Table of Returned Items */}
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.85rem',
                marginBottom: '1.2rem'
              }}
            >
              <thead>
                <tr
                  style={{
                    background: '#f1f5f9',
                    borderBottom: '1px solid #cbd5e1',
                    textAlign: 'left',
                    color: '#475569'
                  }}
                >
                  <th style={{ padding: '0.6rem 0.8rem' }}>#</th>
                  <th style={{ padding: '0.6rem 0.8rem' }}>Medicine</th>
                  <th style={{ padding: '0.6rem 0.8rem' }}>Batch & Exp</th>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>Qty Returned</th>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>MRP Rate</th>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Refund (₹)</th>
                </tr>
              </thead>
              <tbody>
                {viewingSlip.items.map((itm, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '0.6rem 0.8rem', color: '#64748b' }}>{i + 1}</td>
                    <td style={{ padding: '0.6rem 0.8rem', fontWeight: '700', color: '#0f172a' }}>
                      {itm.medicineName}
                    </td>
                    <td style={{ padding: '0.6rem 0.8rem', color: '#0f766e' }}>
                      {itm.batchNumber} {itm.expiryDate ? `(${itm.expiryDate})` : ''}
                    </td>
                    <td
                      style={{
                        padding: '0.6rem 0.8rem',
                        textAlign: 'center',
                        fontWeight: '700'
                      }}
                    >
                      {itm.strips > 0 && itm.looseQty > 0
                        ? `${itm.strips} Str + ${itm.looseQty} Tab`
                        : itm.strips > 0
                        ? `${itm.strips} Strip(s)`
                        : `${itm.looseQty} Tab(s)`}
                    </td>
                    <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', color: '#64748b' }}>
                      ₹{itm.mrp.toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: '0.6rem 0.8rem',
                        textAlign: 'right',
                        fontWeight: '800',
                        color: '#e11d48'
                      }}
                    >
                      ₹{itm.refundAmount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div
              style={{
                background: '#f8fafc',
                border: '2px solid #e2e8f0',
                padding: '0.9rem 1.2rem',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.4rem'
              }}
            >
              <span style={{ fontWeight: '900', fontSize: '1.05rem', color: '#0f172a' }}>
                TOTAL REFUND ISSUED:
              </span>
              <span style={{ fontWeight: '900', fontSize: '1.5rem', color: '#e11d48' }}>
                ₹{viewingSlip.totalRefundAmount.toFixed(2)}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                fontSize: '0.78rem',
                color: '#64748b',
                borderTop: '1px dashed #cbd5e1',
                paddingTop: '0.9rem',
                marginBottom: '1.4rem'
              }}
            >
              <div>
                Processed by: <strong>{viewingSlip.createdByUser || 'Staff'}</strong>
              </div>
              <div style={{ textAlign: 'right' }}>Pharmacist Signature: _____________</div>
            </div>

            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button
                onClick={() => {
                  setViewingSlip(null);
                  onClose();
                }}
                style={{
                  flex: 1,
                  padding: '0.7rem',
                  background: '#e2e8f0',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#334155',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Done / Close
              </button>
              <button
                onClick={handlePrintSlip}
                style={{
                  flex: 1,
                  padding: '0.7rem',
                  background: 'var(--brand-teal, #0f766e)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem'
                }}
              >
                <Printer size={16} /> Print Return Voucher
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* MAIN MULTI-ITEM RETURN MODAL */
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 250,
            padding: '1rem'
          }}
        >
          <div
            className="modal-card"
            style={{
              background: 'var(--card-bg, #ffffff)',
              border: '1px solid var(--border-color, #e2e8f0)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '850px',
              maxHeight: 'min(92vh, 92dvh)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)'
            }}
          >
            {/* Modal Header */}
            <div
              className="modal-header"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--border-color, #e2e8f0)',
                padding: '1.2rem 1.6rem',
                flexShrink: 0
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                <div
                  style={{
                    background: 'rgba(244, 63, 94, 0.15)',
                    color: '#e11d48',
                    padding: '0.55rem',
                    borderRadius: '10px'
                  }}
                >
                  <RotateCcw size={24} />
                </div>
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: '1.3rem',
                      fontWeight: '800',
                      color: 'var(--text-primary, #0f172a)'
                    }}
                  >
                    Patient Medicine Return Terminal
                  </h2>
                  <p
                    style={{
                      margin: '0.15rem 0 0 0',
                      fontSize: '0.82rem',
                      color: 'var(--text-secondary, #64748b)'
                    }}
                  >
                    Return multiple medicines at once, restore inventory batches, and issue a consolidated refund credit slip
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: '6px',
                  padding: '0.4rem 0.6rem',
                  color: 'var(--text-secondary, #64748b)',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ flex: '1 1 auto', overflowY: 'auto', padding: '1.4rem 1.6rem' }}>

            {/* Error Message */}
            {returnError && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.75rem 1rem',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid #ef4444',
                  borderRadius: '8px',
                  color: '#dc2626',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <AlertCircle size={18} />
                <span>{returnError}</span>
              </div>
            )}

            {/* Patient Name & Return Reason Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1rem',
                background: 'var(--bg-secondary, #f8fafc)',
                padding: '1rem',
                borderRadius: '10px',
                marginBottom: '1.4rem'
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    color: 'var(--text-secondary, #64748b)',
                    marginBottom: '0.35rem'
                  }}
                >
                  Patient Name / Customer
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar / Cash Customer"
                  value={returnPatientName}
                  onChange={e => setReturnPatientName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.8rem',
                    background: 'var(--card-bg, #ffffff)',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    borderRadius: '6px',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: '0.88rem',
                    fontWeight: '600'
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    color: 'var(--text-secondary, #64748b)',
                    marginBottom: '0.35rem'
                  }}
                >
                  Reason for Return
                </label>
                <input
                  type="text"
                  value={returnReason}
                  onChange={e => setReturnReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.8rem',
                    background: 'var(--card-bg, #ffffff)',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    borderRadius: '6px',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: '0.88rem'
                  }}
                />
              </div>
            </div>

            {/* Section: Add Medicines to Return Cart */}
            <div
              style={{
                background: 'rgba(20, 184, 166, 0.04)',
                border: '1px solid rgba(20, 184, 166, 0.25)',
                borderRadius: '12px',
                padding: '1.2rem',
                marginBottom: '1.4rem'
              }}
            >
              <div
                style={{
                  fontSize: '0.95rem',
                  fontWeight: '800',
                  color: 'var(--brand-teal, #0f766e)',
                  marginBottom: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <Plus size={16} /> Add Medicine to Return List
              </div>

              {/* Medicine Search Box */}
              {!selectedReturnItem ? (
                <div>
                  <div style={{ position: 'relative', marginBottom: '0.6rem' }}>
                    <Search
                      size={16}
                      style={{
                        position: 'absolute',
                        left: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--text-secondary, #64748b)'
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Type medicine name or SKU to add (e.g. BETAGAL, ADDITEK, DETLAM)..."
                      value={returnSearchQuery}
                      onChange={e => setReturnSearchQuery(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.8rem 0.65rem 2.2rem',
                        background: 'var(--card-bg, #ffffff)',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        borderRadius: '8px',
                        color: 'var(--text-primary, #0f172a)',
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>

                  <div
                    style={{
                      maxHeight: '160px',
                      overflowY: 'auto',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      borderRadius: '8px',
                      background: 'var(--card-bg, #ffffff)'
                    }}
                  >
                    {searchingReturnMedicines ? (
                      <div
                        style={{
                          padding: '0.8rem',
                          textAlign: 'center',
                          color: 'var(--text-secondary, #64748b)',
                          fontSize: '0.85rem'
                        }}
                      >
                        Searching medicines...
                      </div>
                    ) : returnMedicinesList.length === 0 ? (
                      <div
                        style={{
                          padding: '0.8rem',
                          textAlign: 'center',
                          color: '#94a3b8',
                          fontSize: '0.85rem'
                        }}
                      >
                        No medicines found. Type name to search.
                      </div>
                    ) : (
                      returnMedicinesList.map(item => (
                        <div
                          key={item.id}
                          onClick={() => handleSelectReturnItem(item)}
                          style={{
                            padding: '0.6rem 0.9rem',
                            borderBottom: '1px solid var(--border-color, #f1f5f9)',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.85rem'
                          }}
                          onMouseEnter={e =>
                            (e.currentTarget.style.background = 'var(--bg-secondary, #f8fafc)')
                          }
                          onMouseLeave={e =>
                            (e.currentTarget.style.background = 'transparent')
                          }
                        >
                          <div>
                            <div
                              style={{
                                fontWeight: '700',
                                color: 'var(--text-primary, #0f172a)'
                              }}
                            >
                              {item.name}
                            </div>
                            <div
                              style={{
                                fontSize: '0.74rem',
                                color: 'var(--text-secondary, #64748b)'
                              }}
                            >
                              {item.sku} • {item.unit} (1 Strip = {item.conversionFactor || 1} Tabs)
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--brand-teal, #0f766e)',
                              fontWeight: '600'
                            }}
                          >
                            {item.batches?.length || 0} batches available
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                /* Selected Medicine Configuration */
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.8rem',
                      paddingBottom: '0.5rem',
                      borderBottom: '1px dashed var(--border-color, #cbd5e1)'
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontWeight: '800',
                          fontSize: '1rem',
                          color: 'var(--text-primary, #0f172a)'
                        }}
                      >
                        {selectedReturnItem.name}
                      </span>
                      <span
                        style={{
                          marginLeft: '0.6rem',
                          fontSize: '0.78rem',
                          color: 'var(--text-secondary, #64748b)'
                        }}
                      >
                        ({selectedReturnItem.unit}, 1 Strip = {selectedReturnItem.conversionFactor || 1} Tabs)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedReturnItem(null);
                        setSelectedReturnBatch(null);
                        setReturnSearchQuery('');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary, #64748b)',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        textDecoration: 'underline'
                      }}
                    >
                      Pick Different Medicine
                    </button>
                  </div>

                  {/* Batch Selection */}
                  <div style={{ marginBottom: '1rem' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        color: 'var(--text-secondary, #64748b)',
                        marginBottom: '0.35rem'
                      }}
                    >
                      Select Batch to Inward Stock:
                    </label>
                    {!selectedReturnItem.batches || selectedReturnItem.batches.length === 0 ? (
                      <div
                        style={{
                          padding: '0.6rem',
                          background: 'rgba(239, 68, 68, 0.1)',
                          color: '#dc2626',
                          borderRadius: '6px',
                          fontSize: '0.82rem'
                        }}
                      >
                        No batches found. Please create a batch in Inventory first.
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                          gap: '0.5rem'
                        }}
                      >
                        {selectedReturnItem.batches.map((b: any) => {
                          const isSelected = selectedReturnBatch?.id === b.id;
                          return (
                            <div
                              key={b.id}
                              onClick={() => setSelectedReturnBatch(b)}
                              style={{
                                padding: '0.6rem',
                                borderRadius: '8px',
                                border: isSelected
                                  ? '2px solid var(--brand-teal, #0f766e)'
                                  : '1px solid var(--border-color, #cbd5e1)',
                                background: isSelected
                                  ? 'rgba(20, 184, 166, 0.12)'
                                  : 'var(--card-bg, #ffffff)',
                                cursor: 'pointer',
                                fontSize: '0.8rem'
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: '700',
                                  color: isSelected
                                    ? 'var(--brand-teal, #0f766e)'
                                    : 'var(--text-primary, #0f172a)'
                                }}
                              >
                                Batch: {b.batchNumber}
                              </div>
                              <div
                                style={{
                                  color: 'var(--text-secondary, #64748b)',
                                  fontSize: '0.75rem',
                                  marginTop: '0.15rem'
                                }}
                              >
                                MRP: <strong>₹{Number(b.mrp || 0).toFixed(2)}</strong> • Exp:{' '}
                                {b.expiryDate
                                  ? new Date(b.expiryDate).toLocaleDateString('en-IN', {
                                      month: 'short',
                                      year: '2-digit'
                                    })
                                  : 'N/A'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Quantities & Refund Input */}
                  {selectedReturnBatch && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1.2fr auto',
                        gap: '0.8rem',
                        alignItems: 'flex-end'
                      }}
                    >
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            color: 'var(--text-secondary, #64748b)',
                            marginBottom: '0.3rem'
                          }}
                        >
                          Strips
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={returnStrips}
                          onChange={e => setReturnStrips(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.55rem',
                            background: 'var(--card-bg, #ffffff)',
                            border: '1px solid var(--border-color, #cbd5e1)',
                            borderRadius: '6px',
                            color: 'var(--text-primary, #0f172a)',
                            fontWeight: '700',
                            fontSize: '0.95rem'
                          }}
                        />
                      </div>

                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            color: 'var(--text-secondary, #64748b)',
                            marginBottom: '0.3rem'
                          }}
                        >
                          Loose Tabs
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={returnLoose}
                          onChange={e => setReturnLoose(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.55rem',
                            background: 'var(--card-bg, #ffffff)',
                            border: '1px solid var(--border-color, #cbd5e1)',
                            borderRadius: '6px',
                            color: 'var(--text-primary, #0f172a)',
                            fontWeight: '700',
                            fontSize: '0.95rem'
                          }}
                        />
                      </div>

                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            color: 'var(--text-secondary, #64748b)',
                            marginBottom: '0.3rem'
                          }}
                        >
                          Item Refund (₹)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder={`₹${calculatedCurrentItemRefund.toFixed(2)}`}
                          value={currentItemRefund}
                          onChange={e => setCurrentItemRefund(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.55rem',
                            background: 'var(--card-bg, #ffffff)',
                            border: '1px solid var(--border-color, #cbd5e1)',
                            borderRadius: '6px',
                            color: '#e11d48',
                            fontWeight: '800',
                            fontSize: '0.95rem'
                          }}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleAddMedicineToCart}
                        style={{
                          padding: '0.58rem 1.1rem',
                          background: 'var(--brand-teal, #0f766e)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          fontWeight: '700',
                          fontSize: '0.88rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          height: '38px',
                          boxShadow: '0 2px 8px rgba(20, 184, 166, 0.3)'
                        }}
                      >
                        <Plus size={16} /> Add to List
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* List of Medicines Added to Return Cart */}
            <div style={{ marginBottom: '1.4rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.6rem'
                }}
              >
                <span
                  style={{
                    fontWeight: '800',
                    fontSize: '0.95rem',
                    color: 'var(--text-primary, #0f172a)'
                  }}
                >
                  Medicines to Refund ({returnCart.length} item{returnCart.length === 1 ? '' : 's'})
                </span>
                {returnCart.length > 0 && (
                  <span
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--brand-teal, #0f766e)',
                      fontWeight: '600'
                    }}
                  >
                    Total Units to Inward: {returnCart.reduce((s, i) => s + i.unitsToAdd, 0)} base units
                  </span>
                )}
              </div>

              {returnCart.length === 0 ? (
                <div
                  style={{
                    padding: '1.8rem',
                    textAlign: 'center',
                    border: '1px dashed var(--border-color, #cbd5e1)',
                    borderRadius: '10px',
                    color: 'var(--text-secondary, #94a3b8)',
                    fontSize: '0.85rem'
                  }}
                >
                  No medicines added yet. Use the search box above to add 1, 2, 5, or more medicines to this return slip.
                </div>
              ) : (
                <div
                  style={{
                    border: '1px solid var(--border-color, #cbd5e1)',
                    borderRadius: '10px',
                    overflow: 'hidden'
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.85rem'
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: 'var(--bg-secondary, #f8fafc)',
                          borderBottom: '1px solid var(--border-color, #cbd5e1)',
                          textAlign: 'left',
                          color: 'var(--text-secondary, #64748b)'
                        }}
                      >
                        <th style={{ padding: '0.6rem 0.8rem' }}>#</th>
                        <th style={{ padding: '0.6rem 0.8rem' }}>Medicine Name</th>
                        <th style={{ padding: '0.6rem 0.8rem' }}>Batch & Exp</th>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>Return Qty</th>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>MRP Rate</th>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Refund (₹)</th>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>Remove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {returnCart.map((item, idx) => (
                        <tr
                          key={item.id}
                          style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)' }}
                        >
                          <td style={{ padding: '0.65rem 0.8rem', color: '#94a3b8' }}>{idx + 1}</td>
                          <td
                            style={{
                              padding: '0.65rem 0.8rem',
                              fontWeight: '700',
                              color: 'var(--text-primary, #0f172a)'
                            }}
                          >
                            {item.medicineName}
                          </td>
                          <td
                            style={{
                              padding: '0.65rem 0.8rem',
                              color: 'var(--brand-teal, #0f766e)'
                            }}
                          >
                            {item.batchNumber}{' '}
                            {item.expiryDate
                              ? `(${new Date(item.expiryDate).toLocaleDateString('en-IN', {
                                  month: 'short',
                                  year: '2-digit'
                                })})`
                              : ''}
                          </td>
                          <td
                            style={{
                              padding: '0.65rem 0.8rem',
                              textAlign: 'center',
                              fontWeight: '700'
                            }}
                          >
                            {item.strips > 0 && item.looseQty > 0
                              ? `${item.strips} Str + ${item.looseQty} Tab`
                              : item.strips > 0
                              ? `${item.strips} Strip(s)`
                              : `${item.looseQty} Tab(s)`}
                          </td>
                          <td
                            style={{
                              padding: '0.65rem 0.8rem',
                              textAlign: 'right',
                              color: 'var(--text-secondary, #64748b)'
                            }}
                          >
                            ₹{item.unitRetailPrice.toFixed(2)}
                          </td>
                          <td
                            style={{
                              padding: '0.65rem 0.8rem',
                              textAlign: 'right',
                              fontWeight: '800',
                              color: '#e11d48'
                            }}
                          >
                            ₹{item.itemRefund.toFixed(2)}
                          </td>
                          <td style={{ padding: '0.65rem 0.8rem', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveCartItem(item.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '0.2rem'
                              }}
                              title="Remove this medicine"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Grand Total Summary Box */}
            <div
              style={{
                background: 'var(--bg-secondary, #f8fafc)',
                border: '1px solid var(--border-color, #cbd5e1)',
                padding: '1rem',
                borderRadius: '10px',
                marginBottom: '1.4rem'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <span
                    style={{
                      fontWeight: '800',
                      fontSize: '1rem',
                      color: 'var(--text-primary, #0f172a)'
                    }}
                  >
                    GRAND TOTAL PATIENT REFUND:
                  </span>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--text-secondary, #64748b)',
                      marginTop: '0.15rem'
                    }}
                  >
                    Deducted from Net Sales & cash outflow
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span
                    style={{
                      fontSize: '1.45rem',
                      fontWeight: '900',
                      color: '#e11d48'
                    }}
                  >
                    ₹{effectiveGrandTotalRefund.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            </div>

            {/* Modal Actions */}
            <div className="modal-footer" style={{
              display: 'flex',
              gap: '0.8rem',
              padding: '1rem 1.6rem',
              borderTop: '1px solid var(--border-color, #e2e8f0)',
              background: 'var(--card-bg, #ffffff)',
              flexShrink: 0,
              position: 'sticky',
              bottom: 0,
              zIndex: 10
            }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: 'var(--bg-secondary, #f8fafc)',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  borderRadius: '8px',
                  color: 'var(--text-primary, #0f172a)',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProcessPatientReturn}
                disabled={isProcessingReturn || (returnCart.length === 0 && !selectedReturnBatch)}
                style={{
                  flex: 2,
                  padding: '0.75rem',
                  background: '#e11d48',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '700',
                  cursor:
                    isProcessingReturn || (returnCart.length === 0 && !selectedReturnBatch)
                      ? 'not-allowed'
                      : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 14px rgba(225, 29, 72, 0.3)',
                  opacity:
                    isProcessingReturn || (returnCart.length === 0 && !selectedReturnBatch) ? 0.6 : 1
                }}
              >
                <RotateCcw size={17} />
                {isProcessingReturn
                  ? 'Processing Return...'
                  : `Submit Return & Refund ₹${(
                      effectiveGrandTotalRefund > 0
                        ? effectiveGrandTotalRefund
                        : calculatedCurrentItemRefund
                    ).toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MultiPatientReturnModal;

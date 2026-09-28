import React, { useState, useEffect } from 'react';
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
  Search
} from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
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
  gstRate: number;
}

interface PurchaseRow {
  id: string;
  itemId: string;
  medicineName: string;
  sku: string;
  unit: string;
  batchNumber: string;
  expiryMonth: string;
  expiryYear: string;
  quantity: string;
  freeQuantity: string;
  purchaseRate: string; // PTR
  mrp: string;
  pts: string;
  discountPercent: string;
  gstRate: string;
}

export default function NewPurchase({ onBack, onCreated }: { onBack: () => void; onCreated: () => void }) {
  const { activeCompany } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [medicines, setMedicines] = useState<MedicineItem[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);

  // Form Header State
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [paymentMode, setPaymentMode] = useState<'CREDIT' | 'CASH' | 'BANK_TRANSFER' | 'UPI'>('CREDIT');
  const [paidAmount, setPaidAmount] = useState('0');
  const [roundOff, setRoundOff] = useState('0.00');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Rows State
  const [rows, setRows] = useState<PurchaseRow[]>([
    {
      id: 'row-1',
      itemId: '',
      medicineName: '',
      sku: '',
      unit: 'STRIP',
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

  useEffect(() => {
    fetchInitialData();
  }, [activeCompany?.id]);

  const fetchInitialData = async () => {
    if (!activeCompany) return;
    try {
      setLoadingSuppliers(true);
      const [supRes, medRes] = await Promise.all([
        api.get<{ parties: Supplier[] }>('/api/parties?type=supplier', { companyId: activeCompany.id }),
        api.get<{ items: MedicineItem[] }>('/api/items', { companyId: activeCompany.id })
      ]);
      setSuppliers(supRes.parties || []);
      setMedicines(medRes.items || []);
      if (supRes.parties && supRes.parties.length > 0) {
        setSelectedSupplierId(supRes.parties[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load initial purchase data');
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const handleAddRow = () => {
    const newRow: PurchaseRow = {
      id: `row-${Date.now()}`,
      itemId: medicines.length > 0 ? medicines[0].id : '',
      medicineName: medicines.length > 0 ? medicines[0].name : '',
      sku: medicines.length > 0 ? medicines[0].sku : '',
      unit: medicines.length > 0 ? medicines[0].unit : 'STRIP',
      batchNumber: '',
      expiryMonth: '12',
      expiryYear: String(new Date().getFullYear() + 2),
      quantity: '10',
      freeQuantity: '0',
      purchaseRate: '100',
      mrp: '140',
      pts: '120',
      discountPercent: '0',
      gstRate: medicines.length > 0 ? String(medicines[0].gstRate) : '12'
    };
    setRows([...rows, newRow]);
  };

  const handleRemoveRow = (id: string) => {
    if (rows.length === 1) return;
    setRows(rows.filter(r => r.id !== id));
  };

  const handleRowChange = (id: string, field: keyof PurchaseRow, value: string) => {
    setRows(rows.map(row => {
      if (row.id !== id) return row;

      if (field === 'itemId') {
        const med = medicines.find(m => m.id === value);
        if (med) {
          return {
            ...row,
            itemId: med.id,
            medicineName: med.name,
            sku: med.sku,
            unit: med.unit,
            gstRate: String(med.gstRate)
          };
        }
      }

      return { ...row, [field]: value };
    }));
  };

  // Calculations
  let subtotal = 0;
  let totalDiscount = 0;
  let taxableAmount = 0;
  let totalGstAmount = 0;

  const computedRows = rows.map(r => {
    const qty = parseFloat(r.quantity) || 0;
    const rate = parseFloat(r.purchaseRate) || 0;
    const discPct = parseFloat(r.discountPercent) || 0;
    const gstPct = parseFloat(r.gstRate) || 0;

    const lineGross = qty * rate;
    const lineDisc = (lineGross * discPct) / 100;
    const lineTaxable = lineGross - lineDisc;
    const lineGst = (lineTaxable * gstPct) / 100;
    const lineTotal = lineTaxable + lineGst;

    subtotal += lineGross;
    totalDiscount += lineDisc;
    taxableAmount += lineTaxable;
    totalGstAmount += lineGst;

    return {
      ...r,
      lineTaxable,
      lineGst,
      lineTotal
    };
  });

  const numRoundOff = parseFloat(roundOff) || 0;
  const grandTotal = Math.round((taxableAmount + totalGstAmount + numRoundOff) * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany) return;

    if (!selectedSupplierId) {
      setError('Please select a supplier');
      return;
    }

    if (!invoiceNumber.trim()) {
      setError('Please enter the Supplier Bill / Invoice number');
      return;
    }

    // Validate rows
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.itemId) {
        setError(`Row #${i + 1}: Please select a medicine`);
        return;
      }
      if (!r.batchNumber.trim()) {
        setError(`Row #${i + 1}: Batch number is required`);
        return;
      }
      if (parseFloat(r.quantity) <= 0) {
        setError(`Row #${i + 1}: Quantity must be greater than 0`);
        return;
      }
    }

    try {
      setSubmitting(true);
      setError(null);

      const payloadItems = rows.map(r => {
        const year = parseInt(r.expiryYear);
        const month = parseInt(r.expiryMonth);
        const lastDay = new Date(year, month, 0).getDate();
        const expiryDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        return {
          itemId: r.itemId,
          batchNumber: r.batchNumber.trim().toUpperCase(),
          expiryDate,
          quantity: parseInt(r.quantity) || 1,
          freeQuantity: parseInt(r.freeQuantity) || 0,
          purchaseRate: parseFloat(r.purchaseRate) || 0,
          mrp: parseFloat(r.mrp) || parseFloat(r.purchaseRate) || 0,
          pts: parseFloat(r.pts) || parseFloat(r.mrp) || 0,
          discountPercent: parseFloat(r.discountPercent) || 0,
          gstRate: parseFloat(r.gstRate) || 12
        };
      });

      await api.post('/api/purchases', {
        supplierId: selectedSupplierId,
        invoiceNumber: invoiceNumber.trim().toUpperCase(),
        purchaseDate,
        dueDate: dueDate || null,
        paymentMode,
        paidAmount: paymentMode === 'CASH' ? grandTotal : (parseFloat(paidAmount) || 0),
        roundOff: numRoundOff,
        notes,
        items: payloadItems
      }, {
        companyId: activeCompany.id
      });

      onCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to save purchase bill');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={onBack}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px' }}
          >
            <ArrowLeft size={16} /> Back to Purchases
          </button>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
              New Purchase Inward Bill
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Inward stock batches from distributor with GST & batch rate updates.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
        >
          <CheckCircle2 size={16} />
          {submitting ? 'Saving Inward Bill...' : 'Save Purchase Bill'}
        </button>
      </div>

      {error && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#b91c1c',
          padding: '10px 14px',
          borderRadius: '6px',
          fontSize: '13px'
        }}>
          {error}
        </div>
      )}

      {/* Bill Header Info Card */}
      <div className="card" style={{ padding: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <div className="form-group">
            <label className="label">Wholesaler / Supplier *</label>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="input"
              required
            >
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.gstin ? `(${s.gstin})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="label">Supplier Invoice No *</label>
            <input
              type="text"
              required
              placeholder="e.g. INV-9082"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())}
              className="input"
              style={{ textTransform: 'uppercase', fontFamily: 'monospace', fontWeight: 600 }}
            />
          </div>

          <div className="form-group">
            <label className="label">Purchase Date *</label>
            <input
              type="date"
              required
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="input"
            />
          </div>

          <div className="form-group">
            <label className="label">Payment Mode</label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as any)}
              className="input"
            >
              <option value="CREDIT">Credit Bill (Pay Later)</option>
              <option value="CASH">Cash Payment</option>
              <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS)</option>
              <option value="UPI">UPI / QR Code</option>
            </select>
          </div>
        </div>
      </div>

      {/* Items Grid */}
      <div className="card" style={{ padding: '0px', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-main)' }}>
            Medicine Items & Batch Inward ({rows.length} rows)
          </div>
          <button
            type="button"
            onClick={handleAddRow}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Plus size={14} /> Add Medicine Row
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: '180px' }}>MEDICINE</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: '110px' }}>BATCH NO</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: '120px' }}>EXPIRY</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', width: '70px' }}>QTY</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', width: '60px' }}>FREE</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', width: '90px' }}>PTR (₹)</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', width: '90px' }}>MRP (₹)</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', width: '60px' }}>DISC %</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', width: '70px' }}>GST %</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', minWidth: '90px' }}>TOTAL (₹)</th>
                <th style={{ padding: '8px 10px', textAlign: 'center', width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {computedRows.map((row, idx) => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* Medicine Selector */}
                  <td style={{ padding: '6px 8px' }}>
                    <select
                      value={row.itemId}
                      onChange={(e) => handleRowChange(row.id, 'itemId', e.target.value)}
                      className="input"
                      style={{ fontSize: '12px', padding: '4px 6px', height: '32px' }}
                    >
                      <option value="" disabled>-- Select Medicine --</option>
                      {medicines.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.sku})
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Batch Number */}
                  <td style={{ padding: '6px 8px' }}>
                    <input
                      type="text"
                      placeholder="e.g. BT-901"
                      value={row.batchNumber}
                      onChange={(e) => handleRowChange(row.id, 'batchNumber', e.target.value.toUpperCase())}
                      className="input"
                      style={{ fontSize: '12px', padding: '4px 6px', height: '32px', fontFamily: 'monospace', textTransform: 'uppercase' }}
                    />
                  </td>

                  {/* Expiry MM / YYYY */}
                  <td style={{ padding: '6px 8px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <select
                        value={row.expiryMonth}
                        onChange={(e) => handleRowChange(row.id, 'expiryMonth', e.target.value)}
                        className="input"
                        style={{ fontSize: '11px', padding: '4px 2px', height: '32px', flex: 1 }}
                      >
                        {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <select
                        value={row.expiryYear}
                        onChange={(e) => handleRowChange(row.id, 'expiryYear', e.target.value)}
                        className="input"
                        style={{ fontSize: '11px', padding: '4px 2px', height: '32px', flex: 1.2 }}
                      >
                        {Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() + i)).map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </td>

                  {/* Quantity */}
                  <td style={{ padding: '6px 8px' }}>
                    <input
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={(e) => handleRowChange(row.id, 'quantity', e.target.value)}
                      className="input"
                      style={{ fontSize: '12px', padding: '4px 6px', height: '32px', textAlign: 'right' }}
                    />
                  </td>

                  {/* Free Quantity */}
                  <td style={{ padding: '6px 8px' }}>
                    <input
                      type="number"
                      min="0"
                      value={row.freeQuantity}
                      onChange={(e) => handleRowChange(row.id, 'freeQuantity', e.target.value)}
                      className="input"
                      style={{ fontSize: '12px', padding: '4px 6px', height: '32px', textAlign: 'right' }}
                    />
                  </td>

                  {/* PTR */}
                  <td style={{ padding: '6px 8px' }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.purchaseRate}
                      onChange={(e) => handleRowChange(row.id, 'purchaseRate', e.target.value)}
                      className="input"
                      style={{ fontSize: '12px', padding: '4px 6px', height: '32px', textAlign: 'right' }}
                    />
                  </td>

                  {/* MRP */}
                  <td style={{ padding: '6px 8px' }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.mrp}
                      onChange={(e) => handleRowChange(row.id, 'mrp', e.target.value)}
                      className="input"
                      style={{ fontSize: '12px', padding: '4px 6px', height: '32px', textAlign: 'right' }}
                    />
                  </td>

                  {/* Discount % */}
                  <td style={{ padding: '6px 8px' }}>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={row.discountPercent}
                      onChange={(e) => handleRowChange(row.id, 'discountPercent', e.target.value)}
                      className="input"
                      style={{ fontSize: '12px', padding: '4px 6px', height: '32px', textAlign: 'right' }}
                    />
                  </td>

                  {/* GST % */}
                  <td style={{ padding: '6px 8px' }}>
                    <select
                      value={row.gstRate}
                      onChange={(e) => handleRowChange(row.id, 'gstRate', e.target.value)}
                      className="input"
                      style={{ fontSize: '11px', padding: '4px 2px', height: '32px' }}
                    >
                      <option value="0">0%</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </td>

                  {/* Line Total */}
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                    ₹{row.lineTotal.toFixed(2)}
                  </td>

                  {/* Action */}
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(row.id)}
                      disabled={rows.length === 1}
                      style={{ background: 'none', border: 'none', color: rows.length === 1 ? '#cbd5e1' : '#ef4444', cursor: rows.length === 1 ? 'not-allowed' : 'pointer', padding: 0 }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bill Footer Calculations & Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label className="label">Bill Remarks / Notes</label>
          <textarea
            placeholder="e.g. Scheme discounts applied, delivered via Transport Cargo"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input"
            rows={3}
            style={{ resize: 'none' }}
          />
        </div>

        <div className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Subtotal (Gross):</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>

            {totalDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                <span>Total Discount:</span>
                <span>- ₹{totalDiscount.toFixed(2)}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Taxable Value:</span>
              <span>₹{taxableAmount.toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>CGST (50%):</span>
              <span>₹{(totalGstAmount / 2).toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>SGST (50%):</span>
              <span>₹{(totalGstAmount / 2).toFixed(2)}</span>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '15px' }}>Grand Total (₹):</span>
              <span style={{ fontWeight: 700, fontSize: '18px', color: 'var(--brand-primary)' }}>
                ₹{grandTotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import NewPurchase from './NewPurchase';
import {
  Truck,
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
  Building2,
  Trash2,
  Edit2
} from 'lucide-react';

interface PurchaseItemDetail {
  id: string;
  medicineName: string;
  genericName?: string | null;
  sku: string;
  unit: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  freeQuantity: number;
  purchaseRate: number;
  mrp: number;
  discountPercent: number;
  taxableValue: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
}

interface PurchaseBill {
  id: string;
  invoiceNumber: string;
  purchaseDate: string;
  dueDate?: string | null;
  paymentMode: string;
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  roundOff: number;
  totalAmount: number;
  paidAmount: number;
  status: 'PAID' | 'PARTIAL' | 'UNPAID' | 'CANCELLED';
  notes?: string | null;
  supplier: {
    id: string;
    name: string;
    phone?: string | null;
    gstin?: string | null;
    drugLicenseNo?: string | null;
    outstandingBalance: number;
  };
  createdByUser: string;
  itemsCount: number;
  createdAt: string;
}

export default function Purchases() {
  const { activeCompany } = useAuth();
  const [purchases, setPurchases] = useState<PurchaseBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'PARTIAL' | 'UNPAID'>('ALL');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // View / Creation State
  const [showNewPurchase, setShowNewPurchase] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [viewingPurchase, setViewingPurchase] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Payment Recording State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);

  useEffect(() => {
    fetchPurchases();
  }, [activeCompany?.id, statusFilter]);

  const fetchPurchases = async () => {
    if (!activeCompany) return;
    try {
      setLoading(true);
      setError(null);
      const url = statusFilter === 'ALL'
        ? '/api/purchases'
        : `/api/purchases?status=${statusFilter}`;
      const res = await api.get<{ purchases: PurchaseBill[] }>(url, {
        companyId: activeCompany.id
      });
      setPurchases(res.purchases || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load purchase bills');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetails = async (id: string) => {
    if (!activeCompany) return;
    try {
      setLoadingDetails(true);
      const res = await api.get<{ purchase: any }>(`/api/purchases/${id}`, {
        companyId: activeCompany.id
      });
      setViewingPurchase(res.purchase);
    } catch (err: any) {
      setError(err.message || 'Failed to load purchase details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany || !viewingPurchase) return;

    try {
      setRecordingPayment(true);
      setError(null);

      await api.post(`/api/purchases/${viewingPurchase.id}/payment`, {
        paymentAmount: parseFloat(paymentAmount)
      }, {
        companyId: activeCompany.id
      });

      setShowPaymentModal(false);
      setPaymentAmount('');
      await handleOpenDetails(viewingPurchase.id);
      await fetchPurchases();
    } catch (err: any) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setRecordingPayment(false);
    }
  };

  const handleDeletePurchase = async (id: string, invoiceNumber: string) => {
    if (!activeCompany) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to cancel purchase bill #${invoiceNumber}?\n\nThis will atomically:\n- Mark the purchase bill as CANCELLED (preserving the audit trail)\n- Deduct inward stock from batch inventory\n- Write append-only reversing ledger entries (PURCHASE_RETURN)\n- Revert supplier outstanding balance if unpaid`
    );
    if (!confirmDelete) return;

    try {
      setLoading(true);
      setError(null);
      await api.delete(`/api/purchases/${id}`, {
        companyId: activeCompany.id
      });
      if (viewingPurchase?.id === id) {
        setViewingPurchase(null);
      }
      await fetchPurchases();
    } catch (err: any) {
      console.error('Failed to cancel purchase:', err);
      setError(err.message || 'Failed to cancel purchase bill');
    } finally {
      setLoading(false);
    }
  };

  if (showNewPurchase) {
    return (
      <NewPurchase
        editingPurchaseId={editingPurchaseId}
        onBack={() => {
          setShowNewPurchase(false);
          setEditingPurchaseId(null);
        }}
        onCreated={() => {
          setShowNewPurchase(false);
          setEditingPurchaseId(null);
          fetchPurchases();
        }}
      />
    );
  }

  const filtered = purchases.filter(p => {
    const s = search.toLowerCase();
    return p.invoiceNumber.toLowerCase().includes(s) ||
      p.supplier.name.toLowerCase().includes(s);
  });

  const activePurchases = purchases.filter(p => p.status !== 'CANCELLED');
  const totalInwardValue = activePurchases.reduce((sum, p) => sum + p.totalAmount, 0);
  const totalUnpaidValue = activePurchases.reduce((sum, p) => sum + (p.totalAmount - p.paidAmount), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
            Purchase Bills & Inward Stock Invoices
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Record distributor inward bills, stock receipts, batch lot creation, and accounts payable.
          </p>
        </div>

        <button
          onClick={() => setShowNewPurchase(true)}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} />
          New Purchase Inward
        </button>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div className="card" style={{ padding: '14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Total Inward Purchases
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>
            ₹{totalInwardValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="card" style={{ padding: '14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Total Supplier Bills
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#0284c7', marginTop: '4px' }}>
            {purchases.length} bills
          </div>
        </div>

        <div className="card" style={{ padding: '14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Outstanding Accounts Payable
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: totalUnpaidValue > 0 ? '#ef4444' : '#16a34a', marginTop: '4px' }}>
            ₹{totalUnpaidValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div style={{
        background: 'var(--surface)',
        padding: '12px 16px',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['ALL', 'UNPAID', 'PARTIAL', 'PAID'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`btn ${statusFilter === tab ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '12px', padding: '6px 12px' }}
            >
              {tab === 'ALL' ? `All Bills (${purchases.length})` : tab}
            </button>
          ))}
        </div>

        <div className="search-box" style={{ maxWidth: '340px', minWidth: '240px' }}>
          <Search size={15} />
          <input
            type="text"
            placeholder="Search bill number or supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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

      {/* Purchases Table */}
      <div style={{
        background: 'var(--surface)',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        overflowX: 'auto'
      }}>
        <table style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>BILL / INVOICE NO</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>WHOLESALER / SUPPLIER</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>PURCHASE DATE</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>PAYMENT MODE</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>STATUS</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>BILL AMOUNT</th>
              <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center', minWidth: '210px' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading purchase bills...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Truck size={36} style={{ color: '#cbd5e1', marginBottom: '8px' }} />
                  <div>No purchase bills recorded.</div>
                  <button
                    onClick={() => setShowNewPurchase(true)}
                    className="btn btn-secondary"
                    style={{ marginTop: '12px', fontSize: '12px' }}
                  >
                    + Record First Purchase Inward
                  </button>
                </td>
              </tr>
            ) : (
              filtered.map(p => {
                const isPaid = p.status === 'PAID';
                const isPartial = p.status === 'PARTIAL';

                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--brand-primary)' }}>
                      {p.invoiceNumber}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{p.supplier.name}</div>
                      {p.supplier.gstin && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>GSTIN: {p.supplier.gstin}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {new Date(p.purchaseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        background: '#f1f5f9',
                        padding: '3px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600
                      }}>
                        {p.paymentMode}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: isPaid ? '#f0fdf4' : (isPartial ? '#fef3c7' : (p.status === 'CANCELLED' ? '#f1f5f9' : '#fef2f2')),
                        color: isPaid ? '#15803d' : (isPartial ? '#d97706' : (p.status === 'CANCELLED' ? '#64748b' : '#b91c1c'))
                      }}>
                        {p.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>
                      ₹{p.totalAmount.toFixed(2)}
                      {p.status !== 'PAID' && p.status !== 'CANCELLED' && (
                        <div style={{ fontSize: '11px', color: '#b91c1c', fontWeight: 500 }}>
                          Due: ₹{(p.totalAmount - p.paidAmount).toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                        <button
                          onClick={() => handleOpenDetails(p.id)}
                          className="btn btn-secondary btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', padding: '4px 8px' }}
                          title="View Bill details"
                        >
                          <Eye size={13} /> View
                        </button>
                        {p.status !== 'CANCELLED' && (
                          <button
                            onClick={() => {
                              setEditingPurchaseId(p.id);
                              setShowNewPurchase(true);
                            }}
                            className="btn btn-sm"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11.5px',
                              fontWeight: '600',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1px solid #93c5fd',
                              padding: '4px 8px',
                              cursor: 'pointer',
                              borderRadius: '4px'
                            }}
                            title="Edit purchase bill"
                          >
                            <Edit2 size={13} /> Edit
                          </button>
                        )}
                        {p.status !== 'CANCELLED' && (
                          <button
                            onClick={() => handleDeletePurchase(p.id, p.invoiceNumber)}
                            className="btn btn-sm"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11.5px',
                              fontWeight: '600',
                              background: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fca5a5',
                              padding: '4px 8px',
                              cursor: 'pointer',
                              borderRadius: '4px'
                            }}
                            title="Delete / Cancel purchase bill"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: View Purchase Bill Details */}
      {viewingPurchase && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '750px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                  Purchase Inward Bill #{viewingPurchase.invoiceNumber}
                </h3>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Supplier: <strong>{viewingPurchase.supplier?.name}</strong> | Date: {new Date(viewingPurchase.purchaseDate).toLocaleDateString('en-IN')}
                </div>
              </div>
              <button
                onClick={() => setViewingPurchase(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Supplier & Bill Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '12px' }}>
                <div>
                  <div><strong>Wholesaler:</strong> {viewingPurchase.supplier?.name}</div>
                  <div><strong>GSTIN:</strong> {viewingPurchase.supplier?.gstin || '—'}</div>
                  <div><strong>Drug License:</strong> {viewingPurchase.supplier?.drugLicenseNo || '—'}</div>
                </div>
                <div>
                  <div><strong>Payment Mode:</strong> {viewingPurchase.paymentMode}</div>
                  <div><strong>Status:</strong> <span style={{ fontWeight: 700 }}>{viewingPurchase.status}</span></div>
                  <div><strong>Recorded By:</strong> {viewingPurchase.createdByUser}</div>
                </div>
              </div>

              {/* Items Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>MEDICINE</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>BATCH</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>EXPIRY</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>QTY + FREE</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>PTR (₹)</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>MRP (₹)</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>GST %</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>TOTAL (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingPurchase.items?.map((item: any) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px' }}>
                        <strong>{item.medicineName}</strong>
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{item.sku}</div>
                      </td>
                      <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 600 }}>{item.batchNumber}</td>
                      <td style={{ padding: '8px' }}>{new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        {item.quantity} {item.freeQuantity > 0 ? `+ ${item.freeQuantity} Free` : ''} {item.unit}s
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>₹{item.purchaseRate.toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>₹{item.mrp.toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{item.gstRate}%</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>₹{item.totalAmount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Total Breakdown */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Taxable Amount:</span>
                    <span>₹{viewingPurchase.taxableAmount?.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>CGST (50%):</span>
                    <span>₹{viewingPurchase.cgstAmount?.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>SGST (50%):</span>
                    <span>₹{viewingPurchase.sgstAmount?.toFixed(2)}</span>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '14px' }}>
                    <span>Grand Total:</span>
                    <span style={{ color: 'var(--brand-primary)' }}>₹{viewingPurchase.totalAmount?.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                    <span>Paid:</span>
                    <span>₹{viewingPurchase.paidAmount?.toFixed(2)}</span>
                  </div>
                  {viewingPurchase.totalAmount > viewingPurchase.paidAmount && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626', fontWeight: 600 }}>
                      <span>Balance Due:</span>
                      <span>₹{(viewingPurchase.totalAmount - viewingPurchase.paidAmount).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              {viewingPurchase.status !== 'PAID' ? (
                <button
                  onClick={() => {
                    setPaymentAmount(String(viewingPurchase.totalAmount - viewingPurchase.paidAmount));
                    setShowPaymentModal(true);
                  }}
                  className="btn btn-primary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <CreditCard size={14} /> Record Payment
                </button>
              ) : (
                <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={14} /> Fully Paid
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {viewingPurchase.status !== 'CANCELLED' && (
                  <button
                    onClick={() => {
                      const id = viewingPurchase.id;
                      setViewingPurchase(null);
                      setEditingPurchaseId(id);
                      setShowNewPurchase(true);
                    }}
                    className="btn btn-sm"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: '#eff6ff',
                      color: '#2563eb',
                      border: '1px solid #bfdbfe'
                    }}
                  >
                    <Edit2 size={14} /> Edit Bill
                  </button>
                )}
                {viewingPurchase.status !== 'CANCELLED' && (
                  <button
                    onClick={() => handleDeletePurchase(viewingPurchase.id, viewingPurchase.invoiceNumber)}
                    className="btn btn-sm"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: '#fef2f2',
                      color: '#dc2626',
                      border: '1px solid #fca5a5',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Trash2 size={14} /> Delete Bill
                  </button>
                )}
                <button
                  onClick={() => setViewingPurchase(null)}
                  className="btn btn-secondary btn-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Record Payment Towards Purchase */}
      {showPaymentModal && viewingPurchase && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '400px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Record Payment to Supplier</h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                Supplier: <strong>{viewingPurchase.supplier?.name}</strong>
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                Balance Due on Bill #{viewingPurchase.invoiceNumber}: <strong>₹{(viewingPurchase.totalAmount - viewingPurchase.paidAmount).toFixed(2)}</strong>
              </div>

              <div className="form-group">
                <label className="label">Payment Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  max={viewingPurchase.totalAmount - viewingPurchase.paidAmount}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="input"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recordingPayment}
                  className="btn btn-primary btn-sm"
                >
                  {recordingPayment ? 'Recording...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

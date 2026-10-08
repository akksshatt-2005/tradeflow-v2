import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Printer } from 'lucide-react';
import { MultiItemReturnSlip } from './MultiPatientReturnModal';

interface MultiItemReturnSlipModalProps {
  slip: MultiItemReturnSlip | null;
  onClose: () => void;
}

export const MultiItemReturnSlipModal: React.FC<MultiItemReturnSlipModalProps> = ({
  slip,
  onClose
}) => {
  const { activeCompany } = useAuth();

  if (!slip) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
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
        zIndex: 350,
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
            Voucher #: {slip.voucherNumber}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Date: {new Date(slip.createdAt).toLocaleString('en-IN')}
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
            <strong style={{ color: '#0f172a' }}>{slip.patientName}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>Reason: </span>
            <span style={{ color: '#0f172a' }}>{slip.reason}</span>
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
            {slip.items.map((itm, i) => (
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
            ₹{slip.totalRefundAmount.toFixed(2)}
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
            Processed by: <strong>{slip.createdByUser || 'Staff'}</strong>
          </div>
          <div style={{ textAlign: 'right' }}>Pharmacist Signature: _____________</div>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <button
            onClick={onClose}
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
            Close
          </button>
          <button
            onClick={handlePrint}
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
  );
};

export default MultiItemReturnSlipModal;

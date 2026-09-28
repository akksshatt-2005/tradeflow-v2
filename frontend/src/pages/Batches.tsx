import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import {
  Layers,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Calendar,
  Filter,
  Search,
  IndianRupee
} from 'lucide-react';

interface ExpiringBatch {
  batchId: string;
  itemId: string;
  medicineName: string;
  genericName?: string | null;
  sku: string;
  batchNumber: string;
  expiryDate: string;
  daysRemaining: number;
  isExpired: boolean;
  currentStock: number;
  unit: string;
  mrp: number;
  ptr: number;
}

export default function Batches() {
  const { activeCompany } = useAuth();
  const [batches, setBatches] = useState<ExpiringBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'near_expiry' | 'expired'>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchExpiringBatches();
  }, [activeCompany?.id]);

  const fetchExpiringBatches = async () => {
    if (!activeCompany) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<{ expiringBatches: ExpiringBatch[] }>('/api/inventory/expiring', {
        companyId: activeCompany.id
      });
      setBatches(res.expiringBatches || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load batch alerts');
    } finally {
      setLoading(false);
    }
  };

  const filtered = batches.filter(b => {
    const matchesSearch = b.medicineName.toLowerCase().includes(search.toLowerCase()) ||
      b.batchNumber.toLowerCase().includes(search.toLowerCase()) ||
      b.sku.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    if (filterType === 'expired') return b.isExpired;
    if (filterType === 'near_expiry') return !b.isExpired && b.daysRemaining <= 90;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
          Batch Inventory & Expiry Tracker
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
          Real-time tracking of medicine batches, near-expiry alerts (within 90 days), and expired stock protection.
        </p>
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
          <button
            onClick={() => setFilterType('all')}
            className={`btn ${filterType === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            All Alert Batches ({batches.length})
          </button>
          <button
            onClick={() => setFilterType('near_expiry')}
            className={`btn ${filterType === 'near_expiry' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            Near Expiry &lt;90 Days ({batches.filter(b => !b.isExpired && b.daysRemaining <= 90).length})
          </button>
          <button
            onClick={() => setFilterType('expired')}
            className={`btn ${filterType === 'expired' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '12px', padding: '6px 12px', color: filterType === 'expired' ? '#fff' : 'var(--status-danger)' }}
          >
            Expired ({batches.filter(b => b.isExpired).length})
          </button>
        </div>

        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search batch or medicine..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
            style={{ paddingLeft: '32px', fontSize: '12px', height: '34px' }}
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

      {/* Batches Table */}
      <div style={{
        background: 'var(--surface)',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>MEDICINE NAME</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>BATCH NO</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>EXPIRY DATE</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>STATUS / COUNTDOWN</th>
              <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>STOCK</th>
              <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>STOCK VALUE (PTR)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading batch inventories...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <CheckCircle2 size={36} style={{ color: '#10b981', marginBottom: '8px' }} />
                  <div>No near-expiry or expired batches found! All stock is healthy.</div>
                </td>
              </tr>
            ) : (
              filtered.map((b) => {
                const exp = new Date(b.expiryDate);
                const stockVal = b.currentStock * b.ptr;

                return (
                  <tr key={b.batchId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{b.medicineName}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{b.sku}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 600 }}>
                      {b.batchNumber}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {exp.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {b.isExpired ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: '#fef2f2',
                          color: '#b91c1c',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600
                        }}>
                          <XCircle size={12} />
                          EXPIRED ({Math.abs(b.daysRemaining)} days ago)
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: '#fffbeb',
                          color: '#b45309',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600
                        }}>
                          <AlertTriangle size={12} />
                          Expires in {b.daysRemaining} days
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>
                      {b.currentStock} {b.unit}s
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>
                      ₹{stockVal.toFixed(2)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

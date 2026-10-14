import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import * as XLSX from 'xlsx';
import { getLocalDateString } from '../utils/dateUtils';
import {
  Building2,
  Package,
  IndianRupee,
  TrendingUp,
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Clock,
  Layers,
  Sparkles,
  ArrowUpDown
} from 'lucide-react';

export interface BatchStockDetail {
  id: string;
  batchNumber: string;
  expiryDate: string;
  currentStock: number;
  strips: number;
  looseQty: number;
  ptr: number;
  mrp: number;
  lineCost: number;
  lineRetail: number;
  isNearExpiry: boolean;
  isExpired: boolean;
}

export interface MedicineStockDetail {
  id: string;
  name: string;
  sku: string;
  genericName: string | null;
  unit: string;
  conversionFactor: number;
  totalUnits: number;
  totalStrips: number;
  stockValueCost: number;
  stockValueRetail: number;
  batches: BatchStockDetail[];
}

export interface ManufacturerStockSummary {
  manufacturer: string;
  itemCount: number;
  totalUnits: number;
  totalStrips: number;
  stockValueCost: number;
  stockValueRetail: number;
  marginAmount: number;
  marginPercent: number;
  nearExpiryCount: number;
  expiredCount: number;
  medicines: MedicineStockDetail[];
}

export interface StockSummaryKPIs {
  totalManufacturers: number;
  totalMedicines: number;
  activeBatches: number;
  totalUnits: number;
  totalStockCost: number;
  totalStockRetail: number;
  totalProjectedMargin: number;
  averageMarginPercent: number;
}

export default function ManufacturerStockReport() {
  const { activeCompany } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<StockSummaryKPIs | null>(null);
  const [manufacturers, setManufacturers] = useState<ManufacturerStockSummary[]>([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'cost_desc' | 'retail_desc' | 'units_desc' | 'name_asc'>('cost_desc');
  const [onlyExpiring, setOnlyExpiring] = useState(false);
  const [expandedMfgs, setExpandedMfgs] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchManufacturerStock();
  }, [activeCompany?.id]);

  const fetchManufacturerStock = async () => {
    if (!activeCompany) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<{
        summary: StockSummaryKPIs;
        manufacturers: ManufacturerStockSummary[];
      }>('/api/settlements/manufacturer-stock', {
        companyId: activeCompany.id
      });
      setSummary(res.summary || null);
      setManufacturers(res.manufacturers || []);
    } catch (err: any) {
      console.error('Error fetching manufacturer stock report:', err);
      setError(err.message || 'Failed to fetch manufacturer stock report');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (mfgName: string) => {
    setExpandedMfgs(prev => {
      const next = new Set(prev);
      if (next.has(mfgName)) {
        next.delete(mfgName);
      } else {
        next.add(mfgName);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedMfgs(new Set(manufacturers.map(m => m.manufacturer)));
  };

  const collapseAll = () => {
    setExpandedMfgs(new Set());
  };

  // Filtered & Sorted Manufacturers
  const filteredManufacturers = useMemo(() => {
    let list = [...manufacturers];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(m => {
        const matchesMfg = m.manufacturer.toLowerCase().includes(q);
        const matchesMed = m.medicines.some(med =>
          med.name.toLowerCase().includes(q) ||
          (med.genericName && med.genericName.toLowerCase().includes(q)) ||
          med.sku.toLowerCase().includes(q)
        );
        return matchesMfg || matchesMed;
      });
    }

    if (onlyExpiring) {
      list = list.filter(m => m.nearExpiryCount > 0 || m.expiredCount > 0);
    }

    list.sort((a, b) => {
      if (sortBy === 'cost_desc') return b.stockValueCost - a.stockValueCost;
      if (sortBy === 'retail_desc') return b.stockValueRetail - a.stockValueRetail;
      if (sortBy === 'units_desc') return b.totalUnits - a.totalUnits;
      if (sortBy === 'name_asc') return a.manufacturer.localeCompare(b.manufacturer);
      return 0;
    });

    return list;
  }, [manufacturers, search, sortBy, onlyExpiring]);

  // Export to Excel
  const handleExportExcel = () => {
    if (!manufacturers || manufacturers.length === 0) return;

    // Sheet 1: Manufacturer Summary
    const summaryData = manufacturers.map((m, index) => ({
      'S.No': index + 1,
      'Manufacturer Name': m.manufacturer,
      'Total SKUs / Medicines': m.itemCount,
      'Total Base Units': m.totalUnits,
      'Total Strips Approx': m.totalStrips,
      'Stock Value at Cost (₹ PTR)': m.stockValueCost,
      'Stock Value at Retail (₹ MRP)': m.stockValueRetail,
      'Margin Amount (₹)': m.marginAmount,
      'Margin (%)': `${m.marginPercent}%`,
      'Near Expiry Batches (<=90d)': m.nearExpiryCount,
      'Expired Batches': m.expiredCount
    }));

    // Sheet 2: Detailed Line Items
    const detailData: any[] = [];
    manufacturers.forEach(m => {
      m.medicines.forEach(med => {
        med.batches.forEach(b => {
          detailData.push({
            'Manufacturer': m.manufacturer,
            'Medicine Name': med.name,
            'Generic Name': med.genericName || '—',
            'SKU': med.sku,
            'Unit': med.unit,
            'Pack Factor': med.conversionFactor,
            'Batch Number': b.batchNumber,
            'Expiry Date': b.expiryDate,
            'Status': b.isExpired ? 'EXPIRED' : (b.isNearExpiry ? 'NEAR EXPIRY' : 'GOOD'),
            'Strips': b.strips,
            'Loose Qty': b.looseQty,
            'Total Base Units': b.currentStock,
            'Unit PTR (Cost)': b.ptr,
            'Unit MRP (Retail)': b.mrp,
            'Line Cost Value (₹)': b.lineCost,
            'Line Retail Value (₹)': b.lineRetail
          });
        });
      });
    });

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    const wsDetail = XLSX.utils.json_to_sheet(detailData);

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Manufacturer Summary');
    XLSX.utils.book_append_sheet(wb, wsDetail, 'All Batches Breakdown');

    const fileName = `Manufacturer_Stock_Report_${activeCompany?.name || 'Company'}_${getLocalDateString()}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const getMfgAvatarColor = (name: string) => {
    const colors = [
      'linear-gradient(135deg, #3b82f6, #1d4ed8)',
      'linear-gradient(135deg, #10b981, #047857)',
      'linear-gradient(135deg, #8b5cf6, #6d28d9)',
      'linear-gradient(135deg, #f59e0b, #d97706)',
      'linear-gradient(135deg, #ec4899, #be185d)',
      'linear-gradient(135deg, #06b6d4, #0e7490)'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Section Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={22} color="#0284c7" /> Manufacturer Stock & Valuation Report
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
            Real-time breakdown of medicine inventory, capital invested (₹ PTR), and potential retail value (₹ MRP) per pharmaceutical manufacturer.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={fetchManufacturerStock}
            disabled={loading}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '7px 14px' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button
            onClick={handleExportExcel}
            disabled={loading || manufacturers.length === 0}
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              padding: '7px 16px',
              background: '#0284c7',
              borderColor: '#0284c7',
              fontWeight: 600
            }}
          >
            <Download size={14} /> Export to Excel
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#b91c1c',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '13px'
        }}>
          {error}
        </div>
      )}

      {/* KPI Cards */}
      {summary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px'
        }}>
          {/* Card 1: Total Manufacturers */}
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '18px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Total Manufacturers</span>
              <div style={{
                background: '#e0f2fe',
                color: '#0284c7',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Building2 size={18} />
              </div>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>
              {summary.totalManufacturers}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Across <strong>{summary.totalMedicines}</strong> distinct medicines ({summary.activeBatches} active batches)
            </div>
          </div>

          {/* Card 2: Stock at Cost (PTR) */}
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '18px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Total Stock Value at Cost (PTR)</span>
              <div style={{
                background: '#ecfdf5',
                color: '#059669',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Package size={18} />
              </div>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#059669' }}>
              ₹{summary.totalStockCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Total purchase capital currently holding in stock
            </div>
          </div>

          {/* Card 3: Stock at Retail (MRP) */}
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '18px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Total Stock Value at Retail (MRP)</span>
              <div style={{
                background: '#fef3c7',
                color: '#d97706',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <IndianRupee size={18} />
              </div>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>
              ₹{summary.totalStockRetail.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Maximum retail revenue value at 100% sale
            </div>
          </div>

          {/* Card 4: Potential Gross Margin */}
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '18px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Projected Gross Profit</span>
              <div style={{
                background: '#f3e8ff',
                color: '#9333ea',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <TrendingUp size={18} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '26px', fontWeight: 800, color: '#9333ea' }}>
                ₹{summary.totalProjectedMargin.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#15803d',
                background: '#dcfce7',
                padding: '2px 8px',
                borderRadius: '12px'
              }}>
                +{summary.averageMarginPercent}%
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Average potential markup over cost
            </div>
          </div>
        </div>
      )}

      {/* Toolbar & Filters */}
      <div style={{
        background: '#ffffff',
        padding: '14px 18px',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search manufacturer or medicine name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              fontSize: '13px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              outline: 'none'
            }}
          />
        </div>

        {/* Sort & Quick Filter Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowUpDown size={14} color="#64748b" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                fontSize: '13px',
                padding: '7px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="cost_desc">Sort: Highest Cost Value (₹ PTR)</option>
              <option value="retail_desc">Sort: Highest Retail Value (₹ MRP)</option>
              <option value="units_desc">Sort: Most Units / Strips</option>
              <option value="name_asc">Sort: Manufacturer Name (A-Z)</option>
            </select>
          </div>

          <button
            onClick={() => setOnlyExpiring(!onlyExpiring)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid',
              borderColor: onlyExpiring ? '#fca5a5' : '#cbd5e1',
              background: onlyExpiring ? '#fef2f2' : '#ffffff',
              color: onlyExpiring ? '#dc2626' : '#475569',
              fontWeight: onlyExpiring ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <AlertTriangle size={14} /> Expiring Soon Only
          </button>

          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={expandAll}
              style={{
                fontSize: '12px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                cursor: 'pointer',
                color: '#475569'
              }}
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              style={{
                fontSize: '12px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                cursor: 'pointer',
                color: '#475569'
              }}
            >
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* Manufacturer List / Cards */}
      {loading ? (
        <div style={{
          padding: '48px 24px',
          textAlign: 'center',
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          color: '#64748b'
        }}>
          <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: '14px', fontWeight: 600 }}>Calculating real-time manufacturer inventory & valuation...</div>
        </div>
      ) : filteredManufacturers.length === 0 ? (
        <div style={{
          padding: '48px 24px',
          textAlign: 'center',
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          color: '#64748b'
        }}>
          <Building2 size={36} style={{ color: '#cbd5e1', margin: '0 auto 12px' }} />
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>No manufacturers match your filter</div>
          <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
            Try clearing the search query or adjusting your filters.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredManufacturers.map((mfg) => {
            const isExpanded = expandedMfgs.has(mfg.manufacturer);
            const avatarBg = getMfgAvatarColor(mfg.manufacturer);

            return (
              <div
                key={mfg.manufacturer}
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  border: isExpanded ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
                  boxShadow: isExpanded ? '0 4px 12px rgba(2, 132, 199, 0.08)' : '0 1px 3px rgba(0,0,0,0.03)',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Manufacturer Summary Header Row */}
                <div
                  onClick={() => toggleExpand(mfg.manufacturer)}
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    background: isExpanded ? '#f8fafc' : '#ffffff',
                    borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}
                >
                  {/* Left: Avatar + Name + Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '260px', flex: 2 }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: avatarBg,
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '16px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                    }}>
                      {mfg.manufacturer.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                          {mfg.manufacturer}
                        </h4>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          background: '#e2e8f0',
                          color: '#475569',
                          padding: '2px 8px',
                          borderRadius: '10px'
                        }}>
                          {mfg.itemCount} {mfg.itemCount === 1 ? 'medicine' : 'medicines'}
                        </span>
                        {mfg.nearExpiryCount > 0 && (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            background: '#fef3c7',
                            color: '#b45309',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <Clock size={12} /> {mfg.nearExpiryCount} near expiry
                          </span>
                        )}
                        {mfg.expiredCount > 0 && (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            background: '#fee2e2',
                            color: '#b91c1c',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <AlertTriangle size={12} /> {mfg.expiredCount} expired
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        Total in stock: <strong style={{ color: '#0f172a' }}>{mfg.totalUnits.toLocaleString('en-IN')} units</strong>
                      </div>
                    </div>
                  </div>

                  {/* Middle/Right: Valuation Figures */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '24px',
                    flexWrap: 'wrap',
                    justifyContent: 'flex-end',
                    flex: 3
                  }}>
                    {/* Cost Value (PTR) */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                        Stock Cost (PTR)
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#059669' }}>
                        ₹{mfg.stockValueCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>

                    {/* Retail Value (MRP) */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                        Stock Retail (MRP)
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                        ₹{mfg.stockValueRetail.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>

                    {/* Margin */}
                    <div style={{ textAlign: 'right', minWidth: '90px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                        Margin
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#15803d' }}>
                        ₹{mfg.marginAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span style={{ fontSize: '11px', fontWeight: 600, marginLeft: '4px', color: '#16a34a' }}>
                          (+{mfg.marginPercent}%)
                        </span>
                      </div>
                    </div>

                    {/* Chevron toggle */}
                    <div style={{
                      color: isExpanded ? '#0284c7' : '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      fontWeight: 600
                    }}>
                      <span>{isExpanded ? 'Hide' : 'View'}</span>
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>
                </div>

                {/* Expanded Drill-Down Sub-Table */}
                {isExpanded && (
                  <div style={{ padding: '16px 20px', background: '#fafbfc' }}>
                    <div style={{
                      overflowX: 'auto',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff'
                    }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                            <th style={{ padding: '10px 14px', fontWeight: 600 }}>Medicine & Generic</th>
                            <th style={{ padding: '10px 14px', fontWeight: 600 }}>SKU</th>
                            <th style={{ padding: '10px 14px', fontWeight: 600 }}>Batch & Expiry</th>
                            <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Stock (Strips / Units)</th>
                            <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>PTR (Cost)</th>
                            <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>MRP (Retail)</th>
                            <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Total Cost (₹)</th>
                            <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Total Retail (₹)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mfg.medicines.map((med) => {
                            return med.batches.map((b, bIdx) => {
                              const isFirst = bIdx === 0;
                              return (
                                <tr
                                  key={b.id}
                                  style={{
                                    borderBottom: '1px solid #f1f5f9',
                                    background: b.isExpired ? '#fef2f2' : (b.isNearExpiry ? '#fffbeb' : '#ffffff')
                                  }}
                                >
                                  {/* Medicine Name (Rowspan-like display for first batch) */}
                                  <td style={{ padding: '10px 14px' }}>
                                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{med.name}</div>
                                    {med.genericName && (
                                      <div style={{ fontSize: '11px', color: '#64748b' }}>{med.genericName}</div>
                                    )}
                                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                      Pack: 1*{med.conversionFactor} {med.unit}
                                    </div>
                                  </td>

                                  <td style={{ padding: '10px 14px', color: '#64748b', fontFamily: 'monospace' }}>
                                    {med.sku}
                                  </td>

                                  {/* Batch Number & Expiry Badge */}
                                  <td style={{ padding: '10px 14px' }}>
                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                      {b.batchNumber}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                      <span style={{
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        color: b.isExpired ? '#dc2626' : (b.isNearExpiry ? '#b45309' : '#16a34a')
                                      }}>
                                        Exp: {b.expiryDate}
                                      </span>
                                      {b.isExpired && (
                                        <span style={{ fontSize: '10px', background: '#fee2e2', color: '#b91c1c', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                          EXPIRED
                                        </span>
                                      )}
                                      {!b.isExpired && b.isNearExpiry && (
                                        <span style={{ fontSize: '10px', background: '#fef3c7', color: '#b45309', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                          NEAR EXPIRY
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Stock Quantity */}
                                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                    <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                      {b.strips > 0 && `${b.strips} Str`}
                                      {b.strips > 0 && b.looseQty > 0 && ' + '}
                                      {b.looseQty > 0 && `${b.looseQty} tab`}
                                      {b.strips === 0 && b.looseQty === 0 && '0'}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                                      ({b.currentStock} units)
                                    </div>
                                  </td>

                                  {/* PTR */}
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#475569' }}>
                                    ₹{b.ptr.toFixed(2)}
                                  </td>

                                  {/* MRP */}
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#475569' }}>
                                    ₹{b.mrp.toFixed(2)}
                                  </td>

                                  {/* Total Line Cost */}
                                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                                    ₹{b.lineCost.toFixed(2)}
                                  </td>

                                  {/* Total Line Retail */}
                                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                                    ₹{b.lineRetail.toFixed(2)}
                                  </td>
                                </tr>
                              );
                            });
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                            <td colSpan={3} style={{ padding: '10px 14px', color: '#0f172a' }}>
                              Subtotal for {mfg.manufacturer} ({mfg.itemCount} medicines)
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', color: '#0f172a' }}>
                              {mfg.totalUnits.toLocaleString('en-IN')} units
                            </td>
                            <td colSpan={2}></td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', color: '#059669', fontSize: '13px' }}>
                              ₹{mfg.stockValueCost.toFixed(2)}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', color: '#0f172a', fontSize: '13px' }}>
                              ₹{mfg.stockValueRetail.toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

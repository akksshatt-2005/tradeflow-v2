import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, getAccessToken } from '../api/client';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Search,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Layers,
  ArrowRight,
  RefreshCw,
  FileText,
  DollarSign,
  Building,
  Hash,
  Clock,
  Printer,
  ChevronRight
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : 'https://tradeflow-v2-1.onrender.com');

type GstSubTab = 'gstr3b' | 'gstr1' | 'gstr2' | 'gstr4' | 'hsn' | 'datewise' | 'partywise';

export default function GstReports() {
  const { activeCompany } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<GstSubTab>('gstr3b');

  // Date Range state
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const [startDate, setStartDate] = useState(`${year}-${month}-01`);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  // Loading & Data states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hsnType, setHsnType] = useState<'sales' | 'purchase'>('sales');

  // Report payloads
  const [gstr3bData, setGstr3bData] = useState<any>(null);
  const [gstr1Data, setGstr1Data] = useState<any>(null);
  const [gstr2Data, setGstr2Data] = useState<any>(null);
  const [gstr4Data, setGstr4Data] = useState<any>(null);
  const [hsnData, setHsnData] = useState<any[]>([]);
  const [datewiseData, setDatewiseData] = useState<any[]>([]);
  const [partywiseData, setPartywiseData] = useState<any[]>([]);
  const [downloadingExcel, setDownloadingExcel] = useState(false);

  // Quick Date Selectors
  const applyQuickDate = (type: 'this-month' | 'last-month' | 'this-quarter' | 'fy-all') => {
    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth();

    if (type === 'this-month') {
      const start = new Date(currYear, currMonth, 1);
      const end = new Date(currYear, currMonth + 1, 0);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(end.toISOString().split('T')[0]);
    } else if (type === 'last-month') {
      const start = new Date(currYear, currMonth - 1, 1);
      const end = new Date(currYear, currMonth, 0);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(end.toISOString().split('T')[0]);
    } else if (type === 'this-quarter') {
      const qStartMonth = Math.floor(currMonth / 3) * 3;
      const start = new Date(currYear, qStartMonth, 1);
      const end = new Date(currYear, qStartMonth + 3, 0);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(end.toISOString().split('T')[0]);
    } else if (type === 'fy-all') {
      const fyStartYear = currMonth >= 3 ? currYear : currYear - 1;
      const start = new Date(fyStartYear, 3, 1);
      const end = new Date(fyStartYear + 1, 2, 31);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(end.toISOString().split('T')[0]);
    }
  };

  const fetchReportData = async () => {
    if (!activeCompany?.id) return;
    setLoading(true);
    setError(null);

    const query = `?startDate=${startDate}&endDate=${endDate}`;

    try {
      if (activeSubTab === 'gstr3b') {
        const data = await api.get(`/gst/gstr3b${query}`, { companyId: activeCompany.id });
        setGstr3bData(data);
      } else if (activeSubTab === 'gstr1') {
        const data = await api.get(`/gst/gstr1${query}`, { companyId: activeCompany.id });
        setGstr1Data(data);
      } else if (activeSubTab === 'gstr2') {
        const data = await api.get(`/gst/gstr2${query}`, { companyId: activeCompany.id });
        setGstr2Data(data);
      } else if (activeSubTab === 'gstr4') {
        const data = await api.get(`/gst/gstr4${query}`, { companyId: activeCompany.id });
        setGstr4Data(data);
      } else if (activeSubTab === 'hsn') {
        const data = await api.get(`/gst/hsn-summary${query}&type=${hsnType}`, { companyId: activeCompany.id });
        setHsnData(data.hsnSummary || []);
      } else if (activeSubTab === 'datewise') {
        const data = await api.get(`/gst/datewise-register${query}`, { companyId: activeCompany.id });
        setDatewiseData(data.dailyRecords || []);
      } else if (activeSubTab === 'partywise') {
        const data = await api.get(`/gst/partywise-sales${query}`, { companyId: activeCompany.id });
        setPartywiseData(data.parties || []);
      }
    } catch (err: any) {
      console.error('Error fetching GST report:', err);
      setError(err.message || 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [activeSubTab, startDate, endDate, hsnType, activeCompany?.id]);

  // Excel Download Handler
  const handleDownloadExcel = async () => {
    if (!activeCompany?.id) return;
    setDownloadingExcel(true);
    try {
      const token = getAccessToken();
      const url = `${API_BASE_URL}/gst/export-excel?startDate=${startDate}&endDate=${endDate}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-company-id': activeCompany.id
        }
      });

      if (!res.ok) throw new Error('Failed to generate Excel download');

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const cleanName = activeCompany.name.replace(/[^a-zA-Z0-9]/g, '_');
      a.download = `TradeFlow_GST_${cleanName}_${startDate}_to_${endDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      alert('Error downloading Excel: ' + (err.message || 'Server error'));
    } finally {
      setDownloadingExcel(false);
    }
  };

  const navTabs = [
    { id: 'gstr3b', label: 'GSTR-3B Summary', icon: DollarSign },
    { id: 'gstr1', label: 'GSTR-1 (Sales)', icon: FileText },
    { id: 'gstr2', label: 'GSTR-2 (Purchases/ITC)', icon: Layers },
    { id: 'hsn', label: 'HSN Summary', icon: Hash },
    { id: 'datewise', label: 'Date-wise Sales/Pur', icon: Clock },
    { id: 'partywise', label: 'Date/Party-wise GST', icon: Building },
    { id: 'gstr4', label: 'GSTR-4 (Composition)', icon: CheckCircle2 },
  ];

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px', color: '#0f172a' }}>
      
      {/* Top Banner Card */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '16px 20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ backgroundColor: '#0f766e', color: '#ffffff', padding: '6px', borderRadius: '6px', display: 'flex' }}>
                <FileSpreadsheet size={20} />
              </div>
              <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#0f172a', letterSpacing: '-0.02em' }}>
                GST & Statutory Tax Compliance Portal
              </h1>
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: '#f0fdf4',
                color: '#166534',
                border: '1px solid #bbf7d0',
                padding: '2px 8px',
                borderRadius: '4px'
              }}>
                GSTIN: {activeCompany?.gstin || 'UNREGISTERED / COMPOSITION'}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              Official monthly GST returns, Input Tax Credit (ITC) reconciliation, HSN breakdown, and Chartered Accountant export.
            </p>
          </div>

          {/* Action Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Date Pickers */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '12px'
            }}>
              <span style={{ color: '#64748b', fontWeight: 600 }}>From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '3px 6px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  outline: 'none',
                  backgroundColor: '#ffffff'
                }}
              />
              <span style={{ color: '#64748b', fontWeight: 600, marginLeft: '4px' }}>To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '3px 6px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  outline: 'none',
                  backgroundColor: '#ffffff'
                }}
              />
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => fetchReportData()}
              title="Refresh Report Data"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '7px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                color: '#475569',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>

            {/* Download Excel Button */}
            <button
              onClick={handleDownloadExcel}
              disabled={downloadingExcel}
              style={{
                backgroundColor: '#0f766e',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 14px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: downloadingExcel ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                opacity: downloadingExcel ? 0.6 : 1
              }}
              onMouseEnter={(e) => { if (!downloadingExcel) e.currentTarget.style.backgroundColor = '#115e59'; }}
              onMouseLeave={(e) => { if (!downloadingExcel) e.currentTarget.style.backgroundColor = '#0f766e'; }}
            >
              <Download size={14} />
              {downloadingExcel ? 'Exporting...' : 'Export Excel for CA'}
            </button>
          </div>
        </div>

        {/* Quick Date Presets Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: '1px solid #f1f5f9',
          fontSize: '11.5px'
        }}>
          <span style={{ color: '#94a3b8', fontWeight: 600 }}>Quick Presets:</span>
          {[
            { id: 'this-month', label: 'This Month' },
            { id: 'last-month', label: 'Last Month' },
            { id: 'this-quarter', label: 'This Quarter' },
            { id: 'fy-all', label: 'Full Financial Year (FY 26-27)' }
          ].map(p => (
            <button
              key={p.id}
              onClick={() => applyQuickDate(p.id as any)}
              style={{
                backgroundColor: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '11.5px',
                color: '#334155',
                cursor: 'pointer',
                fontWeight: 500
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-Tab Navigation Strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '5px',
        overflowX: 'auto'
      }}>
        {navTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: isActive ? '#0f766e' : 'transparent',
                color: isActive ? '#ffffff' : '#475569',
                fontSize: '12px',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = '#f1f5f9';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <Icon size={14} color={isActive ? '#ffffff' : '#64748b'} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main Tab Content */}
      {loading ? (
        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '60px 20px',
          textAlign: 'center',
          color: '#64748b',
          fontSize: '13px'
        }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px', color: '#0f766e' }} />
          Calculating statutory GST liability and Input Tax Credit balances...
        </div>
      ) : error ? (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          padding: '14px 18px',
          color: '#b91c1c',
          fontSize: '12.5px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <AlertCircle size={18} />
          <span>Error loading GST data: {error}</span>
        </div>
      ) : (
        <div>
          {/* TAB 1: GSTR-3B SUMMARY */}
          {activeSubTab === 'gstr3b' && gstr3bData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* 3 Master Metric Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                {/* Outward Tax Liability Card */}
                <div style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '11.5px', fontWeight: 600 }}>
                    <span>1. Outward Tax Liability (Sales)</span>
                    <TrendingUp size={16} color="#059669" />
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', margin: '4px 0 2px' }}>
                    ₹{gstr3bData.outwardSupplies.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    Taxable: ₹{gstr3bData.outwardSupplies.taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({gstr3bData.outwardSupplies.invoiceCount} sales bills)
                  </div>
                </div>

                {/* Net Eligible ITC Card */}
                <div style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '11.5px', fontWeight: 600 }}>
                    <span>2. Net Eligible ITC (Purchases)</span>
                    <TrendingDown size={16} color="#2563eb" />
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#1d4ed8', fontFamily: 'monospace', margin: '4px 0 2px' }}>
                    ₹{gstr3bData.netEligibleITC.totalITC.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    Gross Purchases ITC: ₹{gstr3bData.inwardSupplies.totalITC.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({gstr3bData.inwardSupplies.purchaseCount} bills)
                  </div>
                </div>

                {/* Net Cash Payable Card */}
                <div style={{
                  backgroundColor: gstr3bData.netTaxPayable.totalPayable > 0 ? '#fffbeb' : '#f0fdf4',
                  border: `1px solid ${gstr3bData.netTaxPayable.totalPayable > 0 ? '#fde68a' : '#bbf7d0'}`,
                  borderRadius: '8px',
                  padding: '14px 16px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '11.5px', fontWeight: 600 }}>
                    <span>3. Net Cash Payable to Govt</span>
                    <DollarSign size={16} color={gstr3bData.netTaxPayable.totalPayable > 0 ? '#d97706' : '#16a34a'} />
                  </div>
                  <div style={{
                    fontSize: '22px',
                    fontWeight: 800,
                    color: gstr3bData.netTaxPayable.totalPayable > 0 ? '#b45309' : '#15803d',
                    fontFamily: 'monospace',
                    margin: '4px 0 2px'
                  }}>
                    ₹{gstr3bData.netTaxPayable.totalPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    {gstr3bData.itcCarryForward.totalBalance > 0
                      ? `Excess ITC to carry forward: ₹${gstr3bData.itcCarryForward.totalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                      : 'All tax covered by eligible purchases.'}
                  </div>
                </div>
              </div>

              {/* Master Statutory Grid Table */}
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{
                  backgroundColor: '#f8fafc',
                  padding: '10px 16px',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>
                    GSTR-3B Statutory Tax Matrix ({gstr3bData.period.startDate} to {gstr3bData.period.endDate})
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>All figures in Indian Rupees (INR)</span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                        <th style={{ padding: '9px 14px', textAlign: 'left' }}>Description / Statutory Head</th>
                        <th style={{ padding: '9px 14px', textAlign: 'right' }}>Taxable Value (₹)</th>
                        <th style={{ padding: '9px 14px', textAlign: 'right' }}>CGST (₹)</th>
                        <th style={{ padding: '9px 14px', textAlign: 'right' }}>SGST (₹)</th>
                        <th style={{ padding: '9px 14px', textAlign: 'right' }}>IGST (₹)</th>
                        <th style={{ padding: '9px 14px', textAlign: 'right' }}>Total Tax (₹)</th>
                      </tr>
                    </thead>
                    <tbody style={{ fontFamily: 'monospace' }}>
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px', fontFamily: 'sans-serif', fontWeight: 600, color: '#1e293b' }}>
                          (A) Outward Taxable Supplies (Table 3.1a - Active Sales)
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>{gstr3bData.outwardSupplies.taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#059669', fontWeight: 600 }}>{gstr3bData.outwardSupplies.cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#059669', fontWeight: 600 }}>{gstr3bData.outwardSupplies.sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#059669', fontWeight: 600 }}>{gstr3bData.outwardSupplies.igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{gstr3bData.outwardSupplies.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>

                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px', fontFamily: 'sans-serif', fontWeight: 600, color: '#1e293b' }}>
                          (B) Eligible Inward ITC (Table 4A - Inward Purchases from Suppliers)
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>{gstr3bData.inwardSupplies.taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#2563eb', fontWeight: 600 }}>{gstr3bData.inwardSupplies.cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#2563eb', fontWeight: 600 }}>{gstr3bData.inwardSupplies.sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#2563eb', fontWeight: 600 }}>{gstr3bData.inwardSupplies.igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{gstr3bData.inwardSupplies.totalITC.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>

                      {gstr3bData.itcReversal.totalReversal > 0 && (
                        <tr style={{ borderBottom: '1px solid #fecaca', backgroundColor: '#fff5f5', color: '#b91c1c' }}>
                          <td style={{ padding: '10px 14px', fontFamily: 'sans-serif', fontWeight: 600 }}>
                            (C) ITC Reversal (Table 4B - Supplier Debit Notes / Returns)
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>-{gstr3bData.itcReversal.taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>-{gstr3bData.itcReversal.cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>-{gstr3bData.itcReversal.sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>-{gstr3bData.itcReversal.igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>-{gstr3bData.itcReversal.totalReversal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      )}

                      <tr style={{ borderBottom: '2px solid #cbd5e1', backgroundColor: '#f8fafc', fontWeight: 700 }}>
                        <td style={{ padding: '10px 14px', fontFamily: 'sans-serif', color: '#0f172a' }}>
                          (D) Net Eligible ITC Available (B - C)
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748b' }}>-</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#1e40af' }}>{gstr3bData.netEligibleITC.cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#1e40af' }}>{gstr3bData.netEligibleITC.sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#1e40af' }}>{gstr3bData.netEligibleITC.igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#1e40af', fontSize: '13px' }}>{gstr3bData.netEligibleITC.totalITC.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>

                      <tr style={{ backgroundColor: '#fffbeb', borderTop: '2px solid #fde68a', fontWeight: 800 }}>
                        <td style={{ padding: '12px 14px', fontFamily: 'sans-serif', color: '#92400e' }}>
                          (E) NET TAX PAYABLE IN CASH (Table 6.1 - Payment of Tax)
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#64748b' }}>-</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#b45309' }}>{gstr3bData.netTaxPayable.cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#b45309' }}>{gstr3bData.netTaxPayable.sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#b45309' }}>{gstr3bData.netTaxPayable.igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#92400e', fontSize: '14px' }}>₹{gstr3bData.netTaxPayable.totalPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GSTR-1 OUTWARD SALES */}
          {activeSubTab === 'gstr1' && gstr1Data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Table 4: B2B Invoices</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'monospace', color: '#0f172a', margin: '2px 0' }}>{gstr1Data.b2b.count} bills</div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>Tax: ₹{gstr1Data.b2b.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                </div>

                <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Table 7: B2C Retail Bills</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'monospace', color: '#0f172a', margin: '2px 0' }}>{gstr1Data.b2cSmall.count} bills</div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>Tax: ₹{gstr1Data.b2cSmall.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                </div>

                <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Cancelled Invoices</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'monospace', color: '#dc2626', margin: '2px 0' }}>{gstr1Data.cancelled.count} bills</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Zero tax liability</div>
                </div>

                <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Table 13: Doc Range</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'monospace', color: '#0f172a', marginTop: '4px' }}>{gstr1Data.documentSummary.startingNumber}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>to {gstr1Data.documentSummary.endingNumber}</div>
                </div>
              </div>

              {/* B2B Table */}
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#f8fafc', padding: '10px 16px', borderBottom: '1px solid #e2e8f0', fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>
                  Table 4: B2B Sales (Registered Doctors, Chemists & Hospitals)
                </div>
                {gstr1Data.b2b.invoices.length === 0 ? (
                  <div style={{ padding: '36px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                    No B2B sales with GSTIN recorded in this date range. Counter walk-in patient retail bills are captured in GSTR-1 Table 7.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', maxHeight: '450px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                        <tr>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Invoice No</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Date</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Customer / Buyer</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Recipient GSTIN</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Taxable (₹)</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>CGST (₹)</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>SGST (₹)</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total GST (₹)</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total (₹)</th>
                        </tr>
                      </thead>
                      <tbody style={{ fontFamily: 'monospace' }}>
                        {gstr1Data.b2b.invoices.map((inv: any) => (
                          <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>{inv.invoiceNumber}</td>
                            <td style={{ padding: '8px 12px', color: '#64748b' }}>{inv.invoiceDate}</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'sans-serif', color: '#1e293b' }}>{inv.customerName}</td>
                            <td style={{ padding: '8px 12px', color: '#0f766e', fontWeight: 700 }}>{inv.gstin}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>{inv.taxableAmount.toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#059669' }}>{inv.cgstAmount.toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#059669' }}>{inv.sgstAmount.toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{inv.totalTax.toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{inv.grandTotal.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: GSTR-2 INWARD PURCHASES */}
          {activeSubTab === 'gstr2' && gstr2Data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '12px'
              }}>
                <div>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>Total Purchase Bills:</span> {gstr2Data.summary.count} |{' '}
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>Gross Taxable:</span> ₹{gstr2Data.summary.totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div>
                  <span style={{ fontWeight: 700, color: '#1d4ed8' }}>Total Input Tax Credit (ITC):</span> ₹{gstr2Data.summary.totalITC.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                      <tr>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Bill No</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Date</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Distributor / Supplier</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Supplier GSTIN</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Taxable (₹)</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>CGST (₹)</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>SGST (₹)</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Eligible ITC (₹)</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total (₹)</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody style={{ fontFamily: 'monospace' }}>
                      {gstr2Data.purchases.map((pur: any) => (
                        <tr key={pur.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>{pur.invoiceNumber}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>{pur.purchaseDate}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'sans-serif', color: '#1e293b' }}>{pur.supplierName}</td>
                          <td style={{ padding: '8px 12px', color: '#0f766e', fontWeight: 700 }}>{pur.supplierGstin || 'UNREGISTERED'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{pur.taxableAmount.toFixed(2)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#2563eb' }}>{pur.cgstAmount.toFixed(2)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#2563eb' }}>{pur.sgstAmount.toFixed(2)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{pur.totalTax.toFixed(2)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{pur.totalAmount.toFixed(2)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 600,
                              backgroundColor: pur.status === 'PAID' ? '#f0fdf4' : '#fffbeb',
                              color: pur.status === 'PAID' ? '#166534' : '#b45309',
                              border: `1px solid ${pur.status === 'PAID' ? '#bbf7d0' : '#fde68a'}`
                            }}>
                              {pur.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: HSN SUMMARY */}
          {activeSubTab === 'hsn' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>HSN Mode:</span>
                  <button
                    onClick={() => setHsnType('sales')}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: hsnType === 'sales' ? '#0f766e' : '#f1f5f9',
                      color: hsnType === 'sales' ? '#ffffff' : '#334155',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Outward (HSN Sales)
                  </button>
                  <button
                    onClick={() => setHsnType('purchase')}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: hsnType === 'purchase' ? '#0f766e' : '#f1f5f9',
                      color: hsnType === 'purchase' ? '#ffffff' : '#334155',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Inward (HSN Purchases)
                  </button>
                </div>

                <span style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>
                  {hsnData.length} distinct HSN codes mapped
                </span>
              </div>

              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                      <tr>
                        <th style={{ padding: '9px 12px', textAlign: 'left' }}>HSN Code</th>
                        <th style={{ padding: '9px 12px', textAlign: 'left' }}>Description</th>
                        <th style={{ padding: '9px 12px', textAlign: 'left' }}>UQC</th>
                        <th style={{ padding: '9px 12px', textAlign: 'right' }}>Total Qty Sold</th>
                        <th style={{ padding: '9px 12px', textAlign: 'right' }}>Taxable Value (₹)</th>
                        <th style={{ padding: '9px 12px', textAlign: 'right' }}>CGST (₹)</th>
                        <th style={{ padding: '9px 12px', textAlign: 'right' }}>SGST (₹)</th>
                        <th style={{ padding: '9px 12px', textAlign: 'right' }}>Total GST (₹)</th>
                        <th style={{ padding: '9px 12px', textAlign: 'right' }}>Total Value (₹)</th>
                      </tr>
                    </thead>
                    <tbody style={{ fontFamily: 'monospace' }}>
                      {hsnData.map(hsn => (
                        <tr key={hsn.hsnCode} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '9px 12px', fontWeight: 700, color: '#0f766e' }}>{hsn.hsnCode}</td>
                          <td style={{ padding: '9px 12px', fontFamily: 'sans-serif', color: '#1e293b' }}>{hsn.description}</td>
                          <td style={{ padding: '9px 12px', color: '#64748b' }}>{hsn.uqc}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right' }}>{hsn.quantity.toLocaleString('en-IN')}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right' }}>{hsn.taxableAmount.toFixed(2)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: '#059669' }}>{hsn.cgstAmount.toFixed(2)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: '#059669' }}>{hsn.sgstAmount.toFixed(2)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{hsn.totalTax.toFixed(2)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{hsn.totalAmount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: DATE-WISE SALES VS PURCHASES */}
          {activeSubTab === 'datewise' && (
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ backgroundColor: '#f8fafc', padding: '10px 16px', borderBottom: '1px solid #e2e8f0', fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>
                Day-by-Day Chronological Sales & Purchases Register
              </div>
              <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'monospace' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600, fontFamily: 'sans-serif' }}>
                    <tr>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Sales Bills</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Sales Taxable (₹)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Sales GST (₹)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total Sales (₹)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Pur Bills</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Pur Taxable (₹)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Pur ITC (₹)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total Purchases (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datewiseData.map(d => (
                      <tr key={d.date} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>{d.date}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>{d.salesCount}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{d.salesTaxable.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#059669' }}>{d.salesGst.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{d.salesTotal.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>{d.purchaseCount}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{d.purchaseTaxable.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#2563eb' }}>{d.purchaseGst.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{d.purchaseTotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: DATE/PARTY-WISE GST */}
          {activeSubTab === 'partywise' && (
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ backgroundColor: '#f8fafc', padding: '10px 16px', borderBottom: '1px solid #e2e8f0', fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>
                Customer & Party Wise Outward GST Distribution
              </div>
              <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                    <tr>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Customer / Party Name</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>GSTIN</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>State</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Bills</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Taxable Amount (₹)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>CGST (₹)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>SGST (₹)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total GST (₹)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Grand Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontFamily: 'monospace' }}>
                    {partywiseData.map(p => (
                      <tr key={p.partyName} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', fontFamily: 'sans-serif', fontWeight: 600, color: '#0f172a' }}>{p.partyName}</td>
                        <td style={{ padding: '8px 12px', color: '#0f766e', fontWeight: 700 }}>{p.gstin || '-'}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'sans-serif', color: '#64748b' }}>{p.state}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{p.invoiceCount}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{p.taxableAmount.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#059669' }}>{p.cgstAmount.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#059669' }}>{p.sgstAmount.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{p.totalTax.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{p.totalAmount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: GSTR-4 (COMPOSITION SCHEME) */}
          {activeSubTab === 'gstr4' && gstr4Data && (
            <div style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '540px',
              margin: '20px auto',
              fontSize: '12.5px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}>
              <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                  GSTR-4 Composition Scheme Summary
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '11.5px', color: '#64748b' }}>
                  Statutory 1% flat turnover tax for enrolled small pharmacy retailers.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'monospace' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontFamily: 'sans-serif', color: '#475569' }}>Total Gross Turnover:</span>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>₹{gstr4Data.grossTurnover.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontFamily: 'sans-serif', color: '#475569' }}>Composition Tax Rate:</span>
                  <span style={{ fontWeight: 700, color: '#0f766e' }}>{gstr4Data.compositionRate}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontFamily: 'sans-serif', color: '#475569' }}>CGST (0.5%):</span>
                  <span>₹{gstr4Data.taxPayable.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontFamily: 'sans-serif', color: '#475569' }}>SGST (0.5%):</span>
                  <span>₹{gstr4Data.taxPayable.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  backgroundColor: '#f0fdf4',
                  borderRadius: '6px',
                  border: '1px solid #bbf7d0',
                  marginTop: '6px',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  color: '#166534'
                }}>
                  <span style={{ fontFamily: 'sans-serif' }}>Total 1% Tax Payable:</span>
                  <span>₹{gstr4Data.taxPayable.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

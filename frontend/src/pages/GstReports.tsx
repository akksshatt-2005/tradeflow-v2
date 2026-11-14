import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, getAccessToken } from '../api/client';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Search,
  Filter,
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
  Printer
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
  const [searchQuery, setSearchQuery] = useState('');
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
      // Indian FY starts April 1
      const fyStartYear = currMonth >= 3 ? currYear : currYear - 1;
      const start = new Date(fyStartYear, 3, 1);
      const end = new Date(fyStartYear + 1, 2, 31);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(end.toISOString().split('T')[0]);
    }
  };

  // Fetch Report Data on Tab or Date change
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

  return (
    <div className="space-y-4">
      {/* Top Header & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-teal-700" />
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">GST & Statutory Tax Portal</h1>
              <span className="px-2 py-0.5 text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 rounded">
                GSTIN: {activeCompany?.gstin || 'UNREGISTERED'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Statutory GST returns, Input Tax Credit (ITC) reconciliation, HSN breakdown, and Chartered Accountant export.
            </p>
          </div>

          {/* Action buttons & Date range */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs">
              <span className="text-slate-500 font-medium">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-slate-700 focus:outline-teal-600 font-mono"
              />
              <span className="text-slate-500 font-medium ml-1">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-slate-700 focus:outline-teal-600 font-mono"
              />
            </div>

            <button
              onClick={() => fetchReportData()}
              className="p-1.5 text-slate-600 hover:text-teal-700 hover:bg-slate-100 rounded border border-slate-200 transition-colors"
              title="Refresh Report"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-600' : ''}`} />
            </button>

            <button
              onClick={handleDownloadExcel}
              disabled={downloadingExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded text-xs font-semibold transition-colors shadow-xs disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              {downloadingExcel ? 'Exporting...' : 'Export Excel for CA'}
            </button>
          </div>
        </div>

        {/* Quick Date Presets */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
          <span className="text-slate-400 font-medium">Quick Filters:</span>
          <button
            onClick={() => applyQuickDate('this-month')}
            className="px-2 py-0.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
          >
            This Month
          </button>
          <button
            onClick={() => applyQuickDate('last-month')}
            className="px-2 py-0.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
          >
            Last Month
          </button>
          <button
            onClick={() => applyQuickDate('this-quarter')}
            className="px-2 py-0.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
          >
            This Quarter
          </button>
          <button
            onClick={() => applyQuickDate('fy-all')}
            className="px-2 py-0.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
          >
            Full Financial Year (FY 26-27)
          </button>
        </div>
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div className="flex flex-wrap items-center gap-1 bg-white border border-slate-200 rounded p-1 shadow-xs">
        <button
          onClick={() => setActiveSubTab('gstr3b')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
            activeSubTab === 'gstr3b'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          GSTR-3B Summary
        </button>

        <button
          onClick={() => setActiveSubTab('gstr1')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
            activeSubTab === 'gstr1'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          GSTR-1 (Sales)
        </button>

        <button
          onClick={() => setActiveSubTab('gstr2')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
            activeSubTab === 'gstr2'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          GSTR-2 (Purchases / ITC)
        </button>

        <button
          onClick={() => setActiveSubTab('hsn')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
            activeSubTab === 'hsn'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Hash className="w-3.5 h-3.5" />
          HSN Summary
        </button>

        <button
          onClick={() => setActiveSubTab('datewise')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
            activeSubTab === 'datewise'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Date-wise Sales/Purchase
        </button>

        <button
          onClick={() => setActiveSubTab('partywise')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
            activeSubTab === 'partywise'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          Date/Party-wise GST
        </button>

        <button
          onClick={() => setActiveSubTab('gstr4')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
            activeSubTab === 'gstr4'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          GSTR-4 (Composition 1%)
        </button>
      </div>

      {/* Main Content Pane */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded p-12 text-center text-slate-500 text-xs">
          <RefreshCw className="w-6 h-6 animate-spin text-teal-600 mx-auto mb-2" />
          Computing statutory GST registers and Input Tax Credit balances...
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>Error loading GST data: {error}</span>
        </div>
      ) : (
        <div>
          {/* TAB 1: GSTR-3B SUMMARY */}
          {activeSubTab === 'gstr3b' && gstr3bData && (
            <div className="space-y-4">
              {/* Top 3 Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white border border-slate-200 rounded p-3 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>1. Outward Tax Liability (Sales)</span>
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 font-mono">
                    ₹{gstr3bData.outwardSupplies.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Taxable: ₹{gstr3bData.outwardSupplies.taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({gstr3bData.outwardSupplies.invoiceCount} bills)
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded p-3 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>2. Net Eligible ITC (Purchases)</span>
                    <TrendingDown className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-xl font-bold text-blue-700 font-mono">
                    ₹{gstr3bData.netEligibleITC.totalITC.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Gross Purchases ITC: ₹{gstr3bData.inwardSupplies.totalITC.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({gstr3bData.inwardSupplies.purchaseCount} bills)
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded p-3 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>3. Net Cash Payable to Govt</span>
                    <DollarSign className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className={`text-xl font-bold font-mono ${gstr3bData.netTaxPayable.totalPayable > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                    ₹{gstr3bData.netTaxPayable.totalPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {gstr3bData.itcCarryForward.totalBalance > 0
                      ? `Excess ITC to carry forward: ₹${gstr3bData.itcCarryForward.totalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                      : 'All tax offset by eligible inward purchases.'}
                  </div>
                </div>
              </div>

              {/* Master Table 3.1 & Table 4 Breakdown */}
              <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-800 flex items-center justify-between">
                  <span>GSTR-3B Statutory Tax Matrix ({gstr3bData.period.startDate} to {gstr3bData.period.endDate})</span>
                  <span className="text-slate-500 font-normal">All amounts in Indian Rupees (INR)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-700 font-bold">
                        <th className="py-2 px-3">Description / Statutory Head</th>
                        <th className="py-2 px-3 text-right">Taxable Value (₹)</th>
                        <th className="py-2 px-3 text-right">CGST (₹)</th>
                        <th className="py-2 px-3 text-right">SGST (₹)</th>
                        <th className="py-2 px-3 text-right">IGST (₹)</th>
                        <th className="py-2 px-3 text-right">Total Tax (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          (A) Outward Taxable Supplies (Table 3.1a - Active Sales)
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">{gstr3bData.outwardSupplies.taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold">{gstr3bData.outwardSupplies.cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold">{gstr3bData.outwardSupplies.sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold">{gstr3bData.outwardSupplies.igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{gstr3bData.outwardSupplies.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          (B) Eligible Inward ITC (Table 4A - Inward Purchases from Suppliers)
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">{gstr3bData.inwardSupplies.taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-blue-700 font-semibold">{gstr3bData.inwardSupplies.cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-blue-700 font-semibold">{gstr3bData.inwardSupplies.sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-blue-700 font-semibold">{gstr3bData.inwardSupplies.igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700">{gstr3bData.inwardSupplies.totalITC.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                      {gstr3bData.itcReversal.totalReversal > 0 && (
                        <tr className="text-red-700 bg-red-50/50">
                          <td className="py-2.5 px-3 font-semibold">
                            (C) ITC Reversal (Table 4B - Supplier Debit Notes / Returns)
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">-{gstr3bData.itcReversal.taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold">-{gstr3bData.itcReversal.cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold">-{gstr3bData.itcReversal.sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold">-{gstr3bData.itcReversal.igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">-{gstr3bData.itcReversal.totalReversal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      )}
                      <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
                        <td className="py-2.5 px-3 text-slate-900">
                          (D) Net Eligible ITC Available (B - C)
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">-</td>
                        <td className="py-2.5 px-3 text-right font-mono text-blue-800">{gstr3bData.netEligibleITC.cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-blue-800">{gstr3bData.netEligibleITC.sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-blue-800">{gstr3bData.netEligibleITC.igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-blue-800 font-bold">{gstr3bData.netEligibleITC.totalITC.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                      <tr className="bg-amber-50/75 border-t border-amber-200 font-bold">
                        <td className="py-3 px-3 text-amber-900">
                          (E) NET TAX PAYABLE IN CASH (Table 6.1 - Payment of Tax)
                        </td>
                        <td className="py-3 px-3 text-right font-mono">-</td>
                        <td className="py-3 px-3 text-right font-mono text-amber-800">{gstr3bData.netTaxPayable.cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-3 px-3 text-right font-mono text-amber-800">{gstr3bData.netTaxPayable.sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-3 px-3 text-right font-mono text-amber-800">{gstr3bData.netTaxPayable.igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-3 px-3 text-right font-mono text-amber-900 text-sm font-black">{gstr3bData.netTaxPayable.totalPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GSTR-1 OUTWARD SALES */}
          {activeSubTab === 'gstr1' && gstr1Data && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white border border-slate-200 rounded p-3">
                  <div className="text-slate-500">Table 4: B2B Invoices</div>
                  <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">{gstr1Data.b2b.count} bills</div>
                  <div className="text-slate-500 font-mono mt-1">Tax: ₹{gstr1Data.b2b.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                </div>

                <div className="bg-white border border-slate-200 rounded p-3">
                  <div className="text-slate-500">Table 7: B2C Retail Bills</div>
                  <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">{gstr1Data.b2cSmall.count} bills</div>
                  <div className="text-slate-500 font-mono mt-1">Tax: ₹{gstr1Data.b2cSmall.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                </div>

                <div className="bg-white border border-slate-200 rounded p-3">
                  <div className="text-slate-500">Cancelled Invoices</div>
                  <div className="text-lg font-bold text-red-600 font-mono mt-0.5">{gstr1Data.cancelled.count} bills</div>
                  <div className="text-slate-500 mt-1">Zero tax liability</div>
                </div>

                <div className="bg-white border border-slate-200 rounded p-3">
                  <div className="text-slate-500">Table 13: Doc Range</div>
                  <div className="text-xs font-bold text-slate-800 font-mono mt-1">{gstr1Data.documentSummary.startingNumber}</div>
                  <div className="text-xs text-slate-500 font-mono">to {gstr1Data.documentSummary.endingNumber}</div>
                </div>
              </div>

              {/* B2B Table */}
              <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-800">
                  Table 4: B2B Sales (Registered Doctors, Chemists & Hospitals)
                </div>
                {gstr1Data.b2b.invoices.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No B2B sales with GSTIN recorded in this date range.
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200 font-bold text-slate-700">
                        <tr>
                          <th className="py-2 px-3">Invoice No</th>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Customer / Buyer</th>
                          <th className="py-2 px-3">Recipient GSTIN</th>
                          <th className="py-2 px-3 text-right">Taxable (₹)</th>
                          <th className="py-2 px-3 text-right">CGST (₹)</th>
                          <th className="py-2 px-3 text-right">SGST (₹)</th>
                          <th className="py-2 px-3 text-right">Total GST (₹)</th>
                          <th className="py-2 px-3 text-right">Total (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono">
                        {gstr1Data.b2b.invoices.map((inv: any) => (
                          <tr key={inv.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-semibold text-slate-800">{inv.invoiceNumber}</td>
                            <td className="py-2 px-3 text-slate-600">{inv.invoiceDate}</td>
                            <td className="py-2 px-3 font-sans text-slate-800">{inv.customerName}</td>
                            <td className="py-2 px-3 text-teal-700 font-bold">{inv.gstin}</td>
                            <td className="py-2 px-3 text-right">{inv.taxableAmount.toFixed(2)}</td>
                            <td className="py-2 px-3 text-right text-emerald-700">{inv.cgstAmount.toFixed(2)}</td>
                            <td className="py-2 px-3 text-right text-emerald-700">{inv.sgstAmount.toFixed(2)}</td>
                            <td className="py-2 px-3 text-right font-bold text-slate-900">{inv.totalTax.toFixed(2)}</td>
                            <td className="py-2 px-3 text-right font-bold text-slate-900">{inv.grandTotal.toFixed(2)}</td>
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
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded p-3 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900">Total Purchase Bills:</span> {gstr2Data.summary.count} |{' '}
                  <span className="font-bold text-slate-900">Gross Taxable:</span> ₹{gstr2Data.summary.totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div>
                  <span className="font-bold text-blue-700">Total Input Tax Credit (ITC):</span> ₹{gstr2Data.summary.totalITC.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200 font-bold text-slate-700">
                      <tr>
                        <th className="py-2 px-3">Bill No</th>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Distributor / Supplier</th>
                        <th className="py-2 px-3">Supplier GSTIN</th>
                        <th className="py-2 px-3 text-right">Taxable (₹)</th>
                        <th className="py-2 px-3 text-right">CGST (₹)</th>
                        <th className="py-2 px-3 text-right">SGST (₹)</th>
                        <th className="py-2 px-3 text-right">Eligible ITC (₹)</th>
                        <th className="py-2 px-3 text-right">Total (₹)</th>
                        <th className="py-2 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono">
                      {gstr2Data.purchases.map((pur: any) => (
                        <tr key={pur.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-semibold text-slate-800">{pur.invoiceNumber}</td>
                          <td className="py-2 px-3 text-slate-600">{pur.purchaseDate}</td>
                          <td className="py-2 px-3 font-sans text-slate-800">{pur.supplierName}</td>
                          <td className="py-2 px-3 text-teal-700 font-bold">{pur.supplierGstin || 'UNREGISTERED'}</td>
                          <td className="py-2 px-3 text-right">{pur.taxableAmount.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right text-blue-700">{pur.cgstAmount.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right text-blue-700">{pur.sgstAmount.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-bold text-blue-800">{pur.totalTax.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">{pur.totalAmount.toFixed(2)}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                              pur.status === 'PAID' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
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
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-white border border-slate-200 rounded p-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-slate-700">HSN Mode:</span>
                  <button
                    onClick={() => setHsnType('sales')}
                    className={`px-3 py-1 rounded font-semibold text-xs transition-colors ${
                      hsnType === 'sales' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Outward (HSN Sales)
                  </button>
                  <button
                    onClick={() => setHsnType('purchase')}
                    className={`px-3 py-1 rounded font-semibold text-xs transition-colors ${
                      hsnType === 'purchase' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Inward (HSN Purchases)
                  </button>
                </div>

                <span className="text-xs text-slate-500 font-mono">
                  {hsnData.length} distinct HSN codes mapped
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                      <tr>
                        <th className="py-2.5 px-3">HSN Code</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3">UQC</th>
                        <th className="py-2.5 px-3 text-right">Total Qty Sold</th>
                        <th className="py-2.5 px-3 text-right">Taxable Value (₹)</th>
                        <th className="py-2.5 px-3 text-right">CGST (₹)</th>
                        <th className="py-2.5 px-3 text-right">SGST (₹)</th>
                        <th className="py-2.5 px-3 text-right">Total GST (₹)</th>
                        <th className="py-2.5 px-3 text-right">Total Value (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono">
                      {hsnData.map((hsn) => (
                        <tr key={hsn.hsnCode} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold text-teal-800">{hsn.hsnCode}</td>
                          <td className="py-2 px-3 font-sans text-slate-800">{hsn.description}</td>
                          <td className="py-2 px-3 text-slate-600">{hsn.uqc}</td>
                          <td className="py-2 px-3 text-right">{hsn.quantity.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-right">{hsn.taxableAmount.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right text-emerald-700">{hsn.cgstAmount.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right text-emerald-700">{hsn.sgstAmount.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">{hsn.totalTax.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">{hsn.totalAmount.toFixed(2)}</td>
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
            <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-800">
                Day-by-Day Sales & Purchases Register
              </div>
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-xs text-left border-collapse font-mono">
                  <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200 font-bold text-slate-700 font-sans">
                    <tr>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3 text-right">Sales Bills</th>
                      <th className="py-2 px-3 text-right">Sales Taxable (₹)</th>
                      <th className="py-2 px-3 text-right">Sales GST (₹)</th>
                      <th className="py-2 px-3 text-right">Total Sales (₹)</th>
                      <th className="py-2 px-3 text-right">Pur Bills</th>
                      <th className="py-2 px-3 text-right">Pur Taxable (₹)</th>
                      <th className="py-2 px-3 text-right">Pur ITC (₹)</th>
                      <th className="py-2 px-3 text-right">Total Purchases (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {datewiseData.map((d) => (
                      <tr key={d.date} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-semibold text-slate-900">{d.date}</td>
                        <td className="py-2 px-3 text-right text-slate-600">{d.salesCount}</td>
                        <td className="py-2 px-3 text-right">{d.salesTaxable.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-emerald-700">{d.salesGst.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">{d.salesTotal.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-slate-600">{d.purchaseCount}</td>
                        <td className="py-2 px-3 text-right">{d.purchaseTaxable.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-blue-700">{d.purchaseGst.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-bold text-blue-900">{d.purchaseTotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: DATE/PARTY-WISE GST */}
          {activeSubTab === 'partywise' && (
            <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-800">
                Party / Customer Wise GST Sales Distribution
              </div>
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200 font-bold text-slate-700">
                    <tr>
                      <th className="py-2 px-3">Customer / Party Name</th>
                      <th className="py-2 px-3">GSTIN</th>
                      <th className="py-2 px-3">State</th>
                      <th className="py-2 px-3 text-right">Bills</th>
                      <th className="py-2 px-3 text-right">Taxable Amount (₹)</th>
                      <th className="py-2 px-3 text-right">CGST (₹)</th>
                      <th className="py-2 px-3 text-right">SGST (₹)</th>
                      <th className="py-2 px-3 text-right">Total GST (₹)</th>
                      <th className="py-2 px-3 text-right">Grand Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    {partywiseData.map((p) => (
                      <tr key={p.partyName} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-sans font-semibold text-slate-900">{p.partyName}</td>
                        <td className="py-2 px-3 text-teal-700 font-bold">{p.gstin || '-'}</td>
                        <td className="py-2 px-3 font-sans text-slate-600">{p.state}</td>
                        <td className="py-2 px-3 text-right">{p.invoiceCount}</td>
                        <td className="py-2 px-3 text-right">{p.taxableAmount.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-emerald-700">{p.cgstAmount.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-emerald-700">{p.sgstAmount.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">{p.totalTax.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">{p.totalAmount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: GSTR-4 (COMPOSITION SCHEME) */}
          {activeSubTab === 'gstr4' && gstr4Data && (
            <div className="bg-white border border-slate-200 rounded p-6 shadow-xs max-w-xl mx-auto text-xs space-y-4">
              <div className="border-b border-slate-200 pb-3">
                <h3 className="font-bold text-sm text-slate-900">GSTR-4 Composition Scheme Summary</h3>
                <p className="text-slate-500 mt-0.5">Applicable for taxpayers opting for 1% flat turnover tax.</p>
              </div>

              <div className="space-y-3 font-mono">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="font-sans text-slate-600">Total Billed Turnover:</span>
                  <span className="font-bold text-slate-900">₹{gstr4Data.grossTurnover.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="font-sans text-slate-600">Statutory Composition Rate:</span>
                  <span className="font-bold text-teal-700">{gstr4Data.compositionRate}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="font-sans text-slate-600">CGST (0.5%):</span>
                  <span>₹{gstr4Data.taxPayable.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="font-sans text-slate-600">SGST (0.5%):</span>
                  <span>₹{gstr4Data.taxPayable.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-2 bg-teal-50 px-3 rounded text-sm text-teal-900 font-bold">
                  <span className="font-sans">Total 1% Tax Payable:</span>
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

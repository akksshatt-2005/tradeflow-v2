import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import * as XLSX from 'xlsx';
import {
  Users,
  Search,
  Plus,
  Truck,
  UserCheck,
  Building2,
  FileCheck2,
  Phone,
  Mail,
  MapPin,
  X,
  CreditCard,
  Globe,
  ShieldAlert,
  Calendar,
  Eye,
  Edit2,
  FileText,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Download,
  UploadCloud,
  FileSpreadsheet
} from 'lucide-react';

interface PartyLedger {
  id: string;
  name: string;
  type: 'supplier' | 'customer' | 'both';
  station?: string | null;
  accountGroup?: string | null;
  balancingMethod: string;
  openingBalance: number;
  openingBalanceType: 'DR' | 'CR';
  mailTo?: string | null;
  address?: string | null;
  pincode?: string | null;
  state?: string | null;
  stateCode?: string | null;
  country: string;
  phone?: string | null;
  mobile?: string | null;
  faxNo?: string | null;
  email?: string | null;
  website?: string | null;
  contactPerson?: string | null;
  designation?: string | null;
  gstin?: string | null;
  drugLicenseNo?: string | null;
  dlExpiryDate?: string | null;
  fssaiNo?: string | null;
  fssaiExpiryDate?: string | null;
  panNo?: string | null;
  scheduleHNotice: 'ALLOW_ALL' | 'WARNING' | 'BLOCK';
  holdPayment: boolean;
  ledgerCategory: 'REGISTERED' | 'UNREGISTERED' | 'COMPOSITE' | 'CONSUMER';
  defaultDoctorName?: string | null;
  defaultDoctorRegNo?: string | null;
  isCash: boolean;
  creditLimit: number;
  outstandingBalance: number;
  createdAt: string;
}

export default function Parties() {
  const { activeCompany } = useAuth();
  const [parties, setParties] = useState<PartyLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'customer' | 'supplier'>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [deletingPartyId, setDeletingPartyId] = useState<string | null>(null);

  // Bulk Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [previewParties, setPreviewParties] = useState<any[]>([]);
  const [importSearch, setImportSearch] = useState('');

  // Party Statement / Ledger View State
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [statementParty, setStatementParty] = useState<PartyLedger | null>(null);
  const [statementData, setStatementData] = useState<{
    party: any;
    summary: {
      openingBalance: number;
      openingBalanceType: string;
      totalPurchases: number;
      totalReturns: number;
      totalPayments: number;
      netOutstanding: number;
    };
    transactions: Array<{
      date: string;
      type: string;
      typeLabel: string;
      voucherNo: string;
      referenceId: string;
      particulars: string;
      itemDetails?: any[];
      debit: number;
      credit: number;
      runningBalance: number;
    }>;
  } | null>(null);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [statementStartDate, setStatementStartDate] = useState('');
  const [statementEndDate, setStatementEndDate] = useState('');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const handleOpenStatement = async (party: PartyLedger, start?: string, end?: string) => {
    setStatementParty(party);
    setShowStatementModal(true);
    setLoadingStatement(true);
    setExpandedRows({});

    const s = start !== undefined ? start : '';
    const e = end !== undefined ? end : '';
    setStatementStartDate(s);
    setStatementEndDate(e);

    try {
      let url = `/api/parties/${party.id}/statement`;
      const queryParams: string[] = [];
      if (s) queryParams.push(`startDate=${s}`);
      if (e) queryParams.push(`endDate=${e}`);
      if (queryParams.length > 0) url += `?${queryParams.join('&')}`;

      const res = await api.get<any>(url, {
        companyId: activeCompany?.id
      });
      setStatementData(res);
    } catch (err) {
      console.error('Failed to load party statement:', err);
    } finally {
      setLoadingStatement(false);
    }
  };

  const handleExportStatementExcel = () => {
    if (!statementData || !statementParty) return;

    const metadataRows = [
      ['PARTY LEDGER STATEMENT'],
      ['Company:', activeCompany?.name || ''],
      ['Party Name:', statementParty.name],
      ['Type:', statementParty.type.toUpperCase()],
      ['GSTIN:', statementParty.gstin || 'N/A'],
      ['Drug License:', statementParty.drugLicenseNo || 'N/A'],
      ['Date Range:', statementStartDate && statementEndDate ? `${statementStartDate} to ${statementEndDate}` : 'All Time'],
      ['Opening Balance:', `₹${statementData.summary.openingBalance.toFixed(2)} (${statementData.summary.openingBalanceType})`],
      ['Total Purchases (Debit):', `₹${statementData.summary.totalPurchases.toFixed(2)}`],
      ['Total Returns/CN (Credit):', `₹${statementData.summary.totalReturns.toFixed(2)}`],
      ['Total Paid (Credit):', `₹${statementData.summary.totalPayments.toFixed(2)}`],
      ['Net Outstanding Balance:', `₹${statementData.summary.netOutstanding.toFixed(2)}`],
      []
    ];

    const tableRows = statementData.transactions.map((t, idx) => ({
      '#': idx + 1,
      'Date': t.date.split('T')[0],
      'Voucher Type': t.typeLabel,
      'Voucher #': t.voucherNo,
      'Particulars': t.particulars,
      'Debit (₹)': t.debit > 0 ? t.debit : '',
      'Credit (₹)': t.credit > 0 ? t.credit : '',
      'Running Balance (₹)': t.runningBalance
    }));

    const worksheet = XLSX.utils.aoa_to_sheet(metadataRows);
    XLSX.utils.sheet_add_json(worksheet, tableRows, { origin: 'A14' });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ledger Statement');
    const filename = `Ledger_Statement_${statementParty.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, filename);
  };

  const handleExportParties = () => {
    if (parties.length === 0) {
      alert('No ledger records available to export.');
      return;
    }
    const data = parties.map((p, idx) => ({
      'S.No': idx + 1,
      'Ledger Name': p.name,
      'Billing / Mail Name': p.mailTo || p.name,
      'Type': p.type.toUpperCase(),
      'Account Group': p.accountGroup || (p.type === 'supplier' ? 'SUNDRY_CREDITORS' : 'SUNDRY_DEBTORS'),
      'Ledger Category': p.ledgerCategory,
      'GSTIN': p.gstin || '',
      'Drug License (20B/21B)': p.drugLicenseNo || '',
      'DL Expiry': p.dlExpiryDate ? p.dlExpiryDate.split('T')[0] : '',
      'FSSAI No': p.fssaiNo || '',
      'PAN No': p.panNo || '',
      'Station': p.station || '',
      'State': p.state || '',
      'Address': p.address || '',
      'Pincode': p.pincode || '',
      'Phone': p.phone || '',
      'Mobile': p.mobile || '',
      'Email': p.email || '',
      'Contact Person': p.contactPerson || '',
      'Balancing Method': p.balancingMethod,
      'Opening Balance (₹)': p.openingBalance,
      'Opening Balance Type': p.openingBalanceType,
      'Current Outstanding (₹)': p.outstandingBalance,
      'Credit Limit (₹)': p.creditLimit
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Party Ledgers');
    const compName = (activeCompany?.name || 'Ledger').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(workbook, `Party_Ledgers_${compName}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPartyTemplate = () => {
    const templateData = [
      {
        'Ledger Name': 'GUPTA PHARMA DISTRIBUTORS',
        'Billing / Mail Name': 'GUPTA PHARMA DISTRIBUTORS PVT LTD',
        'Type': 'supplier',
        'Ledger Category': 'REGISTERED',
        'GSTIN': '09AAAAA0000A1Z5',
        'Drug License': 'UP-LKO-20B-123456',
        'Station': 'LUCKNOW',
        'State': 'UTTAR PRADESH',
        'Mobile': '9876543210',
        'Email': 'contact@guptapharma.com',
        'Opening Balance': 0,
        'Opening Balance Type': 'CR'
      },
      {
        'Ledger Name': 'DR. SHARMA CLINIC',
        'Billing / Mail Name': 'DR. SHARMA CLINIC',
        'Type': 'customer',
        'Ledger Category': 'CONSUMER',
        'GSTIN': '',
        'Drug License': '',
        'Station': 'LOCAL',
        'State': 'UTTAR PRADESH',
        'Mobile': '9812345678',
        'Email': 'sharmaclinic@gmail.com',
        'Opening Balance': 0,
        'Opening Balance Type': 'DR'
      }
    ];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Party_Template');
    XLSX.writeFile(workbook, `Party_Ledger_Import_Template.xlsx`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet);

        const parsed: any[] = [];
        for (const row of json) {
          const name = row['Ledger Name'] || row['name'] || row['Firm Name'] || row['Party Name'] || row['Company'];
          if (!name) continue;
          parsed.push({
            name: String(name).trim(),
            mailTo: row['Billing / Mail Name'] || row['mailTo'] || name,
            type: String(row['Type'] || row['type'] || 'supplier').toLowerCase().includes('cust') ? 'customer' : 'supplier',
            gstin: row['GSTIN'] || row['gstin'] || '',
            drugLicenseNo: row['Drug License'] || row['drugLicenseNo'] || row['DL No'] || '',
            station: row['Station'] || row['station'] || 'LOCAL',
            state: row['State'] || row['state'] || 'UTTAR PRADESH',
            mobile: row['Mobile'] || row['mobile'] || row['Phone'] || '',
            email: row['Email'] || row['email'] || '',
            openingBalance: parseFloat(row['Opening Balance'] || row['openingBalance'] || '0') || 0,
            openingBalanceType: String(row['Opening Balance Type'] || 'CR').toUpperCase() === 'DR' ? 'DR' : 'CR'
          });
        }

        if (parsed.length > 0) {
          setPreviewParties(parsed);
          setSuccessMsg(`Loaded ${parsed.length} party ledgers from file.`);
          setTimeout(() => setSuccessMsg(null), 4000);
        } else {
          setError('Could not extract any valid ledger rows from this file.');
        }
      } catch (err: any) {
        console.error('Failed to parse file:', err);
        setError('Failed to read Excel/CSV file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleBulkImport = async () => {
    if (!activeCompany || previewParties.length === 0) return;
    try {
      setImporting(true);
      setError(null);
      setImportProgress(25);

      const res = await api.post<{ success: boolean; importedCount: number; message: string }>(
        '/api/parties/bulk-import',
        { parties: previewParties },
        { companyId: activeCompany.id }
      );

      setImportProgress(100);
      setSuccessMsg(res.message || `Successfully imported ${res.importedCount} party ledgers!`);
      setTimeout(() => setSuccessMsg(null), 5000);
      setShowImportModal(false);
      await fetchParties();
    } catch (err: any) {
      console.error('Failed to import party ledgers:', err);
      setError(err.response?.data?.error || err.message || 'Failed to import party ledgers');
    } finally {
      setImporting(false);
      setImportProgress(0);
    }
  };

  // Modal State for Ledger Modification / Creation (Photo 1)
  const [showModal, setShowModal] = useState(false);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'BASIC' | 'CONTACT' | 'STATUTORY' | 'TERMS'>('BASIC');

  // Form Fields (Exact fields from Photo 1)
  const [name, setName] = useState('');
  const [station, setStation] = useState('');
  const [accountGroup, setAccountGroup] = useState('SUNDRY_CREDITORS');
  const [balancingMethod, setBalancingMethod] = useState('BILL_BY_BILL');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [openingBalanceType, setOpeningBalanceType] = useState<'DR' | 'CR'>('CR');
  const [mailTo, setMailTo] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [state, setState] = useState('UTTAR PRADESH');
  const [stateCode, setStateCode] = useState('09');
  const [country, setCountry] = useState('INDIA');

  // Contact Info
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [designation, setDesignation] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [faxNo, setFaxNo] = useState('');

  // Statutory & Licences
  const [drugLicenseNo, setDrugLicenseNo] = useState('');
  const [dlExpiryDate, setDlExpiryDate] = useState('');
  const [gstin, setGstin] = useState('');
  const [fssaiNo, setFssaiNo] = useState('');
  const [fssaiExpiryDate, setFssaiExpiryDate] = useState('');
  const [panNo, setPanNo] = useState('');
  const [scheduleHNotice, setScheduleHNotice] = useState<'ALLOW_ALL' | 'WARNING' | 'BLOCK'>('ALLOW_ALL');
  const [holdPayment, setHoldPayment] = useState(false);
  const [ledgerCategory, setLedgerCategory] = useState<'REGISTERED' | 'UNREGISTERED' | 'COMPOSITE' | 'CONSUMER'>('REGISTERED');
  const [defaultDoctorName, setDefaultDoctorName] = useState('');
  const [defaultDoctorRegNo, setDefaultDoctorRegNo] = useState('');
  const [creditLimit, setCreditLimit] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchParties();
  }, [activeCompany?.id, activeTab]);

  const fetchParties = async () => {
    if (!activeCompany) return;
    try {
      setLoading(true);
      setError(null);
      const url = activeTab === 'all'
        ? '/api/parties'
        : `/api/parties?type=${activeTab}`;
      const res = await api.get<{ parties: PartyLedger[] }>(url, {
        companyId: activeCompany.id
      });
      setParties(res.parties || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load parties');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = (type: 'supplier' | 'customer') => {
    setEditingPartyId(null);
    setName('');
    setStation('');
    setAccountGroup(type === 'supplier' ? 'SUNDRY_CREDITORS' : 'SUNDRY_DEBTORS');
    setBalancingMethod('BILL_BY_BILL');
    setOpeningBalance('0');
    setOpeningBalanceType(type === 'supplier' ? 'CR' : 'DR');
    setMailTo('');
    setAddress('');
    setPincode('');
    setState('UTTAR PRADESH');
    setStateCode('09');
    setCountry('INDIA');
    setEmail('');
    setWebsite('');
    setContactPerson('');
    setDesignation('');
    setPhone('');
    setMobile('');
    setFaxNo('');
    setDrugLicenseNo('');
    setDlExpiryDate('');
    setGstin('');
    setFssaiNo('');
    setFssaiExpiryDate('');
    setPanNo('');
    setScheduleHNotice('ALLOW_ALL');
    setHoldPayment(false);
    setLedgerCategory('REGISTERED');
    setDefaultDoctorName('');
    setDefaultDoctorRegNo('');
    setCreditLimit('0');
    setActiveSection('BASIC');
    setShowModal(true);
  };

  const handleOpenEditModal = (p: PartyLedger) => {
    setEditingPartyId(p.id);
    setName(p.name);
    setStation(p.station || '');
    setAccountGroup(p.accountGroup || (p.type === 'supplier' ? 'SUNDRY_CREDITORS' : 'SUNDRY_DEBTORS'));
    setBalancingMethod(p.balancingMethod || 'BILL_BY_BILL');
    setOpeningBalance(String(p.openingBalance || 0));
    setOpeningBalanceType(p.openingBalanceType || (p.type === 'supplier' ? 'CR' : 'DR'));
    setMailTo(p.mailTo || p.name);
    setAddress(p.address || '');
    setPincode(p.pincode || '');
    setState(p.state || 'UTTAR PRADESH');
    setStateCode(p.stateCode || '09');
    setCountry(p.country || 'INDIA');
    setEmail(p.email || '');
    setWebsite(p.website || '');
    setContactPerson(p.contactPerson || '');
    setDesignation(p.designation || '');
    setPhone(p.phone || '');
    setMobile(p.mobile || '');
    setFaxNo(p.faxNo || '');
    setDrugLicenseNo(p.drugLicenseNo || '');
    setDlExpiryDate(p.dlExpiryDate ? p.dlExpiryDate.split('T')[0] : '');
    setGstin(p.gstin || '');
    setFssaiNo(p.fssaiNo || '');
    setFssaiExpiryDate(p.fssaiExpiryDate ? p.fssaiExpiryDate.split('T')[0] : '');
    setPanNo(p.panNo || '');
    setScheduleHNotice(p.scheduleHNotice || 'ALLOW_ALL');
    setHoldPayment(p.holdPayment || false);
    setLedgerCategory(p.ledgerCategory || 'REGISTERED');
    setDefaultDoctorName(p.defaultDoctorName || '');
    setDefaultDoctorRegNo(p.defaultDoctorRegNo || '');
    setCreditLimit(String(p.creditLimit || 0));
    setActiveSection('BASIC');
    setShowModal(true);
  };

  const handleGstinChange = (val: string) => {
    const clean = val.toUpperCase();
    setGstin(clean);
    // Auto-extract 2-digit state code and 10-digit PAN from 15-char GSTIN
    if (clean.length >= 2) {
      const code = clean.substring(0, 2);
      setStateCode(code);
      if (code === '09') setState('UTTAR PRADESH');
      else if (code === '07') setState('DELHI');
      else if (code === '27') setState('MAHARASHTRA');
      else if (code === '24') setState('GUJARAT');
      else if (code === '08') setState('RAJASTHAN');
      else if (code === '19') setState('WEST BENGAL');
      else if (code === '33') setState('TAMIL NADU');
      else if (code === '29') setState('KARNATAKA');
    }
    if (clean.length >= 12) {
      setPanNo(clean.substring(2, 12));
    }
  };

  // Automated GSTIN Government Lookup & Autofill
  const [gstLookupLoading, setGstLookupLoading] = useState(false);
  const [gstLookupMsg, setGstLookupMsg] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

  const handleGstinLookup = async (overrideGstin?: string) => {
    const targetGstin = (overrideGstin || gstin).trim().toUpperCase();
    if (!targetGstin) {
      setGstLookupMsg({ type: 'error', text: 'Please enter a 15-character GSTIN to lookup' });
      return;
    }

    try {
      setGstLookupLoading(true);
      setGstLookupMsg(null);

      const res = await api.post('/api/gst/lookup', { gstin: targetGstin }, {
        companyId: activeCompany?.id
      });

      const d = (res as any)?.data || res;
      if (d) {
        const firmTradeName = (d.tradeName || d.mailTo || d.legalName || '').trim();
        const legalName = (d.legalName || d.tradeName || '').trim();

        if (firmTradeName) setMailTo(firmTradeName);
        if (legalName) setName(legalName);
        if (!firmTradeName && legalName) setMailTo(legalName);
        if (!legalName && firmTradeName) setName(firmTradeName);

        if (d.address) setAddress(d.address);
        if (d.city) setStation(d.city);
        if (d.state) setState(d.state);
        if (d.stateCode) setStateCode(d.stateCode);
        if (d.pincode) setPincode(d.pincode);
        if (d.pan) setPanNo(d.pan);
        if (d.phone) setMobile(d.phone);
        if (d.email) setEmail(d.email);
        if (d.dlNumber) setDrugLicenseNo(d.dlNumber);
        if (d.taxpayerType === 'Composition') setLedgerCategory('COMPOSITE');
        else if (d.taxpayerType === 'Regular') setLedgerCategory('REGISTERED');

        const isLive = (res as any)?.source === 'GOVERNMENT_GSP_LIVE';
        const isCache = (res as any)?.source === 'DATABASE_CACHE';
        const srcLabel = isLive ? 'Govt GST Portal' : (isCache ? 'Database Records' : 'Smart Decoder');

        if (d.status?.toLowerCase() === 'active') {
          setActiveSection('BASIC');
          setGstLookupMsg({
            type: 'success',
            text: `✅ Verified (${srcLabel}): ${firmTradeName || 'Active Taxpayer'}${legalName && legalName !== firmTradeName ? ` (Legal: ${legalName})` : ''} — ${d.state} (${d.taxpayerType || 'Regular'})`
          });
        } else {
          setActiveSection('BASIC');
          setGstLookupMsg({
            type: 'warning',
            text: `⚠️ Warning: GSTIN status is ${d.status?.toUpperCase() || 'INACTIVE'}`
          });
        }
      }
    } catch (err: any) {
      console.error('GST Lookup failed:', err);
      setGstLookupMsg({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Failed to lookup GSTIN'
      });
    } finally {
      setGstLookupLoading(false);
    }
  };

  const handleSaveParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany) return;

    const finalMailTo = mailTo.trim() || name.trim();
    const finalName = name.trim() || mailTo.trim();

    if (!finalMailTo && !finalName) {
      setError('Firm / Display Name or Ledger Name is required');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const computedType = accountGroup === 'SUNDRY_CREDITORS' ? 'supplier' : 'customer';

      const payload = {
        name: finalName,
        type: computedType,
        station: station.trim() || null,
        accountGroup,
        balancingMethod,
        openingBalance: parseFloat(openingBalance) || 0,
        openingBalanceType,
        mailTo: finalMailTo,
        address: address.trim() || null,
        pincode: pincode.trim() || null,
        state: state.trim() || null,
        stateCode: stateCode.trim() || null,
        country: country.trim() || 'INDIA',
        phone: phone.trim() || null,
        mobile: mobile.trim() || null,
        faxNo: faxNo.trim() || null,
        email: email.trim().toLowerCase() || null,
        website: website.trim() || null,
        contactPerson: contactPerson.trim() || null,
        designation: designation.trim() || null,
        gstin: gstin.trim().toUpperCase() || null,
        drugLicenseNo: drugLicenseNo.trim().toUpperCase() || null,
        dlExpiryDate: dlExpiryDate || null,
        fssaiNo: fssaiNo.trim().toUpperCase() || null,
        fssaiExpiryDate: fssaiExpiryDate || null,
        panNo: panNo.trim().toUpperCase() || null,
        scheduleHNotice,
        holdPayment,
        ledgerCategory,
        defaultDoctorName: defaultDoctorName.trim() || null,
        defaultDoctorRegNo: defaultDoctorRegNo.trim() || null,
        creditLimit: parseFloat(creditLimit) || 0
      };

      if (editingPartyId) {
        await api.put(`/api/parties/${editingPartyId}`, payload, {
          companyId: activeCompany.id,
          idempotencyKey: `edit-party-${Date.now()}`
        });
      } else {
        await api.post('/api/parties', payload, {
          companyId: activeCompany.id,
          idempotencyKey: `create-party-${Date.now()}`
        });
      }

      setShowModal(false);
      fetchParties();
    } catch (err: any) {
      console.error('Failed to save party ledger:', err);
      setError(err.response?.data?.error || err.message || 'Failed to save ledger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteParty = async (p: PartyLedger) => {
    if (!activeCompany) return;
    if (p.isCash) {
      alert('The default Cash party cannot be deleted.');
      return;
    }

    const displayName = p.mailTo || p.name;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete ledger "${displayName}"?\n\nNote: Ledgers with linked purchase bills or sales invoices cannot be deleted until those bills are deleted or cancelled.`
    );
    if (!confirmDelete) return;

    try {
      setDeletingPartyId(p.id);
      setError(null);
      await api.delete(`/api/parties/${p.id}`, {
        companyId: activeCompany.id
      });
      if (editingPartyId === p.id) {
        setShowModal(false);
        setEditingPartyId(null);
      }
      await fetchParties();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to delete party ledger';
      console.error('Failed to delete party:', err);
      setError(errorMsg);
      alert(`⚠️ Could not delete ledger "${displayName}":\n\n${errorMsg}`);
    } finally {
      setDeletingPartyId(null);
    }
  };

  const filteredParties = parties.filter(p =>
    (p.mailTo && p.mailTo.toLowerCase().includes(search.toLowerCase())) ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.station && p.station.toLowerCase().includes(search.toLowerCase())) ||
    (p.phone && p.phone.includes(search)) ||
    (p.mobile && p.mobile.includes(search)) ||
    (p.gstin && p.gstin.toLowerCase().includes(search.toLowerCase())) ||
    (p.drugLicenseNo && p.drugLicenseNo.toLowerCase().includes(search.toLowerCase()))
  );

  const totalSuppliers = parties.filter(p => p.type === 'supplier' || p.type === 'both').length;
  const totalCustomers = parties.filter(p => p.type === 'customer' || p.type === 'both').length;
  const totalCreditorsPayable = parties
    .filter(p => p.type === 'supplier')
    .reduce((sum, p) => sum + p.outstandingBalance, 0);
  const totalDebtorsReceivable = parties
    .filter(p => p.type === 'customer')
    .reduce((sum, p) => sum + p.outstandingBalance, 0);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
            <Users style={{ color: 'var(--brand-teal)' }} /> Ledger Master & Accounts
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.2rem 0 0 0', fontSize: '0.9rem' }}>
            Pharma party ledgers, Drug Licenses (20B/21B), GSTIN, and credit controls
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={handleExportParties}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.65rem 1rem',
              background: '#f8fafc',
              color: '#334155',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
            title="Export all party ledgers to Excel (.xlsx)"
          >
            <Download size={15} /> Export Excel
          </button>
          <button
            onClick={() => {
              setPreviewParties([]);
              setShowImportModal(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.65rem 1rem',
              background: '#f0fdf4',
              color: '#15803d',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
            title="Import party ledgers from Excel or CSV"
          >
            <UploadCloud size={15} /> Import Excel
          </button>
          <button
            onClick={() => handleOpenCreateModal('supplier')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.1rem',
              background: '#0284c7',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            <Plus size={16} /> + Supplier Ledger
          </button>
          <button
            onClick={() => handleOpenCreateModal('customer')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.1rem',
              background: 'var(--brand-teal)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            <Plus size={16} /> + Customer Ledger
          </button>
        </div>
      </div>

      {successMsg && (
        <div style={{
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          color: '#15803d',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '1.2rem',
          fontWeight: '500'
        }}>
          <CheckCircle2 size={18} color="#16a34a" />
          {successMsg}
        </div>
      )}

      {/* KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            <span>Sundry Creditors (Suppliers)</span>
            <Truck size={18} style={{ color: '#0284c7' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '0.4rem' }}>
            {totalSuppliers}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '0.2rem', fontWeight: '600' }}>
            Payable: ₹{totalCreditorsPayable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            <span>Sundry Debtors (Customers)</span>
            <UserCheck size={18} style={{ color: 'var(--brand-teal)' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '0.4rem' }}>
            {totalCustomers}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#16a34a', marginTop: '0.2rem', fontWeight: '600' }}>
            Receivable: ₹{totalDebtorsReceivable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            <span>Drug License Active</span>
            <FileCheck2 size={18} style={{ color: '#10b981' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#10b981', marginTop: '0.4rem' }}>
            {parties.filter(p => p.drugLicenseNo).length}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Verified 20B / 21B Pharma Licences
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', padding: '0.8rem 1.2rem', borderRadius: '8px', color: 'var(--accent-red)', marginBottom: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Tabs & Search Filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '0.8rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.3rem' }}>
          <button
            onClick={() => setActiveTab('all')}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'all' ? 'var(--brand-teal)' : 'transparent',
              color: activeTab === 'all' ? '#fff' : 'var(--text-secondary)',
              fontWeight: activeTab === 'all' ? '600' : '400',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            All Ledgers ({parties.length})
          </button>
          <button
            onClick={() => setActiveTab('supplier')}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'supplier' ? 'var(--brand-teal)' : 'transparent',
              color: activeTab === 'supplier' ? '#fff' : 'var(--text-secondary)',
              fontWeight: activeTab === 'supplier' ? '600' : '400',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            Creditors / Suppliers ({totalSuppliers})
          </button>
          <button
            onClick={() => setActiveTab('customer')}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'customer' ? 'var(--brand-teal)' : 'transparent',
              color: activeTab === 'customer' ? '#fff' : 'var(--text-secondary)',
              fontWeight: activeTab === 'customer' ? '600' : '400',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            Debtors / Customers ({totalCustomers})
          </button>
        </div>

        <div className="search-box" style={{ maxWidth: '340px', minWidth: '240px' }}>
          <Search size={15} />
          <input
            type="text"
            placeholder="Search by name, station, GSTIN, DL..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Ledgers Master Table */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading ledger accounts...
          </div>
        ) : filteredParties.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Users size={40} style={{ opacity: 0.3, marginBottom: '0.8rem' }} />
            <p style={{ margin: 0, fontWeight: '500' }}>No party ledgers found.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.9rem 1.2rem' }}>Firm / Trade Name & Station</th>
                  <th style={{ padding: '0.9rem 1.2rem' }}>Account Group</th>
                  <th style={{ padding: '0.9rem 1.2rem' }}>Contact & Mobile</th>
                  <th style={{ padding: '0.9rem 1.2rem' }}>GSTIN / PAN</th>
                  <th style={{ padding: '0.9rem 1.2rem' }}>Drug License (DL)</th>
                  <th style={{ padding: '0.9rem 1.2rem', textAlign: 'right' }}>Balance (₹)</th>
                  <th style={{ padding: '0.9rem 1.2rem', textAlign: 'center', minWidth: '270px', whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredParties.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)', height: '62px' }}>
                    <td style={{ padding: '0.9rem 1.2rem' }}>
                      <div style={{ fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {p.mailTo || p.name}
                        {p.isCash && (
                          <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(20, 184, 166, 0.15)', color: 'var(--brand-teal)' }}>
                            CASH
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {p.mailTo && p.name && p.mailTo !== p.name && (
                          <span style={{ color: 'var(--text-muted)' }}>Legal: {p.name} • </span>
                        )}
                        {p.station ? `Station: ${p.station} ` : ''}{p.state ? `• ${p.state}` : ''}
                      </div>
                    </td>
                    <td style={{ padding: '0.9rem 1.2rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        background: p.type === 'supplier' ? 'rgba(2, 132, 199, 0.15)' : 'rgba(20, 184, 166, 0.15)',
                        color: p.type === 'supplier' ? '#0284c7' : 'var(--brand-teal)'
                      }}>
                        {p.accountGroup || (p.type === 'supplier' ? 'SUNDRY CREDITORS' : 'SUNDRY DEBTORS')}
                      </span>
                    </td>
                    <td style={{ padding: '0.9rem 1.2rem' }}>
                      <div style={{ color: 'var(--text-primary)' }}>{p.mobile || p.phone || '—'}</div>
                      {p.contactPerson && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Attn: {p.contactPerson}</div>
                      )}
                    </td>
                    <td style={{ padding: '0.9rem 1.2rem' }}>
                      <div style={{ fontFamily: 'monospace', fontWeight: '600', color: 'var(--text-primary)' }}>{p.gstin || '—'}</div>
                      {p.panNo && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>PAN: {p.panNo}</div>
                      )}
                    </td>
                    <td style={{ padding: '0.9rem 1.2rem' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{p.drugLicenseNo || '—'}</div>
                      {p.dlExpiryDate && (
                        <div style={{ fontSize: '0.75rem', color: new Date(p.dlExpiryDate) < new Date() ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                          Exp: {new Date(p.dlExpiryDate).toLocaleDateString('en-IN')}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.9rem 1.2rem', textAlign: 'right', fontWeight: '700', color: p.outstandingBalance > 0 ? (p.type === 'supplier' ? '#ef4444' : '#16a34a') : 'var(--text-secondary)' }}>
                      ₹{p.outstandingBalance.toFixed(2)}
                    </td>
                    <td style={{ padding: '0.9rem 1.2rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => handleOpenStatement(p)}
                          style={{
                            padding: '6px 11px',
                            background: 'rgba(2, 132, 199, 0.08)',
                            border: '1px solid rgba(2, 132, 199, 0.3)',
                            borderRadius: '6px',
                            color: '#0284c7',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            transition: 'all 0.15s ease',
                            whiteSpace: 'nowrap'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(2, 132, 199, 0.18)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(2, 132, 199, 0.08)'}
                          title="View complete Ledger Statement (Purchases, Returns & Payments)"
                        >
                          <FileText size={13} />
                          <span>Statement</span>
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(p)}
                          style={{
                            padding: '6px 11px',
                            background: 'var(--bg-secondary, #f8fafc)',
                            border: '1px solid var(--border-color, #cbd5e1)',
                            borderRadius: '6px',
                            color: 'var(--text-primary, #0f172a)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            transition: 'all 0.15s ease',
                            whiteSpace: 'nowrap'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                          onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary, #f8fafc)'}
                          title="Modify Ledger Details"
                        >
                          <Edit2 size={13} />
                          <span>Modify</span>
                        </button>
                        {!p.isCash ? (
                          <button
                            onClick={() => handleDeleteParty(p)}
                            disabled={deletingPartyId === p.id}
                            style={{
                              padding: '6px 11px',
                              background: 'rgba(239, 68, 68, 0.08)',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              borderRadius: '6px',
                              color: '#dc2626',
                              cursor: deletingPartyId === p.id ? 'not-allowed' : 'pointer',
                              opacity: deletingPartyId === p.id ? 0.6 : 1,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              transition: 'all 0.15s ease',
                              whiteSpace: 'nowrap'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.18)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'}
                            title="Delete Party Ledger"
                          >
                            <Trash2 size={13} />
                            <span>{deletingPartyId === p.id ? 'Deleting...' : 'Delete'}</span>
                          </button>
                        ) : (
                          <div style={{ width: '70px' }} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pharma MODIFY LEDGER / CREATE LEDGER Modal (Styled directly after Photo 1) */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 120,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '900px',
            maxHeight: '92vh',
            overflowY: 'auto',
            padding: '1.5rem',
            position: 'relative'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.8rem', marginBottom: '1.2rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Building2 style={{ color: 'var(--brand-teal)' }} />
                  {editingPartyId ? 'MODIFY LEDGER (PARTY MASTER)' : 'CREATE NEW LEDGER'}
                </h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Statutory Pharma Accounts, Drug License & GST Compliant Ledger
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem 0.7rem', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Quick GSTIN Autofill Banner */}
            <div style={{
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '8px',
              padding: '10px 14px',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '260px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  ⚡ GSTIN Autofill:
                </span>
                <input
                  type="text"
                  maxLength={15}
                  placeholder="Enter 15-char GST No. (e.g. 09AOAPV7912G1ZO)"
                  value={gstin}
                  onChange={e => handleGstinChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleGstinLookup();
                    }
                  }}
                  style={{
                    flex: 1,
                    maxWidth: '300px',
                    padding: '6px 10px',
                    border: '1px solid #7dd3fc',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    fontFamily: 'monospace',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    background: '#ffffff'
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleGstinLookup()}
                  disabled={gstLookupLoading || gstin.trim().length < 15}
                  className="btn btn-primary"
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  {gstLookupLoading ? 'Fetching Govt Data...' : '⚡ Autofill Firm'}
                </button>
              </div>

              {gstLookupMsg && (
                <div style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '4px',
                  background: gstLookupMsg.type === 'success' ? '#dcfce7' : gstLookupMsg.type === 'warning' ? '#fef3c7' : '#fee2e2',
                  color: gstLookupMsg.type === 'success' ? '#15803d' : gstLookupMsg.type === 'warning' ? '#b45309' : '#b91c1c',
                  border: `1px solid ${gstLookupMsg.type === 'success' ? '#bbf7d0' : gstLookupMsg.type === 'warning' ? '#fde68a' : '#fecaca'}`
                }}>
                  {gstLookupMsg.text}
                </div>
              )}
            </div>

            {error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', padding: '0.7rem 1.2rem', borderRadius: '8px', color: 'var(--accent-red)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⚠️ {error}</span>
                <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
              </div>
            )}

            {/* Sub-Section Navigation Tabs */}
            <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.8rem', marginBottom: '1.2rem' }}>
              {(['BASIC', 'CONTACT', 'STATUTORY', 'TERMS'] as const).map(sec => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setActiveSection(sec)}
                  style={{
                    padding: '0.4rem 0.9rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeSection === sec ? 'var(--brand-teal)' : 'var(--bg-secondary)',
                    color: activeSection === sec ? '#fff' : 'var(--text-secondary)',
                    fontWeight: '600',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  {sec === 'BASIC' ? '1. General Info & Address' : sec === 'CONTACT' ? '2. Contact Persons' : sec === 'STATUTORY' ? '3. Licences & GST (DL 20B/21B)' : '4. Credit & Terms'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSaveParty}>
              {/* 1. General Info & Address */}
              {activeSection === 'BASIC' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Mail To (Mailing Display Name) *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Display Name for Invoices & Statements (e.g. SHREE GANESH MEDICOS)"
                        value={mailTo}
                        onChange={e => {
                          setMailTo(e.target.value);
                          if (!name) setName(e.target.value);
                        }}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '600' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Station / City
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. LUCKNOW"
                        value={station}
                        onChange={e => setStation(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Account Group
                      </label>
                      <select
                        value={accountGroup}
                        onChange={e => setAccountGroup(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '600' }}
                      >
                        <option value="SUNDRY_CREDITORS">SUNDRY CREDITORS (SUPPLIERS)</option>
                        <option value="SUNDRY_DEBTORS">SUNDRY DEBTORS (CUSTOMERS)</option>
                        <option value="BANK">BANK ACCOUNTS</option>
                        <option value="CASH">CASH-IN-HAND</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Balancing Method
                      </label>
                      <select
                        value={balancingMethod}
                        onChange={e => setBalancingMethod(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      >
                        <option value="BILL_BY_BILL">Bill by Bill</option>
                        <option value="ON_ACCOUNT">On Account</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Opening Balance (₹)
                      </label>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <input
                          type="number"
                          step="0.01"
                          value={openingBalance}
                          onChange={e => setOpeningBalance(e.target.value)}
                          style={{ flex: 1, padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'right' }}
                        />
                        <select
                          value={openingBalanceType}
                          onChange={e => setOpeningBalanceType(e.target.value as 'DR' | 'CR')}
                          style={{ width: '70px', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '700' }}
                        >
                          <option value="CR">Cr</option>
                          <option value="DR">Dr</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                      Ledger Name (Legal / Registered Name)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. ADMARIS PHARMACEUTICALS PVT. LTD."
                      value={name}
                      onChange={e => setName(e.target.value)}
                      style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                      Street Address
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Shop/Unit No., Street, Area..."
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>PIN Code</label>
                      <input
                        type="text"
                        placeholder="e.g. 226020"
                        value={pincode}
                        onChange={e => setPincode(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>State & GST Code</label>
                      <input
                        type="text"
                        placeholder="e.g. 09-UTTAR PRADESH"
                        value={`${stateCode ? `${stateCode}-` : ''}${state}`}
                        onChange={e => {
                          const val = e.target.value;
                          if (val.includes('-')) {
                            const [code, ...st] = val.split('-');
                            setStateCode(code.trim());
                            setState(st.join('-').trim());
                          } else {
                            setState(val);
                          }
                        }}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Country</label>
                      <input
                        type="text"
                        value={country}
                        onChange={e => setCountry(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Contact Persons */}
              {activeSection === 'CONTACT' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Contact Person Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Priyadarshi Sharma"
                        value={contactPerson}
                        onChange={e => setContactPerson(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Designation</label>
                      <input
                        type="text"
                        placeholder="e.g. Sales Manager / Proprietor"
                        value={designation}
                        onChange={e => setDesignation(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Mobile Number *</label>
                      <input
                        type="text"
                        placeholder="10-digit mobile"
                        value={mobile}
                        onChange={e => setMobile(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '600' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Office Phone</label>
                      <input
                        type="text"
                        placeholder="Landline / Ext"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Fax Number</label>
                      <input
                        type="text"
                        placeholder="Fax"
                        value={faxNo}
                        onChange={e => setFaxNo(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Email Address</label>
                      <input
                        type="email"
                        placeholder="e.g. sales@admarispharma.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Website / Portal</label>
                      <input
                        type="text"
                        placeholder="e.g. www.admarispharma.com"
                        value={website}
                        onChange={e => setWebsite(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Licences & GST (DL 20B/21B) */}
              {activeSection === 'STATUTORY' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Drug License No. (D.L. No. 20B, 21B)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. WLF20B2025UP010333, WLF21B2025UP0"
                        value={drugLicenseNo}
                        onChange={e => setDrugLicenseNo(e.target.value.toUpperCase())}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '600' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        D.L. Expiry Date
                      </label>
                      <input
                        type="date"
                        value={dlExpiryDate}
                        onChange={e => setDlExpiryDate(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '1rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                          G.S.T.IN No.
                        </label>
                        <button
                          type="button"
                          onClick={() => handleGstinLookup()}
                          disabled={gstLookupLoading}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#0284c7',
                            fontSize: '11px',
                            fontWeight: '700',
                            cursor: 'pointer'
                          }}
                        >
                          {gstLookupLoading ? 'Fetching...' : '⚡ Autofill Firm'}
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="e.g. 09AANCA1902B1Z4"
                        value={gstin}
                        onChange={e => handleGstinChange(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleGstinLookup();
                          }
                        }}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '700', fontFamily: 'monospace' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        I.T. PAN No.
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. AANCA1902B"
                        value={panNo}
                        onChange={e => setPanNo(e.target.value.toUpperCase())}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontFamily: 'monospace' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Ledger Category
                      </label>
                      <select
                        value={ledgerCategory}
                        onChange={e => setLedgerCategory(e.target.value as any)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      >
                        <option value="REGISTERED">REGISTERED (Regular GST)</option>
                        <option value="COMPOSITE">COMPOSITION DEALER</option>
                        <option value="UNREGISTERED">UNREGISTERED</option>
                        <option value="CONSUMER">CONSUMER</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Food Licence No. (FSSAI)
                      </label>
                      <input
                        type="text"
                        placeholder="FSSAI License No."
                        value={fssaiNo}
                        onChange={e => setFssaiNo(e.target.value.toUpperCase())}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        FSSAI Expiry Date
                      </label>
                      <input
                        type="date"
                        value={fssaiExpiryDate}
                        onChange={e => setFssaiExpiryDate(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 4. Credit & Terms */}
              {activeSection === 'TERMS' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Credit Limit (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00 for no limit"
                        value={creditLimit}
                        onChange={e => setCreditLimit(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Narco / Sch-H Item Billing
                      </label>
                      <select
                        value={scheduleHNotice}
                        onChange={e => setScheduleHNotice(e.target.value as any)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      >
                        <option value="ALLOW_ALL">Allow All Items</option>
                        <option value="WARNING">Prompt Warning for Rx</option>
                        <option value="BLOCK">Block Narcotics / Sch-H</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Default Doctor Name [F1]
                      </label>
                      <input
                        type="text"
                        placeholder="Dr. Name"
                        value={defaultDoctorName}
                        onChange={e => setDefaultDoctorName(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Doctor Reg. No.
                      </label>
                      <input
                        type="text"
                        placeholder="Medical Council Reg No"
                        value={defaultDoctorRegNo}
                        onChange={e => setDefaultDoctorRegNo(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-secondary)', padding: '0.9rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-primary)' }}>Hold Payment / Billing Lock</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Block automated payments if GSTR-1 not filed or credit overdue</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={holdPayment}
                      onChange={e => setHoldPayment(e.target.checked)}
                      style={{ width: '18px', height: '18px', accentColor: 'var(--brand-teal)' }}
                    />
                  </div>
                </div>
              )}

              {/* Modal Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <div>
                  {editingPartyId && (
                    <button
                      type="button"
                      disabled={deletingPartyId === editingPartyId}
                      onClick={() => {
                        const targetParty = parties.find(p => p.id === editingPartyId);
                        if (targetParty) handleDeleteParty(targetParty);
                      }}
                      style={{
                        padding: '0.65rem 1rem',
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '6px',
                        color: '#ef4444',
                        cursor: deletingPartyId === editingPartyId ? 'not-allowed' : 'pointer',
                        opacity: deletingPartyId === editingPartyId ? 0.6 : 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.85rem',
                        fontWeight: '600'
                      }}
                    >
                      <Trash2 size={15} /> {deletingPartyId === editingPartyId ? 'Deleting Ledger...' : 'Delete Ledger'}
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.8rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{ padding: '0.65rem 1.2rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      padding: '0.65rem 1.5rem',
                      background: 'var(--brand-teal)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: '700',
                      cursor: submitting ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {submitting ? 'Saving Ledger...' : editingPartyId ? 'Update Ledger' : 'Save Ledger Entry'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Ledgers Modal */}
      {showImportModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            maxWidth: '850px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#dcfce7', padding: '8px', borderRadius: '8px', color: '#16a34a' }}>
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>Import Party Ledgers</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                    Bulk load suppliers and customer ledgers from Excel or CSV sheet.
                  </p>
                </div>
              </div>
              <button
                onClick={() => !importing && setShowImportModal(false)}
                disabled={importing}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Option Selector Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <div
                  style={{
                    border: '2px dashed #0284c7',
                    background: '#f0f9ff',
                    borderRadius: '8px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <UploadCloud size={16} color="#0284c7" />
                    Upload Excel (.xlsx / .xls / .csv)
                  </div>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileUpload}
                    disabled={importing}
                    style={{ fontSize: '12px' }}
                  />
                  <div style={{ fontSize: '11px', color: '#0284c7' }}>
                    Supports columns: Ledger Name, Type, GSTIN, DL No, Station, State, Mobile, Opening Balance.
                  </div>
                </div>

                <div
                  onClick={handleExportPartyTemplate}
                  style={{
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    padding: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Download size={16} color="#64748b" />
                    Download Sample Party Template
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    Get a formatted Excel sheet with supplier & customer sample columns.
                  </div>
                </div>
              </div>

              {/* Preview List */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', overflow: 'hidden' }}>
                <div style={{
                  padding: '10px 14px',
                  background: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Preview Ledgers ({previewParties.length})</span>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>
                      (Duplicates with existing ledger names will be safely skipped)
                    </span>
                  </div>
                  <div style={{ maxWidth: '240px' }}>
                    <input
                      type="text"
                      placeholder="Filter preview..."
                      value={importSearch}
                      onChange={(e) => setImportSearch(e.target.value)}
                      style={{ fontSize: '12px', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                  {previewParties.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                      No party ledgers loaded yet. Please select an Excel/CSV file above.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                          <th style={{ padding: '8px 12px', width: '35px' }}>#</th>
                          <th style={{ padding: '8px 12px' }}>Ledger Name</th>
                          <th style={{ padding: '8px 12px' }}>Type</th>
                          <th style={{ padding: '8px 12px' }}>GSTIN</th>
                          <th style={{ padding: '8px 12px' }}>Station / State</th>
                          <th style={{ padding: '8px 12px' }}>Mobile</th>
                          <th style={{ padding: '8px 12px' }}>Opening Bal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewParties
                          .filter(p =>
                            !importSearch ||
                            p.name.toLowerCase().includes(importSearch.toLowerCase()) ||
                            (p.gstin && p.gstin.toLowerCase().includes(importSearch.toLowerCase()))
                          )
                          .map((p, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '6px 12px', color: '#94a3b8' }}>{idx + 1}</td>
                              <td style={{ padding: '6px 12px', fontWeight: 600, color: '#0f172a' }}>{p.name}</td>
                              <td style={{ padding: '6px 12px' }}>
                                <span style={{
                                  background: p.type === 'supplier' ? '#e0f2fe' : '#dcfce7',
                                  color: p.type === 'supplier' ? '#0369a1' : '#15803d',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600
                                }}>
                                  {p.type.toUpperCase()}
                                </span>
                              </td>
                              <td style={{ padding: '6px 12px', color: '#64748b' }}>{p.gstin || '—'}</td>
                              <td style={{ padding: '6px 12px', color: '#64748b' }}>{p.station || 'LOCAL'} ({p.state || 'UP'})</td>
                              <td style={{ padding: '6px 12px', color: '#64748b' }}>{p.mobile || '—'}</td>
                              <td style={{ padding: '6px 12px', color: '#64748b' }}>₹{p.openingBalance} {p.openingBalanceType}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {importing && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, color: '#166534', marginBottom: '6px' }}>
                    <span>Importing party ledgers into database...</span>
                    <span>{importProgress}%</span>
                  </div>
                  <div style={{ height: '8px', width: '100%', background: '#dcfce7', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${importProgress}%`, background: '#22c55e', transition: 'width 0.2s ease-in-out' }} />
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Ready to insert <strong>{previewParties.length}</strong> party ledgers.
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  disabled={importing}
                  style={{ padding: '0.5rem 1rem', background: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkImport}
                  disabled={importing || previewParties.length === 0}
                  style={{
                    padding: '0.5rem 1.2rem',
                    background: previewParties.length === 0 ? '#94a3b8' : '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: previewParties.length === 0 || importing ? 'not-allowed' : 'pointer'
                  }}
                >
                  {importing ? `Importing (${importProgress}%)...` : `Confirm & Import (${previewParties.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          PARTY LEDGER STATEMENT MODAL (Purchases, Returns & Payments)
          ======================================================== */}
      {showStatementModal && statementParty && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 150,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            color: 'var(--text-primary, #0f172a)',
            width: '100%',
            maxWidth: '1050px',
            maxHeight: '92vh',
            borderRadius: '14px',
            overflowY: 'auto',
            padding: '1.8rem',
            position: 'relative',
            boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
            border: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.2rem', borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ background: '#0284c7', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>
                    {statementParty.type.toUpperCase()} LEDGER
                  </span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>•</span>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Station: {statementParty.station || 'LOCAL'}</span>
                </div>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                  {statementParty.name}
                </h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', marginTop: '4px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                  {statementParty.gstin && <span>GSTIN: <strong style={{ color: '#0f172a' }}>{statementParty.gstin}</strong></span>}
                  {statementParty.drugLicenseNo && <span>DL No: <strong style={{ color: '#0f172a' }}>{statementParty.drugLicenseNo}</strong></span>}
                  {statementParty.phone && <span>Phone: <strong style={{ color: '#0f172a' }}>{statementParty.phone}</strong></span>}
                  {statementParty.address && <span>Address: {statementParty.address}</span>}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={handleExportStatementExcel}
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700 }}
                  title="Export full ledger statement to Excel"
                >
                  <Download size={14} /> Export Excel
                </button>
                <button
                  onClick={() => window.print()}
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700 }}
                >
                  <FileText size={14} /> Print
                </button>
                <button
                  onClick={() => setShowStatementModal(false)}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', marginLeft: '6px' }}
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Date Range Filter Bar */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.8rem 1rem', marginBottom: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>PERIOD:</span>
                <button
                  type="button"
                  onClick={() => {
                    setStatementStartDate('');
                    setStatementEndDate('');
                    handleOpenStatement(statementParty, '', '');
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: !statementStartDate && !statementEndDate ? '#0284c7' : '#ffffff',
                    color: !statementStartDate && !statementEndDate ? '#ffffff' : '#0f172a',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  All Time
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                    const today = now.toISOString().split('T')[0];
                    setStatementStartDate(firstDay);
                    setStatementEndDate(today);
                    handleOpenStatement(statementParty, firstDay, today);
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  This Month
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="date"
                  value={statementStartDate}
                  onChange={e => setStatementStartDate(e.target.value)}
                  style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                />
                <span style={{ color: '#64748b', fontSize: '12px' }}>to</span>
                <input
                  type="date"
                  value={statementEndDate}
                  onChange={e => setStatementEndDate(e.target.value)}
                  style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                />
                <button
                  type="button"
                  onClick={() => handleOpenStatement(statementParty)}
                  className="btn btn-primary"
                  style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 700 }}
                >
                  Filter
                </button>
              </div>
            </div>

            {/* Financial Summary Metric Cards */}
            {statementData && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '1.4rem' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Opening Balance</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                    ₹{statementData.summary.openingBalance.toFixed(2)} <span style={{ fontSize: '12px', color: '#64748b' }}>({statementData.summary.openingBalanceType})</span>
                  </div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' }}>Total Inward (Debit)</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#1d4ed8', marginTop: '2px' }}>
                    +₹{statementData.summary.totalPurchases.toFixed(2)}
                  </div>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>Returns / CN (Credit)</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
                    -₹{statementData.summary.totalReturns.toFixed(2)}
                  </div>
                </div>

                <div style={{ background: statementData.summary.netOutstanding > 0 ? '#fef2f2' : '#f0fdf4', border: '1.5px solid ' + (statementData.summary.netOutstanding > 0 ? '#fca5a5' : '#86efac'), borderRadius: '8px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: statementData.summary.netOutstanding > 0 ? '#b91c1c' : '#15803d', textTransform: 'uppercase' }}>Net Outstanding Payable</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: statementData.summary.netOutstanding > 0 ? '#dc2626' : '#16a34a', marginTop: '2px' }}>
                    ₹{statementData.summary.netOutstanding.toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            {/* Statement Transactions Table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loadingStatement ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                  Loading ledger transactions...
                </div>
              ) : !statementData || statementData.transactions.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                  <p style={{ margin: 0, fontWeight: 700, color: '#475569' }}>No purchase bills or return vouchers found in this period.</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#475569', textAlign: 'left', fontWeight: 700 }}>
                      <th style={{ padding: '0.65rem 0.8rem' }}>Date</th>
                      <th style={{ padding: '0.65rem 0.8rem' }}>Voucher Type</th>
                      <th style={{ padding: '0.65rem 0.8rem' }}>Voucher / Bill #</th>
                      <th style={{ padding: '0.65rem 0.8rem' }}>Particulars / Items</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'right' }}>Debit (₹)</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'right' }}>Credit (₹)</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'right' }}>Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementData.transactions.map((t, idx) => {
                      const isExpanded = !!expandedRows[t.voucherNo || String(idx)];
                      return (
                        <React.Fragment key={idx}>
                          <tr style={{ borderBottom: '1px solid #e2e8f0', background: t.type === 'PURCHASE_RETURN' ? 'rgba(16, 185, 129, 0.04)' : 'transparent' }}>
                            <td style={{ padding: '0.65rem 0.8rem', whiteSpace: 'nowrap', color: '#64748b' }}>
                              {new Date(t.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </td>
                            <td style={{ padding: '0.65rem 0.8rem' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: t.type === 'OPENING_BALANCE' ? '#fef3c7' : t.type === 'PURCHASE_RETURN' ? '#dcfce7' : t.type === 'PURCHASE' ? '#eff6ff' : t.type === 'SALE' ? '#e0f2fe' : '#f1f5f9',
                                color: t.type === 'OPENING_BALANCE' ? '#b45309' : t.type === 'PURCHASE_RETURN' ? '#166534' : t.type === 'PURCHASE' ? '#1d4ed8' : t.type === 'SALE' ? '#0284c7' : '#475569'
                              }}>
                                {t.typeLabel}
                              </span>
                            </td>
                            <td style={{ padding: '0.65rem 0.8rem', fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>
                              {t.voucherNo}
                            </td>
                            <td style={{ padding: '0.65rem 0.8rem' }}>
                              <div style={{ color: '#0f172a', fontWeight: 600 }}>{t.particulars}</div>
                              {t.itemDetails && t.itemDetails.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedRows(prev => ({ ...prev, [t.voucherNo || String(idx)]: !isExpanded }))}
                                  style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: '2px 0 0 0' }}
                                >
                                  {isExpanded ? '▲ Hide Items' : `▼ View ${t.itemDetails.length} items`}
                                </button>
                              )}
                            </td>
                            <td style={{ padding: '0.65rem 0.8rem', textAlign: 'right', fontWeight: 700, color: t.debit > 0 ? '#1d4ed8' : '#cbd5e1' }}>
                              {t.debit > 0 ? `₹${t.debit.toFixed(2)}` : '—'}
                            </td>
                            <td style={{ padding: '0.65rem 0.8rem', textAlign: 'right', fontWeight: 700, color: t.credit > 0 ? '#16a34a' : '#cbd5e1' }}>
                              {t.credit > 0 ? `-₹${t.credit.toFixed(2)}` : '—'}
                            </td>
                            <td style={{ padding: '0.65rem 0.8rem', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                              ₹{t.runningBalance.toFixed(2)}
                            </td>
                          </tr>

                          {/* Expandable Item Detail Rows */}
                          {isExpanded && t.itemDetails && (
                            <tr style={{ background: '#f8fafc' }}>
                              <td colSpan={7} style={{ padding: '0.6rem 1.2rem', borderBottom: '1px solid #cbd5e1' }}>
                                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.6rem' }}>
                                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
                                    Line-Item Breakdown:
                                  </div>
                                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                                    <thead>
                                      <tr style={{ borderBottom: '1px solid #f1f5f9', color: '#64748b', textAlign: 'left' }}>
                                        <th style={{ padding: '4px 6px' }}>Medicine</th>
                                        <th style={{ padding: '4px 6px' }}>Batch</th>
                                        <th style={{ padding: '4px 6px', textAlign: 'center' }}>Qty</th>
                                        <th style={{ padding: '4px 6px', textAlign: 'right' }}>Rate (₹)</th>
                                        <th style={{ padding: '4px 6px', textAlign: 'right' }}>Total (₹)</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {t.itemDetails.map((it, iIdx) => (
                                        <tr key={iIdx} style={{ borderBottom: '1px solid #f8fafc' }}>
                                          <td style={{ padding: '4px 6px', fontWeight: 600 }}>{it.medicineName}</td>
                                          <td style={{ padding: '4px 6px', fontFamily: 'monospace' }}>{it.batchNumber}</td>
                                          <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                                            {it.strips !== undefined ? `${it.strips} Str ${it.looseQty > 0 ? `+ ${it.looseQty} Tab` : ''}` : it.quantity}
                                          </td>
                                          <td style={{ padding: '4px 6px', textAlign: 'right' }}>₹{Number(it.rate).toFixed(2)}</td>
                                          <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700 }}>₹{Number(it.total).toFixed(2)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
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
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ marginTop: '1.2rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowStatementModal(false)}
                className="btn btn-secondary"
                style={{ padding: '0.6rem 1.4rem', fontWeight: 700 }}
              >
                Close Statement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

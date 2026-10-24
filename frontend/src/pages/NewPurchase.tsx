import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { getLocalDateString } from '../utils/dateUtils';

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
  Search,
  Package,
  Layers,
  Save,
  Building2,
  Sparkles,
  PlusCircle,
  X,
  ChevronDown
} from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  mailTo?: string | null;
  station?: string | null;
  gstin?: string | null;
  drugLicenseNo?: string | null;
  outstandingBalance: number;
}

interface MedicineItem {
  id: string;
  sku: string;
  name: string;
  genericName?: string | null;
  manufacturer?: string | null;
  hsnCode?: string;
  unit: string;
  conversionFactor: number;
  gstRate: number;
  totalStock?: number;
  batches?: Array<{
    id: string;
    batchNumber: string;
    expiryDate: string;
    mrp: number;
    ptr: number;
    pts: number;
    currentStock: number;
  }>;
}

interface PurchaseRow {
  id: string;
  itemId: string;
  medicineName: string;
  genericName?: string;
  manufacturer?: string;
  hsnCode: string; // HSN
  batchNumber: string; // Batch
  expiryMonth: string; // Exp. MM
  expiryYear: string; // Exp. YY
  quantity: string; // Qty.
  freeQuantity: string; // Free
  purchaseRate: string; // Rate (PTR)
  discountPercent: string; // Disc%
  gstRate: string; // GST%
  mrp: string; // MRP
  pts?: string;
  pack?: string;
  sku?: string;
  isNewCatalog?: boolean;
}

export default function NewPurchase({
  onBack,
  onCreated,
  editingPurchaseId
}: {
  onBack: () => void;
  onCreated: () => void;
  editingPurchaseId?: string | null;
}) {
  const { activeCompany } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [medicines, setMedicines] = useState<MedicineItem[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);

  // Form Header State (Photo 2)
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierSearchText, setSupplierSearchText] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const supplierDropdownRef = useRef<HTMLDivElement>(null);
  const [entryNo, setEntryNo] = useState(`PUR-${Date.now().toString().slice(-4)}`);
  const [partyBillNo, setPartyBillNo] = useState(''); // Party No. (Supplier Bill No)
  const [billDate, setBillDate] = useState(getLocalDateString()); // Dt:
  const [entryDate, setEntryDate] = useState(getLocalDateString()); // Date:
  const [purchaseType, setPurchaseType] = useState<'TAX' | 'RETAIL' | 'CHALLAN'>('TAX'); // Type:
  const [dueDate, setDueDate] = useState('');
  const [paymentMode, setPaymentMode] = useState<'CREDIT' | 'CASH' | 'BANK_TRANSFER' | 'UPI'>('CREDIT');
  const [paidAmount, setPaidAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Active Row Focus for Footer Inspection HUD
  const [activeRowIndex, setActiveRowIndex] = useState<number>(0);

  // Keyboard Navigation Refs for Zero-Mouse Rapid Inward Entry
  const supplierInputRef = useRef<HTMLInputElement>(null);
  const partyBillNoInputRef = useRef<HTMLInputElement>(null);
  const billDateInputRef = useRef<HTMLInputElement>(null);

  const medInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const batchInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const expMonthInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const expYearInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const qtyInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const freeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const rateInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const discInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const gstInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const mrpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Navigation indices for keyboard-driven dropdowns
  const [supplierDropdownIndex, setSupplierDropdownIndex] = useState<number>(0);
  const [medDropdownIndex, setMedDropdownIndex] = useState<number>(0);
  const isPurchaseKeyboardNavRef = useRef(false);
  const purchaseKeyboardTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to create a blank purchase row with no dummy pre-filled values
  const createEmptyRow = (id: string): PurchaseRow => ({
    id,
    itemId: '',
    medicineName: '',
    genericName: '',
    manufacturer: '',
    hsnCode: '',
    sku: '',
    pack: '1*10',
    batchNumber: '',
    expiryMonth: '',
    expiryYear: '',
    quantity: '',
    freeQuantity: '',
    purchaseRate: '',
    discountPercent: '',
    gstRate: '',
    mrp: '',
    pts: '',
    isNewCatalog: false
  });

  // Rows State - Initialized empty without dummy values
  const [rows, setRows] = useState<PurchaseRow[]>([
    createEmptyRow('row-1')
  ]);

  // Autocomplete search states
  const [activeSearchRowIndex, setActiveSearchRowIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside to close supplier dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(e.target as Node)) {
        setShowSupplierDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Quick Add Medicine Modal State
  const [showAddMedicineModal, setShowAddMedicineModal] = useState(false);
  const [newMedForm, setNewMedForm] = useState({
    name: '',
    genericName: '',
    manufacturer: '',
    pack: '1*10',
    unit: 'STRIP',
    conversionFactor: 10,
    hsnCode: '3004',
    gstRate: 5,
    defaultPtr: 100,
    defaultMrp: 140,
    defaultPts: 120
  });
  const [savingNewMed, setSavingNewMed] = useState(false);

  // Quick Add Supplier Modal State
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [newSupGstin, setNewSupGstin] = useState('');
  const [newSupName, setNewSupName] = useState(''); // Trade / Firm Name
  const [newSupLegalName, setNewSupLegalName] = useState(''); // Legal / Proprietor Name
  const [newSupStation, setNewSupStation] = useState('');
  const [newSupAddress, setNewSupAddress] = useState('');
  const [newSupState, setNewSupState] = useState('');
  const [newSupStateCode, setNewSupStateCode] = useState('');
  const [newSupPincode, setNewSupPincode] = useState('');
  const [newSupPan, setNewSupPan] = useState('');
  const [newSupMobile, setNewSupMobile] = useState('');
  const [newSupDrugLicense, setNewSupDrugLicense] = useState('');
  const [savingNewSup, setSavingNewSup] = useState(false);
  const [supGstLookupLoading, setSupGstLookupLoading] = useState(false);
  const [supGstLookupMsg, setSupGstLookupMsg] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

  const handleQuickGstinLookup = async () => {
    const clean = newSupGstin.trim().toUpperCase();
    if (!clean) {
      setSupGstLookupMsg({ type: 'error', text: 'Please enter a 15-character GSTIN' });
      return;
    }
    try {
      setSupGstLookupLoading(true);
      setSupGstLookupMsg(null);
      const res = await api.post('/api/gst/lookup', { gstin: clean }, {
        companyId: activeCompany?.id
      });
      const d = (res as any)?.data || res;
      if (d) {
        const firmTradeName = (d.tradeName || d.mailTo || d.legalName || '').trim();
        const legalName = (d.legalName || d.tradeName || '').trim();

        if (firmTradeName) {
          setNewSupName(firmTradeName);
        } else if (legalName) {
          setNewSupName(legalName);
        }

        if (legalName) {
          setNewSupLegalName(legalName);
        }

        if (d.address) setNewSupAddress(d.address);
        if (d.city) setNewSupStation(d.city);
        if (d.state) setNewSupState(d.state);
        if (d.stateCode) setNewSupStateCode(d.stateCode);
        if (d.pincode) setNewSupPincode(d.pincode);
        if (d.pan) setNewSupPan(d.pan);
        if (d.phone) setNewSupMobile(d.phone);
        if (d.dlNumber) setNewSupDrugLicense(d.dlNumber);

        const isLive = (res as any)?.source === 'GOVERNMENT_GSP_LIVE';
        const isCache = (res as any)?.source === 'DATABASE_CACHE';
        const srcLabel = isLive ? 'Govt GST Portal' : (isCache ? 'Database Records' : 'Smart Decoder');

        if (d.status?.toLowerCase() === 'active') {
          setSupGstLookupMsg({
            type: 'success',
            text: `✅ Verified (${srcLabel}): ${firmTradeName || 'Active Firm'}${legalName && legalName !== firmTradeName ? ` (Proprietor: ${legalName})` : ''} — ${d.state}`
          });
        } else {
          setSupGstLookupMsg({
            type: 'warning',
            text: `⚠️ Status: ${d.status?.toUpperCase() || 'INACTIVE'}`
          });
        }
      }
    } catch (err: any) {
      console.error('GST lookup failed:', err);
      setSupGstLookupMsg({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Failed to lookup GSTIN'
      });
    } finally {
      setSupGstLookupLoading(false);
    }
  };

  const handleCreateSupplierQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalTradeName = newSupName.trim() || newSupLegalName.trim();
    const finalLegalName = newSupLegalName.trim() || newSupName.trim();
    if (!activeCompany || !finalTradeName) return;

    try {
      setSavingNewSup(true);
      const res = await api.post('/api/parties', {
        name: finalTradeName, // Always use Firm / Trade Name as primary party name
        type: 'supplier',
        accountGroup: 'SUNDRY_CREDITORS',
        balancingMethod: 'BILL_BY_BILL',
        openingBalance: 0,
        openingBalanceType: 'CR',
        mailTo: finalTradeName,
        contactPerson: finalLegalName !== finalTradeName ? finalLegalName : null,
        designation: finalLegalName !== finalTradeName ? 'Proprietor' : null,
        address: newSupAddress.trim() || null,
        station: newSupStation.trim() || null,
        state: newSupState.trim() || null,
        stateCode: newSupStateCode.trim() || null,
        pincode: newSupPincode.trim() || null,
        gstin: newSupGstin.trim().toUpperCase() || null,
        panNo: newSupPan.trim().toUpperCase() || null,
        mobile: newSupMobile.trim() || null,
        drugLicenseNo: newSupDrugLicense.trim().toUpperCase() || null,
        ledgerCategory: 'REGISTERED'
      }, {
        companyId: activeCompany.id
      });

      const newParty = res.data?.party;
      if (newParty) {
        setSuppliers(prev => [...prev, newParty]);
        setSelectedSupplierId(newParty.id);
        setSupplierSearchText(newParty.name || newParty.mailTo);
      }
      setShowAddSupplierModal(false);
      setNewSupGstin('');
      setNewSupName('');
      setNewSupLegalName('');
      setNewSupStation('');
      setNewSupAddress('');
      setNewSupState('');
      setNewSupStateCode('');
      setNewSupPincode('');
      setNewSupPan('');
      setNewSupMobile('');
      setNewSupDrugLicense('');
      setSupGstLookupMsg(null);
    } catch (err: any) {
      console.error('Failed to create supplier:', err);
      setSupGstLookupMsg({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Failed to save supplier'
      });
    } finally {
      setSavingNewSup(false);
    }
  };

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // Do not close if clicking inside any medicine input or inside the dropdown
      const isInputClick = medInputRefs.current.some(input => input && input.contains(target));
      if (!isInputClick && searchDropdownRef.current && !searchDropdownRef.current.contains(target)) {
        setActiveSearchRowIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Live real-time medicine search on typing
  useEffect(() => {
    if (!activeCompany || activeSearchRowIndex === null) return;
    const q = searchQuery.trim();
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<{ items: MedicineItem[] }>(
          `/api/items?search=${encodeURIComponent(q)}&limit=50`,
          { companyId: activeCompany.id }
        );
        if (res.items && Array.isArray(res.items)) {
          setMedicines(prev => {
            const map = new Map<string, MedicineItem>();
            prev.forEach(m => map.set(m.id, m));
            res.items.forEach(m => map.set(m.id, m));
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.error('Error fetching live medicine suggestions:', err);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [searchQuery, activeSearchRowIndex, activeCompany?.id]);

  useEffect(() => {
    fetchInitialData();
  }, [activeCompany?.id, editingPurchaseId]);

  // Keyboard shortcut listener (F2: Save, F4: Quick Add Med)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'F4') {
        e.preventDefault();
        setShowAddMedicineModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rows, selectedSupplierId, partyBillNo, billDate, paidAmount, paymentMode]);

  const fetchInitialData = async () => {
    if (!activeCompany) return;
    try {
      setLoadingSuppliers(true);
      const [supRes, medRes] = await Promise.all([
        api.get<{ parties: Supplier[] }>('/api/parties?type=supplier', { companyId: activeCompany.id }),
        api.get<{ items: MedicineItem[] }>('/api/items?limit=2000', { companyId: activeCompany.id })
      ]);
      setSuppliers(supRes.parties || []);
      setMedicines(medRes.items || []);

      if (editingPurchaseId) {
        const pRes = await api.get<{ purchase: any }>(`/api/purchases/${editingPurchaseId}`, {
          companyId: activeCompany.id
        });
        const pur = pRes.purchase;
        if (pur) {
          setSelectedSupplierId(pur.supplier?.id || '');
          setSupplierSearchText(pur.supplier?.mailTo || pur.supplier?.name || '');
          setPartyBillNo(pur.invoiceNumber || '');
          setBillDate(pur.purchaseDate ? getLocalDateString(new Date(pur.purchaseDate)) : getLocalDateString());
          setDueDate(pur.dueDate ? getLocalDateString(new Date(pur.dueDate)) : '');
          setPaymentMode(pur.paymentMode || 'CREDIT');
          setPaidAmount(String(pur.paidAmount ?? 0));
          setNotes(pur.notes || '');

          if (pur.items && Array.isArray(pur.items) && pur.items.length > 0) {
            const mappedRows: PurchaseRow[] = pur.items.map((pi: any, idx: number) => {
              const expDate = new Date(pi.expiryDate);
              const mm = isNaN(expDate.getTime()) ? '12' : String(expDate.getMonth() + 1).padStart(2, '0');
              const yyyy = isNaN(expDate.getTime()) ? String(new Date().getFullYear() + 2).slice(-2) : String(expDate.getFullYear()).slice(-2);

              const packStr = pi.pack || (pi.item?.conversionFactor > 1 ? `1*${pi.item.conversionFactor}` : '1*10');
              const factor = pi.item?.conversionFactor || pi.conversionFactor || parseRowPackFactor(packStr);
              let formattedQty = String(pi.quantity || 1);
              let formattedFree = String(pi.freeQuantity || 0);

              if (factor > 1 && pi.quantity !== undefined && pi.quantity !== null) {
                const str = Math.floor(pi.quantity / factor);
                const loose = pi.quantity % factor;
                formattedQty = loose > 0 ? `${str}.${loose}` : `${str}`;

                if (pi.freeQuantity > 0) {
                  const fStr = Math.floor(pi.freeQuantity / factor);
                  const fLoose = pi.freeQuantity % factor;
                  formattedFree = fLoose > 0 ? `${fStr}.${fLoose}` : `${fStr}`;
                }
              }

              return {
                id: `row-${idx + 1}`,
                itemId: pi.item?.id || pi.itemId || '',
                medicineName: pi.medicineName || pi.item?.name || '',
                genericName: pi.genericName || pi.item?.genericName || '',
                manufacturer: pi.manufacturer || pi.item?.manufacturer || '',
                sku: pi.sku || pi.item?.sku || '',
                pack: packStr,
                hsnCode: pi.hsnCode || pi.item?.hsnCode || '3004',
                batchNumber: pi.batchNumber || '',
                expiryMonth: mm,
                expiryYear: yyyy,
                quantity: formattedQty,
                freeQuantity: formattedFree,
                purchaseRate: String(pi.purchaseRate || 0),
                discountPercent: String(pi.discountPercent || 0),
                gstRate: String(pi.gstRate || 5),
                mrp: String(pi.mrp || 0),
                pts: String(pi.mrp || 0),
                isNewCatalog: false
              };
            });
            setRows(mappedRows);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load initial data');
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const handleAddRow = () => {
    const nextIdx = rows.length;
    setRows(prev => [...prev, createEmptyRow(`row-${Date.now()}`)]);
    setActiveRowIndex(nextIdx);
    setTimeout(() => {
      medInputRefs.current[nextIdx]?.focus();
    }, 60);
  };

  const handleRemoveRow = (index: number) => {
    if (rows.length === 1) return;
    setRows(prev => prev.filter((_, i) => i !== index));
    if (activeRowIndex >= rows.length - 1) {
      setActiveRowIndex(Math.max(0, rows.length - 2));
    }
  };

  const handleRowChange = (index: number, field: keyof PurchaseRow, value: any) => {
    setRows(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSelectExistingMedicine = (index: number, med: MedicineItem) => {
    const latestBatch = med.batches && med.batches.length > 0 ? med.batches[0] : null;
    const existingMrp = latestBatch?.mrp ? String(latestBatch.mrp) : '';
    const existingPtr = latestBatch?.ptr ? String(latestBatch.ptr) : '';
    const existingPts = latestBatch?.pts ? String(latestBatch.pts) : '';

    setRows(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        itemId: med.id,
        medicineName: med.name,
        genericName: med.genericName || '',
        manufacturer: med.manufacturer || '',
        mrp: existingMrp, // Auto-suggest previous MRP
        purchaseRate: existingPtr, // Auto-suggest previous purchase rate (PTR)
        pts: existingPts,
        hsnCode: med.hsnCode || '3004',
        sku: med.sku,
        pack: med.conversionFactor > 1 ? `1*${med.conversionFactor}` : `1*1 (${med.unit || 'Unit'})`,
        gstRate: String(med.gstRate ?? 5),
        isNewCatalog: false
      };
      return updated;
    });
    setActiveSearchRowIndex(null);
    setSearchQuery('');
    setMedDropdownIndex(0);

    // Auto-advance focus to Batch input
    setTimeout(() => {
      batchInputRefs.current[index]?.focus();
      batchInputRefs.current[index]?.select();
    }, 60);
  };

  const handleCreateNewMedicineInline = (index: number, customName: string) => {
    const cleanName = customName.trim();
    if (!cleanName) return;

    setRows(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        itemId: '',
        medicineName: cleanName,
        genericName: '',
        manufacturer: '',
        mrp: '',
        purchaseRate: '',
        pts: '',
        hsnCode: '3004',
        sku: '',
        pack: updated[index].pack || '1*10',
        gstRate: updated[index].gstRate || '5',
        isNewCatalog: true
      };
      return updated;
    });
    setActiveSearchRowIndex(null);
    setSearchQuery('');
    setMedDropdownIndex(0);

    // Auto-advance focus to Batch input
    setTimeout(() => {
      batchInputRefs.current[index]?.focus();
      batchInputRefs.current[index]?.select();
    }, 60);
  };

  const handleQuickAddMedicineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany) return;
    if (!newMedForm.name.trim()) {
      setError('Medicine name is required');
      return;
    }

    try {
      setSavingNewMed(true);
      const res = await api.post<{ item: MedicineItem }>('/api/items', {
        name: newMedForm.name.trim(),
        genericName: newMedForm.genericName.trim() || null,
        manufacturer: newMedForm.manufacturer.trim() || null,
        hsnCode: newMedForm.hsnCode || '3004',
        gstRate: Number(newMedForm.gstRate) || 5,
        unit: newMedForm.unit || 'STRIP',
        conversionFactor: Number(newMedForm.conversionFactor) || 1
      }, {
        companyId: activeCompany.id
      });

      const createdMed = res.item;
      setMedicines(prev => [...prev, createdMed]);

      // Populate into active row or current row
      if (rows.length > 0 && activeRowIndex < rows.length) {
        setRows(prev => {
          const updated = [...prev];
          updated[activeRowIndex] = {
            ...updated[activeRowIndex],
            itemId: createdMed.id,
            medicineName: createdMed.name,
            genericName: createdMed.genericName || '',
            manufacturer: createdMed.manufacturer || '',
            hsnCode: createdMed.hsnCode || '3004',
            sku: createdMed.sku,
            pack: createdMed.conversionFactor > 1 ? `1*${createdMed.conversionFactor}` : `1*1 (${createdMed.unit || 'Unit'})`,
            gstRate: String(createdMed.gstRate || 5),
            purchaseRate: String(newMedForm.defaultPtr || 100),
            mrp: String(newMedForm.defaultMrp || 140),
            pts: String(newMedForm.defaultPts || 120),
            isNewCatalog: false
          };
          return updated;
        });
      }

      setShowAddMedicineModal(false);
      setSuccessMsg(`Medicine "${createdMed.name}" added to catalog!`);
      setTimeout(() => setSuccessMsg(null), 4000);
      // Reset form
      setNewMedForm({
        name: '',
        genericName: '',
        manufacturer: '',
        pack: '1*10',
        unit: 'STRIP',
        conversionFactor: 10,
        hsnCode: '3004',
        gstRate: 5,
        defaultPtr: 100,
        defaultMrp: 140,
        defaultPts: 120
      });
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to create medicine');
    } finally {
      setSavingNewMed(false);
    }
  };

  const parseRowPackFactor = (packStr?: string) => {
    if (!packStr) return 10;
    const match = packStr.match(/^(\d+)\s*[\*xX]\s*(\d+)/);
    if (match) return parseInt(match[2]) || 1;
    const single = packStr.match(/^(\d+)/);
    if (single) return parseInt(single[1]) || 10;
    return 1;
  };

  const parseRowQuantity = (qtyStr: string, factor: number) => {
    const cleanFactor = Math.max(1, factor || 1);
    if (!qtyStr || isNaN(Number(qtyStr))) {
      return { strips: 0, loose: 0, totalBaseUnits: 0, decimalPacks: 0 };
    }
    const str = String(qtyStr).trim();
    if (cleanFactor <= 1) {
      const n = Math.max(0, parseFloat(str) || 0);
      return { strips: n, loose: 0, totalBaseUnits: Math.round(n), decimalPacks: n };
    }
    if (str.includes('.')) {
      const parts = str.split('.');
      const strips = Math.max(0, parseInt(parts[0], 10) || 0);
      const loose = Math.max(0, parseInt(parts[1], 10) || 0);
      return {
        strips,
        loose,
        totalBaseUnits: (strips * cleanFactor) + loose,
        decimalPacks: strips + (loose / cleanFactor)
      };
    } else {
      const strips = Math.max(0, parseInt(str, 10) || 0);
      return {
        strips,
        loose: 0,
        totalBaseUnits: strips * cleanFactor,
        decimalPacks: strips
      };
    }
  };

  // Row financial calculations (Supporting 20 = 20 strips, 20.4 = 20 strips + 4 loose tablets)
  const calculateRowTotal = (row: PurchaseRow) => {
    const factor = parseRowPackFactor(row.pack);
    const parsedQty = parseRowQuantity(row.quantity, factor);
    const rate = parseFloat(row.purchaseRate) || 0;
    const discPct = Math.max(0, Math.min(100, parseFloat(row.discountPercent) || 0));
    const gross = parsedQty.decimalPacks * rate;
    const disc = (gross * discPct) / 100;
    const taxable = gross - disc;
    const gstRate = parseFloat(row.gstRate) || 0;
    const gstAmt = (taxable * gstRate) / 100;
    return {
      gross,
      disc,
      taxable,
      gstAmt,
      total: taxable + gstAmt,
      parsedQty,
      factor
    };
  };

  // Bill Totals (Photo 2 Right Pane)
  const valueOfGoods = rows.reduce((sum, r) => sum + calculateRowTotal(r).gross, 0);
  const totalDiscount = rows.reduce((sum, r) => sum + calculateRowTotal(r).disc, 0);
  const taxableValue = rows.reduce((sum, r) => sum + calculateRowTotal(r).taxable, 0);
  const totalGst = rows.reduce((sum, r) => sum + calculateRowTotal(r).gstAmt, 0);
  const rawTotal = taxableValue + totalGst;
  const grandTotal = Math.round(rawTotal);
  const roundOff = Math.round((grandTotal - rawTotal) * 100) / 100;

  const filteredSuppliers = suppliers.filter(s => {
    if (!supplierSearchText.trim()) return true;
    const q = supplierSearchText.toLowerCase();
    return (
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.mailTo && s.mailTo.toLowerCase().includes(q)) ||
      (s.station && s.station.toLowerCase().includes(q)) ||
      (s.gstin && s.gstin.toLowerCase().includes(q))
    );
  });

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);
  const activeRow = rows[activeRowIndex] || rows[0];
  const activeMedicine = medicines.find(m => m.id === activeRow?.itemId);

  const handleSubmit = async () => {
    if (!activeCompany) return;
    if (!selectedSupplierId) {
      setError('Please select a Party Name');
      return;
    }
    if (!partyBillNo.trim()) {
      setError('Please enter Supplier Bill / Invoice No. (Party No.)');
      return;
    }

    // Validate rows
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const medName = (r.medicineName || '').trim();
      if (!r.itemId && !medName) {
        setError(`Row #${i + 1}: Please enter or select a medicine name`);
        return;
      }
      if (!r.batchNumber.trim()) {
        setError(`Row #${i + 1}: Please enter a valid batch number for ${medName || 'item'}`);
        return;
      }
      const qty = parseFloat(r.quantity) || 0;
      if (qty <= 0) {
        setError(`Row #${i + 1}: Quantity must be greater than 0`);
        return;
      }
    }

    try {
      setSubmitting(true);
      setError(null);

      const items = rows.map(r => {
        let rawM = parseInt(String(r.expiryMonth || '').replace(/\D/g, ''), 10) || 12;
        let rawY = parseInt(String(r.expiryYear || '').replace(/\D/g, ''), 10) || (new Date().getFullYear() + 2);

        let yyyy = rawY;
        let mm = rawM;

        if (rawM > 12 && rawY <= 12) {
          // Swapped MM and YY (e.g. 29/05 -> Year 29, Month 05)
          yyyy = rawM;
          mm = rawY;
        } else if (rawM === 20 && rawY > 20) {
          // User typed "20" "29" for year 2029
          yyyy = 2000 + (rawY % 100);
          mm = 12;
        } else if (rawM > 12) {
          mm = 12;
        }

        if (yyyy < 100) {
          yyyy = 2000 + yyyy;
        } else if (yyyy < 2000) {
          yyyy = 2000 + (yyyy % 100);
        }

        mm = Math.max(1, Math.min(12, mm));
        const mmStr = String(mm).padStart(2, '0');
        const lastDay = new Date(yyyy, mm, 0).getDate();
        const expiryDate = `${yyyy}-${mmStr}-${String(lastDay).padStart(2, '0')}`;

        return {
          itemId: r.itemId || undefined,
          medicineName: r.medicineName.trim(),
          genericName: r.genericName?.trim() || undefined,
          manufacturer: r.manufacturer?.trim() || undefined,
          hsnCode: r.hsnCode?.trim() || '3004',
          pack: r.pack || '1*10',
          batchNumber: r.batchNumber.trim().toUpperCase(),
          expiryDate,
          quantity: r.quantity, // Preserve fractional string e.g. "20.4"
          freeQuantity: r.freeQuantity || '0',
          purchaseRate: parseFloat(r.purchaseRate) || 0,
          mrp: parseFloat(r.mrp || '') || parseFloat(r.purchaseRate || '') || 0,
          pts: parseFloat(r.pts || '') || parseFloat(r.mrp || '') || parseFloat(r.purchaseRate || '') || 0,
          discountPercent: parseFloat(r.discountPercent || '') || 0,
          gstRate: parseFloat(r.gstRate || '') || 5
        };
      });

      const payload = {
        supplierId: selectedSupplierId,
        invoiceNumber: partyBillNo.trim(),
        purchaseDate: billDate,
        dueDate: dueDate || null,
        paymentMode,
        paidAmount: parseFloat(paidAmount) || 0,
        roundOff,
        notes: notes.trim() || null,
        items
      };

      if (editingPurchaseId) {
        await api.put(`/api/purchases/${editingPurchaseId}`, payload, {
          companyId: activeCompany.id,
          idempotencyKey: `pur-edit-${Date.now()}`
        });
      } else {
        await api.post('/api/purchases', payload, {
          companyId: activeCompany.id,
          idempotencyKey: `pur-${Date.now()}`
        });
      }

      onCreated();
    } catch (err: any) {
      console.error('Purchase error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to record purchase entry');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteThisBill = async () => {
    if (!activeCompany || !editingPurchaseId) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete / cancel Purchase Bill #${partyBillNo}?\n\nThis will:\n- Mark the purchase bill as CANCELLED\n- Deduct inward stock from batch inventory\n- Write append-only reversing ledger entries (PURCHASE_RETURN)\n- Revert supplier outstanding balance`
    );
    if (!confirmDelete) return;

    try {
      setSubmitting(true);
      setError(null);
      await api.delete(`/api/purchases/${editingPurchaseId}`, {
        companyId: activeCompany.id
      });
      onCreated();
    } catch (err: any) {
      console.error('Failed to cancel purchase:', err);
      setError(err.message || 'Failed to cancel purchase bill');
      setSubmitting(false);
    }
  };

  // Global Keyboard Shortcuts (F2: Save, F4: Quick Add Medicine, Alt+A: Add Row, Alt+D: Remove Row, Escape: Close)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (showAddMedicineModal || showAddSupplierModal) {
        if (e.key === 'Escape') {
          setShowAddMedicineModal(false);
          setShowAddSupplierModal(false);
        }
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        if (!submitting) {
          handleSubmit();
        }
      } else if (e.key === 'F4') {
        e.preventDefault();
        setShowAddMedicineModal(true);
      } else if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        handleAddRow();
      } else if (e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        if (rows.length > 1) {
          handleRemoveRow(activeRowIndex);
        }
      } else if (e.key === 'Escape') {
        setActiveSearchRowIndex(null);
        setShowSupplierDropdown(false);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    showAddMedicineModal,
    showAddSupplierModal,
    submitting,
    activeCompany,
    selectedSupplierId,
    partyBillNo,
    rows,
    activeRowIndex,
    editingPurchaseId,
    entryDate,
    billDate,
    purchaseType,
    paymentMode,
    paidAmount,
    notes,
    entryNo
  ]);

  // Keep highlighted medicine cleanly and comfortably in view within inward line items dropdown
  useEffect(() => {
    if (activeSearchRowIndex !== null && searchDropdownRef.current) {
      const container = searchDropdownRef.current;
      const activeEl = container.querySelector(`[data-med-dropdown-index="${medDropdownIndex}"]`) as HTMLElement;
      if (activeEl) {
        if (medDropdownIndex === 0) {
          container.scrollTop = 0;
          return;
        }

        const containerRect = container.getBoundingClientRect();
        const activeRect = activeEl.getBoundingClientRect();
        const BUFFER = 16;

        if (activeRect.bottom > containerRect.bottom - BUFFER) {
          container.scrollTop += (activeRect.bottom - containerRect.bottom + BUFFER);
        } else if (activeRect.top < containerRect.top + BUFFER) {
          container.scrollTop -= (containerRect.top - activeRect.top + BUFFER);
        }
      }
    }
  }, [medDropdownIndex, activeSearchRowIndex]);

  // Keep highlighted supplier cleanly in view within party dropdown
  useEffect(() => {
    if (showSupplierDropdown && supplierDropdownRef.current) {
      const container = supplierDropdownRef.current;
      const activeEl = container.querySelector(`[data-supplier-index="${supplierDropdownIndex}"]`) as HTMLElement;
      if (activeEl) {
        if (supplierDropdownIndex === 0) {
          container.scrollTop = 0;
          return;
        }
        if (supplierDropdownIndex === filteredSuppliers.length - 1) {
          container.scrollTop = container.scrollHeight;
          return;
        }

        const containerRect = container.getBoundingClientRect();
        const activeRect = activeEl.getBoundingClientRect();
        const BUFFER = 16;

        if (activeRect.bottom > containerRect.bottom - BUFFER) {
          container.scrollTop += (activeRect.bottom - containerRect.bottom + BUFFER);
        } else if (activeRect.top < containerRect.top + BUFFER) {
          container.scrollTop -= (containerRect.top - activeRect.top + BUFFER);
        }
      }
    }
  }, [supplierDropdownIndex, showSupplierDropdown, filteredSuppliers.length]);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <button
            onClick={onBack}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', fontSize: '0.85rem' }}
          >
            ← Back to Purchases List
          </button>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Truck style={{ color: '#0284c7' }} />
            {editingPurchaseId ? `EDIT PURCHASE BILL #${partyBillNo}` : 'PURCHASE CHALLAN / INWARD BILL ENTRY'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.2rem 0 0 0', fontSize: '0.85rem' }}>
            High-speed distributor bill entry with <strong style={{ color: '#0284c7' }}>Auto-Medicine Cataloging</strong> & automated stock ledger posting
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          {editingPurchaseId && (
            <button
              type="button"
              onClick={handleDeleteThisBill}
              disabled={submitting}
              style={{
                padding: '0.6rem 1rem',
                background: '#fef2f2',
                color: '#dc2626',
                border: '1px solid #fca5a5',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: submitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.85rem'
              }}
              title="Cancel / Delete this purchase bill"
            >
              <Trash2 size={15} /> Delete Bill
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowAddMedicineModal(true)}
            style={{
              padding: '0.6rem 1rem',
              background: 'rgba(2, 132, 199, 0.1)',
              color: '#0284c7',
              border: '1px solid #0284c7',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem'
            }}
          >
            <PlusCircle size={15} /> Quick Add Medicine (F4)
          </button>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: '0.65rem 1.4rem',
              background: '#0284c7',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '700',
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
            }}
          >
            <Save size={16} /> {submitting ? 'Saving...' : (editingPurchaseId ? 'Update Purchase Bill (F2)' : 'Save Inward Bill (F2)')}
          </button>
        </div>
      </div>

      {successMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid #10b981', padding: '0.8rem 1.2rem', borderRadius: '8px', color: '#10b981', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} /> {successMsg}
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', padding: '0.8rem 1.2rem', borderRadius: '8px', color: 'var(--accent-red)', marginBottom: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Marg-Style Purchase Header Form (Photo 2 Top Section) */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem', marginBottom: '1.2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '1rem', alignItems: 'end' }}>
          <div style={{ position: 'relative' }} ref={supplierDropdownRef}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)' }}>
                PARTY NAME *
              </label>
              <button
                type="button"
                onClick={() => setShowAddSupplierModal(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  fontSize: '11px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}
              >
                + Quick Add (GSTIN)
              </button>
            </div>
            
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                ref={supplierInputRef}
                type="text"
                value={supplierSearchText}
                onChange={e => {
                  setSupplierSearchText(e.target.value);
                  setSelectedSupplierId('');
                  setShowSupplierDropdown(true);
                  setSupplierDropdownIndex(0);
                }}
                onFocus={() => {
                  setShowSupplierDropdown(true);
                  setSupplierDropdownIndex(0);
                }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (!showSupplierDropdown) setShowSupplierDropdown(true);
                    isPurchaseKeyboardNavRef.current = true;
                    if (purchaseKeyboardTimerRef.current) clearTimeout(purchaseKeyboardTimerRef.current);
                    purchaseKeyboardTimerRef.current = setTimeout(() => {
                      isPurchaseKeyboardNavRef.current = false;
                    }, 400);

                    if (filteredSuppliers.length > 0) {
                      setSupplierDropdownIndex(prev => (prev + 1) % filteredSuppliers.length);
                    }
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (!showSupplierDropdown) setShowSupplierDropdown(true);
                    isPurchaseKeyboardNavRef.current = true;
                    if (purchaseKeyboardTimerRef.current) clearTimeout(purchaseKeyboardTimerRef.current);
                    purchaseKeyboardTimerRef.current = setTimeout(() => {
                      isPurchaseKeyboardNavRef.current = false;
                    }, 400);

                    if (filteredSuppliers.length > 0) {
                      setSupplierDropdownIndex(prev => (prev - 1 + filteredSuppliers.length) % filteredSuppliers.length);
                    }
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (filteredSuppliers.length > 0) {
                      const target = (supplierDropdownIndex >= 0 && supplierDropdownIndex < filteredSuppliers.length)
                        ? filteredSuppliers[supplierDropdownIndex]
                        : filteredSuppliers[0];
                      setSelectedSupplierId(target.id);
                      setSupplierSearchText(target.mailTo || target.name);
                      setShowSupplierDropdown(false);
                    }
                    partyBillNoInputRef.current?.focus();
                    partyBillNoInputRef.current?.select();
                  } else if (e.key === 'Escape') {
                    setShowSupplierDropdown(false);
                  }
                }}
                placeholder="Type party name or GSTIN to search... (↓/↑ to navigate, Enter to select)"
                style={{
                  width: '100%',
                  padding: '0.6rem 4.5rem 0.6rem 0.75rem',
                  background: 'var(--bg-secondary)',
                  border: selectedSupplierId ? '1.5px solid var(--brand-teal)' : '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontWeight: '700',
                  fontSize: '0.85rem'
                }}
              />
              <div style={{ position: 'absolute', right: '6px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                {supplierSearchText && (
                  <button
                    type="button"
                    onClick={() => {
                      setSupplierSearchText('');
                      setSelectedSupplierId('');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title="Clear"
                  >
                    <X size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowSupplierDropdown(prev => !prev)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Toggle party suggestions"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            </div>

            {showSupplierDropdown && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 100,
                marginTop: '4px',
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                maxHeight: '260px',
                overflowY: 'auto'
              }}>
                {filteredSuppliers.length === 0 ? (
                  <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                    No matching party found. Click <strong>+ Quick Add (GSTIN)</strong> above to create.
                  </div>
                ) : (
                  filteredSuppliers.map((s, sIdx) => {
                    const isSelected = sIdx === supplierDropdownIndex;
                    return (
                      <div
                        key={s.id}
                        data-supplier-index={sIdx}
                        onClick={() => {
                          setSelectedSupplierId(s.id);
                          setSupplierSearchText(s.mailTo || s.name);
                          setShowSupplierDropdown(false);
                          partyBillNoInputRef.current?.focus();
                          partyBillNoInputRef.current?.select();
                        }}
                        onMouseMove={() => {
                          if (!isPurchaseKeyboardNavRef.current && supplierDropdownIndex !== sIdx) {
                            setSupplierDropdownIndex(sIdx);
                          }
                        }}
                        style={{
                          padding: '8px 12px',
                          borderBottom: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          background: isSelected ? 'rgba(2, 132, 199, 0.15)' : (selectedSupplierId === s.id ? 'rgba(20, 184, 166, 0.12)' : 'transparent'),
                          borderLeft: isSelected ? '3px solid #0284c7' : '3px solid transparent',
                          transition: 'background 0.15s'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                            {s.mailTo || s.name}
                          </span>
                          {s.station && (
                            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: '4px' }}>
                              {s.station}
                            </span>
                          )}
                        </div>
                        {s.gstin && (
                          <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: '600' }}>
                            GSTIN: {s.gstin}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              ENTRY NO. :
            </label>
            <input
              type="text"
              value={entryNo}
              onChange={e => setEntryNo(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '600' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              DATE :
            </label>
            <input
              type="date"
              value={entryDate}
              onChange={e => setEntryDate(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              PARTY NO. (BILL NO) * :
            </label>
            <input
              ref={partyBillNoInputRef}
              type="text"
              placeholder="e.g. INV-9901"
              value={partyBillNo}
              onChange={e => setPartyBillNo(e.target.value.toUpperCase())}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  billDateInputRef.current?.focus();
                }
              }}
              style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '700' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              DT: (BILL DATE) :
            </label>
            <input
              ref={billDateInputRef}
              type="date"
              value={billDate}
              onChange={e => setBillDate(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  medInputRefs.current[0]?.focus();
                }
              }}
              style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
      </div>

      {/* Product Entry Grid Table Matching Wholesale Tax Invoice Exactly */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'visible', marginBottom: '1.2rem', position: 'relative' }}>
        <div style={{ padding: '0.8rem 1.2rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(2, 132, 199, 0.03)', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}>
          <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Package size={16} style={{ color: '#0284c7' }} /> Inward Line Items ({rows.length})
            <span style={{ fontSize: '0.75rem', fontWeight: '500', color: '#0284c7', background: 'rgba(2, 132, 199, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
              ✨ Type any new medicine name to auto-save to Catalog
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleAddRow}
              style={{
                padding: '0.4rem 0.8rem',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
              title="Add line item [Alt + A]"
            >
              <Plus size={14} /> Add Product Line (Alt+A)
            </button>
          </div>
        </div>

        {/* Responsive Inward Line Items Grid with Guaranteed Width & Zero Truncation */}
        <div style={{
          overflowX: activeSearchRowIndex !== null && (searchQuery || '').trim().length > 0 ? 'visible' : 'auto',
          minHeight: activeSearchRowIndex !== null && (searchQuery || '').trim().length > 0 ? '460px' : '140px',
          position: 'relative'
        }}>
          <table style={{ width: '100%', minWidth: '1280px', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.75rem 0.5rem', width: '40px', minWidth: '40px', textAlign: 'center' }}>Sr.</th>
                <th style={{ padding: '0.75rem 0.7rem', minWidth: '240px' }}>Description Of Goods</th>
                <th style={{ padding: '0.75rem 0.4rem', width: '85px', minWidth: '85px', textAlign: 'center' }}>Pack (1*X)</th>
                <th style={{ padding: '0.75rem 0.4rem', width: '75px', minWidth: '75px', textAlign: 'center' }}>HSN</th>
                <th style={{ padding: '0.75rem 0.6rem', width: '140px', minWidth: '130px' }}>Batch</th>
                <th style={{ padding: '0.75rem 0.4rem', width: '105px', minWidth: '100px', textAlign: 'center' }}>Exp.</th>
                <th style={{ padding: '0.75rem 0.5rem', width: '95px', minWidth: '90px', textAlign: 'center' }} title="e.g. 20 = 20 Strips, 20.4 = 20 Strips + 4 loose tablets">
                  Qty (Str.Tab)
                </th>
                <th style={{ padding: '0.75rem 0.4rem', width: '65px', minWidth: '60px', textAlign: 'center' }}>Free</th>
                <th style={{ padding: '0.75rem 0.6rem', width: '115px', minWidth: '105px', textAlign: 'right' }}>Rate</th>
                <th style={{ padding: '0.75rem 0.4rem', width: '75px', minWidth: '70px', textAlign: 'center' }}>Disc%</th>
                <th style={{ padding: '0.75rem 0.4rem', width: '75px', minWidth: '70px', textAlign: 'center' }}>GST%</th>
                <th style={{ padding: '0.75rem 0.6rem', width: '115px', minWidth: '105px', textAlign: 'right' }}>MRP</th>
                <th style={{ padding: '0.75rem 0.8rem', width: '125px', minWidth: '115px', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '0.75rem 0.4rem', width: '38px', minWidth: '38px', textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const rowCalc = calculateRowTotal(row);
                const isFocused = activeRowIndex === idx;
                const cleanQuery = (searchQuery || '').trim().toLowerCase();
                const filteredMedicines = cleanQuery.length === 0 ? [] : medicines.filter(m => {
                  if (!m) return false;
                  const nameMatch = (m.name || '').toLowerCase().includes(cleanQuery);
                  const skuMatch = Boolean(m.sku && (m.sku || '').toLowerCase().includes(cleanQuery));
                  const genMatch = Boolean(m.genericName && (m.genericName || '').toLowerCase().includes(cleanQuery));
                  return nameMatch || skuMatch || genMatch;
                }).slice(0, 40);

                return (
                  <tr
                    key={row.id}
                    onClick={() => setActiveRowIndex(idx)}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      background: isFocused ? 'rgba(2, 132, 199, 0.05)' : 'transparent',
                      transition: 'background 0.1s'
                    }}
                  >
                    {/* 1. Sr. */}
                    <td style={{ padding: '0.45rem 0.4rem', color: 'var(--text-secondary)', textAlign: 'center', fontWeight: '600' }}>
                      {idx + 1}
                    </td>

                    {/* 2. Description Of Goods (Medicine search & input) */}
                    <td style={{ padding: '0.45rem 0.6rem', position: 'relative', overflow: 'visible' }}>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          ref={el => { medInputRefs.current[idx] = el; }}
                          type="text"
                          placeholder="Type medicine name or select..."
                          value={activeSearchRowIndex === idx ? searchQuery : row.medicineName}
                          onFocus={() => {
                            setActiveRowIndex(idx);
                            const val = row.medicineName || '';
                            setSearchQuery(val);
                            if (val.trim().length > 0) {
                              setActiveSearchRowIndex(idx);
                              setMedDropdownIndex(0);
                            } else {
                              setActiveSearchRowIndex(null);
                            }
                          }}
                          onClick={() => {
                            setActiveRowIndex(idx);
                            const val = row.medicineName || '';
                            if (val.trim().length > 0) {
                              setActiveSearchRowIndex(idx);
                              setSearchQuery(val);
                              setMedDropdownIndex(0);
                            }
                          }}
                          onChange={e => {
                            const val = e.target.value;
                            setSearchQuery(val);
                            setMedDropdownIndex(0);
                            setActiveRowIndex(idx);
                            if (val.trim().length > 0) {
                              setActiveSearchRowIndex(idx);
                            } else {
                              setActiveSearchRowIndex(null);
                            }
                            const exactMatch = medicines.find(m => (m.name || '').toLowerCase() === val.trim().toLowerCase());
                            if (exactMatch) {
                              const latestBatch = exactMatch.batches && exactMatch.batches.length > 0 ? exactMatch.batches[0] : null;
                              const existingMrp = latestBatch?.mrp ? String(latestBatch.mrp) : '';
                              const existingPtr = latestBatch?.ptr ? String(latestBatch.ptr) : '';
                              const existingPts = latestBatch?.pts ? String(latestBatch.pts) : '';
                              setRows(prev => {
                                const updated = [...prev];
                                updated[idx] = {
                                  ...updated[idx],
                                  itemId: exactMatch.id,
                                  medicineName: exactMatch.name,
                                  genericName: exactMatch.genericName || '',
                                  manufacturer: exactMatch.manufacturer || '',
                                  mrp: existingMrp,
                                  purchaseRate: existingPtr,
                                  pts: existingPts,
                                  hsnCode: exactMatch.hsnCode || '3004',
                                  sku: exactMatch.sku,
                                  pack: exactMatch.conversionFactor > 1 ? `1*${exactMatch.conversionFactor}` : `1*1 (${exactMatch.unit || 'Unit'})`,
                                  gstRate: String(exactMatch.gstRate ?? 5),
                                  isNewCatalog: false
                                };
                                return updated;
                              });
                            } else {
                              handleRowChange(idx, 'medicineName', val);
                              handleRowChange(idx, 'isNewCatalog', true);
                              handleRowChange(idx, 'itemId', '');
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              if (activeSearchRowIndex !== idx) {
                                setActiveSearchRowIndex(idx);
                              }
                              isPurchaseKeyboardNavRef.current = true;
                              if (purchaseKeyboardTimerRef.current) clearTimeout(purchaseKeyboardTimerRef.current);
                              purchaseKeyboardTimerRef.current = setTimeout(() => {
                                isPurchaseKeyboardNavRef.current = false;
                              }, 400);

                              if (filteredMedicines.length > 0) {
                                setMedDropdownIndex(prev => (prev + 1) % filteredMedicines.length);
                              }
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              if (activeSearchRowIndex !== idx) {
                                setActiveSearchRowIndex(idx);
                              }
                              isPurchaseKeyboardNavRef.current = true;
                              if (purchaseKeyboardTimerRef.current) clearTimeout(purchaseKeyboardTimerRef.current);
                              purchaseKeyboardTimerRef.current = setTimeout(() => {
                                isPurchaseKeyboardNavRef.current = false;
                              }, 400);

                              if (filteredMedicines.length > 0) {
                                setMedDropdownIndex(prev => (prev - 1 + filteredMedicines.length) % filteredMedicines.length);
                              }
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              if (activeSearchRowIndex === idx && filteredMedicines.length > 0 && medDropdownIndex >= 0 && medDropdownIndex < filteredMedicines.length) {
                                handleSelectExistingMedicine(idx, filteredMedicines[medDropdownIndex]);
                              } else if (searchQuery.trim().length > 0) {
                                handleCreateNewMedicineInline(idx, searchQuery);
                              } else if (row.medicineName.trim().length > 0) {
                                setActiveSearchRowIndex(null);
                                setTimeout(() => {
                                  batchInputRefs.current[idx]?.focus();
                                  batchInputRefs.current[idx]?.select();
                                }, 50);
                              }
                            } else if (e.key === 'Escape') {
                              setActiveSearchRowIndex(null);
                            }
                          }}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '0.45rem 0.6rem',
                            paddingRight: row.isNewCatalog ? '85px' : '0.6rem',
                            background: 'var(--bg-secondary)',
                            border: isFocused ? '1px solid #0284c7' : '1px solid var(--border-color)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            fontWeight: '600',
                            fontSize: '0.84rem',
                            outline: 'none'
                          }}
                        />
                        {row.isNewCatalog && row.medicineName && (
                          <span style={{
                            position: 'absolute',
                            right: '6px',
                            fontSize: '0.65rem',
                            background: '#0284c7',
                            color: '#fff',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px'
                          }}>
                            <Sparkles size={10} /> Auto-Save
                          </span>
                        )}
                      </div>

                      {activeSearchRowIndex === idx && (searchQuery || '').trim().length > 0 && (
                        <div
                          ref={searchDropdownRef}
                          style={{
                            position: 'absolute',
                            top: 'calc(100% + 4px)',
                            left: '0.6rem',
                            width: '520px',
                            maxWidth: '90vw',
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            maxHeight: '340px',
                            overflowY: 'auto',
                            zIndex: 99999,
                            boxShadow: '0 16px 40px rgba(0,0,0,0.45)'
                          }}
                        >
                          {/* Option to create new if user typed something */}
                          {searchQuery.trim().length > 0 && !medicines.some(m => (m.name || '').toLowerCase() === searchQuery.trim().toLowerCase()) && (
                            <div
                              onClick={() => handleCreateNewMedicineInline(idx, searchQuery)}
                              style={{
                                padding: '0.7rem 1rem',
                                borderBottom: '1px solid var(--border-color)',
                                cursor: 'pointer',
                                background: 'rgba(2, 132, 199, 0.08)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(2, 132, 199, 0.15)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(2, 132, 199, 0.08)'}
                            >
                              <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(2, 132, 199, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7', flexShrink: 0 }}>
                                <Sparkles size={16} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '700', color: '#0284c7', fontSize: '0.85rem' }}>
                                  + Catalog New Medicine: "{searchQuery.trim()}"
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                  Press Enter or click to auto-save to Medicine Master upon bill save
                                </div>
                              </div>
                            </div>
                          )}

                          {filteredMedicines.map((med, mIdx) => {
                            const latestB = med.batches && med.batches.length > 0 ? med.batches[0] : null;
                            const isSelected = mIdx === medDropdownIndex;
                            const totalStock = med.totalStock ?? (med.batches || []).reduce((s, b) => s + (b.currentStock || 0), 0) ?? 0;
                            return (
                              <div
                                key={med.id}
                                data-med-dropdown-index={mIdx}
                                onClick={() => handleSelectExistingMedicine(idx, med)}
                                onMouseMove={() => {
                                  if (!isPurchaseKeyboardNavRef.current && medDropdownIndex !== mIdx) {
                                    setMedDropdownIndex(mIdx);
                                  }
                                }}
                                style={{
                                  padding: '0.7rem 1rem',
                                  borderBottom: '1px solid var(--border-color)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  background: isSelected ? 'rgba(2, 132, 199, 0.15)' : 'transparent',
                                  borderLeft: isSelected ? '4px solid #0284c7' : '4px solid transparent',
                                  transition: 'background 0.1s ease'
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0, paddingRight: '0.8rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontWeight: '700', fontSize: '0.88rem', color: isSelected ? '#0284c7' : 'var(--text-primary)' }}>
                                      {med.name}
                                    </span>
                                    {isSelected && (
                                      <span style={{
                                        background: '#0284c7',
                                        color: '#ffffff',
                                        fontSize: '0.68rem',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        fontWeight: '700'
                                      }}>
                                        ↵ Press Enter
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                    {med.genericName ? `${med.genericName} • ` : ''}Pack: {med.conversionFactor > 1 ? `1*${med.conversionFactor}` : med.unit || '1*10'} {med.gstRate !== undefined ? `• GST: ${med.gstRate}%` : ''}
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <div style={{ fontWeight: '800', fontSize: '0.82rem', color: totalStock > 0 ? '#10b981' : 'var(--text-muted)' }}>
                                    {totalStock > 0 ? `${totalStock} in stock` : '0 in stock'}
                                  </div>
                                  {latestB && (
                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                      MRP: ₹{Number(latestB.mrp || 0).toFixed(2)} {latestB.ptr ? `| PTR: ₹${Number(latestB.ptr).toFixed(2)}` : ''}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {filteredMedicines.length === 0 && searchQuery.trim().length === 0 && (
                            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                              No medicines in catalog yet. Type a medicine name to create one!
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 3. Pack (1*10, 1*15, 1*4, 1*5, 1*1) */}
                    <td style={{ padding: '0.45rem 0.35rem' }}>
                      <input
                        type="text"
                        placeholder="1*10"
                        value={row.pack || '1*10'}
                        onFocus={e => {
                          setActiveRowIndex(idx);
                          e.target.select();
                        }}
                        onChange={e => handleRowChange(idx, 'pack', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            batchInputRefs.current[idx]?.focus();
                            batchInputRefs.current[idx]?.select();
                          }
                        }}
                        title="Pack format e.g. 1*10 (10 Tabs per strip), 1*15, 1*4, 1*5, 1*1"
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '0.4rem 0.3rem',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          textAlign: 'center',
                          fontWeight: '600',
                          fontSize: '0.8rem',
                          outline: 'none'
                        }}
                      />
                    </td>

                    {/* 4. HSN */}
                    <td style={{ padding: '0.45rem 0.35rem' }}>
                      <input
                        type="text"
                        placeholder="3004"
                        value={row.hsnCode}
                        onFocus={e => {
                          setActiveRowIndex(idx);
                          e.target.select();
                        }}
                        onChange={e => handleRowChange(idx, 'hsnCode', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            batchInputRefs.current[idx]?.focus();
                            batchInputRefs.current[idx]?.select();
                          }
                        }}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '0.4rem 0.3rem',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          textAlign: 'center',
                          fontSize: '0.8rem',
                          outline: 'none'
                        }}
                      />
                    </td>

                    {/* 5. Batch (Expanded Width, Monospace, Never Truncated) */}
                    <td style={{ padding: '0.45rem 0.45rem' }}>
                      <input
                        ref={el => { batchInputRefs.current[idx] = el; }}
                        type="text"
                        placeholder="BATCH NO"
                        value={row.batchNumber}
                        onFocus={e => {
                          setActiveRowIndex(idx);
                          e.target.select();
                        }}
                        onChange={e => handleRowChange(idx, 'batchNumber', e.target.value.toUpperCase())}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            expMonthInputRefs.current[idx]?.focus();
                            expMonthInputRefs.current[idx]?.select();
                          }
                        }}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '0.4rem 0.55rem',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          fontWeight: '700',
                          fontFamily: 'monospace',
                          letterSpacing: '0.02em',
                          fontSize: '0.85rem',
                          outline: 'none'
                        }}
                      />
                    </td>

                    {/* 6. Exp. (MM/YY) */}
                    <td style={{ padding: '0.45rem 0.35rem' }}>
                      <div style={{ display: 'flex', gap: '3px', alignItems: 'center', justifyContent: 'center' }}>
                        <input
                          ref={el => { expMonthInputRefs.current[idx] = el; }}
                          type="text"
                          maxLength={2}
                          placeholder="MM"
                          value={row.expiryMonth}
                          onFocus={e => {
                            setActiveRowIndex(idx);
                            e.target.select();
                          }}
                          onChange={e => {
                            const val = e.target.value.replace(/\D/g, '');
                            handleRowChange(idx, 'expiryMonth', val);
                            if (val.length === 2) {
                              expYearInputRefs.current[idx]?.focus();
                              expYearInputRefs.current[idx]?.select();
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              expYearInputRefs.current[idx]?.focus();
                              expYearInputRefs.current[idx]?.select();
                            } else if (e.key === 'Backspace' && !row.expiryMonth) {
                              batchInputRefs.current[idx]?.focus();
                              batchInputRefs.current[idx]?.select();
                            }
                          }}
                          style={{
                            width: '38px',
                            boxSizing: 'border-box',
                            padding: '0.4rem 0.2rem',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            textAlign: 'center',
                            fontWeight: '600',
                            fontSize: '0.82rem',
                            outline: 'none'
                          }}
                        />
                        <span style={{ color: 'var(--text-muted)', fontWeight: 'bold' }}>/</span>
                        <input
                          ref={el => { expYearInputRefs.current[idx] = el; }}
                          type="text"
                          maxLength={4}
                          placeholder="YY"
                          value={row.expiryYear}
                          onFocus={e => {
                            setActiveRowIndex(idx);
                            e.target.select();
                          }}
                          onChange={e => {
                            const val = e.target.value.replace(/\D/g, '');
                            handleRowChange(idx, 'expiryYear', val);
                            if (val.length === 2 && parseInt(val, 10) >= 20) {
                              qtyInputRefs.current[idx]?.focus();
                              qtyInputRefs.current[idx]?.select();
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              qtyInputRefs.current[idx]?.focus();
                              qtyInputRefs.current[idx]?.select();
                            } else if (e.key === 'Backspace' && !row.expiryYear) {
                              expMonthInputRefs.current[idx]?.focus();
                              expMonthInputRefs.current[idx]?.select();
                            }
                          }}
                          style={{
                            width: '42px',
                            boxSizing: 'border-box',
                            padding: '0.4rem 0.2rem',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            textAlign: 'center',
                            fontWeight: '600',
                            fontSize: '0.82rem',
                            outline: 'none'
                          }}
                        />
                      </div>
                    </td>

                    {/* 7. Qty (Strips.Loose) */}
                    <td style={{ padding: '0.45rem 0.35rem' }}>
                      <input
                        ref={el => { qtyInputRefs.current[idx] = el; }}
                        type="text"
                        placeholder="e.g. 20"
                        value={row.quantity}
                        onFocus={e => {
                          setActiveRowIndex(idx);
                          e.target.select();
                        }}
                        onChange={e => handleRowChange(idx, 'quantity', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            freeInputRefs.current[idx]?.focus();
                            freeInputRefs.current[idx]?.select();
                          }
                        }}
                        title={rowCalc.factor > 1 && row.quantity ? `${rowCalc.parsedQty.strips} Strips ${rowCalc.parsedQty.loose > 0 ? `+ ${rowCalc.parsedQty.loose} Loose Tabs` : ''} (${rowCalc.parsedQty.totalBaseUnits} total tablets inwarded)` : 'Format: 20 for 20 strips, 20.4 for 20 strips + 4 loose tablets'}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '0.4rem 0.4rem',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          textAlign: 'center',
                          fontWeight: '700',
                          fontSize: '0.84rem',
                          fontVariantNumeric: 'tabular-nums',
                          outline: 'none'
                        }}
                      />
                    </td>

                    {/* 8. Free */}
                    <td style={{ padding: '0.45rem 0.35rem' }}>
                      <input
                        ref={el => { freeInputRefs.current[idx] = el; }}
                        type="text"
                        placeholder="0"
                        value={row.freeQuantity}
                        onFocus={e => {
                          setActiveRowIndex(idx);
                          e.target.select();
                        }}
                        onChange={e => handleRowChange(idx, 'freeQuantity', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            rateInputRefs.current[idx]?.focus();
                            rateInputRefs.current[idx]?.select();
                          }
                        }}
                        title={rowCalc.factor > 1 && row.freeQuantity ? `${parseRowQuantity(row.freeQuantity, rowCalc.factor).strips} Free Strips ${parseRowQuantity(row.freeQuantity, rowCalc.factor).loose > 0 ? `+ ${parseRowQuantity(row.freeQuantity, rowCalc.factor).loose} Free Tabs` : ''}` : undefined}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '0.4rem 0.3rem',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          textAlign: 'center',
                          fontSize: '0.84rem',
                          outline: 'none'
                        }}
                      />
                    </td>

                    {/* 9. Rate (PTR) - Generous Width, Right-Aligned, Never Clipped */}
                    <td style={{ padding: '0.45rem 0.45rem' }}>
                      <input
                        ref={el => { rateInputRefs.current[idx] = el; }}
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={row.purchaseRate}
                        onFocus={e => {
                          setActiveRowIndex(idx);
                          e.target.select();
                        }}
                        onChange={e => handleRowChange(idx, 'purchaseRate', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            discInputRefs.current[idx]?.focus();
                            discInputRefs.current[idx]?.select();
                          }
                        }}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '0.4rem 0.65rem',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          textAlign: 'right',
                          fontWeight: '600',
                          fontSize: '0.85rem',
                          fontVariantNumeric: 'tabular-nums',
                          outline: 'none'
                        }}
                      />
                    </td>

                    {/* 10. Disc% */}
                    <td style={{ padding: '0.45rem 0.35rem' }}>
                      <input
                        ref={el => { discInputRefs.current[idx] = el; }}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="0"
                        value={row.discountPercent}
                        onFocus={e => {
                          setActiveRowIndex(idx);
                          e.target.select();
                        }}
                        onChange={e => handleRowChange(idx, 'discountPercent', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            gstInputRefs.current[idx]?.focus();
                            gstInputRefs.current[idx]?.select();
                          }
                        }}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '0.4rem 0.3rem',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          textAlign: 'center',
                          fontSize: '0.84rem',
                          outline: 'none'
                        }}
                      />
                    </td>

                    {/* 11. GST% */}
                    <td style={{ padding: '0.45rem 0.35rem' }}>
                      <input
                        ref={el => { gstInputRefs.current[idx] = el; }}
                        type="number"
                        step="0.01"
                        placeholder="5"
                        value={row.gstRate}
                        onFocus={e => {
                          setActiveRowIndex(idx);
                          e.target.select();
                        }}
                        onChange={e => handleRowChange(idx, 'gstRate', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            mrpInputRefs.current[idx]?.focus();
                            mrpInputRefs.current[idx]?.select();
                          }
                        }}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '0.4rem 0.3rem',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          textAlign: 'center',
                          fontSize: '0.84rem',
                          outline: 'none'
                        }}
                      />
                    </td>

                    {/* 12. MRP - Generous Width, Right-Aligned, Never Clipped */}
                    <td style={{ padding: '0.45rem 0.45rem' }}>
                      <input
                        ref={el => { mrpInputRefs.current[idx] = el; }}
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={row.mrp}
                        onFocus={e => {
                          setActiveRowIndex(idx);
                          e.target.select();
                        }}
                        onChange={e => handleRowChange(idx, 'mrp', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (idx === rows.length - 1) {
                              handleAddRow();
                            } else {
                              setActiveRowIndex(idx + 1);
                              medInputRefs.current[idx + 1]?.focus();
                              medInputRefs.current[idx + 1]?.select();
                            }
                          }
                        }}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '0.4rem 0.65rem',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          textAlign: 'right',
                          fontWeight: '700',
                          fontSize: '0.85rem',
                          fontVariantNumeric: 'tabular-nums',
                          outline: 'none'
                        }}
                      />
                    </td>

                    {/* 13. Amount (Line Taxable Total e.g. Qty * Rate - Disc) */}
                    <td style={{
                      padding: '0.45rem 0.7rem',
                      textAlign: 'right',
                      fontWeight: '700',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap'
                    }}>
                      ₹{rowCalc.taxable.toFixed(2)}
                    </td>

                    {/* Delete Action */}
                    <td style={{ padding: '0.45rem 0.3rem', textAlign: 'center' }}>
                      {rows.length > 1 && (
                        <button
                          onClick={() => handleRemoveRow(idx)}
                          style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '2px' }}
                          title="Remove line [Alt + D]"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Split Bottom HUD (Inspection HUD + Financial Breakdown) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '1.2rem', alignItems: 'stretch' }}>
        
        {/* Left Bottom HUD: Active Selected Line Item Details */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#0284c7', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Layers size={14} /> Active Item Inspection HUD (Row #{activeRowIndex + 1})
              </div>
              {activeRow?.isNewCatalog && (
                <span style={{ fontSize: '0.72rem', background: 'rgba(2, 132, 199, 0.15)', color: '#0284c7', border: '1px solid #0284c7', padding: '2px 8px', borderRadius: '4px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Sparkles size={11} /> Will Auto-Catalog to Master
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', fontSize: '0.85rem' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Item : </span>
                <strong style={{ color: 'var(--text-primary)' }}>{activeRow?.medicineName || '—'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Batch : </span>
                <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{activeRow?.batchNumber || '—'}</strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Generic/Salt : </span>
                <input
                  type="text"
                  placeholder="e.g. Paracetamol"
                  value={activeRow?.genericName || ''}
                  onChange={e => handleRowChange(activeRowIndex, 'genericName', e.target.value)}
                  style={{ width: '130px', padding: '0.2rem 0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', marginLeft: '0.3rem', fontSize: '0.8rem' }}
                />
              </div>

              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Manufacturer : </span>
                <input
                  type="text"
                  placeholder="e.g. Cipla / Sun"
                  value={activeRow?.manufacturer || ''}
                  onChange={e => handleRowChange(activeRowIndex, 'manufacturer', e.target.value)}
                  style={{ width: '130px', padding: '0.2rem 0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', marginLeft: '0.3rem', fontSize: '0.8rem' }}
                />
              </div>

              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Expiry : </span>
                <strong>{activeRow?.expiryMonth}/{activeRow?.expiryYear}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Live Stock : </span>
                <strong style={{ color: '#10b981' }}>{activeMedicine?.totalStock ?? 0} units in stock</strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-secondary)' }}>MRP (₹) : </span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={activeRow?.mrp}
                  onChange={e => handleRowChange(activeRowIndex, 'mrp', e.target.value)}
                  style={{ width: '80px', padding: '0.2rem 0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', marginLeft: '0.4rem', fontWeight: '700' }}
                />
              </div>

              {/* Strip Packaging Selector in HUD */}
              <div style={{ gridColumn: 'span 2', background: 'var(--bg-secondary)', padding: '6px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border-color)', marginTop: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600 }}>Packing (1*X) :</span>
                  <input
                    type="text"
                    placeholder="1*10"
                    value={activeRow?.pack || '1*10'}
                    onChange={e => handleRowChange(activeRowIndex, 'pack', e.target.value)}
                    style={{ width: '70px', padding: '0.2rem 0.4rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: '700', textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    (1 strip has how many tablets)
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['1*10', '1*15', '1*4', '1*5', '1*1'].map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleRowChange(activeRowIndex, 'pack', p)}
                      style={{
                        padding: '2px 6px',
                        fontSize: '11px',
                        fontWeight: (activeRow?.pack || '1*10') === p ? '700' : '500',
                        borderRadius: '4px',
                        border: '1px solid',
                        borderColor: (activeRow?.pack || '1*10') === p ? '#0284c7' : 'var(--border-color)',
                        background: (activeRow?.pack || '1*10') === p ? '#e0f2fe' : 'var(--card-bg)',
                        color: (activeRow?.pack || '1*10') === p ? '#0369a1' : 'var(--text-primary)',
                        cursor: 'pointer'
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Inward Quantity Notation Breakdown Banner */}
              {(() => {
                const activeCalc = calculateRowTotal(activeRow);
                return (
                  <div style={{
                    gridColumn: 'span 2',
                    background: 'rgba(2, 132, 199, 0.08)',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(2, 132, 199, 0.25)',
                    fontSize: '0.8rem',
                    color: '#0369a1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '2px'
                  }}>
                    <span>
                      📦 <strong>Qty Notation: </strong>
                      {activeCalc.parsedQty.strips > 0 || activeCalc.parsedQty.loose > 0 ? (
                        activeCalc.factor > 1 ? (
                          <span>
                            <strong>{activeCalc.parsedQty.strips} Strips</strong> {activeCalc.parsedQty.loose > 0 ? `+ ${activeCalc.parsedQty.loose} Loose Tabs` : ''} ➔ <strong>{activeCalc.parsedQty.totalBaseUnits} total tablets</strong> inwarded into stock
                          </span>
                        ) : (
                          <span><strong>{activeCalc.parsedQty.totalBaseUnits} Units</strong> ({activeRow?.pack || '1*1'})</span>
                        )
                      ) : (
                        <span>e.g. enter <strong>20</strong> for 20 strips, or <strong>20.4</strong> for 20 strips + 4 loose tablets</span>
                      )}
                    </span>
                    {activeCalc.parsedQty.totalBaseUnits > 0 && (
                      <span style={{ fontWeight: '700', color: '#0284c7', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                        ₹{activeCalc.gross.toFixed(2)}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          <div style={{ marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px dashed var(--border-color)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Supplier: <strong>{selectedSupplier?.mailTo || selectedSupplier?.name}</strong> | Station: {selectedSupplier?.station || 'Local'}
          </div>
        </div>

        {/* Right Bottom HUD: Financial Breakdown (Photo 2 Right Pane) */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>
            Financial Summary & Taxes
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
              <span>Sub Total (Taxable) :</span>
              <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>₹{taxableValue.toFixed(2)}</span>
            </div>

            {totalDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-red)' }}>
                <span>Discount :</span>
                <span>- ₹{totalDiscount.toFixed(2)}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
              <span>SGST (2.5%) :</span>
              <span>₹{(totalGst / 2).toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
              <span>CGST (2.5%) :</span>
              <span>₹{(totalGst / 2).toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
              <span>Total GST :</span>
              <span style={{ fontWeight: '600' }}>₹{totalGst.toFixed(2)}</span>
            </div>

            {roundOff !== 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                <span>Round Off :</span>
                <span>{roundOff > 0 ? `+ ₹${roundOff.toFixed(2)}` : `- ₹${Math.abs(roundOff).toFixed(2)}`}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '0.6rem', marginTop: '0.2rem', fontSize: '1.1rem', fontWeight: '800', color: '#0284c7' }}>
              <span>Grand Total :</span>
              <span>₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Details */}
          <div style={{ marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px dashed var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                MODE :
              </label>
              <select
                value={paymentMode}
                onChange={e => setPaymentMode(e.target.value as any)}
                style={{ width: '100%', padding: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
              >
                <option value="CREDIT">CREDIT (Pay Later)</option>
                <option value="CASH">CASH</option>
                <option value="BANK_TRANSFER">BANK TRANSFER</option>
                <option value="UPI">UPI</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                PAID AMOUNT (₹) :
              </label>
              <input
                type="number"
                step="0.01"
                value={paidAmount}
                onChange={e => setPaidAmount(e.target.value)}
                style={{ width: '100%', padding: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '700', fontSize: '0.85rem' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Add Medicine Modal */}
      {showAddMedicineModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="modal-card" style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            maxHeight: 'min(92vh, 92dvh)',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
            overflow: 'hidden'
          }}>
            <div className="modal-header" style={{
              background: 'transparent',
              borderBottom: '1px solid var(--border-color)',
              padding: '1.2rem 1.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ padding: '0.4rem', borderRadius: '8px', background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7' }}>
                  <PlusCircle size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>Quick Add Medicine to Catalog</h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Creates master entry & binds to current purchase row</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddMedicineModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleQuickAddMedicineSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', margin: 0 }}>
              <div className="modal-body" style={{ flex: '1 1 auto', overflowY: 'auto', padding: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    MEDICINE NAME *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Augmentin 625 Duo Tablet"
                    value={newMedForm.name}
                    onChange={e => setNewMedForm({ ...newMedForm, name: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '700' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    COMPOSITION / SALT
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Amoxycillin & Clavulanate"
                    value={newMedForm.genericName}
                    onChange={e => setNewMedForm({ ...newMedForm, genericName: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    MANUFACTURER / COMPANY
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GSK / Sun Pharma"
                    value={newMedForm.manufacturer}
                    onChange={e => setNewMedForm({ ...newMedForm, manufacturer: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>

                <div style={{ gridColumn: 'span 2', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)' }}>
                      PACK TYPE & STRIP SIZE (1*10, 1*15, 1*4, 1*5)
                    </label>
                    <span style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: '700' }}>
                      Selected: 1*{newMedForm.conversionFactor} ({newMedForm.conversionFactor} {newMedForm.unit === 'BOTTLE' ? 'Bottle' : 'Tabs'} / Pack)
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                    {[
                      { label: '1*10 (10 Tabs)', val: 10, unit: 'STRIP' },
                      { label: '1*15 (15 Caps)', val: 15, unit: 'STRIP' },
                      { label: '1*4 (4 Tabs)', val: 4, unit: 'STRIP' },
                      { label: '1*5 (5 Tabs)', val: 5, unit: 'STRIP' },
                      { label: '1*6', val: 6, unit: 'STRIP' },
                      { label: '1*20', val: 20, unit: 'STRIP' },
                      { label: '1*1 (Bottle/Tube)', val: 1, unit: 'BOTTLE' }
                    ].map(preset => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setNewMedForm({ ...newMedForm, conversionFactor: preset.val, unit: preset.unit, pack: `1*${preset.val}` })}
                        style={{
                          padding: '2px 7px',
                          fontSize: '11px',
                          fontWeight: newMedForm.conversionFactor === preset.val ? '700' : '500',
                          borderRadius: '4px',
                          border: '1px solid',
                          borderColor: newMedForm.conversionFactor === preset.val ? '#0284c7' : 'var(--border-color)',
                          background: newMedForm.conversionFactor === preset.val ? '#e0f2fe' : 'var(--card-bg)',
                          color: newMedForm.conversionFactor === preset.val ? '#0369a1' : 'var(--text-primary)',
                          cursor: 'pointer'
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Pack Type:</span>
                      <select
                        value={newMedForm.unit}
                        onChange={e => setNewMedForm({ ...newMedForm, unit: e.target.value })}
                        style={{ width: '100%', padding: '0.4rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem', marginTop: '2px' }}
                      >
                        <option value="STRIP">STRIP</option>
                        <option value="BOTTLE">BOTTLE / SYRUP</option>
                        <option value="VIAL">VIAL / INJ</option>
                        <option value="TUBE">TUBE / OINT</option>
                        <option value="BOX">BOX</option>
                        <option value="TAB">TABLET (Loose)</option>
                      </select>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Tabs per Strip (1*X):</span>
                      <input
                        type="number"
                        min="1"
                        placeholder="e.g. 10"
                        value={newMedForm.conversionFactor}
                        onChange={e => {
                          const factor = parseInt(e.target.value) || 1;
                          setNewMedForm({ ...newMedForm, conversionFactor: factor, pack: `1*${factor}` });
                        }}
                        style={{ width: '100%', padding: '0.4rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center', fontSize: '0.82rem', marginTop: '2px', fontWeight: '700' }}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    💡 <em>e.g. <strong>1*10</strong> means 1 strip contains 10 tablets.</em>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    HSN CODE & GST %
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                    <input
                      type="text"
                      value={newMedForm.hsnCode}
                      onChange={e => setNewMedForm({ ...newMedForm, hsnCode: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                    />
                    <select
                      value={newMedForm.gstRate}
                      onChange={e => setNewMedForm({ ...newMedForm, gstRate: parseFloat(e.target.value) })}
                      style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                    >
                      <option value={0}>0%</option>
                      <option value={5}>5%</option>
                      <option value={12}>12%</option>
                      <option value={18}>18%</option>
                      <option value={28}>28%</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    DEFAULT P.RATE (PTR ₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newMedForm.defaultPtr}
                    onChange={e => setNewMedForm({ ...newMedForm, defaultPtr: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    DEFAULT M.R.P. (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newMedForm.defaultMrp}
                    onChange={e => setNewMedForm({ ...newMedForm, defaultMrp: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              </div>

              <div className="modal-footer" style={{
                padding: '1rem 1.25rem',
                borderTop: '1px solid var(--border-color)',
                background: 'var(--card-bg)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.8rem',
                flexShrink: 0,
                position: 'sticky',
                bottom: 0,
                zIndex: 10
              }}>
                <button
                  type="button"
                  onClick={() => setShowAddMedicineModal(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingNewMed}
                  style={{
                    padding: '0.55rem 1.2rem',
                    background: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '700',
                    cursor: savingNewMed ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.85rem'
                  }}
                >
                  <Save size={15} /> {savingNewMed ? 'Saving...' : 'Add to Catalog & Use'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal: Quick Add Supplier with GSTIN Autofill */}
      {showAddSupplierModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '20px'
        }}>
          <div className="modal-card" style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '560px',
            maxHeight: 'min(92vh, 92dvh)',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden'
          }}>
            <div className="modal-header" style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc',
              flexShrink: 0
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>⚡ Quick Add Supplier</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Enter GSTIN to instantly fetch registered legal firm details
                </p>
              </div>
              <button
                onClick={() => setShowAddSupplierModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px', display: 'flex', alignItems: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSupplierQuick} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', margin: 0 }}>
              <div className="modal-body" style={{ flex: '1 1 auto', overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* GSTIN Autofill Bar */}
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px 12px' }}>
                  <label className="form-label" style={{ color: '#0369a1', fontWeight: 700 }}>
                    GSTIN (15-Digit Number)
                  </label>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <input
                      type="text"
                      maxLength={15}
                      placeholder="e.g. 09AOAPV7912G1ZO"
                      value={newSupGstin}
                      onChange={e => setNewSupGstin(e.target.value.toUpperCase())}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleQuickGstinLookup();
                        }
                      }}
                      className="form-input"
                      style={{ textTransform: 'uppercase', fontFamily: 'monospace', fontWeight: 700 }}
                    />
                    <button
                      type="button"
                      onClick={handleQuickGstinLookup}
                      disabled={supGstLookupLoading}
                      className="btn btn-primary"
                      style={{ minWidth: '110px' }}
                    >
                      {supGstLookupLoading ? 'Fetching...' : '⚡ Autofill'}
                    </button>
                  </div>

                  {supGstLookupMsg && (
                    <div style={{
                      fontSize: '11.5px',
                      fontWeight: 600,
                      padding: '4px 8px',
                      borderRadius: '4px',
                      marginTop: '8px',
                      background: supGstLookupMsg.type === 'success' ? '#dcfce7' : supGstLookupMsg.type === 'warning' ? '#fef3c7' : '#fee2e2',
                      color: supGstLookupMsg.type === 'success' ? '#15803d' : supGstLookupMsg.type === 'warning' ? '#b45309' : '#b91c1c',
                      border: `1px solid ${supGstLookupMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`
                    }}>
                      {supGstLookupMsg.text}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Firm / Trade Name * (Mailing Display Name)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SHREE GANESH MEDICOS / ADMARIS PHARMA"
                    value={newSupName}
                    onChange={e => {
                      setNewSupName(e.target.value);
                      if (!newSupLegalName) setNewSupLegalName(e.target.value);
                    }}
                    className="form-input"
                    style={{ fontWeight: 600 }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Legal / Proprietor Name (As per GST/PAN)</label>
                  <input
                    type="text"
                    placeholder="e.g. MANISH KUMAR VERMA"
                    value={newSupLegalName}
                    onChange={e => setNewSupLegalName(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Station / City</label>
                    <input
                      type="text"
                      placeholder="e.g. LUCKNOW"
                      value={newSupStation}
                      onChange={e => setNewSupStation(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">State</label>
                    <input
                      type="text"
                      placeholder="e.g. UTTAR PRADESH"
                      value={newSupState}
                      onChange={e => setNewSupState(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Registered Address</label>
                  <input
                    type="text"
                    placeholder="Street, area, locality..."
                    value={newSupAddress}
                    onChange={e => setNewSupAddress(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">PAN Number</label>
                    <input
                      type="text"
                      placeholder="e.g. AOAPV7912G"
                      value={newSupPan}
                      onChange={e => setNewSupPan(e.target.value.toUpperCase())}
                      className="form-input"
                      style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Mobile Number</label>
                    <input
                      type="text"
                      placeholder="10-digit mobile"
                      value={newSupMobile}
                      onChange={e => setNewSupMobile(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                padding: '14px 20px',
                borderTop: '1px solid #e2e8f0',
                background: '#ffffff',
                flexShrink: 0,
                position: 'sticky',
                bottom: 0,
                zIndex: 10
              }}>
                <button
                  type="button"
                  onClick={() => setShowAddSupplierModal(false)}
                  className="btn btn-secondary"
                  style={{ minWidth: '90px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingNewSup || !newSupName.trim()}
                  className="btn btn-primary"
                  style={{ minWidth: '130px' }}
                >
                  {savingNewSup ? 'Saving...' : 'Save & Select Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

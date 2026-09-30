import React, { useState, useEffect, useRef } from 'react';
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
  Search,
  Package,
  Layers,
  Save,
  Building2,
  Sparkles,
  PlusCircle,
  X
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
  oldMrp: string; // O/MRP
  hsnCode: string; // HSN
  batchNumber: string; // Batch
  expiryMonth: string; // Exp. MM
  expiryYear: string; // Exp. YY
  quantity: string; // Qty.
  freeQuantity: string; // Free
  purchaseRate: string; // Rate (PTR)
  discountPercent: string; // Disc%
  gstRate: string; // GST%
  mrp: string; // N/MRP
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
  const [entryNo, setEntryNo] = useState(`PUR-${Date.now().toString().slice(-4)}`);
  const [partyBillNo, setPartyBillNo] = useState(''); // Party No. (Supplier Bill No)
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]); // Dt:
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]); // Date:
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

  // Helper to create a blank purchase row with no dummy pre-filled values
  const createEmptyRow = (id: string): PurchaseRow => ({
    id,
    itemId: '',
    medicineName: '',
    genericName: '',
    manufacturer: '',
    oldMrp: '',
    hsnCode: '',
    sku: '',
    pack: '',
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

  // Quick Add Medicine Modal State
  const [showAddMedicineModal, setShowAddMedicineModal] = useState(false);
  const [newMedForm, setNewMedForm] = useState({
    name: '',
    genericName: '',
    manufacturer: '',
    pack: '10 TAB',
    unit: 'STRIP',
    conversionFactor: 10,
    hsnCode: '3004',
    gstRate: 12,
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

        if (firmTradeName) setNewSupName(firmTradeName);
        if (legalName) setNewSupLegalName(legalName);
        if (!firmTradeName && legalName) setNewSupName(legalName);
        if (!legalName && firmTradeName) setNewSupLegalName(firmTradeName);

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
            text: `✅ Verified (${srcLabel}): ${firmTradeName || 'Active Taxpayer'}${legalName && legalName !== firmTradeName ? ` (Legal: ${legalName})` : ''} — ${d.state}`
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
        name: finalLegalName,
        type: 'supplier',
        accountGroup: 'SUNDRY_CREDITORS',
        balancingMethod: 'BILL_BY_BILL',
        openingBalance: 0,
        openingBalanceType: 'CR',
        mailTo: finalTradeName,
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
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target as Node)) {
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
        api.get<{ items: MedicineItem[] }>('/api/items?limit=200', { companyId: activeCompany.id })
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
          setPartyBillNo(pur.invoiceNumber || '');
          setBillDate(pur.purchaseDate ? pur.purchaseDate.split('T')[0] : new Date().toISOString().split('T')[0]);
          setDueDate(pur.dueDate ? pur.dueDate.split('T')[0] : '');
          setPaymentMode(pur.paymentMode || 'CREDIT');
          setPaidAmount(String(pur.paidAmount ?? 0));
          setNotes(pur.notes || '');

          if (pur.items && Array.isArray(pur.items) && pur.items.length > 0) {
            const mappedRows: PurchaseRow[] = pur.items.map((pi: any, idx: number) => {
              const expDate = new Date(pi.expiryDate);
              const mm = isNaN(expDate.getTime()) ? '12' : String(expDate.getMonth() + 1).padStart(2, '0');
              const yyyy = isNaN(expDate.getTime()) ? String(new Date().getFullYear() + 2).slice(-2) : String(expDate.getFullYear()).slice(-2);

              return {
                id: `row-${idx + 1}`,
                itemId: pi.item?.id || pi.itemId || '',
                medicineName: pi.medicineName || pi.item?.name || '',
                genericName: pi.genericName || pi.item?.genericName || '',
                sku: pi.sku || pi.item?.sku || '',
                pack: pi.pack || '10 TAB',
                oldMrp: String(pi.mrp || 0),
                hsnCode: pi.hsnCode || pi.item?.hsnCode || '3004',
                batchNumber: pi.batchNumber || '',
                expiryMonth: mm,
                expiryYear: yyyy,
                quantity: String(pi.quantity || 1),
                freeQuantity: String(pi.freeQuantity || 0),
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
      } else if (supRes.parties && supRes.parties.length > 0) {
        setSelectedSupplierId(supRes.parties[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load initial data');
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const handleAddRow = () => {
    setRows(prev => [...prev, createEmptyRow(`row-${Date.now()}`)]);
    setActiveRowIndex(rows.length);
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
        oldMrp: existingMrp, // Auto-suggest previous purchase MRP e.g. 20
        mrp: existingMrp,    // Pre-populate N/MRP with previous MRP (user can change if revised)
        purchaseRate: existingPtr, // Auto-suggest previous purchase rate (PTR)
        pts: existingPts,
        hsnCode: med.hsnCode || '3004',
        sku: med.sku,
        pack: med.conversionFactor > 1 ? `${med.conversionFactor} ${med.unit}` : med.unit,
        gstRate: String(med.gstRate ?? 5),
        isNewCatalog: false
      };
      return updated;
    });
    setActiveSearchRowIndex(null);
    setSearchQuery('');
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
        oldMrp: '',
        mrp: '',
        purchaseRate: '',
        pts: '',
        hsnCode: '3004',
        sku: '',
        pack: updated[index].pack || '10 TAB',
        gstRate: updated[index].gstRate || '5',
        isNewCatalog: true
      };
      return updated;
    });
    setActiveSearchRowIndex(null);
    setSearchQuery('');
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
            oldMrp: String(newMedForm.defaultMrp || 140),
            hsnCode: createdMed.hsnCode || '3004',
            sku: createdMed.sku,
            pack: createdMed.conversionFactor > 1 ? `${createdMed.conversionFactor} ${createdMed.unit}` : createdMed.unit,
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
        pack: '10 TAB',
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

  // Row financial calculations
  const calculateRowTotal = (row: PurchaseRow) => {
    const qty = parseFloat(row.quantity) || 0;
    const rate = parseFloat(row.purchaseRate) || 0;
    const discPct = Math.max(0, Math.min(100, parseFloat(row.discountPercent) || 0));
    const gross = qty * rate;
    const disc = (gross * discPct) / 100;
    const taxable = gross - disc;
    const gstRate = parseFloat(row.gstRate) || 0;
    const gstAmt = (taxable * gstRate) / 100;
    return {
      gross,
      disc,
      taxable,
      gstAmt,
      total: taxable + gstAmt
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

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);
  const activeRow = rows[activeRowIndex] || rows[0];
  const activeMedicine = medicines.find(m => m.id === activeRow?.itemId);

  const handleSubmit = async () => {
    if (!activeCompany) return;
    if (!selectedSupplierId) {
      setError('Please select a Supplier Ledger');
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
        const mm = (r.expiryMonth || '12').padStart(2, '0');
        const rawY = r.expiryYear || String(new Date().getFullYear() + 2);
        const yyyy = rawY.length === 2 ? `20${rawY}` : rawY;
        // Last day of the expiry month
        const lastDay = new Date(parseInt(yyyy), parseInt(mm), 0).getDate();
        const expiryDate = `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`;

        return {
          itemId: r.itemId || undefined,
          medicineName: r.medicineName.trim(),
          genericName: r.genericName?.trim() || undefined,
          manufacturer: r.manufacturer?.trim() || undefined,
          hsnCode: r.hsnCode?.trim() || '3004',
          pack: r.pack || '10 TAB',
          batchNumber: r.batchNumber.trim().toUpperCase(),
          expiryDate,
          quantity: parseInt(r.quantity) || 1,
          freeQuantity: parseInt(r.freeQuantity) || 0,
          purchaseRate: parseFloat(r.purchaseRate) || 0,
          mrp: parseFloat(r.mrp || '') || parseFloat(r.oldMrp || '') || parseFloat(r.purchaseRate || '') || 0,
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
            <PlusCircle size={15} /> + Quick Add Medicine (F4)
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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)' }}>
                NAME : (SUPPLIER LEDGER) *
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
            <select
              value={selectedSupplierId}
              onChange={e => setSelectedSupplierId(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '700' }}
            >
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.mailTo || s.name} {s.station ? `(${s.station})` : ''} {s.gstin ? `[GST: ${s.gstin}]` : ''}
                </option>
              ))}
            </select>
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
              type="text"
              placeholder="e.g. INV-9901"
              value={partyBillNo}
              onChange={e => setPartyBillNo(e.target.value.toUpperCase())}
              style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '700' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              DT: (BILL DATE) :
            </label>
            <input
              type="date"
              value={billDate}
              onChange={e => setBillDate(e.target.value)}
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
            >
              <Plus size={14} /> Add Product Line (+)
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'visible', minHeight: '120px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.7rem 0.6rem', width: '38px', textAlign: 'center' }}>Sr.</th>
                <th style={{ padding: '0.7rem 0.6rem', minWidth: '220px' }}>Description Of Goods</th>
                <th style={{ padding: '0.7rem 0.6rem', width: '80px', textAlign: 'right' }}>O/MRP</th>
                <th style={{ padding: '0.7rem 0.6rem', width: '70px', textAlign: 'center' }}>HSN</th>
                <th style={{ padding: '0.7rem 0.6rem', width: '105px' }}>Batch</th>
                <th style={{ padding: '0.7rem 0.6rem', width: '90px', textAlign: 'center' }}>Exp.</th>
                <th style={{ padding: '0.7rem 0.6rem', width: '70px', textAlign: 'center' }}>Qty.</th>
                <th style={{ padding: '0.7rem 0.6rem', width: '60px', textAlign: 'center' }}>Free</th>
                <th style={{ padding: '0.7rem 0.6rem', width: '85px', textAlign: 'right' }}>Rate</th>
                <th style={{ padding: '0.7rem 0.6rem', width: '65px', textAlign: 'center' }}>Disc%</th>
                <th style={{ padding: '0.7rem 0.6rem', width: '65px', textAlign: 'center' }}>GST%</th>
                <th style={{ padding: '0.7rem 0.6rem', width: '85px', textAlign: 'right' }}>N/MRP</th>
                <th style={{ padding: '0.7rem 0.6rem', width: '95px', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '0.7rem 0.4rem', width: '32px' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const rowCalc = calculateRowTotal(row);
                const isFocused = activeRowIndex === idx;
                const cleanQuery = (searchQuery || '').trim().toLowerCase();
                const filteredMedicines = medicines.filter(m =>
                  !cleanQuery ||
                  m.name.toLowerCase().includes(cleanQuery) ||
                  m.sku.toLowerCase().includes(cleanQuery) ||
                  (m.genericName && m.genericName.toLowerCase().includes(cleanQuery))
                );

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
                    <td style={{ padding: '0.5rem 0.6rem', color: 'var(--text-secondary)', textAlign: 'center', fontWeight: '600' }}>
                      {idx + 1}
                    </td>

                    {/* 2. Description Of Goods (Medicine search & input) */}
                    <td style={{ padding: '0.5rem 0.6rem', position: 'relative', overflow: 'visible' }}>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder="Type medicine name or select..."
                          value={activeSearchRowIndex === idx ? searchQuery : row.medicineName}
                          onFocus={() => {
                            setActiveSearchRowIndex(idx);
                            setActiveRowIndex(idx);
                            setSearchQuery(row.medicineName);
                          }}
                          onChange={e => {
                            const val = e.target.value;
                            setSearchQuery(val);
                            const exactMatch = medicines.find(m => m.name.toLowerCase() === val.trim().toLowerCase());
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
                                  oldMrp: existingMrp,
                                  mrp: existingMrp,
                                  purchaseRate: existingPtr,
                                  pts: existingPts,
                                  hsnCode: exactMatch.hsnCode || '3004',
                                  sku: exactMatch.sku,
                                  pack: exactMatch.conversionFactor > 1 ? `${exactMatch.conversionFactor} ${exactMatch.unit}` : exactMatch.unit,
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
                          style={{
                            width: '100%',
                            padding: '0.4rem 0.6rem',
                            paddingRight: row.isNewCatalog ? '85px' : '0.6rem',
                            background: 'var(--bg-secondary)',
                            border: isFocused ? '1px solid #0284c7' : '1px solid var(--border-color)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            fontWeight: '600'
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

                      {activeSearchRowIndex === idx && (
                        <div
                          ref={searchDropdownRef}
                          style={{
                            position: 'absolute',
                            top: 'calc(100% + 4px)',
                            left: '0.6rem',
                            width: '380px',
                            minWidth: '320px',
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            maxHeight: '280px',
                            overflowY: 'auto',
                            zIndex: 99999,
                            boxShadow: '0 16px 40px rgba(0,0,0,0.45)'
                          }}
                        >
                          {/* Option to create new if user typed something */}
                          {searchQuery.trim().length > 0 && !medicines.some(m => m.name.toLowerCase() === searchQuery.trim().toLowerCase()) && (
                            <div
                              onClick={() => handleCreateNewMedicineInline(idx, searchQuery)}
                              style={{
                                padding: '0.6rem 0.8rem',
                                borderBottom: '1px solid var(--border-color)',
                                cursor: 'pointer',
                                background: 'rgba(2, 132, 199, 0.08)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(2, 132, 199, 0.15)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(2, 132, 199, 0.08)'}
                            >
                              <Sparkles size={15} style={{ color: '#0284c7' }} />
                              <div>
                                <div style={{ fontWeight: '700', color: '#0284c7', fontSize: '0.82rem' }}>
                                  + Create & Catalog new medicine: "{searchQuery.trim()}"
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                  Will automatically be saved to Medicine Master on bill save
                                </div>
                              </div>
                            </div>
                          )}

                          {filteredMedicines.map(med => {
                            const latestB = med.batches && med.batches.length > 0 ? med.batches[0] : null;
                            return (
                              <div
                                key={med.id}
                                onClick={() => handleSelectExistingMedicine(idx, med)}
                                style={{ padding: '0.55rem 0.8rem', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '0.8rem' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{med.name}</span>
                                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                    {latestB && latestB.mrp > 0 && (
                                      <span style={{ fontSize: '0.7rem', color: '#0284c7', background: 'rgba(2, 132, 199, 0.12)', border: '1px solid rgba(2, 132, 199, 0.3)', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                        MRP: ₹{latestB.mrp.toFixed(2)} {latestB.ptr ? `• Rate: ₹${latestB.ptr.toFixed(2)}` : ''}
                                      </span>
                                    )}
                                    <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: '600' }}>Stock: {med.totalStock ?? 0}</span>
                                  </div>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                  {med.genericName ? `${med.genericName} • ` : ''}SKU: {med.sku} • GST: {med.gstRate}%
                                </div>
                              </div>
                            );
                          })}

                          {filteredMedicines.length === 0 && searchQuery.trim().length === 0 && (
                            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              No medicines in catalog yet. Type a medicine name above to create one!
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 3. O/MRP (Old MRP) */}
                    <td style={{ padding: '0.5rem 0.6rem' }}>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={row.oldMrp}
                        onChange={e => handleRowChange(idx, 'oldMrp', e.target.value)}
                        style={{ width: '100%', padding: '0.4rem 0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'right' }}
                      />
                    </td>

                    {/* 4. HSN */}
                    <td style={{ padding: '0.5rem 0.6rem' }}>
                      <input
                        type="text"
                        placeholder="3004"
                        value={row.hsnCode}
                        onChange={e => handleRowChange(idx, 'hsnCode', e.target.value)}
                        style={{ width: '100%', padding: '0.4rem 0.3rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center' }}
                      />
                    </td>

                    {/* 5. Batch */}
                    <td style={{ padding: '0.5rem 0.6rem' }}>
                      <input
                        type="text"
                        placeholder="BATCH NO"
                        value={row.batchNumber}
                        onChange={e => handleRowChange(idx, 'batchNumber', e.target.value.toUpperCase())}
                        style={{ width: '100%', padding: '0.4rem 0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '700', fontFamily: 'monospace' }}
                      />
                    </td>

                    {/* 6. Exp. (MM/YY) */}
                    <td style={{ padding: '0.5rem 0.6rem' }}>
                      <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center', justifyContent: 'center' }}>
                        <input
                          type="text"
                          maxLength={2}
                          placeholder="MM"
                          value={row.expiryMonth}
                          onChange={e => handleRowChange(idx, 'expiryMonth', e.target.value)}
                          style={{ width: '34px', padding: '0.4rem 0.2rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center' }}
                        />
                        <span style={{ color: 'var(--text-muted)' }}>/</span>
                        <input
                          type="text"
                          maxLength={4}
                          placeholder="YY"
                          value={row.expiryYear}
                          onChange={e => handleRowChange(idx, 'expiryYear', e.target.value)}
                          style={{ width: '42px', padding: '0.4rem 0.2rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center' }}
                        />
                      </div>
                    </td>

                    {/* 7. Qty. */}
                    <td style={{ padding: '0.5rem 0.6rem' }}>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        value={row.quantity}
                        onChange={e => handleRowChange(idx, 'quantity', e.target.value)}
                        style={{ width: '100%', padding: '0.4rem 0.3rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center', fontWeight: '700' }}
                      />
                    </td>

                    {/* 8. Free */}
                    <td style={{ padding: '0.5rem 0.6rem' }}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={row.freeQuantity}
                        onChange={e => handleRowChange(idx, 'freeQuantity', e.target.value)}
                        style={{ width: '100%', padding: '0.4rem 0.3rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center' }}
                      />
                    </td>

                    {/* 9. Rate (PTR) */}
                    <td style={{ padding: '0.5rem 0.6rem' }}>
                      <input
                        type="number"
                        step="0.01"
                        value={row.purchaseRate}
                        onChange={e => handleRowChange(idx, 'purchaseRate', e.target.value)}
                        style={{ width: '100%', padding: '0.4rem 0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'right', fontWeight: '600' }}
                      />
                    </td>

                    {/* 10. Disc% */}
                    <td style={{ padding: '0.5rem 0.6rem' }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={row.discountPercent}
                        onChange={e => handleRowChange(idx, 'discountPercent', e.target.value)}
                        style={{ width: '100%', padding: '0.4rem 0.3rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center' }}
                      />
                    </td>

                    {/* 11. GST% */}
                    <td style={{ padding: '0.5rem 0.6rem' }}>
                      <input
                        type="number"
                        step="0.01"
                        value={row.gstRate}
                        onChange={e => handleRowChange(idx, 'gstRate', e.target.value)}
                        style={{ width: '100%', padding: '0.4rem 0.3rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center' }}
                      />
                    </td>

                    {/* 12. N/MRP (New MRP) */}
                    <td style={{ padding: '0.5rem 0.6rem' }}>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={row.mrp}
                        onChange={e => handleRowChange(idx, 'mrp', e.target.value)}
                        style={{ width: '100%', padding: '0.4rem 0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'right', fontWeight: '700' }}
                      />
                    </td>

                    {/* 13. Amount (Line Taxable Total e.g. Qty * Rate - Disc) */}
                    <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                      ₹{rowCalc.taxable.toFixed(2)}
                    </td>

                    {/* Delete Action */}
                    <td style={{ padding: '0.5rem 0.3rem', textAlign: 'center' }}>
                      {rows.length > 1 && (
                        <button
                          onClick={() => handleRemoveRow(idx)}
                          style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '2px' }}
                          title="Remove line"
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
                <span style={{ color: 'var(--text-secondary)' }}>O/MRP (₹) : </span>
                <input
                  type="number"
                  step="0.01"
                  value={activeRow?.oldMrp}
                  onChange={e => handleRowChange(activeRowIndex, 'oldMrp', e.target.value)}
                  style={{ width: '80px', padding: '0.2rem 0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', marginLeft: '0.4rem' }}
                />
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>N/MRP (₹) : </span>
                <input
                  type="number"
                  step="0.01"
                  value={activeRow?.mrp}
                  onChange={e => handleRowChange(activeRowIndex, 'mrp', e.target.value)}
                  style={{ width: '80px', padding: '0.2rem 0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', marginLeft: '0.4rem', fontWeight: '700' }}
                />
              </div>
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
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            padding: '1.5rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.4)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.8rem' }}>
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

            <form onSubmit={handleQuickAddMedicineSubmit}>
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

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    UNIT & PACK SIZE
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                    <select
                      value={newMedForm.unit}
                      onChange={e => setNewMedForm({ ...newMedForm, unit: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                    >
                      <option value="STRIP">STRIP</option>
                      <option value="TAB">TAB</option>
                      <option value="CAP">CAP</option>
                      <option value="BOTTLE">BOTTLE</option>
                      <option value="VIAL">VIAL</option>
                      <option value="TUBE">TUBE</option>
                      <option value="BOX">BOX</option>
                    </select>
                    <input
                      type="number"
                      min="1"
                      placeholder="Units"
                      value={newMedForm.conversionFactor}
                      onChange={e => setNewMedForm({ ...newMedForm, conversionFactor: parseInt(e.target.value) || 1 })}
                      style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center', fontSize: '0.85rem' }}
                    />
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

              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
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
        <div style={{
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
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc'
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

            <form onSubmit={handleCreateSupplierQuick} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
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

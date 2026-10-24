import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { getLocalDateString } from '../utils/dateUtils';

import {
  ShoppingCart,
  Plus,
  Trash2,
  Search,
  User,
  Phone,
  Stethoscope,
  Receipt,
  Save,
  Printer,
  X,
  CreditCard,
  Building2,
  Sparkles,
  Layers,
  ChevronDown,
  ArrowRight,
  Pill,
  Clock,
  RefreshCw,
  Edit3
} from 'lucide-react';

interface MedicineItem {
  id: string;
  name: string;
  sku: string;
  genericName?: string | null;
  unit: string;
  conversionFactor: number;
  gstRate: number;
  totalStock: number;
  batches: Array<{
    id: string;
    batchNumber: string;
    expiryDate: string;
    mrp: number;
    ptr: number;
    pts: number;
    currentStock: number;
  }>;
}

interface CustomerParty {
  id: string;
  name: string;
  mailTo?: string | null;
  type: string;
  station?: string | null;
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
  defaultDoctorName?: string | null;
  defaultDoctorRegNo?: string | null;
  isCash: boolean;
  outstandingBalance: number;
}

interface SaleLineItem {
  itemId: string;
  medicineName: string;
  genericName?: string | null;
  sku: string;
  pack: string;
  conversionFactor: number;
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  currentStock: number;
  strips: number; // STRI (Full strips)
  looseQty: number; // TAB. (Loose tablets/units)
  quantity: number; // Total units = (strips * conversionFactor) + looseQty
  freeQuantity: number;
  unitPrice: number; // Rate per strip / pack
  mrp: number;
  discountPercent: number;
  gstRate: number;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
}

interface POSBillingProps {
  onBack: () => void;
  onInvoiceCreated?: () => void;
  editingInvoiceId?: string | null;
}

export default function POSBilling({ onBack, onInvoiceCreated, editingInvoiceId }: POSBillingProps) {
  const { activeCompany } = useAuth();

  // Search & Master Data
  const [items, setItems] = useState<MedicineItem[]>([]);
  const [customers, setCustomers] = useState<CustomerParty[]>([]);
  const [nextInvoiceNo, setNextInvoiceNo] = useState('');
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Form Header State (Photo 3: Marg ERP Sale Entry)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerParty | null>(null);
  const [customerName, setCustomerName] = useState('Cash Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [patientAddress, setPatientAddress] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [doctorName, setDoctorName] = useState('Dr. Priyadarshi Srivastava');
  const [doctorRegNo, setDoctorRegNo] = useState('UPMC 59048');
  const [patientName, setPatientName] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Invoice Date & Payment
  const [invoiceDate, setInvoiceDate] = useState(getLocalDateString());
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'CARD' | 'CREDIT'>('CASH');
  const [billDiscountPct, setBillDiscountPct] = useState<number>(0);
  const [manualDiscountOverride, setManualDiscountOverride] = useState(false);
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [isInterState, setIsInterState] = useState(false);
  const [isGstBill, setIsGstBill] = useState(false);
  const [notes, setNotes] = useState('');

  // Invoice Items
  const [invoiceItems, setInvoiceItems] = useState<SaleLineItem[]>([]);
  const [medicineSearch, setMedicineSearch] = useState('');
  const [showMedicineDropdown, setShowMedicineDropdown] = useState(false);
  const [selectedMedIndex, setSelectedMedIndex] = useState<number>(0);
  const [activeRowIndex, setActiveRowIndex] = useState<number>(0);

  // Status & Print Modals
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInvoice, setCreatedInvoice] = useState<any | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const medicineInputRef = useRef<HTMLInputElement>(null);
  const medicineDropdownRef = useRef<HTMLDivElement>(null);
  const stripsInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const patientInputRef = useRef<HTMLInputElement>(null);
  const doctorInputRef = useRef<HTMLInputElement>(null);

  // Filter medicines for live search
  const filteredMedicines: MedicineItem[] = useMemo(() => {
    const q = (medicineSearch || '').trim().toLowerCase();
    if (!q) return [];
    return (items || [])
      .filter(i => {
        if (!i) return false;
        const nameMatch = (i.name || '').toLowerCase().includes(q);
        const genMatch = Boolean(i.genericName && (i.genericName || '').toLowerCase().includes(q));
        const skuMatch = Boolean(i.sku && (i.sku || '').toLowerCase().includes(q));
        return nameMatch || genMatch || skuMatch;
      })
      .slice(0, 40);
  }, [items, medicineSearch]);

  // Dropdown scroll & keyboard navigation protection (prevents mouse hover collision when scrolling)
  const isKeyboardNavRef = useRef(false);
  const keyboardTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep highlighted medicine cleanly and comfortably in view when navigating with arrow keys
  useEffect(() => {
    if (showMedicineDropdown && medicineDropdownRef.current) {
      const container = medicineDropdownRef.current;
      const activeEl = container.querySelector(`[data-med-index="${selectedMedIndex}"]`) as HTMLElement;
      if (activeEl) {
        if (selectedMedIndex === 0) {
          container.scrollTop = 0;
          return;
        }
        if (selectedMedIndex === filteredMedicines.length - 1) {
          container.scrollTop = container.scrollHeight;
          return;
        }

        const containerRect = container.getBoundingClientRect();
        const activeRect = activeEl.getBoundingClientRect();

        // 16px buffer ensures the item has comfortable breathing room and is NEVER half-cut off
        const BUFFER = 16;

        if (activeRect.bottom > containerRect.bottom - BUFFER) {
          container.scrollTop += (activeRect.bottom - containerRect.bottom + BUFFER);
        } else if (activeRect.top < containerRect.top + BUFFER) {
          container.scrollTop -= (containerRect.top - activeRect.top + BUFFER);
        }
      }
    }
  }, [selectedMedIndex, showMedicineDropdown, filteredMedicines.length]);

  useEffect(() => {
    loadMasterData();
  }, [activeCompany?.id, editingInvoiceId]);

  const loadMasterData = async () => {
    if (!activeCompany) return;
    try {
      setLoadingInitial(true);
      setError(null);

      const [itemsRes, partiesRes, nextNumRes] = await Promise.all([
        api.get<{ items: MedicineItem[] }>('/api/items?limit=2000', {
          companyId: activeCompany.id
        }).catch(err => {
          console.warn('Failed to fetch items:', err);
          return { items: [] };
        }),
        api.get<{ parties: CustomerParty[] }>('/api/parties?type=customer', {
          companyId: activeCompany.id
        }).catch(err => {
          console.warn('Failed to fetch customers:', err);
          return { parties: [] };
        }),
        api.get<{ invoiceNumber: string }>('/api/invoices/next-number', {
          companyId: activeCompany.id
        }).catch(err => {
          console.warn('Failed to fetch next invoice number:', err);
          return { invoiceNumber: `INV-${new Date().getFullYear()}-0001` };
        })
      ]);

      setItems(itemsRes.items || []);
      setCustomers(partiesRes.parties || []);
      setNextInvoiceNo(nextNumRes.invoiceNumber || `INV-${new Date().getFullYear()}-0001`);

      if (editingInvoiceId) {
        const editRes = await api.get<{ invoice: any }>(`/api/invoices/${editingInvoiceId}`, {
          companyId: activeCompany.id
        });

        const inv = editRes.invoice;
        if (inv) {
          setNextInvoiceNo(inv.invoiceNumber);
          setInvoiceDate(inv.invoiceDate ? getLocalDateString(new Date(inv.invoiceDate)) : getLocalDateString());
          setCustomerName(inv.customerName || 'Cash Customer');
          setCustomerPhone(inv.customerPhone || '');
          setPatientAddress(inv.patientAddress || inv.customerAddress || '');
          setCustomerGstin(inv.customerGstin || '');
          setDoctorName(inv.doctorName || '');
          setDoctorRegNo(inv.doctorRegNo || '');
          setPatientName(inv.patientName || '');
          setPaymentMode((inv.paymentMode as any) || 'CASH');
          setBillDiscountPct(Number(inv.billDiscountPct) || 0);
          setPaidAmount(String(inv.paidAmount ?? ''));
          setNotes(inv.notes || '');
          setIsGstBill(Number(inv.totalTax || 0) > 0);

          if (inv.partyId && partiesRes.parties) {
            const found = partiesRes.parties.find((p: CustomerParty) => p.id === inv.partyId);
            if (found) setSelectedCustomer(found);
          }

          if (inv.items && Array.isArray(inv.items)) {
            const mappedItems: SaleLineItem[] = inv.items.map((i: any) => {
              const matchedItem = itemsRes.items?.find((m: MedicineItem) => m.id === (i.itemId || i.item?.id));
              const matchedBatch = matchedItem?.batches?.find((b: any) => b.id === (i.batchId || i.batch?.id));

              return {
                itemId: i.itemId || i.item?.id || '',
                medicineName: i.medicineName || i.item?.name || matchedItem?.name || 'Medicine Item',
                genericName: i.genericName || i.item?.genericName || matchedItem?.genericName || '',
                sku: i.sku || i.item?.sku || matchedItem?.sku || '',
                pack: i.pack || '10 TAB',
                conversionFactor: matchedItem?.conversionFactor || 1,
                batchId: i.batchId || i.batch?.id || matchedBatch?.id || '',
                batchNumber: i.batchNumber || i.batch?.batchNumber || matchedBatch?.batchNumber || 'BATCH',
                expiryDate: i.expiryDate || i.batch?.expiryDate || matchedBatch?.expiryDate || '',
                currentStock: matchedBatch?.currentStock || 999,
                strips: i.strips || 0,
                looseQty: i.looseQty || 0,
                quantity: i.quantity || 1,
                freeQuantity: i.freeQuantity || 0,
                unitPrice: Number(i.unitPrice || 0),
                mrp: Number(i.mrp || 0),
                discountPercent: Number(i.discountPercent || 0),
                gstRate: Number(i.gstRate || 0),
                taxableAmount: Number(i.taxableAmount || 0),
                gstAmount: Number(i.cgstAmount || 0) + Number(i.sgstAmount || 0) + Number(i.igstAmount || 0),
                totalAmount: Number(i.totalAmount || 0)
              };
            });
            setInvoiceItems(mappedItems);
          }
        }
      } else {
        // Default to cash customer if available
        const cashParty = partiesRes.parties?.find((p: CustomerParty) => p.isCash);
        if (cashParty) {
          setSelectedCustomer(cashParty);
          setCustomerName(cashParty.name);
        }
      }
    } catch (err: any) {
      console.error('Failed to load POS master data:', err);
      setError('Could not load inventory items. Please check connection.');
    } finally {
      setLoadingInitial(false);
      // Automatically focus medicine search bar on open for zero-mouse flow
      setTimeout(() => {
        medicineInputRef.current?.focus();
      }, 100);
    }
  };

  // Switch whole bill between GST (Tax Invoice) and Non-GST (Retail Bill)
  const handleToggleGstBill = (enable: boolean) => {
    setIsGstBill(enable);
    setInvoiceItems(prev => prev.map(item => {
      const origMed = items.find(m => m.id === item.itemId);
      const newGstRate = enable
        ? (origMed?.gstRate !== undefined && !isNaN(Number(origMed.gstRate)) ? Number(origMed.gstRate) : 5.0)
        : 0;

      const strips = item.strips || 0;
      const loose = item.looseQty || 0;
      const factor = item.conversionFactor || 1;
      const pricePerStrip = item.unitPrice || 0;
      const discPct = item.discountPercent || 0;

      const lineGross = (strips * pricePerStrip) + (loose * (pricePerStrip / factor));
      const lineDisc = (lineGross * discPct) / 100;
      const lineTaxable = Math.max(0, lineGross - lineDisc);
      const lineGst = (lineTaxable * newGstRate) / 100;
      const lineTotal = lineTaxable + lineGst;

      return {
        ...item,
        gstRate: newGstRate,
        taxableAmount: Math.round(lineTaxable * 100) / 100,
        gstAmount: Math.round(lineGst * 100) / 100,
        totalAmount: Math.round(lineTotal * 100) / 100
      };
    }));
  };

  // Select Item & Auto-Pick Batch with Highest Stock / More Strips (User can change batch anytime)
  const handleSelectItem = (item: MedicineItem) => {
    // Sort batches: highest stock (more strips) first. In case of equal stock, break tie with earlier expiry.
    const sortedBatches = [...(item.batches || [])].sort((a, b) => {
      if (b.currentStock !== a.currentStock) {
        return b.currentStock - a.currentStock;
      }
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
    });

    let availableBatches = sortedBatches.filter(b => b.currentStock > 0);

    if (availableBatches.length === 0) {
      availableBatches = sortedBatches;
    }

    if (availableBatches.length === 0) {
      setError(`"${item.name}" does not have any registered batch. Please add an opening batch in Medicine Catalog.`);
      return;
    }

    // Default to the batch containing more strips / stock
    const defaultBatch = availableBatches[0];
    const unitPrice = Number(defaultBatch.mrp) || Number(defaultBatch.pts) || 0;
    const catalogGst = Number(item.gstRate) !== undefined && !isNaN(Number(item.gstRate)) ? Number(item.gstRate) : 5.0;
    const gstRate = isGstBill ? catalogGst : 0;
    const factor = item.conversionFactor || 1;

    // Default 1 Strip
    const strips = 1;
    const looseQty = 0;
    const totalUnits = (strips * factor) + looseQty;

    const lineGross = (strips * unitPrice) + (looseQty * (unitPrice / factor));
    const lineTaxable = lineGross;
    const lineGst = (lineTaxable * gstRate) / 100;
    const lineTotal = lineTaxable + lineGst;

    const newItem: SaleLineItem = {
      itemId: item.id,
      medicineName: item.name,
      genericName: item.genericName,
      sku: item.sku,
      pack: factor > 1 ? `${factor} ${item.unit}` : item.unit,
      conversionFactor: factor,
      batchId: defaultBatch.id,
      batchNumber: defaultBatch.batchNumber,
      expiryDate: defaultBatch.expiryDate,
      currentStock: defaultBatch.currentStock,
      strips: 1,
      looseQty: 0,
      quantity: totalUnits,
      freeQuantity: 0,
      unitPrice,
      mrp: Number(defaultBatch.mrp),
      discountPercent: 0,
      gstRate,
      taxableAmount: lineTaxable,
      gstAmount: lineGst,
      totalAmount: lineTotal
    };

    const newIdx = invoiceItems.length;
    setInvoiceItems([...invoiceItems, newItem]);
    setActiveRowIndex(newIdx);
    setMedicineSearch('');
    setShowMedicineDropdown(false);
    setSelectedMedIndex(0);
    setError(null);

    // Auto-focus strips quantity input of the newly added line
    setTimeout(() => {
      stripsInputRefs.current[newIdx]?.focus();
      stripsInputRefs.current[newIdx]?.select();
    }, 60);
  };

  // Update specific field in item row
  const updateLineItem = (index: number, updates: Partial<SaleLineItem>) => {
    setInvoiceItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], ...updates };

      const strips = Math.max(0, item.strips || 0);
      const loose = Math.max(0, item.looseQty || 0);
      const factor = item.conversionFactor || 1;
      const totalUnits = (strips * factor) + loose;

      const pricePerStrip = Math.max(0, item.unitPrice);
      const discPct = Math.max(0, Math.min(100, item.discountPercent));
      const gstRate = Math.max(0, item.gstRate ?? 0);

      // Price calculation: full strips * strip price + loose tablets * per tablet price
      const lineGross = (strips * pricePerStrip) + (loose * (pricePerStrip / factor));
      const lineDisc = (lineGross * discPct) / 100;
      const lineTaxable = Math.max(0, lineGross - lineDisc);
      const lineGst = (lineTaxable * gstRate) / 100;
      const lineTotal = lineTaxable + lineGst;

      item.strips = strips;
      item.looseQty = loose;
      item.quantity = Math.max(1, totalUnits);
      item.unitPrice = pricePerStrip;
      item.discountPercent = discPct;
      item.gstRate = gstRate;
      item.taxableAmount = Math.round(lineTaxable * 100) / 100;
      item.gstAmount = Math.round(lineGst * 100) / 100;
      item.totalAmount = Math.round(lineTotal * 100) / 100;

      updated[index] = item;
      return updated;
    });
  };

  const removeLineItem = (index: number) => {
    setInvoiceItems(prev => prev.filter((_, i) => i !== index));
    if (activeRowIndex >= invoiceItems.length - 1) {
      setActiveRowIndex(Math.max(0, invoiceItems.length - 2));
    }
  };

  // Financial Calculations
  const valueOfGoods = invoiceItems.reduce((sum, item) => sum + (item.strips * item.unitPrice + item.looseQty * (item.unitPrice / (item.conversionFactor || 1))), 0);
  const totalItemDiscount = invoiceItems.reduce((sum, item) => {
    const factor = item.conversionFactor || 1;
    const lineGross = (item.strips * item.unitPrice) + (item.looseQty * (item.unitPrice / factor));
    return sum + ((lineGross * item.discountPercent) / 100);
  }, 0);
  const grossTaxable = Math.max(0, valueOfGoods - totalItemDiscount);

  // Automatic 10% Scheme on bills exceeding ₹500
  useEffect(() => {
    if (!manualDiscountOverride && !editingInvoiceId) {
      if (grossTaxable > 500) {
        setBillDiscountPct(10);
      } else {
        setBillDiscountPct(0);
      }
    }
  }, [grossTaxable, manualDiscountOverride, editingInvoiceId]);

  const billDiscountAmt = (grossTaxable * Math.max(0, Math.min(100, billDiscountPct))) / 100;
  const netTaxable = Math.max(0, grossTaxable - billDiscountAmt);

  const discountMultiplier = 1 - (Math.max(0, Math.min(100, billDiscountPct)) / 100);
  const totalGstAmount = invoiceItems.reduce((sum, item) => {
    const effectiveTaxable = item.taxableAmount * discountMultiplier;
    return sum + ((effectiveTaxable * (item.gstRate || 0)) / 100);
  }, 0);

  const cgstAmount = isInterState ? 0 : totalGstAmount / 2;
  const sgstAmount = isInterState ? 0 : totalGstAmount / 2;
  const igstAmount = isInterState ? totalGstAmount : 0;

  const rawGrandTotal = netTaxable + totalGstAmount;
  const grandTotal = Math.round(rawGrandTotal);
  const roundOff = Math.round((grandTotal - rawGrandTotal) * 100) / 100;

  const numericPaid = paidAmount === ''
    ? (paymentMode === 'CREDIT' ? 0 : grandTotal)
    : Math.max(0, parseFloat(paidAmount) || 0);

  const balanceDue = Math.max(0, grandTotal - numericPaid);

  // Keyboard Navigation: F1 (Doctor), F2 (Patient/Complete), F3 (Search), Alt+S (Sales)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        doctorInputRef.current?.focus();
      } else if (e.key === 'F2') {
        e.preventDefault();
        if (invoiceItems.length > 0 && !submitting) {
          handleSaveInvoice();
        } else {
          patientInputRef.current?.focus();
        }
      } else if (e.key === 'F3') {
        e.preventDefault();
        medicineInputRef.current?.focus();
      } else if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (invoiceItems.length > 0 && !submitting) {
          handleSaveInvoice();
        }
      } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [invoiceItems, paymentMode, paidAmount, customerName, submitting, onBack]);

  const handleSaveInvoice = async () => {
    if (!activeCompany) return;
    if (invoiceItems.length === 0) {
      setError('Please add at least one medicine item to generate invoice.');
      return;
    }

    // Negative stock is allowed (Tally Prime / Marg ERP style) for fast retail checkout
    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        partyId: selectedCustomer?.id || null,
        customerName: customerName.trim() || 'Cash Customer',
        customerPhone: customerPhone.trim() || null,
        customerAddress: patientAddress.trim() || null,
        customerGstin: customerGstin.trim() || null,
        doctorName: doctorName.trim() || null,
        doctorRegNo: doctorRegNo.trim() || null,
        patientName: patientName.trim() || (customerName.trim() !== 'Cash Customer' ? customerName.trim() : null),
        patientAddress: patientAddress.trim() || null,
        invoiceNumber: nextInvoiceNo,
        invoiceDate: invoiceDate === getLocalDateString() ? new Date().toISOString() : invoiceDate,
        paymentMode,
        paidAmount: numericPaid,
        billDiscountPct,
        isInterState,
        roundOff,
        notes: notes.trim() || null,
        items: invoiceItems.map(i => ({
          itemId: i.itemId,
          batchId: i.batchId,
          batchNumber: i.batchNumber,
          pack: i.pack,
          strips: i.strips,
          looseQty: i.looseQty,
          quantity: i.quantity,
          freeQuantity: i.freeQuantity,
          unitPrice: i.unitPrice,
          mrp: i.mrp,
          discountPercent: i.discountPercent,
          gstRate: i.gstRate
        }))
      };

      let invoiceId = editingInvoiceId;

      if (editingInvoiceId) {
        await api.put<{ invoice: any }>(`/api/invoices/${editingInvoiceId}`, payload, {
          companyId: activeCompany.id,
          idempotencyKey: `pos-edit-${Date.now()}`
        });
      } else {
        const res = await api.post<{ invoice: any }>('/api/invoices', payload, {
          companyId: activeCompany.id,
          idempotencyKey: `pos-${Date.now()}`
        });
        invoiceId = res.invoice.id;
      }

      const detailsRes = await api.get<{ invoice: any }>(`/api/invoices/${invoiceId}`, {
        companyId: activeCompany.id
      });

      setCreatedInvoice(detailsRes.invoice);
      setNextInvoiceNo(detailsRes.invoice.invoiceNumber);
      setShowPrintModal(true);

      if (onInvoiceCreated) {
        onInvoiceCreated();
      }
    } catch (err: any) {
      console.error('Invoice creation/update error:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to complete sale transaction';
      setError(errMsg);
      // Auto-recover if invoice number already exists
      if (errMsg.includes('already exists') && !editingInvoiceId) {
        api.get<{ invoiceNumber: string }>('/api/invoices/next-number', { companyId: activeCompany?.id })
          .then(res => {
            if (res.invoiceNumber) setNextInvoiceNo(res.invoiceNumber);
          })
          .catch(() => {});
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateLabel = (d?: string | null) => {
    if (!d) return '—';
    try {
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    } catch {
      return '—';
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const activeRow = invoiceItems && invoiceItems.length > 0 ? (invoiceItems[activeRowIndex] || invoiceItems[0]) : null;
  const activeMedicine = items && activeRow ? items.find(i => i.id === activeRow?.itemId) : null;

  return (
    <div style={{ padding: '1.2rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.8rem' }}>
        <div>
          <button
            onClick={onBack}
            className="btn btn-secondary"
            title="Return to Sales Invoices list [Alt+S]"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', fontSize: '0.8rem' }}
          >
            ← Back to Sales List <span style={{ opacity: 0.65, fontSize: '0.72rem' }}>[Alt+S]</span>
          </button>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <ShoppingCart style={{ color: 'var(--brand-teal)' }} />
            {editingInvoiceId ? `EDIT SALE INVOICE #${nextInvoiceNo}` : 'SALE ENTRY / POS BILLING TERMINAL'}
          </h1>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Keyboard Shortcuts: <strong>[↑/↓]</strong> Navigate Meds • <strong>[Enter]</strong> Add & Qty • <strong>[F3]</strong> Search • <strong>[F1]</strong> Doctor • <strong>[F2/Ctrl+Enter]</strong> Save • <strong>[Alt+S]</strong> Sales
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          {/* Editable Bill Number with Auto-Adjust / Refresh */}
          <div style={{
            padding: '0.35rem 0.75rem',
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.15rem' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Bill No.
              </span>
              {!editingInvoiceId && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await api.get<{ invoiceNumber: string }>('/api/invoices/next-number', { companyId: activeCompany?.id });
                      if (res.invoiceNumber) setNextInvoiceNo(res.invoiceNumber);
                    } catch (e) {
                      console.error('Failed to refresh bill no:', e);
                    }
                  }}
                  title="Auto-fetch next available unused bill number"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--brand-teal)',
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                    padding: 0
                  }}
                >
                  <RefreshCw size={10} /> Auto
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="text"
                value={nextInvoiceNo}
                onChange={e => setNextInvoiceNo(e.target.value.toUpperCase())}
                placeholder="INV-2026-0001"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px dashed var(--brand-teal)',
                  color: 'var(--brand-teal)',
                  fontWeight: '800',
                  fontSize: '0.95rem',
                  outline: 'none',
                  width: '135px',
                  padding: '0 0 1px 0'
                }}
                title="Click to manually edit or change invoice number"
              />
              <Edit3 size={11} color="var(--brand-teal)" style={{ opacity: 0.6 }} />
            </div>
          </div>
          <div style={{ padding: '0.4rem 0.8rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Date</div>
            <input
              type="date"
              value={invoiceDate}
              onChange={e => setInvoiceDate(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontWeight: '700', outline: 'none', fontSize: '0.85rem' }}
            />
          </div>
          <button
            onClick={handleSaveInvoice}
            disabled={submitting || invoiceItems.length === 0}
            style={{
              padding: '0.65rem 1.4rem',
              background: invoiceItems.length === 0 ? '#94a3b8' : '#0f766e',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '0.95rem',
              cursor: (submitting || invoiceItems.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (submitting || invoiceItems.length === 0) ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: invoiceItems.length > 0 ? '0 4px 12px rgba(15, 118, 110, 0.35)' : 'none'
            }}
          >
            <Receipt size={16} />
            {submitting ? 'Saving...' : editingInvoiceId ? `Update Invoice (₹${grandTotal.toFixed(0)})` : `Complete Sale (₹${grandTotal.toFixed(0)})`}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', padding: '0.7rem 1.2rem', borderRadius: '8px', color: 'var(--accent-red)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Patient & Doctor Header Bar (Responsive Grid) */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', alignItems: 'end' }}>
          
          {/* Patient [F2] */}
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--brand-teal)', marginBottom: '0.3rem' }}>
              PATIENT [F2] / CUSTOMER :
            </label>
            <input
              ref={patientInputRef}
              type="text"
              placeholder="Patient / Customer Name"
              value={customerName}
              onChange={e => {
                const val = e.target.value;
                setCustomerName(val);
                setPatientName(val);
                if (selectedCustomer && selectedCustomer.name !== val && !selectedCustomer.isCash) {
                  setSelectedCustomer(null);
                }
                setShowCustomerDropdown(true);
              }}
              onFocus={() => setShowCustomerDropdown(true)}
              style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '600' }}
            />
            {showCustomerDropdown && (customers || []).length > 0 && customerName && customerName.trim() && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
                  maxHeight: '180px',
                  overflowY: 'auto'
                }}
              >
                {(customers || [])
                  .filter(c => {
                    if (!c) return false;
                    const q = (customerName || '').trim().toLowerCase();
                    if (!q) return true;
                    const nameMatch = (c.name || '').toLowerCase().includes(q);
                    const phoneMatch = Boolean(c.phone && c.phone.includes(customerName));
                    return nameMatch || phoneMatch;
                  })
                  .slice(0, 6)
                  .map(c => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setSelectedCustomer(c);
                        setCustomerName(c.name);
                        setPatientName(c.name);
                        if (c.phone) setCustomerPhone(c.phone);
                        if (c.address) setPatientAddress(c.address);
                        if (c.gstin) setCustomerGstin(c.gstin);
                        setShowCustomerDropdown(false);
                      }}
                      style={{
                        padding: '0.5rem 0.8rem',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-color)',
                        fontSize: '0.85rem'
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{c.name} {c.isCash ? '(Cash)' : ''}</div>
                      {c.phone && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>📞 {c.phone}</div>}
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Patient Address & Phone */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              ADDRESS / MOBILE :
            </label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input
                type="text"
                placeholder="Mobile"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                style={{ width: '105px', padding: '0.55rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
              />
              <input
                type="text"
                placeholder="Patient Address"
                value={patientAddress}
                onChange={e => setPatientAddress(e.target.value)}
                style={{ flex: 1, minWidth: '100px', padding: '0.55rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {/* Doctor [F1] */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#0284c7', marginBottom: '0.3rem' }}>
              DOCTOR [F1] :
            </label>
            <input
              ref={doctorInputRef}
              type="text"
              placeholder="Dr. Name (Prescribing Doctor)"
              value={doctorName}
              onChange={e => setDoctorName(e.target.value)}
              style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '600' }}
            />
          </div>

          {/* Reg. No. */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              REG. NO. :
            </label>
            <input
              type="text"
              placeholder="Doctor MCI Reg No."
              value={doctorRegNo}
              onChange={e => setDoctorRegNo(e.target.value.toUpperCase())}
              style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
      </div>

      {/* Main Medicine Search & Bill Grid (Photo 3 Middle Table) */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'visible', position: 'relative', marginBottom: '1rem' }}>
        
        {/* Bill Options & Tax Mode Bar */}
        <div style={{
          padding: '0.65rem 1rem',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.8rem'
        }}>
          {/* Tax Mode Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
              BILL TAX TYPE :
            </span>
            <div style={{ display: 'inline-flex', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '7px', padding: '2px' }}>
              <button
                type="button"
                onClick={() => handleToggleGstBill(true)}
                style={{
                  padding: '0.35rem 0.8rem',
                  borderRadius: '5px',
                  border: 'none',
                  background: isGstBill ? '#0f766e' : 'transparent',
                  color: isGstBill ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: isGstBill ? '700' : '600',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>🧾</span> Tax Invoice (GST)
              </button>
              <button
                type="button"
                onClick={() => handleToggleGstBill(false)}
                style={{
                  padding: '0.35rem 0.8rem',
                  borderRadius: '5px',
                  border: 'none',
                  background: !isGstBill ? '#0284c7' : 'transparent',
                  color: !isGstBill ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: !isGstBill ? '700' : '600',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>📄</span> Non-GST / Retail Bill (0% Tax)
              </button>
            </div>
            {!isGstBill ? (
              <span style={{ fontSize: '0.72rem', color: '#0284c7', background: 'rgba(2, 132, 199, 0.12)', border: '1px solid rgba(2, 132, 199, 0.25)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight: '700' }}>
                ✓ GST Optional (0% Tax Applied)
              </span>
            ) : (
              <span style={{ fontSize: '0.72rem', color: '#0f766e', background: 'rgba(15, 118, 110, 0.1)', border: '1px solid rgba(15, 118, 110, 0.2)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight: '700' }}>
                ✓ GST Active (Editable per item)
              </span>
            )}
          </div>

          {/* Inter-state & Bill Discount */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
            {isGstBill && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: '600' }}>
                <input
                  type="checkbox"
                  checked={isInterState}
                  onChange={e => setIsInterState(e.target.checked)}
                  style={{ cursor: 'pointer', accentColor: '#0f766e' }}
                />
                <span>Inter-State (IGST)</span>
              </label>
            )}

            {/* Scheme Indicator Badge */}
            {grossTaxable > 500 && billDiscountPct === 10 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: '#15803d', background: '#dcfce7', border: '1px solid #86efac', padding: '0.25rem 0.6rem', borderRadius: '6px', fontWeight: '700' }}>
                <span>🎁 10% Scheme Applied (Bill &gt; ₹500)</span>
                <span style={{ fontSize: '0.72rem', color: '#166534', fontWeight: '800' }}>(-₹{billDiscountAmt.toFixed(2)})</span>
              </div>
            ) : grossTaxable > 0 && grossTaxable <= 500 ? (
              <div style={{ fontSize: '0.74rem', color: '#475569', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '0.2rem 0.5rem', borderRadius: '5px' }}>
                💡 Add <strong style={{ color: '#0f766e' }}>₹{(500 - grossTaxable + 0.01).toFixed(2)}</strong> more for <strong>10% Scheme OFF</strong>
              </div>
            ) : null}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Bill Disc:</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                placeholder="0"
                value={billDiscountPct === 0 ? '' : billDiscountPct}
                onChange={e => {
                  setManualDiscountOverride(true);
                  setBillDiscountPct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)));
                }}
                style={{
                  width: '52px',
                  padding: '0.3rem 0.4rem',
                  background: 'var(--card-bg)',
                  border: grossTaxable > 500 && billDiscountPct === 10 ? '1.5px solid #10b981' : '1px solid var(--border-color)',
                  borderRadius: '5px',
                  color: 'var(--text-primary)',
                  textAlign: 'center',
                  fontWeight: '700',
                  fontSize: '0.82rem'
                }}
              />
              <span style={{ color: 'var(--text-muted)' }}>%</span>
              {manualDiscountOverride && (
                <button
                  type="button"
                  onClick={() => {
                    setManualDiscountOverride(false);
                    if (grossTaxable > 500) setBillDiscountPct(10);
                    else setBillDiscountPct(0);
                  }}
                  title="Reset to automatic 10% scheme for bills > ₹500"
                  style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline', padding: '0 2px' }}
                >
                  ↺ Auto
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Medicine Search Bar */}
        <div style={{ padding: '0.8rem 1rem', borderBottom: '1px solid var(--border-color)', position: 'relative', background: 'var(--bg-secondary)' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#0f766e', display: 'flex', alignItems: 'center', pointerEvents: 'none', zIndex: 2 }}>
              <Search size={16} />
            </span>
            <input
              ref={medicineInputRef}
              type="text"
              placeholder="Search by brand name, generic name, or barcode... [F3] (Use ↑ / ↓ to navigate, Enter to select)"
              value={medicineSearch}
              onChange={e => {
                setMedicineSearch(e.target.value);
                setSelectedMedIndex(0);
                setShowMedicineDropdown(true);
              }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (!showMedicineDropdown) {
                    setShowMedicineDropdown(true);
                  }
                  isKeyboardNavRef.current = true;
                  if (keyboardTimerRef.current) clearTimeout(keyboardTimerRef.current);
                  keyboardTimerRef.current = setTimeout(() => {
                    isKeyboardNavRef.current = false;
                  }, 400);

                  if (filteredMedicines.length > 0) {
                    setSelectedMedIndex(prev => Math.min(filteredMedicines.length - 1, prev + 1));
                  }
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (!showMedicineDropdown) {
                    setShowMedicineDropdown(true);
                  }
                  isKeyboardNavRef.current = true;
                  if (keyboardTimerRef.current) clearTimeout(keyboardTimerRef.current);
                  keyboardTimerRef.current = setTimeout(() => {
                    isKeyboardNavRef.current = false;
                  }, 400);

                  if (filteredMedicines.length > 0) {
                    setSelectedMedIndex(prev => Math.max(0, prev - 1));
                  }
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filteredMedicines.length > 0) {
                    const target = (selectedMedIndex >= 0 && selectedMedIndex < filteredMedicines.length)
                      ? filteredMedicines[selectedMedIndex]
                      : filteredMedicines[0];
                    handleSelectItem(target);
                  }
                } else if (e.key === 'Escape') {
                  setShowMedicineDropdown(false);
                }
              }}
              onFocus={() => {
                if ((medicineSearch || '').trim().length > 0) {
                  setShowMedicineDropdown(true);
                }
              }}
              onBlur={() => setTimeout(() => setShowMedicineDropdown(false), 200)}
              style={{
                width: '100%',
                padding: '0.65rem 1rem 0.65rem 2.4rem',
                background: '#ffffff',
                border: '2px solid #e2e8f0',
                borderRadius: '8px',
                color: '#0f172a',
                fontWeight: '600',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />

            {showMedicineDropdown && (medicineSearch || '').trim().length > 0 && (
              <div
                ref={medicineDropdownRef}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  marginTop: '4px',
                  maxHeight: '340px',
                  overflowY: 'auto',
                  zIndex: 99999,
                  boxShadow: '0 16px 40px rgba(0,0,0,0.45)'
                }}
              >
                {filteredMedicines.length === 0 ? (
                  <div style={{ padding: '0.9rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                    No medicines matching "{medicineSearch}"
                  </div>
                ) : (
                  filteredMedicines.map((med, idx) => {
                    const isSelected = idx === selectedMedIndex;
                    const totalStock = med.totalStock ?? (med.batches || []).reduce((s, b) => s + (b.currentStock || 0), 0) ?? 0;
                    const sortedMedBatches = [...(med.batches || [])].sort((a, b) => {
                      if (b.currentStock !== a.currentStock) return b.currentStock - a.currentStock;
                      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
                    });
                    const topBatch = sortedMedBatches[0];
                    return (
                      <div
                        key={med.id}
                        data-med-index={idx}
                        onClick={() => handleSelectItem(med)}
                        onMouseMove={() => {
                          if (!isKeyboardNavRef.current && selectedMedIndex !== idx) {
                            setSelectedMedIndex(idx);
                          }
                        }}
                        style={{
                          padding: '0.7rem 1rem',
                          borderBottom: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: isSelected ? 'rgba(20, 184, 166, 0.15)' : 'transparent',
                          borderLeft: isSelected ? '4px solid var(--brand-teal)' : '4px solid transparent',
                          transition: 'background 0.1s ease'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, paddingRight: '0.8rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: '700', color: isSelected ? 'var(--brand-teal)' : 'var(--text-primary)' }}>
                              {med.name}
                            </span>
                            {isSelected && (
                              <span style={{
                                background: 'var(--brand-teal)',
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
                            {med.genericName ? `${med.genericName} • ` : ''}Pack: {med.conversionFactor > 1 ? `${med.conversionFactor}T` : med.unit} {med.gstRate !== undefined ? `• GST: ${med.gstRate}%` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontWeight: '800', color: totalStock > 0 ? 'var(--brand-teal)' : (totalStock < 0 ? 'var(--accent-red)' : 'var(--text-muted)') }}>
                            {totalStock > 0 ? `${totalStock} in stock` : (totalStock < 0 ? `${totalStock} units (Negative)` : '0 in stock')}
                          </div>
                          {topBatch && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              MRP: ₹{Number(topBatch.mrp || 0).toFixed(2)} | Exp: {formatDateLabel(topBatch.expiryDate)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sale Entry Grid (Responsive & Horizontal Scroll Protected) */}
        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <table style={{ width: '100%', minWidth: '1060px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '0.75rem 0.6rem', width: '38px', minWidth: '38px', textAlign: 'center' }}>#</th>
                <th style={{ padding: '0.75rem 0.8rem', minWidth: '200px' }}>PRODUCT</th>
                <th style={{ padding: '0.75rem 0.6rem', width: '85px', minWidth: '85px', textAlign: 'center' }}>PACK</th>
                <th style={{ padding: '0.75rem 0.8rem', width: '180px', minWidth: '170px' }}>BATCH</th>
                <th style={{ padding: '0.75rem 0.6rem', width: '85px', minWidth: '80px', textAlign: 'center' }} title="Full Strips / Packs">STRIPS</th>
                <th style={{ padding: '0.75rem 0.6rem', width: '90px', minWidth: '85px', textAlign: 'center' }} title="Loose Tablets (e.g. 2 tabs or 12 tabs)">LOOSE TABS</th>
                <th style={{ padding: '0.75rem 0.6rem', width: '115px', minWidth: '105px', textAlign: 'right' }}>M.R.P./S</th>
                <th style={{ padding: '0.75rem 0.6rem', width: '75px', minWidth: '70px', textAlign: 'center' }}>DIS%</th>
                <th style={{ padding: '0.75rem 0.6rem', width: '80px', minWidth: '75px', textAlign: 'center' }} title="GST rate percentage (Editable per item)">GST% ✎</th>
                <th style={{ padding: '0.75rem 0.8rem', width: '130px', minWidth: '120px', textAlign: 'right' }}>AMOUNT (₹)</th>
                <th style={{ padding: '0.75rem 0.5rem', width: '35px', minWidth: '35px' }}></th>
              </tr>
            </thead>
            <tbody>
              {invoiceItems.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <Pill size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                    <p style={{ margin: 0, fontWeight: '500' }}>No medicines added to bill yet.</p>
                    <p style={{ fontSize: '0.8rem', marginTop: '0.2rem', color: 'var(--text-muted)' }}>Press [F3] or search product above to add.</p>
                  </td>
                </tr>
              ) : (
                invoiceItems.map((item, idx) => {
                  const isFocused = activeRowIndex === idx;
                  const medicine = items.find(i => i.id === item.itemId);
                  const batches = [...(medicine?.batches || [])].sort((a, b) => {
                    if (b.currentStock !== a.currentStock) {
                      return b.currentStock - a.currentStock;
                    }
                    return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
                  });

                  return (
                    <tr
                      key={idx}
                      onClick={() => setActiveRowIndex(idx)}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        background: isFocused ? 'rgba(20, 184, 166, 0.08)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '0.6rem 0.6rem', textAlign: 'center', color: 'var(--text-secondary)' }}>{idx + 1}</td>

                      {/* Product Name */}
                      <td style={{ padding: '0.6rem 0.8rem' }}>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{item.medicineName}</div>
                        {item.genericName && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.genericName}</div>
                        )}
                      </td>

                      {/* Pack */}
                      <td style={{ padding: '0.6rem 0.6rem', color: 'var(--text-secondary)', textAlign: 'center', fontWeight: '500' }}>
                        {item.pack}
                      </td>

                      {/* Batch Selection */}
                      <td style={{ padding: '0.6rem 0.7rem' }}>
                        {batches.length > 1 ? (
                          <select
                            value={item.batchId}
                            onChange={e => {
                              const b = batches.find(x => x.id === e.target.value);
                              if (b) {
                                updateLineItem(idx, {
                                  batchId: b.id,
                                  batchNumber: b.batchNumber,
                                  expiryDate: b.expiryDate,
                                  currentStock: b.currentStock,
                                  mrp: Number(b.mrp),
                                  unitPrice: Number(b.mrp) || Number(b.pts) || 0
                                });
                              }
                            }}
                            title="Batch containing more strips is selected by default. Click to switch batch."
                            style={{
                              width: '100%',
                              boxSizing: 'border-box',
                              padding: '0.4rem 0.5rem',
                              background: 'var(--bg-secondary)',
                              border: '1.5px solid var(--brand-teal)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontSize: '0.82rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              outline: 'none',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {batches.map(b => {
                              const factor = medicine?.conversionFactor || 1;
                              const strips = factor > 1 ? Math.floor(b.currentStock / factor) : b.currentStock;
                              const loose = factor > 1 ? b.currentStock % factor : 0;
                              const stockStr = factor > 1
                                ? `${strips} Str${loose > 0 ? ` + ${loose}T` : ''} (${b.currentStock} units)`
                                : `${b.currentStock} units`;

                              return (
                                <option key={b.id} value={b.id}>
                                  {b.batchNumber} — Stock: {stockStr} | Exp: {formatDateLabel(b.expiryDate)}
                                </option>
                              );
                            })}
                          </select>
                        ) : (
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            background: 'rgba(20, 184, 166, 0.08)',
                            color: 'var(--brand-teal)',
                            padding: '0.35rem 0.6rem',
                            borderRadius: '5px',
                            border: '1px solid rgba(20, 184, 166, 0.2)',
                            fontFamily: 'monospace',
                            fontWeight: '700',
                            fontSize: '0.85rem',
                            whiteSpace: 'nowrap'
                          }}>
                            <span>{item.batchNumber}</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                              ({item.currentStock ?? medicine?.batches?.[0]?.currentStock ?? 0} {medicine && medicine.conversionFactor > 1 ? `(${Math.floor((item.currentStock || 0) / medicine.conversionFactor)} Str)` : 'units'})
                            </span>
                          </div>
                        )}
                      </td>

                      {/* STRI (Full Strips) */}
                      <td style={{ padding: '0.6rem 0.5rem' }}>
                        <input
                          ref={el => { stripsInputRefs.current[idx] = el; }}
                          type="number"
                          min="0"
                          placeholder="0"
                          value={item.strips === 0 ? '' : item.strips}
                          onFocus={e => e.target.select()}
                          onChange={e => {
                            const val = e.target.value;
                            updateLineItem(idx, { strips: val === '' ? 0 : Math.max(0, parseInt(val) || 0) });
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              medicineInputRef.current?.focus();
                            }
                          }}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '0.4rem 0.3rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center', fontWeight: '700' }}
                        />
                      </td>

                      {/* LOOSE TABS (Loose Units) */}
                      <td style={{ padding: '0.6rem 0.5rem' }}>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          title="Loose Tablets (e.g. 2 tabs)"
                          value={item.looseQty === 0 ? '' : item.looseQty}
                          onFocus={e => e.target.select()}
                          onChange={e => {
                            const val = e.target.value;
                            updateLineItem(idx, { looseQty: val === '' ? 0 : Math.max(0, parseInt(val) || 0) });
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              medicineInputRef.current?.focus();
                            }
                          }}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '0.4rem 0.3rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center', fontWeight: '700' }}
                        />
                      </td>

                      {/* MRP / Strip Price */}
                      <td style={{ padding: '0.6rem 0.5rem' }}>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={item.unitPrice === 0 ? '' : item.unitPrice}
                          onFocus={e => e.target.select()}
                          onChange={e => {
                            const val = e.target.value;
                            updateLineItem(idx, { unitPrice: val === '' ? 0 : Math.max(0, parseFloat(val) || 0) });
                          }}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '0.45rem 0.65rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'right', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}
                        />
                      </td>

                      {/* Discount % */}
                      <td style={{ padding: '0.6rem 0.5rem' }}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="0"
                          value={item.discountPercent === 0 ? '' : item.discountPercent}
                          onFocus={e => e.target.select()}
                          onChange={e => {
                            const val = e.target.value;
                            updateLineItem(idx, { discountPercent: val === '' ? 0 : Math.min(100, Math.max(0, parseFloat(val) || 0)) });
                          }}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '0.4rem 0.3rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center' }}
                        />
                      </td>

                      {/* GST % (Directly Editable per row) */}
                      <td style={{ padding: '0.6rem 0.4rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            placeholder="0"
                            value={item.gstRate === 0 ? '0' : item.gstRate}
                            onFocus={e => e.target.select()}
                            onChange={e => {
                              const val = e.target.value;
                              const newGst = val === '' ? 0 : Math.max(0, parseFloat(val) || 0);
                              updateLineItem(idx, { gstRate: newGst });
                            }}
                            style={{
                              width: '56px',
                              boxSizing: 'border-box',
                              padding: '0.35rem 0.2rem',
                              background: item.gstRate === 0 ? 'rgba(148, 163, 184, 0.12)' : 'rgba(20, 184, 166, 0.1)',
                              border: item.gstRate === 0 ? '1px dashed var(--border-color)' : '1px solid var(--brand-teal)',
                              borderRadius: '5px',
                              color: item.gstRate === 0 ? 'var(--text-secondary)' : 'var(--brand-teal)',
                              fontWeight: '700',
                              textAlign: 'center',
                              fontSize: '0.85rem'
                            }}
                            title="Edit GST % for this line item (Enter 0 for Non-GST/Exempt)"
                          />
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>%</span>
                        </div>
                      </td>

                      {/* Line Amount */}
                      <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontWeight: '800', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        ₹{item.totalAmount.toFixed(2)}
                      </td>

                      {/* Remove */}
                      <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                        <button
                          onClick={() => removeLineItem(idx)}
                          style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.3rem', borderRadius: '4px' }}
                          title="Remove item"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Split Bottom Multi-Pane HUD (Responsive) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.2rem', alignItems: 'stretch' }}>
        
        {/* Left HUD: Active Selected Line Item Details */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--brand-teal)', textTransform: 'uppercase', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Layers size={14} /> ACTIVE ROW HUD (ROW #{activeRowIndex + 1})
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.8rem', fontSize: '0.85rem' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Item : </span>
                <strong style={{ color: 'var(--text-primary)' }}>{activeRow?.medicineName || '—'}</strong>
                {activeRow?.genericName && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{activeRow.genericName}</div>}
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Batch : </span>
                <strong style={{ fontFamily: 'monospace' }}>{activeRow?.batchNumber || '—'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Expiry : </span>
                <strong>{activeRow ? formatDateLabel(activeRow.expiryDate) : '—'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Live Stock : </span>
                <strong style={{ color: (activeRow?.currentStock ?? 0) < 0 ? 'var(--accent-red)' : '#10b981' }}>
                  {activeRow?.currentStock ?? 0} units {(activeRow?.currentStock ?? 0) < 0 ? '(Negative)' : ''}
                </strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>M.R.P. : </span>
                <strong>₹{Number(activeRow?.mrp || 0).toFixed(2)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Line GST : </span>
                <strong style={{ color: (activeRow?.gstRate || 0) > 0 ? 'var(--brand-teal)' : 'var(--text-muted)' }}>
                  {activeRow?.gstRate ?? 0}% {activeRow?.gstRate === 0 ? '(Non-GST)' : ''}
                </strong>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px dashed var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Payment Mode:</span>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              {(['CASH', 'UPI', 'CARD', 'CREDIT'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setPaymentMode(mode);
                    if (mode === 'CREDIT') setPaidAmount('0');
                    else setPaidAmount(String(grandTotal));
                  }}
                  style={{
                    padding: '0.3rem 0.6rem',
                    borderRadius: '4px',
                    border: paymentMode === mode ? '1px solid var(--brand-teal)' : '1px solid var(--border-color)',
                    background: paymentMode === mode ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-secondary)',
                    color: paymentMode === mode ? 'var(--brand-teal)' : 'var(--text-primary)',
                    fontWeight: '700',
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right HUD: Financial Summary & Actions (Photo 3 Right Pane) */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.2rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>
            VALUE OF GOODS & TAXES
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
              <span>VALUE OF GOODS :</span>
              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>₹{valueOfGoods.toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-red)' }}>
              <span>
                DISCOUNT {billDiscountPct > 0 ? `(${billDiscountPct}%${grossTaxable > 500 && billDiscountPct === 10 ? ' Scheme' : ''})` : ''} :
              </span>
              <span style={{ fontWeight: '700' }}>- ₹{(totalItemDiscount + billDiscountAmt).toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
              <span>{totalGstAmount > 0 ? (isInterState ? 'IGST TAX :' : 'GST (CGST+SGST) :') : 'GST (0% / NON-GST) :'}</span>
              <span style={{ fontWeight: totalGstAmount > 0 ? '700' : 'normal', color: totalGstAmount > 0 ? 'var(--brand-teal)' : 'var(--text-muted)' }}>
                ₹{totalGstAmount.toFixed(2)}
              </span>
            </div>

            {roundOff !== 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                <span>ROUND OFF :</span>
                <span>₹{roundOff > 0 ? `+${roundOff.toFixed(2)}` : roundOff.toFixed(2)}</span>
              </div>
            )}

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: '0.6rem',
              marginTop: '0.3rem',
              borderTop: '2px solid var(--border-color)',
              fontSize: '1.2rem',
              fontWeight: '800',
              color: '#0f766e'
            }}>
              <span>BILL TOTAL :</span>
              <span>₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Paid Amount & Balance */}
          <div style={{ marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px dashed var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>PAID (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder={paymentMode === 'CREDIT' ? '0' : String(grandTotal.toFixed(0))}
                value={paidAmount}
                onFocus={e => e.target.select()}
                onChange={e => setPaidAmount(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontWeight: '700', fontSize: '0.9rem', textAlign: 'right' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>BALANCE DUE (₹)</label>
              <div style={{ padding: '0.45rem', background: balanceDue > 0 ? '#fee2e2' : '#dcfce7', border: '1px solid ' + (balanceDue > 0 ? '#fca5a5' : '#86efac'), borderRadius: '6px', fontWeight: '800', fontSize: '0.9rem', textAlign: 'right', color: balanceDue > 0 ? '#dc2626' : '#16a34a' }}>
                ₹{balanceDue.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Complete Sale Button */}
          <div style={{ marginTop: '1rem' }}>
            <button
              onClick={handleSaveInvoice}
              disabled={submitting || invoiceItems.length === 0}
              style={{
                width: '100%',
                padding: '0.85rem',
                background: invoiceItems.length === 0 ? '#94a3b8' : '#0f766e',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '800',
                fontSize: '1rem',
                cursor: (submitting || invoiceItems.length === 0) ? 'not-allowed' : 'pointer',
                opacity: (submitting || invoiceItems.length === 0) ? 0.6 : 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: invoiceItems.length > 0 ? '0 4px 16px rgba(15, 118, 110, 0.4)' : 'none',
                letterSpacing: '0.02em'
              }}
            >
              <Receipt size={18} />
              {submitting ? 'Generating Invoice...' : '⚡ COMPLETE SALE & PRINT (F2)'}
            </button>
          </div>
        </div>
      </div>

      {/* Printable Tax / Retail Invoice Modal */}
      {showPrintModal && createdInvoice && (
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
            background: '#ffffff',
            color: '#111827',
            width: '100%',
            maxWidth: '800px',
            maxHeight: '90vh',
            borderRadius: '12px',
            overflowY: 'auto',
            padding: '2rem',
            position: 'relative'
          }}>
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem' }}>
              <button
                onClick={handlePrint}
                style={{
                  padding: '0.6rem 1.2rem',
                  background: '#0f766e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <Printer size={16} /> {Number(createdInvoice.totalTax || 0) > 0 ? 'Print Tax Invoice' : 'Print Retail Bill'}
              </button>
              <button
                onClick={() => {
                  setShowPrintModal(false);
                  onBack();
                }}
                style={{
                  padding: '0.6rem 1rem',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Close & Next Bill
              </button>
            </div>

            <div id="printable-tax-invoice" style={{ fontFamily: 'monospace, sans-serif' }}>
              <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '0.8rem', marginBottom: '1rem' }}>
                <h2 style={{ margin: '0 0 0.2rem 0', fontSize: '1.4rem', fontWeight: 'bold' }}>{createdInvoice.company?.name || activeCompany?.name}</h2>
                <div style={{ fontSize: '0.85rem', fontWeight: '700' }}>
                  {Number(createdInvoice.totalTax || 0) > 0 ? 'TAX INVOICE (PHARMA RETAIL / B2B)' : 'RETAIL BILL / CASH MEMO (NON-GST)'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#4b5563' }}>
                  {Number(createdInvoice.totalTax || 0) > 0 ? 'Drug License 20B/21B Compliant' : 'Retail Pharma Cash Memo / Non-GST Supply'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem', marginBottom: '1rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.8rem' }}>
                <div>
                  <div><strong>Bill No:</strong> {createdInvoice.invoiceNumber}</div>
                  <div><strong>Date:</strong> {formatDateLabel(createdInvoice.invoiceDate)}</div>
                  <div><strong>Payment Mode:</strong> {createdInvoice.paymentMode}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div><strong>Patient/Customer:</strong> {createdInvoice.customerName}</div>
                  {createdInvoice.customerPhone && <div><strong>Mobile:</strong> {createdInvoice.customerPhone}</div>}
                  {createdInvoice.doctorName && <div><strong>Doctor:</strong> {createdInvoice.doctorName.startsWith('Dr') ? createdInvoice.doctorName : `Dr. ${createdInvoice.doctorName}`}</div>}
                  {createdInvoice.doctorRegNo && <div><strong>Reg No:</strong> {createdInvoice.doctorRegNo}</div>}
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginBottom: '1rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #000', textAlign: 'left' }}>
                    <th style={{ padding: '0.4rem 0' }}>#</th>
                    <th style={{ padding: '0.4rem 0' }}>Description</th>
                    <th style={{ padding: '0.4rem 0' }}>Batch</th>
                    <th style={{ padding: '0.4rem 0' }}>Exp</th>
                    <th style={{ padding: '0.4rem 0', textAlign: 'center' }}>Qty</th>
                    <th style={{ padding: '0.4rem 0', textAlign: 'right' }}>Rate</th>
                    <th style={{ padding: '0.4rem 0', textAlign: 'center' }}>GST%</th>
                    <th style={{ padding: '0.4rem 0', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {createdInvoice.items?.map((item: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px dashed #e5e7eb' }}>
                      <td style={{ padding: '0.4rem 0' }}>{i + 1}</td>
                      <td style={{ padding: '0.4rem 0' }}>{item.medicineName}</td>
                      <td style={{ padding: '0.4rem 0' }}>{item.batchNumber}</td>
                      <td style={{ padding: '0.4rem 0' }}>{formatDateLabel(item.expiryDate)}</td>
                      <td style={{ padding: '0.4rem 0', textAlign: 'center' }}>
                        {item.strips > 0 && item.looseQty > 0
                          ? `${item.strips} Str + ${item.looseQty} Tab`
                          : item.strips > 0
                          ? `${item.strips} Strip`
                          : item.looseQty > 0
                          ? `${item.looseQty} Tab`
                          : item.quantity}
                      </td>
                      <td style={{ padding: '0.4rem 0', textAlign: 'right' }}>₹{Number(item.unitPrice).toFixed(2)}</td>
                      <td style={{ padding: '0.4rem 0', textAlign: 'center' }}>{Number(item.gstRate || 0)}%</td>
                      <td style={{ padding: '0.4rem 0', textAlign: 'right', fontWeight: 'bold' }}>₹{Number(item.totalAmount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #000', paddingTop: '0.6rem', fontSize: '0.85rem' }}>
                <div style={{ width: '260px' }}>
                  {Number(createdInvoice.billDiscountAmt || 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem', color: '#dc2626' }}>
                      <span>Discount ({Number(createdInvoice.billDiscountPct || 0)}%{Number(createdInvoice.billDiscountPct || 0) === 10 ? ' Scheme' : ''}):</span>
                      <span>-₹{Number(createdInvoice.billDiscountAmt).toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span>Taxable Amount:</span>
                    <span>₹{Number(createdInvoice.taxableAmount).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span>{Number(createdInvoice.totalTax || 0) > 0 ? 'Total GST:' : 'GST (0% / Exempt):'}</span>
                    <span>₹{Number(createdInvoice.totalTax || 0).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1rem', borderTop: '1px solid #000', paddingTop: '0.4rem' }}>
                    <span>Grand Total:</span>
                    <span>₹{Number(createdInvoice.grandTotal).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a', marginTop: '0.2rem' }}>
                    <span>Amount Paid:</span>
                    <span>₹{Number(createdInvoice.paidAmount).toFixed(2)}</span>
                  </div>
                  {Number(createdInvoice.balanceAmount) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626', fontWeight: 'bold' }}>
                      <span>Balance Due:</span>
                      <span>₹{Number(createdInvoice.balanceAmount).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

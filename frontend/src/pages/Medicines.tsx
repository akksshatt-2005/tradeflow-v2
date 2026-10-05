import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import * as XLSX from 'xlsx';
import book1Medicines from '../data/book1Medicines.json';
import {
  Pill,
  Search,
  Plus,
  Layers,
  AlertTriangle,
  CheckCircle2,
  X,
  Package,
  Calendar,
  Building2,
  FileText,
  Edit2,
  Trash2,
  UploadCloud,
  FileSpreadsheet,
  Sparkles,
  Download
} from 'lucide-react';

interface BatchInfo {
  id: string;
  batchNumber: string;
  expiryDate: string;
  mrp: number;
  ptr: number;
  pts: number;
  currentStock: number;
}

interface MedicineItem {
  id: string;
  sku: string;
  name: string;
  genericName?: string | null;
  manufacturer?: string | null;
  hsnCode: string;
  gstRate: number;
  unit: string;
  conversionFactor: number;
  minStockLevel: number;
  totalStock: number;
  activeBatchesCount: number;
  batches: BatchInfo[];
  createdAt: string;
}

export default function Medicines() {
  const { activeCompany } = useAuth();
  const [items, setItems] = useState<MedicineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedItemForBatch, setSelectedItemForBatch] = useState<MedicineItem | null>(null);
  const [viewingItemBatches, setViewingItemBatches] = useState<MedicineItem | null>(null);

  // Form State: Add Medicine
  const [newItemName, setNewItemName] = useState('');
  const [newItemSku, setNewItemSku] = useState('');
  const [newItemGeneric, setNewItemGeneric] = useState('');
  const [newItemManufacturer, setNewItemManufacturer] = useState('');
  const [newItemHsn, setNewItemHsn] = useState('3004');
  const [newItemGst, setNewItemGst] = useState('5');
  const [newItemUnit, setNewItemUnit] = useState('STRIP');
  const [newItemConversion, setNewItemConversion] = useState('10');
  const [newItemMinStock, setNewItemMinStock] = useState('10');
  const [newItemStrips, setNewItemStrips] = useState('');
  const [newItemLoose, setNewItemLoose] = useState('');
  const [newItemBatchNumber, setNewItemBatchNumber] = useState('');
  const [newItemMrp, setNewItemMrp] = useState('');
  const [newItemPtr, setNewItemPtr] = useState('');
  const [submittingItem, setSubmittingItem] = useState(false);

  // Form State: Add Batch
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('12');
  const [expiryYear, setExpiryYear] = useState(new Date().getFullYear() + 2 + '');
  const [batchMrp, setBatchMrp] = useState('');
  const [batchPtr, setBatchPtr] = useState('');
  const [batchOpeningStock, setBatchOpeningStock] = useState('');
  const [batchOpeningStrips, setBatchOpeningStrips] = useState('');
  const [batchOpeningLoose, setBatchOpeningLoose] = useState('');
  const [submittingBatch, setSubmittingBatch] = useState(false);

  // Edit Batch State
  const [editingBatchInfo, setEditingBatchInfo] = useState<{ item: MedicineItem; batch: BatchInfo } | null>(null);
  const [editBatchNumber, setEditBatchNumber] = useState('');
  const [editBatchExpiryMonth, setEditBatchExpiryMonth] = useState('12');
  const [editBatchExpiryYear, setEditBatchExpiryYear] = useState(new Date().getFullYear() + 2 + '');
  const [editBatchMrp, setEditBatchMrp] = useState('');
  const [editBatchPtr, setEditBatchPtr] = useState('');
  const [editBatchStrips, setEditBatchStrips] = useState('');
  const [editBatchLoose, setEditBatchLoose] = useState('');
  const [submittingBatchEdit, setSubmittingBatchEdit] = useState(false);

  // Edit Medicine State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MedicineItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editGeneric, setEditGeneric] = useState('');
  const [editManufacturer, setEditManufacturer] = useState('');
  const [editHsn, setEditHsn] = useState('3004');
  const [editGst, setEditGst] = useState('5');
  const [editUnit, setEditUnit] = useState('STRIP');
  const [editConversion, setEditConversion] = useState('10');
  const [editMinStock, setEditMinStock] = useState('10');
  const [editStockStrips, setEditStockStrips] = useState('');
  const [editStockLoose, setEditStockLoose] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Bulk Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [previewItems, setPreviewItems] = useState<any[]>([]);
  const [importSearch, setImportSearch] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleExportMedicines = () => {
    if (items.length === 0) {
      alert('No medicines available to export.');
      return;
    }
    const data = items.map((item, idx) => ({
      'S.No': idx + 1,
      'SKU / Code': item.sku,
      'Medicine Name': item.name,
      'Generic Composition': item.genericName || '',
      'Manufacturer': item.manufacturer || '',
      'HSN Code': item.hsnCode,
      'GST Rate (%)': item.gstRate,
      'Packaging': item.conversionFactor > 1 ? `1*${item.conversionFactor}` : '1*1',
      'Base Unit': item.unit,
      'Tablets per Pack': item.conversionFactor,
      'In Stock (Packs)': item.totalStock,
      'Active Batches': item.activeBatchesCount,
      'Min Alert Level': item.minStockLevel
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Medicine Catalog');
    const compName = (activeCompany?.name || 'Catalog').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(workbook, `Medicines_${compName}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportTemplate = () => {
    const templateData = [
      {
        'Item Name': 'PARACETAMOL 650MG',
        'Description': '1*10 TAB',
        'Company': 'GSK PHARMA',
        'HSN': '3004',
        'GST': 5
      },
      {
        'Item Name': 'AMOXICILLIN 500MG CAP',
        'Description': '1*10',
        'Company': 'CIPLA',
        'HSN': '3004',
        'GST': 5
      },
      {
        'Item Name': 'COUGH SYRUP 100ML',
        'Description': '1*1 BOTTLE',
        'Company': 'DABUR',
        'HSN': '3004',
        'GST': 5
      }
    ];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Medicine_Template');
    XLSX.writeFile(workbook, `Medicine_Import_Template.xlsx`);
  };

  const handleBulkImport = async (itemsToImport = previewItems) => {
    if (!activeCompany) return;
    if (!itemsToImport || itemsToImport.length === 0) {
      setError('No valid medicine items found to import.');
      return;
    }

    try {
      setImporting(true);
      setError(null);
      setImportProgress(10);

      // Send in chunks of 150
      const chunkSize = 150;
      let totalImported = 0;

      for (let i = 0; i < itemsToImport.length; i += chunkSize) {
        const chunk = itemsToImport.slice(i, i + chunkSize);
        const res = await api.post<{ success: boolean; importedCount: number }>(
          '/api/items/bulk-import',
          { items: chunk },
          { companyId: activeCompany.id }
        );
        totalImported += res.importedCount || chunk.length;
        setImportProgress(Math.min(95, Math.round(((i + chunk.length) / itemsToImport.length) * 100)));
      }

      setImportProgress(100);
      setSuccessMsg(`Successfully imported ${totalImported} medicines into catalog!`);
      setTimeout(() => setSuccessMsg(null), 5000);
      setShowImportModal(false);
      await fetchItems();
    } catch (err: any) {
      console.error('Failed to bulk import medicines:', err);
      setError(err.response?.data?.error || err.message || 'Failed to import medicines');
    } finally {
      setImporting(false);
      setImportProgress(0);
    }
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
        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const parsed: any[] = [];
        const seenNames = new Set<string>();

        for (let i = 0; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!row || row.length === 0) continue;

          const cell0 = String(row[0] || '').trim();
          const cell1 = String(row[1] || '').trim();
          const cell2 = String(row[2] || '').trim();
          const cell3 = String(row[3] || '').trim();

          if (cell0.toLowerCase().includes('sno') || cell1.toLowerCase().includes('item') || cell1.toLowerCase().includes('name')) {
            continue;
          }

          let name = cell1;
          let desc = cell2;
          let company = cell3;

          if (!name && desc) {
            name = desc;
            desc = '';
          }

          if (!name || name.length < 2) continue;

          let pack = '1*10';
          const packMatch = (desc + ' ' + name).match(/(\d+[\*xX]\d+)/);
          if (packMatch) {
            pack = packMatch[1].replace('X', '*').replace('x', '*');
          }

          const descClean = desc.replace(/\s*\d+[\*xX]\d+\s*/, ' ').trim();
          const fullName = [name, descClean].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

          if (seenNames.has(fullName.toLowerCase())) continue;
          seenNames.add(fullName.toLowerCase());

          let factor = 10;
          const mult = pack.match(/(\d+)\*(\d+)/);
          if (mult) factor = parseInt(mult[2]) || 10;

          let unit = 'STRIP';
          if (fullName.toUpperCase().includes('SYRUP') || fullName.toUpperCase().includes('SUSP') || factor === 1) {
            unit = 'BOTTLE';
          } else if (fullName.toUpperCase().includes('INJ') || fullName.toUpperCase().includes('VIAL')) {
            unit = 'VIAL';
          }

          parsed.push({
            name: fullName,
            manufacturer: company || null,
            pack,
            unit,
            conversionFactor: factor,
            hsnCode: '3004',
            gstRate: 5.0
          });
        }

        if (parsed.length > 0) {
          setPreviewItems(parsed);
          setSuccessMsg(`Loaded ${parsed.length} medicines from file. Click Confirm to import!`);
          setTimeout(() => setSuccessMsg(null), 4000);
        } else {
          setError('Could not extract any valid medicine rows from this file.');
        }
      } catch (err: any) {
        console.error('Failed to parse file:', err);
        setError('Failed to read Excel/CSV file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  useEffect(() => {
    fetchItems();
  }, [activeCompany?.id, search]);

  const fetchItems = async () => {
    if (!activeCompany) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<{ items: MedicineItem[] }>(`/api/items?search=${encodeURIComponent(search)}&limit=2000`, {
        companyId: activeCompany.id
      });
      setItems(res.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load medicines');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany) return;

    try {
      setSubmittingItem(true);
      setError(null);

      const factor = parseInt(newItemConversion) || 1;
      const totalUnits = (parseInt(newItemStrips) || 0) * factor + (parseInt(newItemLoose) || 0);

      await api.post('/api/items', {
        name: newItemName,
        sku: newItemSku,
        genericName: newItemGeneric,
        manufacturer: newItemManufacturer,
        hsnCode: newItemHsn,
        gstRate: parseFloat(newItemGst),
        unit: newItemUnit,
        conversionFactor: factor,
        minStockLevel: parseInt(newItemMinStock) || 0,
        initialStock: totalUnits,
        initialBatchNumber: newItemBatchNumber.trim() || undefined,
        initialMrp: parseFloat(newItemMrp) || undefined,
        initialPtr: parseFloat(newItemPtr) || undefined,
        initialPts: parseFloat(newItemMrp) || undefined
      }, {
        companyId: activeCompany.id
      });

      setShowAddModal(false);
      // Reset form
      setNewItemName('');
      setNewItemSku('');
      setNewItemGeneric('');
      setNewItemManufacturer('');
      setNewItemHsn('3004');
      setNewItemGst('5');
      setNewItemUnit('STRIP');
      setNewItemConversion('10');
      setNewItemMinStock('10');
      setNewItemStrips('');
      setNewItemLoose('');
      setNewItemBatchNumber('');
      setNewItemMrp('');
      setNewItemPtr('');

      await fetchItems();
    } catch (err: any) {
      setError(err.message || 'Failed to create medicine');
    } finally {
      setSubmittingItem(false);
    }
  };

  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany || !selectedItemForBatch) return;

    try {
      setSubmittingBatch(true);
      setError(null);

      // Create valid end-of-month expiry date
      const year = parseInt(expiryYear);
      const month = parseInt(expiryMonth);
      const lastDay = new Date(year, month, 0).getDate();
      const expiryDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const factor = selectedItemForBatch.conversionFactor || 1;
      let totalOpeningUnits = 0;
      if (factor > 1) {
        const strips = parseInt(batchOpeningStrips) || 0;
        const loose = parseInt(batchOpeningLoose) || 0;
        totalOpeningUnits = (strips * factor) + loose;
      } else {
        totalOpeningUnits = parseInt(batchOpeningStock) || 0;
      }

      await api.post(`/api/items/${selectedItemForBatch.id}/batches`, {
        batchNumber,
        expiryDate: expiryDateStr,
        mrp: parseFloat(batchMrp) || 0,
        ptr: parseFloat(batchPtr) || 0,
        pts: parseFloat(batchMrp) || 0,
        openingStock: totalOpeningUnits
      }, {
        companyId: activeCompany.id
      });

      setShowBatchModal(false);
      setSelectedItemForBatch(null);
      setBatchNumber('');
      setBatchMrp('');
      setBatchPtr('');
      setBatchOpeningStock('');
      setBatchOpeningStrips('');
      setBatchOpeningLoose('');

      await fetchItems();
    } catch (err: any) {
      setError(err.message || 'Failed to add batch');
    } finally {
      setSubmittingBatch(false);
    }
  };

  const handleOpenEditBatch = (item: MedicineItem, batch: BatchInfo) => {
    setEditingBatchInfo({ item, batch });
    setEditBatchNumber(batch.batchNumber);
    const exp = new Date(batch.expiryDate);
    if (!isNaN(exp.getTime())) {
      setEditBatchExpiryMonth(String(exp.getMonth() + 1));
      setEditBatchExpiryYear(String(exp.getFullYear()));
    } else {
      setEditBatchExpiryMonth('12');
      setEditBatchExpiryYear(String(new Date().getFullYear() + 2));
    }
    setEditBatchMrp(String(batch.mrp || ''));
    setEditBatchPtr(String(batch.ptr || ''));
    const factor = item.conversionFactor || 1;
    setEditBatchStrips(String(Math.floor(batch.currentStock / factor)));
    setEditBatchLoose(String(batch.currentStock % factor));
  };

  const handleUpdateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany || !editingBatchInfo) return;

    try {
      setSubmittingBatchEdit(true);
      setError(null);

      const year = parseInt(editBatchExpiryYear);
      const month = parseInt(editBatchExpiryMonth);
      const lastDay = new Date(year, month, 0).getDate();
      const expiryDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const factor = editingBatchInfo.item.conversionFactor || 1;
      const totalUnits = (parseInt(editBatchStrips) || 0) * factor + (parseInt(editBatchLoose) || 0);

      await api.put(`/api/items/${editingBatchInfo.item.id}/batches/${editingBatchInfo.batch.id}`, {
        batchNumber: editBatchNumber.trim(),
        expiryDate: expiryDateStr,
        mrp: parseFloat(editBatchMrp) || 0,
        ptr: parseFloat(editBatchPtr) || 0,
        pts: parseFloat(editBatchMrp) || 0,
        currentStock: totalUnits
      }, {
        companyId: activeCompany.id
      });

      setEditingBatchInfo(null);
      const res = await api.get<{ items: MedicineItem[] }>(`/api/items?search=${encodeURIComponent(search)}&limit=2000`, {
        companyId: activeCompany.id
      });
      const freshItems = res.items || [];
      setItems(freshItems);
      if (viewingItemBatches) {
        const updatedViewing = freshItems.find(i => i.id === viewingItemBatches.id);
        if (updatedViewing) setViewingItemBatches(updatedViewing);
      }
    } catch (err: any) {
      console.error('Failed to update batch:', err);
      setError(err.message || 'Failed to update batch');
    } finally {
      setSubmittingBatchEdit(false);
    }
  };

  const handleDeleteBatch = async (item: MedicineItem, batch: BatchInfo) => {
    if (!activeCompany) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete batch "${batch.batchNumber}" for ${item.name}?`
    );
    if (!confirmDelete) return;

    try {
      setError(null);
      await api.delete(`/api/items/${item.id}/batches/${batch.id}`, {
        companyId: activeCompany.id
      });

      const res = await api.get<{ items: MedicineItem[] }>(`/api/items?search=${encodeURIComponent(search)}&limit=2000`, {
        companyId: activeCompany.id
      });
      const freshItems = res.items || [];
      setItems(freshItems);
      if (viewingItemBatches) {
        const updatedViewing = freshItems.find(i => i.id === viewingItemBatches.id);
        if (updatedViewing) setViewingItemBatches(updatedViewing);
      }
    } catch (err: any) {
      console.error('Failed to delete batch:', err);
      setError(err.message || 'Failed to delete batch. It might be used in existing invoices.');
    }
  };

  const handleOpenEditModal = (item: MedicineItem) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditGeneric(item.genericName || '');
    setEditManufacturer(item.manufacturer || '');
    setEditHsn(item.hsnCode || '3004');
    setEditGst(String(item.gstRate ?? 5));
    setEditUnit(item.unit || 'STRIP');
    const factor = item.conversionFactor || 1;
    setEditConversion(String(factor));
    setEditMinStock(String(item.minStockLevel || 10));
    setEditStockStrips(String(Math.floor(item.totalStock / factor)));
    setEditStockLoose(String(item.totalStock % factor));
    setShowEditModal(true);
  };

  const handleUpdateMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany || !editingItem) return;

    try {
      setSubmittingEdit(true);
      setError(null);
      const factor = parseInt(editConversion) || 1;
      const adjustedUnits = (parseInt(editStockStrips) || 0) * factor + (parseInt(editStockLoose) || 0);

      await api.put(`/api/items/${editingItem.id}`, {
        name: editName.trim(),
        genericName: editGeneric.trim() || null,
        manufacturer: editManufacturer.trim() || null,
        hsnCode: editHsn.trim(),
        gstRate: parseFloat(editGst),
        unit: editUnit.trim().toUpperCase(),
        conversionFactor: factor,
        minStockLevel: parseInt(editMinStock) || 0,
        adjustedStock: adjustedUnits
      }, {
        companyId: activeCompany.id
      });
      setShowEditModal(false);
      setEditingItem(null);
      await fetchItems();
    } catch (err: any) {
      console.error('Failed to update medicine:', err);
      setError(err.message || 'Failed to update medicine');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleDeleteMedicine = async (item: MedicineItem) => {
    if (!activeCompany) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete medicine "${item.name}" (SKU: ${item.sku})?`
    );
    if (!confirmDelete) return;

    try {
      setLoading(true);
      setError(null);
      await api.delete(`/api/items/${item.id}`, {
        companyId: activeCompany.id
      });
      await fetchItems();
    } catch (err: any) {
      console.error('Failed to delete medicine:', err);
      setError(err.message || 'Failed to delete medicine. Please check if invoices or purchase bills use this medicine.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
            Medicine Master & Product Catalog
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Manage medicine formulas, packaging units, GST rates, and active batch inventories.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleExportMedicines}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#f8fafc',
              color: '#334155',
              borderColor: '#cbd5e1',
              fontWeight: '600'
            }}
            title="Export full catalog to Excel (.xlsx)"
          >
            <Download size={15} />
            Export Excel
          </button>
          <button
            onClick={() => {
              setPreviewItems([]);
              setShowImportModal(true);
            }}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#f0fdf4',
              color: '#15803d',
              borderColor: '#bbf7d0',
              fontWeight: '600'
            }}
            title="Import medicines from Excel or CSV"
          >
            <UploadCloud size={15} />
            Import Excel
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} />
            Add Medicine
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
          fontWeight: '500'
        }}>
          <CheckCircle2 size={18} color="#16a34a" />
          {successMsg}
        </div>
      )}

      {/* Search & Filter Bar */}
      <div style={{
        background: '#ffffff',
        padding: '12px 16px',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
      }}>
        <div className="search-box" style={{ maxWidth: '480px' }}>
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by brand name, generic composition, SKU, or manufacturer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ fontSize: '13px', color: '#64748b', whiteSpace: 'nowrap' }}>
          Total Medicines: <strong style={{ color: '#0f172a' }}>{items.length}</strong>
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

      {/* Items Table */}
      <div style={{
        background: 'var(--surface)',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>SKU / CODE</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>MEDICINE & COMPOSITION</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>MANUFACTURER</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>HSN / GST</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>PACKING</th>
              <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>IN STOCK</th>
              <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'center' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading medicines...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Package size={36} style={{ color: '#cbd5e1', marginBottom: '8px' }} />
                  <div>No medicines found in catalog.</div>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="btn btn-secondary"
                    style={{ marginTop: '12px', fontSize: '12px' }}
                  >
                    + Add Your First Medicine
                  </button>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                >
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--brand-primary)' }}>
                    {item.sku}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.name}</div>
                    {item.genericName && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {item.genericName}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-main)' }}>
                    {item.manufacturer || '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div>HSN: {item.hsnCode}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>GST: {item.gstRate}%</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      background: '#f1f5f9',
                      color: '#334155',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}>
                      {item.conversionFactor > 1 
                        ? `1*${item.conversionFactor} (${item.conversionFactor} Tabs/Strip)` 
                        : `1*1 (1 ${item.unit || 'Unit'})`}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{
                      fontWeight: 700,
                      color: item.totalStock <= item.minStockLevel ? 'var(--status-danger)' : 'var(--status-success)',
                      fontSize: '13px'
                    }}>
                      {item.conversionFactor > 1 ? (
                        (() => {
                          const isNeg = item.totalStock < 0;
                          const abs = Math.abs(item.totalStock);
                          const str = Math.floor(abs / item.conversionFactor);
                          const tab = abs % item.conversionFactor;
                          const sign = isNeg ? '-' : '';
                          let txt = '';
                          if (str > 0 && tab > 0) txt = `${sign}${str} STRIPS + ${tab} TABS`;
                          else if (str > 0) txt = `${sign}${str} STRIPS`;
                          else txt = `${sign}${tab} TABS`;
                          return isNeg ? `${txt} (Negative)` : txt;
                        })()
                      ) : (
                        `${item.totalStock} ${item.unit}s${item.totalStock < 0 ? ' (Negative)' : ''}`
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {item.activeBatchesCount} active batch{item.activeBatchesCount !== 1 ? 'es' : ''}
                      {item.conversionFactor > 1 && ` • (${item.totalStock} Total Tabs)`}
                    </div>
                  </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '5px', alignItems: 'center' }}>
                        <button
                          onClick={() => {
                            setSelectedItemForBatch(item);
                            setShowBatchModal(true);
                          }}
                          className="btn btn-secondary"
                          style={{ padding: '4px 7px', fontSize: '11px' }}
                          title="Add Batch / Opening Stock"
                        >
                          + Batch
                        </button>
                        <button
                          onClick={() => setViewingItemBatches(item)}
                          className="btn btn-secondary"
                          style={{ padding: '4px 7px', fontSize: '11px' }}
                          title="View Batches"
                        >
                          <Layers size={13} />
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(item)}
                          className="btn btn-secondary"
                          style={{ padding: '4px 7px', fontSize: '11px', color: '#0284c7' }}
                          title="Edit Medicine Details"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteMedicine(item)}
                          className="btn"
                          style={{
                            padding: '4px 7px',
                            fontSize: '11px',
                            background: '#fef2f2',
                            color: '#b91c1c',
                            border: '1px solid #fecaca',
                            cursor: 'pointer'
                          }}
                          title="Delete Medicine"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Add Medicine */}
      {showAddModal && (
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
            maxWidth: '540px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Pill size={18} color="var(--brand-primary)" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Add New Medicine to Catalog</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateMedicine} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="label">Brand / Medicine Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Augmentin 625 Duo Tablet"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="label">SKU / Item Code (Optional)</label>
                  <input
                    type="text"
                    placeholder="Auto-generated if empty"
                    value={newItemSku}
                    onChange={(e) => setNewItemSku(e.target.value)}
                    className="input"
                  />
                </div>
                <div className="form-group">
                  <label className="label">Manufacturer</label>
                  <input
                    type="text"
                    placeholder="e.g. GSK / Cipla"
                    value={newItemManufacturer}
                    onChange={(e) => setNewItemManufacturer(e.target.value)}
                    className="input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="label">Generic Composition / Salt</label>
                <input
                  type="text"
                  placeholder="e.g. Amoxycillin (500mg) + Clavulanic Acid (125mg)"
                  value={newItemGeneric}
                  onChange={(e) => setNewItemGeneric(e.target.value)}
                  className="input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="label">HSN Code</label>
                  <input
                    type="text"
                    required
                    value={newItemHsn}
                    onChange={(e) => setNewItemHsn(e.target.value)}
                    className="input"
                  />
                </div>
                <div className="form-group">
                  <label className="label">GST Slab</label>
                  <select
                    value={newItemGst}
                    onChange={(e) => setNewItemGst(e.target.value)}
                    className="input"
                  >
                    <option value="5">5% GST (Default Standard)</option>
                    <option value="0">0% (Exempt)</option>
                    <option value="12">12% GST</option>
                    <option value="18">18% GST</option>
                    <option value="28">28% GST</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Pack Type</label>
                  <select
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value)}
                    className="input"
                  >
                    <option value="STRIP">STRIP</option>
                    <option value="BOTTLE">BOTTLE / SYRUP</option>
                    <option value="VIAL">VIAL / INJECTION</option>
                    <option value="TUBE">TUBE / OINTMENT</option>
                    <option value="BOX">BOX</option>
                    <option value="TAB">TABLET (Loose)</option>
                  </select>
                </div>
              </div>

              {/* Strip Packaging & Conversion Size */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className="label" style={{ margin: 0, fontWeight: 700, color: '#1e293b' }}>
                    Strip Size / Tablets per Strip (1*X)
                  </label>
                  <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 600 }}>
                    Current: 1*{newItemConversion} ({newItemConversion} {newItemUnit === 'BOTTLE' ? 'Bottle' : 'Tabs'} / Pack)
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {[
                    { label: '1*10 (10 Tabs)', val: '10', unit: 'STRIP' },
                    { label: '1*15 (15 Caps)', val: '15', unit: 'STRIP' },
                    { label: '1*4 (4 Tabs)', val: '4', unit: 'STRIP' },
                    { label: '1*5 (5 Tabs)', val: '5', unit: 'STRIP' },
                    { label: '1*6', val: '6', unit: 'STRIP' },
                    { label: '1*20', val: '20', unit: 'STRIP' },
                    { label: '1*1 (Bottle/Tube)', val: '1', unit: 'BOTTLE' }
                  ].map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setNewItemConversion(preset.val);
                        if (preset.unit) setNewItemUnit(preset.unit);
                      }}
                      style={{
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontWeight: newItemConversion === preset.val ? '700' : '500',
                        borderRadius: '4px',
                        border: '1px solid',
                        borderColor: newItemConversion === preset.val ? '#0284c7' : '#cbd5e1',
                        background: newItemConversion === preset.val ? '#e0f2fe' : '#ffffff',
                        color: newItemConversion === preset.val ? '#0369a1' : '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="label" style={{ fontSize: '11px' }}>Custom Tablets / Units per Strip</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 10"
                      value={newItemConversion}
                      onChange={(e) => setNewItemConversion(e.target.value)}
                      className="input"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="label" style={{ fontSize: '11px' }}>Min Alert Stock Level</label>
                    <input
                      type="number"
                      min="0"
                      value={newItemMinStock}
                      onChange={(e) => setNewItemMinStock(e.target.value)}
                      className="input"
                    />
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                  💡 <em>e.g. <strong>1*10</strong> means 1 strip contains 10 tablets. For bottles/syrups, select <strong>1*1</strong>.</em>
                </div>
              </div>

              {/* Optional Initial Opening Stock */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label className="label" style={{ margin: 0, fontWeight: 700, color: '#1e293b' }}>
                    Initial Stock (Optional - Strips + Loose Tablets)
                  </label>
                  <span style={{ fontSize: '11.5px', color: '#0284c7', fontWeight: 600 }}>
                    Total: {((parseInt(newItemStrips) || 0) * (parseInt(newItemConversion) || 1)) + (parseInt(newItemLoose) || 0)} Tablets
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="label" style={{ fontSize: '11px' }}>Full Strips ({newItemUnit}s)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 10"
                      value={newItemStrips}
                      onChange={(e) => setNewItemStrips(e.target.value)}
                      className="input"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="label" style={{ fontSize: '11px' }}>Loose Tablets (TABs)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 2"
                      value={newItemLoose}
                      onChange={(e) => setNewItemLoose(e.target.value)}
                      className="input"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '10px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="label" style={{ fontSize: '11px' }}>Batch No</label>
                    <input
                      type="text"
                      placeholder="e.g. BATCH-01"
                      value={newItemBatchNumber}
                      onChange={(e) => setNewItemBatchNumber(e.target.value)}
                      className="input"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="label" style={{ fontSize: '11px' }}>MRP (₹ / Strip)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newItemMrp}
                      onChange={(e) => setNewItemMrp(e.target.value)}
                      className="input"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="label" style={{ fontSize: '11px' }}>Purchase Rate (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newItemPtr}
                      onChange={(e) => setNewItemPtr(e.target.value)}
                      className="input"
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingItem}
                  className="btn btn-primary"
                >
                  {submittingItem ? 'Saving Medicine...' : 'Save Medicine'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Batch / Opening Stock */}
      {showBatchModal && selectedItemForBatch && (
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
            maxWidth: '500px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Add Batch & Stock</h3>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {selectedItemForBatch.name} ({selectedItemForBatch.sku})
                </div>
              </div>
              <button
                onClick={() => setShowBatchModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddBatch} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="label">Batch Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BTX-7801"
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value.toUpperCase())}
                    className="input"
                    style={{ textTransform: 'uppercase', fontFamily: 'monospace', fontWeight: 600 }}
                  />
                </div>

                <div className="form-group">
                  <label className="label">Expiry (MM / YYYY) *</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <select
                      value={expiryMonth}
                      onChange={(e) => setExpiryMonth(e.target.value)}
                      className="input"
                      style={{ flex: 1 }}
                    >
                      {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <select
                      value={expiryYear}
                      onChange={(e) => setExpiryYear(e.target.value)}
                      className="input"
                      style={{ flex: 1.2 }}
                    >
                      {Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() + i)).map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="label">MRP (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={batchMrp}
                    onChange={(e) => setBatchMrp(e.target.value)}
                    className="input"
                  />
                </div>
                <div className="form-group">
                  <label className="label">Purchase Rate (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={batchPtr}
                    onChange={(e) => setBatchPtr(e.target.value)}
                    className="input"
                  />
                </div>
              </div>

              {selectedItemForBatch.conversionFactor > 1 ? (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                  <label className="label" style={{ fontWeight: 700, color: '#1e293b', marginBottom: '8px', display: 'block' }}>
                    Opening Stock (Strips + Loose Tablets)
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="label" style={{ fontSize: '11.5px' }}>Full Strips ({selectedItemForBatch.unit}s)</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="e.g. 10"
                        value={batchOpeningStrips}
                        onChange={(e) => setBatchOpeningStrips(e.target.value)}
                        className="input"
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="label" style={{ fontSize: '11.5px' }}>Loose Tablets (TABs)</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="e.g. 2"
                        value={batchOpeningLoose}
                        onChange={(e) => setBatchOpeningLoose(e.target.value)}
                        className="input"
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#0284c7', fontWeight: 600, marginTop: '8px' }}>
                    Total Units to Inward: {((parseInt(batchOpeningStrips) || 0) * selectedItemForBatch.conversionFactor) + (parseInt(batchOpeningLoose) || 0)} Tablets ({parseInt(batchOpeningStrips) || 0} Strips + {parseInt(batchOpeningLoose) || 0} Tabs)
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <label className="label">Opening Stock ({selectedItemForBatch.unit}s)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={batchOpeningStock}
                    onChange={(e) => setBatchOpeningStock(e.target.value)}
                    className="input"
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingBatch}
                  className="btn btn-primary"
                >
                  {submittingBatch ? 'Adding Batch...' : 'Add Batch & Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Batches */}
      {viewingItemBatches && (
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
            maxWidth: '650px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Active Batches</h3>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {viewingItemBatches.name} ({viewingItemBatches.sku})
                </div>
              </div>
              <button
                onClick={() => setViewingItemBatches(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              {viewingItemBatches.batches.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  No batches recorded yet for this medicine.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>BATCH NO</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>EXPIRY</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>MRP</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>PURCHASE RATE</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>STOCK</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'center' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingItemBatches.batches.map(b => {
                      const exp = new Date(b.expiryDate);
                      const isExpired = exp < new Date();
                      return (
                        <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600 }}>
                            {b.batchNumber}
                          </td>
                          <td style={{ padding: '10px 12px', color: isExpired ? 'var(--status-danger)' : 'var(--text-main)' }}>
                            {exp.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                            {isExpired && <span style={{ color: 'var(--status-danger)', fontWeight: 600, marginLeft: '6px' }}>(EXPIRED)</span>}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>₹{b.mrp.toFixed(2)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>₹{b.ptr.toFixed(2)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                            {viewingItemBatches.conversionFactor > 1 ? (
                              (() => {
                                const isNeg = b.currentStock < 0;
                                const abs = Math.abs(b.currentStock);
                                const str = Math.floor(abs / viewingItemBatches.conversionFactor);
                                const tab = abs % viewingItemBatches.conversionFactor;
                                const sign = isNeg ? '-' : '';
                                if (str > 0 && tab > 0) return `${sign}${str} Str + ${tab} Tab (${b.currentStock})`;
                                if (str > 0) return `${sign}${str} Str (${b.currentStock})`;
                                return `${sign}${tab} Tab (${b.currentStock})`;
                              })()
                            ) : (
                              `${b.currentStock} ${viewingItemBatches.unit}s`
                            )}
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => handleOpenEditBatch(viewingItemBatches, b)}
                                style={{
                                  padding: '4px 8px',
                                  background: '#eff6ff',
                                  border: '1px solid #bfdbfe',
                                  borderRadius: '4px',
                                  color: '#1d4ed8',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600
                                }}
                                title="Edit batch details & stock"
                              >
                                <Edit2 size={12} /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteBatch(viewingItemBatches, b)}
                                style={{
                                  padding: '4px 8px',
                                  background: '#fef2f2',
                                  border: '1px solid #fecaca',
                                  borderRadius: '4px',
                                  color: '#dc2626',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600
                                }}
                                title="Delete batch"
                              >
                                <Trash2 size={12} /> Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
              <button
                onClick={() => setViewingItemBatches(null)}
                className="btn btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Batch */}
      {editingBatchInfo && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10005,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '520px',
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
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                  Edit Batch & Stock
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  {editingBatchInfo.item.name} ({editingBatchInfo.item.sku})
                </p>
              </div>
              <button
                onClick={() => setEditingBatchInfo(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateBatch} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="label">Batch Number *</label>
                  <input
                    type="text"
                    required
                    value={editBatchNumber}
                    onChange={(e) => setEditBatchNumber(e.target.value.toUpperCase())}
                    className="input"
                    style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
                  />
                </div>

                <div className="form-group">
                  <label className="label">Expiry (MM / YYYY) *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '6px' }}>
                    <select
                      value={editBatchExpiryMonth}
                      onChange={(e) => setEditBatchExpiryMonth(e.target.value)}
                      className="select"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                      ))}
                    </select>
                    <select
                      value={editBatchExpiryYear}
                      onChange={(e) => setEditBatchExpiryYear(e.target.value)}
                      className="select"
                    >
                      {Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() + i)).map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="label">MRP (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={editBatchMrp}
                    onChange={(e) => setEditBatchMrp(e.target.value)}
                    className="input"
                  />
                </div>
                <div className="form-group">
                  <label className="label">Purchase Rate (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={editBatchPtr}
                    onChange={(e) => setEditBatchPtr(e.target.value)}
                    className="input"
                  />
                </div>
              </div>

              {editingBatchInfo.item.conversionFactor > 1 ? (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                  <label className="label" style={{ fontWeight: 700, color: '#1e293b', marginBottom: '8px', display: 'block' }}>
                    Batch Stock (Strips + Loose Tablets)
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="label" style={{ fontSize: '11.5px' }}>Full Strips ({editingBatchInfo.item.unit}s)</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="e.g. 10"
                        value={editBatchStrips}
                        onChange={(e) => setEditBatchStrips(e.target.value)}
                        className="input"
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="label" style={{ fontSize: '11.5px' }}>Loose Tablets (TABs)</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="e.g. 2"
                        value={editBatchLoose}
                        onChange={(e) => setEditBatchLoose(e.target.value)}
                        className="input"
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#0284c7', fontWeight: 600, marginTop: '8px' }}>
                    Total Units: {((parseInt(editBatchStrips) || 0) * (editingBatchInfo.item.conversionFactor || 1)) + (parseInt(editBatchLoose) || 0)} Tablets
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <label className="label">Batch Stock ({editingBatchInfo.item.unit}s)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={editBatchStrips}
                    onChange={(e) => setEditBatchStrips(e.target.value)}
                    className="input"
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setEditingBatchInfo(null)}
                  className="btn btn-secondary"
                  disabled={submittingBatchEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingBatchEdit}
                >
                  {submittingBatchEdit ? 'Saving...' : 'Save Batch Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Medicine */}
      {showEditModal && editingItem && (
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
          zIndex: 1000,
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Edit Medicine Details</h3>
                  <span style={{ fontSize: '11px', fontWeight: 600, background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                    {editingItem.sku}
                  </span>
                </div>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Update catalog master info, GST rate, and packaging formulas
                </p>
              </div>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingItem(null);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px', display: 'flex', alignItems: 'center', borderRadius: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateMedicine} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Brand / Commercial Name *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="form-input"
                  placeholder="e.g. Paracetamol 650mg Tablet"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Generic / Salt Composition</label>
                  <input
                    type="text"
                    value={editGeneric}
                    onChange={(e) => setEditGeneric(e.target.value)}
                    className="form-input"
                    placeholder="e.g. Paracetamol IP"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Manufacturer / Marketer</label>
                  <input
                    type="text"
                    value={editManufacturer}
                    onChange={(e) => setEditManufacturer(e.target.value)}
                    className="form-input"
                    placeholder="e.g. Cipla Ltd."
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">HSN Code</label>
                  <input
                    type="text"
                    value={editHsn}
                    onChange={(e) => setEditHsn(e.target.value)}
                    className="form-input"
                    placeholder="3004"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">GST Rate (%)</label>
                  <select
                    value={editGst}
                    onChange={(e) => setEditGst(e.target.value)}
                    className="form-select"
                  >
                    <option value="5">5% (Standard Default)</option>
                    <option value="0">0% (Exempted)</option>
                    <option value="12">12% (Specified medicines)</option>
                    <option value="18">18% (Cosmetics/supplements)</option>
                    <option value="28">28% (Special)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Pack Type</label>
                  <select
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    className="form-select"
                  >
                    <option value="STRIP">STRIP</option>
                    <option value="BOTTLE">BOTTLE / SYRUP</option>
                    <option value="VIAL">VIAL / INJECTION</option>
                    <option value="TUBE">TUBE / OINTMENT</option>
                    <option value="BOX">BOX</option>
                    <option value="PIECE">PIECE</option>
                  </select>
                </div>
              </div>

              {/* Strip Packaging & Conversion Size */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className="form-label" style={{ margin: 0, fontWeight: 700, color: '#1e293b' }}>
                    Strip Size / Tablets per Strip (1*X)
                  </label>
                  <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 600 }}>
                    Current: 1*{editConversion} ({editConversion} {editUnit === 'BOTTLE' ? 'Bottle' : 'Tabs'} / Pack)
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {[
                    { label: '1*10 (10 Tabs)', val: '10', unit: 'STRIP' },
                    { label: '1*15 (15 Caps)', val: '15', unit: 'STRIP' },
                    { label: '1*4 (4 Tabs)', val: '4', unit: 'STRIP' },
                    { label: '1*5 (5 Tabs)', val: '5', unit: 'STRIP' },
                    { label: '1*6', val: '6', unit: 'STRIP' },
                    { label: '1*20', val: '20', unit: 'STRIP' },
                    { label: '1*1 (Bottle/Tube)', val: '1', unit: 'BOTTLE' }
                  ].map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setEditConversion(preset.val);
                        if (preset.unit) setEditUnit(preset.unit);
                      }}
                      style={{
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontWeight: editConversion === preset.val ? '700' : '500',
                        borderRadius: '4px',
                        border: '1px solid',
                        borderColor: editConversion === preset.val ? '#0284c7' : '#cbd5e1',
                        background: editConversion === preset.val ? '#e0f2fe' : '#ffffff',
                        color: editConversion === preset.val ? '#0369a1' : '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '11px' }}>Custom Tablets / Units per Strip</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 10"
                      value={editConversion}
                      onChange={(e) => setEditConversion(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '11px' }}>Min Alert Stock Level</label>
                    <input
                      type="number"
                      min="0"
                      value={editMinStock}
                      onChange={(e) => setEditMinStock(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                  💡 <em>e.g. <strong>1*10</strong> means 1 strip contains 10 tablets.</em>
                </div>
              </div>

              {/* Current Stock & Direct Adjustment in Edit Modal */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label className="form-label" style={{ margin: 0, fontWeight: 700, color: '#1e293b' }}>
                    Current Stock in Inventory (Strips + Loose Tablets)
                  </label>
                  <span style={{ fontSize: '12px', color: '#0284c7', fontWeight: 700 }}>
                    Total: {((parseInt(editStockStrips) || 0) * (parseInt(editConversion) || 1)) + (parseInt(editStockLoose) || 0)} Tablets ({parseInt(editStockStrips) || 0} Strips + {parseInt(editStockLoose) || 0} Tabs)
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '11.5px' }}>Full Strips ({editUnit}s)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={editStockStrips}
                      onChange={(e) => setEditStockStrips(e.target.value)}
                      className="form-input"
                      style={{ fontWeight: 700 }}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '11.5px' }}>Loose Tablets (TABs)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={editStockLoose}
                      onChange={(e) => setEditStockLoose(e.target.value)}
                      className="form-input"
                      style={{ fontWeight: 700 }}
                    />
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                  💡 <em>Directly update your strips and loose tablets. Saving will automatically recalculate total base units and log an audit adjustment.</em>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingItem(null);
                  }}
                  className="btn btn-secondary"
                  style={{ minWidth: '90px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="btn btn-primary"
                  style={{ minWidth: '120px' }}
                >
                  {submittingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showImportModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-card" style={{ maxWidth: '850px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ background: '#dcfce7', padding: '8px', borderRadius: '8px', color: '#16a34a' }}>
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Import Medicine Catalog</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                    Bulk load medicines from MARG ERP Book1.xlsx or upload your own Excel / CSV sheet.
                  </p>
                </div>
              </div>
              <button
                onClick={() => !importing && setShowImportModal(false)}
                className="btn-close"
                disabled={importing}
              >
                <X size={18} />
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
                    gap: '8px',
                    position: 'relative'
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
                    Supports custom column formats (Name, Pack, Company, etc.)
                  </div>
                </div>

                <div
                  onClick={handleExportTemplate}
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
                    Download Sample Excel Template
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    Pre-configured blank table template ready for your medicine data.
                  </div>
                </div>

                <div
                  onClick={() => {
                    setPreviewItems(book1Medicines);
                    setSuccessMsg(`Loaded ${book1Medicines.length} medicines from Book1.xlsx`);
                    setTimeout(() => setSuccessMsg(null), 3000);
                  }}
                  style={{
                    border: '1px solid #bbf7d0',
                    background: '#f0fdf4',
                    borderRadius: '8px',
                    padding: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: '#15803d', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={15} />
                      Book1.xlsx
                    </span>
                    <span style={{ background: '#22c55e', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '10px' }}>
                      478 ITEMS
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#166534' }}>
                    Clinic MARG catalog pre-parsed master set.
                  </div>
                </div>
              </div>

              {/* Live Preview List */}
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
                    <span>Preview Items ({previewItems.length})</span>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>
                      (Duplicates with existing catalog will be safely skipped)
                    </span>
                  </div>
                  <div className="search-box" style={{ maxWidth: '240px', padding: '4px 8px' }}>
                    <Search size={14} />
                    <input
                      type="text"
                      placeholder="Filter preview..."
                      value={importSearch}
                      onChange={(e) => setImportSearch(e.target.value)}
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                </div>

                <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px', width: '35px' }}>#</th>
                        <th style={{ padding: '8px 12px' }}>Medicine Name</th>
                        <th style={{ padding: '8px 12px' }}>Manufacturer</th>
                        <th style={{ padding: '8px 12px' }}>Pack</th>
                        <th style={{ padding: '8px 12px' }}>Unit</th>
                        <th style={{ padding: '8px 12px' }}>HSN</th>
                        <th style={{ padding: '8px 12px' }}>GST</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewItems
                        .filter(item => 
                          !importSearch ||
                          item.name.toLowerCase().includes(importSearch.toLowerCase()) ||
                          (item.manufacturer && item.manufacturer.toLowerCase().includes(importSearch.toLowerCase()))
                        )
                        .slice(0, 100)
                        .map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 12px', color: '#94a3b8' }}>{idx + 1}</td>
                            <td style={{ padding: '6px 12px', fontWeight: 600, color: '#0f172a' }}>{item.name}</td>
                            <td style={{ padding: '6px 12px', color: '#475569' }}>{item.manufacturer || '—'}</td>
                            <td style={{ padding: '6px 12px' }}>
                              <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontWeight: 500 }}>
                                {item.pack || `1*${item.conversionFactor || 10}`}
                              </span>
                            </td>
                            <td style={{ padding: '6px 12px', color: '#64748b' }}>{item.unit || 'STRIP'}</td>
                            <td style={{ padding: '6px 12px', color: '#64748b' }}>{item.hsnCode || '3004'}</td>
                            <td style={{ padding: '6px 12px', color: '#64748b' }}>{item.gstRate || 12}%</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {previewItems.length > 100 && (
                    <div style={{ padding: '8px', textAlign: 'center', background: '#f8fafc', fontSize: '11px', color: '#64748b', borderTop: '1px solid #f1f5f9' }}>
                      Showing first 100 of {previewItems.length} items. All items will be imported.
                    </div>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {importing && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, color: '#166534', marginBottom: '6px' }}>
                    <span>Importing medicines into catalog...</span>
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
                Ready to insert <strong>{previewItems.length}</strong> medicines.
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="btn btn-secondary"
                  disabled={importing}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkImport()}
                  disabled={importing || previewItems.length === 0}
                  className="btn btn-primary"
                  style={{ background: '#16a34a', borderColor: '#16a34a', minWidth: '150px' }}
                >
                  {importing ? `Importing (${importProgress}%)...` : `Confirm & Import (${previewItems.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

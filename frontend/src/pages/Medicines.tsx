import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
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
  Trash2
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
  const [newItemGst, setNewItemGst] = useState('12');
  const [newItemUnit, setNewItemUnit] = useState('STRIP');
  const [newItemConversion, setNewItemConversion] = useState('10');
  const [newItemMinStock, setNewItemMinStock] = useState('10');
  const [submittingItem, setSubmittingItem] = useState(false);

  // Form State: Add Batch
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('12');
  const [expiryYear, setExpiryYear] = useState(new Date().getFullYear() + 2 + '');
  const [batchMrp, setBatchMrp] = useState('');
  const [batchPtr, setBatchPtr] = useState('');
  const [batchPts, setBatchPts] = useState('');
  const [batchOpeningStock, setBatchOpeningStock] = useState('');
  const [submittingBatch, setSubmittingBatch] = useState(false);

  // Edit Medicine State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MedicineItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editGeneric, setEditGeneric] = useState('');
  const [editManufacturer, setEditManufacturer] = useState('');
  const [editHsn, setEditHsn] = useState('3004');
  const [editGst, setEditGst] = useState('12');
  const [editUnit, setEditUnit] = useState('STRIP');
  const [editConversion, setEditConversion] = useState('10');
  const [editMinStock, setEditMinStock] = useState('10');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  useEffect(() => {
    fetchItems();
  }, [activeCompany?.id, search]);

  const fetchItems = async () => {
    if (!activeCompany) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<{ items: MedicineItem[] }>(`/api/items?search=${encodeURIComponent(search)}`, {
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

      await api.post('/api/items', {
        name: newItemName,
        sku: newItemSku,
        genericName: newItemGeneric,
        manufacturer: newItemManufacturer,
        hsnCode: newItemHsn,
        gstRate: parseFloat(newItemGst),
        unit: newItemUnit,
        conversionFactor: parseInt(newItemConversion) || 1,
        minStockLevel: parseInt(newItemMinStock) || 0
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
      setNewItemGst('12');
      setNewItemUnit('STRIP');
      setNewItemConversion('10');
      setNewItemMinStock('10');

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

      await api.post(`/api/items/${selectedItemForBatch.id}/batches`, {
        batchNumber,
        expiryDate: expiryDateStr,
        mrp: parseFloat(batchMrp) || 0,
        ptr: parseFloat(batchPtr) || 0,
        pts: parseFloat(batchPts) || parseFloat(batchMrp) || 0,
        openingStock: parseInt(batchOpeningStock) || 0
      }, {
        companyId: activeCompany.id
      });

      setShowBatchModal(false);
      setSelectedItemForBatch(null);
      setBatchNumber('');
      setBatchMrp('');
      setBatchPtr('');
      setBatchPts('');
      setBatchOpeningStock('');

      await fetchItems();
    } catch (err: any) {
      setError(err.message || 'Failed to add batch');
    } finally {
      setSubmittingBatch(false);
    }
  };

  const handleOpenEditModal = (item: MedicineItem) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditGeneric(item.genericName || '');
    setEditManufacturer(item.manufacturer || '');
    setEditHsn(item.hsnCode || '3004');
    setEditGst(String(item.gstRate ?? 12));
    setEditUnit(item.unit || 'STRIP');
    setEditConversion(String(item.conversionFactor || 10));
    setEditMinStock(String(item.minStockLevel || 10));
    setShowEditModal(true);
  };

  const handleUpdateMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany || !editingItem) return;

    try {
      setSubmittingEdit(true);
      setError(null);
      await api.put(`/api/items/${editingItem.id}`, {
        name: editName.trim(),
        genericName: editGeneric.trim() || null,
        manufacturer: editManufacturer.trim() || null,
        hsnCode: editHsn.trim(),
        gstRate: parseFloat(editGst),
        unit: editUnit.trim().toUpperCase(),
        conversionFactor: parseInt(editConversion) || 1,
        minStockLevel: parseInt(editMinStock) || 0
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
      `Are you sure you want to delete "${item.name}" (SKU: ${item.sku})?\n\nNote: You can only delete medicines that do not have existing purchase bills or sale invoices linked to them.`
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                      color: item.totalStock <= item.minStockLevel ? 'var(--status-danger)' : 'var(--status-success)'
                    }}>
                      {item.totalStock} {item.unit}s
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {item.activeBatchesCount} active batch{item.activeBatchesCount !== 1 ? 'es' : ''}
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
                    <option value="0">0% (Exempt)</option>
                    <option value="5">5% GST</option>
                    <option value="12">12% GST (Standard)</option>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
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
                  <label className="label">Cost (PTR ₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={batchPtr}
                    onChange={(e) => setBatchPtr(e.target.value)}
                    className="input"
                  />
                </div>
                <div className="form-group">
                  <label className="label">Sell Rate (PTS ₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={batchPts}
                    onChange={(e) => setBatchPts(e.target.value)}
                    className="input"
                  />
                </div>
              </div>

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
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  This will record an atomic opening stock ledger transaction for auditing.
                </div>
              </div>

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
                      <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>PTR (COST)</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>PTS (SELL)</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>STOCK</th>
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
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>₹{b.pts.toFixed(2)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                            {b.currentStock} {viewingItemBatches.unit}s
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
                    <option value="0">0% (Exempted)</option>
                    <option value="5">5% (Life saving/vaccines)</option>
                    <option value="12">12% (Standard medicines)</option>
                    <option value="18">18% (Cosmetics/supplements)</option>
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
    </div>
  );
}

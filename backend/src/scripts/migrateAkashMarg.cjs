/**
 * Migration Script: Marg ERP to Trade Flow v2
 * Target: AKASH MEDICALS (Company ID: 74e59817-4d44-4cf4-a653-8061eb689b28)
 * User: akash (User ID: d883ac28-c229-43dc-aca7-4ff81bf70da1)
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('../../../node_modules/@prisma/client');
const prisma = new PrismaClient();

const COMPANY_ID = '74e59817-4d44-4cf4-a653-8061eb689b28';
const USER_ID = 'd883ac28-c229-43dc-aca7-4ff81bf70da1';
const PARSED_DIR = path.resolve(__dirname, '../../../backups/akash_backup/parsed');

async function main() {
  console.log('====================================================');
  console.log('🚀 HIGH-SPEED MARG ERP MIGRATION -> AKASH MEDICALS');
  console.log('====================================================\n');

  // Step 0: Update Company Details
  console.log('📍 Step 0: Updating Company Master for AKASH MEDICALS...');
  await prisma.company.update({
    where: { id: COMPANY_ID },
    data: {
      address: 'Shop No. 19, St. Andrews Inter College Campus, Shastri Chowk',
      city: 'Gorakhpur',
      state: 'Uttar Pradesh',
      pincode: '273001',
      gstin: '09DEFPM3797J1ZS',
      drugLicenseNo: 'UP53200001023 & UP53210001022',
      phone: '9044791077, 7905640340',
      email: 'akashmedicals19@gmail.com'
    }
  });
  console.log('✅ Company details updated successfully.\n');

  // Step 1: Parties (Suppliers, Customers, Doctors)
  console.log('👥 Step 1: Migrating Parties (Suppliers, Customers, Doctors)...');
  const partiesData = JSON.parse(fs.readFileSync(path.join(PARSED_DIR, 'parties.json'), 'utf8'));

  // Ensure Cash Customer exists
  let cashParty = await prisma.party.findFirst({
    where: { companyId: COMPANY_ID, isCash: true }
  });
  if (!cashParty) {
    cashParty = await prisma.party.create({
      data: {
        companyId: COMPANY_ID,
        name: 'Cash Customer',
        type: 'customer',
        isCash: true,
        accountGroup: 'CASH',
        balancingMethod: 'ON_ACCOUNT'
      }
    });
  }

  // Deduplicate parties by [name.toUpperCase(), type]
  const seenPartyKeys = new Set();
  const partyRows = [];

  for (const p of partiesData) {
    const pName = p.name ? p.name.trim() : '';
    const pType = p.type || 'customer';
    if (!pName) continue;
    const key = `${pName.toUpperCase()}_${pType}`;
    if (seenPartyKeys.has(key)) continue;
    seenPartyKeys.add(key);

    partyRows.push({
      companyId: COMPANY_ID,
      name: pName,
      type: pType,
      station: p.station || 'Gorakhpur',
      accountGroup: pType === 'supplier' ? 'SUNDRY_CREDITORS' : 'SUNDRY_DEBTORS',
      balancingMethod: 'BILL_BY_BILL',
      address: p.address || null,
      pincode: p.pincode || null,
      state: p.state || 'Uttar Pradesh',
      gstin: p.gstin || null,
      drugLicenseNo: p.drugLicenseNo || null,
      phone: p.phone || null
    });
  }

  console.log(`Inserting ${partyRows.length} unique parties in bulk...`);
  await prisma.party.createMany({
    data: partyRows,
    skipDuplicates: true
  });

  const allDbParties = await prisma.party.findMany({
    where: { companyId: COMPANY_ID },
    select: { id: true, name: true, type: true }
  });
  const partyCodeToId = { 'CASH': cashParty.id };
  const partyNameToId = new Map();
  for (const p of allDbParties) {
    partyNameToId.set(p.name.toUpperCase(), p.id);
  }
  for (const p of partiesData) {
    if (p.code && partyNameToId.has(p.name.trim().toUpperCase())) {
      partyCodeToId[p.code] = partyNameToId.get(p.name.trim().toUpperCase());
    }
  }
  console.log(`✅ Loaded ${allDbParties.length} parties.\n`);

  // Step 2: Medicine Catalog (Items)
  console.log('💊 Step 2: Migrating Medicine Catalog (Items)...');
  const itemsData = JSON.parse(fs.readFileSync(path.join(PARSED_DIR, 'items.json'), 'utf8'));
  console.log(`Found ${itemsData.length} items in backup.`);

  const CHUNK_SIZE = 1000;
  for (let i = 0; i < itemsData.length; i += CHUNK_SIZE) {
    const chunk = itemsData.slice(i, i + CHUNK_SIZE).map(it => ({
      companyId: COMPANY_ID,
      sku: it.sku,
      name: it.name,
      manufacturer: it.manufacturer || null,
      hsnCode: it.hsnCode || '3004',
      unit: it.unit || 'STRIP',
      conversionFactor: it.conversionFactor || 1,
      gstRate: 5.0
    }));

    await prisma.item.createMany({
      data: chunk,
      skipDuplicates: true
    });
    process.stdout.write(`\rItems Inserted: ${Math.min(i + CHUNK_SIZE, itemsData.length)} / ${itemsData.length}`);
  }
  console.log('\n✅ Items catalog import complete.');

  console.log('Caching item SKU mappings...');
  const allDbItems = await prisma.item.findMany({
    where: { companyId: COMPANY_ID },
    select: { id: true, sku: true, conversionFactor: true }
  });
  const skuToItemMap = new Map();
  for (const it of allDbItems) {
    skuToItemMap.set(it.sku, it);
  }
  console.log(`Cached ${skuToItemMap.size} item mappings.\n`);

  // Step 3: Batches & Stock
  console.log('📦 Step 3: Migrating Batches & Opening Stock...');
  const batchesData = JSON.parse(fs.readFileSync(path.join(PARSED_DIR, 'batches.json'), 'utf8'));

  const validBatches = [];
  const seenBatchKeys = new Set();

  for (const b of batchesData) {
    const item = skuToItemMap.get(b.itemSku);
    if (!item) continue;
    const batchNo = b.batchNumber ? b.batchNumber.trim().toUpperCase() : 'OPENING';
    const key = `${item.id}_${batchNo}`;
    if (seenBatchKeys.has(key)) continue;
    seenBatchKeys.add(key);

    validBatches.push({
      companyId: COMPANY_ID,
      itemId: item.id,
      batchNumber: batchNo,
      expiryDate: new Date(b.expiryDate || '2026-12-31'),
      mrp: b.mrp || 0,
      ptr: b.ptr || 0,
      pts: b.pts || b.ptr || 0,
      currentStock: b.currentStock || 0
    });
  }

  console.log(`Bulk inserting ${validBatches.length} batches...`);
  for (let i = 0; i < validBatches.length; i += CHUNK_SIZE) {
    const chunk = validBatches.slice(i, i + CHUNK_SIZE);
    await prisma.batch.createMany({
      data: chunk,
      skipDuplicates: true
    });
    process.stdout.write(`\rBatches Inserted: ${Math.min(i + CHUNK_SIZE, validBatches.length)} / ${validBatches.length}`);
  }
  console.log('\n✅ Batches import complete.');

  console.log('Caching batch IDs...');
  const allDbBatches = await prisma.batch.findMany({
    where: { companyId: COMPANY_ID },
    select: { id: true, itemId: true, batchNumber: true, currentStock: true, ptr: true }
  });
  const batchLookupMap = new Map();
  for (const b of allDbBatches) {
    batchLookupMap.set(`${b.itemId}_${b.batchNumber.toUpperCase()}`, b);
  }
  console.log(`Cached ${batchLookupMap.size} batches.\n`);

  // Step 3b: Stock Ledger
  console.log('📊 Step 3b: Creating Opening Stock Ledger audit records...');
  const positiveStockBatches = allDbBatches.filter(b => b.currentStock > 0);
  const stockLedgerEntries = positiveStockBatches.map(b => ({
    companyId: COMPANY_ID,
    itemId: b.itemId,
    batchId: b.id,
    entryType: 'OPENING_BALANCE',
    quantity: b.currentStock,
    unitPrice: b.ptr,
    notes: 'Opening Stock migrated from Marg ERP backup',
    createdBy: USER_ID
  }));

  for (let i = 0; i < stockLedgerEntries.length; i += CHUNK_SIZE) {
    const chunk = stockLedgerEntries.slice(i, i + CHUNK_SIZE);
    await prisma.stockLedger.createMany({ data: chunk });
    process.stdout.write(`\rStockLedger Inserted: ${Math.min(i + CHUNK_SIZE, stockLedgerEntries.length)} / ${stockLedgerEntries.length}`);
  }
  console.log('\n✅ Opening stock audit records created.\n');

  // Step 4: Purchases
  console.log('🚚 Step 4: Migrating Past Purchases...');
  const purchasesData = JSON.parse(fs.readFileSync(path.join(PARSED_DIR, 'purchases.json'), 'utf8'));

  const seenPurchKeys = new Set();
  const purchaseHeaders = [];
  const purchaseIdByBill = new Map();

  for (const p of purchasesData) {
    const supplierId = partyCodeToId[p.supplierCode] || cashParty.id;
    const invNo = p.partyBillNo || p.billNo;
    const key = `${supplierId}_${invNo}`;
    if (seenPurchKeys.has(key)) continue;
    seenPurchKeys.add(key);

    const pid = require('crypto').randomUUID();
    purchaseIdByBill.set(p.billNo, { id: pid, supplierId });

    purchaseHeaders.push({
      id: pid,
      companyId: COMPANY_ID,
      supplierId,
      invoiceNumber: invNo,
      purchaseDate: new Date(p.date || '2026-04-01'),
      subtotal: p.subtotal || 0,
      totalDiscount: p.totalDiscount || 0,
      taxableAmount: p.taxableAmount || p.subtotal || 0,
      totalAmount: p.totalAmount || 0,
      paidAmount: p.totalAmount || 0,
      status: 'PAID',
      notes: `Imported from Marg ERP (Bill #${p.billNo})`,
      createdBy: USER_ID
    });
  }

  for (let i = 0; i < purchaseHeaders.length; i += CHUNK_SIZE) {
    const chunk = purchaseHeaders.slice(i, i + CHUNK_SIZE);
    await prisma.purchase.createMany({ data: chunk, skipDuplicates: true });
    process.stdout.write(`\rPurchases Inserted: ${Math.min(i + CHUNK_SIZE, purchaseHeaders.length)} / ${purchaseHeaders.length}`);
  }
  console.log('\n✅ Purchase headers inserted.');

  // Purchase Items
  console.log('Inserting Purchase Item line items...');
  const purchaseItems = [];
  for (const p of purchasesData) {
    const pInfo = purchaseIdByBill.get(p.billNo);
    if (!pInfo) continue;

    for (const itm of (p.items || [])) {
      const itemObj = skuToItemMap.get(itm.itemSku);
      if (!itemObj) continue;
      const bNo = (itm.batchNumber || 'BATCH').toUpperCase();
      const batchObj = batchLookupMap.get(`${itemObj.id}_${bNo}`);
      if (!batchObj) continue;

      const qty = Math.max(1, Math.round(itm.quantity || 1));
      purchaseItems.push({
        purchaseId: pInfo.id,
        itemId: itemObj.id,
        batchId: batchObj.id,
        batchNumber: bNo,
        expiryDate: new Date(itm.expiryDate || '2026-12-31'),
        quantity: qty,
        purchaseRate: itm.rate || 0,
        mrp: itm.mrp || itm.rate || 0,
        discountPercent: itm.discountPercent || 0,
        taxableValue: itm.amount || (qty * (itm.rate || 0)),
        gstRate: itm.gstRate || 5.0,
        gstAmount: ((itm.amount || (qty * (itm.rate || 0))) * (itm.gstRate || 5.0)) / 100,
        totalAmount: itm.amount || (qty * (itm.rate || 0))
      });
    }
  }

  for (let i = 0; i < purchaseItems.length; i += CHUNK_SIZE) {
    const chunk = purchaseItems.slice(i, i + CHUNK_SIZE);
    await prisma.purchaseItem.createMany({ data: chunk, skipDuplicates: true });
    process.stdout.write(`\rPurchase Items Inserted: ${Math.min(i + CHUNK_SIZE, purchaseItems.length)} / ${purchaseItems.length}`);
  }
  console.log('\n✅ Purchase item lines inserted.\n');

  // Step 5: Sales Invoices
  console.log('🧾 Step 5: Migrating Past Sales Invoices...');
  const salesData = JSON.parse(fs.readFileSync(path.join(PARSED_DIR, 'sales.json'), 'utf8'));

  const seenInvNos = new Set();
  const invoiceHeaders = [];
  const invoiceIdByBill = new Map();

  for (const s of salesData) {
    const invNo = `INV-MARG-${s.invoiceNumber}`;
    if (seenInvNos.has(invNo)) continue;
    seenInvNos.add(invNo);

    const partyId = partyCodeToId[s.customerCode] || cashParty.id;
    const invId = require('crypto').randomUUID();
    invoiceIdByBill.set(s.invoiceNumber, invId);

    invoiceHeaders.push({
      id: invId,
      companyId: COMPANY_ID,
      partyId,
      invoiceNumber: invNo,
      invoiceDate: new Date(s.date || '2026-04-01'),
      customerName: s.customerName || 'Cash Customer',
      subtotal: s.subtotal || 0,
      itemDiscount: s.billDiscountAmt || 0,
      taxableAmount: s.taxableAmount || s.subtotal || 0,
      totalTax: s.totalTax || 0,
      grandTotal: s.grandTotal || 0,
      paidAmount: s.grandTotal || 0,
      status: 'PAID',
      notes: `Imported from Marg ERP (Bill #${s.invoiceNumber})`,
      createdBy: USER_ID
    });
  }

  for (let i = 0; i < invoiceHeaders.length; i += CHUNK_SIZE) {
    const chunk = invoiceHeaders.slice(i, i + CHUNK_SIZE);
    await prisma.invoice.createMany({ data: chunk, skipDuplicates: true });
    process.stdout.write(`\rInvoices Inserted: ${Math.min(i + CHUNK_SIZE, invoiceHeaders.length)} / ${invoiceHeaders.length}`);
  }
  console.log('\n✅ Invoice headers inserted.');

  // Invoice Items
  console.log('Inserting Invoice Item line items...');
  const invoiceItems = [];
  for (const s of salesData) {
    const invId = invoiceIdByBill.get(s.invoiceNumber);
    if (!invId) continue;

    for (const itm of (s.items || [])) {
      const itemObj = skuToItemMap.get(itm.itemSku);
      if (!itemObj) continue;
      const bNo = (itm.batchNumber || 'BATCH').toUpperCase();
      const batchObj = batchLookupMap.get(`${itemObj.id}_${bNo}`);
      if (!batchObj) continue;

      const qty = Math.max(1, Math.round(itm.quantity || 1));
      const lineTotal = itm.amount || (qty * (itm.rate || 0));

      invoiceItems.push({
        invoiceId: invId,
        itemId: itemObj.id,
        batchId: batchObj.id,
        batchNumber: bNo,
        expiryDate: new Date(itm.expiryDate || '2026-12-31'),
        quantity: qty,
        strips: qty,
        looseQty: 0,
        unitPrice: itm.rate || 0,
        mrp: itm.mrp || itm.rate || 0,
        discountPercent: itm.discountPercent || 0,
        taxableAmount: lineTotal,
        gstRate: itm.gstRate || 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalAmount: lineTotal
      });
    }
  }

  for (let i = 0; i < invoiceItems.length; i += CHUNK_SIZE) {
    const chunk = invoiceItems.slice(i, i + CHUNK_SIZE);
    await prisma.invoiceItem.createMany({ data: chunk, skipDuplicates: true });
    process.stdout.write(`\rInvoice Items Inserted: ${Math.min(i + CHUNK_SIZE, invoiceItems.length)} / ${invoiceItems.length}`);
  }
  console.log('\n✅ Invoice item lines inserted.\n');

  console.log('====================================================');
  console.log('🎉 100% MARG ERP MIGRATION COMPLETED SUCCESSFULLY!');
  console.log('====================================================');
}

main()
  .catch(err => {
    console.error('Migration failed:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

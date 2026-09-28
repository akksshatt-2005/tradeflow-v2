import axios from 'axios';

const API_BASE = 'https://tradeflow-v2-96zx.onrender.com';

async function runAutoCatalogTest() {
  console.log('Testing Auto-Cataloging on Purchase Entry against:', API_BASE);

  // 1. Authenticate
  const loginRes = await axios.post(`${API_BASE}/api/auth/login`, {
    username: 'admin',
    password: 'Password123!'
  });

  const token = loginRes.data.token;
  const client = axios.create({
    baseURL: API_BASE,
    headers: { Authorization: `Bearer ${token}` }
  });

  // Get active company
  const compRes = await client.get('/api/companies');
  const activeCompany = compRes.data.companies[0];
  console.log('Active Company:', activeCompany.name, `(${activeCompany.id})`);

  client.defaults.headers.common['x-company-id'] = activeCompany.id;

  // 2. Get a supplier
  const supRes = await client.get('/api/parties?type=supplier');
  const supplier = supRes.data.parties[0];
  console.log('Supplier:', supplier.name, `(${supplier.id})`);

  // 3. Generate a brand new medicine name that definitely doesn't exist
  const uniqueCode = Math.floor(1000 + Math.random() * 9000);
  const newMedicineName = `Cefixime 200mg DT Tab ${uniqueCode}`;
  const newBatchNo = `CFX-${uniqueCode}`;

  console.log(`\nCreating Purchase Bill with NEW un-cataloged medicine: "${newMedicineName}"...`);

  const purchaseRes = await client.post('/api/purchases', {
    supplierId: supplier.id,
    invoiceNumber: `BILL-NEW-${uniqueCode}`,
    purchaseDate: new Date().toISOString().split('T')[0],
    paymentMode: 'CREDIT',
    paidAmount: 0,
    items: [
      {
        medicineName: newMedicineName,
        genericName: 'Cefixime Trihydrate 200mg',
        manufacturer: 'Mankind Pharma',
        pack: '10 TAB',
        unit: 'TAB',
        conversionFactor: 10,
        hsnCode: '3004',
        batchNumber: newBatchNo,
        expiryDate: '2028-12-31',
        quantity: 20, // 20 packs
        freeQuantity: 2, // 2 packs free
        purchaseRate: 85.50,
        mrp: 135.00,
        pts: 110.00,
        discountPercent: 5.0,
        gstRate: 12.0
      }
    ]
  }, {
    headers: { 'idempotency-key': `pur-test-${uniqueCode}` }
  });

  console.log('✅ Purchase created successfully!');
  console.log('  Bill Total:', purchaseRes.data.purchase.totalAmount);
  console.log('  Status:', purchaseRes.data.purchase.status);

  // 4. Verify that the medicine was automatically cataloged into /api/items
  console.log('\nVerifying that medicine is now automatically cataloged in items master...');
  const itemsRes = await client.get(`/api/items?search=${encodeURIComponent(newMedicineName)}`);
  const catalogedItem = itemsRes.data.items.find((it: any) => it.name === newMedicineName);

  if (!catalogedItem) {
    throw new Error(`❌ Failed: Medicine "${newMedicineName}" was not found in catalog!`);
  }

  console.log('✅ AUTO-CATALOGING VERIFIED:');
  console.log('  Item ID:', catalogedItem.id);
  console.log('  SKU:', catalogedItem.sku);
  console.log('  Name:', catalogedItem.name);
  console.log('  Generic:', catalogedItem.genericName);
  console.log('  Manufacturer:', catalogedItem.manufacturer);
  console.log('  Unit & Conversion:', `${catalogedItem.conversionFactor} ${catalogedItem.unit}`);
  console.log('  Total Live Stock:', catalogedItem.totalStock, '(Expected 22 = 20 + 2 free)');

  // 5. Verify batch in batch master
  const batch = catalogedItem.batches.find((b: any) => b.batchNumber === newBatchNo);
  if (!batch || batch.currentStock !== 22) {
    throw new Error(`❌ Batch stock mismatch. Found: ${batch?.currentStock}, Expected: 22`);
  }
  console.log('✅ Batch lot generated with correct stock: 22 units');

  console.log('\n🎉 ALL AUTO-CATALOGING TESTS PASSED!');
}

runAutoCatalogTest().catch(err => {
  console.error('❌ Test failed:', err.response?.data || err.message);
  process.exit(1);
});

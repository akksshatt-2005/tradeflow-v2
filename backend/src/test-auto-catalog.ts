const API_BASE = process.env.BACKEND_URL || 'https://tradeflow-v2-1.onrender.com';

async function runAutoCatalogTest() {
  console.log('Testing Auto-Cataloging on Purchase Entry against:', API_BASE);

  // 1. Authenticate
  const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: 'Password123!'
    })
  });

  const loginData = (await loginRes.json()) as any;
  if (!loginRes.ok) {
    throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
  }

  const token = loginData.accessToken || loginData.token;
  const companyId = loginData.activeCompany?.id || loginData.companies?.[0]?.id;
  console.log('Login successful. Active Company ID:', companyId);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Company-Id': companyId
  };

  // 2. Get a supplier
  const supRes = await fetch(`${API_BASE}/api/parties?type=supplier`, { headers });
  const supData = (await supRes.json()) as any;
  const supplier = supData.parties?.[0];
  if (!supplier) {
    throw new Error('No supplier found in company');
  }
  console.log('Supplier:', supplier.name, `(${supplier.id})`);

  // 3. Generate a brand new medicine name that definitely doesn't exist
  const uniqueCode = Math.floor(1000 + Math.random() * 9000);
  const newMedicineName = `Cefixime 200mg DT Tab ${uniqueCode}`;
  const newBatchNo = `CFX-${uniqueCode}`;

  console.log(`\nCreating Purchase Bill with NEW un-cataloged medicine: "${newMedicineName}"...`);

  const purchaseRes = await fetch(`${API_BASE}/api/purchases`, {
    method: 'POST',
    headers: {
      ...headers,
      'idempotency-key': `pur-test-${uniqueCode}`
    },
    body: JSON.stringify({
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
          gstRate: 5.0
        }
      ]
    })
  });

  const purchaseData = (await purchaseRes.json()) as any;
  if (!purchaseRes.ok) {
    throw new Error(`Purchase creation failed: ${JSON.stringify(purchaseData)}`);
  }

  console.log('✅ Purchase created successfully!');
  console.log('  Bill Total:', purchaseData.purchase?.totalAmount);
  console.log('  Status:', purchaseData.purchase?.status);

  // 4. Verify that the medicine was automatically cataloged into /api/items
  console.log('\nVerifying that medicine is now automatically cataloged in items master...');
  const itemsRes = await fetch(`${API_BASE}/api/items?search=${encodeURIComponent(newMedicineName)}`, { headers });
  const itemsData = (await itemsRes.json()) as any;
  const catalogedItem = itemsData.items?.find((it: any) => it.name === newMedicineName);

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
  const batch = catalogedItem.batches?.find((b: any) => b.batchNumber === newBatchNo);
  if (!batch || batch.currentStock !== 22) {
    throw new Error(`❌ Batch stock mismatch. Found: ${batch?.currentStock}, Expected: 22`);
  }
  console.log('✅ Batch lot generated with correct stock: 22 units');

  console.log('\n🎉 ALL AUTO-CATALOGING TESTS PASSED!');
}

runAutoCatalogTest().catch(err => {
  console.error('❌ Test failed:', err.message || err);
  process.exit(1);
});

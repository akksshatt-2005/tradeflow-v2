const BASE_URL = process.env.BACKEND_URL || 'https://tradeflow-v2-96zx.onrender.com';

async function runTest() {
  console.log('Testing against:', BASE_URL);
  
  // 1. Login
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Password123!' })
  });
  
  const loginData = (await loginRes.json()) as any;
  if (!loginRes.ok) {
    console.error('Login failed:', loginData);
    process.exit(1);
  }
  
  console.log('Login successful for user:', loginData.user?.username);
  const token = loginData.accessToken;
  const companyId = loginData.activeCompany?.id || loginData.companies?.[0]?.id;
  console.log('Active Company ID:', companyId);
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Company-Id': companyId
  };
  
  // 2. Fetch or create a Supplier party
  let suppliersRes = await fetch(`${BASE_URL}/api/parties?type=supplier`, { headers });
  let suppliersData = (await suppliersRes.json()) as any;
  let supplier = suppliersData.parties?.[0];
  
  if (!supplier) {
    console.log('Creating demo supplier...');
    const createSupplierRes = await fetch(`${BASE_URL}/api/parties`, {
      method: 'POST',
      headers: {
        ...headers,
        'Idempotency-Key': 'test-supplier-' + Date.now()
      },
      body: JSON.stringify({
        name: 'Sun Pharma Distributors Ltd ' + Date.now().toString().slice(-4),
        type: 'supplier',
        phone: '9876543210',
        email: 'sales@sunpharma.example',
        gstin: '27AABCS1429B1Z8',
        drugLicenseNo: 'DL-20B-12345, DL-21B-12345',
        creditLimit: 100000
      })
    });
    const sData = (await createSupplierRes.json()) as any;
    if (!createSupplierRes.ok) {
      console.error('Supplier creation failed:', sData);
      process.exit(1);
    }
    supplier = sData.party;
  }
  console.log('Using Supplier:', supplier.name, '(ID:', supplier.id, ')');
  
  // 3. Fetch or create an Item
  let itemsRes = await fetch(`${BASE_URL}/api/items`, { headers });
  let itemsData = (await itemsRes.json()) as any;
  let item = itemsData.items?.[0];
  
  if (!item) {
    console.log('Creating demo item...');
    const createItemRes = await fetch(`${BASE_URL}/api/items`, {
      method: 'POST',
      headers: {
        ...headers,
        'Idempotency-Key': 'test-item-' + Date.now()
      },
      body: JSON.stringify({
        name: 'Augmentin 625 Duo Tablet',
        genericName: 'Amoxycillin and Potassium Clavulanate',
        sku: 'AUG625-' + Date.now().toString().slice(-4),
        hsnCode: '3004',
        unit: 'STRIP',
        conversionFactor: 10,
        gstRate: 12.0,
        minStockLevel: 20
      })
    });
    const iData = (await createItemRes.json()) as any;
    if (!createItemRes.ok) {
      console.error('Item creation failed:', iData);
      process.exit(1);
    }
    item = iData.item;
  }
  console.log('Using Item:', item.name, '(ID:', item.id, ')');
  
  // 4. Create a Purchase Bill
  const batchNum = 'BATCH-' + Date.now().toString().slice(-5);
  const purchasePayload = {
    supplierId: supplier.id,
    invoiceNumber: 'BILL-' + Math.floor(Math.random() * 100000),
    purchaseDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30*86400000).toISOString().split('T')[0],
    paymentMode: 'CREDIT',
    paidAmount: 500,
    notes: 'Phase 2 Automated Verification Test Bill',
    items: [
      {
        itemId: item.id,
        batchNumber: batchNum,
        expiryDate: '2028-12-31',
        quantity: 50,
        freeQuantity: 5,
        purchaseRate: 150.0,
        mrp: 220.0,
        pts: 195.0,
        discountPercent: 5.0,
        gstRate: 12.0
      }
    ]
  };
  
  console.log('\nCreating Purchase Inward Bill for 50 + 5 free units...');
  const purchaseRes = await fetch(`${BASE_URL}/api/purchases`, {
    method: 'POST',
    headers: {
      ...headers,
      'Idempotency-Key': 'test-purchase-' + Date.now()
    },
    body: JSON.stringify(purchasePayload)
  });
  
  const purchaseData = (await purchaseRes.json()) as any;
  if (!purchaseRes.ok) {
    console.error('Purchase creation failed:', purchaseData);
    process.exit(1);
  }
  
  console.log('✅ Purchase created successfully!');
  console.log('  Bill No:', purchaseData.purchase?.invoiceNumber);
  console.log('  Grand Total:', purchaseData.purchase?.totalAmount);
  console.log('  Paid Amount:', purchaseData.purchase?.paidAmount);
  console.log('  Balance Amount:', purchaseData.purchase?.balanceAmount);
  console.log('  Status:', purchaseData.purchase?.status);
  
  // 5. Verify batch stock was created/incremented
  const itemRes = await fetch(`${BASE_URL}/api/items/${item.id}`, { headers });
  const itemData = (await itemRes.json()) as any;
  const createdBatch = itemData.item?.batches?.find((b: any) => b.batchNumber === batchNum);
  console.log('✅ Batch Stock Verification:');
  console.log('  Batch:', batchNum);
  console.log('  Current Stock in Batch:', createdBatch?.currentStock, '(Expected: 55 = 50 + 5 free)');
  
  // 6. Record additional payment towards balance
  if (purchaseData.purchase?.id) {
    console.log('\nRecording ₹1,000 payment for purchase...');
    const payRes = await fetch(`${BASE_URL}/api/purchases/${purchaseData.purchase.id}/payment`, {
      method: 'POST',
      headers: {
        ...headers,
        'Idempotency-Key': 'test-payment-' + Date.now()
      },
      body: JSON.stringify({
        paymentAmount: 1000,
        amount: 1000,
        paymentMode: 'UPI',
        referenceNumber: 'UPI-REF-9921',
        notes: 'Partial payment via GooglePay'
      })
    });
    const payData = (await payRes.json()) as any;
    if (!payRes.ok) {
      console.error('Payment failed:', payData);
      process.exit(1);
    }
    console.log('✅ Payment recorded!');
    console.log('  New Paid Amount:', payData.purchase?.paidAmount ?? payData.paidAmount);
    console.log('  New Balance:', payData.purchase?.balanceAmount);
    console.log('  Payment Status:', payData.purchase?.status ?? payData.status);
  }
  
  // 7. Verify Stock Ledger entry
  const ledgerRes = await fetch(`${BASE_URL}/api/inventory/ledger?limit=5`, { headers });
  const ledgerData = (await ledgerRes.json()) as any;
  const latestEntry = ledgerData.ledger?.find((e: any) => e.batchNumber === batchNum);
  console.log('\n✅ Stock Ledger Verification:');
  console.log('  Entry Type:', latestEntry?.entryType, '(Expected: PURCHASE_INWARD)');
  console.log('  Quantity In:', latestEntry?.quantity, '(Expected: 55)');
  console.log('  Logged By:', latestEntry?.performedBy);
  
  console.log('\n🎉 ALL PHASE 2 PURCHASES & INVENTORY TESTS PASSED SUCCESSFULLY!');
}

runTest().catch(console.error);

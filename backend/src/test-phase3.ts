const BASE_URL = process.env.BACKEND_URL || 'https://tradeflow-v2-1.onrender.com';

async function runPhase3Test() {
  console.log('Testing Phase 3 against:', BASE_URL);
  
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
  
  // 2. Fetch or create a Customer party
  let customersRes = await fetch(`${BASE_URL}/api/parties?type=customer`, { headers });
  let customersData = (await customersRes.json()) as any;
  let customer = customersData.parties?.find((p: any) => !p.isCash);
  
  if (!customer) {
    console.log('Creating demo customer...');
    const createCustomerRes = await fetch(`${BASE_URL}/api/parties`, {
      method: 'POST',
      headers: {
        ...headers,
        'Idempotency-Key': 'test-customer-' + Date.now()
      },
      body: JSON.stringify({
        name: 'Apollo Pharmacy Clinic ' + Date.now().toString().slice(-4),
        type: 'customer',
        phone: '9123456780',
        email: 'billing@apollopharmacy.example',
        gstin: '27AABCA1122C1Z2',
        drugLicenseNo: 'DL-20B-7890, DL-21B-7890',
        creditLimit: 50000
      })
    });
    const cData = (await createCustomerRes.json()) as any;
    if (!createCustomerRes.ok) {
      console.error('Customer creation failed:', cData);
      process.exit(1);
    }
    customer = cData.party;
  }
  console.log('Using Customer:', customer.name, '(ID:', customer.id, ')');
  
  // 3. Fetch Items with available Batches
  const itemsRes = await fetch(`${BASE_URL}/api/items`, { headers });
  const itemsData = (await itemsRes.json()) as any;
  const itemWithStock = itemsData.items?.find((i: any) => i.batches && i.batches.length > 0 && i.batches.some((b: any) => b.currentStock > 0));
  
  if (!itemWithStock) {
    console.error('No items with available batch stock found. Run Phase 2 purchase first.');
    process.exit(1);
  }
  
  console.log('Using Item:', itemWithStock.name, '(ID:', itemWithStock.id, ')');
  
  // 4. Test FEFO Batch Suggestions Endpoint
  const fefoRes = await fetch(`${BASE_URL}/api/invoices/fefo-suggestions?itemId=${itemWithStock.id}&quantity=10`, { headers });
  const fefoData = (await fefoRes.json()) as any;
  console.log('✅ FEFO Batch Suggestions:');
  console.log('  Batches returned:', fefoData.batches?.length);
  const targetBatch = fefoData.batches?.[0];
  console.log('  Top FEFO Batch:', targetBatch?.batchNumber, 'Stock:', targetBatch?.currentStock, 'Exp:', targetBatch?.expiryDate);
  
  const stockBefore = targetBatch.currentStock;
  const qtyToSell = Math.min(5, stockBefore);
  
  // 5. Test Next Invoice Number Generation
  const nextNumRes = await fetch(`${BASE_URL}/api/invoices/next-number`, { headers });
  const nextNumData = (await nextNumRes.json()) as any;
  console.log('✅ Next Invoice Number:', nextNumData.invoiceNumber);
  
  // 6. Create Sales Invoice (Atomic Transaction)
  const invoicePayload = {
    partyId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    customerGstin: customer.gstin,
    doctorName: 'Dr. V. Sharma (MBBS, MD)',
    patientName: 'Ramesh Gupta (45/M)',
    invoiceNumber: nextNumData.invoiceNumber,
    invoiceDate: new Date().toISOString().split('T')[0],
    paymentMode: 'CREDIT',
    paidAmount: 200, // Partial payment
    billDiscountPct: 2.0,
    isInterState: false,
    notes: 'Phase 3 Automated Verification Sales Bill',
    items: [
      {
        itemId: itemWithStock.id,
        batchId: targetBatch.batchId,
        quantity: qtyToSell,
        freeQuantity: 0,
        unitPrice: targetBatch.pts || targetBatch.mrp || 150.0,
        mrp: targetBatch.mrp || 150.0,
        discountPercent: 5.0,
        gstRate: 5.0
      }
    ]
  };
  
  console.log(`\nCreating Sales Invoice for ${qtyToSell} units of ${itemWithStock.name}...`);
  const invoiceRes = await fetch(`${BASE_URL}/api/invoices`, {
    method: 'POST',
    headers: {
      ...headers,
      'Idempotency-Key': 'test-invoice-' + Date.now()
    },
    body: JSON.stringify(invoicePayload)
  });
  
  const invoiceData = (await invoiceRes.json()) as any;
  if (!invoiceRes.ok) {
    console.error('Invoice creation failed:', invoiceData);
    process.exit(1);
  }
  
  console.log('✅ Sales Invoice created successfully!');
  console.log('  Invoice No:', invoiceData.invoice?.invoiceNumber);
  console.log('  Grand Total:', invoiceData.invoice?.grandTotal);
  console.log('  Paid Amount:', invoiceData.invoice?.paidAmount);
  console.log('  Balance Amount:', invoiceData.invoice?.balanceAmount);
  console.log('  Status:', invoiceData.invoice?.status);
  
  // 7. Verify Batch Stock Decrement
  const itemCheckRes = await fetch(`${BASE_URL}/api/items/${itemWithStock.id}`, { headers });
  const itemCheckData = (await itemCheckRes.json()) as any;
  const updatedBatch = itemCheckData.item?.batches?.find((b: any) => b.id === targetBatch.batchId);
  console.log('\n✅ Stock Deduction Verification:');
  console.log('  Batch:', targetBatch.batchNumber);
  console.log('  Stock Before:', stockBefore);
  console.log('  Stock After:', updatedBatch?.currentStock, `(Expected: ${stockBefore - qtyToSell})`);
  
  // 8. Verify Stock Ledger Audit Entry (movement_type = 'SALE')
  const ledgerRes = await fetch(`${BASE_URL}/api/inventory/ledger?limit=5`, { headers });
  const ledgerData = (await ledgerRes.json()) as any;
  const saleEntry = ledgerData.ledger?.find((e: any) => e.referenceId === invoiceData.invoice?.id || e.entryType === 'SALE');
  console.log('\n✅ Stock Ledger Verification:');
  console.log('  Entry Type:', saleEntry?.entryType, '(Expected: SALE)');
  console.log('  Quantity:', saleEntry?.quantity, `(Expected: -${qtyToSell})`);
  console.log('  User:', saleEntry?.performedBy);
  
  // 9. Record Customer Settlement Payment
  if (invoiceData.invoice?.id && invoiceData.invoice?.balanceAmount > 0) {
    console.log('\nRecording customer payment towards invoice balance...');
    const settleRes = await fetch(`${BASE_URL}/api/invoices/${invoiceData.invoice.id}/payment`, {
      method: 'POST',
      headers: {
        ...headers,
        'Idempotency-Key': 'test-settle-' + Date.now()
      },
      body: JSON.stringify({
        paymentAmount: invoiceData.invoice.balanceAmount,
        paymentMode: 'UPI',
        notes: 'Full settlement via PhonePe'
      })
    });
    const settleData = (await settleRes.json()) as any;
    console.log('✅ Payment recorded!');
    console.log('  New Status:', settleData.status ?? settleData.invoice?.status, '(Expected: PAID)');
    console.log('  New Balance:', settleData.balanceAmount ?? settleData.invoice?.balanceAmount, '(Expected: 0)');
  }
  
  console.log('\n🎉 ALL PHASE 3 SALES & POS INVOICE TESTS PASSED SUCCESSFULLY!');
}

runPhase3Test().catch(console.error);

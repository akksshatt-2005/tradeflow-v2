import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireCompany, CompanyScopedRequest } from '../middleware/company.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import prisma from '../prisma.js';
import { parseFilterStartDate, parseFilterEndDate } from '../utils/dateUtils.js';


const router = Router();

// Require auth and company access
router.use(requireAuth);
router.use(requireCompany);

/**
 * Helper: Ensure standard system "Cash" party exists for the company
 */
async function ensureCashParty(companyId: string) {
  const cashParty = await prisma.party.findFirst({
    where: {
      companyId,
      isCash: true
    }
  });

  if (!cashParty) {
    try {
      await prisma.party.create({
        data: {
          companyId,
          name: 'Cash Customer',
          type: 'customer',
          station: 'LOCAL',
          accountGroup: 'CASH',
          isCash: true,
          creditLimit: 0,
          outstandingBalance: 0
        }
      });
    } catch (_) {
      // Ignore conflict if created concurrently
    }
  }
}

/**
 * Helper: Ensure payments table exists in PostgreSQL
 */
export async function ensurePaymentsTableExists() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
        purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
        invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
        voucher_no VARCHAR(100) NOT NULL,
        payment_type VARCHAR(50) NOT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        payment_mode VARCHAR(50) NOT NULL DEFAULT 'CASH',
        reference_no VARCHAR(100),
        notes TEXT,
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_payments_company_party ON payments(company_id, party_id);
      CREATE INDEX IF NOT EXISTS idx_payments_company_date ON payments(company_id, payment_date);
      CREATE INDEX IF NOT EXISTS idx_payments_company_purchase ON payments(company_id, purchase_id);
      CREATE INDEX IF NOT EXISTS idx_payments_company_invoice ON payments(company_id, invoice_id);
    `);
  } catch (err) {
    // Non-fatal if table already exists or schema managed by Prisma
  }
}

/**
 * GET /parties
 * List parties filtered by type ('supplier' | 'customer' | 'both') with optional search
 */
router.get('/', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const type = typeof req.query.type === 'string' ? req.query.type.trim().toLowerCase() : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  try {
    // Ensure default Cash customer exists
    await ensureCashParty(companyId);

    const where: any = { companyId };

    if (type && ['supplier', 'customer', 'both'].includes(type)) {
      if (type === 'supplier') {
        where.type = { in: ['supplier', 'both'] };
      } else if (type === 'customer') {
        where.type = { in: ['customer', 'both'] };
      } else {
        where.type = 'both';
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { mailTo: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { mobile: { contains: search, mode: 'insensitive' } },
        { gstin: { contains: search, mode: 'insensitive' } },
        { station: { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } },
        { drugLicenseNo: { contains: search, mode: 'insensitive' } }
      ];
    }

    const parties = await prisma.party.findMany({
      where,
      orderBy: [
        { isCash: 'desc' },
        { name: 'asc' }
      ]
    });

    const formatted = parties.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      station: p.station,
      accountGroup: p.accountGroup || (p.type === 'supplier' ? 'SUNDRY_CREDITORS' : 'SUNDRY_DEBTORS'),
      balancingMethod: p.balancingMethod,
      openingBalance: Number(p.openingBalance),
      openingBalanceType: p.openingBalanceType,
      mailTo: p.mailTo || p.name,
      address: p.address,
      pincode: p.pincode,
      state: p.state,
      stateCode: p.stateCode,
      country: p.country,
      phone: p.phone,
      mobile: p.mobile,
      faxNo: p.faxNo,
      email: p.email,
      website: p.website,
      contactPerson: p.contactPerson,
      designation: p.designation,
      gstin: p.gstin,
      drugLicenseNo: p.drugLicenseNo,
      dlExpiryDate: p.dlExpiryDate ? p.dlExpiryDate.toISOString() : null,
      fssaiNo: p.fssaiNo,
      fssaiExpiryDate: p.fssaiExpiryDate ? p.fssaiExpiryDate.toISOString() : null,
      panNo: p.panNo,
      scheduleHNotice: p.scheduleHNotice,
      holdPayment: p.holdPayment,
      ledgerCategory: p.ledgerCategory,
      defaultDoctorName: p.defaultDoctorName,
      defaultDoctorRegNo: p.defaultDoctorRegNo,
      isCash: p.isCash,
      creditLimit: Number(p.creditLimit),
      outstandingBalance: Number(p.outstandingBalance),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString()
    }));

    res.status(200).json({ parties: formatted });
  } catch (error: any) {
    console.error('Error fetching parties:', error);
    res.status(500).json({ error: 'Failed to fetch parties' });
  }
});

/**
 * POST /parties/bulk-import
 * Bulk import party ledgers from Excel or CSV
 */
router.post('/bulk-import', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { parties } = req.body;

  if (!Array.isArray(parties) || parties.length === 0) {
    res.status(400).json({ error: 'parties array is required and must not be empty' });
    return;
  }

  try {
    // Fetch existing party names for deduplication
    const existingParties = await prisma.party.findMany({
      where: { companyId },
      select: { name: true, mailTo: true }
    });

    const existingNames = new Set(
      existingParties.flatMap(p => [
        p.name.toLowerCase().trim(),
        (p.mailTo || '').toLowerCase().trim()
      ]).filter(Boolean)
    );

    const validParties: any[] = [];
    const seenNames = new Set<string>();

    for (const p of parties) {
      const name = (p.name || p.ledgerName || p['Ledger Name'] || p.firmName || '').toString().trim();
      if (!name) continue;

      const normalized = name.toLowerCase();
      if (existingNames.has(normalized) || seenNames.has(normalized)) {
        continue; // Skip duplicate
      }
      seenNames.add(normalized);

      const type = (p.type || 'supplier').toString().toLowerCase() === 'customer' ? 'customer' : 'supplier';
      const openBal = parseFloat(p.openingBalance || p['Opening Balance'] || '0') || 0;
      const openBalType = (p.openingBalanceType || 'CR').toString().toUpperCase() === 'DR' ? 'DR' : 'CR';

      validParties.push({
        companyId,
        name,
        mailTo: p.mailTo || p['Billing / Mail Name'] || name,
        type,
        station: (p.station || p['Station'] || 'LOCAL').toString(),
        accountGroup: (p.accountGroup || (type === 'supplier' ? 'SUNDRY_CREDITORS' : 'SUNDRY_DEBTORS')).toString(),
        balancingMethod: (p.balancingMethod || 'BILL_BY_BILL').toString(),
        openingBalance: openBal,
        openingBalanceType: openBalType,
        outstandingBalance: openBal,
        address: (p.address || p['Address'] || null)?.toString() || null,
        pincode: (p.pincode || p['Pincode'] || null)?.toString() || null,
        state: (p.state || p['State'] || 'UTTAR PRADESH').toString(),
        stateCode: (p.stateCode || '09').toString(),
        country: 'INDIA',
        phone: (p.phone || p['Phone'] || null)?.toString() || null,
        mobile: (p.mobile || p['Mobile'] || null)?.toString() || null,
        email: (p.email || p['Email'] || null)?.toString() || null,
        contactPerson: (p.contactPerson || p['Contact Person'] || null)?.toString() || null,
        designation: (p.designation || null)?.toString() || null,
        gstin: (p.gstin || p['GSTIN'] || null)?.toString().toUpperCase() || null,
        drugLicenseNo: (p.drugLicenseNo || p['Drug License'] || p['DL No'] || null)?.toString() || null,
        fssaiNo: (p.fssaiNo || p['FSSAI'] || null)?.toString() || null,
        panNo: (p.panNo || p['PAN'] || null)?.toString().toUpperCase() || null,
        ledgerCategory: (p.ledgerCategory || (p.gstin ? 'REGISTERED' : 'UNREGISTERED')),
        creditLimit: parseFloat(p.creditLimit || '0') || 0,
        isCash: false
      });
    }

    if (validParties.length > 0) {
      await prisma.party.createMany({
        data: validParties,
        skipDuplicates: true
      });
    }

    res.status(200).json({
      success: true,
      importedCount: validParties.length,
      skippedCount: parties.length - validParties.length,
      message: `Successfully imported ${validParties.length} party ledgers.`
    });
  } catch (error: any) {
    console.error('Failed to bulk import party ledgers:', error);
    res.status(500).json({ error: error.message || 'Failed to bulk import party ledgers' });
  }
});

/**
 * POST /parties
 * Create new party (Supplier or Customer Ledger)
 */
router.post('/', idempotencyMiddleware, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const {
    name,
    type,
    station,
    accountGroup,
    balancingMethod = 'BILL_BY_BILL',
    openingBalance = 0,
    openingBalanceType = 'CR',
    mailTo,
    address,
    pincode,
    state,
    stateCode,
    country = 'INDIA',
    phone,
    mobile,
    faxNo,
    email,
    website,
    contactPerson,
    designation,
    gstin,
    drugLicenseNo,
    dlExpiryDate,
    fssaiNo,
    fssaiExpiryDate,
    panNo,
    scheduleHNotice = 'ALLOW_ALL',
    holdPayment = false,
    ledgerCategory = 'REGISTERED',
    defaultDoctorName,
    defaultDoctorRegNo,
    creditLimit = 0
  } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    res.status(400).json({ error: 'Party name must be at least 2 characters long' });
    return;
  }

  const partyType = (type && ['supplier', 'customer', 'both'].includes(type.toLowerCase()))
    ? type.toLowerCase()
    : 'customer';

  const trimmedName = name.trim();
  const cleanGstin = gstin && typeof gstin === 'string' ? gstin.trim().toUpperCase() : null;
  const cleanDL = drugLicenseNo && typeof drugLicenseNo === 'string' ? drugLicenseNo.trim().toUpperCase() : null;
  const cleanPhone = phone && typeof phone === 'string' ? phone.trim() : null;
  const cleanMobile = mobile && typeof mobile === 'string' ? mobile.trim() : null;
  const cleanAddress = address && typeof address === 'string' ? address.trim() : null;
  const cleanEmail = email && typeof email === 'string' ? email.trim().toLowerCase() : null;

  let parsedDLExpiry: Date | null = null;
  if (dlExpiryDate) {
    parsedDLExpiry = new Date(dlExpiryDate);
    if (isNaN(parsedDLExpiry.getTime())) {
      parsedDLExpiry = null;
    }
  }

  let parsedFSSAIExpiry: Date | null = null;
  if (fssaiExpiryDate) {
    parsedFSSAIExpiry = new Date(fssaiExpiryDate);
    if (isNaN(parsedFSSAIExpiry.getTime())) {
      parsedFSSAIExpiry = null;
    }
  }

  try {
    const existing = await prisma.party.findUnique({
      where: {
        companyId_name_type: {
          companyId,
          name: trimmedName,
          type: partyType
        }
      }
    });

    if (existing) {
      res.status(409).json({ error: `A ${partyType} named "${trimmedName}" already exists` });
      return;
    }

    const numOpeningBalance = Math.max(0, parseFloat(openingBalance) || 0);

    const party = await prisma.party.create({
      data: {
        companyId,
        name: trimmedName,
        type: partyType,
        station: station ? String(station).trim().toUpperCase() : null,
        accountGroup: accountGroup || (partyType === 'supplier' ? 'SUNDRY_CREDITORS' : 'SUNDRY_DEBTORS'),
        balancingMethod,
        openingBalance: numOpeningBalance,
        openingBalanceType,
        mailTo: mailTo ? String(mailTo).trim() : trimmedName,
        address: cleanAddress,
        pincode: pincode ? String(pincode).trim() : null,
        state: state ? String(state).trim() : null,
        stateCode: stateCode ? String(stateCode).trim() : null,
        country: country || 'INDIA',
        phone: cleanPhone,
        mobile: cleanMobile,
        faxNo: faxNo ? String(faxNo).trim() : null,
        email: cleanEmail,
        website: website ? String(website).trim() : null,
        contactPerson: contactPerson ? String(contactPerson).trim() : null,
        designation: designation ? String(designation).trim() : null,
        gstin: cleanGstin,
        drugLicenseNo: cleanDL,
        dlExpiryDate: parsedDLExpiry,
        fssaiNo: fssaiNo ? String(fssaiNo).trim().toUpperCase() : null,
        fssaiExpiryDate: parsedFSSAIExpiry,
        panNo: panNo ? String(panNo).trim().toUpperCase() : null,
        scheduleHNotice,
        holdPayment: Boolean(holdPayment),
        ledgerCategory,
        defaultDoctorName: defaultDoctorName ? String(defaultDoctorName).trim() : null,
        defaultDoctorRegNo: defaultDoctorRegNo ? String(defaultDoctorRegNo).trim() : null,
        creditLimit: creditLimit ? Number(creditLimit) : 0,
        outstandingBalance: numOpeningBalance
      }
    });

    res.status(201).json({
      party: {
        ...party,
        creditLimit: Number(party.creditLimit),
        outstandingBalance: Number(party.outstandingBalance),
        openingBalance: Number(party.openingBalance)
      },
      message: `${partyType === 'supplier' ? 'Supplier' : 'Customer'} ledger created successfully`
    });
  } catch (error: any) {
    console.error('Error creating party:', error);
    res.status(500).json({ error: error.message || 'Failed to create party ledger' });
  }
});

/**
 * GET /parties/:id
 */
router.get('/:id', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { id } = req.params;

  try {
    const party = await prisma.party.findFirst({
      where: { id, companyId }
    });

    if (!party) {
      res.status(404).json({ error: 'Party not found' });
      return;
    }

    res.status(200).json({
      party: {
        ...party,
        creditLimit: Number(party.creditLimit),
        outstandingBalance: Number(party.outstandingBalance),
        openingBalance: Number(party.openingBalance)
      }
    });
  } catch (error: any) {
    console.error('Error fetching party:', error);
    res.status(500).json({ error: 'Failed to fetch party' });
  }
});

/**
 * PUT /parties/:id
 */
router.put('/:id', idempotencyMiddleware, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { id } = req.params;
  const {
    name,
    type,
    station,
    accountGroup,
    balancingMethod,
    openingBalance,
    openingBalanceType,
    mailTo,
    address,
    pincode,
    state,
    stateCode,
    country,
    phone,
    mobile,
    faxNo,
    email,
    website,
    contactPerson,
    designation,
    gstin,
    drugLicenseNo,
    dlExpiryDate,
    fssaiNo,
    fssaiExpiryDate,
    panNo,
    scheduleHNotice,
    holdPayment,
    ledgerCategory,
    defaultDoctorName,
    defaultDoctorRegNo,
    creditLimit
  } = req.body;

  try {
    const existing = await prisma.party.findFirst({
      where: { id, companyId }
    });

    if (!existing) {
      res.status(404).json({ error: 'Party not found' });
      return;
    }

    let parsedDLExpiry = existing.dlExpiryDate;
    if (dlExpiryDate !== undefined) {
      parsedDLExpiry = dlExpiryDate ? new Date(dlExpiryDate) : null;
    }

    let parsedFSSAIExpiry = existing.fssaiExpiryDate;
    if (fssaiExpiryDate !== undefined) {
      parsedFSSAIExpiry = fssaiExpiryDate ? new Date(fssaiExpiryDate) : null;
    }

    const updated = await prisma.party.update({
      where: { id },
      data: {
        name: name !== undefined ? String(name).trim() : existing.name,
        type: type !== undefined ? String(type).trim().toLowerCase() : existing.type,
        station: station !== undefined ? (station ? String(station).trim().toUpperCase() : null) : existing.station,
        accountGroup: accountGroup !== undefined ? accountGroup : existing.accountGroup,
        balancingMethod: balancingMethod !== undefined ? balancingMethod : existing.balancingMethod,
        openingBalance: openingBalance !== undefined ? Number(openingBalance) : existing.openingBalance,
        openingBalanceType: openingBalanceType !== undefined ? openingBalanceType : existing.openingBalanceType,
        mailTo: mailTo !== undefined ? (mailTo ? String(mailTo).trim() : null) : existing.mailTo,
        address: address !== undefined ? (address ? String(address).trim() : null) : existing.address,
        pincode: pincode !== undefined ? (pincode ? String(pincode).trim() : null) : existing.pincode,
        state: state !== undefined ? (state ? String(state).trim() : null) : existing.state,
        stateCode: stateCode !== undefined ? (stateCode ? String(stateCode).trim() : null) : existing.stateCode,
        country: country !== undefined ? (country ? String(country).trim() : 'INDIA') : existing.country,
        phone: phone !== undefined ? (phone ? String(phone).trim() : null) : existing.phone,
        mobile: mobile !== undefined ? (mobile ? String(mobile).trim() : null) : existing.mobile,
        faxNo: faxNo !== undefined ? (faxNo ? String(faxNo).trim() : null) : existing.faxNo,
        email: email !== undefined ? (email ? String(email).trim().toLowerCase() : null) : existing.email,
        website: website !== undefined ? (website ? String(website).trim() : null) : existing.website,
        contactPerson: contactPerson !== undefined ? (contactPerson ? String(contactPerson).trim() : null) : existing.contactPerson,
        designation: designation !== undefined ? (designation ? String(designation).trim() : null) : existing.designation,
        gstin: gstin !== undefined ? (gstin ? String(gstin).trim().toUpperCase() : null) : existing.gstin,
        drugLicenseNo: drugLicenseNo !== undefined ? (drugLicenseNo ? String(drugLicenseNo).trim().toUpperCase() : null) : existing.drugLicenseNo,
        dlExpiryDate: parsedDLExpiry,
        fssaiNo: fssaiNo !== undefined ? (fssaiNo ? String(fssaiNo).trim().toUpperCase() : null) : existing.fssaiNo,
        fssaiExpiryDate: parsedFSSAIExpiry,
        panNo: panNo !== undefined ? (panNo ? String(panNo).trim().toUpperCase() : null) : existing.panNo,
        scheduleHNotice: scheduleHNotice !== undefined ? scheduleHNotice : existing.scheduleHNotice,
        holdPayment: holdPayment !== undefined ? Boolean(holdPayment) : existing.holdPayment,
        ledgerCategory: ledgerCategory !== undefined ? ledgerCategory : existing.ledgerCategory,
        defaultDoctorName: defaultDoctorName !== undefined ? (defaultDoctorName ? String(defaultDoctorName).trim() : null) : existing.defaultDoctorName,
        defaultDoctorRegNo: defaultDoctorRegNo !== undefined ? (defaultDoctorRegNo ? String(defaultDoctorRegNo).trim() : null) : existing.defaultDoctorRegNo,
        creditLimit: creditLimit !== undefined ? Number(creditLimit) : existing.creditLimit
      }
    });

    res.status(200).json({
      party: {
        ...updated,
        creditLimit: Number(updated.creditLimit),
        outstandingBalance: Number(updated.outstandingBalance),
        openingBalance: Number(updated.openingBalance)
      },
      message: 'Ledger updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating party:', error);
    res.status(500).json({ error: error.message || 'Failed to update party' });
  }
});

/**
 * GET /parties/:id/statement
 * Comprehensive Ledger Statement of all Purchases, Returns/CNs, and Payments
 */
router.get('/:id/statement', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { id } = req.params;
  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;

  try {
    const party = await prisma.party.findFirst({
      where: { id, companyId }
    });

    if (!party) {
      res.status(404).json({ error: 'Party ledger not found' });
      return;
    }

    // Parse date filters safely
    const parsedStart = parseFilterStartDate(startDate);
    const parsedEnd = parseFilterEndDate(endDate);


    // Find all party IDs in this company that share the same ID, name, mailTo, or GSTIN
    const partyName = party.name.trim();
    const partyMailTo = (party.mailTo || '').trim();
    const partyGstin = (party.gstin || '').trim();
    const firstWord = partyName.split(/[\s,.-]+/)[0] || '';

    const relatedParties = await prisma.party.findMany({
      where: {
        companyId,
        OR: [
          { id },
          ...(partyName ? [{ name: { equals: partyName, mode: 'insensitive' as const } }] : []),
          ...(partyMailTo ? [{ mailTo: { equals: partyMailTo, mode: 'insensitive' as const } }] : []),
          ...(partyGstin ? [{ gstin: { equals: partyGstin, mode: 'insensitive' as const } }] : []),
          ...(firstWord.length >= 3 ? [{ name: { contains: firstWord, mode: 'insensitive' as const } }] : [])
        ]
      },
      select: { id: true }
    });
    const partyIds = Array.from(new Set(relatedParties.map(p => p.id)));

    // Base conditions for this supplier / customer
    const basePurchaseWhere: any = {
      companyId,
      OR: [
        { supplierId: { in: partyIds } },
        ...(firstWord.length >= 3 ? [{ supplier: { name: { contains: firstWord, mode: 'insensitive' as const } } }] : []),
        ...(partyName.length >= 3 ? [{ supplier: { name: { contains: partyName, mode: 'insensitive' as const } } }] : [])
      ]
    };
    const baseReturnWhere: any = {
      companyId,
      OR: [
        { supplierId: { in: partyIds } },
        ...(firstWord.length >= 3 ? [{ supplier: { name: { contains: firstWord, mode: 'insensitive' as const } } }] : []),
        ...(partyName.length >= 3 ? [{ supplier: { name: { contains: partyName, mode: 'insensitive' as const } } }] : [])
      ]
    };
    const baseInvoiceWhere: any = {
      companyId,
      OR: [
        { partyId: { in: partyIds } },
        ...(partyName ? [{ customerName: { equals: partyName, mode: 'insensitive' as const } }] : []),
        ...(firstWord.length >= 3 ? [{ customerName: { contains: firstWord, mode: 'insensitive' as const } }] : [])
      ]
    };

    // Ensure payments table exists
    await ensurePaymentsTableExists();

    // 1. Fetch all historical transactions for this party to accurately partition into Prior Period vs In-Period
    let allPurchases: any[] = [];
    let allReturns: any[] = [];
    let allInvoices: any[] = [];
    let allPartyPayments: any[] = [];

    try {
      allPurchases = await prisma.purchase.findMany({
        where: basePurchaseWhere,
        include: {
          items: {
            include: { item: { select: { name: true, sku: true } } }
          }
        },
        orderBy: { purchaseDate: 'asc' }
      });
    } catch (e: any) {
      console.warn('Purchases query error:', e.message);
    }

    try {
      allReturns = await prisma.purchaseReturn.findMany({
        where: baseReturnWhere,
        include: {
          items: {
            include: { item: { select: { name: true, sku: true } } }
          }
        },
        orderBy: { returnDate: 'asc' }
      });
    } catch (e: any) {
      console.warn('purchaseReturn query skipped:', e.message);
    }

    try {
      allInvoices = await prisma.invoice.findMany({
        where: baseInvoiceWhere,
        include: {
          items: {
            include: { item: { select: { name: true, sku: true } } }
          }
        },
        orderBy: { invoiceDate: 'asc' }
      });
    } catch (e: any) {
      console.warn('Invoices query error:', e.message);
    }

    try {
      allPartyPayments = await prisma.payment.findMany({
        where: {
          companyId,
          partyId: { in: partyIds }
        },
        orderBy: { paymentDate: 'asc' }
      });
    } catch (e: any) {
      console.warn('Payments query error:', e.message);
    }

    // Determine unlinked legacy payments from purchases and sales
    interface ResolvedPayment {
      date: Date;
      voucherNo: string;
      referenceId: string;
      type: 'PAYMENT';
      typeLabel: string;
      particulars: string;
      amount: number;
    }

    const resolvedPayments: ResolvedPayment[] = [];

    // A. Add all formal payments from the payments table
    for (const pay of allPartyPayments) {
      resolvedPayments.push({
        date: new Date(pay.paymentDate),
        voucherNo: pay.voucherNo,
        referenceId: pay.id,
        type: 'PAYMENT',
        typeLabel: pay.paymentType === 'PAYMENT_OUT' ? 'Payment Made' : 'Payment Received',
        particulars: pay.notes || (pay.purchaseId ? `Payment for Bill #${pay.voucherNo}` : `Payment (${pay.paymentMode})`),
        amount: Number(pay.amount)
      });
    }

    // B. Check for legacy purchase payments not in payments table
    for (const p of allPurchases) {
      const totPaid = Number(p.paidAmount || 0);
      if (totPaid <= 0) continue;

      const linked = allPartyPayments.filter(pay => pay.purchaseId === p.id);
      const linkedTotal = linked.reduce((sum, pay) => sum + Number(pay.amount), 0);
      const unlinkedPaid = Math.round((totPaid - linkedTotal) * 100) / 100;

      if (unlinkedPaid > 0.001) {
        // If updatedAt is significantly after purchaseDate (>2h), the payment was recorded later!
        const pDate = new Date(p.purchaseDate);
        const uDate = p.updatedAt ? new Date(p.updatedAt) : pDate;
        const wasUpdatedLater = (uDate.getTime() - pDate.getTime()) > (2 * 60 * 60 * 1000);
        const legacyDate = wasUpdatedLater ? uDate : pDate;

        resolvedPayments.push({
          date: legacyDate,
          voucherNo: `PAY-${p.invoiceNumber}`,
          referenceId: p.id,
          type: 'PAYMENT',
          typeLabel: 'Payment Made',
          particulars: `Payment for Bill #${p.invoiceNumber} (${p.paymentMode})`,
          amount: unlinkedPaid
        });
      }
    }

    // C. Check for legacy invoice payments not in payments table
    for (const inv of allInvoices) {
      const totPaid = Number(inv.paidAmount || 0);
      if (totPaid <= 0) continue;

      const linked = allPartyPayments.filter(pay => pay.invoiceId === inv.id);
      const linkedTotal = linked.reduce((sum, pay) => sum + Number(pay.amount), 0);
      const unlinkedPaid = Math.round((totPaid - linkedTotal) * 100) / 100;

      if (unlinkedPaid > 0.001) {
        const iDate = new Date(inv.invoiceDate);
        const uDate = inv.updatedAt ? new Date(inv.updatedAt) : iDate;
        const wasUpdatedLater = (uDate.getTime() - iDate.getTime()) > (2 * 60 * 60 * 1000);
        const legacyDate = wasUpdatedLater ? uDate : iDate;

        resolvedPayments.push({
          date: legacyDate,
          voucherNo: `REC-${inv.invoiceNumber}`,
          referenceId: inv.id,
          type: 'PAYMENT',
          typeLabel: 'Payment Received',
          particulars: `Received for Bill #${inv.invoiceNumber} (${inv.paymentMode})`,
          amount: unlinkedPaid
        });
      }
    }

    // 2. Compute Prior Period Accumulations (strictly before parsedStart)
    let priorPurchasesTotal = 0;
    let priorReturnsTotal = 0;
    let priorInvoicesTotal = 0;
    let priorPaymentsTotal = 0;

    if (parsedStart) {
      const startMs = parsedStart.getTime();

      for (const p of allPurchases) {
        if (new Date(p.purchaseDate).getTime() < startMs) {
          priorPurchasesTotal += Number(p.totalAmount);
        }
      }

      for (const r of allReturns) {
        if (new Date(r.returnDate).getTime() < startMs) {
          priorReturnsTotal += Number(r.totalAmount);
        }
      }

      for (const inv of allInvoices) {
        if (new Date(inv.invoiceDate).getTime() < startMs) {
          priorInvoicesTotal += Number(inv.grandTotal);
        }
      }

      for (const pay of resolvedPayments) {
        if (pay.date.getTime() < startMs) {
          priorPaymentsTotal += pay.amount;
        }
      }
    }

    // 3. Compute Effective Period Opening Balance
    const rawOpeningBalance = Number(party.openingBalance || 0);
    const outstanding = Number(party.outstandingBalance || 0);
    const initialOpeningBalance = rawOpeningBalance > 0
      ? rawOpeningBalance
      : (allPurchases.length === 0 && allReturns.length === 0 && outstanding > 0 ? outstanding : rawOpeningBalance);
    const openingType = party.openingBalanceType || (party.type === 'supplier' ? 'CR' : 'DR');

    let periodOpeningBalance = initialOpeningBalance;
    if (parsedStart) {
      const priorDebit = priorPurchasesTotal + priorInvoicesTotal;
      const priorCredit = priorReturnsTotal + priorPaymentsTotal;
      periodOpeningBalance = initialOpeningBalance + (priorDebit - priorCredit);
    }

    // 4. Filter In-Period Transactions
    const startMs = parsedStart ? parsedStart.getTime() : null;
    const endMs = parsedEnd ? parsedEnd.getTime() : null;

    const isInPeriod = (d: Date) => {
      const ms = d.getTime();
      if (startMs !== null && ms < startMs) return false;
      if (endMs !== null && ms > endMs) return false;
      return true;
    };

    // Build unified chronological ledger stream
    const rawTransactions: Array<{
      date: Date;
      type: 'OPENING_BALANCE' | 'PURCHASE' | 'PURCHASE_RETURN' | 'PAYMENT' | 'SALE';
      typeLabel: string;
      voucherNo: string;
      referenceId: string;
      particulars: string;
      itemDetails?: any[];
      debit: number;
      credit: number;
    }> = [];

    // 0. Include Period Opening Balance Row
    if (periodOpeningBalance !== 0 || allPurchases.length > 0 || allReturns.length > 0) {
      rawTransactions.push({
        date: parsedStart || party.createdAt || new Date('2026-01-01'),
        type: 'OPENING_BALANCE',
        typeLabel: 'Opening Balance',
        voucherNo: 'OP-BAL',
        referenceId: party.id,
        particulars: parsedStart
          ? `Opening Balance as on ${parsedStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
          : `Opening Balance as per Books (${openingType})`,
        debit: periodOpeningBalance >= 0 ? periodOpeningBalance : 0,
        credit: periodOpeningBalance < 0 ? Math.abs(periodOpeningBalance) : 0
      });
    }

    // 1. In-Period Purchases
    for (const p of allPurchases) {
      const pDate = new Date(p.purchaseDate);
      if (!isInPeriod(pDate)) continue;

      const tot = Number(p.totalAmount);
      const itemSummary = p.items.map((i: any) => `${i.item?.name || 'Medicine'} (${i.batchNumber}) x ${i.quantity}`).join(', ');

      rawTransactions.push({
        date: pDate,
        type: 'PURCHASE',
        typeLabel: 'Purchase Bill Inward',
        voucherNo: p.invoiceNumber,
        referenceId: p.id,
        particulars: itemSummary || `Purchase Invoice #${p.invoiceNumber}`,
        itemDetails: p.items.map((i: any) => ({
          medicineName: i.item?.name || 'Medicine',
          sku: i.item?.sku || '',
          batchNumber: i.batchNumber,
          quantity: i.quantity,
          rate: Number(i.purchaseRate),
          total: Number(i.totalAmount)
        })),
        debit: tot,
        credit: 0
      });
    }

    // 2. In-Period Supplier Returns (CN)
    for (const r of allReturns) {
      const rDate = new Date(r.returnDate);
      if (!isInPeriod(rDate)) continue;

      const tot = Number(r.totalAmount);
      const itemSummary = r.items.map((i: any) => `${i.item?.name || 'Medicine'} (Batch: ${i.batchNumber}) x ${i.strips > 0 ? `${i.strips} Str` : ''}${i.looseQty > 0 ? ` + ${i.looseQty} Loose` : ''}`).join(', ');

      rawTransactions.push({
        date: rDate,
        type: 'PURCHASE_RETURN',
        typeLabel: 'Supplier Return (CN / Debit Note)',
        voucherNo: r.returnNumber,
        referenceId: r.id,
        particulars: `Returned: ${itemSummary || r.reason || 'Expired/Slow-moving'}`,
        itemDetails: r.items.map((i: any) => ({
          medicineName: i.item?.name || 'Medicine',
          sku: i.item?.sku || '',
          batchNumber: i.batchNumber,
          strips: i.strips,
          looseQty: i.looseQty,
          quantity: i.quantity,
          rate: Number(i.returnRate),
          total: Number(i.totalAmount)
        })),
        debit: 0,
        credit: tot
      });
    }

    // 3. In-Period Customer Sales Invoices
    for (const inv of allInvoices) {
      const iDate = new Date(inv.invoiceDate);
      if (!isInPeriod(iDate)) continue;

      const tot = Number(inv.grandTotal);
      const itemSummary = inv.items.map((i: any) => `${i.item?.name || 'Medicine'} x ${i.quantity}`).join(', ');

      rawTransactions.push({
        date: iDate,
        type: 'SALE',
        typeLabel: 'Sales Invoice',
        voucherNo: inv.invoiceNumber,
        referenceId: inv.id,
        particulars: itemSummary || `Sales Invoice #${inv.invoiceNumber}`,
        itemDetails: inv.items.map((i: any) => ({
          medicineName: i.item?.name || 'Medicine',
          sku: i.item?.sku || '',
          quantity: i.quantity,
          rate: Number(i.unitPrice),
          total: Number(i.taxableAmount.add(i.cgstAmount).add(i.sgstAmount))
        })),
        debit: tot,
        credit: 0
      });
    }

    // 4. In-Period Payments (Exact Date)
    for (const pay of resolvedPayments) {
      if (!isInPeriod(pay.date)) continue;

      rawTransactions.push({
        date: pay.date,
        type: 'PAYMENT',
        typeLabel: pay.typeLabel,
        voucherNo: pay.voucherNo,
        referenceId: pay.referenceId,
        particulars: pay.particulars,
        debit: 0,
        credit: pay.amount
      });
    }

    // 4. Sort chronologically
    rawTransactions.sort((a, b) => a.date.getTime() - b.date.getTime());

    // 5. Calculate running balance
    let runningBalance = 0;
    let totalPurchases = 0;
    let totalReturns = 0;
    let totalPayments = 0;

    const ledgerTransactions = rawTransactions.map(t => {
      if (t.type === 'OPENING_BALANCE') {
        runningBalance += (t.debit - t.credit);
      } else if (t.type === 'PURCHASE' || t.type === 'SALE') {
        totalPurchases += t.debit;
        runningBalance += t.debit;
      } else if (t.type === 'PURCHASE_RETURN') {
        totalReturns += t.credit;
        runningBalance -= t.credit;
      } else if (t.type === 'PAYMENT') {
        totalPayments += t.credit;
        runningBalance -= t.credit;
      }

      return {
        ...t,
        date: t.date.toISOString(),
        runningBalance: Math.round(runningBalance * 100) / 100
      };
    });

    const finalOutstanding = ledgerTransactions.length > 0
      ? ledgerTransactions[ledgerTransactions.length - 1].runningBalance
      : (periodOpeningBalance !== 0 ? periodOpeningBalance : Number(party.outstandingBalance || 0));

    res.status(200).json({
      party: {
        id: party.id,
        name: party.name,
        type: party.type,
        station: party.station,
        phone: party.phone,
        mobile: party.mobile,
        gstin: party.gstin,
        drugLicenseNo: party.drugLicenseNo,
        address: party.address,
        openingBalance: Math.round(periodOpeningBalance * 100) / 100,
        openingBalanceType: openingType,
        outstandingBalance: Math.round(finalOutstanding * 100) / 100
      },
      summary: {
        openingBalance: Math.round(periodOpeningBalance * 100) / 100,
        openingBalanceType: openingType,
        purchaseCount: rawTransactions.filter(t => t.type === 'PURCHASE').length,
        totalPurchases: Math.round(totalPurchases * 100) / 100,
        returnCount: rawTransactions.filter(t => t.type === 'PURCHASE_RETURN').length,
        totalReturns: Math.round(totalReturns * 100) / 100,
        paymentCount: rawTransactions.filter(t => t.type === 'PAYMENT').length,
        totalPayments: Math.round(totalPayments * 100) / 100,
        netOutstanding: Math.round(finalOutstanding * 100) / 100
      },
      transactions: ledgerTransactions
    });

  } catch (error: any) {
    console.error('Failed to load party statement:', error);
    res.status(500).json({ error: error.message || 'Failed to retrieve party statement' });
  }
});

export default router;


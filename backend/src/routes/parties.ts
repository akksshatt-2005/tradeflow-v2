import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireCompany, CompanyScopedRequest } from '../middleware/company.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import prisma from '../prisma.js';

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
    let parsedStart: Date | undefined;
    let parsedEnd: Date | undefined;
    if (startDate) {
      const [sY, sM, sD] = startDate.split('-').map(Number);
      parsedStart = new Date(sY, sM - 1, sD, 0, 0, 0, 0);
    }
    if (endDate) {
      const [eY, eM, eD] = endDate.split('-').map(Number);
      parsedEnd = new Date(eY, eM - 1, eD, 23, 59, 59, 999);
    }

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

    // 1. If startDate is set, compute Prior Period Accumulations to arrive at exact Period Opening Balance
    let priorPurchasesTotal = 0;
    let priorPurchasesPaid = 0;
    let priorReturnsTotal = 0;
    let priorInvoicesTotal = 0;
    let priorInvoicesPaid = 0;

    if (parsedStart) {
      const [priorP, priorR, priorI] = await Promise.all([
        prisma.purchase.findMany({
          where: { ...basePurchaseWhere, purchaseDate: { lt: parsedStart } },
          select: { totalAmount: true, paidAmount: true }
        }),
        prisma.purchaseReturn.findMany({
          where: { ...baseReturnWhere, returnDate: { lt: parsedStart } },
          select: { totalAmount: true }
        }),
        prisma.invoice.findMany({
          where: { ...baseInvoiceWhere, invoiceDate: { lt: parsedStart } },
          select: { grandTotal: true, paidAmount: true }
        })
      ]);

      priorPurchasesTotal = priorP.reduce((sum, p) => sum + Number(p.totalAmount), 0);
      priorPurchasesPaid = priorP.reduce((sum, p) => sum + Number(p.paidAmount || 0), 0);
      priorReturnsTotal = priorR.reduce((sum, r) => sum + Number(r.totalAmount), 0);
      priorInvoicesTotal = priorI.reduce((sum, i) => sum + Number(i.grandTotal), 0);
      priorInvoicesPaid = priorI.reduce((sum, i) => sum + Number(i.paidAmount || 0), 0);
    }

    // 2. Query in-period purchases, returns, and invoices
    const inPeriodPurchaseWhere = { ...basePurchaseWhere };
    const inPeriodReturnWhere = { ...baseReturnWhere };
    const inPeriodInvoiceWhere = { ...baseInvoiceWhere };

    if (parsedStart || parsedEnd) {
      const dFilter: any = {};
      if (parsedStart) dFilter.gte = parsedStart;
      if (parsedEnd) dFilter.lte = parsedEnd;

      inPeriodPurchaseWhere.purchaseDate = dFilter;
      inPeriodReturnWhere.returnDate = dFilter;
      inPeriodInvoiceWhere.invoiceDate = dFilter;
    }

    const [purchases, returns, invoices] = await Promise.all([
      prisma.purchase.findMany({
        where: inPeriodPurchaseWhere,
        include: {
          items: {
            include: { item: { select: { name: true, sku: true } } }
          }
        },
        orderBy: { purchaseDate: 'asc' }
      }),
      prisma.purchaseReturn.findMany({
        where: inPeriodReturnWhere,
        include: {
          items: {
            include: { item: { select: { name: true, sku: true } } }
          }
        },
        orderBy: { returnDate: 'asc' }
      }),
      prisma.invoice.findMany({
        where: inPeriodInvoiceWhere,
        include: {
          items: {
            include: { item: { select: { name: true, sku: true } } }
          }
        },
        orderBy: { invoiceDate: 'asc' }
      })
    ]);

    const rawOpeningBalance = Number(party.openingBalance || 0);
    const outstanding = Number(party.outstandingBalance || 0);
    const initialOpeningBalance = rawOpeningBalance > 0
      ? rawOpeningBalance
      : (purchases.length === 0 && returns.length === 0 && outstanding > 0 ? outstanding : rawOpeningBalance);
    const openingType = party.openingBalanceType || (party.type === 'supplier' ? 'CR' : 'DR');

    // Effective Period Opening Balance (Base + Prior Debits - Prior Credits)
    let periodOpeningBalance = initialOpeningBalance;
    if (parsedStart) {
      // Prior debits increase balance, prior credits decrease balance
      const priorDebit = priorPurchasesTotal + priorInvoicesTotal;
      const priorCredit = priorReturnsTotal + priorPurchasesPaid + priorInvoicesPaid;
      periodOpeningBalance = initialOpeningBalance + (priorDebit - priorCredit);
    }

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
    if (periodOpeningBalance !== 0 || purchases.length > 0 || returns.length > 0) {
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

    // 1. Inward Purchases
    for (const p of purchases) {
      const tot = Number(p.totalAmount);
      const paid = Number(p.paidAmount || 0);
      const itemSummary = p.items.map(i => `${i.item?.name || 'Medicine'} (${i.batchNumber}) x ${i.quantity}`).join(', ');

      rawTransactions.push({
        date: p.purchaseDate,
        type: 'PURCHASE',
        typeLabel: 'Purchase Bill Inward',
        voucherNo: p.invoiceNumber,
        referenceId: p.id,
        particulars: itemSummary || `Purchase Invoice #${p.invoiceNumber}`,
        itemDetails: p.items.map(i => ({
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

      // If purchase had immediate partial or full payment
      if (paid > 0) {
        rawTransactions.push({
          date: p.purchaseDate,
          type: 'PAYMENT',
          typeLabel: 'Payment Made',
          voucherNo: `PAY-${p.invoiceNumber}`,
          referenceId: p.id,
          particulars: `Payment for Bill #${p.invoiceNumber} (${p.paymentMode})`,
          debit: 0,
          credit: paid
        });
      }
    }

    // 2. Supplier Returns / Credit Notes (CN)
    for (const r of returns) {
      const tot = Number(r.totalAmount);
      const itemSummary = r.items.map(i => `${i.item?.name || 'Medicine'} (Batch: ${i.batchNumber}) x ${i.strips > 0 ? `${i.strips} Str` : ''}${i.looseQty > 0 ? ` + ${i.looseQty} Loose` : ''}`).join(', ');

      rawTransactions.push({
        date: r.returnDate,
        type: 'PURCHASE_RETURN',
        typeLabel: 'Supplier Return (CN / Debit Note)',
        voucherNo: r.returnNumber,
        referenceId: r.id,
        particulars: `Returned: ${itemSummary || r.reason || 'Expired/Slow-moving'}`,
        itemDetails: r.items.map(i => ({
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

    // 3. Customer Sales Invoices
    for (const inv of invoices) {
      const tot = Number(inv.grandTotal);
      const paid = Number(inv.paidAmount || 0);
      const itemSummary = inv.items.map(i => `${i.item?.name || 'Medicine'} x ${i.quantity}`).join(', ');

      rawTransactions.push({
        date: inv.invoiceDate,
        type: 'SALE',
        typeLabel: 'Sales Invoice',
        voucherNo: inv.invoiceNumber,
        referenceId: inv.id,
        particulars: itemSummary || `Sales Invoice #${inv.invoiceNumber}`,
        itemDetails: inv.items.map(i => ({
          medicineName: i.item?.name || 'Medicine',
          sku: i.item?.sku || '',
          quantity: i.quantity,
          rate: Number(i.unitPrice),
          total: Number(i.taxableAmount.add(i.cgstAmount).add(i.sgstAmount))
        })),
        debit: tot,
        credit: 0
      });

      if (paid > 0) {
        rawTransactions.push({
          date: inv.invoiceDate,
          type: 'PAYMENT',
          typeLabel: 'Payment Received',
          voucherNo: `REC-${inv.invoiceNumber}`,
          referenceId: inv.id,
          particulars: `Received for Bill #${inv.invoiceNumber} (${inv.paymentMode})`,
          debit: 0,
          credit: paid
        });
      }
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
        purchaseCount: purchases.length,
        totalPurchases: Math.round(totalPurchases * 100) / 100,
        returnCount: returns.length,
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


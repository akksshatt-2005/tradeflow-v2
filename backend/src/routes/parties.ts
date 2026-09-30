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
 * DELETE /parties/:id
 */
router.delete('/:id', async (req: CompanyScopedRequest, res: Response) => {
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

    if (party.isCash) {
      res.status(400).json({ error: 'Default Cash party cannot be deleted' });
      return;
    }

    // Check if transactions exist
    const [purchaseCount, invoiceCount] = await Promise.all([
      prisma.purchase.count({ where: { supplierId: id } }),
      prisma.invoice.count({ where: { partyId: id } })
    ]);

    if (purchaseCount > 0 || invoiceCount > 0) {
      res.status(400).json({
        error: `Cannot delete "${party.name}" because it has ${purchaseCount} purchase bills and ${invoiceCount} sales invoices linked.`
      });
      return;
    }

    await prisma.party.delete({ where: { id } });

    res.status(200).json({ message: 'Party deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting party:', error);
    res.status(500).json({ error: error.message || 'Failed to delete party' });
  }
});

export default router;

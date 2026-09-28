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
 * Helper: Ensure standard system "Cash" party exists for the company (Rule E)
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
        { phone: { contains: search, mode: 'insensitive' } },
        { gstin: { contains: search, mode: 'insensitive' } },
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
      phone: p.phone,
      email: p.email,
      address: p.address,
      gstin: p.gstin,
      drugLicenseNo: p.drugLicenseNo,
      dlExpiryDate: p.dlExpiryDate ? p.dlExpiryDate.toISOString() : null,
      isCash: p.isCash,
      creditLimit: Number(p.creditLimit),
      outstandingBalance: Number(p.outstandingBalance),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }));

    res.status(200).json({ parties: formatted });
  } catch (error: any) {
    console.error('Error fetching parties:', error);
    res.status(500).json({ error: 'Failed to fetch parties' });
  }
});

/**
 * POST /parties
 * Create new party (Supplier or Customer)
 */
router.post('/', idempotencyMiddleware, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const {
    name,
    type,
    phone,
    email,
    address,
    gstin,
    drugLicenseNo,
    dlExpiryDate,
    creditLimit
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
  const cleanAddress = address && typeof address === 'string' ? address.trim() : null;
  const cleanEmail = email && typeof email === 'string' ? email.trim().toLowerCase() : null;

  let parsedDLExpiry: Date | null = null;
  if (dlExpiryDate) {
    parsedDLExpiry = new Date(dlExpiryDate);
    if (isNaN(parsedDLExpiry.getTime())) {
      res.status(400).json({ error: 'Invalid Drug License expiry date' });
      return;
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

    const party = await prisma.party.create({
      data: {
        companyId,
        name: trimmedName,
        type: partyType,
        phone: cleanPhone,
        email: cleanEmail,
        address: cleanAddress,
        gstin: cleanGstin,
        drugLicenseNo: cleanDL,
        dlExpiryDate: parsedDLExpiry,
        creditLimit: creditLimit ? Number(creditLimit) : 0,
        outstandingBalance: 0
      }
    });

    res.status(201).json({
      party: {
        id: party.id,
        name: party.name,
        type: party.type,
        phone: party.phone,
        email: party.email,
        address: party.address,
        gstin: party.gstin,
        drugLicenseNo: party.drugLicenseNo,
        dlExpiryDate: party.dlExpiryDate ? party.dlExpiryDate.toISOString() : null,
        isCash: party.isCash,
        creditLimit: Number(party.creditLimit),
        outstandingBalance: Number(party.outstandingBalance),
        createdAt: party.createdAt,
        updatedAt: party.updatedAt
      },
      message: `${partyType === 'supplier' ? 'Supplier' : 'Customer'} created successfully`
    });
  } catch (error: any) {
    console.error('Error creating party:', error);
    res.status(500).json({ error: 'Failed to create party' });
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
        outstandingBalance: Number(party.outstandingBalance)
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
    phone,
    email,
    address,
    gstin,
    drugLicenseNo,
    dlExpiryDate,
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

    if (existing.isCash && name && name.trim() !== existing.name) {
      res.status(400).json({ error: 'Cannot rename the system Cash customer' });
      return;
    }

    let parsedDLExpiry = existing.dlExpiryDate;
    if (dlExpiryDate !== undefined) {
      if (dlExpiryDate === null || dlExpiryDate === '') {
        parsedDLExpiry = null;
      } else {
        const d = new Date(dlExpiryDate);
        if (!isNaN(d.getTime())) parsedDLExpiry = d;
      }
    }

    const updated = await prisma.party.update({
      where: { id },
      data: {
        name: name !== undefined ? String(name).trim() : existing.name,
        type: type !== undefined ? String(type).toLowerCase() : existing.type,
        phone: phone !== undefined ? (phone ? String(phone).trim() : null) : existing.phone,
        email: email !== undefined ? (email ? String(email).trim().toLowerCase() : null) : existing.email,
        address: address !== undefined ? (address ? String(address).trim() : null) : existing.address,
        gstin: gstin !== undefined ? (gstin ? String(gstin).trim().toUpperCase() : null) : existing.gstin,
        drugLicenseNo: drugLicenseNo !== undefined ? (drugLicenseNo ? String(drugLicenseNo).trim().toUpperCase() : null) : existing.drugLicenseNo,
        dlExpiryDate: parsedDLExpiry,
        creditLimit: creditLimit !== undefined ? Number(creditLimit) : existing.creditLimit
      }
    });

    res.status(200).json({
      party: {
        ...updated,
        creditLimit: Number(updated.creditLimit),
        outstandingBalance: Number(updated.outstandingBalance)
      },
      message: 'Party updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating party:', error);
    res.status(500).json({ error: 'Failed to update party' });
  }
});

export default router;

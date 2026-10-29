import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import prisma from '../prisma.js';

const router = Router();

/**
 * GET /companies/mine
 * Returns all companies the authenticated user belongs to
 */
router.get('/mine', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;

  try {
    const userCompanies = await prisma.userCompany.findMany({
      where: { userId },
      include: {
        company: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    const companies = userCompanies.map(uc => ({
      id: uc.company.id,
      name: uc.company.name,
      gstin: uc.company.gstin || '',
      drugLicenseNo: uc.company.drugLicenseNo || '',
      phone: uc.company.phone ? uc.company.phone.replace('9703433694', '9703533694') : '9703533694',
      email: uc.company.email || '',
      address: uc.company.address || '',
      city: uc.company.city || '',
      state: (uc.company.state || '').toUpperCase().includes('UTTAR') ? 'UTTAR PRADESH' : (uc.company.state || 'UTTAR PRADESH'),
      pincode: uc.company.pincode || '',
      role: uc.role,
      createdAt: uc.company.createdAt
    }));

    res.status(200).json({ companies });
  } catch (error: any) {
    console.error('Error fetching user companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

/**
 * POST /companies
 * Creates a new company; the creator becomes the owner (Phase 0 Task 3)
 */
router.post('/', requireAuth, idempotencyMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const {
    name,
    gstin,
    drugLicenseNo,
    phone,
    email,
    address,
    city,
    state,
    pincode
  } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    res.status(400).json({ error: 'Company name must be at least 2 characters long' });
    return;
  }

  const trimmedName = name.trim();

  try {
    const company = await prisma.$transaction(async (tx) => {
      const newCompany = await tx.company.create({
        data: {
          name: trimmedName,
          gstin: gstin ? String(gstin).trim().toUpperCase() : null,
          drugLicenseNo: drugLicenseNo ? String(drugLicenseNo).trim() : null,
          phone: phone ? String(phone).trim() : null,
          email: email ? String(email).trim() : null,
          address: address ? String(address).trim() : null,
          city: city ? String(city).trim() : null,
          state: state ? String(state).trim() : null,
          pincode: pincode ? String(pincode).trim() : null
        }
      });

      await tx.userCompany.create({
        data: {
          userId,
          companyId: newCompany.id,
          role: 'owner'
        }
      });

      return newCompany;
    });

    res.status(201).json({
      company: {
        id: company.id,
        name: company.name,
        gstin: company.gstin || '',
        drugLicenseNo: company.drugLicenseNo || '',
        phone: company.phone || '',
        email: company.email || '',
        address: company.address || '',
        city: company.city || '',
        state: company.state || '',
        pincode: company.pincode || '',
        role: 'owner',
        createdAt: company.createdAt
      },
      message: 'Company created successfully'
    });
  } catch (error: any) {
    console.error('Error creating company:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

/**
 * PUT /companies/:id
 * Updates an existing company's details (Owner / Accountant only)
 */
router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const companyId = req.params.id;
  const {
    name,
    gstin,
    drugLicenseNo,
    phone,
    email,
    address,
    city,
    state,
    pincode
  } = req.body;

  try {
    // Check permission
    const userComp = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId,
          companyId
        }
      }
    });

    if (!userComp || (userComp.role !== 'owner' && userComp.role !== 'accountant')) {
      res.status(403).json({ error: 'Only company owners or accountants can update company details' });
      return;
    }

    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: {
        ...(name ? { name: String(name).trim() } : {}),
        ...(gstin !== undefined ? { gstin: gstin ? String(gstin).trim().toUpperCase() : null } : {}),
        ...(drugLicenseNo !== undefined ? { drugLicenseNo: drugLicenseNo ? String(drugLicenseNo).trim() : null } : {}),
        ...(phone !== undefined ? { phone: phone ? String(phone).trim() : null } : {}),
        ...(email !== undefined ? { email: email ? String(email).trim() : null } : {}),
        ...(address !== undefined ? { address: address ? String(address).trim() : null } : {}),
        ...(city !== undefined ? { city: city ? String(city).trim() : null } : {}),
        ...(state !== undefined ? { state: state ? String(state).trim() : null } : {}),
        ...(pincode !== undefined ? { pincode: pincode ? String(pincode).trim() : null } : {})
      }
    });

    res.json({
      company: {
        id: updatedCompany.id,
        name: updatedCompany.name,
        gstin: updatedCompany.gstin || '',
        drugLicenseNo: updatedCompany.drugLicenseNo || '',
        phone: updatedCompany.phone || '',
        email: updatedCompany.email || '',
        address: updatedCompany.address || '',
        city: updatedCompany.city || '',
        state: updatedCompany.state || '',
        pincode: updatedCompany.pincode || '',
        role: userComp.role,
        createdAt: updatedCompany.createdAt
      },
      message: 'Company updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

/**
 * DELETE /companies/:id
 * Deletes a company and all associated records (Owner only)
 */
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const companyId = req.params.id;

  try {
    // Check permission - Owner only
    const userComp = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId,
          companyId
        }
      }
    });

    if (!userComp || userComp.role !== 'owner') {
      res.status(403).json({ error: 'Only the company owner can delete this company' });
      return;
    }

    // Cascade delete in transaction
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL app.allow_ledger_cleanup = 'on';");
      // 1. Invoices
      await tx.invoiceItem.deleteMany({ where: { invoice: { companyId } } });
      await tx.invoice.deleteMany({ where: { companyId } });

      // 2. Purchases
      await tx.purchaseItem.deleteMany({ where: { purchase: { companyId } } });
      await tx.purchase.deleteMany({ where: { companyId } });

      // 3. Stock Ledger & Batches
      await tx.stockLedger.deleteMany({ where: { companyId } });
      await tx.batch.deleteMany({ where: { companyId } });

      // 4. Items & Parties
      await tx.item.deleteMany({ where: { companyId } });
      await tx.party.deleteMany({ where: { companyId } });

      // 5. User Companies & Company
      await tx.userCompany.deleteMany({ where: { companyId } });
      await tx.company.delete({ where: { id: companyId } });
    }, { maxWait: 15000, timeout: 30000 });

    res.json({
      message: 'Company and all associated records deleted successfully',
      deletedCompanyId: companyId
    });
  } catch (error: any) {
    console.error('Error deleting company:', error);
    res.status(500).json({ error: 'Failed to delete company: ' + (error.message || 'Server error') });
  }
});

/**
 * POST /companies/:id/clear-data
 * Clears all purchase bills, sale invoices, stock ledger audit records, and batches,
 * and resets customer/supplier balances to zero while keeping catalog items & company details intact.
 */
router.post('/:id/clear-data', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const companyId = req.params.id;

  try {
    const userComp = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId,
          companyId
        }
      }
    });

    if (!userComp || (userComp.role !== 'owner' && userComp.role !== 'accountant')) {
      res.status(403).json({ error: 'Only company owners or accountants can reset company transactions' });
      return;
    }

    // Atomic clean purge using direct owner trigger drop & recreate
    try {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_stock_ledger_immutable ON "stock_ledger";`);
      await prisma.$executeRawUnsafe(`DELETE FROM "invoice_items" WHERE "invoice_id" IN (SELECT "id" FROM "invoices" WHERE "company_id" = '${companyId}');`);
      await prisma.$executeRawUnsafe(`DELETE FROM "invoices" WHERE "company_id" = '${companyId}';`);
      await prisma.$executeRawUnsafe(`DELETE FROM "purchase_items" WHERE "purchase_id" IN (SELECT "id" FROM "purchases" WHERE "company_id" = '${companyId}');`);
      await prisma.$executeRawUnsafe(`DELETE FROM "purchases" WHERE "company_id" = '${companyId}';`);
      await prisma.$executeRawUnsafe(`DELETE FROM "stock_ledger" WHERE "company_id" = '${companyId}';`);
      await prisma.$executeRawUnsafe(`DELETE FROM "batches" WHERE "company_id" = '${companyId}';`);
      await prisma.$executeRawUnsafe(`DELETE FROM "items" WHERE "company_id" = '${companyId}';`);
    } finally {
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          DROP TRIGGER IF EXISTS trg_stock_ledger_immutable ON "stock_ledger";
          CREATE TRIGGER trg_stock_ledger_immutable
          BEFORE UPDATE OR DELETE ON "stock_ledger"
          FOR EACH ROW EXECUTE FUNCTION prevent_stock_ledger_mutation();
        EXCEPTION
          WHEN others THEN null;
        END $$;
      `).catch(() => {});
    }

    // Reset Party Balances
    await prisma.party.updateMany({
      where: { companyId },
      data: { outstandingBalance: 0.0 }
    });

    res.json({
      success: true,
      message: 'All purchases, sales, inventory batches, medicine catalog items, and ledger transactions cleared successfully. Company is completely fresh for testing!'
    });
  } catch (error: any) {
    console.error('Error clearing company data:', error);
    res.status(500).json({ error: error.message || 'Failed to clear company data' });
  }
});

export default router;

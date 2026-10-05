import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireCompany, CompanyScopedRequest } from '../middleware/company.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import prisma from '../prisma.js';

const router = Router();

// Require auth and company scope
router.use(requireAuth);
router.use(requireCompany);

/**
 * Helper: Generate unique Purchase Return / CN number
 * Format: CN-YYYY-XXXX (e.g., CN-2026-0001)
 */
async function generateReturnNumber(companyId: string): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `CN-${currentYear}-`;

  const lastReturn = await prisma.purchaseReturn.findFirst({
    where: {
      companyId,
      returnNumber: { startsWith: prefix }
    },
    orderBy: { returnNumber: 'desc' }
  });

  let nextSeq = 1;
  if (lastReturn && lastReturn.returnNumber) {
    const parts = lastReturn.returnNumber.split('-');
    if (parts.length === 3) {
      const parsed = parseInt(parts[2], 10);
      if (!isNaN(parsed)) {
        nextSeq = parsed + 1;
      }
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

/**
 * GET /purchase-returns
 * List all purchase returns / supplier CNs
 */
router.get('/', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const supplierId = typeof req.query.supplierId === 'string' ? req.query.supplierId : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  try {
    const where: any = { companyId };
    if (supplierId) where.supplierId = supplierId;

    if (search) {
      where.OR = [
        { returnNumber: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
        { reason: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } }
      ];
    }

    const returns = await prisma.purchaseReturn.findMany({
      where,
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            phone: true,
            gstin: true,
            drugLicenseNo: true
          }
        },
        items: {
          include: {
            item: { select: { name: true, sku: true, unit: true } }
          }
        },
        creator: {
          select: { username: true }
        }
      },
      orderBy: [
        { returnDate: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    res.status(200).json({
      returns: returns.map(r => ({
        id: r.id,
        returnNumber: r.returnNumber,
        returnDate: r.returnDate.toISOString(),
        supplierId: r.supplierId,
        supplierName: r.supplier.name,
        supplierGstin: r.supplier.gstin,
        supplierPhone: r.supplier.phone,
        supplierDrugLicenseNo: r.supplier.drugLicenseNo,
        subtotal: Number(r.subtotal),
        taxableAmount: Number(r.taxableAmount),
        cgstAmount: Number(r.cgstAmount),
        sgstAmount: Number(r.sgstAmount),
        igstAmount: Number(r.igstAmount),
        totalAmount: Number(r.totalAmount),
        reason: r.reason,
        notes: r.notes,
        itemCount: r.items.length,
        items: r.items.map(i => ({
          id: i.id,
          medicineName: i.item.name,
          sku: i.item.sku,
          batchNumber: i.batchNumber,
          expiryDate: i.expiryDate.toISOString(),
          pack: i.pack,
          strips: i.strips,
          looseQty: i.looseQty,
          quantity: i.quantity,
          returnRate: Number(i.returnRate),
          mrp: Number(i.mrp),
          taxableValue: Number(i.taxableValue),
          gstRate: Number(i.gstRate),
          gstAmount: Number(i.gstAmount),
          totalAmount: Number(i.totalAmount)
        })),
        createdBy: r.creator?.username || 'admin',
        createdAt: r.createdAt.toISOString()
      }))
    });
  } catch (error: any) {
    console.error('Failed to list purchase returns:', error);
    res.status(500).json({ error: 'Failed to retrieve purchase returns' });
  }
});

/**
 * GET /purchase-returns/:id
 * Get single purchase return details
 */
router.get('/:id', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { id } = req.params;

  try {
    const ret = await prisma.purchaseReturn.findFirst({
      where: { id, companyId },
      include: {
        supplier: true,
        company: true,
        items: {
          include: {
            item: true,
            batch: true
          }
        },
        creator: {
          select: { username: true }
        }
      }
    });

    if (!ret) {
      res.status(404).json({ error: 'Purchase return voucher not found' });
      return;
    }

    res.status(200).json({
      purchaseReturn: {
        id: ret.id,
        returnNumber: ret.returnNumber,
        returnDate: ret.returnDate.toISOString(),
        supplier: ret.supplier,
        company: ret.company,
        subtotal: Number(ret.subtotal),
        taxableAmount: Number(ret.taxableAmount),
        cgstAmount: Number(ret.cgstAmount),
        sgstAmount: Number(ret.sgstAmount),
        igstAmount: Number(ret.igstAmount),
        roundOff: Number(ret.roundOff),
        totalAmount: Number(ret.totalAmount),
        reason: ret.reason,
        notes: ret.notes,
        createdBy: ret.creator?.username || 'admin',
        createdAt: ret.createdAt.toISOString(),
        items: ret.items.map(i => ({
          id: i.id,
          itemId: i.itemId,
          batchId: i.batchId,
          medicineName: i.item.name,
          genericName: i.item.genericName,
          sku: i.item.sku,
          pack: i.pack,
          batchNumber: i.batchNumber,
          expiryDate: i.expiryDate.toISOString(),
          strips: i.strips,
          looseQty: i.looseQty,
          quantity: i.quantity,
          returnRate: Number(i.returnRate),
          mrp: Number(i.mrp),
          taxableValue: Number(i.taxableValue),
          gstRate: Number(i.gstRate),
          gstAmount: Number(i.gstAmount),
          totalAmount: Number(i.totalAmount)
        }))
      }
    });
  } catch (error: any) {
    console.error('Failed to get purchase return details:', error);
    res.status(500).json({ error: 'Failed to retrieve purchase return details' });
  }
});

/**
 * POST /purchase-returns
 * Create a new multi-item Supplier Return / Credit Note (CN)
 * Atomically:
 * 1. Decreases batch stock (currentStock -= quantity)
 * 2. Writes append-only PURCHASE_RETURN StockLedger records
 * 3. Creates PurchaseReturn and item rows
 * 4. Deducts supplier outstanding balance (reduces payable)
 */
router.post('/', idempotencyMiddleware, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const userId = req.user!.userId;

  const {
    supplierId,
    returnDate,
    reason,
    notes,
    items: inputItems
  } = req.body;

  if (!supplierId) {
    res.status(400).json({ error: 'Supplier is required for purchase return' });
    return;
  }

  if (!Array.isArray(inputItems) || inputItems.length === 0) {
    res.status(400).json({ error: 'At least one medicine item must be returned' });
    return;
  }

  try {
    // 1. Validate Supplier
    const supplier = await prisma.party.findFirst({
      where: { id: supplierId, companyId }
    });

    if (!supplier) {
      res.status(404).json({ error: 'Selected supplier party not found' });
      return;
    }

    // 2. Validate Items & Batches
    let grandSubtotal = 0;
    let grandTaxable = 0;
    let grandGst = 0;
    const validatedItems: any[] = [];

    for (const raw of inputItems) {
      const batchId = raw.batchId;
      if (!batchId) {
        res.status(400).json({ error: 'Batch ID is required for each returned line item' });
        return;
      }

      const batch = await prisma.batch.findFirst({
        where: { id: batchId, companyId },
        include: { item: true }
      });

      if (!batch) {
        res.status(404).json({ error: `Batch ID ${batchId} not found` });
        return;
      }

      const factor = batch.item.conversionFactor || 1;
      const strips = Math.max(0, parseInt(raw.strips) || 0);
      const looseQty = Math.max(0, parseInt(raw.looseQty) || 0);
      const totalUnits = (strips * factor) + looseQty;

      if (totalUnits <= 0) {
        res.status(400).json({ error: `Please specify returned strips or loose units for ${batch.item.name}` });
        return;
      }

      if (batch.currentStock < totalUnits) {
        res.status(400).json({
          error: `Insufficient stock in batch ${batch.batchNumber} of ${batch.item.name}. Available: ${batch.currentStock} units, Requested Return: ${totalUnits} units.`
        });
        return;
      }

      // Return Rate: Defaults to batch PTR (Price to Retailer / Cost Price) or custom rate
      const returnRate = raw.returnRate !== undefined && raw.returnRate !== ''
        ? Math.max(0, parseFloat(raw.returnRate) || 0)
        : Number(batch.ptr) || Number(batch.mrp);

      const mrp = Number(batch.mrp);
      const gstRate = raw.gstRate !== undefined ? Math.max(0, parseFloat(raw.gstRate) || 0) : Number(batch.item.gstRate || 0);

      // Value Calculation based on strips & loose ratio
      const lineTaxable = (strips * returnRate) + (looseQty * (returnRate / factor));
      const lineGst = (lineTaxable * gstRate) / 100;
      const lineTotal = lineTaxable + lineGst;

      grandSubtotal += lineTaxable;
      grandTaxable += lineTaxable;
      grandGst += lineGst;

      validatedItems.push({
        itemId: batch.itemId,
        batchId: batch.id,
        medicineName: batch.item.name,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        pack: factor > 1 ? `${factor} TAB` : batch.item.unit,
        strips,
        looseQty,
        quantity: totalUnits,
        returnRate,
        mrp,
        taxableValue: Math.round(lineTaxable * 100) / 100,
        gstRate,
        gstAmount: Math.round(lineGst * 100) / 100,
        totalAmount: Math.round(lineTotal * 100) / 100
      });
    }

    const rawGrandTotal = grandTaxable + grandGst;
    const finalGrandTotal = Math.round(rawGrandTotal * 100) / 100;
    const roundOff = Math.round((Math.round(finalGrandTotal) - finalGrandTotal) * 100) / 100;
    const returnNumber = await generateReturnNumber(companyId);
    const parsedReturnDate = returnDate ? new Date(returnDate) : new Date();

    // 3. Execute Transaction
    const createdReturn = await prisma.$transaction(async (tx) => {
      // A. Create PurchaseReturn Record
      const pr = await tx.purchaseReturn.create({
        data: {
          companyId,
          supplierId,
          returnNumber,
          returnDate: parsedReturnDate,
          subtotal: grandSubtotal,
          taxableAmount: grandTaxable,
          cgstAmount: grandGst / 2,
          sgstAmount: grandGst / 2,
          igstAmount: 0,
          roundOff,
          totalAmount: finalGrandTotal,
          reason: reason || 'EXPIRED_OR_SLOW_MOVING',
          notes: notes || null,
          createdBy: userId,
          items: {
            create: validatedItems.map(item => ({
              itemId: item.itemId,
              batchId: item.batchId,
              pack: item.pack,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate,
              strips: item.strips,
              looseQty: item.looseQty,
              quantity: item.quantity,
              returnRate: item.returnRate,
              mrp: item.mrp,
              taxableValue: item.taxableValue,
              gstRate: item.gstRate,
              gstAmount: item.gstAmount,
              totalAmount: item.totalAmount
            }))
          }
        },
        include: {
          items: true,
          supplier: true
        }
      });

      // B. Deduct Batch Stock & Write StockLedger
      for (const item of validatedItems) {
        await tx.batch.update({
          where: { id: item.batchId },
          data: {
            currentStock: { decrement: item.quantity }
          }
        });

        await tx.stockLedger.create({
          data: {
            companyId,
            itemId: item.itemId,
            batchId: item.batchId,
            entryType: 'PURCHASE_RETURN',
            quantity: -item.quantity, // Negative for outward stock return
            unitPrice: item.returnRate,
            referenceId: pr.id,
            notes: `Supplier Return (CN #${returnNumber}) - ${item.strips} Str ${item.looseQty} Loose to ${supplier.name}. Reason: ${reason || 'Expiry/Slow-moving'}`,
            createdBy: userId
          }
        });
      }

      // C. Deduct Supplier Outstanding Balance (Credits supplier account / reduces payable)
      await tx.party.update({
        where: { id: supplierId },
        data: {
          outstandingBalance: { decrement: finalGrandTotal }
        }
      });

      return pr;
    });

    res.status(201).json({
      success: true,
      message: `Return Credit Note #${returnNumber} created successfully`,
      purchaseReturn: {
        id: createdReturn.id,
        returnNumber: createdReturn.returnNumber,
        totalAmount: Number(createdReturn.totalAmount),
        supplierName: supplier.name,
        returnDate: createdReturn.returnDate.toISOString()
      }
    });

  } catch (error: any) {
    console.error('Error creating purchase return:', error);
    res.status(500).json({ error: error.message || 'Failed to process supplier return' });
  }
});

export default router;

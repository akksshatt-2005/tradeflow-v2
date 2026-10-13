import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireCompany, CompanyScopedRequest } from '../middleware/company.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import prisma from '../prisma.js';
import { parseFilterStartDate, parseFilterEndDate } from '../utils/dateUtils.js';


const router = Router();

// Require auth and company scope for all settlement routes
router.use(requireAuth);
router.use(requireCompany);

/**
 * Helper: Ensure supplier_settlements table exists in Postgres
 */
async function ensureSettlementTableExists() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS supplier_settlements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        settlement_number VARCHAR(255) NOT NULL,
        manufacturer VARCHAR(255),
        supplier_id UUID REFERENCES parties(id) ON DELETE SET NULL,
        period_start_date TIMESTAMP WITH TIME ZONE NOT NULL,
        period_end_date TIMESTAMP WITH TIME ZONE NOT NULL,
        gross_sold_units INTEGER NOT NULL DEFAULT 0,
        returned_units INTEGER NOT NULL DEFAULT 0,
        net_sold_units INTEGER NOT NULL DEFAULT 0,
        gross_payable_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        return_deduction NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        net_payable_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        retail_sales_value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        realized_margin NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        payment_mode VARCHAR(50) NOT NULL DEFAULT 'BANK_TRANSFER',
        payment_ref VARCHAR(255),
        status VARCHAR(50) NOT NULL DEFAULT 'SETTLED',
        settlement_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        item_details JSONB,
        notes TEXT,
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT supplier_settlements_company_settlement_uniq UNIQUE (company_id, settlement_number)
      );
      CREATE INDEX IF NOT EXISTS idx_settlements_company_date ON supplier_settlements(company_id, settlement_date);
      CREATE INDEX IF NOT EXISTS idx_settlements_company_mfg ON supplier_settlements(company_id, manufacturer);
    `);
  } catch (err) {
    // Non-fatal if table already exists or schema managed by Prisma
  }
}

/**
 * Helper: Generate unique Settlement voucher number
 * Format: SET-YYYY-XXXX (e.g., SET-2026-0001)
 */
async function generateSettlementNumber(companyId: string): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `SET-${currentYear}-`;

  try {
    const lastSettlement = await (prisma as any).supplierSettlement.findFirst({
      where: {
        companyId,
        settlementNumber: { startsWith: prefix }
      },
      orderBy: { settlementNumber: 'desc' }
    });

    let nextSeq = 1;
    if (lastSettlement && lastSettlement.settlementNumber) {
      const parts = lastSettlement.settlementNumber.split('-');
      if (parts.length === 3) {
        const parsed = parseInt(parts[2], 10);
        if (!isNaN(parsed)) {
          nextSeq = parsed + 1;
        }
      }
    }
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  } catch {
    return `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
  }
}

/**
 * GET /manufacturers
 * Fetch list of distinct manufacturers and active suppliers in catalog
 */
router.get('/manufacturers', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;

  try {
    // 1. Distinct manufacturers from catalog items
    const rawItems = await prisma.item.findMany({
      where: { companyId },
      select: { manufacturer: true }
    });

    const mfgSet = new Set<string>();
    for (const item of rawItems) {
      if (item.manufacturer && item.manufacturer.trim()) {
        mfgSet.add(item.manufacturer.trim());
      }
    }
    const manufacturers = Array.from(mfgSet).sort((a, b) => a.localeCompare(b));

    // 2. Active suppliers from parties
    const suppliers = await prisma.party.findMany({
      where: {
        companyId,
        type: { in: ['supplier', 'both'] }
      },
      select: {
        id: true,
        name: true,
        phone: true,
        gstin: true,
        station: true,
        state: true,
        outstandingBalance: true
      },
      orderBy: { name: 'asc' }
    });

    res.status(200).json({
      manufacturers,
      suppliers
    });
  } catch (error: any) {
    console.error('Error loading manufacturers and suppliers:', error);
    res.status(500).json({ error: error.message || 'Failed to load manufacturers' });
  }
});

/**
 * GET /calculate
 * Calculate real-time sales, patient returns, and net payable amount strictly at Cost Price (PTR)
 * Query params:
 *   - manufacturer (optional): string
 *   - supplierId (optional): string
 *   - startDate: ISO date string
 *   - endDate: ISO date string
 */
router.get('/calculate', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { manufacturer, supplierId, startDate, endDate, deductReturns } = req.query;

  if (!startDate || !endDate) {
    res.status(400).json({ error: 'startDate and endDate parameters are required' });
    return;
  }

  const parsedStart = parseFilterStartDate(startDate as string);
  const parsedEnd = parseFilterEndDate(endDate as string);

  if (!parsedStart || !parsedEnd || isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
    res.status(400).json({ error: 'Invalid date format for startDate or endDate' });
    return;
  }

  try {
    // 0. Auto-clean / reclassify historical internal invoice edit/cancel reversals from SALE_RETURN to ADJUSTMENT
    await prisma.stockLedger.updateMany({
      where: {
        companyId,
        entryType: 'SALE_RETURN',
        OR: [
          { notes: { contains: 'Reversal for Cancelled Sales Invoice' } },
          { notes: { contains: 'Reversal for Cancelled' } },
          { notes: { contains: 'Reversal for Edited Sales Invoice' } },
          { notes: { contains: 'Invoice Edit Revision' } }
        ]
      },
      data: {
        entryType: 'ADJUSTMENT'
      }
    }).catch(e => console.warn('Settlement ledger reclassification cleanup error:', e));

    const mfgTrimmed = typeof manufacturer === 'string' ? manufacturer.trim() : '';
    const mfgFilter = mfgTrimmed && !mfgTrimmed.toLowerCase().includes('all manufacturer') && mfgTrimmed.toUpperCase() !== 'ALL' ? mfgTrimmed : null;
    const suppFilter = typeof supplierId === 'string' && supplierId.trim() ? supplierId.trim() : null;

    // 1. Fetch relevant items matching the manufacturer or purchased from supplier
    const itemWhere: any = { companyId };
    if (mfgFilter) {
      itemWhere.manufacturer = { equals: mfgFilter, mode: 'insensitive' };
    }

    const items = await prisma.item.findMany({
      where: itemWhere,
      include: {
        batches: true
      }
    });

    const itemMap = new Map<string, any>();
    const batchMap = new Map<string, any>();

    for (const itm of items) {
      itemMap.set(itm.id, itm);
      for (const b of itm.batches) {
        batchMap.set(b.id, {
          ...b,
          item: itm
        });
      }
    }

    const itemIds = Array.from(itemMap.keys());
    if (itemIds.length === 0) {
      res.status(200).json({
        summary: {
          periodStartDate: parsedStart.toISOString(),
          periodEndDate: parsedEnd.toISOString(),
          manufacturer: mfgFilter,
          supplierId: suppFilter,
          totalItemsCount: 0,
          grossSoldUnits: 0,
          grossSoldStrips: 0,
          returnedUnits: 0,
          returnedStrips: 0,
          netSoldUnits: 0,
          netSoldStrips: 0,
          grossPayableCost: 0,
          returnDeduction: 0,
          netPayableAmount: 0,
          retailSalesValue: 0,
          realizedMargin: 0,
          marginPercentage: 0
        },
        items: []
      });
      return;
    }

    // 2. Fetch all active sales invoices within the date range
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        invoiceDate: {
          gte: parsedStart,
          lte: parsedEnd
        },
        status: { not: 'CANCELLED' }
      },
      include: {
        items: {
          where: {
            itemId: { in: itemIds }
          },
          include: {
            batch: true,
            item: true
          }
        }
      }
    });

    // 3. Fetch patient return entries in stock_ledger in the same period (only if deductReturns is enabled)
    // Only count genuine patient return vouchers (referenceId starting with 'RET-')
    const shouldDeductReturns = deductReturns === 'true';
    const batchReturnsMap = new Map<string, number>();

    if (shouldDeductReturns) {
      const returnsLedger = await prisma.stockLedger.findMany({
        where: {
          companyId,
          itemId: { in: itemIds },
          entryType: 'SALE_RETURN',
          referenceId: { startsWith: 'RET-' },
          NOT: [
            { notes: { contains: 'Reversal for Cancelled' } },
            { notes: { contains: 'Reversal for Edited' } },
            { notes: { contains: 'Invoice Edit' } }
          ],
          createdAt: {
            gte: parsedStart,
            lte: parsedEnd
          }
        }
      });

      // Map genuine return vouchers by batchId
      for (const ret of returnsLedger) {
        const current = batchReturnsMap.get(ret.batchId) || 0;
        batchReturnsMap.set(ret.batchId, current + Math.max(0, ret.quantity));
      }
    }

    // 4. Aggregate sales and returns per batch
    interface BatchSettlementAgg {
      batchId: string;
      itemId: string;
      medicineName: string;
      genericName: string | null;
      manufacturer: string | null;
      sku: string;
      batchNumber: string;
      expiryDate: string | null;
      unit: string;
      conversionFactor: number;
      ptr: number; // Purchase Rate per pack/strip
      mrp: number; // Retail Rate per pack/strip
      unitCostPrice: number; // Cost per base unit (ptr / conversionFactor)
      unitRetailPrice: number; // MRP per base unit (mrp / conversionFactor)
      grossSoldUnits: number;
      grossSoldStrips: number;
      grossSoldLoose: number;
      returnedUnits: number;
      returnedStrips: number;
      returnedLoose: number;
      netSoldUnits: number;
      netSoldStrips: number;
      netSoldLoose: number;
      grossCostPayable: number;
      returnCostDeduction: number;
      netPayableAmount: number;
      grossRetailAmount: number;
      netRetailAmount: number;
      marginAmount: number;
      invoicesCount: number;
    }

    const batchAggMap = new Map<string, BatchSettlementAgg>();

    // Process all sales items
    for (const inv of invoices) {
      for (const invItem of inv.items) {
        const factor = invItem.item.conversionFactor || 1;
        const bId = invItem.batchId;
        const b = invItem.batch;
        const itm = invItem.item;

        const rawPtr = Number(b?.ptr || 0);
        const ptr = rawPtr > 0 ? rawPtr : (Number(b?.pts || 0) > 0 ? Number(b?.pts) : 0);
        const mrp = Number(b?.mrp || invItem.mrp || 0);
        const unitCostPrice = factor > 0 ? ptr / factor : ptr;
        const unitRetailPrice = factor > 0 ? mrp / factor : mrp;

        const soldUnits = invItem.quantity + (invItem.freeQuantity || 0);
        const soldAmount = Number(invItem.totalAmount || 0);

        if (!batchAggMap.has(bId)) {
          const retUnits = batchReturnsMap.get(bId) || 0;
          batchAggMap.set(bId, {
            batchId: bId,
            itemId: itm.id,
            medicineName: itm.name,
            genericName: itm.genericName || null,
            manufacturer: itm.manufacturer || null,
            sku: itm.sku,
            batchNumber: b?.batchNumber || invItem.batchNumber,
            expiryDate: b?.expiryDate ? b.expiryDate.toISOString().split('T')[0] : (invItem.expiryDate ? invItem.expiryDate.toISOString().split('T')[0] : null),
            unit: itm.unit || 'STRIP',
            conversionFactor: factor,
            ptr,
            mrp,
            unitCostPrice,
            unitRetailPrice,
            grossSoldUnits: 0,
            grossSoldStrips: 0,
            grossSoldLoose: 0,
            returnedUnits: retUnits,
            returnedStrips: Math.floor(retUnits / factor),
            returnedLoose: retUnits % factor,
            netSoldUnits: 0,
            netSoldStrips: 0,
            netSoldLoose: 0,
            grossCostPayable: 0,
            returnCostDeduction: Math.round((retUnits * unitCostPrice) * 100) / 100,
            netPayableAmount: 0,
            grossRetailAmount: 0,
            netRetailAmount: 0,
            marginAmount: 0,
            invoicesCount: 0
          });
        }

        const agg = batchAggMap.get(bId)!;
        agg.grossSoldUnits += soldUnits;
        agg.invoicesCount += 1;
        agg.grossRetailAmount += soldAmount;
      }
    }

    // Also include any batches that had verified patient returns in this period
    for (const [bId, retUnits] of batchReturnsMap.entries()) {
      if (!batchAggMap.has(bId) && retUnits > 0) {
        const b = batchMap.get(bId);
        if (b) {
          const factor = b.item?.conversionFactor || 1;
          const rawPtr = Number(b.ptr || 0);
          const ptr = rawPtr > 0 ? rawPtr : (Number(b.pts || 0) > 0 ? Number(b.pts) : 0);
          const mrp = Number(b.mrp || 0);
          const unitCostPrice = factor > 0 ? ptr / factor : ptr;
          const unitRetailPrice = factor > 0 ? mrp / factor : mrp;

          batchAggMap.set(bId, {
            batchId: bId,
            itemId: b.itemId,
            medicineName: b.item?.name || 'Unknown',
            genericName: b.item?.genericName || null,
            manufacturer: b.item?.manufacturer || null,
            sku: b.item?.sku || '',
            batchNumber: b.batchNumber,
            expiryDate: b.expiryDate ? b.expiryDate.toISOString().split('T')[0] : null,
            unit: b.item?.unit || 'STRIP',
            conversionFactor: factor,
            ptr,
            mrp,
            unitCostPrice,
            unitRetailPrice,
            grossSoldUnits: 0,
            grossSoldStrips: 0,
            grossSoldLoose: 0,
            returnedUnits: retUnits,
            returnedStrips: Math.floor(retUnits / factor),
            returnedLoose: retUnits % factor,
            netSoldUnits: -retUnits,
            netSoldStrips: -Math.floor(retUnits / factor),
            netSoldLoose: -(retUnits % factor),
            grossCostPayable: 0,
            returnCostDeduction: Math.round((retUnits * unitCostPrice) * 100) / 100,
            netPayableAmount: -Math.round((retUnits * unitCostPrice) * 100) / 100,
            grossRetailAmount: 0,
            netRetailAmount: -Math.round((retUnits * unitRetailPrice) * 100) / 100,
            marginAmount: 0,
            invoicesCount: 0
          });
        }
      }
    }

    // Finalize all batch math - Include batches with sales or returns
    const resultItems: BatchSettlementAgg[] = [];
    let totalGrossUnits = 0;
    let totalReturnedUnits = 0;
    let totalNetUnits = 0;
    let totalGrossCost = 0;
    let totalReturnDeduction = 0;
    let totalNetPayable = 0;
    let totalRetailSales = 0;

    for (const agg of batchAggMap.values()) {
      // Include batches with sales OR genuine patient returns
      if (agg.grossSoldUnits <= 0 && agg.returnedUnits <= 0) {
        continue;
      }

      const factor = agg.conversionFactor || 1;

      agg.grossSoldStrips = Math.floor(agg.grossSoldUnits / factor);
      agg.grossSoldLoose = agg.grossSoldUnits % factor;

      agg.grossCostPayable = Math.round((agg.grossSoldUnits * agg.unitCostPrice) * 100) / 100;

      // Deduct genuine returns
      agg.returnedStrips = Math.floor(agg.returnedUnits / factor);
      agg.returnedLoose = agg.returnedUnits % factor;
      agg.returnCostDeduction = Math.round((agg.returnedUnits * agg.unitCostPrice) * 100) / 100;

      // Net sold units = Gross sold units - Returned units
      agg.netSoldUnits = agg.grossSoldUnits - agg.returnedUnits;
      agg.netSoldStrips = Math.floor(agg.netSoldUnits / factor);
      agg.netSoldLoose = agg.netSoldUnits % factor;

      // Net Payable Amount strictly at Cost Price (PTR)
      agg.netPayableAmount = Math.round((agg.grossCostPayable - agg.returnCostDeduction) * 100) / 100;

      const returnedRetailValue = Math.round((agg.returnedUnits * agg.unitRetailPrice) * 100) / 100;
      agg.netRetailAmount = Math.round((agg.grossRetailAmount - returnedRetailValue) * 100) / 100;
      agg.marginAmount = Math.round((agg.netRetailAmount - agg.netPayableAmount) * 100) / 100;

      totalGrossUnits += agg.grossSoldUnits;
      totalReturnedUnits += agg.returnedUnits;
      totalNetUnits += agg.netSoldUnits;
      totalGrossCost += agg.grossCostPayable;
      totalReturnDeduction += agg.returnCostDeduction;
      totalNetPayable += agg.netPayableAmount;
      totalRetailSales += agg.netRetailAmount;

      resultItems.push(agg);
    }

    // Sort by Net Payable descending
    resultItems.sort((a, b) => b.netPayableAmount - a.netPayableAmount || a.medicineName.localeCompare(b.medicineName));

    const totalMargin = Math.round((totalRetailSales - totalNetPayable) * 100) / 100;
    const marginPct = totalRetailSales > 0 ? Math.round((totalMargin / totalRetailSales) * 10000) / 100 : 0;

    res.status(200).json({
      summary: {
        periodStartDate: parsedStart.toISOString(),
        periodEndDate: parsedEnd.toISOString(),
        manufacturer: mfgFilter,
        supplierId: suppFilter,
        totalItemsCount: resultItems.length,
        grossSoldUnits: totalGrossUnits,
        grossSoldStrips: resultItems.reduce((s, i) => s + i.grossSoldStrips, 0),
        returnedUnits: totalReturnedUnits,
        returnedStrips: resultItems.reduce((s, i) => s + i.returnedStrips, 0),
        netSoldUnits: totalNetUnits,
        netSoldStrips: resultItems.reduce((s, i) => s + i.netSoldStrips, 0),
        grossPayableCost: Math.round(totalGrossCost * 100) / 100,
        returnDeduction: Math.round(totalReturnDeduction * 100) / 100,
        netPayableAmount: Math.round(totalNetPayable * 100) / 100,
        retailSalesValue: Math.round(totalRetailSales * 100) / 100,
        realizedMargin: totalMargin,
        marginPercentage: marginPct
      },
      items: resultItems
    });
  } catch (error: any) {
    console.error('Error calculating supplier settlement:', error);
    res.status(500).json({ error: error.message || 'Failed to calculate supplier settlement' });
  }
});

/**
 * POST /record
 * Record and persist a Supplier / Manufacturer Settlement Payout
 */
router.post('/record', idempotencyMiddleware, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const userId = req.user!.userId;

  const {
    manufacturer,
    supplierId,
    periodStartDate,
    periodEndDate,
    grossSoldUnits = 0,
    returnedUnits = 0,
    netSoldUnits = 0,
    grossPayableCost = 0,
    returnDeduction = 0,
    netPayableAmount = 0,
    retailSalesValue = 0,
    realizedMargin = 0,
    paidAmount = 0,
    paymentMode = 'BANK_TRANSFER',
    paymentRef,
    notes,
    items = []
  } = req.body;

  if (!periodStartDate || !periodEndDate) {
    res.status(400).json({ error: 'periodStartDate and periodEndDate are required' });
    return;
  }

  await ensureSettlementTableExists();

  try {
    const settlementNumber = await generateSettlementNumber(companyId);

    const savedSettlement = await (prisma as any).supplierSettlement.create({
      data: {
        companyId,
        settlementNumber,
        manufacturer: manufacturer ? String(manufacturer).trim() : null,
        supplierId: supplierId ? String(supplierId).trim() : null,
        periodStartDate: new Date(periodStartDate),
        periodEndDate: new Date(periodEndDate),
        grossSoldUnits: Number(grossSoldUnits) || 0,
        returnedUnits: Number(returnedUnits) || 0,
        netSoldUnits: Number(netSoldUnits) || 0,
        grossPayableCost: Number(grossPayableCost) || 0,
        returnDeduction: Number(returnDeduction) || 0,
        netPayableAmount: Number(netPayableAmount) || 0,
        retailSalesValue: Number(retailSalesValue) || 0,
        realizedMargin: Number(realizedMargin) || 0,
        paidAmount: Number(paidAmount) >= 0 ? Number(paidAmount) : Number(netPayableAmount),
        paymentMode: String(paymentMode || 'BANK_TRANSFER'),
        paymentRef: paymentRef ? String(paymentRef).trim() : null,
        status: 'SETTLED',
        settlementDate: new Date(),
        itemDetails: items,
        notes: notes ? String(notes).trim() : null,
        createdBy: userId
      },
      include: {
        supplier: true,
        creator: {
          select: { id: true, username: true }
        }
      }
    });

    res.status(201).json({
      message: `Settlement #${settlementNumber} recorded successfully`,
      settlement: savedSettlement
    });
  } catch (error: any) {
    console.error('Error recording settlement:', error);
    res.status(500).json({ error: error.message || 'Failed to record settlement' });
  }
});

/**
 * GET /history
 * List historical settlements for the company
 */
router.get('/history', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  await ensureSettlementTableExists();

  try {
    const where: any = { companyId };
    if (search) {
      where.OR = [
        { settlementNumber: { contains: search, mode: 'insensitive' } },
        { manufacturer: { contains: search, mode: 'insensitive' } },
        { paymentRef: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const settlements = await (prisma as any).supplierSettlement.findMany({
      where,
      include: {
        supplier: true,
        creator: {
          select: { id: true, username: true }
        }
      },
      orderBy: { settlementDate: 'desc' },
      take: 100
    });

    res.status(200).json({ settlements });
  } catch (error: any) {
    console.error('Error loading settlement history:', error);
    res.status(500).json({ error: error.message || 'Failed to load settlement history' });
  }
});

/**
 * GET /:id
 * Get single settlement voucher details
 */
router.get('/:id', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { id } = req.params;

  await ensureSettlementTableExists();

  try {
    const settlement = await (prisma as any).supplierSettlement.findFirst({
      where: { id, companyId },
      include: {
        supplier: true,
        creator: {
          select: { id: true, username: true }
        }
      }
    });

    if (!settlement) {
      res.status(404).json({ error: 'Settlement voucher not found' });
      return;
    }

    res.status(200).json({ settlement });
  } catch (error: any) {
    console.error('Error fetching settlement:', error);
    res.status(500).json({ error: error.message || 'Failed to load settlement' });
  }
});

/**
 * POST /purge-invalid-returns
 * Acknowledges returns reset
 */
router.post('/purge-invalid-returns', async (req: CompanyScopedRequest, res: Response) => {
  res.status(200).json({
    message: `Returns deduction toggle updated. You can toggle 'Deduct Customer Returns' ON or OFF at any time.`
  });
});

/**
 * DELETE /:id
 * Delete or void a settlement voucher record
 */
router.delete('/:id', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { id } = req.params;

  await ensureSettlementTableExists();

  try {
    const settlement = await (prisma as any).supplierSettlement.findFirst({
      where: { id, companyId }
    });

    if (!settlement) {
      res.status(404).json({ error: 'Settlement voucher not found' });
      return;
    }

    await (prisma as any).supplierSettlement.delete({
      where: { id }
    });

    res.status(200).json({ message: `Settlement #${settlement.settlementNumber} deleted` });
  } catch (error: any) {
    console.error('Error deleting settlement:', error);
    res.status(500).json({ error: error.message || 'Failed to delete settlement' });
  }
});

export default router;

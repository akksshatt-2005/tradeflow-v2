import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireCompany, CompanyScopedRequest } from '../middleware/company.js';
import prisma from '../prisma.js';
import { parseFilterStartDate, parseFilterEndDate } from '../utils/dateUtils.js';


const router = Router();

// Require auth and company access
router.use(requireAuth);
router.use(requireCompany);

/**
 * GET /inventory/summary
 * Real-time valuation, total SKUs, active batches, near-expiry count, and expired count
 */
router.get('/summary', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const now = new Date();
  const ninetyDaysLater = new Date();
  ninetyDaysLater.setDate(now.getDate() + 90);

  try {
    const [totalItems, batches] = await Promise.all([
      prisma.item.count({ where: { companyId } }),
      prisma.batch.findMany({
        where: {
          companyId,
          currentStock: { gt: 0 }
        },
        include: {
          item: {
            select: { name: true, sku: true, unit: true, conversionFactor: true, minStockLevel: true }
          }
        }
      })
    ]);

    let totalStockUnits = 0;
    let totalStockValueCost = 0; // based on PTR
    let totalStockValueRetail = 0; // based on MRP
    let nearExpiryCount = 0;
    let expiredCount = 0;

    batches.forEach(b => {
      const factor = Math.max(1, b.item.conversionFactor || 1);
      totalStockUnits += b.currentStock;
      totalStockValueCost += (b.currentStock / factor) * Number(b.ptr);
      totalStockValueRetail += (b.currentStock / factor) * Number(b.mrp);

      const exp = new Date(b.expiryDate);
      if (exp < now) {
        expiredCount++;
      } else if (exp <= ninetyDaysLater) {
        nearExpiryCount++;
      }
    });

    res.status(200).json({
      totalMedicines: totalItems,
      activeBatches: batches.length,
      totalUnitsInStock: totalStockUnits,
      stockValueAtCost: Math.round(totalStockValueCost * 100) / 100,
      stockValueAtRetail: Math.round(totalStockValueRetail * 100) / 100,
      nearExpiryCount,
      expiredCount,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error fetching inventory summary:', error);
    res.status(500).json({ error: 'Failed to fetch inventory summary' });
  }
});

/**
 * GET /inventory/expiring
 * Batches expiring in next 90 days or already expired
 */
router.get('/expiring', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const ninetyDaysLater = new Date();
  ninetyDaysLater.setDate(ninetyDaysLater.getDate() + 90);

  try {
    const batches = await prisma.batch.findMany({
      where: {
        companyId,
        currentStock: { gt: 0 },
        expiryDate: { lte: ninetyDaysLater }
      },
      include: {
        item: {
          select: { id: true, sku: true, name: true, unit: true, genericName: true, conversionFactor: true }
        }
      },
      orderBy: {
        expiryDate: 'asc'
      }
    });

    const now = new Date();
    const formatted = batches.map(b => {
      const exp = new Date(b.expiryDate);
      const diffTime = exp.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const factor = Math.max(1, b.item.conversionFactor || 1);

      return {
        batchId: b.id,
        itemId: b.item.id,
        medicineName: b.item.name,
        genericName: b.item.genericName,
        sku: b.item.sku,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate.toISOString(),
        daysRemaining,
        isExpired: daysRemaining <= 0,
        currentStock: b.currentStock,
        conversionFactor: factor,
        unit: b.item.unit,
        mrp: Number(b.mrp),
        ptr: Number(b.ptr)
      };
    });

    res.status(200).json({ expiringBatches: formatted });
  } catch (error: any) {
    console.error('Error fetching expiring inventory:', error);
    res.status(500).json({ error: 'Failed to fetch expiring inventory' });
  }
});

/**
 * GET /inventory/ledger
 * Append-only stock ledger audit history
 */
router.get('/ledger', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

  try {
    const entries = await prisma.stockLedger.findMany({
      where: { companyId },
      include: {
        item: { select: { name: true, sku: true, unit: true } },
        batch: { select: { batchNumber: true, expiryDate: true } },
        user: { select: { username: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    const formatted = entries.map(e => ({
      id: e.id,
      medicineName: e.item.name,
      sku: e.item.sku,
      batchNumber: e.batch.batchNumber,
      entryType: e.entryType,
      quantity: e.quantity,
      unitPrice: Number(e.unitPrice),
      referenceId: e.referenceId,
      notes: e.notes,
      performedBy: e.user.username,
      createdAt: e.createdAt.toISOString()
    }));

    res.status(200).json({ ledger: formatted });
  } catch (error: any) {
    console.error('Error fetching stock ledger:', error);
    res.status(500).json({ error: 'Failed to fetch stock ledger' });
  }
});

/**
 * GET /inventory/patient-returns
 * Fetch patient medicine return records with date range filtering and financial aggregates
 */
router.get('/patient-returns', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { startDate, endDate, search, limit = '200' } = req.query as {
    startDate?: string;
    endDate?: string;
    search?: string;
    limit?: string;
  };

  try {
    // 1. One-time clean up / reclassify historical internal invoice edit/cancel reversals from SALE_RETURN to ADJUSTMENT
    await prisma.stockLedger.updateMany({
      where: {
        companyId,
        entryType: 'SALE_RETURN',
        OR: [
          { notes: { contains: 'Reversal for Edited Sales Invoice' } },
          { notes: { contains: 'Invoice Edit Revision' } },
          { notes: { contains: 'Reversal for Cancelled Sales Invoice' } }
        ]
      },
      data: {
        entryType: 'ADJUSTMENT'
      }
    }).catch(e => console.warn('Ledger reclassification cleanup error:', e));

    const whereClause: any = {
      companyId,
      entryType: 'SALE_RETURN',
      NOT: [
        { notes: { contains: 'Reversal for Edited Sales Invoice' } },
        { notes: { contains: 'Invoice Edit Revision' } },
        { notes: { contains: 'Reversal for Cancelled Sales Invoice' } }
      ]
    };

    if (startDate || endDate) {
      whereClause.createdAt = {};
      const parsedStart = parseFilterStartDate(startDate);
      if (parsedStart) {
        whereClause.createdAt.gte = parsedStart;
      }
      const parsedEnd = parseFilterEndDate(endDate);
      if (parsedEnd) {
        whereClause.createdAt.lte = parsedEnd;
      }
    }

    const ledgers = await prisma.stockLedger.findMany({
      where: whereClause,
      include: {
        item: { select: { id: true, name: true, sku: true, unit: true, conversionFactor: true } },
        batch: { select: { id: true, batchNumber: true, expiryDate: true, mrp: true, ptr: true, pts: true, currentStock: true } },
        user: {
          select: { id: true, username: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(1000, parseInt(limit) || 200)
    });

    let totalRefundAmount = 0;
    let totalUnitsReturned = 0;

    const formattedReturns = ledgers
      .filter(l => {
        // Double check to ensure internal invoice edit reversals are excluded
        if (!l.notes) return true;
        return !l.notes.includes('Reversal for Edited') && !l.notes.includes('Reversal for Cancelled') && !l.notes.includes('Invoice Edit');
      })
      .map(l => {
        const factor = l.item.conversionFactor || 1;
        const units = Math.abs(l.quantity);
        totalUnitsReturned += units;

        let patientName = 'Cash Customer';
        let reason = 'Patient Return / Refund';
        let refundAmount = 0;
        let strips = Math.floor(units / factor);
        let looseQty = units % factor;

        // Extract details from notes if structured or legacy
        if (l.notes) {
          try {
            if (l.notes.startsWith('{') && l.notes.endsWith('}')) {
              const parsed = JSON.parse(l.notes);
              if (parsed.patientName) patientName = parsed.patientName;
              if (parsed.reason) reason = parsed.reason;
              if (parsed.refundAmount !== undefined) refundAmount = Number(parsed.refundAmount);
              if (parsed.strips !== undefined) strips = Number(parsed.strips);
              if (parsed.looseQty !== undefined) looseQty = Number(parsed.looseQty);
            } else {
              // Legacy format: "Patient Return (Patient Name): +X units (Refund ₹250.00)"
              const patientMatch = l.notes.match(/Patient Return \((.*?)\)/i) || l.notes.match(/Patient: (.*?)(?: \||\))/i);
              if (patientMatch && patientMatch[1]) patientName = patientMatch[1].trim();

              const refundMatch = l.notes.match(/Refund ₹?([0-9.]+)/i);
              if (refundMatch && refundMatch[1]) {
                refundAmount = parseFloat(refundMatch[1]);
              }

              const reasonMatch = l.notes.match(/Reason: (.*?)(?: \||\))/i);
              if (reasonMatch && reasonMatch[1]) {
                reason = reasonMatch[1].trim();
              } else if (!l.notes.startsWith('Patient Return')) {
              reason = l.notes;
            }
          }
        } catch {
          reason = l.notes || reason;
        }
      }

      // If refundAmount was not explicitly parsed, fallback to MRP-based calculation
      if (!refundAmount || refundAmount <= 0) {
        const itemMrp = Number(l.batch?.mrp || l.unitPrice || 0);
        refundAmount = Math.round(((strips * itemMrp) + (looseQty * (itemMrp / factor))) * 100) / 100;
        if (refundAmount <= 0 && l.unitPrice) {
          refundAmount = Math.round(Number(l.unitPrice) * units * 100) / 100;
        }
      }

      totalRefundAmount += refundAmount;

      return {
        id: l.id,
        voucherNumber: l.referenceId || `RET-${l.createdAt.getFullYear()}-${l.id.slice(0, 6).toUpperCase()}`,
        createdAt: l.createdAt.toISOString(),
        itemId: l.itemId,
        medicineName: l.item.name,
        sku: l.item.sku,
        unit: l.item.unit,
        conversionFactor: factor,
        batchId: l.batchId,
        batchNumber: l.batch?.batchNumber || 'N/A',
        expiryDate: l.batch?.expiryDate ? l.batch.expiryDate.toISOString().split('T')[0] : null,
        mrp: Number(l.batch?.mrp || 0),
        ptr: Number(l.batch?.ptr || l.batch?.pts || 0),
        pts: Number(l.batch?.pts || 0),
        currentStock: l.batch?.currentStock ?? 0,
        unitsReturned: units,
        strips,
        looseQty,
        refundAmount,
        patientName,
        reason,
        rawNotes: l.notes,
        createdByUser: l.user?.username || 'Staff'
      };
    });

    const filtered = search
      ? formattedReturns.filter(r =>
          r.medicineName.toLowerCase().includes(search.toLowerCase()) ||
          r.patientName.toLowerCase().includes(search.toLowerCase()) ||
          r.batchNumber.toLowerCase().includes(search.toLowerCase()) ||
          r.voucherNumber.toLowerCase().includes(search.toLowerCase()) ||
          r.reason.toLowerCase().includes(search.toLowerCase())
        )
      : formattedReturns;

    res.status(200).json({
      success: true,
      returns: filtered,
      summary: {
        totalReturnsCount: filtered.length,
        totalRefundAmount: Math.round(totalRefundAmount * 100) / 100,
        totalUnitsReturned
      }
    });
  } catch (error: any) {
    console.error('Error fetching patient returns:', error);
    res.status(500).json({ error: 'Failed to fetch patient returns log' });
  }
});

/**
 * POST /inventory/quick-return
 * Multi-Item / 1-Click Patient Medicine Return & Stock Inward with audit logging
 */
router.post('/quick-return', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const userId = req.user!.userId;
  const {
    items, // Array of { batchId, strips, looseQty, quantity, refundAmount }
    batchId, // Single item fallback
    strips = 0,
    looseQty = 0,
    quantity = 0,
    refundAmount,
    patientName,
    reason,
    totalRefundAmount: customTotalRefund
  } = req.body;

  // Normalize incoming payload to a list of return items
  const rawItemsList: Array<{
    batchId: string;
    strips?: number;
    looseQty?: number;
    quantity?: number;
    refundAmount?: number;
  }> = Array.isArray(items) && items.length > 0
    ? items
    : (batchId ? [{ batchId, strips, looseQty, quantity, refundAmount }] : []);

  if (rawItemsList.length === 0) {
    res.status(400).json({ error: 'At least one medicine item is required for patient return' });
    return;
  }

  try {
    const returnVoucherNo = `RET-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const finalPatientName = patientName?.trim() || 'Cash Customer';
    const finalReason = reason?.trim() || 'Patient Medicine Return';

    const processedItems: Array<{
      batchId: string;
      itemId: string;
      medicineName: string;
      sku: string;
      batchNumber: string;
      expiryDate: string | null;
      unit: string;
      conversionFactor: number;
      strips: number;
      looseQty: number;
      unitsToAdd: number;
      unitRetailPrice: number;
      calculatedRefund: number;
    }> = [];

    // Pre-validate all batches
    for (const raw of rawItemsList) {
      if (!raw.batchId) {
        res.status(400).json({ error: 'All returned items must specify a valid batch ID' });
        return;
      }

      const batch = await prisma.batch.findFirst({
        where: { id: raw.batchId, companyId },
        include: { item: true }
      });

      if (!batch) {
        res.status(404).json({ error: `Batch ID "${raw.batchId}" not found in company` });
        return;
      }

      const factor = batch.item.conversionFactor || 1;
      const numStrips = Math.max(0, parseInt(String(raw.strips || 0)) || 0);
      const numLoose = Math.max(0, parseInt(String(raw.looseQty || 0)) || 0);
      const directQty = Math.max(0, parseInt(String(raw.quantity || 0)) || 0);

      const totalUnitsToAdd = (numStrips > 0 || numLoose > 0)
        ? (numStrips * factor) + numLoose
        : directQty;

      if (totalUnitsToAdd <= 0) {
        res.status(400).json({ error: `Return quantity for "${batch.item.name}" must be greater than 0` });
        return;
      }

      const unitRetailPrice = Number(batch.mrp) > 0 ? Number(batch.mrp) : Number(batch.pts || 0);
      const itemRefund = (raw.refundAmount !== undefined && raw.refundAmount !== null && Number(raw.refundAmount) >= 0 && String(raw.refundAmount).trim() !== '')
        ? Number(raw.refundAmount)
        : Math.round(((numStrips * unitRetailPrice) + (numLoose * (unitRetailPrice / factor))) * 100) / 100;

      processedItems.push({
        batchId: batch.id,
        itemId: batch.itemId,
        medicineName: batch.item.name,
        sku: batch.item.sku,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate ? batch.expiryDate.toISOString().split('T')[0] : null,
        unit: batch.item.unit,
        conversionFactor: factor,
        strips: numStrips,
        looseQty: numLoose,
        unitsToAdd: totalUnitsToAdd,
        unitRetailPrice,
        calculatedRefund: itemRefund
      });
    }

    let calculatedGrandTotalRefund = processedItems.reduce((sum, itm) => sum + itm.calculatedRefund, 0);
    calculatedGrandTotalRefund = Math.round(calculatedGrandTotalRefund * 100) / 100;

    const finalGrandTotalRefund = (customTotalRefund !== undefined && customTotalRefund !== null && Number(customTotalRefund) >= 0)
      ? Number(customTotalRefund)
      : calculatedGrandTotalRefund;

    // Execute atomic transaction for all returned items
    const txResults = await prisma.$transaction(async (tx) => {
      const updatedBatches = [];
      const ledgerEntries = [];

      for (let i = 0; i < processedItems.length; i++) {
        const item = processedItems[i];

        // 1. Increment batch stock
        const updatedBatch = await tx.batch.update({
          where: { id: item.batchId },
          data: {
            currentStock: { increment: item.unitsToAdd }
          }
        });
        updatedBatches.push(updatedBatch);

        // 2. Log immutable stock ledger audit entry
        const structuredPayload = {
          voucherNo: returnVoucherNo,
          patientName: finalPatientName,
          reason: finalReason,
          medicineName: item.medicineName,
          sku: item.sku,
          batchNumber: item.batchNumber,
          strips: item.strips,
          looseQty: item.looseQty,
          units: item.unitsToAdd,
          refundAmount: item.calculatedRefund,
          itemIndex: i + 1,
          totalItemsInReturn: processedItems.length
        };

        const ledgerEntry = await tx.stockLedger.create({
          data: {
            companyId,
            itemId: item.itemId,
            batchId: item.batchId,
            entryType: 'SALE_RETURN',
            quantity: item.unitsToAdd,
            unitPrice: item.unitRetailPrice,
            referenceId: returnVoucherNo,
            notes: JSON.stringify(structuredPayload),
            createdBy: userId
          }
        });
        ledgerEntries.push(ledgerEntry);
      }

      return { updatedBatches, ledgerEntries };
    });

    const totalUnitsRestored = processedItems.reduce((sum, itm) => sum + itm.unitsToAdd, 0);

    res.status(200).json({
      success: true,
      message: `Successfully returned ${processedItems.length} medicine(s) (${totalUnitsRestored} total units) under voucher ${returnVoucherNo}`,
      voucherNumber: returnVoucherNo,
      patientName: finalPatientName,
      reason: finalReason,
      totalItemsCount: processedItems.length,
      totalUnitsAdded: totalUnitsRestored,
      totalRefundAmount: finalGrandTotalRefund,
      items: processedItems.map(p => ({
        medicineName: p.medicineName,
        sku: p.sku,
        batchNumber: p.batchNumber,
        expiryDate: p.expiryDate,
        unit: p.unit,
        conversionFactor: p.conversionFactor,
        strips: p.strips,
        looseQty: p.looseQty,
        unitsAdded: p.unitsToAdd,
        mrp: p.unitRetailPrice,
        refundAmount: p.calculatedRefund
      }))
    });
  } catch (error: any) {
    console.error('Multi-item medicine return error:', error);
    res.status(500).json({ error: error.message || 'Failed to process patient medicine return' });
  }
});

export default router;

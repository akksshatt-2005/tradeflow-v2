import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireCompany, CompanyScopedRequest } from '../middleware/company.js';
import prisma from '../prisma.js';

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
          select: { id: true, sku: true, name: true, unit: true, genericName: true }
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

export default router;

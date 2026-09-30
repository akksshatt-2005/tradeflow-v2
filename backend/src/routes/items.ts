import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireCompany, CompanyScopedRequest } from '../middleware/company.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import prisma from '../prisma.js';
import { generateUniqueItemSku } from '../utils/skuGenerator.js';

const router = Router();

// Require both user auth and active company access for all item routes
router.use(requireAuth);
router.use(requireCompany);

/**
 * GET /items
 * List items with optional search (name, genericName, sku) and pagination
 */
router.get('/', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 50));
  const skip = (page - 1) * limit;

  try {
    const where: any = {
      companyId
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { genericName: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { manufacturer: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [total, items] = await Promise.all([
      prisma.item.count({ where }),
      prisma.item.findMany({
        where,
        include: {
          batches: {
            select: {
              id: true,
              batchNumber: true,
              expiryDate: true,
              mrp: true,
              ptr: true,
              pts: true,
              currentStock: true
            },
            orderBy: {
              createdAt: 'desc'
            }
          }
        },
        orderBy: {
          name: 'asc'
        },
        skip,
        take: limit
      })
    ]);

    const formattedItems = items.map(item => {
      const totalStock = item.batches.reduce((sum, b) => sum + b.currentStock, 0);
      const activeBatchesCount = item.batches.filter(b => b.currentStock > 0).length;
      return {
        id: item.id,
        sku: item.sku,
        name: item.name,
        genericName: item.genericName,
        manufacturer: item.manufacturer,
        hsnCode: item.hsnCode,
        gstRate: Number(item.gstRate),
        unit: item.unit,
        conversionFactor: item.conversionFactor,
        minStockLevel: item.minStockLevel,
        totalStock,
        activeBatchesCount,
        batches: item.batches.map(b => ({
          id: b.id,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate.toISOString(),
          mrp: Number(b.mrp),
          ptr: Number(b.ptr),
          pts: Number(b.pts),
          currentStock: b.currentStock
        })),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      };
    });

    res.status(200).json({
      items: formattedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

/**
 * POST /items
 * Create new medicine item
 */
router.post('/', idempotencyMiddleware, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const {
    name,
    sku,
    genericName,
    manufacturer,
    hsnCode,
    gstRate,
    unit,
    conversionFactor,
    minStockLevel
  } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    res.status(400).json({ error: 'Medicine/Item name must be at least 2 characters long' });
    return;
  }

  const trimmedName = name.trim();
  const preferredSku = (sku && typeof sku === 'string' && sku.trim().length > 0)
    ? sku.trim().toUpperCase()
    : null;

  try {
    // Auto-generate or validate unique SKU
    const finalSku = await generateUniqueItemSku(prisma, companyId, preferredSku);


    const item = await prisma.item.create({
      data: {
        companyId,
        sku: finalSku,
        name: trimmedName,
        genericName: genericName ? String(genericName).trim() : null,
        manufacturer: manufacturer ? String(manufacturer).trim() : null,
        hsnCode: hsnCode ? String(hsnCode).trim() : '3004',
        gstRate: gstRate !== undefined ? Number(gstRate) : 12.0,
        unit: unit ? String(unit).trim().toUpperCase() : 'STRIP',
        conversionFactor: conversionFactor ? Math.max(1, parseInt(conversionFactor)) : 1,
        minStockLevel: minStockLevel ? Math.max(0, parseInt(minStockLevel)) : 0
      }
    });

    res.status(201).json({
      item: {
        ...item,
        gstRate: Number(item.gstRate),
        totalStock: 0,
        activeBatchesCount: 0,
        batches: []
      },
      message: 'Item created successfully'
    });
  } catch (error: any) {
    console.error('Error creating item:', error);
    res.status(500).json({ error: error.message || 'Failed to create item' });
  }
});

/**
 * GET /items/:id
 * Get item details with all batches
 */
router.get('/:id', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { id } = req.params;

  try {
    const item = await prisma.item.findFirst({
      where: { id, companyId },
      include: {
        batches: {
          orderBy: { expiryDate: 'asc' }
        }
      }
    });

    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const totalStock = item.batches.reduce((sum, b) => sum + b.currentStock, 0);

    res.status(200).json({
      item: {
        id: item.id,
        sku: item.sku,
        name: item.name,
        genericName: item.genericName,
        manufacturer: item.manufacturer,
        hsnCode: item.hsnCode,
        gstRate: Number(item.gstRate),
        unit: item.unit,
        conversionFactor: item.conversionFactor,
        minStockLevel: item.minStockLevel,
        totalStock,
        batches: item.batches.map(b => ({
          id: b.id,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate.toISOString(),
          mrp: Number(b.mrp),
          ptr: Number(b.ptr),
          pts: Number(b.pts),
          currentStock: b.currentStock
        })),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }
    });
  } catch (error: any) {
    console.error('Error fetching item details:', error);
    res.status(500).json({ error: 'Failed to fetch item details' });
  }
});

/**
 * PUT /items/:id
 * Update item details
 */
router.put('/:id', idempotencyMiddleware, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { id } = req.params;
  const {
    name,
    genericName,
    manufacturer,
    hsnCode,
    gstRate,
    unit,
    conversionFactor,
    minStockLevel
  } = req.body;

  try {
    const existing = await prisma.item.findFirst({
      where: { id, companyId }
    });

    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const updated = await prisma.item.update({
      where: { id },
      data: {
        name: name !== undefined ? String(name).trim() : existing.name,
        genericName: genericName !== undefined ? (genericName ? String(genericName).trim() : null) : existing.genericName,
        manufacturer: manufacturer !== undefined ? (manufacturer ? String(manufacturer).trim() : null) : existing.manufacturer,
        hsnCode: hsnCode !== undefined ? String(hsnCode).trim() : existing.hsnCode,
        gstRate: gstRate !== undefined ? Number(gstRate) : existing.gstRate,
        unit: unit !== undefined ? String(unit).trim().toUpperCase() : existing.unit,
        conversionFactor: conversionFactor !== undefined ? Math.max(1, parseInt(conversionFactor)) : existing.conversionFactor,
        minStockLevel: minStockLevel !== undefined ? Math.max(0, parseInt(minStockLevel)) : existing.minStockLevel
      }
    });

    res.status(200).json({
      item: {
        ...updated,
        gstRate: Number(updated.gstRate)
      },
      message: 'Item updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

/**
 * POST /items/:itemId/batches
 * Add new batch & opening stock entry (Rule E: append-only ledger write)
 */
router.post('/:itemId/batches', idempotencyMiddleware, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const userId = req.user!.userId;
  const { itemId } = req.params;
  const {
    batchNumber,
    expiryDate,
    mrp,
    ptr,
    pts,
    openingStock
  } = req.body;

  if (!batchNumber || typeof batchNumber !== 'string' || batchNumber.trim().length === 0) {
    res.status(400).json({ error: 'Batch number is required' });
    return;
  }

  if (!expiryDate) {
    res.status(400).json({ error: 'Expiry date is required (format: YYYY-MM or YYYY-MM-DD)' });
    return;
  }

  const parsedExpiry = new Date(expiryDate);
  if (isNaN(parsedExpiry.getTime())) {
    res.status(400).json({ error: 'Invalid expiry date format' });
    return;
  }

  const cleanBatchNum = batchNumber.trim().toUpperCase();
  const numMrp = Number(mrp) || 0;
  const numPtr = Number(ptr) || 0;
  const numPts = Number(pts) || numMrp;
  const initialStock = Math.max(0, parseInt(openingStock) || 0);

  try {
    const item = await prisma.item.findFirst({
      where: { id: itemId, companyId }
    });

    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    // Check if batch already exists for this item
    const existingBatch = await prisma.batch.findUnique({
      where: {
        companyId_itemId_batchNumber: {
          companyId,
          itemId,
          batchNumber: cleanBatchNum
        }
      }
    });

    if (existingBatch) {
      res.status(409).json({ error: `Batch "${cleanBatchNum}" already exists for this medicine` });
      return;
    }

    // Atomic transaction: Create Batch + Write Opening Balance to StockLedger
    const result = await prisma.$transaction(async (tx) => {
      const newBatch = await tx.batch.create({
        data: {
          companyId,
          itemId,
          batchNumber: cleanBatchNum,
          expiryDate: parsedExpiry,
          mrp: numMrp,
          ptr: numPtr,
          pts: numPts,
          currentStock: initialStock
        }
      });

      if (initialStock > 0) {
        await tx.stockLedger.create({
          data: {
            companyId,
            itemId,
            batchId: newBatch.id,
            entryType: 'OPENING_BALANCE',
            quantity: initialStock,
            unitPrice: numPtr > 0 ? numPtr : numPts,
            notes: 'Opening stock entry',
            createdBy: userId
          }
        });
      }

      return newBatch;
    });

    res.status(201).json({
      batch: {
        id: result.id,
        batchNumber: result.batchNumber,
        expiryDate: result.expiryDate.toISOString(),
        mrp: Number(result.mrp),
        ptr: Number(result.ptr),
        pts: Number(result.pts),
        currentStock: result.currentStock
      },
      message: 'Batch added successfully'
    });
  } catch (error: any) {
    console.error('Error adding batch:', error);
    res.status(500).json({ error: 'Failed to add batch' });
  }
});

/**
 * DELETE /items/:id
 * Delete a medicine item (only if no purchases or invoices reference it)
 */
router.delete('/:id', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { id } = req.params;

  try {
    const item = await prisma.item.findFirst({
      where: { id, companyId }
    });

    if (!item) {
      res.status(404).json({ error: 'Medicine item not found' });
      return;
    }

    // Perform clean cascade deletion in atomic transaction
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL app.allow_ledger_cleanup = 'on';");
      // 1. Remove associated purchase items
      await tx.purchaseItem.deleteMany({ where: { itemId: id } });
      // 2. Remove associated invoice items
      await tx.invoiceItem.deleteMany({ where: { itemId: id } });
      // 3. Remove associated stock ledger entries
      await tx.stockLedger.deleteMany({ where: { itemId: id, companyId } });
      // 4. Remove batches
      await tx.batch.deleteMany({ where: { itemId: id, companyId } });
      // 5. Remove the medicine item
      await tx.item.delete({ where: { id } });
    });

    res.status(200).json({ message: `Medicine "${item.name}" deleted successfully` });
  } catch (error: any) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: error.message || 'Failed to delete medicine' });
  }
});

export default router;

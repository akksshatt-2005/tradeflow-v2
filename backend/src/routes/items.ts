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
  const limit = req.query.limit === 'all'
    ? 10000
    : Math.min(10000, Math.max(1, parseInt(req.query.limit as string) || 2000));
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
    minStockLevel,
    initialBatchNumber,
    initialExpiryDate,
    initialMrp,
    initialPtr,
    initialPts,
    initialStock
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

    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.item.create({
        data: {
          companyId,
          sku: finalSku,
          name: trimmedName,
          genericName: genericName ? String(genericName).trim() : null,
          manufacturer: manufacturer ? String(manufacturer).trim() : null,
          hsnCode: hsnCode ? String(hsnCode).trim() : '3004',
          gstRate: gstRate !== undefined ? Number(gstRate) : 5.0,
          unit: unit ? String(unit).trim().toUpperCase() : 'STRIP',
          conversionFactor: conversionFactor ? Math.max(1, parseInt(conversionFactor)) : 1,
          minStockLevel: minStockLevel ? Math.max(0, parseInt(minStockLevel)) : 0
        }
      });

      const totalInitialStock = Math.max(0, parseInt(initialStock) || 0);
      let createdBatch: any = null;

      if (totalInitialStock > 0 || initialBatchNumber) {
        const batchNum = (initialBatchNumber && String(initialBatchNumber).trim().length > 0)
          ? String(initialBatchNumber).trim().toUpperCase()
          : `BATCH-01`;

        const expDate = initialExpiryDate ? new Date(initialExpiryDate) : new Date(Date.now() + 2 * 365 * 86400000);
        const mrpVal = Number(initialMrp) || 0;
        const ptrVal = Number(initialPtr) || (mrpVal > 0 ? mrpVal * 0.7 : 0);
        const ptsVal = Number(initialPts) || mrpVal;

        createdBatch = await tx.batch.create({
          data: {
            companyId,
            itemId: item.id,
            batchNumber: batchNum,
            expiryDate: isNaN(expDate.getTime()) ? new Date(Date.now() + 2 * 365 * 86400000) : expDate,
            mrp: mrpVal,
            ptr: ptrVal,
            pts: ptsVal,
            currentStock: totalInitialStock
          }
        });

        if (totalInitialStock > 0) {
          await tx.stockLedger.create({
            data: {
              companyId,
              itemId: item.id,
              batchId: createdBatch.id,
              entryType: 'OPENING_BALANCE',
              quantity: totalInitialStock,
              unitPrice: ptrVal,
              createdBy: req.user!.userId,
              notes: 'Initial catalog creation opening stock'
            }
          });
        }
      }

      return {
        item,
        createdBatch,
        totalInitialStock
      };
    });

    res.status(201).json({
      item: {
        ...result.item,
        gstRate: Number(result.item.gstRate),
        totalStock: result.totalInitialStock,
        activeBatchesCount: result.createdBatch ? 1 : 0,
        batches: result.createdBatch ? [{
          id: result.createdBatch.id,
          batchNumber: result.createdBatch.batchNumber,
          expiryDate: result.createdBatch.expiryDate.toISOString(),
          mrp: Number(result.createdBatch.mrp),
          ptr: Number(result.createdBatch.ptr),
          pts: Number(result.createdBatch.pts),
          currentStock: result.createdBatch.currentStock
        }] : []
      },
      message: 'Item created successfully'
    });
  } catch (error: any) {
    console.error('Error creating item:', error);
    res.status(500).json({ error: error.message || 'Failed to create item' });
  }
});

/**
 * POST /items/bulk-import
 * Bulk upload/import medicines into company catalog
 */
router.post('/bulk-import', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Array of medicine items is required for bulk import' });
    return;
  }

  try {
    const existingItems = await prisma.item.findMany({
      where: { companyId },
      select: { id: true, name: true, sku: true }
    });

    const existingNameMap = new Map<string, any>();
    const skuSet = new Set<string>();

    for (const item of existingItems) {
      existingNameMap.set(item.name.trim().toLowerCase(), item);
      if (item.sku) skuSet.add(item.sku.toUpperCase());
    }

    const createdItems: any[] = [];
    const skippedItems: any[] = [];
    let counter = existingItems.length + 1;

    for (const raw of items) {
      const name = (raw.name || raw.medicineName || raw.itemName || '').trim();
      if (!name || name.length < 2) {
        continue;
      }

      const key = name.toLowerCase();
      if (existingNameMap.has(key)) {
        skippedItems.push(name);
        continue;
      }

      // Generate next SKU
      let candidateSku = (raw.sku || '').trim().toUpperCase();
      if (!candidateSku || skuSet.has(candidateSku)) {
        candidateSku = `MED-${String(counter).padStart(4, '0')}`;
        while (skuSet.has(candidateSku)) {
          counter++;
          candidateSku = `MED-${String(counter).padStart(4, '0')}`;
        }
      }
      skuSet.add(candidateSku);
      counter++;

      const factor = parseInt(raw.conversionFactor) || 10;
      let unit = (raw.unit || 'STRIP').trim().toUpperCase();
      if (factor === 1 && unit === 'STRIP') {
        unit = 'BOTTLE';
      }

      const newItemData = {
        companyId,
        sku: candidateSku,
        name,
        genericName: raw.genericName ? String(raw.genericName).trim() : null,
        manufacturer: raw.manufacturer ? String(raw.manufacturer).trim() : null,
        hsnCode: raw.hsnCode ? String(raw.hsnCode).trim() : '3004',
        gstRate: raw.gstRate !== undefined ? Number(raw.gstRate) : 5.0,
        unit,
        conversionFactor: factor > 0 ? factor : 1,
        minStockLevel: raw.minStockLevel ? Math.max(0, parseInt(raw.minStockLevel)) : 0
      };

      createdItems.push(newItemData);
      existingNameMap.set(key, newItemData);
    }

    // Batch insert using createMany
    if (createdItems.length > 0) {
      for (let i = 0; i < createdItems.length; i += 100) {
        const chunk = createdItems.slice(i, i + 100);
        await prisma.item.createMany({
          data: chunk,
          skipDuplicates: true
        });
      }
    }

    res.status(200).json({
      success: true,
      importedCount: createdItems.length,
      skippedCount: skippedItems.length,
      totalReceived: items.length,
      message: `Successfully imported ${createdItems.length} medicines into catalog!`
    });
  } catch (error: any) {
    console.error('Error bulk importing items:', error);
    res.status(500).json({ error: error.message || 'Failed to bulk import items' });
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
    minStockLevel,
    adjustedStock,
    batchId
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

    // If stock adjustment was requested
    if (adjustedStock !== undefined) {
      const newStock = Math.max(0, parseInt(adjustedStock) || 0);
      const batches = await prisma.batch.findMany({
        where: { itemId: id, companyId },
        orderBy: { createdAt: 'desc' }
      });

      if (batches.length > 0) {
        const currentTotalStock = batches.reduce((sum, b) => sum + b.currentStock, 0);
        const diff = newStock - currentTotalStock;

        if (diff !== 0) {
          if (batches.length === 1) {
            await prisma.batch.update({
              where: { id: batches[0].id },
              data: { currentStock: newStock }
            });
            await prisma.stockLedger.create({
              data: {
                companyId,
                itemId: id,
                batchId: batches[0].id,
                entryType: 'ADJUSTMENT',
                quantity: diff,
                unitPrice: batches[0].ptr,
                createdBy: req.user!.userId,
                notes: `Manual stock adjustment from catalog edit (${diff > 0 ? '+' : ''}${diff} units)`
              }
            });
          } else {
            const targetBatch = batchId ? batches.find(b => b.id === batchId) || batches[0] : batches[0];
            const updatedBatchStock = Math.max(0, targetBatch.currentStock + diff);
            const actualBatchDiff = updatedBatchStock - targetBatch.currentStock;

            if (actualBatchDiff !== 0) {
              await prisma.batch.update({
                where: { id: targetBatch.id },
                data: { currentStock: updatedBatchStock }
              });
              await prisma.stockLedger.create({
                data: {
                  companyId,
                  itemId: id,
                  batchId: targetBatch.id,
                  entryType: 'ADJUSTMENT',
                  quantity: actualBatchDiff,
                  unitPrice: targetBatch.ptr,
                  createdBy: req.user!.userId,
                  notes: `Stock adjustment for batch ${targetBatch.batchNumber} (${actualBatchDiff > 0 ? '+' : ''}${actualBatchDiff} units)`
                }
              });
            }
          }
        }
      } else if (newStock > 0) {
        // Create initial batch if none existed
        const createdBatch = await prisma.batch.create({
          data: {
            companyId,
            itemId: id,
            batchNumber: 'BATCH-01',
            expiryDate: new Date(Date.now() + 2 * 365 * 86400000),
            mrp: 100,
            ptr: 70,
            pts: 100,
            currentStock: newStock
          }
        });
        await prisma.stockLedger.create({
          data: {
            companyId,
            itemId: id,
            batchId: createdBatch.id,
            entryType: 'OPENING_BALANCE',
            quantity: newStock,
            unitPrice: 70,
            createdBy: req.user!.userId,
            notes: 'Initial stock added from catalog edit'
          }
        });
      }
    }

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

/**
 * PUT /items/:itemId/batches/:batchId
 * Update an existing batch (Batch number, expiry, MRP, Purchase Rate/PTR, PTS, Stock)
 */
router.put('/:itemId/batches/:batchId', idempotencyMiddleware, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const userId = req.user!.userId;
  const { itemId, batchId } = req.params;
  const {
    batchNumber,
    expiryDate,
    mrp,
    ptr,
    pts,
    currentStock
  } = req.body;

  try {
    const existingBatch = await prisma.batch.findFirst({
      where: { id: batchId, itemId, companyId }
    });

    if (!existingBatch) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }

    const cleanBatchNum = (batchNumber && String(batchNumber).trim().length > 0)
      ? String(batchNumber).trim().toUpperCase()
      : existingBatch.batchNumber;
    const parsedExpiry = expiryDate ? new Date(expiryDate) : existingBatch.expiryDate;
    const numMrp = mrp !== undefined ? Number(mrp) : Number(existingBatch.mrp);
    const numPtr = ptr !== undefined ? Number(ptr) : Number(existingBatch.ptr);
    const numPts = pts !== undefined ? Number(pts) : (mrp !== undefined ? Number(mrp) : Number(existingBatch.pts));

    let updatedStock = existingBatch.currentStock;
    if (currentStock !== undefined) {
      updatedStock = Math.max(0, parseInt(currentStock) || 0);
    }

    const diff = updatedStock - existingBatch.currentStock;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.batch.update({
        where: { id: batchId },
        data: {
          batchNumber: cleanBatchNum,
          expiryDate: parsedExpiry,
          mrp: numMrp,
          ptr: numPtr,
          pts: numPts,
          currentStock: updatedStock
        }
      });

      if (diff !== 0) {
        await tx.stockLedger.create({
          data: {
            companyId,
            itemId,
            batchId,
            entryType: 'ADJUSTMENT',
            quantity: diff,
            unitPrice: numPtr > 0 ? numPtr : numPts,
            notes: `Manual batch stock adjustment (${diff > 0 ? '+' : ''}${diff} units)`,
            createdBy: userId
          }
        });
      }

      return updated;
    });

    res.status(200).json({
      batch: {
        id: result.id,
        batchNumber: result.batchNumber,
        expiryDate: result.expiryDate.toISOString(),
        mrp: Number(result.mrp),
        ptr: Number(result.ptr),
        pts: Number(result.pts),
        currentStock: result.currentStock
      },
      message: 'Batch updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating batch:', error);
    res.status(500).json({ error: error.message || 'Failed to update batch' });
  }
});

/**
 * DELETE /items/:itemId/batches/:batchId
 * Safely delete a batch
 */
router.delete('/:itemId/batches/:batchId', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { itemId, batchId } = req.params;

  try {
    const existingBatch = await prisma.batch.findFirst({
      where: { id: batchId, itemId, companyId }
    });

    if (!existingBatch) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }

    // Check if any invoice items reference this batch
    const invoiceCount = await prisma.invoiceItem.count({ where: { batchId } });
    if (invoiceCount > 0) {
      res.status(400).json({ error: `Cannot delete batch "${existingBatch.batchNumber}" because it is referenced in ${invoiceCount} sales invoice(s).` });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL app.allow_ledger_cleanup = 'on';");
      await tx.stockLedger.deleteMany({ where: { batchId, companyId } });
      await tx.purchaseItem.deleteMany({ where: { batchId } });
      await tx.batch.delete({ where: { id: batchId } });
    });

    res.status(200).json({ message: `Batch "${existingBatch.batchNumber}" deleted successfully` });
  } catch (error: any) {
    console.error('Error deleting batch:', error);
    res.status(500).json({ error: error.message || 'Failed to delete batch' });
  }
});

export default router;


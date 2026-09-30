import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireCompany, CompanyScopedRequest } from '../middleware/company.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import prisma from '../prisma.js';
import { generateUniqueItemSku } from '../utils/skuGenerator.js';

const router = Router();

// Require auth and company access
router.use(requireAuth);
router.use(requireCompany);

/**
 * GET /purchases
 * List purchases with optional search and filters
 */
router.get('/', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : '';
  const supplierId = typeof req.query.supplierId === 'string' ? req.query.supplierId.trim() : '';
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const skip = (page - 1) * limit;

  try {
    const where: any = { companyId };

    if (status && ['PAID', 'PARTIAL', 'UNPAID'].includes(status)) {
      where.status = status;
    }

    if (supplierId) {
      where.supplierId = supplierId;
    }

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
        { supplier: { mailTo: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [total, purchases] = await Promise.all([
      prisma.purchase.count({ where }),
      prisma.purchase.findMany({
        where,
        include: {
          supplier: {
            select: { id: true, name: true, mailTo: true, phone: true, gstin: true, drugLicenseNo: true }
          },
          creator: {
            select: { id: true, username: true }
          },
          items: {
            include: {
              item: { select: { name: true, sku: true, unit: true } }
            }
          }
        },
        orderBy: { purchaseDate: 'desc' },
        skip,
        take: limit
      })
    ]);

    const formatted = purchases.map(p => ({
      id: p.id,
      invoiceNumber: p.invoiceNumber,
      purchaseDate: p.purchaseDate.toISOString(),
      dueDate: p.dueDate ? p.dueDate.toISOString() : null,
      paymentMode: p.paymentMode,
      subtotal: Number(p.subtotal),
      totalDiscount: Number(p.totalDiscount),
      taxableAmount: Number(p.taxableAmount),
      cgstAmount: Number(p.cgstAmount),
      sgstAmount: Number(p.sgstAmount),
      igstAmount: Number(p.igstAmount),
      roundOff: Number(p.roundOff),
      totalAmount: Number(p.totalAmount),
      paidAmount: Number(p.paidAmount),
      status: p.status,
      notes: p.notes,
      supplier: p.supplier,
      createdByUser: p.creator.username,
      itemsCount: p.items.length,
      createdAt: p.createdAt.toISOString()
    }));

    res.status(200).json({
      purchases: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error('Error listing purchases:', error);
    res.status(500).json({ error: error.message || 'Failed to list purchases' });
  }
});

/**
 * POST /purchases
 * Create atomic Inward Purchase Bill (Rule E & Strict ACID ledger)
 */
router.post('/', idempotencyMiddleware, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const userId = req.user!.userId;
  const {
    supplierId,
    invoiceNumber,
    purchaseDate,
    dueDate,
    paymentMode = 'CREDIT',
    paidAmount = 0,
    roundOff = 0,
    notes,
    items
  } = req.body;

  if (!supplierId) {
    res.status(400).json({ error: 'Supplier is required' });
    return;
  }

  if (!invoiceNumber || typeof invoiceNumber !== 'string' || invoiceNumber.trim().length === 0) {
    res.status(400).json({ error: 'Supplier Invoice / Bill number is required' });
    return;
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Purchase bill must contain at least one medicine item' });
    return;
  }

  const cleanInvoiceNo = invoiceNumber.trim().toUpperCase();
  const parsedPurchaseDate = new Date(purchaseDate || Date.now());
  const parsedDueDate = dueDate ? new Date(dueDate) : null;

  try {
    // Check supplier exists & belongs to company
    const supplier = await prisma.party.findFirst({
      where: { id: supplierId, companyId }
    });

    if (!supplier) {
      res.status(404).json({ error: 'Selected supplier not found in this company' });
      return;
    }

    // Check duplicate invoice from this supplier
    const existing = await prisma.purchase.findUnique({
      where: {
        companyId_supplierId_invoiceNumber: {
          companyId,
          supplierId,
          invoiceNumber: cleanInvoiceNo
        }
      }
    });

    if (existing) {
      res.status(409).json({ error: `Invoice "${cleanInvoiceNo}" from "${supplier.name}" has already been entered` });
      return;
    }

    // Calculate totals across items
    let subtotal = 0;
    let totalDiscount = 0;
    let taxableAmount = 0;
    let totalGstAmount = 0;

    const validatedItems: any[] = [];

    for (const rawItem of items) {
      const medName = (rawItem.medicineName || rawItem.itemName || rawItem.name || '').trim();
      if (!rawItem.itemId && !medName) {
        res.status(400).json({ error: 'Each item requires either a medicine ID or medicine name' });
        return;
      }

      if (!rawItem.batchNumber || !rawItem.expiryDate) {
        res.status(400).json({ error: `Batch number and expiry date are required for ${medName || 'each medicine'}` });
        return;
      }

      const qty = parseInt(rawItem.quantity) || 0;
      if (qty <= 0) {
        res.status(400).json({ error: `Quantity must be greater than 0 for batch ${rawItem.batchNumber}` });
        return;
      }

      const freeQty = Math.max(0, parseInt(rawItem.freeQuantity) || 0);
      const ptr = parseFloat(rawItem.purchaseRate) || 0; // PTR
      const mrp = parseFloat(rawItem.mrp) || ptr;
      const pts = parseFloat(rawItem.pts) || mrp;
      const discountPct = Math.max(0, Math.min(100, parseFloat(rawItem.discountPercent) || 0));
      const gstRate = parseFloat(rawItem.gstRate) || 12.0;

      const lineGross = qty * ptr;
      const lineDisc = (lineGross * discountPct) / 100;
      const lineTaxable = lineGross - lineDisc;
      const lineGst = (lineTaxable * gstRate) / 100;
      const lineTotal = lineTaxable + lineGst;

      subtotal += lineGross;
      totalDiscount += lineDisc;
      taxableAmount += lineTaxable;
      totalGstAmount += lineGst;

      validatedItems.push({
        itemId: rawItem.itemId || null,
        medicineName: medName,
        genericName: rawItem.genericName || rawItem.composition || null,
        manufacturer: rawItem.manufacturer || null,
        hsnCode: rawItem.hsnCode || '3004',
        pack: rawItem.pack || null,
        unit: rawItem.unit || null,
        conversionFactor: rawItem.conversionFactor || null,
        sku: rawItem.sku || null,
        batchNumber: rawItem.batchNumber.trim().toUpperCase(),
        expiryDate: new Date(rawItem.expiryDate),
        quantity: qty,
        freeQuantity: freeQty,
        purchaseRate: ptr,
        mrp,
        pts,
        discountPercent: discountPct,
        taxableValue: Math.round(lineTaxable * 100) / 100,
        gstRate,
        gstAmount: Math.round(lineGst * 100) / 100,
        totalAmount: Math.round(lineTotal * 100) / 100
      });
    }

    const numRoundOff = parseFloat(roundOff) || 0;
    const computedTotal = Math.round((taxableAmount + totalGstAmount + numRoundOff) * 100) / 100;
    const numPaid = Math.min(computedTotal, Math.max(0, parseFloat(paidAmount) || 0));

    let status = 'UNPAID';
    if (numPaid >= computedTotal) {
      status = 'PAID';
    } else if (numPaid > 0) {
      status = 'PARTIAL';
    }

    // Split GST into CGST & SGST (assume intra-state standard for now)
    const halfGst = Math.round((totalGstAmount / 2) * 100) / 100;

    // ATOMIC TRANSACTION: Inward Purchase, Batches creation/increment, Stock Ledger write, Party balance update
    const savedPurchase = await prisma.$transaction(async (tx) => {
      // 1. Create Purchase record
      const purchase = await tx.purchase.create({
        data: {
          companyId,
          supplierId,
          invoiceNumber: cleanInvoiceNo,
          purchaseDate: parsedPurchaseDate,
          dueDate: parsedDueDate,
          paymentMode,
          subtotal,
          totalDiscount,
          taxableAmount,
          cgstAmount: halfGst,
          sgstAmount: halfGst,
          igstAmount: 0,
          roundOff: numRoundOff,
          totalAmount: computedTotal,
          paidAmount: numPaid,
          status,
          notes: notes ? String(notes).trim() : null,
          createdBy: userId
        }
      });

      // 2. Process each item: Auto-catalog if needed, Batch upsert & Stock Ledger entry
      const locallyReservedSkus = new Set<string>();

      for (const item of validatedItems) {
        let targetItemId = item.itemId;

        // Verify itemId belongs to company if provided
        if (targetItemId) {
          const verifiedItem = await tx.item.findFirst({
            where: { id: targetItemId, companyId }
          });
          if (!verifiedItem) {
            targetItemId = null;
          }
        }

        // Auto-catalog medicine if itemId was not provided or invalid
        if (!targetItemId) {
          const cleanName = (item.medicineName || '').trim();
          let existingItem = await tx.item.findFirst({
            where: {
              companyId,
              name: { equals: cleanName, mode: 'insensitive' }
            }
          });

          if (!existingItem) {
            // Auto-detect unit and conversion factor from pack (e.g., "10 TAB" -> 10 TAB)
            const packStr = (item.pack || '').trim().toUpperCase();
            let unit = (item.unit || 'STRIP').trim().toUpperCase();
            let conversionFactor = parseInt(item.conversionFactor) || 1;

            if (packStr) {
              const match = packStr.match(/^(\d+)\s*([A-Z]*)/i);
              if (match) {
                if (!item.conversionFactor && match[1]) {
                  conversionFactor = parseInt(match[1]) || 1;
                }
                if (!item.unit && match[2] && match[2].length > 1) {
                  unit = match[2].toUpperCase();
                }
              }
            }

            const autoSku = await generateUniqueItemSku(tx, companyId, item.sku, locallyReservedSkus);

            existingItem = await tx.item.create({
              data: {
                companyId,
                sku: autoSku,
                name: cleanName,
                genericName: item.genericName?.trim() || null,
                manufacturer: item.manufacturer?.trim() || null,
                hsnCode: item.hsnCode?.trim() || '3004',
                gstRate: item.gstRate,
                unit: unit || 'STRIP',
                conversionFactor: conversionFactor > 0 ? conversionFactor : 1,
                minStockLevel: 0
              }
            });
          }

          targetItemId = existingItem.id;
        }

        const totalUnitsInward = item.quantity + item.freeQuantity;

        // Check if batch exists
        let batch = await tx.batch.findUnique({
          where: {
            companyId_itemId_batchNumber: {
              companyId,
              itemId: targetItemId,
              batchNumber: item.batchNumber
            }
          }
        });

        if (batch) {
          // Increment stock on existing batch
          batch = await tx.batch.update({
            where: { id: batch.id },
            data: {
              currentStock: { increment: totalUnitsInward },
              ptr: item.purchaseRate,
              mrp: item.mrp,
              pts: item.pts,
              expiryDate: item.expiryDate
            }
          });
        } else {
          // Create new batch with inward stock
          batch = await tx.batch.create({
            data: {
              companyId,
              itemId: targetItemId,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate,
              mrp: item.mrp,
              ptr: item.purchaseRate,
              pts: item.pts,
              currentStock: totalUnitsInward
            }
          });
        }

        // Create Purchase Item record
        await tx.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            itemId: targetItemId,
            batchId: batch.id,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            pack: item.pack || null,
            quantity: item.quantity,
            freeQuantity: item.freeQuantity,
            purchaseRate: item.purchaseRate,
            mrp: item.mrp,
            discountPercent: item.discountPercent,
            taxableValue: item.taxableValue,
            gstRate: item.gstRate,
            gstAmount: item.gstAmount,
            totalAmount: item.totalAmount
          }
        });

        // Write Append-Only Audit Entry in Stock Ledger (Rule E)
        await tx.stockLedger.create({
          data: {
            companyId,
            itemId: targetItemId,
            batchId: batch.id,
            entryType: 'PURCHASE',
            quantity: totalUnitsInward,
            unitPrice: item.purchaseRate,
            referenceId: purchase.id,
            notes: `Purchase Inward Bill #${cleanInvoiceNo}`,
            createdBy: userId
          }
        });
      }

      // 3. Update Supplier Outstanding Balance for unpaid amount
      const unpaidAmount = computedTotal - numPaid;
      if (unpaidAmount > 0) {
        await tx.party.update({
          where: { id: supplierId },
          data: {
            outstandingBalance: { increment: unpaidAmount }
          }
        });
      }

      return purchase;
    }, { maxWait: 15000, timeout: 30000 });

    const resPaid = Number(savedPurchase.paidAmount);
    const resTotal = Number(savedPurchase.totalAmount);

    res.status(201).json({
      purchase: {
        id: savedPurchase.id,
        invoiceNumber: savedPurchase.invoiceNumber,
        totalAmount: resTotal,
        paidAmount: resPaid,
        balanceAmount: Math.max(0, resTotal - resPaid),
        status: savedPurchase.status,
        purchaseDate: savedPurchase.purchaseDate.toISOString()
      },
      message: 'Purchase bill recorded and stock inwarded successfully'
    });
  } catch (error: any) {
    console.error('Error creating purchase bill:', error);
    res.status(500).json({ error: error.message || 'Failed to record purchase bill' });
  }
});

/**
 * PUT /purchases/:id
 * Edit an existing purchase inward bill — atomically reverses old inward stock via append-only PURCHASE_RETURN entries,
 * creates/updates batches and writes new PURCHASE entries, and updates the purchase bill.
 */
router.put('/:id', idempotencyMiddleware, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const userId = req.user!.userId;
  const { id } = req.params;
  const {
    supplierId,
    purchaseDate,
    dueDate,
    paymentMode = 'CREDIT',
    paidAmount = 0,
    roundOff = 0,
    notes,
    items
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Purchase bill must contain at least one line item' });
    return;
  }

  try {
    const existingPurchase = await prisma.purchase.findFirst({
      where: { id, companyId },
      include: { items: true }
    });

    if (!existingPurchase) {
      res.status(404).json({ error: 'Purchase bill not found' });
      return;
    }

    if (existingPurchase.status === 'CANCELLED') {
      res.status(400).json({ error: 'Cannot edit a purchase bill that has been cancelled' });
      return;
    }

    // Verify supplier
    const targetSupplierId = supplierId || existingPurchase.supplierId;
    const supplier = await prisma.party.findFirst({
      where: { id: targetSupplierId, companyId }
    });

    if (!supplier) {
      res.status(404).json({ error: 'Supplier not found' });
      return;
    }

    // Validate and prepare new items
    let subtotal = 0;
    let totalDiscount = 0;
    let taxableAmount = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    const isInterState = supplier.stateCode && supplier.stateCode !== '07';
    const validatedItems: any[] = [];

    for (const rawItem of items) {
      const medName = (rawItem.medicineName || rawItem.name || '').trim();
      if (!rawItem.itemId && !medName) {
        res.status(400).json({ error: 'Each item requires either a medicine name or catalog selection' });
        return;
      }

      if (!rawItem.batchNumber || !rawItem.expiryDate) {
        res.status(400).json({ error: `Batch number and expiry date are required for ${medName || 'each medicine'}` });
        return;
      }

      const qty = parseInt(rawItem.quantity) || 0;
      if (qty <= 0) {
        res.status(400).json({ error: `Quantity must be greater than 0 for ${medName || 'all items'}` });
        return;
      }

      const freeQty = Math.max(0, parseInt(rawItem.freeQuantity) || 0);
      const purchaseRate = parseFloat(rawItem.purchaseRate) || 0;
      const mrp = parseFloat(rawItem.mrp) || purchaseRate;
      const discountPct = Math.max(0, Math.min(100, parseFloat(rawItem.discountPercent) || 0));
      const gstRate = parseFloat(rawItem.gstRate) || 12.0;

      const gross = qty * purchaseRate;
      const discount = (gross * discountPct) / 100;
      const lineTaxable = gross - discount;
      const gst = (lineTaxable * gstRate) / 100;
      const lineTotal = lineTaxable + gst;

      let lineCgst = 0;
      let lineSgst = 0;
      let lineIgst = 0;

      if (isInterState) {
        lineIgst = gst;
      } else {
        lineCgst = gst / 2;
        lineSgst = gst / 2;
      }

      subtotal += gross;
      totalDiscount += discount;
      taxableAmount += lineTaxable;
      cgstAmount += lineCgst;
      sgstAmount += lineSgst;
      igstAmount += lineIgst;

      const cleanBatch = String(rawItem.batchNumber).trim().toUpperCase();
      let parsedExpiry: Date;
      const expStr = String(rawItem.expiryDate).trim();
      if (/^\d{2}\/\d{2}$/.test(expStr)) {
        const [mm, yy] = expStr.split('/').map(Number);
        const fullYear = 2000 + yy;
        parsedExpiry = new Date(fullYear, mm, 0, 23, 59, 59, 999);
      } else {
        parsedExpiry = new Date(expStr);
      }

      if (isNaN(parsedExpiry.getTime())) {
        res.status(400).json({ error: `Invalid expiry date "${rawItem.expiryDate}" for ${medName || 'item'}` });
        return;
      }

      validatedItems.push({
        itemId: rawItem.itemId || null,
        medicineName: medName,
        genericName: rawItem.genericName || null,
        manufacturer: rawItem.manufacturer || null,
        hsnCode: rawItem.hsnCode || '3004',
        batchNumber: cleanBatch,
        expiryDate: parsedExpiry,
        pack: rawItem.pack || '10 TAB',
        quantity: qty,
        freeQuantity: freeQty,
        purchaseRate,
        mrp,
        pts: parseFloat(rawItem.pts) || mrp,
        discountPercent: discountPct,
        taxableValue: Math.round(lineTaxable * 100) / 100,
        gstRate,
        gstAmount: Math.round(gst * 100) / 100,
        totalAmount: Math.round(lineTotal * 100) / 100
      });
    }

    const numRoundOff = parseFloat(roundOff) || 0;
    const computedTotal = Math.round((taxableAmount + cgstAmount + sgstAmount + igstAmount + numRoundOff) * 100) / 100;
    const numPaid = Math.max(0, parseFloat(paidAmount) || (paymentMode === 'CASH' || paymentMode === 'BANK_TRANSFER' ? computedTotal : 0));
    const finalPaid = Math.min(numPaid, computedTotal);
    const balanceAmount = Math.max(0, computedTotal - finalPaid);

    let status = 'UNPAID';
    if (balanceAmount <= 0) {
      status = 'PAID';
    } else if (finalPaid > 0) {
      status = 'PARTIAL';
    }

    const parsedPurchaseDate = new Date(purchaseDate || existingPurchase.purchaseDate);
    const parsedDueDate = dueDate ? new Date(dueDate) : null;

    // Execute atomic update with append-only reversing and fresh entries
    const updatedPurchase = await prisma.$transaction(async (tx) => {
      // 1. REVERSE OLD ITEMS STOCK VIA COMPENSATING PURCHASE_RETURN ENTRIES
      for (const oldItem of existingPurchase.items) {
        const oldInwardUnits = oldItem.quantity + (oldItem.freeQuantity || 0);

        // Deduct old inward units from batch
        const oldBatch = await tx.batch.findUnique({ where: { id: oldItem.batchId } });
        if (oldBatch) {
          const newStock = Math.max(0, oldBatch.currentStock - oldInwardUnits);
          await tx.batch.update({
            where: { id: oldItem.batchId },
            data: { currentStock: newStock }
          });
        }

        // Write append-only compensating reversal
        await tx.stockLedger.create({
          data: {
            companyId,
            itemId: oldItem.itemId,
            batchId: oldItem.batchId,
            entryType: 'PURCHASE_RETURN',
            quantity: -oldInwardUnits,
            unitPrice: oldItem.purchaseRate,
            referenceId: existingPurchase.id,
            notes: `Reversal for Edited Purchase Bill #${existingPurchase.invoiceNumber} (-${oldInwardUnits} units reversed)`,
            createdBy: userId
          }
        });
      }

      // Revert old supplier balance if previous purchase had unpaid balance
      const oldTotal = Number(existingPurchase.totalAmount);
      const oldPaid = Number(existingPurchase.paidAmount);
      const oldUnpaid = Math.max(0, oldTotal - oldPaid);
      if (oldUnpaid > 0) {
        await tx.party.update({
          where: { id: existingPurchase.supplierId },
          data: { outstandingBalance: { decrement: oldUnpaid } }
        });
      }

      // 2. APPLY NEW INWARD STOCK & WRITE NEW PURCHASE LEDGER ENTRIES
      const createdItemsWithBatch: any[] = [];
      const locallyReservedSkus = new Set<string>();

      for (const item of validatedItems) {
        let targetItemId = item.itemId;

        // Verify itemId belongs to company if provided
        if (targetItemId) {
          const verifiedItem = await tx.item.findFirst({
            where: { id: targetItemId, companyId }
          });
          if (!verifiedItem) {
            targetItemId = null;
          }
        }

        // Auto-catalog medicine if itemId was not provided or invalid
        if (!targetItemId) {
          const cleanName = (item.medicineName || '').trim();
          let existingItem = await tx.item.findFirst({
            where: {
              companyId,
              name: { equals: cleanName, mode: 'insensitive' }
            }
          });

          if (!existingItem) {
            const packStr = (item.pack || '').trim().toUpperCase();
            let unit = 'STRIP';
            let conversionFactor = 1;

            if (packStr) {
              const match = packStr.match(/^(\d+)\s*([A-Z]*)/i);
              if (match) {
                conversionFactor = parseInt(match[1]) || 1;
                if (match[2] && match[2].length > 1) {
                  unit = match[2].toUpperCase();
                }
              }
            }

            const autoSku = await generateUniqueItemSku(tx, companyId, item.sku, locallyReservedSkus);

            existingItem = await tx.item.create({
              data: {
                companyId,
                sku: autoSku,
                name: cleanName,
                genericName: item.genericName?.trim() || null,
                manufacturer: item.manufacturer?.trim() || null,
                hsnCode: item.hsnCode?.trim() || '3004',
                gstRate: item.gstRate,
                unit: unit || 'STRIP',
                conversionFactor: conversionFactor > 0 ? conversionFactor : 1,
                minStockLevel: 0
              }
            });
          }

          targetItemId = existingItem.id;
        }

        const totalUnitsInward = item.quantity + item.freeQuantity;

        // Upsert Batch
        const existingBatch = await tx.batch.findUnique({
          where: {
            companyId_itemId_batchNumber: {
              companyId,
              itemId: targetItemId,
              batchNumber: item.batchNumber
            }
          }
        });

        let batch: any;
        if (existingBatch) {
          batch = await tx.batch.update({
            where: { id: existingBatch.id },
            data: {
              currentStock: { increment: totalUnitsInward },
              expiryDate: item.expiryDate,
              mrp: item.mrp,
              ptr: item.purchaseRate,
              pts: item.pts
            }
          });
        } else {
          batch = await tx.batch.create({
            data: {
              companyId,
              itemId: targetItemId,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate,
              mrp: item.mrp,
              ptr: item.purchaseRate,
              pts: item.pts,
              currentStock: totalUnitsInward
            }
          });
        }

        createdItemsWithBatch.push({
          ...item,
          itemId: targetItemId,
          batchId: batch.id
        });

        // Write append-only new PURCHASE ledger entry
        await tx.stockLedger.create({
          data: {
            companyId,
            itemId: targetItemId,
            batchId: batch.id,
            entryType: 'PURCHASE',
            quantity: totalUnitsInward,
            unitPrice: item.purchaseRate,
            referenceId: existingPurchase.id,
            notes: `Purchase Inward Bill #${existingPurchase.invoiceNumber} [REVISED] (+${totalUnitsInward} units)`,
            createdBy: userId
          }
        });
      }

      // 3. REPLACE PURCHASE ITEMS
      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });

      for (const item of createdItemsWithBatch) {
        await tx.purchaseItem.create({
          data: {
            purchaseId: id,
            itemId: item.itemId,
            batchId: item.batchId,
            pack: item.pack,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            quantity: item.quantity,
            freeQuantity: item.freeQuantity,
            purchaseRate: item.purchaseRate,
            mrp: item.mrp,
            discountPercent: item.discountPercent,
            taxableValue: item.taxableValue,
            gstRate: item.gstRate,
            gstAmount: item.gstAmount,
            totalAmount: item.totalAmount
          }
        });
      }

      // 4. UPDATE PURCHASE HEADER
      const revisionNote = `[REVISED on ${new Date().toISOString()}]`;
      const finalNotes = notes ? `${notes} ${revisionNote}` : (existingPurchase.notes ? `${existingPurchase.notes} ${revisionNote}` : revisionNote);

      const purchase = await tx.purchase.update({
        where: { id },
        data: {
          supplierId: targetSupplierId,
          purchaseDate: parsedPurchaseDate,
          dueDate: parsedDueDate,
          paymentMode,
          subtotal: Math.round(subtotal * 100) / 100,
          totalDiscount: Math.round(totalDiscount * 100) / 100,
          taxableAmount: Math.round(taxableAmount * 100) / 100,
          cgstAmount: Math.round(cgstAmount * 100) / 100,
          sgstAmount: Math.round(sgstAmount * 100) / 100,
          igstAmount: Math.round(igstAmount * 100) / 100,
          roundOff: numRoundOff,
          totalAmount: computedTotal,
          paidAmount: finalPaid,
          status,
          notes: finalNotes
        }
      });

      // 5. UPDATE NEW SUPPLIER OUTSTANDING BALANCE
      if (balanceAmount > 0) {
        await tx.party.update({
          where: { id: targetSupplierId },
          data: { outstandingBalance: { increment: balanceAmount } }
        });
      }

      return purchase;
    }, { maxWait: 15000, timeout: 30000 });

    const resPaid = Number(updatedPurchase.paidAmount);
    const resTotal = Number(updatedPurchase.totalAmount);

    res.status(200).json({
      purchase: {
        id: updatedPurchase.id,
        invoiceNumber: updatedPurchase.invoiceNumber,
        totalAmount: resTotal,
        paidAmount: resPaid,
        balanceAmount: Math.max(0, resTotal - resPaid),
        status: updatedPurchase.status,
        purchaseDate: updatedPurchase.purchaseDate.toISOString()
      },
      message: 'Purchase bill updated and stock adjusted successfully'
    });
  } catch (error: any) {
    console.error('Error updating purchase bill:', error);
    res.status(500).json({ error: error.message || 'Failed to update purchase bill' });
  }
});

/**
 * GET /purchases/:id
 * Get full purchase bill details
 */
router.get('/:id', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { id } = req.params;

  try {
    const purchase = await prisma.purchase.findFirst({
      where: { id, companyId },
      include: {
        supplier: true,
        creator: { select: { username: true } },
        items: {
          include: {
            item: { select: { id: true, name: true, sku: true, unit: true, genericName: true } }
          }
        }
      }
    });

    if (!purchase) {
      res.status(404).json({ error: 'Purchase bill not found' });
      return;
    }

    res.status(200).json({
      purchase: {
        id: purchase.id,
        invoiceNumber: purchase.invoiceNumber,
        purchaseDate: purchase.purchaseDate.toISOString(),
        dueDate: purchase.dueDate ? purchase.dueDate.toISOString() : null,
        paymentMode: purchase.paymentMode,
        subtotal: Number(purchase.subtotal),
        totalDiscount: Number(purchase.totalDiscount),
        taxableAmount: Number(purchase.taxableAmount),
        cgstAmount: Number(purchase.cgstAmount),
        sgstAmount: Number(purchase.sgstAmount),
        igstAmount: Number(purchase.igstAmount),
        roundOff: Number(purchase.roundOff),
        totalAmount: Number(purchase.totalAmount),
        paidAmount: Number(purchase.paidAmount),
        status: purchase.status,
        notes: purchase.notes,
        supplier: {
          ...purchase.supplier,
          creditLimit: Number(purchase.supplier.creditLimit),
          outstandingBalance: Number(purchase.supplier.outstandingBalance)
        },
        createdByUser: purchase.creator.username,
        items: purchase.items.map(i => ({
          id: i.id,
          medicineName: i.item.name,
          genericName: i.item.genericName,
          sku: i.item.sku,
          unit: i.item.unit,
          batchNumber: i.batchNumber,
          expiryDate: i.expiryDate.toISOString(),
          quantity: i.quantity,
          freeQuantity: i.freeQuantity,
          purchaseRate: Number(i.purchaseRate),
          mrp: Number(i.mrp),
          discountPercent: Number(i.discountPercent),
          taxableValue: Number(i.taxableValue),
          gstRate: Number(i.gstRate),
          gstAmount: Number(i.gstAmount),
          totalAmount: Number(i.totalAmount)
        })),
        createdAt: purchase.createdAt.toISOString()
      }
    });
  } catch (error: any) {
    console.error('Error fetching purchase bill:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch purchase details' });
  }
});

/**
 * POST /purchases/:id/payment
 * Record payment against a credit purchase bill
 */
router.post('/:id/payment', idempotencyMiddleware, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { id } = req.params;
  const { paymentAmount, amount } = req.body;

  const numPayment = parseFloat(paymentAmount !== undefined ? paymentAmount : amount) || 0;
  if (numPayment <= 0) {
    res.status(400).json({ error: 'Payment amount must be greater than 0' });
    return;
  }

  try {
    const purchase = await prisma.purchase.findFirst({
      where: { id, companyId }
    });

    if (!purchase) {
      res.status(404).json({ error: 'Purchase bill not found' });
      return;
    }

    const currentPaid = Number(purchase.paidAmount);
    const total = Number(purchase.totalAmount);
    const balanceRemaining = total - currentPaid;

    if (balanceRemaining <= 0) {
      res.status(400).json({ error: 'This purchase bill is already fully paid' });
      return;
    }

    const actualPayment = Math.min(numPayment, balanceRemaining);
    const newPaid = currentPaid + actualPayment;
    const newStatus = newPaid >= total ? 'PAID' : 'PARTIAL';

    await prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id },
        data: {
          paidAmount: newPaid,
          status: newStatus
        }
      });

      // Reduce supplier outstanding balance
      await tx.party.update({
        where: { id: purchase.supplierId },
        data: {
          outstandingBalance: { decrement: actualPayment }
        }
      });
    });

    res.status(200).json({
      purchase: {
        id: purchase.id,
        paidAmount: newPaid,
        totalAmount: total,
        balanceAmount: Math.max(0, total - newPaid),
        status: newStatus
      },
      paidAmount: newPaid,
      status: newStatus,
      message: `Payment of ₹${actualPayment.toFixed(2)} recorded successfully`
    });
  } catch (error: any) {
    console.error('Error recording purchase payment:', error);
    res.status(500).json({ error: error.message || 'Failed to record payment' });
  }
});

/**
 * DELETE /purchases/:id (and POST /purchases/:id/cancel)
 * Cancels a purchase bill — marks status CANCELLED, writes append-only reversing stock ledger entries,
 * reverses batch stock, and adjusts supplier balance without deleting historical records.
 */
router.delete('/:id', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const userId = req.user!.userId;
  const { id } = req.params;

  try {
    const purchase = await prisma.purchase.findFirst({
      where: { id, companyId },
      include: {
        items: {
          include: {
            batch: true
          }
        }
      }
    });

    if (!purchase) {
      res.status(404).json({ error: 'Purchase bill not found' });
      return;
    }

    if (purchase.status === 'CANCELLED') {
      res.status(400).json({ error: `Purchase bill "${purchase.invoiceNumber}" is already cancelled` });
      return;
    }

    await prisma.$transaction(async (tx) => {
      // 1. Mark the purchase as CANCELLED (never delete historical purchase or purchase_items)
      await tx.purchase.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          notes: purchase.notes ? `${purchase.notes} | [CANCELLED on ${new Date().toISOString()}]` : `[CANCELLED on ${new Date().toISOString()}]`
        }
      });

      // 2. Reverse inward stock using append-only reversing entries
      for (const pItem of purchase.items) {
        const totalInwardUnits = pItem.quantity + (pItem.freeQuantity || 0);

        // Deduct inward stock from batch
        const batch = await tx.batch.findUnique({ where: { id: pItem.batchId } });
        if (batch) {
          const newStock = Math.max(0, batch.currentStock - totalInwardUnits);
          await tx.batch.update({
            where: { id: pItem.batchId },
            data: { currentStock: newStock }
          });
        }

        // Write append-only compensating reversal in stock_ledger (NEVER delete historical rows)
        await tx.stockLedger.create({
          data: {
            companyId,
            itemId: pItem.itemId,
            batchId: pItem.batchId,
            entryType: 'PURCHASE_RETURN',
            quantity: -totalInwardUnits, // Negative to reverse inward stock
            unitPrice: pItem.purchaseRate,
            referenceId: purchase.id,
            notes: `Reversal for Cancelled Purchase Bill #${purchase.invoiceNumber} (-${totalInwardUnits} units reversed)`,
            createdBy: userId
          }
        });
      }

      // 3. Adjust supplier outstanding balance if there was unpaid amount
      const totalAmount = Number(purchase.totalAmount);
      const paidAmount = Number(purchase.paidAmount);
      const unpaidAmount = Math.max(0, totalAmount - paidAmount);
      if (unpaidAmount > 0) {
        await tx.party.update({
          where: { id: purchase.supplierId },
          data: {
            outstandingBalance: { decrement: unpaidAmount }
          }
        });
      }
    });

    res.status(200).json({
      message: `Purchase bill "${purchase.invoiceNumber}" cancelled and stock reversed via append-only reversing ledger entries`,
      status: 'CANCELLED'
    });
  } catch (error: any) {
    console.error('Error cancelling purchase:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel purchase' });
  }
});

router.post('/:id/cancel', async (req: CompanyScopedRequest, res: Response) => {
  // Alias for cancellation
  const companyId = req.company!.id;
  const userId = req.user!.userId;
  const { id } = req.params;

  try {
    const purchase = await prisma.purchase.findFirst({
      where: { id, companyId },
      include: {
        items: {
          include: {
            batch: true
          }
        }
      }
    });

    if (!purchase) {
      res.status(404).json({ error: 'Purchase bill not found' });
      return;
    }

    if (purchase.status === 'CANCELLED') {
      res.status(400).json({ error: `Purchase bill "${purchase.invoiceNumber}" is already cancelled` });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          notes: purchase.notes ? `${purchase.notes} | [CANCELLED on ${new Date().toISOString()}]` : `[CANCELLED on ${new Date().toISOString()}]`
        }
      });

      for (const pItem of purchase.items) {
        const totalInwardUnits = pItem.quantity + (pItem.freeQuantity || 0);

        const batch = await tx.batch.findUnique({ where: { id: pItem.batchId } });
        if (batch) {
          const newStock = Math.max(0, batch.currentStock - totalInwardUnits);
          await tx.batch.update({
            where: { id: pItem.batchId },
            data: { currentStock: newStock }
          });
        }

        await tx.stockLedger.create({
          data: {
            companyId,
            itemId: pItem.itemId,
            batchId: pItem.batchId,
            entryType: 'PURCHASE_RETURN',
            quantity: -totalInwardUnits,
            unitPrice: pItem.purchaseRate,
            referenceId: purchase.id,
            notes: `Reversal for Cancelled Purchase Bill #${purchase.invoiceNumber} (-${totalInwardUnits} units reversed)`,
            createdBy: userId
          }
        });
      }

      const totalAmount = Number(purchase.totalAmount);
      const paidAmount = Number(purchase.paidAmount);
      const unpaidAmount = Math.max(0, totalAmount - paidAmount);
      if (unpaidAmount > 0) {
        await tx.party.update({
          where: { id: purchase.supplierId },
          data: {
            outstandingBalance: { decrement: unpaidAmount }
          }
        });
      }
    });

    res.status(200).json({
      message: `Purchase bill "${purchase.invoiceNumber}" cancelled and stock reversed via append-only reversing ledger entries`,
      status: 'CANCELLED'
    });
  } catch (error: any) {
    console.error('Error cancelling purchase:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel purchase' });
  }
});

export default router;

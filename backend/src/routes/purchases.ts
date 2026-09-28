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
        { supplier: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [total, purchases] = await Promise.all([
      prisma.purchase.count({ where }),
      prisma.purchase.findMany({
        where,
        include: {
          supplier: {
            select: { id: true, name: true, phone: true, gstin: true, drugLicenseNo: true }
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
      if (!rawItem.itemId || !rawItem.batchNumber || !rawItem.expiryDate) {
        res.status(400).json({ error: 'Each item requires medicine ID, batch number, and expiry date' });
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
        itemId: rawItem.itemId,
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

      // 2. Process each item: Batch upsert & Stock Ledger entry
      for (const item of validatedItems) {
        const totalUnitsInward = item.quantity + item.freeQuantity;

        // Check if batch exists
        let batch = await tx.batch.findUnique({
          where: {
            companyId_itemId_batchNumber: {
              companyId,
              itemId: item.itemId,
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
              itemId: item.itemId,
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
            itemId: item.itemId,
            batchId: batch.id,
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

        // Write Append-Only Audit Entry in Stock Ledger (Rule E)
        await tx.stockLedger.create({
          data: {
            companyId,
            itemId: item.itemId,
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
    });

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

export default router;

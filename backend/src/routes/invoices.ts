import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireCompany, CompanyScopedRequest } from '../middleware/company.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import prisma from '../prisma.js';
import { parseFilterStartDate, parseFilterEndDate, parseRecordDate } from '../utils/dateUtils.js';


const router = Router();

// Require auth and company access for all invoice routes
router.use(requireAuth);
router.use(requireCompany);

/**
 * Helper: Find the next available non-colliding invoice number
 */
async function getNextAvailableInvoiceNumber(companyId: string): Promise<{ invoiceNumber: string; sequence: number }> {
  const currentYear = new Date().getFullYear();
  const prefix = `INV-${currentYear}-`;

  // Find all invoices for this year to extract highest sequential number
  const invoicesThisYear = await prisma.invoice.findMany({
    where: {
      companyId,
      invoiceNumber: { startsWith: prefix }
    },
    select: { invoiceNumber: true }
  });

  let maxSeq = 0;
  for (const inv of invoicesThisYear) {
    const parts = inv.invoiceNumber.split('-');
    if (parts.length >= 3) {
      const num = parseInt(parts[2], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }

  // Next candidate sequence
  let nextSeq = maxSeq + 1;
  let candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`;

  // Ensure candidate does not collide with ANY invoice in the database
  while (await prisma.invoice.findFirst({
    where: {
      companyId,
      invoiceNumber: candidate
    }
  })) {
    nextSeq++;
    candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  return { invoiceNumber: candidate, sequence: nextSeq };
}

/**
 * GET /invoices/next-number
 * Compute the next sequential invoice number for this company
 */
router.get('/next-number', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;

  try {
    const result = await getNextAvailableInvoiceNumber(companyId);
    res.status(200).json(result);
  } catch (error: any) {
    console.error('Error generating next invoice number:', error);
    res.status(500).json({ error: 'Failed to generate invoice number' });
  }
});

/**
 * GET /invoices/fefo-suggestions
 * Suggest non-expired batches ordered by FEFO (First-Expiry-First-Out)
 */
router.get('/fefo-suggestions', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const itemId = typeof req.query.itemId === 'string' ? req.query.itemId.trim() : '';
  const requiredQty = parseInt(req.query.quantity as string) || 0;

  if (!itemId) {
    res.status(400).json({ error: 'itemId query parameter is required' });
    return;
  }

  try {
    const now = new Date();
    const batches = await prisma.batch.findMany({
      where: {
        companyId,
        itemId,
        currentStock: { gt: 0 }
      },
      orderBy: [
        { expiryDate: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    let remainingToAllocate = requiredQty;
    const suggestions = batches.map(b => {
      const exp = new Date(b.expiryDate);
      const isExpired = exp < now;
      const daysUntilExpiry = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      let allocatedQty = 0;
      if (!isExpired && remainingToAllocate > 0) {
        allocatedQty = Math.min(b.currentStock, remainingToAllocate);
        remainingToAllocate -= allocatedQty;
      }

      return {
        batchId: b.id,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate.toISOString(),
        isExpired,
        daysUntilExpiry,
        currentStock: b.currentStock,
        mrp: Number(b.mrp),
        ptr: Number(b.ptr),
        pts: Number(b.pts),
        suggestedAllocation: allocatedQty
      };
    });

    res.status(200).json({
      batches: suggestions,
      fullyAllocated: remainingToAllocate === 0
    });
  } catch (error: any) {
    console.error('Error fetching FEFO suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch batch suggestions' });
  }
});

/**
 * GET /invoices
 * List sales invoices with pagination, date filters, customer search, and status filter
 */
router.get('/', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 500));
  const skip = (page - 1) * limit;

  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : '';
  const partyId = typeof req.query.partyId === 'string' ? req.query.partyId.trim() : '';
  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate.trim() : '';
  const endDate = typeof req.query.endDate === 'string' ? req.query.endDate.trim() : '';

  const where: any = { companyId };

  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: 'insensitive' } },
      { customerName: { contains: search, mode: 'insensitive' } },
      { patientName: { contains: search, mode: 'insensitive' } },
      { customerPhone: { contains: search, mode: 'insensitive' } },
      { doctorName: { contains: search, mode: 'insensitive' } }
    ];
  }

  if (status && ['PAID', 'PARTIAL', 'UNPAID'].includes(status)) {
    where.status = status;
  }

  if (partyId) {
    where.partyId = partyId;
  }

  if (startDate || endDate) {
    where.invoiceDate = {};
    const parsedStart = parseFilterStartDate(startDate);
    if (parsedStart) {
      where.invoiceDate.gte = parsedStart;
    }
    const parsedEnd = parseFilterEndDate(endDate);
    if (parsedEnd) {
      where.invoiceDate.lte = parsedEnd;
    }
  }

  try {
    const [total, invoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        include: {
          party: { select: { id: true, name: true, mailTo: true, phone: true, gstin: true } },
          creator: { select: { username: true } },
          items: {
            select: {
              id: true,
              quantity: true,
              strips: true,
              looseQty: true,
              unitPrice: true,
              mrp: true,
              totalAmount: true,
              batch: {
                select: {
                  ptr: true,
                  mrp: true,
                  pts: true
                }
              },
              item: {
                select: {
                  conversionFactor: true
                }
              }
            }
          }
        },
        orderBy: [
          { invoiceDate: 'desc' },
          { createdAt: 'desc' }
        ],
        skip,
        take: limit
      })
    ]);

    const formatted = invoices.map(inv => {
      const totalAmt = Number(inv.grandTotal);
      const paidAmt = Number(inv.paidAmount);
      const balAmt = Math.max(0, totalAmt - paidAmt);

      let invoiceCost = 0;
      let invoiceMrpVal = 0;

      for (const itm of inv.items) {
        const factor = itm.item?.conversionFactor || 1;
        const ptr = Number(itm.batch?.ptr || itm.batch?.pts || 0);
        const itmMrp = Number(itm.mrp || itm.batch?.mrp || itm.unitPrice || 0);

        if (itm.strips > 0 || itm.looseQty > 0) {
          invoiceCost += (itm.strips * ptr) + (itm.looseQty * (ptr / factor));
          invoiceMrpVal += (itm.strips * itmMrp) + (itm.looseQty * (itmMrp / factor));
        } else {
          invoiceCost += itm.quantity * (ptr / factor);
          invoiceMrpVal += itm.quantity * (itmMrp / factor);
        }
      }

      // Profit = MRP/Selling Price - Purchase Cost
      const finalCost = Math.round(invoiceCost * 100) / 100;
      const finalMrp = Math.round(invoiceMrpVal * 100) / 100;
      const finalProfit = Math.max(0, Math.round((finalMrp - finalCost) * 100) / 100);

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate.toISOString(),
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
        customerName: inv.customerName,
        customerPhone: inv.customerPhone,
        doctorName: inv.doctorName,
        patientName: inv.patientName,
        paymentMode: inv.paymentMode,
        taxableAmount: Number(inv.taxableAmount),
        totalTax: Number(inv.totalTax),
        grandTotal: totalAmt,
        paidAmount: paidAmt,
        balanceAmount: balAmt,
        status: inv.status,
        notes: inv.notes,
        party: inv.party,
        createdByUser: inv.creator.username,
        itemsCount: inv.items.length,
        costAmount: finalCost,
        mrpTotal: finalMrp,
        profitAmount: finalProfit,
        createdAt: inv.createdAt.toISOString()
      };
    });

    res.status(200).json({
      invoices: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error('Error listing invoices:', error);
    res.status(500).json({ error: error.message || 'Failed to list invoices' });
  }
});

/**
 * GET /invoices/:id
 * Get full invoice details for preview and printing (A4 / POS Slip)
 */
router.get('/:id', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { id } = req.params;

  try {
    const [invoice, company] = await Promise.all([
      prisma.invoice.findFirst({
        where: { id, companyId },
        include: {
          party: true,
          creator: { select: { username: true } },
          items: {
            include: {
              item: { select: { id: true, name: true, genericName: true, sku: true, unit: true, hsnCode: true } },
              batch: { select: { id: true, batchNumber: true, expiryDate: true, mrp: true } }
            }
          }
        }
      }),
      prisma.company.findUnique({
        where: { id: companyId }
      })
    ]);

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const totalAmt = Number(invoice.grandTotal);
    const paidAmt = Number(invoice.paidAmount);
    const balAmt = Math.max(0, totalAmt - paidAmt);

    res.status(200).json({
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate.toISOString(),
        dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
        customerName: invoice.customerName,
        customerPhone: invoice.customerPhone,
        customerAddress: invoice.customerAddress,
        customerGstin: invoice.customerGstin,
        doctorName: invoice.doctorName,
        doctorRegNo: invoice.doctorRegNo,
        patientName: invoice.patientName,
        patientAddress: invoice.patientAddress,
        paymentMode: invoice.paymentMode,
        subtotal: Number(invoice.subtotal),
        itemDiscount: Number(invoice.itemDiscount),
        billDiscountPct: Number(invoice.billDiscountPct),
        billDiscountAmt: Number(invoice.billDiscountAmt),
        taxableAmount: Number(invoice.taxableAmount),
        cgstAmount: Number(invoice.cgstAmount),
        sgstAmount: Number(invoice.sgstAmount),
        igstAmount: Number(invoice.igstAmount),
        totalTax: Number(invoice.totalTax),
        roundOff: Number(invoice.roundOff),
        grandTotal: totalAmt,
        paidAmount: paidAmt,
        balanceAmount: balAmt,
        status: invoice.status,
        notes: invoice.notes,
        party: invoice.party ? {
          ...invoice.party,
          creditLimit: Number(invoice.party.creditLimit),
          outstandingBalance: Number(invoice.party.outstandingBalance)
        } : null,
        createdByUser: invoice.creator.username,
        company: company ? {
          id: company.id,
          name: company.name
        } : null,
        items: invoice.items.map(i => ({
          id: i.id,
          itemId: i.itemId,
          medicineName: i.item.name,
          genericName: i.item.genericName,
          sku: i.item.sku,
          unit: i.item.unit,
          hsnCode: i.item.hsnCode,
          pack: i.pack || '10 TAB',
          batchId: i.batchId,
          batchNumber: i.batchNumber,
          expiryDate: i.expiryDate.toISOString(),
          strips: i.strips || 0,
          looseQty: i.looseQty || 0,
          quantity: i.quantity,
          freeQuantity: i.freeQuantity,
          unitPrice: Number(i.unitPrice),
          mrp: Number(i.mrp),
          discountPercent: Number(i.discountPercent),
          taxableAmount: Number(i.taxableAmount),
          gstRate: Number(i.gstRate),
          cgstAmount: Number(i.cgstAmount),
          sgstAmount: Number(i.sgstAmount),
          igstAmount: Number(i.igstAmount),
          totalAmount: Number(i.totalAmount)
        })),
        createdAt: invoice.createdAt.toISOString()
      }
    });
  } catch (error: any) {
    console.error('Error fetching invoice details:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch invoice details' });
  }
});

/**
 * POST /invoices
 * Create atomic Sales Invoice with FEFO stock deduction and ledger logging
 */
router.post('/', idempotencyMiddleware, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const userId = req.user!.userId;
  const {
    partyId,
    customerName,
    customerPhone,
    customerAddress,
    customerGstin,
    doctorName,
    doctorRegNo,
    patientName,
    patientAddress,
    invoiceNumber,
    invoiceDate,
    dueDate,
    paymentMode = 'CASH',
    paidAmount = 0,
    billDiscountPct = 0,
    isInterState = false,
    roundOff = 0,
    notes,
    items
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Invoice must contain at least one item' });
    return;
  }

  try {
    // Generate invoice number if not provided, or auto-adjust on collision
    let finalInvoiceNumber = invoiceNumber ? String(invoiceNumber).trim().toUpperCase() : '';
    if (!finalInvoiceNumber) {
      const nextData = await getNextAvailableInvoiceNumber(companyId);
      finalInvoiceNumber = nextData.invoiceNumber;
    } else {
      // Check duplicate invoice number
      const existing = await prisma.invoice.findUnique({
        where: {
          companyId_invoiceNumber: {
            companyId,
            invoiceNumber: finalInvoiceNumber
          }
        }
      });

      if (existing) {
        // If it matches standard format INV-YYYY-XXXX, auto-adjust to the next available number so sale is never blocked!
        const autoPattern = /^INV-\d{4}-\d+$/i;
        if (autoPattern.test(finalInvoiceNumber)) {
          const nextData = await getNextAvailableInvoiceNumber(companyId);
          finalInvoiceNumber = nextData.invoiceNumber;
        } else {
          res.status(409).json({ error: `Invoice number "${finalInvoiceNumber}" already exists in this company. Please specify a different invoice number.` });
          return;
        }
      }
    }

    // Verify Party if supplied
    let customerParty: any = null;
    if (partyId) {
      customerParty = await prisma.party.findFirst({
        where: { id: partyId, companyId }
      });
      if (!customerParty) {
        res.status(404).json({ error: 'Selected customer party not found' });
        return;
      }
    }

    // Validate items and verify batch stocks
    let subtotal = 0;
    let totalItemDiscount = 0;
    let taxableAmount = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const validatedItems: any[] = [];
    const batchUpdates: { batchId: string; newStock: number; qtyDeducted: number; unitPrice: number; itemId: string; batchNumber: string }[] = [];

    for (const rawItem of items) {
      if (!rawItem.itemId || !rawItem.batchId) {
        res.status(400).json({ error: 'Each line item requires medicine item ID and batch ID' });
        return;
      }

      // Fetch batch from DB with lock / check stock
      const batch = await prisma.batch.findFirst({
        where: { id: rawItem.batchId, itemId: rawItem.itemId, companyId },
        include: { item: { select: { name: true, conversionFactor: true, unit: true, gstRate: true } } }
      });

      if (!batch) {
        res.status(404).json({ error: `Batch not found for selected item` });
        return;
      }

      const factor = batch.item?.conversionFactor || (rawItem.pack ? parseInt(rawItem.pack) : 1) || 1;
      const unitPrice = parseFloat(rawItem.unitPrice) || Number(batch.mrp) || Number(batch.pts);
      const mrp = parseFloat(rawItem.mrp) || Number(batch.mrp);
      const discountPct = Math.max(0, Math.min(100, parseFloat(rawItem.discountPercent) || 0));
      const freeQty = Math.max(0, parseInt(rawItem.freeQuantity) || 0);
      const gstRate = (rawItem.gstRate !== undefined && rawItem.gstRate !== null && !isNaN(parseFloat(rawItem.gstRate)))
        ? Math.max(0, parseFloat(rawItem.gstRate))
        : 0;

      const rawStrips = rawItem.strips !== undefined ? parseInt(rawItem.strips) : undefined;
      const rawLoose = rawItem.looseQty !== undefined ? parseInt(rawItem.looseQty) : undefined;

      let strips = 0;
      let looseQty = 0;
      let qty = parseInt(rawItem.quantity) || 0;
      let lineGross = 0;
      let totalUnitsNeeded = 0;

      if (rawStrips !== undefined || rawLoose !== undefined) {
        strips = Math.max(0, rawStrips || 0);
        looseQty = Math.max(0, rawLoose || 0);
        totalUnitsNeeded = (strips * factor) + looseQty + freeQty;
        qty = (strips * factor) + looseQty;

        if (totalUnitsNeeded <= 0) {
          res.status(400).json({ error: 'Quantity must be greater than 0' });
          return;
        }

        // Calculate line gross value: full strips * strip price + loose tablets * per tablet price
        lineGross = (strips * unitPrice) + (looseQty * (unitPrice / factor));
      } else {
        if (qty <= 0) {
          res.status(400).json({ error: `Quantity must be greater than 0` });
          return;
        }
        totalUnitsNeeded = qty + freeQty;
        lineGross = qty * unitPrice;
      }

      // Negative stock allowed (Tally Prime / Marg ERP style) for billing when inventory isn't fully entered yet
      const lineDiscount = (lineGross * discountPct) / 100;
      const lineTaxable = lineGross - lineDiscount;

      let lineCgst = 0;
      let lineSgst = 0;
      let lineIgst = 0;

      if (isInterState) {
        lineIgst = (lineTaxable * gstRate) / 100;
      } else {
        lineCgst = (lineTaxable * (gstRate / 2)) / 100;
        lineSgst = (lineTaxable * (gstRate / 2)) / 100;
      }

      const lineTotal = lineTaxable + lineCgst + lineSgst + lineIgst;

      subtotal += lineGross;
      totalItemDiscount += lineDiscount;
      taxableAmount += lineTaxable;
      totalCgst += lineCgst;
      totalSgst += lineSgst;
      totalIgst += lineIgst;

      validatedItems.push({
        itemId: batch.itemId,
        batchId: batch.id,
        pack: rawItem.pack || (factor > 1 ? `${factor} TAB` : '10 TAB'),
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        strips,
        looseQty,
        quantity: qty,
        freeQuantity: freeQty,
        unitPrice,
        mrp,
        discountPercent: discountPct,
        taxableAmount: Math.round(lineTaxable * 100) / 100,
        gstRate,
        cgstAmount: Math.round(lineCgst * 100) / 100,
        sgstAmount: Math.round(lineSgst * 100) / 100,
        igstAmount: Math.round(lineIgst * 100) / 100,
        totalAmount: Math.round(lineTotal * 100) / 100
      });

      batchUpdates.push({
        batchId: batch.id,
        newStock: batch.currentStock - totalUnitsNeeded,
        qtyDeducted: totalUnitsNeeded,
        unitPrice,
        itemId: batch.itemId,
        batchNumber: batch.batchNumber
      });
    }

    // Bill-level discount
    const numBillDiscountPct = Math.max(0, Math.min(100, parseFloat(billDiscountPct) || 0));
    const billDiscountAmt = (taxableAmount * numBillDiscountPct) / 100;
    const finalTaxable = Math.max(0, taxableAmount - billDiscountAmt);

    // Recalculate tax on final taxable if bill discount is applied
    if (numBillDiscountPct > 0) {
      totalCgst = 0;
      totalSgst = 0;
      totalIgst = 0;
      const discountMultiplier = 1 - (numBillDiscountPct / 100);
      for (const item of validatedItems) {
        const effTaxable = item.taxableAmount * discountMultiplier;
        if (isInterState) {
          item.igstAmount = Math.round((effTaxable * item.gstRate / 100) * 100) / 100;
          item.cgstAmount = 0;
          item.sgstAmount = 0;
        } else {
          item.igstAmount = 0;
          item.cgstAmount = Math.round((effTaxable * (item.gstRate / 2) / 100) * 100) / 100;
          item.sgstAmount = Math.round((effTaxable * (item.gstRate / 2) / 100) * 100) / 100;
        }
        item.totalAmount = Math.round((effTaxable + item.cgstAmount + item.sgstAmount + item.igstAmount) * 100) / 100;
        totalCgst += item.cgstAmount;
        totalSgst += item.sgstAmount;
        totalIgst += item.igstAmount;
      }
    }

    const totalTax = totalCgst + totalSgst + totalIgst;
    const numRoundOff = parseFloat(roundOff) || 0;
    const computedGrandTotal = Math.round((finalTaxable + totalTax + numRoundOff) * 100) / 100;

    const numPaid = Math.max(0, parseFloat(paidAmount) || (paymentMode === 'CASH' || paymentMode === 'UPI' || paymentMode === 'CARD' ? computedGrandTotal : 0));
    const finalPaid = Math.min(numPaid, computedGrandTotal);
    const balanceAmount = Math.max(0, computedGrandTotal - finalPaid);

    let status = 'PAID';
    if (balanceAmount > 0) {
      status = finalPaid > 0 ? 'PARTIAL' : 'UNPAID';
    }

    const parsedInvoiceDate = parseRecordDate(invoiceDate);
    const parsedDueDate = dueDate ? new Date(dueDate) : null;

    const cleanCustomerName = (customerName && typeof customerName === 'string' && customerName.trim().length > 0)
      ? customerName.trim()
      : (customerParty ? (customerParty.mailTo || customerParty.name) : 'Cash Customer');

    const cleanPatientName = (patientName && typeof patientName === 'string' && patientName.trim().length > 0)
      ? patientName.trim()
      : (cleanCustomerName && cleanCustomerName !== 'Cash Customer' ? cleanCustomerName : null);

    const cleanPatientAddress = (patientAddress && typeof patientAddress === 'string' && patientAddress.trim().length > 0)
      ? patientAddress.trim()
      : (customerAddress && typeof customerAddress === 'string' && customerAddress.trim().length > 0 ? customerAddress.trim() : (customerParty ? customerParty.address : null));

    // Execute atomic transaction
    const savedInvoice = await prisma.$transaction(async (tx) => {
      // 1. Create Invoice
      const invoice = await tx.invoice.create({
        data: {
          companyId,
          partyId: customerParty ? customerParty.id : null,
          invoiceNumber: finalInvoiceNumber,
          invoiceDate: parsedInvoiceDate,
          dueDate: parsedDueDate,
          customerName: cleanCustomerName,
          customerPhone: customerPhone ? String(customerPhone).trim() : (customerParty ? customerParty.phone : null),
          customerAddress: customerAddress ? String(customerAddress).trim() : (customerParty ? customerParty.address : null),
          customerGstin: customerGstin ? String(customerGstin).trim() : (customerParty ? customerParty.gstin : null),
          doctorName: doctorName ? String(doctorName).trim() : 'Dr. Priyadarshi Srivastava',
          doctorRegNo: doctorRegNo ? String(doctorRegNo).trim() : 'UPMC 59048',
          patientName: cleanPatientName,
          patientAddress: cleanPatientAddress,
          paymentMode,
          subtotal: Math.round(subtotal * 100) / 100,
          itemDiscount: Math.round(totalItemDiscount * 100) / 100,
          billDiscountPct: numBillDiscountPct,
          billDiscountAmt: Math.round(billDiscountAmt * 100) / 100,
          taxableAmount: Math.round(finalTaxable * 100) / 100,
          cgstAmount: Math.round(totalCgst * 100) / 100,
          sgstAmount: Math.round(totalSgst * 100) / 100,
          igstAmount: Math.round(totalIgst * 100) / 100,
          totalTax: Math.round(totalTax * 100) / 100,
          roundOff: numRoundOff,
          grandTotal: computedGrandTotal,
          paidAmount: finalPaid,
          status,
          notes: notes ? String(notes).trim() : null,
          createdBy: userId
        }
      });

      // 2. Create Invoice Items
      for (const item of validatedItems) {
        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            itemId: item.itemId,
            batchId: item.batchId,
            pack: item.pack,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            strips: item.strips,
            looseQty: item.looseQty,
            quantity: item.quantity,
            freeQuantity: item.freeQuantity,
            unitPrice: item.unitPrice,
            mrp: item.mrp,
            discountPercent: item.discountPercent,
            taxableAmount: item.taxableAmount,
            gstRate: item.gstRate,
            cgstAmount: item.cgstAmount,
            sgstAmount: item.sgstAmount,
            igstAmount: item.igstAmount,
            totalAmount: item.totalAmount
          }
        });
      }

      // 3. Deduct batch stock & write stock ledger audit
      for (const update of batchUpdates) {
        await tx.batch.update({
          where: { id: update.batchId },
          data: { currentStock: update.newStock }
        });

        await tx.stockLedger.create({
          data: {
            companyId,
            itemId: update.itemId,
            batchId: update.batchId,
            entryType: 'SALE',
            quantity: -update.qtyDeducted,
            unitPrice: update.unitPrice,
            referenceId: invoice.id,
            notes: `Sale Invoice #${finalInvoiceNumber} (${update.qtyDeducted} units)`,
            createdBy: userId
          }
        });
      }

      // 4. Update customer outstanding balance if credit sale
      if (customerParty && balanceAmount > 0) {
        await tx.party.update({
          where: { id: customerParty.id },
          data: {
            outstandingBalance: { increment: balanceAmount }
          }
        });
      }

      return invoice;
    }, { maxWait: 15000, timeout: 30000 });

    const resPaid = Number(savedInvoice.paidAmount);
    const resTotal = Number(savedInvoice.grandTotal);

    res.status(201).json({
      invoice: {
        id: savedInvoice.id,
        invoiceNumber: savedInvoice.invoiceNumber,
        grandTotal: resTotal,
        paidAmount: resPaid,
        balanceAmount: Math.max(0, resTotal - resPaid),
        status: savedInvoice.status,
        invoiceDate: savedInvoice.invoiceDate.toISOString()
      },
      message: 'Sales invoice generated and stock deducted successfully'
    });
  } catch (error: any) {
    console.error('Error creating sales invoice:', error);
    res.status(500).json({ error: error.message || 'Failed to create sales invoice' });
  }
});

/**
 * PUT /invoices/:id
 * Edit an existing sales invoice — atomically reverses old stock and ledger effects,
 * validates and applies new line items and stock deductions, and updates the invoice.
 */
router.put('/:id', idempotencyMiddleware, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const userId = req.user!.userId;
  const { id } = req.params;
  const {
    partyId,
    customerName,
    customerPhone,
    customerAddress,
    customerGstin,
    doctorName,
    doctorRegNo,
    patientName,
    patientAddress,
    invoiceDate,
    dueDate,
    paymentMode = 'CASH',
    paidAmount = 0,
    billDiscountPct = 0,
    isInterState = false,
    roundOff = 0,
    notes,
    items
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Invoice must contain at least one line item' });
    return;
  }

  try {
    const existingInvoice = await prisma.invoice.findFirst({
      where: { id, companyId },
      include: { items: true }
    });

    if (!existingInvoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    if (existingInvoice.status === 'CANCELLED') {
      res.status(400).json({ error: 'Cannot edit an invoice that has been cancelled' });
      return;
    }

    // Verify Party if supplied
    let customerParty: any = null;
    if (partyId) {
      customerParty = await prisma.party.findFirst({
        where: { id: partyId, companyId }
      });
      if (!customerParty) {
        res.status(404).json({ error: 'Selected customer party not found' });
        return;
      }
    }

    const cleanCustomerName = (customerName && typeof customerName === 'string' && customerName.trim().length > 0)
      ? customerName.trim()
      : (customerParty ? (customerParty.mailTo || customerParty.name) : 'Cash Customer');

    const cleanPatientName = (patientName && typeof patientName === 'string' && patientName.trim().length > 0)
      ? patientName.trim()
      : (cleanCustomerName && cleanCustomerName !== 'Cash Customer' ? cleanCustomerName : null);

    const cleanPatientAddress = (patientAddress && typeof patientAddress === 'string' && patientAddress.trim().length > 0)
      ? patientAddress.trim()
      : (customerAddress && typeof customerAddress === 'string' && customerAddress.trim().length > 0 ? customerAddress.trim() : (customerParty ? customerParty.address : null));

    // Calculate totals for new items
    let subtotal = 0;
    let totalItemDiscount = 0;
    let taxableAmount = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const validatedItems: any[] = [];

    for (const rawItem of items) {
      if (!rawItem.itemId || !rawItem.batchId) {
        res.status(400).json({ error: 'Each line item requires medicine item ID and batch ID' });
        return;
      }

      const batch = await prisma.batch.findFirst({
        where: { id: rawItem.batchId, itemId: rawItem.itemId, companyId },
        include: { item: { select: { name: true, conversionFactor: true, unit: true, gstRate: true } } }
      });

      if (!batch) {
        res.status(404).json({ error: 'Batch not found for selected medicine' });
        return;
      }

      const factor = batch.item?.conversionFactor || (rawItem.pack ? parseInt(rawItem.pack) : 1) || 1;
      const unitPrice = parseFloat(rawItem.unitPrice) || Number(batch.mrp) || Number(batch.pts);
      const mrp = parseFloat(rawItem.mrp) || Number(batch.mrp);
      const discountPct = Math.max(0, Math.min(100, parseFloat(rawItem.discountPercent) || 0));
      const gstRate = (rawItem.gstRate !== undefined && rawItem.gstRate !== null && !isNaN(parseFloat(rawItem.gstRate)))
        ? Math.max(0, parseFloat(rawItem.gstRate))
        : 0;
      const freeQty = Math.max(0, parseInt(rawItem.freeQuantity) || 0);

      const rawStrips = rawItem.strips !== undefined ? parseInt(rawItem.strips) : undefined;
      const rawLoose = rawItem.looseQty !== undefined ? parseInt(rawItem.looseQty) : undefined;

      let strips = 0;
      let looseQty = 0;
      let qty = parseInt(rawItem.quantity) || 0;
      let lineGross = 0;
      let totalUnitsNeeded = 0;

      if (rawStrips !== undefined || rawLoose !== undefined) {
        strips = Math.max(0, rawStrips || 0);
        looseQty = Math.max(0, rawLoose || 0);
        totalUnitsNeeded = (strips * factor) + looseQty + freeQty;
        qty = (strips * factor) + looseQty;

        if (totalUnitsNeeded <= 0) {
          res.status(400).json({ error: 'Quantity must be greater than 0' });
          return;
        }

        // Calculate line gross value: full strips * strip price + loose tablets * per tablet price
        lineGross = (strips * unitPrice) + (looseQty * (unitPrice / factor));
      } else {
        if (qty <= 0) {
          res.status(400).json({ error: 'Quantity must be greater than 0' });
          return;
        }
        totalUnitsNeeded = qty + freeQty;
        lineGross = qty * unitPrice;
      }

      const lineDiscount = (lineGross * discountPct) / 100;
      const lineTaxable = lineGross - lineDiscount;

      let lineCgst = 0;
      let lineSgst = 0;
      let lineIgst = 0;

      if (isInterState) {
        lineIgst = (lineTaxable * gstRate) / 100;
      } else {
        lineCgst = (lineTaxable * (gstRate / 2)) / 100;
        lineSgst = (lineTaxable * (gstRate / 2)) / 100;
      }

      const lineTotal = lineTaxable + lineCgst + lineSgst + lineIgst;

      subtotal += lineGross;
      totalItemDiscount += lineDiscount;
      taxableAmount += lineTaxable;
      totalCgst += lineCgst;
      totalSgst += lineSgst;
      totalIgst += lineIgst;

      validatedItems.push({
        itemId: batch.itemId,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        pack: rawItem.pack || (factor > 1 ? `${factor} TAB` : '10 TAB'),
        strips,
        looseQty,
        quantity: qty,
        freeQuantity: freeQty,
        totalUnitsNeeded,
        unitPrice,
        mrp,
        discountPercent: discountPct,
        taxableAmount: Math.round(lineTaxable * 100) / 100,
        gstRate,
        cgstAmount: Math.round(lineCgst * 100) / 100,
        sgstAmount: Math.round(lineSgst * 100) / 100,
        igstAmount: Math.round(lineIgst * 100) / 100,
        totalAmount: Math.round(lineTotal * 100) / 100
      });
    }

    const numBillDiscountPct = Math.max(0, Math.min(100, parseFloat(billDiscountPct) || 0));
    const billDiscountAmt = (taxableAmount * numBillDiscountPct) / 100;
    const finalTaxable = Math.max(0, taxableAmount - billDiscountAmt);

    if (numBillDiscountPct > 0) {
      totalCgst = 0;
      totalSgst = 0;
      totalIgst = 0;
      const discountMultiplier = 1 - (numBillDiscountPct / 100);
      for (const item of validatedItems) {
        const effTaxable = item.taxableAmount * discountMultiplier;
        if (isInterState) {
          item.igstAmount = Math.round((effTaxable * item.gstRate / 100) * 100) / 100;
          item.cgstAmount = 0;
          item.sgstAmount = 0;
        } else {
          item.igstAmount = 0;
          item.cgstAmount = Math.round((effTaxable * (item.gstRate / 2) / 100) * 100) / 100;
          item.sgstAmount = Math.round((effTaxable * (item.gstRate / 2) / 100) * 100) / 100;
        }
        item.totalAmount = Math.round((effTaxable + item.cgstAmount + item.sgstAmount + item.igstAmount) * 100) / 100;
        totalCgst += item.cgstAmount;
        totalSgst += item.sgstAmount;
        totalIgst += item.igstAmount;
      }
    }

    const totalTax = totalCgst + totalSgst + totalIgst;
    const numRoundOff = parseFloat(roundOff) || 0;
    const computedGrandTotal = Math.round((finalTaxable + totalTax + numRoundOff) * 100) / 100;

    const numPaid = Math.max(0, parseFloat(paidAmount) || (paymentMode === 'CASH' || paymentMode === 'UPI' || paymentMode === 'CARD' ? computedGrandTotal : 0));
    const finalPaid = Math.min(numPaid, computedGrandTotal);
    const balanceAmount = Math.max(0, computedGrandTotal - finalPaid);

    let status = 'PAID';
    if (balanceAmount > 0) {
      status = finalPaid > 0 ? 'PARTIAL' : 'UNPAID';
    }

    const parsedInvoiceDate = parseRecordDate(invoiceDate, existingInvoice.invoiceDate);
    const parsedDueDate = dueDate ? new Date(dueDate) : null;

    // Execute atomic update with append-only reversing and fresh entries
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      // 1. REVERSE OLD ITEMS STOCK & WRITE COMPENSATING REVERSAL ENTRIES
      for (const oldItem of existingInvoice.items) {
        const oldUnits = oldItem.quantity + (oldItem.freeQuantity || 0);

        // Increment batch stock back
        await tx.batch.update({
          where: { id: oldItem.batchId },
          data: { currentStock: { increment: oldUnits } }
        });

        // Write append-only compensating revision adjustment in stock ledger
        await tx.stockLedger.create({
          data: {
            companyId,
            itemId: oldItem.itemId,
            batchId: oldItem.batchId,
            entryType: 'ADJUSTMENT',
            quantity: oldUnits,
            unitPrice: oldItem.unitPrice,
            referenceId: existingInvoice.id,
            notes: `Invoice Edit Revision #${existingInvoice.invoiceNumber} (+${oldUnits} units restored)`,
            createdBy: userId
          }
        });
      }

      // Revert old customer party outstanding balance if previous invoice had unpaid balance
      if (existingInvoice.partyId) {
        const oldTotal = Number(existingInvoice.grandTotal);
        const oldPaid = Number(existingInvoice.paidAmount);
        const oldUnpaid = Math.max(0, oldTotal - oldPaid);
        if (oldUnpaid > 0) {
          await tx.party.update({
            where: { id: existingInvoice.partyId },
            data: { outstandingBalance: { decrement: oldUnpaid } }
          });
        }
      }

      // 2. DEDUCT NEW ITEMS STOCK & WRITE NEW SALE ENTRIES
      for (const item of validatedItems) {
        // Fetch current batch stock (post reversal)
        const batch = await tx.batch.findUnique({ where: { id: item.batchId } });
        if (!batch) {
          throw new Error(`Batch "${item.batchNumber}" not found`);
        }

        // Deduct new stock
        await tx.batch.update({
          where: { id: item.batchId },
          data: { currentStock: { decrement: item.totalUnitsNeeded } }
        });

        // Write append-only new SALE ledger entry
        await tx.stockLedger.create({
          data: {
            companyId,
            itemId: item.itemId,
            batchId: item.batchId,
            entryType: 'SALE',
            quantity: -item.totalUnitsNeeded,
            unitPrice: item.unitPrice,
            referenceId: existingInvoice.id,
            notes: `Sale Invoice #${existingInvoice.invoiceNumber} [REVISED] (${item.totalUnitsNeeded} units)`,
            createdBy: userId
          }
        });
      }

      // 3. REPLACE INVOICE ITEMS
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

      for (const item of validatedItems) {
        await tx.invoiceItem.create({
          data: {
            invoiceId: id,
            itemId: item.itemId,
            batchId: item.batchId,
            pack: item.pack,
            strips: item.strips,
            looseQty: item.looseQty,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            quantity: item.quantity,
            freeQuantity: item.freeQuantity,
            unitPrice: item.unitPrice,
            mrp: item.mrp,
            discountPercent: item.discountPercent,
            taxableAmount: item.taxableAmount,
            gstRate: item.gstRate,
            cgstAmount: item.cgstAmount,
            sgstAmount: item.sgstAmount,
            igstAmount: item.igstAmount,
            totalAmount: item.totalAmount
          }
        });
      }

      // 4. UPDATE INVOICE HEADER
      const revisionNote = `[REVISED on ${new Date().toISOString()}]`;
      const finalNotes = notes ? `${notes} ${revisionNote}` : (existingInvoice.notes ? `${existingInvoice.notes} ${revisionNote}` : revisionNote);

      const invoice = await tx.invoice.update({
        where: { id },
        data: {
          partyId: customerParty ? customerParty.id : null,
          invoiceDate: parsedInvoiceDate,
          dueDate: parsedDueDate,
          customerName: cleanCustomerName,
          customerPhone: customerPhone ? String(customerPhone).trim() : (customerParty ? customerParty.phone : null),
          customerAddress: customerAddress ? String(customerAddress).trim() : (customerParty ? customerParty.address : null),
          customerGstin: customerGstin ? String(customerGstin).trim() : (customerParty ? customerParty.gstin : null),
          doctorName: doctorName ? String(doctorName).trim() : 'Dr. Priyadarshi Srivastava',
          doctorRegNo: doctorRegNo ? String(doctorRegNo).trim() : 'UPMC 59048',
          patientName: cleanPatientName,
          patientAddress: cleanPatientAddress,
          paymentMode,
          subtotal: Math.round(subtotal * 100) / 100,
          itemDiscount: Math.round(totalItemDiscount * 100) / 100,
          billDiscountPct: numBillDiscountPct,
          billDiscountAmt: Math.round(billDiscountAmt * 100) / 100,
          taxableAmount: Math.round(finalTaxable * 100) / 100,
          cgstAmount: Math.round(totalCgst * 100) / 100,
          sgstAmount: Math.round(totalSgst * 100) / 100,
          igstAmount: Math.round(totalIgst * 100) / 100,
          totalTax: Math.round(totalTax * 100) / 100,
          roundOff: numRoundOff,
          grandTotal: computedGrandTotal,
          paidAmount: finalPaid,
          status,
          notes: finalNotes
        }
      });

      // 5. UPDATE NEW CUSTOMER OUTSTANDING BALANCE
      if (customerParty && balanceAmount > 0) {
        await tx.party.update({
          where: { id: customerParty.id },
          data: { outstandingBalance: { increment: balanceAmount } }
        });
      }

      return invoice;
    }, { maxWait: 15000, timeout: 30000 });

    const resPaid = Number(updatedInvoice.paidAmount);
    const resTotal = Number(updatedInvoice.grandTotal);

    res.status(200).json({
      invoice: {
        id: updatedInvoice.id,
        invoiceNumber: updatedInvoice.invoiceNumber,
        grandTotal: resTotal,
        paidAmount: resPaid,
        balanceAmount: Math.max(0, resTotal - resPaid),
        status: updatedInvoice.status,
        invoiceDate: updatedInvoice.invoiceDate.toISOString()
      },
      message: 'Sales invoice updated and stock adjusted successfully'
    });
  } catch (error: any) {
    console.error('Error updating sales invoice:', error);
    res.status(500).json({ error: error.message || 'Failed to update sales invoice' });
  }
});

/**
 * POST /invoices/:id/payment
 * Record customer settlement payment against a credit invoice
 */
router.post('/:id/payment', idempotencyMiddleware, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const userId = req.user!.userId;
  const { id } = req.params;
  const { paymentAmount, amount, paymentDate, paymentMode = 'CASH', referenceNo, notes } = req.body;

  const numPayment = parseFloat(paymentAmount !== undefined ? paymentAmount : amount) || 0;
  if (numPayment <= 0) {
    res.status(400).json({ error: 'Payment amount must be greater than 0' });
    return;
  }

  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id, companyId }
    });

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const currentPaid = Number(invoice.paidAmount);
    const total = Number(invoice.grandTotal);
    const balanceRemaining = total - currentPaid;

    if (balanceRemaining <= 0) {
      res.status(400).json({ error: 'This invoice is already fully paid' });
      return;
    }

    const actualPayment = Math.min(numPayment, balanceRemaining);
    const newPaid = currentPaid + actualPayment;
    const newStatus = newPaid >= total ? 'PAID' : 'PARTIAL';
    const effectivePaymentDate = paymentDate ? new Date(paymentDate) : new Date();

    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          paidAmount: newPaid,
          status: newStatus
        }
      });

      // Reduce customer outstanding balance if customer party is linked
      if (invoice.partyId) {
        await tx.party.update({
          where: { id: invoice.partyId },
          data: {
            outstandingBalance: { decrement: actualPayment }
          }
        });

        // Create permanent Payment transaction voucher
        await tx.payment.create({
          data: {
            companyId,
            partyId: invoice.partyId,
            invoiceId: invoice.id,
            voucherNo: `REC-${invoice.invoiceNumber}`,
            paymentType: 'PAYMENT_IN',
            amount: actualPayment,
            paymentDate: effectivePaymentDate,
            paymentMode: String(paymentMode || 'CASH'),
            referenceNo: referenceNo ? String(referenceNo).trim() : null,
            notes: notes ? String(notes).trim() : `Customer payment for Bill #${invoice.invoiceNumber} (${paymentMode || 'CASH'})`,
            createdBy: userId
          }
        });
      }
    });

    res.status(200).json({
      invoice: {
        id: invoice.id,
        paidAmount: newPaid,
        grandTotal: total,
        balanceAmount: Math.max(0, total - newPaid),
        status: newStatus
      },
      paidAmount: newPaid,
      status: newStatus,
      paymentDate: effectivePaymentDate.toISOString(),
      message: `Customer payment of ₹${actualPayment.toFixed(2)} recorded successfully on ${effectivePaymentDate.toLocaleDateString('en-IN')}`
    });
  } catch (error: any) {
    console.error('Error recording invoice payment:', error);
    res.status(500).json({ error: error.message || 'Failed to record customer payment' });
  }
});

/**
 * DELETE /invoices/:id (and POST /invoices/:id/cancel)
 * Cancels a sales invoice — marks status CANCELLED, writes append-only reversing stock ledger entries,
 * restores batch stock, and adjusts customer balance without deleting historical rows.
 */
router.delete('/:id', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const userId = req.user!.userId;
  const { id } = req.params;

  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id, companyId },
      include: {
        items: true
      }
    });

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    if (invoice.status === 'CANCELLED') {
      // Permanently delete cancelled sales invoice and its item records
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL app.allow_ledger_cleanup = 'on';");
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
        await tx.stockLedger.deleteMany({ where: { referenceId: id } });
        await tx.invoice.delete({ where: { id } });
      });
      res.status(200).json({ message: `Cancelled sales invoice "${invoice.invoiceNumber}" permanently deleted` });
      return;
    }

    await prisma.$transaction(async (tx) => {
      // 1. Mark the invoice as CANCELLED (never delete historical invoice or invoice_items)
      await tx.invoice.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          notes: invoice.notes ? `${invoice.notes} | [CANCELLED on ${new Date().toISOString()}]` : `[CANCELLED on ${new Date().toISOString()}]`
        }
      });

      // 2. Reverse stock deductions for each item using append-only reversing entries
      for (const invItem of invoice.items) {
        const returnedUnits = invItem.quantity + (invItem.freeQuantity || 0);

        // Add stock back to batch
        await tx.batch.update({
          where: { id: invItem.batchId },
          data: {
            currentStock: { increment: returnedUnits }
          }
        });

        // Write append-only compensating reversal in stock_ledger (NEVER delete historical rows)
        await tx.stockLedger.create({
          data: {
            companyId,
            itemId: invItem.itemId,
            batchId: invItem.batchId,
            entryType: 'ADJUSTMENT',
            quantity: returnedUnits, // Positive restores stock
            unitPrice: invItem.unitPrice,
            referenceId: invoice.id,
            notes: `Reversal for Cancelled Sales Invoice #${invoice.invoiceNumber} (+${returnedUnits} units restored)`,
            createdBy: userId
          }
        });
      }

      // 3. Adjust customer outstanding balance if there was unpaid balance
      if (invoice.partyId) {
        const totalAmount = Number(invoice.grandTotal);
        const paidAmount = Number(invoice.paidAmount);
        const unpaidAmount = Math.max(0, totalAmount - paidAmount);
        if (unpaidAmount > 0) {
          await tx.party.update({
            where: { id: invoice.partyId },
            data: {
              outstandingBalance: { decrement: unpaidAmount }
            }
          });
        }
      }
    });

    res.status(200).json({
      message: `Invoice "${invoice.invoiceNumber}" cancelled and stock restored via append-only reversing ledger entries`,
      status: 'CANCELLED'
    });
  } catch (error: any) {
    console.error('Error cancelling invoice:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel invoice' });
  }
});

router.post('/:id/cancel', async (req: CompanyScopedRequest, res: Response) => {
  // Alias for cancellation
  const companyId = req.company!.id;
  const userId = req.user!.userId;
  const { id } = req.params;

  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id, companyId },
      include: {
        items: true
      }
    });

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    if (invoice.status === 'CANCELLED') {
      res.status(400).json({ error: `Invoice "${invoice.invoiceNumber}" is already cancelled` });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          notes: invoice.notes ? `${invoice.notes} | [CANCELLED on ${new Date().toISOString()}]` : `[CANCELLED on ${new Date().toISOString()}]`
        }
      });

      for (const invItem of invoice.items) {
        const returnedUnits = invItem.quantity + (invItem.freeQuantity || 0);

        await tx.batch.update({
          where: { id: invItem.batchId },
          data: {
            currentStock: { increment: returnedUnits }
          }
        });

        await tx.stockLedger.create({
          data: {
            companyId,
            itemId: invItem.itemId,
            batchId: invItem.batchId,
            entryType: 'ADJUSTMENT',
            quantity: returnedUnits,
            unitPrice: invItem.unitPrice,
            referenceId: invoice.id,
            notes: `Reversal for Cancelled Sales Invoice #${invoice.invoiceNumber} (+${returnedUnits} units restored)`,
            createdBy: userId
          }
        });
      }

      if (invoice.partyId) {
        const totalAmount = Number(invoice.grandTotal);
        const paidAmount = Number(invoice.paidAmount);
        const unpaidAmount = Math.max(0, totalAmount - paidAmount);
        if (unpaidAmount > 0) {
          await tx.party.update({
            where: { id: invoice.partyId },
            data: {
              outstandingBalance: { decrement: unpaidAmount }
            }
          });
        }
      }
    });

    res.status(200).json({
      message: `Invoice "${invoice.invoiceNumber}" cancelled and stock restored via append-only reversing ledger entries`,
      status: 'CANCELLED'
    });
  } catch (error: any) {
    console.error('Error cancelling invoice:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel invoice' });
  }
});

export default router;

import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { requireCompany, CompanyScopedRequest } from '../middleware/company.js';
import prisma from '../prisma.js';
import { parseFilterStartDate, parseFilterEndDate } from '../utils/dateUtils.js';
import XLSX from 'xlsx';

const router = Router();
router.use(requireAuth);

// Standard Indian GSTIN Regex
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// Complete 37 Indian States & Union Territories GST Codes Mapping
export const GST_STATE_CODES: Record<string, string> = {
  '01': 'JAMMU AND KASHMIR',
  '02': 'HIMACHAL PRADESH',
  '03': 'PUNJAB',
  '04': 'CHANDIGARH',
  '05': 'UTTARAKHAND',
  '06': 'HARYANA',
  '07': 'DELHI',
  '08': 'RAJASTHAN',
  '09': 'UTTAR PRADESH',
  '10': 'BIHAR',
  '11': 'SIKKIM',
  '12': 'ARUNACHAL PRADESH',
  '13': 'NAGALAND',
  '14': 'MANIPUR',
  '15': 'MIZORAM',
  '16': 'TRIPURA',
  '17': 'MEGHALAYA',
  '18': 'ASSAM',
  '19': 'WEST BENGAL',
  '20': 'JHARKHAND',
  '21': 'ODISHA',
  '22': 'CHHATTISGARH',
  '23': 'MADHYA PRADESH',
  '24': 'GUJARAT',
  '26': 'DADRA AND NAGAR HAVELI AND DAMAN AND DIU',
  '27': 'MAHARASHTRA',
  '29': 'KARNATAKA',
  '30': 'GOA',
  '31': 'LAKSHADWEEP',
  '32': 'KERALA',
  '33': 'TAMIL NADU',
  '34': 'PUDUCHERRY',
  '35': 'ANDAMAN AND NICOBAR ISLANDS',
  '36': 'TELANGANA',
  '37': 'ANDHRA PRADESH',
  '38': 'LADAKH',
  '97': 'OTHER TERRITORY'
};

/**
 * POST /api/gst/lookup
 * Intelligent GSTIN verification and autofill proxy (Auth required, Company context optional)
 */
router.post('/lookup', async (req: AuthenticatedRequest, res: Response) => {
  const companyId = (req.headers['x-company-id'] as string) || (req.headers['company-id'] as string) || undefined;
  const { gstin } = req.body;

  if (!gstin || typeof gstin !== 'string') {
    res.status(400).json({ error: 'GSTIN is required' });
    return;
  }

  const cleanGstin = gstin.trim().toUpperCase();

  if (!GSTIN_REGEX.test(cleanGstin)) {
    res.status(400).json({
      error: 'Invalid GSTIN format. Must be a 15-character code (e.g., 09AOAPV7912G1ZO)'
    });
    return;
  }

  const stateCode = cleanGstin.substring(0, 2);
  const stateName = GST_STATE_CODES[stateCode] || 'OTHER';
  const pan = cleanGstin.substring(2, 12);

  try {
    // 1. Check local database cache first (0ms latency, ₹0 cost)
    const existingParty = await prisma.party.findFirst({
      where: {
        ...(companyId ? { companyId } : {}),
        gstin: cleanGstin
      }
    });

    if (existingParty) {
      res.json({
        source: 'DATABASE_CACHE',
        data: {
          gstin: existingParty.gstin,
          legalName: existingParty.name,
          tradeName: existingParty.mailTo || existingParty.name,
          address: existingParty.address || '',
          city: existingParty.station || '',
          state: existingParty.state || stateName,
          pincode: existingParty.pincode || '',
          stateCode,
          pan,
          status: 'Active',
          taxpayerType: existingParty.ledgerCategory === 'COMPOSITE' ? 'Composition' : 'Regular',
          phone: existingParty.mobile || existingParty.phone || '',
          email: existingParty.email || '',
          dlNumber: existingParty.drugLicenseNo || ''
        }
      });
      return;
    }

    // 2. Check for Sandbox / GSP API Keys
    const apiKey = (process.env.SANDBOX_API_KEY || process.env.GSP_API_KEY || '').trim();
    const apiSecret = (process.env.SANDBOX_API_SECRET || process.env.GSP_API_SECRET || '').trim();

    if (apiKey && apiSecret) {
      try {
        const baseUrl = apiKey.startsWith('key_test_')
          ? 'https://test-api.sandbox.co.in'
          : 'https://api.sandbox.co.in';

        console.log(`[GST Lookup] Authenticating with Sandbox at ${baseUrl}...`);

        const authController = new AbortController();
        const authTimer = setTimeout(() => authController.abort(), 6000);

        const authRes = await fetch(`${baseUrl}/authenticate`, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'x-api-secret': apiSecret,
            'x-api-version': '1.0.0',
            'Content-Type': 'application/json'
          },
          signal: authController.signal
        });

        clearTimeout(authTimer);

        if (authRes.ok) {
          const authData = await authRes.json() as any;
          const token = authData.access_token || authData.data?.access_token || authData.token;

          if (token) {
            console.log(`[GST Lookup] Token acquired. Querying live GSTIN data for ${cleanGstin}...`);

            // Try Primary Endpoint: Public GSTIN Search (POST)
            const searchController = new AbortController();
            const searchTimer = setTimeout(() => searchController.abort(), 7000);

            const searchRes = await fetch(`${baseUrl}/gst/compliance/public/gstin/search`, {
              method: 'POST',
              headers: {
                'authorization': token,
                'x-api-key': apiKey,
                'x-api-version': '1.0.0',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ gstin: cleanGstin }),
              signal: searchController.signal
            });

            clearTimeout(searchTimer);

            let gstPayload: any = null;

            if (searchRes.ok) {
              const resJson = await searchRes.json() as any;
              gstPayload = resJson.data?.data || resJson.data || resJson;
            } else {
              console.warn(`[GST Lookup] Primary search endpoint returned ${searchRes.status}. Trying fallback GET endpoint...`);
              // Try Fallback GET Endpoint
              const fallbackController = new AbortController();
              const fallbackTimer = setTimeout(() => fallbackController.abort(), 7000);

              const fallbackRes = await fetch(`${baseUrl}/gsp/public/gstin/${cleanGstin}`, {
                headers: {
                  'authorization': token,
                  'x-api-key': apiKey,
                  'x-api-version': '1.0.0'
                },
                signal: fallbackController.signal
              });

              clearTimeout(fallbackTimer);

              if (fallbackRes.ok) {
                const fbJson = await fallbackRes.json() as any;
                gstPayload = fbJson.data || fbJson;
              }
            }

            if (gstPayload) {
              const legalName = gstPayload.legal_name_of_business || gstPayload.legal_name || gstPayload.lgnm || gstPayload.trade_name || '';
              const tradeName = gstPayload.trade_name || gstPayload.trade_name_of_business || gstPayload.tradeNam || legalName;
              
              const addr = gstPayload.principal_place_of_business_fields || gstPayload.pradr?.addr || gstPayload.address || {};
              const cleanAddress = addr.complete_address || [
                addr.building_name || addr.bno || addr.bnm,
                addr.street || addr.st,
                addr.locality || addr.loc
              ].filter(Boolean).join(', ');

              const city = addr.district || addr.dst || addr.city || addr.locality || addr.loc || '';
              const state = addr.state || addr.stcd || stateName;
              const pincode = addr.pincode || addr.pncd || '';
              const status = gstPayload.gstin_status || gstPayload.status || gstPayload.sts || 'Active';
              const taxpayerType = gstPayload.taxpayer_type || gstPayload.dty || 'Regular';

              res.json({
                source: 'GOVERNMENT_GSP_LIVE',
                data: {
                  gstin: cleanGstin,
                  legalName,
                  tradeName,
                  address: cleanAddress,
                  city,
                  state,
                  pincode,
                  stateCode,
                  pan,
                  status,
                  taxpayerType,
                  registrationDate: gstPayload.registration_date || gstPayload.rgdt || ''
                }
              });
              return;
            }
          }
        } else {
          const errText = await authRes.text();
          console.warn(`[GST Lookup] Sandbox Authentication failed (${authRes.status}):`, errText);
        }
      } catch (gspErr) {
        console.warn('[GST Lookup] Live GSP query encountered exception, falling back to smart offline decoder:', gspErr);
      }
    } else {
      console.log('[GST Lookup] No SANDBOX_API_KEY set. Using offline smart decoder.');
    }

    // 3. Smart Offline Decoder (Guaranteed response with State & PAN)
    res.json({
      source: 'SMART_OFFLINE_PARSER',
      data: {
        gstin: cleanGstin,
        legalName: '',
        tradeName: '',
        address: '',
        city: '',
        state: stateName,
        pincode: '',
        stateCode,
        pan,
        status: 'Active',
        taxpayerType: 'Regular',
        note: `Decoded Jurisdiction: ${stateName} (${stateCode}), PAN: ${pan}`
      }
    });
  } catch (error: any) {
    console.error('GST Lookup Route Error:', error);
    res.status(500).json({ error: error.message || 'Failed to process GSTIN lookup' });
  }
});

// Helper for parsing date filters
function getDateRange(queryStart?: any, queryEnd?: any) {
  let start = parseFilterStartDate(typeof queryStart === 'string' ? queryStart : undefined);
  let end = parseFilterEndDate(typeof queryEnd === 'string' ? queryEnd : undefined);

  if (!start || !end) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const startStr = `${year}-${month}-01`;
    start = parseFilterStartDate(startStr)!;

    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    const endStr = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    end = parseFilterEndDate(endStr)!;
  }

  return { start, end };
}

/**
 * GET /api/gst/gstr3b
 * Monthly GSTR-3B Summary (Outward Tax Liability vs. Eligible Inward ITC)
 */
router.get('/gstr3b', requireCompany, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { start, end } = getDateRange(req.query.startDate, req.query.endDate);

  try {
    // 1. Outward Supplies (Active Invoices)
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        invoiceDate: { gte: start, lte: end },
        status: { not: 'CANCELLED' }
      },
      select: {
        taxableAmount: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
        grandTotal: true
      }
    });

    let outwardTaxable = 0;
    let outwardCgst = 0;
    let outwardSgst = 0;
    let outwardIgst = 0;
    let outwardGrandTotal = 0;

    for (const inv of invoices) {
      outwardTaxable += Number(inv.taxableAmount || 0);
      outwardCgst += Number(inv.cgstAmount || 0);
      outwardSgst += Number(inv.sgstAmount || 0);
      outwardIgst += Number(inv.igstAmount || 0);
      outwardGrandTotal += Number(inv.grandTotal || 0);
    }

    const outwardTotalTax = outwardCgst + outwardSgst + outwardIgst;

    // 2. Inward Supplies (Eligible Input Tax Credit from Purchases)
    const purchases = await prisma.purchase.findMany({
      where: {
        companyId,
        purchaseDate: { gte: start, lte: end },
        status: { not: 'CANCELLED' }
      },
      select: {
        taxableAmount: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
        totalAmount: true
      }
    });

    let inwardTaxable = 0;
    let inwardCgst = 0;
    let inwardSgst = 0;
    let inwardIgst = 0;
    let inwardTotalAmount = 0;

    for (const pur of purchases) {
      inwardTaxable += Number(pur.taxableAmount || 0);
      inwardCgst += Number(pur.cgstAmount || 0);
      inwardSgst += Number(pur.sgstAmount || 0);
      inwardIgst += Number(pur.igstAmount || 0);
      inwardTotalAmount += Number(pur.totalAmount || 0);
    }

    const inwardTotalITC = inwardCgst + inwardSgst + inwardIgst;

    // 3. Purchase Returns / Debit Notes (ITC Reversal)
    const returns = await prisma.purchaseReturn.findMany({
      where: {
        companyId,
        returnDate: { gte: start, lte: end }
      },
      select: {
        taxableAmount: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
        totalAmount: true
      }
    });

    let reversalTaxable = 0;
    let reversalCgst = 0;
    let reversalSgst = 0;
    let reversalIgst = 0;
    let reversalTotalAmount = 0;

    for (const ret of returns) {
      reversalTaxable += Number(ret.taxableAmount || 0);
      reversalCgst += Number(ret.cgstAmount || 0);
      reversalSgst += Number(ret.sgstAmount || 0);
      reversalIgst += Number(ret.igstAmount || 0);
      reversalTotalAmount += Number(ret.totalAmount || 0);
    }

    const reversalTotalITC = reversalCgst + reversalSgst + reversalIgst;

    // 4. Net Eligible ITC Calculation
    const netEligibleCgst = Math.max(0, inwardCgst - reversalCgst);
    const netEligibleSgst = Math.max(0, inwardSgst - reversalSgst);
    const netEligibleIgst = Math.max(0, inwardIgst - reversalIgst);
    const netEligibleITC = netEligibleCgst + netEligibleSgst + netEligibleIgst;

    // 5. Net Tax Payable in Cash (Outward Liability - Net Eligible ITC)
    const netPayableCgst = Math.max(0, outwardCgst - netEligibleCgst);
    const netPayableSgst = Math.max(0, outwardSgst - netEligibleSgst);
    const netPayableIgst = Math.max(0, outwardIgst - netEligibleIgst);
    const netCashPayable = netPayableCgst + netPayableSgst + netPayableIgst;

    // 6. Excess ITC Balance Carried Forward
    const itcBalanceCgst = Math.max(0, netEligibleCgst - outwardCgst);
    const itcBalanceSgst = Math.max(0, netEligibleSgst - outwardSgst);
    const itcBalanceIgst = Math.max(0, netEligibleIgst - outwardIgst);
    const itcCarryForward = itcBalanceCgst + itcBalanceSgst + itcBalanceIgst;

    res.json({
      period: {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
      },
      outwardSupplies: {
        invoiceCount: invoices.length,
        taxableAmount: Math.round(outwardTaxable * 100) / 100,
        cgstAmount: Math.round(outwardCgst * 100) / 100,
        sgstAmount: Math.round(outwardSgst * 100) / 100,
        igstAmount: Math.round(outwardIgst * 100) / 100,
        totalTax: Math.round(outwardTotalTax * 100) / 100,
        grandTotal: Math.round(outwardGrandTotal * 100) / 100
      },
      inwardSupplies: {
        purchaseCount: purchases.length,
        taxableAmount: Math.round(inwardTaxable * 100) / 100,
        cgstAmount: Math.round(inwardCgst * 100) / 100,
        sgstAmount: Math.round(inwardSgst * 100) / 100,
        igstAmount: Math.round(inwardIgst * 100) / 100,
        totalITC: Math.round(inwardTotalITC * 100) / 100,
        totalAmount: Math.round(inwardTotalAmount * 100) / 100
      },
      itcReversal: {
        returnCount: returns.length,
        taxableAmount: Math.round(reversalTaxable * 100) / 100,
        cgstAmount: Math.round(reversalCgst * 100) / 100,
        sgstAmount: Math.round(reversalSgst * 100) / 100,
        igstAmount: Math.round(reversalIgst * 100) / 100,
        totalReversal: Math.round(reversalTotalITC * 100) / 100,
        totalAmount: Math.round(reversalTotalAmount * 100) / 100
      },
      netEligibleITC: {
        cgstAmount: Math.round(netEligibleCgst * 100) / 100,
        sgstAmount: Math.round(netEligibleSgst * 100) / 100,
        igstAmount: Math.round(netEligibleIgst * 100) / 100,
        totalITC: Math.round(netEligibleITC * 100) / 100
      },
      netTaxPayable: {
        cgstAmount: Math.round(netPayableCgst * 100) / 100,
        sgstAmount: Math.round(netPayableSgst * 100) / 100,
        igstAmount: Math.round(netPayableIgst * 100) / 100,
        totalPayable: Math.round(netCashPayable * 100) / 100
      },
      itcCarryForward: {
        cgstAmount: Math.round(itcBalanceCgst * 100) / 100,
        sgstAmount: Math.round(itcBalanceSgst * 100) / 100,
        igstAmount: Math.round(itcBalanceIgst * 100) / 100,
        totalBalance: Math.round(itcCarryForward * 100) / 100
      }
    });
  } catch (error: any) {
    console.error('GSTR-3B calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate GSTR-3B summary' });
  }
});

/**
 * GET /api/gst/gstr1
 * GSTR-1 Outward Supplies Breakdown (B2B, B2C Small, B2C Large, Document Summary)
 */
router.get('/gstr1', requireCompany, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { start, end } = getDateRange(req.query.startDate, req.query.endDate);

  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        invoiceDate: { gte: start, lte: end }
      },
      include: {
        party: {
          select: { name: true, gstin: true, state: true, stateCode: true }
        }
      },
      orderBy: { invoiceDate: 'asc' }
    });

    const b2bInvoices: any[] = [];
    const b2cSmallInvoices: any[] = [];
    const b2cLargeInvoices: any[] = [];
    const cancelledInvoices: any[] = [];

    let totalB2BTaxable = 0;
    let totalB2BTax = 0;
    let totalB2CSmallTaxable = 0;
    let totalB2CSmallTax = 0;

    for (const inv of invoices) {
      if (inv.status === 'CANCELLED') {
        cancelledInvoices.push({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate.toISOString().split('T')[0],
          customerName: inv.customerName,
          grandTotal: Number(inv.grandTotal)
        });
        continue;
      }

      const hasGstin = (inv.customerGstin && inv.customerGstin.trim().length >= 15) ||
        (inv.party?.gstin && inv.party.gstin.trim().length >= 15);

      const taxable = Number(inv.taxableAmount || 0);
      const cgst = Number(inv.cgstAmount || 0);
      const sgst = Number(inv.sgstAmount || 0);
      const igst = Number(inv.igstAmount || 0);
      const tax = cgst + sgst + igst;
      const total = Number(inv.grandTotal || 0);

      const cleanItem = {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate.toISOString().split('T')[0],
        customerName: inv.customerName || inv.party?.name || 'Walk-in Patient',
        gstin: (inv.customerGstin || inv.party?.gstin || '').toUpperCase(),
        taxableAmount: taxable,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        totalTax: tax,
        grandTotal: total
      };

      if (hasGstin) {
        b2bInvoices.push(cleanItem);
        totalB2BTaxable += taxable;
        totalB2BTax += tax;
      } else if (igst > 0 && total > 250000) {
        b2cLargeInvoices.push(cleanItem);
      } else {
        b2cSmallInvoices.push(cleanItem);
        totalB2CSmallTaxable += taxable;
        totalB2CSmallTax += tax;
      }
    }

    // Document series summary
    const activeInvoices = invoices.filter(i => i.status !== 'CANCELLED');
    const firstInvoice = invoices.length > 0 ? invoices[0].invoiceNumber : '-';
    const lastInvoice = invoices.length > 0 ? invoices[invoices.length - 1].invoiceNumber : '-';

    res.json({
      period: {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
      },
      b2b: {
        count: b2bInvoices.length,
        totalTaxable: Math.round(totalB2BTaxable * 100) / 100,
        totalTax: Math.round(totalB2BTax * 100) / 100,
        invoices: b2bInvoices
      },
      b2cSmall: {
        count: b2cSmallInvoices.length,
        totalTaxable: Math.round(totalB2CSmallTaxable * 100) / 100,
        totalTax: Math.round(totalB2CSmallTax * 100) / 100,
        invoices: b2cSmallInvoices
      },
      b2cLarge: {
        count: b2cLargeInvoices.length,
        invoices: b2cLargeInvoices
      },
      cancelled: {
        count: cancelledInvoices.length,
        invoices: cancelledInvoices
      },
      documentSummary: {
        totalIssued: invoices.length,
        activeCount: activeInvoices.length,
        cancelledCount: cancelledInvoices.length,
        startingNumber: firstInvoice,
        endingNumber: lastInvoice
      }
    });
  } catch (error: any) {
    console.error('GSTR-1 calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate GSTR-1 report' });
  }
});

/**
 * GET /api/gst/gstr2
 * GSTR-2 Inward Purchases & ITC Register
 */
router.get('/gstr2', requireCompany, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { start, end } = getDateRange(req.query.startDate, req.query.endDate);

  try {
    const purchases = await prisma.purchase.findMany({
      where: {
        companyId,
        purchaseDate: { gte: start, lte: end }
      },
      include: {
        supplier: {
          select: { name: true, gstin: true, state: true }
        }
      },
      orderBy: { purchaseDate: 'asc' }
    });

    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalAmount = 0;

    const formattedPurchases = purchases.map(p => {
      const taxable = Number(p.taxableAmount || 0);
      const cgst = Number(p.cgstAmount || 0);
      const sgst = Number(p.sgstAmount || 0);
      const igst = Number(p.igstAmount || 0);
      const total = Number(p.totalAmount || 0);

      totalTaxable += taxable;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;
      totalAmount += total;

      return {
        id: p.id,
        invoiceNumber: p.invoiceNumber,
        purchaseDate: p.purchaseDate.toISOString().split('T')[0],
        supplierName: p.supplier.name,
        supplierGstin: p.supplier.gstin || '',
        paymentMode: p.paymentMode,
        taxableAmount: taxable,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        totalTax: cgst + sgst + igst,
        totalAmount: total,
        status: p.status
      };
    });

    res.json({
      period: {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
      },
      summary: {
        count: purchases.length,
        totalTaxable: Math.round(totalTaxable * 100) / 100,
        totalCgst: Math.round(totalCgst * 100) / 100,
        totalSgst: Math.round(totalSgst * 100) / 100,
        totalIgst: Math.round(totalIgst * 100) / 100,
        totalITC: Math.round((totalCgst + totalSgst + totalIgst) * 100) / 100,
        totalAmount: Math.round(totalAmount * 100) / 100
      },
      purchases: formattedPurchases
    });
  } catch (error: any) {
    console.error('GSTR-2 error:', error);
    res.status(500).json({ error: 'Failed to fetch GSTR-2 purchase report' });
  }
});

/**
 * GET /api/gst/gstr4
 * GSTR-4 Composition Scheme Calculation (1% Flat on Turnover)
 */
router.get('/gstr4', requireCompany, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { start, end } = getDateRange(req.query.startDate, req.query.endDate);

  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        invoiceDate: { gte: start, lte: end },
        status: { not: 'CANCELLED' }
      },
      select: { grandTotal: true, taxableAmount: true }
    });

    let totalTurnover = 0;
    for (const inv of invoices) {
      totalTurnover += Number(inv.grandTotal || 0);
    }

    // Flat 1% composition tax (0.5% CGST + 0.5% SGST)
    const cgst1pct = Math.round(totalTurnover * 0.005 * 100) / 100;
    const sgst1pct = Math.round(totalTurnover * 0.005 * 100) / 100;
    const totalCompositionTax = cgst1pct + sgst1pct;

    res.json({
      period: {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
      },
      totalBills: invoices.length,
      grossTurnover: Math.round(totalTurnover * 100) / 100,
      compositionRate: '1.0% (0.5% CGST + 0.5% SGST)',
      taxPayable: {
        cgst: cgst1pct,
        sgst: sgst1pct,
        total: totalCompositionTax
      }
    });
  } catch (error: any) {
    console.error('GSTR-4 calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate GSTR-4' });
  }
});

/**
 * GET /api/gst/hsn-summary
 * HSN Code Outward / Inward Summary
 */
router.get('/hsn-summary', requireCompany, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const type = req.query.type === 'purchase' ? 'purchase' : 'sales';
  const { start, end } = getDateRange(req.query.startDate, req.query.endDate);

  try {
    const hsnMap = new Map<string, {
      hsnCode: string;
      description: string;
      uqc: string;
      quantity: number;
      taxableAmount: number;
      cgstAmount: number;
      sgstAmount: number;
      igstAmount: number;
      totalAmount: number;
    }>();

    if (type === 'sales') {
      const items = await prisma.invoiceItem.findMany({
        where: {
          invoice: {
            companyId,
            invoiceDate: { gte: start, lte: end },
            status: { not: 'CANCELLED' }
          }
        },
        include: {
          item: {
            select: { hsnCode: true, name: true, unit: true }
          }
        }
      });

      for (const item of items) {
        const hsn = (item.item?.hsnCode || '3004').trim();
        const existing = hsnMap.get(hsn) || {
          hsnCode: hsn,
          description: hsn === '3004' ? 'Medicaments (Formulations)' : (hsn === '3006' ? 'Pharmaceutical Goods' : 'Medical Items'),
          uqc: item.item?.unit || 'STRIP',
          quantity: 0,
          taxableAmount: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          totalAmount: 0
        };

        existing.quantity += item.quantity;
        existing.taxableAmount += Number(item.taxableAmount || 0);
        existing.cgstAmount += Number(item.cgstAmount || 0);
        existing.sgstAmount += Number(item.sgstAmount || 0);
        existing.igstAmount += Number(item.igstAmount || 0);
        existing.totalAmount += Number(item.totalAmount || 0);

        hsnMap.set(hsn, existing);
      }
    } else {
      const items = await prisma.purchaseItem.findMany({
        where: {
          purchase: {
            companyId,
            purchaseDate: { gte: start, lte: end },
            status: { not: 'CANCELLED' }
          }
        },
        include: {
          item: {
            select: { hsnCode: true, name: true, unit: true }
          }
        }
      });

      for (const item of items) {
        const hsn = (item.item?.hsnCode || '3004').trim();
        const existing = hsnMap.get(hsn) || {
          hsnCode: hsn,
          description: hsn === '3004' ? 'Medicaments (Formulations)' : (hsn === '3006' ? 'Pharmaceutical Goods' : 'Medical Items'),
          uqc: item.item?.unit || 'STRIP',
          quantity: 0,
          taxableAmount: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          totalAmount: 0
        };

        const taxable = Number(item.taxableValue || 0);
        const gst = Number(item.gstAmount || 0);
        const halfGst = Math.round((gst / 2) * 100) / 100;

        existing.quantity += item.quantity;
        existing.taxableAmount += taxable;
        existing.cgstAmount += halfGst;
        existing.sgstAmount += (gst - halfGst);
        existing.igstAmount += 0;
        existing.totalAmount += Number(item.totalAmount || 0);

        hsnMap.set(hsn, existing);
      }
    }

    const hsnList = Array.from(hsnMap.values()).map(h => ({
      ...h,
      taxableAmount: Math.round(h.taxableAmount * 100) / 100,
      cgstAmount: Math.round(h.cgstAmount * 100) / 100,
      sgstAmount: Math.round(h.sgstAmount * 100) / 100,
      igstAmount: Math.round(h.igstAmount * 100) / 100,
      totalTax: Math.round((h.cgstAmount + h.sgstAmount + h.igstAmount) * 100) / 100,
      totalAmount: Math.round(h.totalAmount * 100) / 100
    }));

    res.json({
      period: {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
      },
      type,
      hsnSummary: hsnList
    });
  } catch (error: any) {
    console.error('HSN summary calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate HSN summary' });
  }
});

/**
 * GET /api/gst/datewise-register
 * Day-by-Day Sales vs. Purchases Register
 */
router.get('/datewise-register', requireCompany, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { start, end } = getDateRange(req.query.startDate, req.query.endDate);

  try {
    const [invoices, purchases] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          companyId,
          invoiceDate: { gte: start, lte: end },
          status: { not: 'CANCELLED' }
        },
        select: {
          invoiceDate: true,
          taxableAmount: true,
          cgstAmount: true,
          sgstAmount: true,
          igstAmount: true,
          grandTotal: true
        }
      }),
      prisma.purchase.findMany({
        where: {
          companyId,
          purchaseDate: { gte: start, lte: end },
          status: { not: 'CANCELLED' }
        },
        select: {
          purchaseDate: true,
          taxableAmount: true,
          cgstAmount: true,
          sgstAmount: true,
          igstAmount: true,
          totalAmount: true
        }
      })
    ]);

    const dailyMap = new Map<string, {
      date: string;
      salesCount: number;
      salesTaxable: number;
      salesGst: number;
      salesTotal: number;
      purchaseCount: number;
      purchaseTaxable: number;
      purchaseGst: number;
      purchaseTotal: number;
    }>();

    for (const inv of invoices) {
      const dateKey = inv.invoiceDate.toISOString().split('T')[0];
      const rec = dailyMap.get(dateKey) || {
        date: dateKey,
        salesCount: 0,
        salesTaxable: 0,
        salesGst: 0,
        salesTotal: 0,
        purchaseCount: 0,
        purchaseTaxable: 0,
        purchaseGst: 0,
        purchaseTotal: 0
      };

      rec.salesCount += 1;
      rec.salesTaxable += Number(inv.taxableAmount || 0);
      rec.salesGst += Number(inv.cgstAmount || 0) + Number(inv.sgstAmount || 0) + Number(inv.igstAmount || 0);
      rec.salesTotal += Number(inv.grandTotal || 0);
      dailyMap.set(dateKey, rec);
    }

    for (const pur of purchases) {
      const dateKey = pur.purchaseDate.toISOString().split('T')[0];
      const rec = dailyMap.get(dateKey) || {
        date: dateKey,
        salesCount: 0,
        salesTaxable: 0,
        salesGst: 0,
        salesTotal: 0,
        purchaseCount: 0,
        purchaseTaxable: 0,
        purchaseGst: 0,
        purchaseTotal: 0
      };

      rec.purchaseCount += 1;
      rec.purchaseTaxable += Number(pur.taxableAmount || 0);
      rec.purchaseGst += Number(pur.cgstAmount || 0) + Number(pur.sgstAmount || 0) + Number(pur.igstAmount || 0);
      rec.purchaseTotal += Number(pur.totalAmount || 0);
      dailyMap.set(dateKey, rec);
    }

    const sortedDates = Array.from(dailyMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        date: d.date,
        salesCount: d.salesCount,
        salesTaxable: Math.round(d.salesTaxable * 100) / 100,
        salesGst: Math.round(d.salesGst * 100) / 100,
        salesTotal: Math.round(d.salesTotal * 100) / 100,
        purchaseCount: d.purchaseCount,
        purchaseTaxable: Math.round(d.purchaseTaxable * 100) / 100,
        purchaseGst: Math.round(d.purchaseGst * 100) / 100,
        purchaseTotal: Math.round(d.purchaseTotal * 100) / 100
      }));

    res.json({
      period: {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
      },
      dailyRecords: sortedDates
    });
  } catch (error: any) {
    console.error('Datewise register error:', error);
    res.status(500).json({ error: 'Failed to calculate datewise register' });
  }
});

/**
 * GET /api/gst/partywise-sales
 * Party / Customer Wise Outward Sales GST Register
 */
router.get('/partywise-sales', requireCompany, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { start, end } = getDateRange(req.query.startDate, req.query.endDate);

  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        invoiceDate: { gte: start, lte: end },
        status: { not: 'CANCELLED' }
      },
      include: {
        party: {
          select: { id: true, name: true, gstin: true, state: true }
        }
      }
    });

    const partyMap = new Map<string, {
      partyName: string;
      gstin: string;
      state: string;
      invoiceCount: number;
      taxableAmount: number;
      cgstAmount: number;
      sgstAmount: number;
      igstAmount: number;
      totalAmount: number;
    }>();

    for (const inv of invoices) {
      const partyKey = inv.party ? inv.party.name : (inv.customerName || 'Cash Customer');
      const rec = partyMap.get(partyKey) || {
        partyName: partyKey,
        gstin: inv.customerGstin || inv.party?.gstin || '',
        state: inv.party?.state || 'UTTAR PRADESH',
        invoiceCount: 0,
        taxableAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalAmount: 0
      };

      rec.invoiceCount += 1;
      rec.taxableAmount += Number(inv.taxableAmount || 0);
      rec.cgstAmount += Number(inv.cgstAmount || 0);
      rec.sgstAmount += Number(inv.sgstAmount || 0);
      rec.igstAmount += Number(inv.igstAmount || 0);
      rec.totalAmount += Number(inv.grandTotal || 0);
      partyMap.set(partyKey, rec);
    }

    const partyList = Array.from(partyMap.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .map(p => ({
        ...p,
        taxableAmount: Math.round(p.taxableAmount * 100) / 100,
        cgstAmount: Math.round(p.cgstAmount * 100) / 100,
        sgstAmount: Math.round(p.sgstAmount * 100) / 100,
        igstAmount: Math.round(p.igstAmount * 100) / 100,
        totalTax: Math.round((p.cgstAmount + p.sgstAmount + p.igstAmount) * 100) / 100,
        totalAmount: Math.round(p.totalAmount * 100) / 100
      }));

    res.json({
      period: {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
      },
      parties: partyList
    });
  } catch (error: any) {
    console.error('Partywise sales error:', error);
    res.status(500).json({ error: 'Failed to calculate partywise sales' });
  }
});

/**
 * GET /api/gst/export-excel
 * Generate a complete multi-sheet Excel workbook for the Chartered Accountant
 */
router.get('/export-excel', requireCompany, async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const companyName = req.company!.name;
  const { start, end } = getDateRange(req.query.startDate, req.query.endDate);

  try {
    const [invoices, purchases, returns] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          companyId,
          invoiceDate: { gte: start, lte: end }
        },
        include: {
          party: { select: { name: true, gstin: true } }
        },
        orderBy: { invoiceDate: 'asc' }
      }),
      prisma.purchase.findMany({
        where: {
          companyId,
          purchaseDate: { gte: start, lte: end }
        },
        include: {
          supplier: { select: { name: true, gstin: true } }
        },
        orderBy: { purchaseDate: 'asc' }
      }),
      prisma.purchaseReturn.findMany({
        where: {
          companyId,
          returnDate: { gte: start, lte: end }
        },
        include: {
          supplier: { select: { name: true } }
        },
        orderBy: { returnDate: 'asc' }
      })
    ]);

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Sheet 1: Outward Sales (GSTR-1 format)
    const salesData = invoices.map(inv => ({
      'Invoice No': inv.invoiceNumber,
      'Date': inv.invoiceDate.toISOString().split('T')[0],
      'Customer / Party': inv.customerName || inv.party?.name || 'Cash Customer',
      'GSTIN': (inv.customerGstin || inv.party?.gstin || '').toUpperCase(),
      'Status': inv.status,
      'Taxable Value (₹)': Number(inv.taxableAmount || 0),
      'CGST (₹)': Number(inv.cgstAmount || 0),
      'SGST (₹)': Number(inv.sgstAmount || 0),
      'IGST (₹)': Number(inv.igstAmount || 0),
      'Total GST (₹)': Number(inv.totalTax || 0),
      'Grand Total (₹)': Number(inv.grandTotal || 0)
    }));
    const wsSales = XLSX.utils.json_to_sheet(salesData);
    XLSX.utils.book_append_sheet(wb, wsSales, 'GSTR-1 Sales');

    // Sheet 2: Inward Purchases (GSTR-2 format)
    const purchaseData = purchases.map(pur => ({
      'Bill No': pur.invoiceNumber,
      'Date': pur.purchaseDate.toISOString().split('T')[0],
      'Supplier': pur.supplier.name,
      'Supplier GSTIN': (pur.supplier.gstin || '').toUpperCase(),
      'Payment Mode': pur.paymentMode,
      'Taxable Value (₹)': Number(pur.taxableAmount || 0),
      'CGST (₹)': Number(pur.cgstAmount || 0),
      'SGST (₹)': Number(pur.sgstAmount || 0),
      'IGST (₹)': Number(pur.igstAmount || 0),
      'Total ITC (₹)': Number(pur.cgstAmount || 0) + Number(pur.sgstAmount || 0) + Number(pur.igstAmount || 0),
      'Total Amount (₹)': Number(pur.totalAmount || 0),
      'Status': pur.status
    }));
    const wsPurchases = XLSX.utils.json_to_sheet(purchaseData);
    XLSX.utils.book_append_sheet(wb, wsPurchases, 'GSTR-2 Purchases');

    // Sheet 3: Debit Notes / Purchase Returns
    const returnData = returns.map(ret => ({
      'Return No': ret.returnNumber,
      'Date': ret.returnDate.toISOString().split('T')[0],
      'Supplier': ret.supplier.name,
      'Taxable Value (₹)': Number(ret.taxableAmount || 0),
      'CGST (₹)': Number(ret.cgstAmount || 0),
      'SGST (₹)': Number(ret.sgstAmount || 0),
      'IGST (₹)': Number(ret.igstAmount || 0),
      'Total Reversal (₹)': Number(ret.cgstAmount || 0) + Number(ret.sgstAmount || 0) + Number(ret.igstAmount || 0),
      'Total Amount (₹)': Number(ret.totalAmount || 0)
    }));
    const wsReturns = XLSX.utils.json_to_sheet(returnData);
    XLSX.utils.book_append_sheet(wb, wsReturns, 'Debit Notes');

    // Convert workbook to buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const cleanComp = companyName.replace(/[^a-zA-Z0-9]/g, '_');
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    const filename = `TradeFlow_GST_${cleanComp}_${startStr}_to_${endStr}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (error: any) {
    console.error('Excel export error:', error);
    res.status(500).json({ error: 'Failed to generate Excel export' });
  }
});


export default router;

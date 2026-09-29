import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireCompany, CompanyScopedRequest } from '../middleware/company.js';
import prisma from '../prisma.js';

const router = Router();
router.use(requireAuth);
router.use(requireCompany);

// Standard Indian GSTIN Regex: 2 digits (State), 5 alpha (PAN), 4 digits (PAN), 1 alpha (PAN), 1 alpha-num (Entity), 'Z', 1 alpha-num (Checksum)
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
 * Intelligent GSTIN verification and autofill proxy
 */
router.post('/lookup', async (req: CompanyScopedRequest, res: Response) => {
  const companyId = req.company!.id;
  const { gstin } = req.body;

  if (!gstin || typeof gstin !== 'string') {
    res.status(400).json({ error: 'GSTIN is required' });
    return;
  }

  const cleanGstin = gstin.trim().toUpperCase();

  if (!GSTIN_REGEX.test(cleanGstin)) {
    res.status(400).json({
      error: 'Invalid GSTIN format. Must be a 15-character alphanumeric code (e.g., 09AOAPV7912G1ZO)'
    });
    return;
  }

  const stateCode = cleanGstin.substring(0, 2);
  const stateName = GST_STATE_CODES[stateCode] || 'OTHER';
  const pan = cleanGstin.substring(2, 12);

  try {
    // 1. Check if party already exists in database (Local Cache -> ₹0 cost, 0ms latency)
    const existingParty = await prisma.party.findFirst({
      where: {
        companyId,
        gstin: cleanGstin
      }
    });

    if (existingParty) {
      res.json({
        source: 'DATABASE_CACHE',
        data: {
          gstin: existingParty.gstin,
          legalName: existingParty.name,
          tradeName: existingParty.name,
          address: existingParty.address || '',
          city: existingParty.station || '',
          state: existingParty.state || stateName,
          pincode: existingParty.pincode || '',
          stateCode,
          pan,
          status: 'Active',
          taxpayerType: 'Regular',
          phone: existingParty.mobile || existingParty.phone || '',
          email: existingParty.email || '',
          dlNumber: existingParty.drugLicenseNo || ''
        }
      });
      return;
    }

    // 2. Check for Third-party Live GSP API configuration (e.g. Sandbox.co.in)
    const apiKey = process.env.SANDBOX_API_KEY || process.env.GSP_API_KEY;
    const apiSecret = process.env.SANDBOX_API_SECRET || process.env.GSP_API_SECRET;

    if (apiKey && apiSecret) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);

        // Fetch auth token
        const authRes = await fetch('https://api.sandbox.co.in/authenticate', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'x-api-secret': apiSecret,
            'x-api-version': '1.0'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (authRes.ok) {
          const authData = await authRes.json() as any;
          const token = authData.access_token;

          const gstController = new AbortController();
          const gstTimeoutId = setTimeout(() => gstController.abort(), 7000);

          const gstRes = await fetch(`https://api.sandbox.co.in/gsp/public/gstin/${cleanGstin}`, {
            headers: {
              'Authorization': token,
              'x-api-key': apiKey,
              'x-api-version': '1.0'
            },
            signal: gstController.signal
          });

          clearTimeout(gstTimeoutId);

          if (gstRes.ok) {
            const rawGstData = await gstRes.json() as any;
            const payload = rawGstData.data || {};
            const addr = payload.principal_place_of_business_fields || {};

            const cleanAddress = addr.complete_address || [
              addr.building_name,
              addr.building_number,
              addr.street,
              addr.locality
            ].filter(Boolean).join(', ');

            res.json({
              source: 'GOVERNMENT_GSP_LIVE',
              data: {
                gstin: cleanGstin,
                legalName: payload.legal_name_of_business || payload.trade_name || '',
                tradeName: payload.trade_name || payload.legal_name_of_business || '',
                address: cleanAddress || '',
                city: addr.district || addr.city || addr.locality || '',
                state: addr.state || stateName,
                pincode: addr.pincode || '',
                stateCode,
                pan,
                status: payload.gstin_status || 'Active',
                taxpayerType: payload.taxpayer_type || 'Regular',
                registrationDate: payload.registration_date || ''
              }
            });
            return;
          }
        }
      } catch (gspErr) {
        console.warn('Live GSP query timed out or failed, falling back to smart offline parser:', gspErr);
      }
    }

    // 3. Smart Instant Offline Parser (100% Free & Guarantees Zero Failure)
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
        note: `Decoded jurisdiction: ${stateName} (State Code: ${stateCode}), PAN: ${pan}`
      }
    });
  } catch (error: any) {
    console.error('GST Lookup Route Error:', error);
    res.status(500).json({ error: error.message || 'Failed to process GSTIN lookup' });
  }
});

export default router;

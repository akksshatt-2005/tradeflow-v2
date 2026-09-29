import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireCompany, CompanyScopedRequest } from '../middleware/company.js';
import prisma from '../prisma.js';

const router = Router();
router.use(requireAuth);
router.use(requireCompany);

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
              gstPayload = resJson.data || resJson;
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

export default router;

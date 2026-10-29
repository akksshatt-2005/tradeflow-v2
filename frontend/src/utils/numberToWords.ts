/**
 * Indian Rupee Number to Words & Currency Utilities
 * Formats numbers according to Indian numbering system (Lakhs, Crores)
 * and generates official "Amount In Words" strings for GST Tax Invoices.
 */

const singleDigits = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertLessThanOneThousand(n: number): string {
  let str = '';
  if (n >= 100) {
    str += singleDigits[Math.floor(n / 100)] + ' Hundred ';
    n %= 100;
  }
  if (n >= 10 && n <= 19) {
    str += teens[n - 10] + ' ';
  } else if (n >= 20) {
    str += tens[Math.floor(n / 10)] + ' ';
    if (n % 10 > 0) {
      str += singleDigits[n % 10] + ' ';
    }
  } else if (n > 0) {
    str += singleDigits[n] + ' ';
  }
  return str.trim();
}

/**
 * Converts a numeric amount to formal Indian Currency words.
 * E.g. 241 -> "INR Two Hundred Forty One Only"
 * E.g. 1220110.50 -> "INR Twelve Lakh Twenty Thousand One Hundred Ten and Fifty Paise Only"
 */
export function numberToIndianWords(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num) || num === 0) return 'INR Zero Only';

  const absNum = Math.abs(num);
  const integerPart = Math.floor(absNum);
  const decimalPart = Math.round((absNum - integerPart) * 100);

  let words = '';

  const crore = Math.floor(integerPart / 10000000);
  let remainder = integerPart % 10000000;
  const lakh = Math.floor(remainder / 100000);
  remainder = remainder % 100000;
  const thousand = Math.floor(remainder / 1000);
  remainder = remainder % 1000;
  const hundreds = remainder;

  if (crore > 0) {
    words += convertLessThanOneThousand(crore) + ' Crore ';
  }
  if (lakh > 0) {
    words += convertLessThanOneThousand(lakh) + ' Lakh ';
  }
  if (thousand > 0) {
    words += convertLessThanOneThousand(thousand) + ' Thousand ';
  }
  if (hundreds > 0) {
    words += convertLessThanOneThousand(hundreds) + ' ';
  }

  words = words.trim();
  if (!words) words = 'Zero';

  let result = `INR ${words}`;
  if (decimalPart > 0) {
    result += ` and ${convertLessThanOneThousand(decimalPart)} Paise`;
  }
  result += ' Only';

  return result;
}

/**
 * Standard Indian State to 2-digit GST State Code mapping
 */
export const GST_STATE_CODE_MAP: Record<string, string> = {
  'JAMMU AND KASHMIR': '01',
  'HIMACHAL PRADESH': '02',
  'PUNJAB': '03',
  'CHANDIGARH': '04',
  'UTTARAKHAND': '05',
  'HARYANA': '06',
  'DELHI': '07',
  'RAJASTHAN': '08',
  'UTTAR PRADESH': '09',
  'BIHAR': '10',
  'SIKKIM': '11',
  'ARUNACHAL PRADESH': '12',
  'NAGALAND': '13',
  'MANIPUR': '14',
  'MIZORAM': '15',
  'TRIPURA': '16',
  'MEGHALAYA': '17',
  'ASSAM': '18',
  'WEST BENGAL': '19',
  'JHARKHAND': '20',
  'ODISHA': '21',
  'CHHATTISGARH': '22',
  'MADHYA PRADESH': '23',
  'GUJARAT': '24',
  'DADRA AND NAGAR HAVELI AND DAMAN AND DIU': '26',
  'MAHARASHTRA': '27',
  'ANDHRA PRADESH': '28',
  'KARNATAKA': '29',
  'GOA': '30',
  'LAKSHADWEEP': '31',
  'KERALA': '32',
  'TAMIL NADU': '33',
  'PUDUCHERRY': '34',
  'ANDAMAN AND NICOBAR ISLANDS': '35',
  'TELANGANA': '36',
  'LADAKH': '38'
};

/**
 * Normalizes Indian state spelling (e.g. UTTAR PRADES -> UTTAR PRADESH)
 * and resolves its official 2-digit GST state code.
 */
export function normalizeIndianState(rawState?: string | null, rawGstin?: string | null): { stateName: string; stateCode: string } {
  // If a genuine 15-character GSTIN is provided (not dummy with XXXX), use its 2-digit code
  const cleanGstin = rawGstin ? rawGstin.trim().toUpperCase() : '';
  let gstinCode: string | null = null;
  if (cleanGstin.length >= 2 && !cleanGstin.includes('XXXX') && !cleanGstin.includes('URP')) {
    const prefix = cleanGstin.substring(0, 2);
    if (/^\d{2}$/.test(prefix)) {
      gstinCode = prefix;
    }
  }

  const raw = (rawState || '').trim().toUpperCase().replace(/[^A-Z\s]/g, '');

  // 1. Common spelling typos and abbreviations
  if (raw.includes('UTTAR') || raw === 'UP' || raw.includes('PRADES') || raw === 'UTTER PRADESH') {
    return { stateName: 'UTTAR PRADESH', stateCode: gstinCode || '09' };
  }
  if (raw.includes('MADHYA') || raw === 'MP') {
    return { stateName: 'MADHYA PRADESH', stateCode: gstinCode || '23' };
  }
  if (raw.includes('DELHI') || raw === 'DL') {
    return { stateName: 'DELHI', stateCode: gstinCode || '07' };
  }
  if (raw.includes('MAHARASHTRA') || raw === 'MH') {
    return { stateName: 'MAHARASHTRA', stateCode: gstinCode || '27' };
  }
  if (raw.includes('HARYANA') || raw === 'HR') {
    return { stateName: 'HARYANA', stateCode: gstinCode || '06' };
  }
  if (raw.includes('RAJASTHAN') || raw === 'RJ') {
    return { stateName: 'RAJASTHAN', stateCode: gstinCode || '08' };
  }
  if (raw.includes('BIHAR') || raw === 'BR') {
    return { stateName: 'BIHAR', stateCode: gstinCode || '10' };
  }
  if (raw.includes('PUNJAB') || raw === 'PB') {
    return { stateName: 'PUNJAB', stateCode: gstinCode || '03' };
  }
  if (raw.includes('GUJARAT') || raw === 'GJ') {
    return { stateName: 'GUJARAT', stateCode: gstinCode || '24' };
  }
  if (raw.includes('KARNATAKA') || raw === 'KA') {
    return { stateName: 'KARNATAKA', stateCode: gstinCode || '29' };
  }
  if (raw.includes('TAMIL') || raw === 'TN') {
    return { stateName: 'TAMIL NADU', stateCode: gstinCode || '33' };
  }
  if (raw.includes('BENGAL') || raw === 'WB') {
    return { stateName: 'WEST BENGAL', stateCode: gstinCode || '19' };
  }

  // 2. Exact match in official map
  if (GST_STATE_CODE_MAP[raw]) {
    return { stateName: raw, stateCode: gstinCode || GST_STATE_CODE_MAP[raw] };
  }

  // 3. Partial match in official map
  for (const [key, code] of Object.entries(GST_STATE_CODE_MAP)) {
    if (raw.includes(key) || key.includes(raw)) {
      return { stateName: key, stateCode: gstinCode || code };
    }
  }

  // 4. Fallback to GSTIN code if valid, or default to Uttar Pradesh
  if (gstinCode) {
    for (const [key, code] of Object.entries(GST_STATE_CODE_MAP)) {
      if (code === gstinCode) {
        return { stateName: key, stateCode: gstinCode };
      }
    }
  }

  return { stateName: 'UTTAR PRADESH', stateCode: '09' };
}

/**
 * Extract or lookup 2-digit GST State Code from GSTIN or state name
 */
export function resolveStateCode(stateName?: string | null, gstin?: string | null): string {
  return normalizeIndianState(stateName, gstin).stateCode;
}


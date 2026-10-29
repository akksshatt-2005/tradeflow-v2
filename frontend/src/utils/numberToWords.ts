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
 * Extract or lookup 2-digit GST State Code from GSTIN or state name
 */
export function resolveStateCode(stateName?: string | null, gstin?: string | null): string {
  if (gstin && gstin.trim().length >= 2) {
    const prefix = gstin.trim().substring(0, 2);
    if (/^\d{2}$/.test(prefix)) {
      return prefix;
    }
  }

  if (stateName && stateName.trim()) {
    const normalized = stateName.trim().toUpperCase();
    if (GST_STATE_CODE_MAP[normalized]) {
      return GST_STATE_CODE_MAP[normalized];
    }
    // Partial search
    for (const [key, code] of Object.entries(GST_STATE_CODE_MAP)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return code;
      }
    }
  }

  return '09'; // Default UP/India standard fallback
}

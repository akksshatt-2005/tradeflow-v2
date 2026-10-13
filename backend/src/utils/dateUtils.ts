/**
 * Backend Date Utilities for Indian Standard Time (IST, UTC+05:30)
 * Ensures that date filters and record timestamps properly match
 * the business calendar day in India regardless of server UTC timezone.
 */

const IST_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/**
 * Returns today's date string in YYYY-MM-DD for IST (Asia/Kolkata).
 */
export function getTodayISTDateString(): string {
  return IST_DATE_FORMATTER.format(new Date());
}

/**
 * Parses a query filter start date string (e.g. "2026-10-14")
 * into a Date object representing 00:00:00.000 IST (UTC: 18:30 of previous day).
 */
export function parseFilterStartDate(dateStr?: string | null): Date | undefined {
  if (!dateStr || typeof dateStr !== 'string') return undefined;
  const trimmed = dateStr.trim();
  if (!trimmed) return undefined;

  // If date-only format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00.000+05:30`);
  }

  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Parses a query filter end date string (e.g. "2026-10-14")
 * into a Date object representing 23:59:59.999 IST (UTC: 18:29:59.999 of same day).
 */
export function parseFilterEndDate(dateStr?: string | null): Date | undefined {
  if (!dateStr || typeof dateStr !== 'string') return undefined;
  const trimmed = dateStr.trim();
  if (!trimmed) return undefined;

  // If date-only format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T23:59:59.999+05:30`);
  }

  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Parses a date passed when creating or updating an invoice or purchase.
 * If the input is today's IST date or not provided, returns current exact timestamp (now).
 * If the user explicitly passed a backdated or future date (YYYY-MM-DD), sets it to midday IST.
 * If an ISO timestamp with time is provided, uses that timestamp.
 */
export function parseRecordDate(inputDate?: string | Date | null, fallbackDate: Date = new Date()): Date {
  if (!inputDate) return fallbackDate;
  if (inputDate instanceof Date) return isNaN(inputDate.getTime()) ? fallbackDate : inputDate;

  const str = String(inputDate).trim();
  if (!str) return fallbackDate;

  // If contains time part (e.g. ISO string with T or space)
  if (str.includes('T') || str.includes(' ')) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? fallbackDate : d;
  }

  // If date-only YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const todayIST = getTodayISTDateString();
    if (str === todayIST) {
      // If it's today in India, keep the current exact time of sale
      return new Date();
    }
    // Explicit past or future date: set to 12:00:00 IST to avoid midnight boundary shifts
    return new Date(`${str}T12:00:00.000+05:30`);
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? fallbackDate : d;
}

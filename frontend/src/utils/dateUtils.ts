/**
 * Date utilities for Trade Flow / PharmaFlow
 * Ensures dates are consistently handled in local calendar time (IST / user's timezone)
 * instead of raw UTC toISOString().split('T')[0] which produces previous-day dates after midnight.
 */

/**
 * Returns YYYY-MM-DD in the user's local timezone.
 * Defaults to current local date.
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date string or object to Indian localized display (DD/MM/YYYY)
 */
export function formatLocalDate(dateStrOrObj?: string | Date | null): string {
  if (!dateStrOrObj) return '-';
  const d = typeof dateStrOrObj === 'string' ? new Date(dateStrOrObj) : dateStrOrObj;
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

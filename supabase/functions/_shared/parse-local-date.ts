/**
 * Calendar YYYY-MM-DD helpers — same semantics as src/lib/dateUtils.ts.
 * Keep in sync when changing parsing rules.
 */

export function parseLocalDate(iso: string): Date {
  const s = String(iso ?? '').trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return new Date(Number.NaN);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mo - 1, d, 12, 0, 0, 0);
}

export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday YYYY-MM-DD of the calendar week containing this date-only string */
export function mondayOfCalendarYmd(iso: string): string {
  const dt = parseLocalDate(iso);
  const day = dt.getDay();
  dt.setDate(dt.getDate() - ((day + 6) % 7));
  return formatLocalDate(dt);
}

/** Monday YYYY-MM-DD for the runtime's current calendar week (edge: server TZ) */
export function mondayOfToday(): string {
  const t = new Date();
  const mid = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12, 0, 0, 0);
  return mondayOfCalendarYmd(formatLocalDate(mid));
}

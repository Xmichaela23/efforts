/**
 * THE COLLAPSED SPORT LINE — leads with the CHANGE, not the level (2026-09-01, Round 3).
 *
 * ⛔ ONE LINE PER SPORT, and it states what MOVED: "deadlift 185, up from 180" / "pace per heartbeat
 * up 4% since Jul". The raw level lives in the expanded detail. Pure functions so the wording is
 * pinned by fixtures and the confidence rule is enforced in one place.
 *
 * ⛔ THE CONFIDENCE RULE: a direction WORD appears only where the verdict supports one. `improving` →
 * "up", `sliding` → "down"; `holding` / `needs_data` / `withheld` / anything else → no direction, and
 * the line falls back to the count. Never invent a direction from a raw percentage.
 * ⚠️ "since {month}" is the START of the SAME window the percentage is measured over (asOf − windowDays),
 * so the number and the month can't describe different spans.
 */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Month name at the start of the verdict window — asOf minus windowDays. Empty if unknown. */
export function changeMonth(asOf: string | null | undefined, windowDays: number | null | undefined): string {
  if (!asOf || !(Number(windowDays) > 0)) return '';
  const t = Date.parse(`${String(asOf).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(t)) return '';
  const d = new Date(t - Number(windowDays) * 86_400_000);
  return MON[d.getUTCMonth()] ?? '';
}

/** The direction word the verdict supports, or '' when it supports none (confidence rule). */
export function dirWord(verdict: string | null | undefined): 'up' | 'down' | '' {
  if (verdict === 'improving') return 'up';
  if (verdict === 'sliding') return 'down';
  return '';
}

/**
 * An efficiency-style change line: "{label} up 4% since Jul" when the verdict calls a direction;
 * otherwise the honest fallback "{label} · N {noun}s" (number/count, no claim).
 */
export function efficiencySummary(args: {
  label: string;
  verdict: string | null | undefined;
  pctChange: number | null | undefined;
  sampleCount: number | null | undefined;
  asOf: string | null | undefined;
  windowDays: number | null | undefined;
  noun: string; // "run" / "ride"
}): string {
  const dir = dirWord(args.verdict);
  const n = Number(args.sampleCount) || 0;
  if (dir && args.pctChange != null && Number.isFinite(args.pctChange)) {
    const pct = Math.abs(Math.round(args.pctChange));
    const month = changeMonth(args.asOf, args.windowDays);
    return `${args.label} ${dir} ${pct}%${month ? ` since ${month}` : ''}`;
  }
  return `${args.label} · ${n} ${args.noun}${n === 1 ? '' : 's'}`;
}

/**
 * The strength lead: "{lift} {latest}, up from {prior}". No verdict word — the per-lift direction is
 * retired (D-420); this is two measured numbers. Equal → just the number.
 */
export function strengthSummary(name: string, latest: number | null | undefined, prior: number | null | undefined): string {
  const L = latest != null ? Math.round(latest) : null;
  if (L == null) return name;
  const P = prior != null ? Math.round(prior) : null;
  if (P == null || P === L) return `${name} ${L}`;
  return `${name} ${L}, ${L > P ? 'up' : 'down'} from ${P}`;
}

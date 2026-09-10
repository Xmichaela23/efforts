/**
 * ⛔ THE LOAD PLATE'S DERIVED NUMBERS AND WORDS, DECIDED HERE (audit 2026-09-10, H-T21 and H-B08).
 *
 * WHAT THIS REPLACED — all of it ran on the phone, off fields this payload already sent:
 *   · `LoadBar.tsx` summed the seven days of `daily_load_7d` per sport, rounded the shares to 100%,
 *     picked the dominant sport and printed "N pts · last 7 days";
 *   · `LoadBar.tsx` ran Friel's form zone word itself and hard-coded the zone table's ranges;
 *   · `StateTab.tsx` built "Form −32 — high risk (TrainingPeaks)" off the form number, in every week;
 *   · Today ran the zone word beside "form −21".
 * The arithmetic and the words are moved unchanged. The screens print them.
 */
import { formZone, type FormZone } from '../_shared/fitness-fatigue.ts';

type DailyLoad = { date: string; load: number; dominant_type: string; by_type?: Array<{ type: string; load: number }> };

export interface LoadCompositionRow {
  discipline: string;
  /** Workload points in the rolling seven days. The bar's segment widths are proportional to this. */
  load: number;
  /** The printed share, whole percent; the rows sum to exactly 100 (largest remainder). */
  share_pct: number;
}

/**
 * The rolling seven days' load by sport — the SAME window as `daily_load_7d` (not week-to-date).
 * A day with no per-sport breakdown counts under its dominant type.
 */
export function loadComposition7d(daily: ReadonlyArray<DailyLoad> | null | undefined): {
  total_7d: number;
  dominant: string | null;
  composition_7d: LoadCompositionRow[];
} {
  const byDiscipline = new Map<string, number>();
  for (const d of daily ?? []) {
    const segs = d.by_type && d.by_type.length > 0
      ? d.by_type
      : (d.load > 0 ? [{ type: d.dominant_type, load: d.load }] : []);
    for (const s of segs) {
      const t = (s.type || '').toLowerCase();
      if (!t || t === 'none' || !(s.load > 0)) continue;
      byDiscipline.set(t, (byDiscipline.get(t) ?? 0) + s.load);
    }
  }
  const total = [...byDiscipline.values()].reduce((a, b) => a + b, 0);
  const rawComp = [...byDiscipline.entries()]
    .map(([type, l]) => ({ type, load: l, pct: total > 0 ? (l / total) * 100 : 0 }))
    .sort((a, b) => b.load - a.load);
  // LARGEST-REMAINDER rounding, so the printed shares sum to EXACTLY 100 — rounding each on its own can
  // total 99 or 101 (42+24+21+12 = 99).
  const targetSum = total > 0 ? 100 : 0;
  const comp = rawComp.map((c) => ({ ...c, displayPct: Math.floor(c.pct) }));
  let leftover = targetSum - comp.reduce((a, c) => a + c.displayPct, 0);
  for (const c of [...comp].sort((a, b) => (b.pct % 1) - (a.pct % 1))) {
    if (leftover <= 0) break;
    c.displayPct += 1;
    leftover -= 1;
  }
  return {
    total_7d: total,
    dominant: comp[0]?.type ?? null,
    composition_7d: comp.map((c) => ({ discipline: c.type, load: c.load, share_pct: c.displayPct })),
  };
}

/**
 * FIELD — Friel, "Managing Training Using TSB", as the TrainingPeaks PMC legend reproduces it
 * (docs/STATE-SOURCES.md, "Form zone word"). The table the load key prints, word for word; `word` is
 * `formZone`'s output for that band, and `form-zone` tests pin every row against it.
 */
export const FORM_ZONE_TABLE: ReadonlyArray<{ range: string; word: FormZone; meaning: string }> = [
  { range: 'above +25', word: 'transitional', meaning: 'fitness fading' },
  { range: '+5 to +25', word: 'fresh', meaning: 'race shape' },
  { range: '−10 to +5', word: 'grey zone', meaning: 'not building, not sharp' },
  { range: '−30 to −10', word: 'optimal', meaning: 'building' },
  { range: 'below −30', word: 'high risk', meaning: '' },
];

export function formZoneRows(form: number | null | undefined): Array<{ range: string; word: FormZone; meaning: string; current: boolean }> {
  const zone = formZone(form);
  return FORM_ZONE_TABLE.map((r) => ({ ...r, current: zone === r.word }));
}

/** The coach's form sentence — the one `training_state.kicker` prints. */
export function formKicker(form: number, zoneWord: string): string {
  return `Form ${form > 0 ? '+' : ''}${Math.round(form)} — ${zoneWord} (TrainingPeaks)`;
}

/** The coach's recovery wording — the one `training_state.kicker` prints on a recovery or taper week. */
export function recoveryKicker(intentLabel: string): string {
  return `Recovery • ${intentLabel}`;
}

export const isRecoveryIntent = (weekIntent: string | null | undefined) => weekIntent === 'recovery' || weekIntent === 'taper';

/**
 * ⛔ STATE'S GLANCE HEADLINE. It speaks only when form is in Friel's high-risk zone (under −30), and then
 * it is always "Form −32 · high risk" — in a recovery or taper week too (Michael, 2026-09-10). Form below
 * −30 is the warning whatever the week was meant to be, so the coach's "Recovery • …" wording does not
 * replace it here. Null = the header prints nothing.
 * ⚠️ NO "(TrainingPeaks)" ON THE SCREEN. The source is in docs/STATE-SOURCES.md ("Form zone word"), not in
 * the line. The minus is a real minus sign; the number is always negative here.
 */
export function formHeadline(form: number | null | undefined): string | null {
  if (form == null || !Number.isFinite(form) || formZone(form) !== 'high risk') return null;
  return `Form −${Math.abs(Math.round(form))} · high risk`;
}

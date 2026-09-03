/**
 * READING THE SERVER'S PREVIEW WEEK ON THE "YOUR WEEK" CARD (2026-09-03).
 *
 * ⛔ THE PLACED WEEK IS THE SERVER'S, AND IT IS READ BY TAG, NEVER BY NAME. The card used to find a
 * placed hard session with a name regex (Hard|Hill|Threshold|Intervals|Repeat|Club). "Anaerobic
 * Ride" matched nothing, so the hard-ride chip fell back to the phone's own solver and said Mon
 * about a session the plan had put on Tue — on Michael's screen, 2026-09-03. Every session the
 * composer emits carries `family:<id>` (session-vocabulary.ts), and the hard families are a fixed
 * set. Identify by that. If a tag is missing, the bug is at the source, not a second name list here.
 *
 * ⚠️ PURE, so it is testable without React. The card calls these with its preview and its slots.
 */
import type { DayName } from './non-race-goal-seeds';

export type PreviewSessionLite = {
  day?: string;
  name?: string;
  type?: string;
  tags?: string[];
};

/** The four hard endurance families the frames prescribe (sport-slots.ts RIDE_EQUIVALENT). */
export const HARD_FAMILIES: ReadonlySet<string> = new Set([
  'run_mlss', 'run_near_threshold', 'ride_anaerobic', 'ride_sweet_spot',
]);
/** The top-end pair; the other two are sustained threshold. */
const TOP_END_FAMILIES: ReadonlySet<string> = new Set(['run_mlss', 'ride_anaerobic']);

export function familyOf(s: PreviewSessionLite): string {
  return (s.tags ?? []).find((t) => t.startsWith('family:'))?.slice('family:'.length) ?? '';
}

export function isHardPreviewSession(s: PreviewSessionLite): boolean {
  return HARD_FAMILIES.has(familyOf(s));
}

/** "top-end" for MLSS / anaerobic, "threshold" for near-threshold / sweet spot, null otherwise. */
export function hardIntensityOf(family: string): 'top-end' | 'threshold' | null {
  if (!HARD_FAMILIES.has(family)) return null;
  return TOP_END_FAMILIES.has(family) ? 'top-end' : 'threshold';
}

/**
 * The nth hard session of each sport in the preview, matched to the nth wizard slot of that
 * discipline — the same pairing the card has always used; only the identification changed.
 */
export function placedHardSessions(
  preview: PreviewSessionLite[] | null | undefined,
  slots: ReadonlyArray<{ discipline: 'run' | 'bike' }>,
): Array<PreviewSessionLite | undefined> {
  const bySport: Record<'run' | 'bike', PreviewSessionLite[]> = { run: [], bike: [] };
  for (const s of preview ?? []) {
    if (!isHardPreviewSession(s)) continue;
    const t = String(s.type ?? '');
    if (t === 'run') bySport.run.push(s);
    else if (t === 'ride') bySport.bike.push(s);
  }
  const seen: Record<'run' | 'bike', number> = { run: 0, bike: 0 };
  return slots.map((h) => bySport[h.discipline][seen[h.discipline]++]);
}

export function placedHardDays(
  preview: PreviewSessionLite[] | null | undefined,
  slots: ReadonlyArray<{ discipline: 'run' | 'bike' }>,
): Array<DayName | undefined> {
  return placedHardSessions(preview, slots).map((s) => {
    const d = String(s?.day ?? '').toLowerCase();
    return (d || undefined) as DayName | undefined;
  });
}

/**
 * The conflict rules the plan builder reports as `placement_compromises[].rule`. These are the
 * "High fatigue risk" line; every other compromise is a trade-off note.
 */
export const CONFLICT_RULES: ReadonlySet<string> = new Set([
  'hard_with_heavy_legs', 'long_after_heavy_legs', 'heavy_legs_after_long',
  'hard_on_speed_leg_day', 'two_hard_one_day', 'no_rest_day',
]);

export type PreviewCompromise = { kind?: string; text: string; rule?: string; days?: string[] };

export function conflictsOf(compromises: ReadonlyArray<PreviewCompromise>): PreviewCompromise[] {
  return compromises.filter((c) => !!c.rule && CONFLICT_RULES.has(c.rule));
}

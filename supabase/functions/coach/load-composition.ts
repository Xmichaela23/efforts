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
import { formZone, formZoneText, FORM_ZONE_TEXT, type FormZone } from '../_shared/fitness-fatigue.ts';

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
    // ⛔ ROUNDED HERE (2026-09-15, Stage 4 session 2). The week-mix legend printed `Math.round` of this
    // on the phone; the sum of per-session workload points is a whole number on screen wherever it is
    // shown, so it is a whole number on the payload.
    total_7d: Math.round(total),
    dominant: comp[0]?.type ?? null,
    composition_7d: comp.map((c) => ({ discipline: c.type, load: c.load, share_pct: c.displayPct })),
  };
}

/**
 * FIELD — Friel, "Managing Training Using TSB" (docs/STATE-SOURCES.md, "Form zone word"). The table the load key
 * prints: the range and the zone's ONE on-screen name (`FORM_ZONE_TEXT`, approved by Michael 2026-09-26 — it replaced
 * a second column of Friel's zone words). `word` is `formZone`'s key for that band; `form-zone` tests pin every row.
 */
export const FORM_ZONE_TABLE: ReadonlyArray<{ range: string; word: FormZone; meaning: string }> = [
  { range: 'above +25', word: 'transitional', meaning: FORM_ZONE_TEXT['transitional'] },
  { range: '+5 to +25', word: 'fresh', meaning: FORM_ZONE_TEXT['fresh'] },
  { range: '−10 to +5', word: 'grey zone', meaning: FORM_ZONE_TEXT['grey zone'] },
  { range: '−30 to −10', word: 'optimal', meaning: FORM_ZONE_TEXT['optimal'] },
  { range: 'below −30', word: 'high risk', meaning: FORM_ZONE_TEXT['high risk'] },
];

/**
 * ⛔ THE LOAD KEY, APPROVED BY MICHAEL 2026-09-26, VERBATIM — the ⓘ on State's LOAD card and on Today's form line.
 * It replaced the 2026-09-21 paragraph ("Every workout gets a score…"), which explained the numbers with other
 * numbers. It starts from what goes in (time and effort, measured by the athlete's own devices), then says what each
 * reading means. FIELD: TrainingPeaks' Performance Management Chart (TSS; fitness = 42-day, fatigue = 7-day, form =
 * the difference), worded as TrainingPeaks and Strava describe the three to athletes. Each title carries the
 * athlete's own reading (the card's `display` values); `chart` prints only where the chart is (State).
 */
export const FORM_KEY_HEADING = 'Where these numbers come from';
export const FORM_KEY_LEAD =
  'Every workout counts two things: how long you trained and how hard you worked. Your power meter measures how hard '
  + 'on rides, your heart rate on runs, and on lifts, how hard you said it felt. Hard minutes count for more than easy ones.';
export const FORM_KEY_FITNESS =
  'Your training over the last 6 weeks. It rises slowly while you keep training and falls slowly when you stop.';
export const FORM_KEY_FATIGUE =
  'Your training over the last 7 days. It rises fast after hard days and falls fast with rest.';
export const FORM_KEY_FORM =
  "Your last week compared with your last 6 weeks. Below zero, you've trained more than usual and are carrying "
  + "tiredness. Above zero, you're rested.";
export const FORM_KEY_CHART = 'The chart shows each number day by day over the last 12 weeks.';

export type FormKeyText = {
  heading: string;
  lead: string;
  items: Array<{ title: string; text: string }>;
  chart: string;
};

/** The key's words with the athlete's readings in the titles ("Fitness 54"); a missing reading prints the word alone. */
export function formKeyText(readings: { fitness: string | null; fatigue: string | null; form: string | null }): FormKeyText {
  const title = (word: string, value: string | null) => (value ? `${word} ${value}` : word);
  return {
    heading: FORM_KEY_HEADING,
    lead: FORM_KEY_LEAD,
    items: [
      { title: title('Fitness', readings.fitness), text: FORM_KEY_FITNESS },
      { title: title('Fatigue', readings.fatigue), text: FORM_KEY_FATIGUE },
      { title: title('Form', readings.form), text: FORM_KEY_FORM },
    ],
    chart: FORM_KEY_CHART,
  };
}

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
 * it is always "Form −32 · injury and illness risk rises" (the zone's one name since 2026-09-26; was "· high risk") — in a recovery or taper week too (Michael, 2026-09-10). Form below
 * −30 is the warning whatever the week was meant to be, so the coach's "Recovery • …" wording does not
 * replace it here. Null = the header prints nothing.
 * ⚠️ NO "(TrainingPeaks)" ON THE SCREEN. The source is in docs/STATE-SOURCES.md ("Form zone word"), not in
 * the line. The minus is a real minus sign; the number is always negative here.
 */
export function formHeadline(form: number | null | undefined): string | null {
  if (form == null || !Number.isFinite(form) || formZone(form) !== 'high risk') return null;
  return `Form −${Math.abs(Math.round(form))} · ${formZoneText(form)}`; // the zone's one name (FORM_ZONE_TEXT, 2026-09-26)
}

/**
 * ⛔ THE LOAD CHART'S CAPTIONS (2026-09-25) — "fitness over 12 weeks: 42 → 57", one per line drawn.
 * TrainingPeaks' Performance Management Chart draws the daily values themselves, with no fitted line, so each
 * caption reads the window's ACTUAL first and last day, through the SAME rounders the card prints its readings
 * with (`whole` for fitness and fatigue, `signed` for form — the coach passes its own). The last number is the
 * card's number, always.
 * N is the span as every State chart counts it (`state-trend/trend-fit.ts`: first day to last, in weeks, rounded
 * up); the 84-day window keeps it at 12 or under.
 * ⚠️ A ONE-WEEK SPAN (2 to 8 days of history) GETS NO CAPTION: "over 1 week" needs the word "week", which is not
 * approved. The chart still draws. Fewer than 2 days: no line, no caption.
 */
export function loadChartCaptions(
  days: ReadonlyArray<{ fitness: number; fatigue: number; form: number }>,
  fmt: { whole: (v: number | null | undefined) => string | null; signed: (v: number | null | undefined) => string | null },
): { fitness: string | null; fatigue: string | null; form: string | null } {
  const first = days[0];
  const last = days[days.length - 1];
  // FIELD — definition: a week is 7 days; two points are the fewest that make a line.
  const spanWeeks = days.length >= 2 ? Math.max(1, Math.ceil((days.length - 1) / 7)) : null;
  const caption = (word: string, from: string | null, to: string | null): string | null =>
    (spanWeeks != null && spanWeeks > 1 && from != null && to != null ? `${word} over ${spanWeeks} weeks: ${from} → ${to}` : null);
  return {
    fitness: caption('fitness', fmt.whole(first?.fitness), fmt.whole(last?.fitness)),
    fatigue: caption('fatigue', fmt.whole(first?.fatigue), fmt.whole(last?.fatigue)),
    form: caption('form', fmt.signed(first?.form), fmt.signed(last?.form)),
  };
}

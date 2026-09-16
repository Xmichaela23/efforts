/**
 * ═══ WAS THIS SESSION STEADY? ONE LADDER, EVERY READER ══════════════════════════════════════════
 *
 * p107 makes cardiac drift *"a general guideline when assessing the maximum recommended dose of
 * easy/VT1 work in a given session"* — a given pace or output held at a given heart rate. A session
 * that has no single pace or output has no drift to read, so the question "was this steady" has to
 * be answered once, the same way, by every screen that prints a drift number or plots one.
 *
 * ⛔ THE ORDER IS MICHAEL'S (2026-09-12), AND IT IS A LADDER: the first rung that can answer wins,
 * and a rung with no data to read is skipped rather than guessed at. Statements about what the
 * session WAS come before inferences from what the recording LOOKS like.
 *
 *   1. THE PLAN'S OWN SESSION TYPE, when the session is linked to one. Easy, long and recovery get
 *      a drift read; tempo, threshold, intervals and anything harder do not.
 *   2. PLANNED STEPS — more than two prescribed steps is an interval session.
 *   3. THE ATHLETE'S OWN TAG. Not built: there is no field for an athlete to say "this was steady"
 *      yet. The input exists so the rung has its place in the order; it is null on every session
 *      today and the ladder falls straight through it.
 *   4. THE PROVIDER'S OWN WORD — Strava's `workout_type` on the activity. Its "workout" value is
 *      the athlete telling Strava this was structured work. Race is NOT read here; the race path
 *      is already decided elsewhere and a race is not a drift question.
 *   5. THE DEVICE'S LAP MARKINGS — warm-up / active / rest, where the recording carries them.
 *   6. THE PACE SWING ACROSS THE MILES. ⚠️ OURS — see the ledger row in `docs/STATE-SOURCES.md`.
 *      Last on purpose: it is the only rung that is an inference from the shape of the data rather
 *      than a statement by the plan, the athlete or the device.
 *   7. THE ANALYSER'S DETECTED STRUCTURE (recovery rows between work), RETAINED rather than
 *      specified. See the note on that rung.
 *
 * ⚠️ A SESSION NOTHING CAN ANSWER FOR IS STEADY. Silence is not evidence of structure, and the
 * alternative — withholding drift from every session the app knows nothing about — blanks the read
 * on exactly the unlinked easy runs it is most useful on.
 */
import { ENDURANCE_CLASS } from '../endurance-library/classification.ts';
import type { FamilyId } from '../endurance-library/types.ts';

export type SteadyRung =
  | 'plan_family'
  | 'plan_words'
  | 'planned_steps'
  | 'athlete_tag'
  | 'provider_workout_type'
  | 'lap_intensity'
  | 'pace_swing'
  | 'detected_rows'
  | 'nothing_said';

export type Steadiness = {
  /** True = a drift number may be read on this session. */
  steady: boolean;
  /** Which rung answered. Carried so a screen, a test or a future session can see the reason. */
  decidedBy: SteadyRung;
};

export type SteadinessInput = {
  /**
   * The planned row this session is attached to, when it is attached — `tags` for the family, and
   * the name and description for a race plan's rows, which carry no family tag.
   */
  plannedRow?: { tags?: unknown; name?: unknown; description?: unknown } | null;
  /** The fact packet, for the planned step count (rung 2). */
  factPacket?: unknown;
  /**
   * RUNG 3's SLOT. Null on every session today — there is no athlete-facing control that writes it.
   * Wire the control to this input and the rung starts deciding; nothing else has to move.
   */
  athleteTag?: 'steady' | 'intervals' | null;
  /** The workout row, for the provider's word (rung 4) and the device's lap markings (rung 5). */
  workoutRow?: unknown;
  /** The rendered interval rows (rung 7). */
  intervals?: Array<{ interval_type?: unknown }>;
};

const lower = (v: unknown) => String(v ?? '').toLowerCase();

/** ⛔ RUNG 1. The plan's family tag is the plan naming the session type outright. */
function planFamilySteady(plannedRow: SteadinessInput['plannedRow']): boolean | null {
  const raw = (plannedRow as { tags?: unknown } | null | undefined)?.tags;
  let tags: unknown[] = [];
  if (Array.isArray(raw)) tags = raw;
  else if (typeof raw === 'string') { try { const p: unknown = JSON.parse(raw); if (Array.isArray(p)) tags = p; } catch { /* not JSON */ } }
  const hit = tags.map(lower).find((t) => t.startsWith('family:'));
  if (!hit) return null;
  const family = hit.slice('family:'.length) as FamilyId;
  const cls = ENDURANCE_CLASS[family];
  if (!cls) return null;
  /**
   * ⛔ `vt1_or_easier` IS THE DRIFT-READ BAND, AND IT IS THE BOOK'S AXIS RATHER THAN A LINE OF OURS.
   * `ENDURANCE_CLASS` already sorts all ten endurance families by where they sit against threshold,
   * each row quoting the page that puts it there. p107 governs easy/VT1 work, so `vt1_or_easier`
   * reads and the other three bands do not.
   * ⚠️ `ride_sweet_spot` IS BAND `below` AND SO GETS NO DRIFT — "as close to threshold as possible
   * without exceeding it", 80-95%, is not easy work however continuous the effort looks.
   * ⚠️ `run_lsd` IS BAND `vt1_or_easier` AND SO DOES GET ONE — the long run is "primarily below
   * VT1" (p235). See the note in compute-snapshot about the long run's fade read, which is a
   * different switch and is not changed by this.
   */
  return cls.band === 'vt1_or_easier';
}

/**
 * ⛔ RUNG 1, SECOND FORM. A race plan's rows carry no family tag, so the plan's own words are the
 * only statement of type it makes. Same two lists `compute-facts classifyRunIntent` reads, which is
 * where the plan's word has been graded since 2026-09-02.
 */
const NONSTEADY_WORDS = /interval|repeat|tempo|threshold|vo2|speed|fartlek|hill|sprint|track|strides|race\s*pace|cruise|surge/i;
const STEADY_WORDS = /easy|recovery|long|lsd|aerobic|base|z2|zone\s*2|steady|shakeout/i;

function planWordsSteady(plannedRow: SteadinessInput['plannedRow']): boolean | null {
  const text = [
    (plannedRow as { name?: unknown } | null | undefined)?.name,
    (plannedRow as { description?: unknown } | null | undefined)?.description,
  ].filter(Boolean).map(String).join(' ');
  if (!text.trim()) return null;
  if (NONSTEADY_WORDS.test(text)) return false;
  if (STEADY_WORDS.test(text)) return true;
  return null;
}

/**
 * ⛔ RUNG 2. More than two prescribed steps is a structured session.
 *
 * ⚠️ IT ONLY EVER ANSWERS "NOT STEADY" (fixed 2026-09-12, caught by the throwaway-account run). It
 * returned `steps <= 2` as a positive verdict of steadiness, and that is not what the rule says: the
 * rule is "more than two planned steps = intervals", which is silent about a low count. The cost was
 * not academic — an UNLINKED session carries `total_steps: 1` as noise from a fact packet built with
 * no plan to read, so rung 2 declared every unplanned session steady and rungs 4, 5 and 6 never ran.
 * An unplanned interval ride that Strava itself labelled a workout came back with a drift number,
 * which is the exact divergence this whole stage exists to close.
 * ⚠️ THE SAME SHAPE AS RUNG 7: evidence of structure is evidence; its absence is not evidence of
 * steadiness. Only rungs 1 and 3 — the plan's own word and the athlete's — may assert steady.
 */
function plannedStepsSteady(factPacket: unknown): boolean | null {
  const fp = (factPacket ?? null) as { derived?: { interval_execution?: { total_steps?: unknown } } } | null;
  const steps = fp?.derived?.interval_execution?.total_steps;
  if (typeof steps !== 'number' || !Number.isFinite(steps)) return null;
  // OURS — `plannedStepsSteady` more than two planned steps reads as intervals; no page, the same cut compute-snapshot uses for the drift line
  return steps > 2 ? false : null;
}

/**
 * ⛔ RUNG 4. Strava's `workout_type`, stored verbatim by `ingest-activity` inside
 * `strava_data.original_activity`. Strava's own values: runs 0 default / 1 race / 2 long run /
 * 3 workout; rides 10 default / 11 race / 12 workout.
 * ⚠️ ONLY "WORKOUT" DECIDES. Race (1, 11) falls through — the race path is decided elsewhere and a
 * race is not a drift question. "Long run" (2) falls through too rather than asserting steadiness:
 * the plan and the athlete are better authorities on that and they are higher up the ladder.
 */
function providerWordSteady(workoutRow: unknown): boolean | null {
  const w = (workoutRow ?? null) as { strava_data?: unknown } | null;
  let sd = w?.strava_data;
  if (typeof sd === 'string') { try { sd = JSON.parse(sd); } catch { return null; } }
  const a = (sd as { original_activity?: Record<string, unknown> } | null)?.original_activity;
  const wt = Number(a?.workout_type);
  if (!Number.isFinite(wt)) return null;
  // FIELD — Strava API `workout_type` values (3 = run workout, 12 = ride workout), a definition
  if (wt === 3 || wt === 12) return false;
  return null;
}

/**
 * ⛔ RUNG 5. The device's own lap intensity markings. `ingest-activity` stores the provider's lap
 * objects verbatim (`laps: activity.laps ?? null`), so a marking the provider sends is already on
 * the row and no importer change is needed to read it — but every existing consumer normalizes laps
 * down to start, end, time and distance and drops the rest, so nothing has read one until now.
 * ⚠️ UNCONFIRMED ON A REAL ROW. Strava's lap objects carry no intensity field at all; whether
 * Garmin's Activity API passes the FIT file's ACTIVE / REST / WARMUP / COOLDOWN through is not
 * settled by anything in this repo. Both field spellings are read and an absent one skips the rung,
 * so this is inert until a recording actually carries it.
 */
function lapIntensitySteady(workoutRow: unknown): boolean | null {
  const w = (workoutRow ?? null) as { laps?: unknown } | null;
  let raw = w?.laps;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return null; } }
  const arr = Array.isArray(raw) ? raw : (Array.isArray((raw as { laps?: unknown } | null)?.laps) ? (raw as { laps: unknown[] }).laps : []);
  // OURS — `lapIntensitySteady` needs two laps and reads rest ≥ 1 with active ≥ 2 as intervals; no page, kept as found
  if (arr.length < 2) return null;
  let rest = 0; let active = 0; let marked = 0;
  for (const L of arr as Array<Record<string, unknown>>) {
    const v = lower(L?.intensity ?? L?.lapIntensity ?? L?.intensityType);
    if (!v) continue;
    marked += 1;
    if (v.includes('rest') || v.includes('recover')) rest += 1;
    else if (v.includes('active') || v.includes('work') || v.includes('interval')) active += 1;
  }
  if (marked === 0) return null;
  return !(rest >= 1 && active >= 2);
}

/**
 * ⛔ RUNG 6. ⚠️ OURS — 75 seconds of swing between the fastest and slowest mile, over at least five
 * miles. Ledger: `docs/STATE-SOURCES.md`. No source gives a figure for "did this session hold one
 * pace"; 75 s is far wider than the swing a steady run shows on hills or in traffic and far narrower
 * than the gap between a rep and its recovery. It is last in the order because it is the only rung
 * that reads the shape of the data rather than a statement about the session.
 */
// OURS — `PACE_SWING_SEC` 75 s over at least five miles (see the block above; STATE-SOURCES session-steadiness.ts row)
export const PACE_SWING_SEC = 75;

function paceSwingSteady(factPacket: unknown): boolean | null {
  const fp = (factPacket ?? null) as { facts?: { segments?: unknown } } | null;
  const segments = Array.isArray(fp?.facts?.segments) ? (fp!.facts!.segments as Array<{ pace_sec_per_mi?: unknown }>) : [];
  const paces = segments
    // OURS — `paceSwingSteady` a mile between 2:00 and 40:00 counts as a real pace, five or more miles needed; no page, kept as found
    .map((s) => { const n = Number(s?.pace_sec_per_mi); return Number.isFinite(n) && n > 120 && n < 2400 ? n : null; })
    .filter((n): n is number => n != null);
  if (paces.length < 5) return null;
  return (Math.max(...paces) - Math.min(...paces)) < PACE_SWING_SEC;
}

/**
 * ⛔ RUNG 7 — RETAINED, NOT SPECIFIED. The analyser's detected structure: rendered rows carrying
 * recoveries between work. This is not one of the six rungs in the 2026-09-12 order; it is the arm
 * `isIntervalSession` has carried since 2026-08, kept at the bottom because deleting it would flip
 * an unplanned interval session the analyser DID detect — but whose pace swing sits under 75 s —
 * from "no drift" back to a drift read, which is the regression the arm was added to stop. It only
 * ever answers "not steady": detected structure is evidence of intervals, and its absence is not
 * evidence of steadiness.
 */
function detectedRowsSteady(intervals: SteadinessInput['intervals']): boolean | null {
  // OURS — `detectedRowsSteady` four or more rows, at least one recovery and two work rows reads as intervals; no page, kept as found
  if (!intervals || intervals.length < 4) return null;
  const rec = intervals.filter((iv) => lower(iv.interval_type) === 'recovery').length;
  const workish = intervals.filter((iv) => { const t = lower(iv.interval_type); return t === 'work' || t === 'warmup'; }).length;
  return rec >= 1 && workish >= 2 ? false : null;
}

export function sessionSteadiness(input: SteadinessInput): Steadiness {
  const fam = planFamilySteady(input.plannedRow);
  if (fam !== null) return { steady: fam, decidedBy: 'plan_family' };

  const words = planWordsSteady(input.plannedRow);
  if (words !== null) return { steady: words, decidedBy: 'plan_words' };

  const steps = plannedStepsSteady(input.factPacket);
  if (steps !== null) return { steady: steps, decidedBy: 'planned_steps' };

  if (input.athleteTag === 'steady') return { steady: true, decidedBy: 'athlete_tag' };
  if (input.athleteTag === 'intervals') return { steady: false, decidedBy: 'athlete_tag' };

  const provider = providerWordSteady(input.workoutRow);
  if (provider !== null) return { steady: provider, decidedBy: 'provider_workout_type' };

  const laps = lapIntensitySteady(input.workoutRow);
  if (laps !== null) return { steady: laps, decidedBy: 'lap_intensity' };

  const swing = paceSwingSteady(input.factPacket);
  if (swing !== null) return { steady: swing, decidedBy: 'pace_swing' };

  const rows = detectedRowsSteady(input.intervals);
  if (rows !== null) return { steady: rows, decidedBy: 'detected_rows' };

  return { steady: true, decidedBy: 'nothing_said' };
}

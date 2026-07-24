// DETERMINISTIC COACH WEEK INSIGHTS COMPOSER (2026-07-19) — the week-level sibling of run-insights /
// bike-insights. Target: replace the LLM `coach.narrative` (the last output-LLM, on State).
//
// WHY: same reasoning as D-304. The insight was never the LLM's — it's the engine's verdicts. At week
// level the LLM's job was selection ("what's worth saying") and phrasing; the selection is a rule set,
// and the phrasing is a template. Neither needs a model.
//
// WHAT IT SAYS (research-grounded, 2026-07-19 — commercial practice + concurrent-training literature):
//   1. WHERE THE WEEK WENT — load share by discipline. Pure arithmetic on the athlete's own data, so it
//      cannot be wrong. No commercial app does this for a hybrid athlete (Intervals.icu excludes strength
//      from fitness BY DESIGN; Garmin's Training Status is run/bike only; Coros documents that its TRIMP
//      model can't score neuromuscular work). This is the differentiator.
//   2. AGAINST THE REFERENCE — with a plan, the delta and its consequence; without one, the athlete's own
//      trailing normal. Adherence and self-comparison are the SAME clause with a swapped yardstick.
//
// WHAT IT REFUSES TO SAY (each of these is a documented failure in a shipped product):
//   - No raw completion tally ("3 of 5 sessions"). Reads as scolding; Runna's model is fact-then-moves-on.
//   - No "you have no plan" / plan-absence as a deficit state. Lowest-value thing in the research ranking;
//     adjacent evidence (BJHP 2025, n=58,881 posts) ties prescriptive framing to shame and disengagement.
//   - No shortage/excess verdict against an ideal the athlete never agreed to. That is the single largest
//     source of resentment in the corpus (Garmin has had to post "Unproductive does not mean we hate you").
//   - No injury-risk claim off a ramp number (ACWR contested as a predictor), and no monotony risk claim
//     (the systematic review is explicit that it is unsupported, and the metric is content-blind — fatal
//     for a hybrid week, where 3 runs + 3 lifts of similar RPE x duration scores as "monotonous").
//   - No claim that interference HAPPENED. The effect on explosive strength (SMD -0.28) is smaller than
//     e1RM's own measurement noise (CV 2.4-9.7%), and the literature says daily 1RM prediction cannot
//     detect fatigue. Scheduling STRUCTURE is sayable (it's recorded exactly); outcome attribution is not.
//
// THRESHOLDS ARE FIELD-STANDARD, NOT HAND-PICKED: the +/-20% band is where TrainingPeaks, Intervals.icu
// and Final Surge independently converged for planned-vs-actual. The 0.8 floor is the conventional ACWR
// under-training line — used here PURELY descriptively ("below your own normal"), never as a risk claim.
//
// VOICE (the app's copy law, enforced structurally): fact first, meaning second; a quant who trains, not
// a coach who encourages; conditional consequences, never imperatives; no banned words; SILENCE IS LEGAL.

import {
  readStrengthProtocol,
  protocolExpectsE1rmToDip,
  type StrengthProtocolContext,
} from './strength-protocol-read.ts';

/** The spine's own direction verdict for a discipline (state-trend `TrendVerdict`). */
export type DisciplineVerdict = 'improving' | 'holding' | 'sliding' | 'needs_data';

export interface CoachWeekDiscipline {
  /** 'run' | 'ride' | 'strength' | 'swim' | 'walk' | ... — as stored on acute7_by_type. */
  discipline: string;
  actualLoad: number;
  /** Load of the sessions the plan asked for. Null when nothing was planned for this discipline. */
  plannedLoad?: number | null;
  sessionCount: number;
  /**
   * Acute:chronic volume ratio. VALID FOR ENDURANCE ONLY — aerobic adaptation is dose-response to
   * accumulated duration, so a volume ratio is the right instrument there. It is NOT the instrument for
   * strength: lifting adapts to intensity and progressive overload, not to time-under-load, and judging
   * it by a volume ratio imports the endurance model onto the barbell. See `verdict`.
   */
  acwr?: number | null;
  /**
   * The discipline's OWN direction verdict from the spine — for strength this is the noise-guarded e1RM
   * verdict (`state-trend/strength.ts` StrengthFitness.e1rm), which is what "is the lifting still moving"
   * actually means. Preferred over `acwr` wherever it exists.
   */
  verdict?: DisciplineVerdict | null;
}

/** The athlete's DECLARED intent per discipline (D-292's `per_discipline_posture`). */
export type Posture = 'develop' | 'maintain' | 'dropped' | 'unknown';

export interface CoachWeekInsightInput {
  /** THE FORK (same idiom as bike's hasPower): a plan is a yardstick, not a requirement. */
  hasPlan: boolean;
  disciplines: CoachWeekDiscipline[];
  /** Whole-week load vs the athlete's own trailing normal, as a ratio (1.0 = on their normal). */
  weekLoadVsNormal?: number | null;
  /** True when the week is still in progress — suppresses any "came in under" read (the Q-177 trap). */
  partialWeek?: boolean;
  /**
   * FOCUS — what the athlete declared they're developing, keyed by discipline. This is what makes the
   * read answer "what is affecting what" honestly instead of grading every discipline as if it mattered
   * equally. Posture-BLINDNESS is the Q-179 bug class: a `maintain` discipline drifting down is the plan
   * WORKING, and calling it a loss is the app scolding the athlete for executing their own decision.
   */
  posture?: Record<string, Posture> | null;
  /**
   * WHAT THE STRENGTH BLOCK IS TRYING TO DO. Without this the read is a robot: it sees e1RM move and
   * grades it, with no idea the protocol PRESCRIBED that movement. On 5×5 the load climbs every week,
   * so a dipping estimate is the ramp, not decay. The protocol owns its own reading — see
   * `strength-protocol-read.ts`.
   */
  strengthProtocol?: StrengthProtocolContext | null;
}

// ── banned-word hard check (mirrors run-insights / week-accent) ─────────────────────────────────────────
const BANNED = /\b(crush\w*|nailed|smash\w*|amazing|great job|awesome|keep it up|stay consistent|well done|body is ready|on track|proud|beast|killer)\b|!/i;
function clean(sentences: (string | null | undefined)[]): string | null {
  const kept = sentences
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .filter((s) => !BANNED.test(s));
  return kept.length ? kept.join(' ') : null;
}

/** Display names. Swim is included in the LOAD mix (load is load) but never gets a quality read — D-295. */
const LABEL: Record<string, string> = {
  run: 'running', ride: 'riding', bike: 'riding', cycling: 'riding',
  strength: 'strength', swim: 'swimming', walk: 'walking', other: 'other work',
};
const label = (d: string) => LABEL[String(d || '').toLowerCase()] ?? String(d || 'other work');

const pct = (n: number) => `${Math.round(n)}%`;

// Field-standard bands. Not invented here — see the header note.
const BAND_LO = 0.8;
const BAND_HI = 1.2;
/** A discipline is "below its own normal" under the conventional ACWR under-training floor. */
const OWN_NORMAL_FLOOR = 0.8;
/** Below this share of week load, a discipline is a rounding error, not a story. */
const MIN_SHARE_PCT = 5;

// ── the composer — ordered clauses, silent when thin ───────────────────────────────────────────────────
export function composeCoachWeekInsight(inp: CoachWeekInsightInput): string | null {
  if (!inp || !Array.isArray(inp.disciplines)) return null;

  const postureOf = (d: CoachWeekDiscipline): Posture =>
    (inp.posture?.[String(d.discipline).toLowerCase()] as Posture) || 'unknown';

  const active = inp.disciplines
    .filter((d) => d && Number(d.actualLoad) > 0 && Number(d.sessionCount) > 0)
    // A DROPPED discipline is a closed decision, not a gap. It is never mentioned, never penalised.
    .filter((d) => postureOf(d) !== 'dropped')
    .sort((a, b) => Number(b.actualLoad) - Number(a.actualLoad));

  const totalLoad = active.reduce((n, d) => n + Number(d.actualLoad || 0), 0);
  if (!active.length || totalLoad <= 0) return null; // nothing happened — silence, not "you did nothing".

  const parts: (string | null)[] = [];
  const share = (d: CoachWeekDiscipline) => (Number(d.actualLoad) / totalLoad) * 100;
  const Cap = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

  // ── 1. WHERE THE WEEK WENT — DELETED 2026-07-19, on sight of the real screen. ────────────────────
  // It said "led by running — 44% of your load, then strength 22%, riding 22%" while the LOAD bar
  // THREE INCHES ABOVE IT rendered exactly those shares, plus swim, as a labelled bar. Restating the
  // dashboard in prose is the single failure every rejected AI-narration feature shares, in users'
  // own words: "I don't need to be told what I can read from the graphs." The bar owns the mix.
  //
  // ⛔ DO NOT REINSTATE IT AS A SHARE LIST. If a mix sentence ever comes back it must say what the bar
  // CANNOT: how the mix moved against this athlete's own normal. That needs a trailing-share figure
  // nothing currently carries.

  // ── 3 (decided first, so clause 2 can defer to it) — AGAINST THE REFERENCE. Plan, or the athlete's
  //    own normal. Same clause, swapped yardstick. ────────────────────────────────────────────────────
  let referenceLine: string | null = null;
  /** The "nothing to flag" line — only earned when nothing specific fired. See below. */
  let allClearLine: string | null = null;
  /** The discipline clause 3 names, if any — clause 2 must not say the same name twice. */
  let referenceDiscipline: string | null = null;
  /** True when the WHOLE week is down against normal — then a single dim being down is not its own story. */
  let wholeWeekDown = false;

  if (inp.hasPlan && !inp.partialWeek) {
    // Consequence, never a tally. Only fires where the plan actually asked for something.
    // ⛔ A MAINTAIN discipline is EXCLUDED here. Its story is the trailing UPKEEP target (the coach's-eye /
    // cross-training line, D-297/D-130), NOT this week's plan-adherence ratio. Without this exclusion the
    // week narrative said "Running came in heavier than planned" (this-week load over a small maintenance
    // plan) two inches above "Running's under what holds it" (28-day upkeep) — the app contradicting itself
    // about the same discipline (Michael on device 2026-07-24). One discipline, one window, one owner.
    const planned = active.filter((d) =>
      typeof d.plannedLoad === 'number' && (d.plannedLoad as number) > 0 && postureOf(d) !== 'maintain');
    const under = planned.filter((d) => Number(d.actualLoad) / Number(d.plannedLoad) < BAND_LO);
    const over = planned.filter((d) => Number(d.actualLoad) / Number(d.plannedLoad) > BAND_HI);
    if (under.length === 1 && !over.length) {
      referenceDiscipline = under[0].discipline;
      // Fact, full stop. The old closer ("the plan reflects where you are now, not where you were
      // scheduled to be") was consoling reassurance — the register this composer explicitly rejects
      // elsewhere. Michael 2026-07-23: "the last sentence is weird." The bar + fading line carry the rest.
      referenceLine = `${Cap(label(under[0].discipline))} came in lighter than planned.`;
    } else if (over.length === 1 && !under.length) {
      referenceDiscipline = over[0].discipline;
      referenceLine = `${Cap(label(over[0].discipline))} came in heavier than planned — it carries into next week's rolling load.`;
    } else if (!under.length && !over.length && planned.length >= 2) {
      // The generic all-clear. Suppressed below if anything specific fired — "you missed reps" followed
      // by "everything landed inside the plan" is the app arguing with itself (D-305). Load-based
      // adherence and a missed rep are both true at once; the specific claim wins.
      //
      // ⚠️ SAY WHAT WAS ACTUALLY CHECKED. This only ever examined disciplines the plan ASKED for, so
      // "every discipline" over-claimed: on the verified week it fired while bike and swim carried real
      // off-plan load and the upkeep line right below said so. Naming the scope makes it true, and the
      // off-plan work stays visible instead of being absorbed into an all-clear.
      const off = active.filter((d) => !(typeof d.plannedLoad === 'number' && (d.plannedLoad as number) > 0));
      allClearLine = off.length
        ? `Planned sessions landed in range, with ${off.map((d) => label(d.discipline)).join(' and ')} on top.`
        : 'Planned sessions landed in range.';
    }
  } else if (!inp.hasPlan) {
    // NO PLAN IS NOT A DEFICIT. Their own trailing normal is the yardstick — the Strava band pattern,
    // including the explicit de-scolding of a down week.
    const r = inp.weekLoadVsNormal;
    if (typeof r === 'number' && Number.isFinite(r)) {
      if (r < BAND_LO) {
        wholeWeekDown = true;
        referenceLine = 'Lighter than the recent normal — the shape of a down week.';
      } else if (r > BAND_HI) {
        referenceLine = 'More than the recent normal — a bigger week only turns into fitness if it is absorbed.';
      } else {
        referenceLine = 'Sits inside the recent normal.';
      }
    }
  }

  // ── 2. IS ANYTHING QUIETLY DISAPPEARING ───────────────────────────────────────────────────────────
  // A discipline running below ITS OWN trailing normal, described, not diagnosed. Needs a real ratio.
  //
  // TWO SUPPRESSIONS, both learned from running it:
  //  - Never name the discipline clause 3 is about to name (the "said twice" bug).
  //  - Never fire when the WHOLE week is down — a light week already explains a light discipline, and
  //    warning about it and then calling the down week healthy is the app arguing with itself (D-305).
  //  - A `maintain` discipline is NOT reported when it drifts down. That is the plan working, and it is
  //    the Q-179 bug to call it a loss. It gets SILENCE, not a warning and not reassurance — the
  //    consoling "that's a trade, not a mistake" register was rejected on purpose (client-orphaned
  //    `posture.ts`); the honest move is simply not to raise it.
  //  - DID THE PLAN ASK FOR IT? A prescribed lighter week, executed correctly, is not a shortfall. A
  //    deload reading as a warning is the app scolding the athlete for following it.
  //  - RIGHT INSTRUMENT PER DISCIPLINE. Strength is judged by its e1RM verdict, never by a volume ratio.
  const isStrength = (d: CoachWeekDiscipline) => /^strength$/i.test(d.discipline);
  /** True when actual load landed inside the field-standard band of what the plan asked for. */
  const metPlan = (d: CoachWeekDiscipline) =>
    typeof d.plannedLoad === 'number' && (d.plannedLoad as number) > 0 &&
    Number(d.actualLoad) / Number(d.plannedLoad) >= BAND_LO;
  const protocolId = inp.strengthProtocol?.protocolId ?? null;
  const givingGround = (d: CoachWeekDiscipline): boolean => {
    // STRENGTH answers with e1RM, and adherence does NOT suppress it — doing every prescribed session
    // and still sliding is the MOST informative case there is. But the PROTOCOL gets the last word: if
    // the block prescribes a climbing load (5×5) or suppresses the estimate by design (hypertrophy,
    // durability), a dipping e1RM is the program running, and the protocol's own read replaces this one.
    if (isStrength(d)) return d.verdict === 'sliding' && !protocolExpectsE1rmToDip(protocolId);
    // ENDURANCE is dose-response to volume, so a prescribed lighter week, executed, is not a shortfall.
    if (metPlan(d)) return false;
    return typeof d.acwr === 'number' && Number.isFinite(d.acwr) && (d.acwr as number) < OWN_NORMAL_FLOOR;
  };

  const fading = wholeWeekDown ? [] : active
    .filter(givingGround)
    .filter((d) => d.discipline !== referenceDiscipline)
    .filter((d) => postureOf(d) !== 'maintain');
  if (fading.length) {
    const f = fading[0];
    // The consequence clause is EARNED by the declared focus. Without a declared posture we state the
    // fact and stop — "it's the one you're building" is only meaningful against a declared intent.
    // No injury claim, no "should", ever.
    const what = isStrength(f)
      ? 'Estimated one-rep maxes have been sliding'
      : `${Cap(label(f.discipline))} came in below its recent normal this week`;
    parts.push(postureOf(f) === 'develop' ? `${what} — the one being built.` : `${what}.`);
  }

  // ── 2b. CREDIT — the best-supported finding in the concurrent-training literature, and the one the
  //    app's own positioning implies but never says. Strength work does NOT cost aerobic fitness; it
  //    improves running economy (ES -0.27 high-load) and cycling efficiency (0.35) with VO2max
  //    unchanged. So when endurance is the declared focus and the lifting is holding, that is a
  //    CONTRIBUTION, not a competing demand. Fires only when all three conditions are real.
  const enduranceFocus = active.find((d) => postureOf(d) === 'develop' && /^(run|ride|bike|cycling|swim)$/i.test(d.discipline));
  // "Holding" for strength means the LIFTS are holding — a POSITIVE e1RM verdict. Absence of a sliding
  // verdict is not evidence of holding: with no e1RM read we simply don't know, and "the lifting held"
  // would be a claim off nothing.
  const strengthHolding = active.find((d) => isStrength(d) && (d.verdict === 'holding' || d.verdict === 'improving'));
  if (enduranceFocus && strengthHolding && !fading.length) {
    parts.push('The lifting held alongside it — strength work supports economy rather than competing with the aerobic side.');
  }

  // ── 2c. WHAT THE BLOCK ITSELF SAYS. The protocol's own reading — a stall on a linear block, the 85%
  //    ceiling that ends it, a maintenance dose failing its one job. These are events the protocol
  //    defines, not trends we inferred, so they say something the dashboard cannot.
  const protocolLine = readStrengthProtocol(inp.strengthProtocol);
  parts.push(protocolLine);

  parts.push(referenceLine);
  // The all-clear is the LAST resort: it speaks only when no FINDING did. (Clause 1 is scene-setting,
  // not a finding, so the mix sentence does not suppress it.)
  const aFindingFired = Boolean(fading.length || protocolLine || referenceLine);
  if (!aFindingFired) parts.push(allClearLine);
  return clean(parts);
}

// ── MAPPER: the coach's own `by_discipline` slice → composer input. Defensive by design: a missing field
//    drops its clause rather than erroring, so a thin week degrades to silence. ────────────────────────
export function buildCoachWeekInsightInput(
  byDiscipline: any[] | null | undefined,
  opts?: {
    hasPlan?: boolean | null;
    weekLoadVsNormal?: number | null;
    partialWeek?: boolean | null;
    /** `per_discipline_posture` (D-292). Null-safe: no declared posture → every read stays neutral. */
    posture?: Record<string, string> | null;
  },
): CoachWeekInsightInput {
  const rows = Array.isArray(byDiscipline) ? byDiscipline : [];
  const posture: Record<string, Posture> = {};
  for (const [k, v] of Object.entries(opts?.posture ?? {})) {
    const p = String(v || '').toLowerCase();
    if (p === 'develop' || p === 'maintain' || p === 'dropped') posture[String(k).toLowerCase()] = p;
  }
  return {
    hasPlan: opts?.hasPlan === true,
    weekLoadVsNormal: typeof opts?.weekLoadVsNormal === 'number' ? opts.weekLoadVsNormal : null,
    partialWeek: opts?.partialWeek === true,
    posture,
    disciplines: rows.map((r: any) => ({
      discipline: String(r?.discipline ?? 'other'),
      actualLoad: Number(r?.actual_load ?? 0),
      plannedLoad: typeof r?.planned_load === 'number' ? r.planned_load : null,
      sessionCount: Number(r?.session_count ?? 0),
      acwr: typeof r?.acwr === 'number' ? r.acwr : null,
      verdict: (['improving', 'holding', 'sliding', 'needs_data'] as const).includes(r?.verdict)
        ? (r.verdict as DisciplineVerdict)
        : null,
    })),
  };
}

/**
 * THE WEEK'S LIFTING DOSE — Viada's own two counts, over what was actually logged. [2026-08-29]
 * Reordered 2026-09-01 (Round 3 addendum, approved by Michael): the block's order was exactly inverted.
 *
 * ⛔ IT RENDERS AND DOES NOT DECIDE. Every number and every word arrives resolved on
 * `state_trends_v1.display.viadaWeek`: the muscle lines and their verdicts are `ledgerFor`'s, the
 * per-session cost verdicts are `verdictForSessionSets`'s, the per-pattern rep counts are
 * `performedStrengthDose`'s, and all are computed against the same windowed reference max the heavy
 * gate uses. Nothing is derived at this edge. ⛔ THE VERDICT WORDS BELOW ARE A DISPLAY MAP OVER THE
 * SERVER'S ENUMS — no threshold lives here. If a comparison against 8, 12, 14 or 18 appears in this
 * file, it is the fault this screen's arc exists to remove.
 *
 * ⛔ THE ORDER, AND WHY (2026-09-01). The card used to lead with the muscle list and end with what
 * each session cost — the hybrid athlete's real question ("is today's lifting going to cost
 * tomorrow's run") was the last line. Now:
 *   1. COST LEADS — which of the week's sessions sit in which of the book's brackets (p086: 6-8
 *      work sets recovers in 24-48h; 14+ can cost up to 72h). The bracket is the server's `verdict`,
 *      which the card previously received and discarded. The one read the programme does not
 *      guarantee.
 *   2. COVERAGE — what got nothing. The completion read: if the athlete skips, the programme's
 *      guarantee breaks. Promoted, and kept prominent.
 *   3. OUTSIDE THE PLAN — what the athlete did that the plan did not ask for (server-classified).
 *   This block is COMPLETION AND COST ONLY. Whether strength is improving lives below, in the lift
 *   cards. Michael, 2026-09-01: "I just want this to be useful and have value."
 *
 * ⛔⛔ THE HEAVY / SPEED PATTERN ROWS ARE DELIBERATELY NOT DRAWN EITHER (2026-09-01, same ruling as
 * the per-muscle list, applied consistently, approved by Michael). p084's 4-6 reps above 90% and
 * 15-20 velocity reps per pattern are the PROGRAMME'S prescription; the All Rounder is built to
 * them, so reading them back is the plan's own guarantee, not information about the athlete — and
 * in a test week they are structurally zero, which is what made them look broken. ⚠️ THE SERVER IS
 * UNTOUCHED: `perPattern`, its bands and the test-week flag `patternBandApplies` are still on the
 * payload and still correct; the flag's suppression logic is not why the rows went. The "no known
 * max yet for …" note went with them: it explained where unpriced sets landed relative to the
 * PERCENTAGES, and nothing on this block prices a set any more — the session cost, the coverage
 * line and the off-plan read all count sets without a max.
 *
 * ⛔⛔ THE PER-MUSCLE DOSE LIST IS DELIBERATELY NOT DRAWN (2026-09-01, same day it was promoted —
 * reversed on a source finding, approved by Michael). The All Rounder is a fixed programme built to
 * the book's own doses, so "is chest getting 8-12 sets" is answered by the PROGRAMME, not by the
 * athlete — printing it back mid-week is the app grading its own homework. Worse, it graded a
 * seven-day target on day three: nearly every muscle read "light" (a nudge to add work the
 * programme does not ask for), and a muscle on pace to finish OVER read "in range". Wrong in both
 * directions. ⚠️ THE DECISION STANDS ON THAT LEG ONLY. The source's "resist the urge to add
 * difficulty or length" line (p275, `SOURCE-viada-hybrid-athlete.md:1199`) is about the ENDURANCE
 * work and was wrongly cited for this ruling on the day; do not attach it to lifting.
 * ⚠️ THE SERVER VERDICTS ARE UNTOUCHED — `perMuscle[].verdict` is still
 * on the payload and still correct for a completed week; other surfaces may read it. This is a
 * rendering decision. The one volume worth measuring against the book's ranges is what the athlete
 * did that the plan did not ask for — and the performed payload cannot yet separate prescribed rows
 * from added ones (see the FIXLIST); until it can, nothing here approximates it.
 *
 * ⛔ THE NUMBERS ON SCREEN ARE READ FROM `dose.ts`, NOT RETYPED. `SESSION_SETS_RECOVERS` and
 * `SESSION_SETS_COSTLY` are the same constants the server's verdicts are cut on, through the same
 * `@shared` alias the wizard already bundles (`NonRaceBuilder` reaches `accessory-dosing/index.ts`),
 * so this adds no bundle weight and no second source for a figure.
 *
 * ⛔ HIS BANDS ARE STATED, NOT GRADED. No colour on a verdict, no imperative, no "you should".
 *
 * ⛔ WHY IT IS THE PERFORMED WEEK AND NOT THE PLAN'S. The composed week's version of these numbers
 * (`week_ledger_v1`, persisted on the plan row since 2026-08-28) is deliberately never drawn — a
 * standing block's twelve weeks are identical by design, so the plan's dose is one picture shown
 * twelve times. What the athlete DID is the number that moves.
 *
 * ⚠️ THE WINDOW IS ROLLING — the seven days ending at as-of, not a calendar week. Any copy here that
 * says "this week" means that window. Nothing here compares it to an earlier window; that is the
 * change rule (§B5, >10%), which is a server verdict and not yet on the payload.
 *
 * ⛔ NO EMPTY STATE. A week with nothing lifted returns null from the server and this does not
 * render — the same rule the lift cards follow.
 */

// ⚠️ `unpriced` (FIXLIST 2a) is still on the payload and still emits both spellings of a raw name —
// see the FIXLIST's server-side leftovers (S5). Nothing on this card renders it any more.
import {
  SESSION_SETS_COSTLY,
  SESSION_SETS_RECOVERS,
  type SessionVerdict,
} from '@shared/accessory-dosing/dose.ts';
import { weekChangeParts, type ViadaWeekChange } from '@/lib/week-change-line';
// ⛔ `DE: Upper` → `Speed day, upper body`, at the last moment before the athlete reads it (Michael,
// off the live card: "LLM jiberish what is DE?" … "spell it out"). One formatter over the ONE owner
// of the Heavy/Speed vocabulary — the logger, the calendar, the week grid and the plan download all
// read the same two words; this card spells the phrase out in full. The engine string on the payload
// is untouched. `Test:` keeps its word; SKILL/HYP are slot intents, never day labels.
import { spelledIntentLabel } from '@/lib/plain-intent';

export type ViadaWeekPerformed = {
  since: string;
  perMuscle: Array<{ muscle: string; sets: number; effectiveReps: number; verdict: string }>;
  belowFloor: string[];
  perSession: Array<{ label: string; countedSets: number; totalIfAllCounted: number; verdict: string }>;
  perPattern: Array<{
    pattern: string; heavyReps: number; velocityReps: number;
    heavy: 'below' | 'in_band' | 'above'; velocity: 'below' | 'in_band' | 'above';
  }>;
  unpriced: string[];
  /** ⛔ Server-resolved: does p084's heavy/velocity band apply to this window at all? False in a
   *  test week. Undefined on a payload written before the field existed → the band applies. */
  patternBandApplies?: boolean;
  /** ⛔ Server-resolved: §B5's change rule — the buckets that moved more than 10% against the seven
   *  days before this window. Undefined on a payload written before the field existed → no line. */
  weekChange?: ViadaWeekChange | null;
  /** ⛔ Server-resolved: what was done that the plan did not ask for, per muscle. `known: false` =
   *  the window's sessions carry no plan marker (logged before it existed, or no plan behind them) —
   *  unknown, render nothing. Undefined on a payload written before the field existed → nothing. */
  offPlan?: {
    known: boolean;
    classifiedSessions: number;
    perMuscle: Array<{ muscle: string; sets: number; effectiveReps: number; verdict: string }>;
    workSets: number;
  } | null;
};

/** ⚠️ The catalogue's pattern keys are snake_case; the screen speaks English. */
const PATTERN_WORD: Record<string, string> = {
  horizontal_push: 'push',
  vertical_push: 'overhead press',
  horizontal_pull: 'row',
  vertical_pull: 'pull-up',
  knee_dominant: 'squat',
  hip_dominant: 'hinge',
  calf: 'calf',
  core: 'core',
};

const MUSCLE_WORD: Record<string, string> = {
  quadriceps: 'quads',
  deltoids: 'shoulders',
  lats: 'back',
};

const word = (map: Record<string, string>, key: string) => map[key] ?? key.replace(/_/g, ' ');

/**
 * ⛔ DISPLAY WORDS OVER THE SERVER'S SESSION VERDICT — a map, not a comparison. `above_recovers` is
 * the gap between the book's two figures (over 8, under 14) — it gives no recovery time for it, so
 * the word states the position and claims nothing about the next day. An enum value this map does
 * not know prints nothing rather than a guess.
 * ⛔ NO POSSESSIVE (Michael, 2026-09-01, off the live screen: "should say 'his' numbers its a very
 * confusing data dump"). "His" is the book's author, who appears nowhere on the screen. The older
 * "his range is…" pattern caption on this card is Round 4's.
 */
const SESSION_VERDICT_WORD: Record<SessionVerdict, string> = {
  recovers: 'next day about normal',
  above_recovers: `over ${SESSION_SETS_RECOVERS.hi}`,
  costly: 'costs up to three days',
};

const isSessionVerdict = (v: string): v is SessionVerdict => v in SESSION_VERDICT_WORD;

/**
 * ⛔ DISPLAY WORDS OVER THE SERVER'S MUSCLE VERDICT, FOR ADDED WORK ONLY — a map, not a comparison,
 * and deliberately silent below the solid band. `below_floor` / `light` / `solid` on an EXTRA print
 * nothing: the extra is measured against the book's ranges only to catch too much, never to ask for
 * more. An enum value this map does not know prints nothing.
 */
const OVER_BAND_WORD: Record<string, string> = {
  above_solid: 'over the solid range on its own',
  overreaching: 'borders overreaching on its own',
  over_max: 'past the maximum on its own',
};

/**
 * The lead line: how many of the window's sessions sit in each of his brackets. Counts of the
 * server's verdicts — the card does not look at a set count to place a session.
 */
function costLead(perSession: ViadaWeekPerformed['perSession']): string {
  const n = { recovers: 0, above_recovers: 0, costly: 0 } as Record<SessionVerdict, number>;
  for (const s of perSession) if (isSessionVerdict(s.verdict)) n[s.verdict] += 1;
  const total = n.recovers + n.above_recovers + n.costly;
  if (total === 0) return '';
  const session = (k: number) => `${k} session${k === 1 ? '' : 's'}`;
  const recoversText = `at ${SESSION_SETS_RECOVERS.lo}–${SESSION_SETS_RECOVERS.hi} work sets or under — next day about normal`;
  if (n.recovers === total) return `all ${session(total)} ${recoversText}`;
  const parts: string[] = [];
  if (n.recovers > 0) parts.push(`${n.recovers} ${recoversText}`);
  if (n.above_recovers > 0) parts.push(`${n.above_recovers} over ${SESSION_SETS_RECOVERS.hi}`);
  if (n.costly > 0) parts.push(`${n.costly} at ${SESSION_SETS_COSTLY} or more — costs up to three days`);
  return `${session(total)}: ${parts.join(' · ')}`;
}

export default function ViadaWeekCard({ week }: { week: ViadaWeekPerformed | null | undefined }) {
  if (!week || week.perMuscle.length === 0) return null;

  const lead = costLead(week.perSession);
  // Null when there is nothing to say — no prior work, or nothing over the line. Both are silence.
  const changeParts = weekChangeParts(week.weekChange, (kind, key) => {
    switch (kind) {
      case 'work_sets': return 'work sets';
      case 'muscle_sets': return `${word(MUSCLE_WORD, key)} sets`;
      case 'pattern_heavy': return `${word(PATTERN_WORD, key)} heavy reps`;
      case 'pattern_speed': return `${word(PATTERN_WORD, key)} speed reps`;
    }
  });

  return (
    <div className="px-3 py-3 border-t border-white/[0.055]">
      <div className="text-[11px] uppercase tracking-[0.08em] text-white/55">this week's lifting</div>

      {/* ── 1. WHAT EACH SESSION COST — LEADS (p086: 6-8 recovers in 24-48h, 14+ up to 72h) ──── */}
      {week.perSession.length > 0 && (
        <div className="mt-2">
          {lead && <div className="text-[13px] text-white/85">{lead}</div>}
          <div className="mt-1 space-y-1">
            {week.perSession.map((s, i) => (
              <div key={`${s.label}-${i}`} className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-white/80">{spelledIntentLabel(s.label)}</span>
                <span className="text-[12px] text-white/60 tabular-nums">
                  <span className="text-white/80">{s.countedSets}</span> work sets
                  {isSessionVerdict(s.verdict) && <> · {SESSION_VERDICT_WORD[s.verdict]}</>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 2. COVERAGE — what got nothing ────────────────────────────────────────────────────── */}
      {week.belowFloor.length > 0 && (
        <div className="text-[13px] text-white/80 mt-3">
          nothing this week for {week.belowFloor.map((m) => word(MUSCLE_WORD, m)).join(', ')}
        </div>
      )}

      {/* ── 3. OUTSIDE THE PLAN — the only lifting volume the programme has not accounted for ──── */}
      {/**
        * ⛔ RENDERS THE SERVER'S ADDED-ONLY LEDGER. Which rows were added is decided on the spine off
        * the logger's plan marker, per session; this prints the per-muscle result. Silent when the
        * window is UNKNOWN (`known: false` — nothing carries the marker) and silent when nothing was
        * added — a wrong "you added this" is worse than nothing. The verdict word is shown only when
        * the added volume alone is over the book's solid band; "light" on an extra would read as a
        * nudge to add more, which is the opposite of the point.
        * ⛔ COPY NEVER NAMES A MOVEMENT — "anything you add outside the plan". Muscles only.
        */}
      {week.offPlan && week.offPlan.known && week.offPlan.perMuscle.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-[0.08em] text-white/55">outside the plan this week</div>
          <div className="mt-1 space-y-1">
            {week.offPlan.perMuscle.map((m) => (
              <div key={m.muscle} className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-white/80">{word(MUSCLE_WORD, m.muscle)}</span>
                <span className="text-[12px] text-white/60 tabular-nums">
                  <span className="text-white/80">{m.sets}</span> sets · {m.effectiveReps} effective reps
                  {OVER_BAND_WORD[m.verdict] && <> · {OVER_BAND_WORD[m.verdict]}</>}
                </span>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-white/55 mt-1">
            anything you add outside the plan is the volume the programme has not already counted
          </div>
        </div>
      )}

      {/* ── 3. THE CHANGE RULE (§B5: no bucket moves more than 10% week to week) ─────────────── */}
      {/**
        * ⚠️ AS DEPLOYED 2026-09-01, SPEAKING ABOUT ALL LIFTING BUCKETS. The ruling is that it should
        * speak only about work the plan did not ask for — which needs the prescribed/added split on
        * the performed payload, the same server change the dose list waits on. Left as built rather
        * than narrowed by approximation; see the FIXLIST.
        */}
      {/**
        * ⛔ RENDERS THE SERVER'S LIST. Which buckets crossed the line is decided in
        * `state-trend/assemble.ts` against `WEEK_CHANGE_FLAG_PCT`; this prints them. Nothing prints
        * when nothing moved, and nothing prints when there was no prior work to measure against —
        * the server's `comparable` flag tells those apart, and neither is a sentence.
        * ⛔ "THE SEVEN DAYS BEFORE THAT", NEVER "LAST WEEK" — both windows are rolling.
        */}
      {changeParts && (
        <div className="text-[12px] text-white/70 mt-2">
          against the seven days before that: {changeParts.join(', ')}
        </div>
      )}

      {/* ── (the heavy/speed pattern rows and the "no known max yet" note used to sit here — see the
             header. `perPattern`, `patternBandApplies` and `unpriced` are still on the payload.) ── */}
    </div>
  );
}

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
 *   1. COST LEADS — which of the week's sessions sit in which of his brackets (p086: 6-8 work sets
 *      recovers in 24-48h; 14+ can cost up to 72h). The bracket is the server's `verdict`, which the
 *      card previously received and discarded.
 *   2. COVERAGE — what got nothing. The one line that states a conclusion.
 *   3. DOSE PER MUSCLE, AGAINST THE TARGET — the two numbers were printed with neither band beside
 *      them, and the server's verdict word was discarded here too.
 *   4. The pattern rows and the unpriced note stay underneath, as detail.
 *
 * ⛔⛔ ONE VERDICT COVERS BOTH NUMBERS ON A MUSCLE LINE — DO NOT ADD A SECOND COMPARISON FOR
 * EFFECTIVE REPS. Effective reps are sets × 4 by his own formula (`effectiveRepsFor`, p147), and his
 * 32-48 effective-rep band is his 8-12 set band multiplied by four (`dose.ts`: "the second is the
 * first multiplied by four — his arithmetic, not ours"). A set count inside 8-12 IS an effective-rep
 * count inside 32-48; they cannot disagree. So `verdict` is printed once, beside both figures, and
 * both targets are printed beside it. A session that builds an effective-rep verdict here builds a
 * second copy of the same band and a way for the two to drift.
 *
 * ⛔ THE NUMBERS ON SCREEN ARE READ FROM `dose.ts`, NOT RETYPED. `WEEKLY_SETS_SOLID`,
 * `WEEKLY_SETS_OVERREACHING`, `WEEKLY_EFFECTIVE_REPS_RECOMMENDED`, `SESSION_SETS_RECOVERS` and
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

import React from 'react';
// ⛔ THE ONE NAME MAP AGAIN (FIXLIST 2a, same class of fault as 1d). `unpriced` is built from the RAW
// logged exercise name — `performed-ledger.ts:169` does `unpriced.add(ex.name)` into a Set, and a Set
// is case-sensitive, so "Ab Wheel Rollout" and "ab wheel rollout" are two members and the sentence
// named the same movement twice. Canonicalising collapses every spelling of a movement to one key
// ("Ab Wheel Rollout", "ab wheel rollout", "Ab Wheel Rollouts", "AB WHEEL ROLLOUT" all → `ab_rollout`),
// and `canonicalDisplayName` gives it the same clean label the rest of the screen uses.
// ⚠️ FIXED AT THE EDGE, NOT AT THE SOURCE, DELIBERATELY: `performed-ledger.ts` is server code inside a
// 27-function deploy closure, and this round is client-only. The server still emits both spellings —
// see the FIXLIST's server-side leftovers.
import { canonicalize, canonicalDisplayName } from '@shared/canonicalize';
import {
  EFFECTIVE_REPS_PER_SET,
  SESSION_SETS_COSTLY,
  SESSION_SETS_RECOVERS,
  WEEKLY_EFFECTIVE_REPS_RECOMMENDED,
  WEEKLY_SETS_OVERREACHING,
  WEEKLY_SETS_SOLID,
  type MuscleVerdict,
  type SessionVerdict,
} from '@shared/accessory-dosing/dose.ts';
import { weekChangeParts, type ViadaWeekChange } from '@/lib/week-change-line';

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
 * ⛔ DISPLAY WORDS OVER THE SERVER'S MUSCLE VERDICT — a map, not a comparison. `light` is its own
 * verdict and is not a fault (`dose.ts`: under 8 sets is where a hybrid athlete lives); it is printed
 * as the plain word. An enum value this map does not know prints nothing rather than a guess.
 */
// ⛔ NO POSSESSIVE (Michael, 2026-09-01, off the live screen: "should say 'his' numbers its a very
// confusing data dump"). "His" is the book's author, who appears nowhere on the screen. The ranges
// are stated bare; the older "his range is…" lines elsewhere on this card are Round 4's.
const MUSCLE_VERDICT_WORD: Record<MuscleVerdict, string> = {
  below_floor: 'under the floor',
  light: 'light',
  solid: 'in range',
  above_solid: 'over range',
  overreaching: 'borders overreaching',
  over_max: 'past the maximum',
};

/**
 * ⛔ DISPLAY WORDS OVER THE SERVER'S SESSION VERDICT. `above_recovers` is the gap between his two
 * figures (over 8, under 14) — he gives no recovery time for it, so the word states the position and
 * claims nothing about the next day.
 */
const SESSION_VERDICT_WORD: Record<SessionVerdict, string> = {
  recovers: 'next day about normal',
  above_recovers: `over ${SESSION_SETS_RECOVERS.hi}`,
  costly: 'costs up to three days',
};

const isMuscleVerdict = (v: string): v is MuscleVerdict => v in MUSCLE_VERDICT_WORD;
const isSessionVerdict = (v: string): v is SessionVerdict => v in SESSION_VERDICT_WORD;

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
  // One entry per MOVEMENT, not per spelling. Order of first appearance is kept so the sentence reads
  // in the order the athlete's own week produced.
  const unpricedNames = React.useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of week?.unpriced ?? []) {
      const key = canonicalize(raw);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(canonicalDisplayName(key));
    }
    return out;
  }, [week?.unpriced]);

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
                <span className="text-[13px] text-white/80">{s.label}</span>
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

      {/* ── 3. DOSE PER MUSCLE, AGAINST THE TARGET (p086) — one verdict, both numbers ─────────── */}
      <div className="mt-3 space-y-1">
        {week.perMuscle.map((m) => (
          <div key={m.muscle} className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-white/80">{word(MUSCLE_WORD, m.muscle)}</span>
            <span className="text-[12px] text-white/60 tabular-nums">
              <span className="text-white/80">{m.sets}</span> sets · {m.effectiveReps} effective reps
              {isMuscleVerdict(m.verdict) && <> · {MUSCLE_VERDICT_WORD[m.verdict]}</>}
            </span>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-white/55 mt-1">
        {WEEKLY_SETS_SOLID.lo}–{WEEKLY_SETS_SOLID.hi} sets a muscle a week
        — {WEEKLY_EFFECTIVE_REPS_RECOMMENDED.lo}–{WEEKLY_EFFECTIVE_REPS_RECOMMENDED.hi} effective reps,
        about {EFFECTIVE_REPS_PER_SET} a set. {WEEKLY_SETS_OVERREACHING.lo}–{WEEKLY_SETS_OVERREACHING.hi} borders overreaching.
      </div>

      {/* ── 4. THE CHANGE RULE (§B5: no bucket moves more than 10% week to week) ─────────────── */}
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

      {/* ── 4. DETAIL: REPS BY PATTERN (p084: 4-6 above 90%, 15-20 at 70-85%) ────────────────── */}
      {/**
        * ⛔ THE BAND ROW DOES NOT DRAW IN A TEST WEEK (2026-09-01, ruled by Michael). The server says
        * whether p084's heavy/velocity band applies — `patternBandApplies` — and this renders that
        * answer. It does NOT work out which week it is: the heavy count is structurally zero in a
        * test week (band opens at 90%, the pretest tops out at 86.25%), so a zero that can never
        * resolve would read as a failure.
        * ⛔ BOTH HALVES GO TOGETHER. "16 speed" alone, with the heavy count silently missing, looks
        * like the heavy number was lost rather than that the band does not apply.
        * ⚠️ UNDEFINED MEANS THE BAND APPLIES — a payload written before this field existed keeps
        * today's behaviour rather than silently hiding the row.
        */}
      {week.perPattern.length > 0 && week.patternBandApplies !== false && (
        <>
          <div className="mt-3 space-y-1">
            {week.perPattern.map((p) => (
              <div key={p.pattern} className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-white/80">{word(PATTERN_WORD, p.pattern)}</span>
                <span className="text-[12px] text-white/60 tabular-nums">
                  <span className="text-white/80">{p.heavyReps}</span> heavy ·{' '}
                  <span className="text-white/80">{p.velocityReps}</span> speed
                </span>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-white/55 mt-1">
            his range is 4–6 reps above 90% and 15–20 at 70–85%, per pattern
          </div>
        </>
      )}

      {/* ⛔ NAMED, NOT COUNTED AS ZERO — a percentage of an unknown max is no number at all. */}
      {unpricedNames.length > 0 && (
        <div className="text-[12px] text-white/50 mt-2">
          no known max yet for {unpricedNames.join(', ')} — those sets are in the muscle counts above,
          not in the percentages
        </div>
      )}
    </div>
  );
}

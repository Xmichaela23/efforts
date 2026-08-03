import React from 'react';
import StrengthCompareTable, { type StrengthVolumePayload } from './StrengthCompareTable';
// THE app's exercise vocabulary — the same canonical keys exercise_log and the State trend group
// on. Imported rather than re-implemented so this screen cannot disagree with them about what a
// lift is called (audit F5: five separate name-matchers, and counting is not the place to add one).
import { canonicalize } from '@/lib/canonicalize';
// D-370: the one rule for "is this planned row an assistance slot", shared with the server matcher.
import { isAssistanceSlot } from '@/lib/assistance-slot';

interface StrengthPerformanceSummaryProps {
  planned: any | null;
  completed: any | null;
  type: 'strength' | 'mobility';
  sessionDetail?: Record<string, any> | null;
  onRecompute?: () => Promise<void>;
  recomputing?: boolean;
  recomputeError?: string | null;
}

const extractExercisesFromComputed = (workout: any) => {
  try {
    const computed = workout?.computed;
    const steps: any[] = Array.isArray(computed?.steps) ? computed.steps : [];
    
    const strengthSteps = steps.filter(st => st?.strength && typeof st.strength === 'object');
    
    return strengthSteps.map((st: any) => {
      const s = st.strength;
      const name = String(s?.name || 'Exercise');
      const sets = Number(s?.sets || s?.setsCount || 0);
      const rawReps = s?.reps ?? s?.repCount;
      const reps = (() => {
        const r = rawReps;
        if (typeof r === 'string') return parseInt(r, 10) || 0;
        if (typeof r === 'number') return Math.max(1, Math.round(r));
        return 0;
      })();
      // ⛔ ASKED THROUGH THE SHARED RULE, NOT INLINE. `isAssistanceSlot` answers on the composer's
      // marker OR — for plans materialized in the four-day window before that marker was plumbed
      // into `computed.steps` — on the composer's own authored shape. Michael's block is in that
      // window, which is why the flag-only version of this shipped, deployed, and changed nothing on
      // his screen. The full history is in that file; the SERVER matcher gates Tier 3 on the same
      // call, so the two sides cannot disagree about what an assistance slot is.
      const looksLikeAssistance = isAssistanceSlot({ sets: s?.sets, reps: rawReps, load_prescribed: s?.load_prescribed });
      const weight = Number(s?.weight || s?.load || 0);
      const target_rir = typeof s?.target_rir === 'number' ? s.target_rir : undefined;
      // ⛔ THE RAMP, CARRIED (D-338). 5/3/1 is three sets at THREE weights — 170/180/190 — and
      // `weight` above deliberately holds only the TOP set so older consumers kept working.
      // `materialize-plan` carries the real per-set prescription through in `set_plan` and the
      // logger already opens each set on its own number; this screen was the one place still
      // replicating the top weight across all three, so a correctly executed session showed its
      // first two sets as UNDER the plan and printed a negative volume delta.
      const setPlan = Array.isArray(s?.set_plan)
        ? s.set_plan
            .map((p: any) => ({
              weight: Number(p?.weight) || 0,
              reps: Number(p?.reps) || 0,
              amrap: p?.amrap === true,
            }))
            .filter((p: any) => p.weight > 0 || p.reps > 0)
        : undefined;

      // ⛔ CARRY THE ASSISTANCE MARKER, OR THE PRESCRIPTION IS LOST ON THIS SCREEN (2026-08-02).
      // `load_prescribed: false` is stamped by the Get Stronger composer on every assistance slot
      // and carried all the way through materialize (`materialize-plan/index.ts:2156`) — and then
      // died HERE, because this object is a whitelist and the flag was not on it.
      //
      // Assistance in 5/3/1 is prescribed as a REP TOTAL and nothing else — Wendler, on the exact
      // movements in this athlete's block: *"50 total reps for weighted dips. 100 total reps if
      // you're just using your bodyweight"*, chins *"no less than 100 per week"*, bodyweight
      // template *"no less than 75 reps per exercise for each workout"*. So the composer writes
      // `sets: undefined` / `reps: "25 total"` / `weight: "By feel"` — correctly.
      //
      // But `sets` is what the compare table builds its planned rows FROM. No set count, no rows,
      // and every Planned cell on a chin-up rendered "—" while the plan sat there plainly saying
      // 25. The prescription existed; the table had nowhere to put it. Without this flag the client
      // cannot tell "the plan asked for nothing" from "the plan asked for a total".
      // ⚠️ Only ever `false` or absent — never `true`. Absent means "not stated", and a reader that
      // treats absent as assistance turns every main lift into one.
      return { name, sets, reps, weight, target_rir, ...(setPlan?.length ? { setPlan } : {}),
        ...(s?.load_prescribed === false || looksLikeAssistance ? { load_prescribed: false } : {}) };
    });
  } catch (e) {
    return [];
  }
};

export default function StrengthPerformanceSummary({ planned, completed, type, sessionDetail, onRecompute, recomputing, recomputeError }: StrengthPerformanceSummaryProps) {
  let plannedExercises = extractExercisesFromComputed(planned);
  
  if (plannedExercises.length === 0) {
    const directExercises = type === 'strength' 
      ? (planned?.strength_exercises || [])
      : (planned?.mobility_exercises || []);
    
    if (Array.isArray(directExercises)) {
      plannedExercises = directExercises.map((ex: any)=>{
        if (ex.duration && typeof ex.duration === 'string') {
          const match = ex.duration.match(/(\d+)x(\d+)/i);
          if (match) {
            return {
              name: ex.name,
              sets: parseInt(match[1], 10),
              reps: parseInt(match[2], 10),
              weight: Number(ex.weight || 0)
            };
          }
        }
        const setsArr = Array.isArray(ex.sets) ? ex.sets : [];
        const setsNum = setsArr.length || (typeof ex.sets === 'number' ? ex.sets : 0);
        const durationNum = typeof ex.duration_seconds === 'number' ? ex.duration_seconds : (setsArr.length ? Math.round(setsArr.reduce((s:any, st:any)=> s + (Number(st?.duration_seconds)||0), 0) / setsArr.length) : 0);
        // D-094: planned `reps` is commonly a string range like "4-6" / "8-10" — parse midpoint instead of coercing to 0.
        const repsNum = (() => {
          if (typeof ex.reps === 'number') return ex.reps;
          if (typeof ex.reps === 'string') {
            const range = ex.reps.match(/^\s*(\d+)\s*[-–]\s*(\d+)\s*$/);
            if (range) return Math.round((parseInt(range[1], 10) + parseInt(range[2], 10)) / 2);
            const single = parseInt(ex.reps, 10);
            if (Number.isFinite(single) && single > 0) return single;
          }
          if (setsArr.length) return Math.round(setsArr.reduce((s:any, st:any)=> s + (Number(st?.reps)||0), 0) / setsArr.length);
          return 0;
        })();
        // D-094: planned `weight` may be a qualitative string ("Bodyweight" / "Band" / "Heavy barbell"
        // / RIR fallback cue from D-071). Preserve as `weight_display` for rendering instead of
        // coercing to 0, which silently dropped the entire planned row to "—".
        let weightNum = 0;
        let weightDisplay: string | undefined;
        if (typeof ex.weight === 'number') {
          weightNum = ex.weight;
        } else if (typeof ex.weight === 'string') {
          const trimmed = ex.weight.trim();
          // Numeric strings ("110", "85.5") parse to weightNum; anything else is qualitative.
          if (/^[\d.]+\s*(lb|lbs|kg)?$/i.test(trimmed)) {
            weightNum = parseFloat(trimmed) || 0;
          } else if (trimmed) {
            weightDisplay = trimmed;
          }
        } else if (setsArr.length) {
          weightNum = Math.round(setsArr.reduce((s:any, st:any)=> s + (Number(st?.weight)||0), 0) / setsArr.length);
        }
        const target_rir = typeof ex.target_rir === 'number' ? ex.target_rir : undefined;
        // Same question as the `computed.steps` path above, asked the same way — a plan read from
        // `strength_exercises` directly must reach the table saying the same thing, or the two
        // routes disagree about whether a chin-up was prescribed.
        const result: any = { name: ex.name, sets: setsNum, weight: weightNum, target_rir,
          ...(isAssistanceSlot(ex) ? { load_prescribed: false } : {}) };
        if (weightDisplay) result.weight_display = weightDisplay;
        if (durationNum > 0) {
          result.duration_seconds = durationNum;
        } else {
          result.reps = repsNum;
        }
        return result;
      });
    }
  }
  
  const parseCompletedExercises = (raw: any): any[] => {
    try {
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string' && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  };
  
  const completedRaw = type === 'strength'
    ? parseCompletedExercises(completed?.strength_exercises)
    : parseCompletedExercises(completed?.mobility_exercises);
  
  const completedExercises = completedRaw.map((ex: any) => {
    if (ex.duration && typeof ex.duration === 'string') {
      const match = ex.duration.match(/(\d+)x(\d+)/i);
      if (match) {
        const numSets = parseInt(match[1], 10);
        const reps = parseInt(match[2], 10);
        const weight = Number(ex.weight || 0);
        const setsArray = Array.from({ length: numSets }, () => ({
          reps,
          weight,
          completed: true
        }));
        return { name: ex.name, setsArray };
      }
    }
    if (Array.isArray(ex.sets) && ex.sets.length > 0) {
      // `substituted_for` rides through so the table can pair a DECLARED swap with the slot it
      // replaced instead of drawing it as a miss plus an unplanned extra (Q-181).
      return { name: ex.name, setsArray: ex.sets, ...(ex.substituted_for ? { substituted_for: ex.substituted_for } : {}) };
    }
    // Legacy compact shape: sets = set count, reps & weight on exercise (same as workout-detail fallback)
    if (typeof ex.sets === 'number' && ex.sets > 0) {
      const reps = Number(ex.reps ?? 0) || 0;
      const weight = Number(ex.weight ?? 0) || 0;
      if (reps > 0 || weight > 0) {
        const setsArray = Array.from({ length: ex.sets }, () => ({
          reps,
          weight,
          completed: true as boolean,
        }));
        return { name: ex.name, setsArray };
      }
    }
    return { name: ex.name, setsArray: [] };
  });

  const planId = (planned as any)?.training_plan_id 
    || (completed as any)?.training_plan_id 
    || (completed as any)?.plan_id
    || (planned as any)?.plan_id;
  
  const plannedWorkoutId = (planned as any)?.id || (completed as any)?.planned_id;
  
  const rirSummary = sessionDetail?.strength_rir_summary ?? null;
  // D-349 — volume load, priced server-side by the one set rule. Feeds BOTH the table's lb column
  // and the totals footer below, so the two cannot disagree with each other or with the load score.
  const strengthVolume: StrengthVolumePayload | null = sessionDetail?.strength_volume ?? null;
  // The all-out set + the block it belonged to — both server-computed, rendered verbatim.
  const allOut = sessionDetail?.strength_all_out ?? null;
  const allOutReason = sessionDetail?.strength_all_out_reason ?? null;
  const block = sessionDetail?.block ?? null;
  // ── WHAT BLOCK THIS SESSION BELONGED TO (Q-230 / D-339, wired 2026-08-01) ─────────────────────
  //
  // The card has ridden on `session_detail_v1` since 2026-07-30 and this screen read exactly one
  // field of it — `is_measurement_week`, for the line under the all-out set. So the table below
  // could show a session's numbers as under-plan without ever saying the week was a deload.
  //
  // ⚠️ THE WORD IS THE CARD'S, NOT THIS SCREEN'S. `block.phase` is the plan's own name and on a
  // 5/3/1 block that is 'Leader' / 'Anchor' — internal vocabulary an athlete should never be shown.
  // `phase_word` is the plain one, resolved server-side through the app's single phase vocabulary,
  // so this screen and the State fitness rows print the same word for the same week by construction
  // rather than by two tables agreeing for now.
  // ⚠️ Every piece is optional: no plan link → no card → nothing renders. A week that the plan does
  // not place prints "week 3 of 12" with no word, and a card with no block length prints "week 3".
  const blockLine = (() => {
    if (!block) return null;
    const week = block.week_index ?? null;
    if (week == null) return null;
    const weeks = block.block_weeks ?? null;
    const where = weeks != null && weeks > 0 ? `week ${week} of ${weeks}` : `week ${week}`;
    return block.phase_word ? `${where} · ${block.phase_word}` : where;
  })();
  const workoutId = sessionDetail?.workout_id ?? (completed as any)?.id ?? null;
  // D-095: per-exercise prior-session lookup populated by workout-detail.
  // Shape: { [normalizedExerciseName]: { date, days_ago, sets: [...] } }.
  const previousByExercise = (sessionDetail?.previous_strength_by_exercise as
    Record<string, { date: string; days_ago: number; sets: any[] }> | null
    | undefined) ?? null;

  // ── D-338: HOW MANY OF THE PLAN'S SLOTS YOU FILLED ────────────────────────────────────────────
  //
  // The denominator is the plan's own list. The numerator is slots FILLED — and the rule for that
  // is already law here: **the slot is the unit of adherence, not the exercise name** (Q-181). A
  // declared swap fills the slot and is never a dock; an undeclared miss is still a miss.
  //
  // ⛔ IT USES `canonicalize`, THE APP'S ONE EXERCISE VOCABULARY — the same keys `exercise_log` and
  // the State trend group on. The first version of this count shipped its own private
  // name-comparison, which made it the SIXTH in the app (audit F5) and would have read "Barbell
  // Back Squat" and "Back Squat" as two different lifts, then reported a lift you did as not done.
  // Michael caught it before it was ever seen: *"are the counts going to be correct?"*
  //
  // ⚠️ RECOMPUTED FROM WHAT IS ON SCREEN, never read from the stored analysis. That analysis is
  // exactly what went stale and produced 117% on a session with no plan attached — a number
  // recomputed from the live lists cannot outlive the thing it describes.
  // D-370: the server's swap pairings, read by BOTH the count below and the table further down.
  // ⚠️ Declared here, above its first use — `const` is not hoisted, and the count reads it.
  //
  // ⛔ THE SLOT NAME IS RE-HOMED ONTO THE ROW THE SCREEN ACTUALLY DRAWS, BECAUSE ONE PLANNED ROW
  // HAS TWO NAMES (2026-08-02, found on Michael's screen — the swap fired and the rows did not
  // collapse, so the same session read "Dips → Dips · NOT IN THE PLAN" beside a "Face Pull" it had
  // just credited).
  //
  // The analyzer reads planned names from `planned_workouts.strength_exercises` — the AUTHORED name,
  // "Face Pull". This screen reads them from `computed.steps[].strength.name` — the MATERIALIZED
  // name, "Band Face Pulls", after materialize prefixed the equipment. `canonicalize` keeps them
  // apart (`face_pull` vs `band_face_pulls`; it does not even fold `face_pull`/`face_pulls`), so
  // every lookup between the two sources missed. Filed as [Q-249] — the divergence is upstream and
  // fixing it here would be fixing the symptom, but the screen may not stay wrong while it waits.
  //
  // ⚠️ THE TOLERANCE IS CONTAINMENT ON CANONICAL KEYS, AND IT IS NOT A NEW VOCABULARY — it is the
  // same `includes()` fallback the server matcher has used as its Tier 2 since Q-181. It is bounded
  // three ways: exact match wins outright; containment is consulted only when exact fails; and an
  // AMBIGUOUS containment (two planned rows both plausible) resolves to nothing rather than to a
  // guess, which leaves the row exactly as it renders today.
  const execSubstitutions: Array<{ planned?: string; executed?: string }> = (() => {
    const raw: Array<{ planned?: string; executed?: string }> =
      Array.isArray(sessionDetail?.execution?.substitutions) ? sessionDetail!.execution!.substitutions as any : [];
    if (!raw.length) return [];
    const key = (n: unknown) => canonicalize(String(n || ''));
    return raw.map((s) => {
      const want = key(s?.planned);
      if (!want) return s;
      const exact = plannedExercises.find((p: any) => key(p?.name) === want);
      if (exact) return { ...s, planned: String(exact.name) };
      const loose = plannedExercises.filter((p: any) => {
        const k = key(p?.name);
        return !!k && (k.includes(want) || want.includes(k));
      });
      return loose.length === 1 ? { ...s, planned: String(loose[0].name) } : s;
    });
  })();

  const completedOfPlanned = (() => {
    const key = (n: unknown) => canonicalize(String(n || ''));
    // A slot counts as filled by an exercise that was actually performed…
    const performed = completedExercises.filter((c: any) =>
      Array.isArray(c?.setsArray) &&
      c.setsArray.some((s: any) => (Number(s?.reps) || 0) > 0 || (Number(s?.duration_seconds) || 0) > 0));
    const filled = new Set(performed.map((c: any) => key(c.name)));
    // …or by one the athlete DECLARED as a replacement for it. `substituted_for` is stamped by the
    // Swap action and names the planned exercise, so the swap answers to the slot it replaced.
    for (const c of performed as any[]) {
      const raw = completedRaw.find((r: any) => key(r?.name) === key(c?.name));
      const sub = raw?.substituted_for;
      if (sub) filled.add(key(sub));
    }
    // …or by one the SERVER paired into an assistance slot (D-370). Without this the count keeps
    // reading "3 of 4" on a session where the table below it now draws four filled rows — the two
    // numbers on one screen disagreeing, which is the fault this whole area exists to prevent.
    // ⚠️ Still recomputed from what is on screen: this reads the server's PAIRING and re-checks the
    // exercise was actually performed, rather than trusting a stored completion count.
    for (const s of execSubstitutions) {
      const slot = String(s?.planned ?? '').trim();
      if (slot && filled.has(key(s?.executed))) filled.add(key(slot));
    }
    return plannedExercises.filter((p: any) => filled.has(key(p.name))).length;
  })();

  // D-208: dynamic "what moved it" line, read from the shared component_attribution structure the
  // analyzer emits. Null when the session is clean (nothing to explain) — then only the static
  // metric explainer shows.
  // Q-181: declared substitutions. The server already decided whether each one is worth saying —
  // an IN-SLOT swap comes back with note:null (nothing was missed; not news). We render only the
  // sentences it chose to speak, verbatim. The client does not re-decide. (Law 4.)
  const execSubstitutionNotes: string[] = (() => {
    const subs = sessionDetail?.execution?.substitutions;
    if (!Array.isArray(subs)) return [];
    return subs
      .map((s: { note?: string | null }) => (typeof s?.note === 'string' ? s.note.trim() : ''))
      .filter((n: string) => n.length > 0);
  })();

  // ⛔ `execWhatMoved` DELETED (D-338). It explained which component cost the most points — "Skipped
  // Dips — main work, counts in full", "RIR drifted from the target" — and it was read off the STORED
  // analysis, so it kept narrating a plan after the session was detached from one. There are no
  // components to attribute any more, because there is no score. The "not logged" mark on each row
  // says what was missed, computed from what is on screen rather than from a saved verdict.

  // Session totals footer — ported from the (now-retired for strength) Details tab so killing
  // that tab loses nothing. Same counting rule as the D-205 fix: every set with reps>0 counts
  // (bodyweight + band included).
  //
  // ⛔ VOLUME IS NO LONGER COUNTED HERE (D-349). This reducer had its own weight-gated
  // `w > 0 && r > 0 ? w * r : 0` — a FOURTH copy of the pre-D-348 rule, and the most visible one:
  // it printed the "Volume" tile directly beneath a table that (after this change) prices chin-ups
  // and dips properly. Two totals about one session, inches apart, disagreeing. It now reads the
  // server's `completed_total_lb`, which is the sum of the very rows drawn above it.
  const totals = (completedExercises as Array<{ name: string; setsArray: any[] }>).reduce(
    (acc, ex) => {
      const sets = Array.isArray(ex.setsArray) ? ex.setsArray : [];
      const withReps = sets.filter((s) => (Number(s?.reps) || 0) > 0);
      acc.sets += withReps.length;
      acc.reps += withReps.reduce((sum, s) => sum + (Number(s?.reps) || 0), 0);
      return acc;
    },
    { sets: 0, reps: 0 },
  );
  const totalVolumeLb = strengthVolume?.completed_total_lb ?? 0;

  return (
    <div className="space-y-4">
      {/* THE BLOCK THIS SESSION BELONGED TO — one quiet line above the numbers it frames, so a light
          week reads as a light week instead of as an under-performed one.
          ⚠️ Present on sessions from FINISHED blocks too (Q-208): the card is deliberately not gated
          on the plan still being active, so history keeps its framing. That is why the plan NAME is
          here — "week 3 of 12" on its own does not say which block, once there has been more than one. */}
      {blockLine && (
        <div className="text-[11px] text-white/40">
          {block?.plan_name ? `${block.plan_name} · ${blockLine}` : blockLine}
        </div>
      )}
      {/* ═══ D-338 — NO EXECUTION PERCENTAGE ON A STRENGTH SESSION ═══════════════════════════════
          No strength app scores a session against its program. Adherence is an ENDURANCE idea —
          TrainingPeaks-style compliance against prescribed pace and duration — and it got borrowed
          onto this screen where it does not belong. Endurance keeps it; strength does not.

          It was also generating three separate wrongs at once:
            · 117% on a session with NO PLAN ATTACHED, off analysis left over from when it was
              wrongly attached and never recomputed on detach;
            · a fifth of the score handed over for free — the RIR term scores 100 when there is no
              RIR data, on a protocol that deliberately never asks for it;
            · a paragraph about "skipped Dips" and "lighter than prescribed" for a plan the athlete
              is not on.
          Deleting the question deletes all three. What replaces it is a FACT, not a grade: how much
          of the plan you got through. The per-row "not logged" marks below say which ones.

          ⛔ AND NOTHING AT ALL WHEN THERE IS NO PLAN. The app already states this law for endurance
          — "adherence means vs what was prescribed; without a plan link there is nothing to be
          measured against" (D-035) — strength simply never obeyed it. */}
      {plannedExercises.length > 0 && (
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Completed</span>
            <span className="text-lg font-semibold text-white">
              {completedOfPlanned} of {plannedExercises.length}
            </span>
            <span className="text-xs text-gray-400">· {plannedExercises.length === 1 ? 'exercise' : 'exercises'}</span>
          </div>
          {/* Q-181 — THE SWAP RECEIPT. A declared swap is never a dock: the slot was filled, and the
              slot is the unit of adherence. This is not a penalty and not a scolding — it is the trade,
              named. An IN-SLOT swap carries note:null and renders NOTHING (nothing was missed, so it is
              not news, and narrating it would make the app a nag). Only an OUT-OF-SLOT swap speaks, and
              that sentence is DETERMINISTIC — computed server-side from `primaryRef`, never LLM prose. */}
          {/* ⛔ THIS IS THE ONE SENTENCE ON THE SCREEN THAT TELLS THE ATHLETE SOMETHING THEY DID NOT
              ALREADY KNOW, and it shipped at 12px/55% — the size of a disclaimer (2026-08-02,
              Michael: *"need this copy bigger and brighter"*). Every other line on this screen
              reports a number the athlete watched themselves produce. This one names a trade they
              made without noticing: a push where the plan had a pull.
              ⚠️ It is DETERMINISTIC — `buildSubstitutionNote` compares the two exercises' movement
              patterns from the config table. No model, no prompt, checkable by hand. Brightening it
              is not promoting a guess. */}
          {execSubstitutionNotes.map((note, i) => (
            <p key={i} className="text-sm text-white/80 mt-1.5 leading-snug">{note}</p>
          ))}
        </div>
      )}
      {/* ⛔ RECOMPUTE LIVES AT THE TOP. It used to be hosted by the narrative header; deleting that
          header for strength dropped it to the very bottom of a long table, below the fold, where
          Michael read it as gone. A control the athlete reaches for when the screen looks wrong
          cannot be the last thing on the screen. */}
      {onRecompute && (
        <div className="flex justify-end -mt-1 mb-2">
          <button
            onClick={onRecompute}
            disabled={recomputing}
            className="px-3 py-1.5 text-xs text-white/45 border border-white/12 rounded-full hover:bg-white/5 hover:text-white/70 transition-colors disabled:opacity-40"
          >
            {recomputing ? 'Recomputing…' : 'Recompute analysis'}
          </button>
        </div>
      )}
      {recomputeError && (
        <p className="text-xs text-rose-400 mb-2">{recomputeError}</p>
      )}
      {/* ── THE ALL-OUT SET (2026-07-30) ─────────────────────────────────────────────────────────
          ⛔ THE REP RECORD LEADS. Wendler p10: *"If your squat goes from 225x6 to 225x9, you've
          gotten stronger. Don't get stuck just trying to increase your one rep max."* The rep count
          at a fixed weight is EXACT; the estimated max is an equation's guess about a number nobody
          measured. So the record is the headline and the estimate sits under it, quieter.

          ⛔ SERVER-COMPUTED, RENDERED VERBATIM. Every value here — the record, the estimate, whether
          the estimate is trustworthy — arrives on `session_detail_v1`. This component decides
          nothing (Law 4), which is also why it cannot disagree with what State shows for the same
          number: both read the one stored value.

          ⚠️ ABSENT ON A LEADER CYCLE AND EVERY DELOAD WEEK, because those carry no all-out set at
          all. Nothing renders, and that is correct rather than a gap. */}
      {/* ⚠️ When the panel is empty it SAYS SO. Silence read as "no all-out set here" three times
          while the real cause was a stale cache, a null plan link and a missing plan row. */}
      {Array.isArray(allOut) && allOut.length === 0 && allOutReason && (
        <div className="mt-3 mb-1 text-[12px] text-white/40">
          {allOutReason === 'session_had_no_all_out_set'
            ? 'No all-out set on this session.'
            : allOutReason === 'no_reps_on_all_out_set'
              ? 'The all-out set has no reps logged.'
              : 'No planned session to read the all-out set from.'}
        </div>
      )}
      {Array.isArray(allOut) && allOut.length > 0 && (
        <div className="mt-3 mb-1 rounded-xl border border-white/12 bg-white/[0.04] p-3">
          <div className="text-[11px] uppercase tracking-wider text-white/45 mb-2">All-out set</div>
          {allOut.map((a: any, i: number) => (
            <div key={i} className={i > 0 ? 'mt-3 pt-3 border-t border-white/10' : ''}>
              <div className="text-sm text-white/90">
                <span className="text-white/60">{a.name}</span>{' '}
                <span className="tabular-nums font-semibold">{a.weight} lb × {a.reps}</span>
              </div>
              {/* The record line. ⚠️ A null prior is NOT a record — nothing to beat is not the same
                  as beating something, so it says so plainly instead of implying a first-time PR. */}
              <div className="text-[13px] mt-0.5">
                {a.is_rep_record ? (
                  <span className="text-emerald-300">
                    Rep record at this weight — your best was {a.prior_best_reps_at_weight}.
                  </span>
                ) : a.prior_best_reps_at_weight != null ? (
                  <span className="text-white/55">
                    Your best at this weight is {a.prior_best_reps_at_weight}.
                  </span>
                ) : (
                  <span className="text-white/45">First time at this weight.</span>
                )}
              </div>
              {/* The estimate, second. ⚠️ Above the rep ceiling it is labelled rather than hidden or
                  capped — a capped rep count would report a 15-rep set as a 10-rep one (D-339). */}
              {/* ⛔ THE HEDGE REWRITTEN (2026-08-03). Was `rough — over N reps no formula holds up`,
                  which Michael read and did not understand: it described OUR ARITHMETIC rather than
                  his lift, and quoted the generic ceiling instead of his own rep count. See
                  `composeAllOutRowText` in `src/lib/strength-row-text.ts` for the full reasoning —
                  ⚠️ THAT FUNCTION COMPOSES THE SAME SENTENCE FOR THE STATE SCREEN. The two must be
                  changed together or one reading gets two wordings on two screens. */}
              <div className="text-[12px] text-white/50 mt-1 tabular-nums">
                Estimated max {a.estimated_1rm} lb
                {!a.estimate_trusted && (
                  <span className="text-white/40">
                    {' '}— a guess from {a.reps} reps. Estimates hold to about {a.estimate_trusted_max_reps}.
                  </span>
                )}
              </div>
            </div>
          ))}
          {/* The 95% week is the one that moves the bar, whatever else is on screen. */}
          {block?.is_measurement_week === true && (
            <p className="text-[12px] text-white/55 mt-2 leading-snug">
              This is the set that sets your next cycle's weight.
            </p>
          )}
        </div>
      )}
      <StrengthCompareTable
        planned={plannedExercises}
        completed={completedExercises}
        completedWorkoutRaw={completed}
        planId={planId}
        plannedWorkoutId={plannedWorkoutId}
        rirSummary={rirSummary}
        previousByExercise={previousByExercise}
        workoutId={workoutId}
        strengthVolume={strengthVolume}
        substitutions={execSubstitutions}
        onAdjustmentSaved={() => {
          window.dispatchEvent(new CustomEvent('plan:adjusted'));
          onRecompute?.();
        }}
      />
      {(totals.sets > 0 || totalVolumeLb > 0) && (
        <div className="grid grid-cols-3 gap-2 pt-3 mt-1 border-t border-white/10 text-center">
          <div>
            <div className="text-lg font-semibold text-white">{totals.sets}</div>
            <div className="text-xs text-white/50">Total Sets</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-white">{totals.reps}</div>
            <div className="text-xs text-white/50">Total Reps</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-white">{totalVolumeLb.toLocaleString()}</div>
            <div className="text-xs text-white/50">Volume (lbs)</div>
          </div>
        </div>
      )}
      {completed?.addons && Array.isArray(completed.addons) && completed.addons.length>0 && (
        <div className="text-sm text-gray-700">
          <div className="font-medium mb-1">Add‑ons</div>
          {completed.addons.map((a:any, idx:number)=> (
            <div key={idx} className="flex items-center justify-between border-t border-gray-100 py-1">
              <span>{a.token?.split('.')[0]?.replace(/_/g,' ') || a.name || 'Addon'}</span>
              <span className="text-gray-600">{a.completed? '✓ ' : ''}{a.duration_min||0}m</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

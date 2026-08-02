import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
// THE app's exercise vocabulary. Rows pair on this so the table cannot disagree with the count
// above it, or with the trend on State, about what a lift is called.
import { canonicalize } from '@/lib/canonicalize';

export interface StrengthSet {
  reps?: number;
  duration_seconds?: number;
  weight: number;
  /** D-094: qualitative weight label (e.g. "Bodyweight", "Heavy barbell", "Band")
   *  surfaced when the planned weight is a non-numeric string. Rendered in place
   *  of the lb-suffixed number. Null/undefined for numeric weights. */
  weight_display?: string;
  rir?: number;
  completed?: boolean;
}
export interface StrengthExercise {
  name: string;
  sets?: number;
  reps?: number;
  duration_seconds?: number;
  weight?: number;
  weight_display?: string;
  target_rir?: number;
  setsArray?: StrengthSet[]
  /** D-338: the REAL per-set prescription (5/3/1's three weights). When present it replaces the
   *  replicate-the-top-weight fallback below — see the comment at `plannedSets`. */
  setPlan?: Array<{ weight: number; reps: number; amrap?: boolean }>;
  /** Q-181: stamped by the Swap action, naming the PLANNED exercise this one stands in for. The slot
   *  is the unit of adherence, so a declared swap pairs to the slot it replaced, not to its own name. */
  substituted_for?: string;
  /** ASSISTANCE. `false` means the plan deliberately prescribed no load — see `assistanceTotalReps`
   *  below for what that changes about the row. Never `true`; absent means "not stated". */
  load_prescribed?: boolean;
}

/**
 * Display-shaped normalization: lowercase, strip (Left)/(Right), collapse spaces. Used for the
 * BODYWEIGHT regex below and nothing else.
 *
 * ⛔ DO NOT REPLACE THIS WITH `canonicalize` — I tried, and it is wrong here. Canonical keys are
 * snake_case (`chin_ups`, `pullup`), and the bodyweight test matches on hyphen-or-space forms
 * (`chin\-?ups?`), so a chin-up would silently stop reading as bodyweight and start rendering a
 * weight column it has no number for.
 *
 * ⚠️ THE LOOKUPS ARE A DIFFERENT QUESTION and they DO use `canonicalize` — see `lookupKey`. Same file,
 * two normalizers, and the note that says which is which is the whole reason this is not a bug.
 */
function normalizeName(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/\s*\((?:left|right)\)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ⛔ THE APP'S ONE EXERCISE VOCABULARY, for anything that has to MATCH (2026-07-30, audit F5).
 *
 * The RIR lookup and the Previous-session lookup used the display normalizer, which is exact-match
 * only — so "Barbell Back Squat" against a logged "Back Squat" found nothing and the Previous column
 * went blank on a lift done for months, while the server counted the same session as done.
 *
 * ⚠️ THE PREVIOUS LOOKUP IS A HANDSHAKE: `workout-detail` builds those keys with `canonicalize` too.
 * Change one side alone and the lookup returns nothing, which renders as "no history" rather than as
 * a bug — the quietest possible failure.
 */
const lookupKey = (raw: unknown): string => canonicalize(String(raw || ''));

/**
 * ⛔ `calcVolume` IS GONE (D-349, 2026-08-01). DO NOT BRING IT BACK.
 *
 * It was `reps × weight` — the pre-D-348 rule — so a chin-up, dip or box jump priced at zero here
 * while the SAME session's load score and `total_volume_lbs` counted them. Two numbers about one
 * session on one screen, disagreeing. Volume now arrives already priced on
 * `session_detail_v1.strength_volume`, from `strengthSetVolume` — the one set rule.
 *
 * ⚠️ THE PAIRING STAYED HERE ON PURPOSE. The server ships two FLAT lists and this table pairs them
 * with `keyOf` exactly as before. The server's own matcher is lowercase-exact and would miss
 * "Barbell Back Squat" against a logged "Back Squat" — pairing there would have re-opened audit F5.
 * The server prices; this file pairs. See `strength_volume` in `session-detail/types.ts`.
 */
function avg<T extends number>(vals: T[]): number { if (!vals.length) return 0; return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length); }

export type RirSummaryEntry = {
  name: string;
  target_rir: number;
  avg_rir: number | null;
  rir_verdict: 'too_easy' | 'on_target' | 'too_hard' | null;
};

/** D-095: per-exercise prior-session payload from workout-detail.
 *  Key is the normalized exercise name (lowercase, (Left)/(Right) stripped). */
export type PreviousStrengthByExercise = Record<string, {
  date: string;
  days_ago: number;
  sets: StrengthSet[];
}>;

/** D-349: server-priced volume load. Two flat lists — this table does the pairing. */
export type StrengthVolumePayload = {
  planned: Array<{ name: string; volume_lb: number }>;
  completed: Array<{ name: string; volume_lb: number }>;
  planned_total_lb: number;
  completed_total_lb: number;
  bodyweight_lb: number | null;
};

interface StrengthCompareTableProps {
  planned: StrengthExercise[];
  completed: StrengthExercise[];
  completedWorkoutRaw?: any;
  planId?: string;
  plannedWorkoutId?: string;
  rirSummary?: RirSummaryEntry[] | null;
  previousByExercise?: PreviousStrengthByExercise | null;
  workoutId?: string | null;
  /** `session_detail_v1.strength_volume`. Absent → the lb column is omitted, never re-derived. */
  strengthVolume?: StrengthVolumePayload | null;
  /**
   * D-370: the server's swap pairings — `session_detail_v1.execution.substitutions`. Each entry
   * names the PLANNED slot and the exercise that filled it.
   *
   * ⛔ THIS IS READ, NEVER RE-DERIVED. The matcher (`_shared/strength/match-exercises.ts`) is the one
   * place allowed to decide which logged exercise answers to which planned slot — "do not write a
   * second matcher" is written at the top of that file, and this table pairing rows on its own
   * inference is exactly what a second matcher would be. A DECLARED swap still arrives the other
   * way, stamped on the logged set as `substituted_for`; an INFERRED one exists only here.
   */
  substitutions?: Array<{ planned?: string; executed?: string }> | null;
  onAdjustmentSaved?: () => void;
}

// Format an ISO date-only string ("2026-05-18") as a short, self-evident label ("May 18").
// Parsed by parts (not new Date()) so a date-only string never shifts a day across timezones.
const PREV_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatPrevDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
  if (!m) return null;
  const month = PREV_MONTHS[parseInt(m[2], 10) - 1];
  return month ? `${month} ${parseInt(m[3], 10)}` : null;
}

export default function StrengthCompareTable({ planned, completed, completedWorkoutRaw, planId: initialPlanId, plannedWorkoutId, rirSummary, previousByExercise, workoutId, strengthVolume, substitutions, onAdjustmentSaved }: StrengthCompareTableProps){
  // editingSet: { exerciseName, setIndex } — which completed set is being edited inline
  const [editingSet, setEditingSet] = useState<{ exerciseName: string; setIndex: number } | null>(null);
  const [editFields, setEditFields] = useState<{ reps: string; weight: string; rir: string }>({ reps: '', weight: '', rir: '' });
  const [savingSet, setSavingSet] = useState(false);

  const startEditSet = (exerciseName: string, setIndex: number, set: StrengthSet) => {
    setEditingSet({ exerciseName, setIndex });
    setEditFields({
      reps: set.reps != null ? String(set.reps) : '',
      weight: set.weight != null ? String(set.weight) : '',
      rir: set.rir != null ? String(set.rir) : '',
    });
  };

  const cancelEditSet = () => {
    setEditingSet(null);
    setEditFields({ reps: '', weight: '', rir: '' });
  };

  const saveEditSet = async () => {
    if (!editingSet || !completedWorkoutRaw?.id) return;
    setSavingSet(true);
    try {
      const exKey = editingSet.exerciseName;
      const setIdx = editingSet.setIndex;
      const raw = completedWorkoutRaw;
      const type = raw?.type?.toLowerCase?.() ?? 'strength';
      const field = type === 'mobility' ? 'mobility_exercises' : 'strength_exercises';

      // Parse current exercises
      let exercises: any[] = [];
      try {
        const val = raw[field];
        exercises = Array.isArray(val) ? val : JSON.parse(val || '[]');
      } catch { exercises = []; }

      // Find exercise by name (case-insensitive)
      const exIdx = exercises.findIndex((e: any) =>
        normalizeName(e.name) === normalizeName(exKey)
      );
      if (exIdx === -1) return;

      const sets: any[] = Array.isArray(exercises[exIdx].sets) ? [...exercises[exIdx].sets] : [];
      if (setIdx >= sets.length) return;

      const updated = { ...sets[setIdx] };
      if (editFields.reps !== '') updated.reps = parseInt(editFields.reps, 10);
      if (editFields.weight !== '') updated.weight = parseFloat(editFields.weight);
      if (editFields.rir !== '') updated.rir = parseFloat(editFields.rir);
      sets[setIdx] = updated;

      const updatedExercises = exercises.map((e: any, i: number) =>
        i === exIdx ? { ...e, sets } : e
      );

      await supabase
        .from('workouts')
        .update({ [field]: updatedExercises })
        .eq('id', raw.id);

      cancelEditSet();
      onAdjustmentSaved?.();
    } catch (e) {
      console.error('saveEditSet error:', e);
    } finally {
      setSavingSet(false);
    }
  };
  
  // Fetch plan ID from planned workout if not provided
  const [resolvedPlanId, setResolvedPlanId] = useState<string | undefined>(initialPlanId);
  
  useEffect(() => {
    if (initialPlanId) {
      setResolvedPlanId(initialPlanId);
      return;
    }
    
    // If no planId but we have plannedWorkoutId, fetch it
    if (!initialPlanId && plannedWorkoutId) {
      (async () => {
        try {
          const { data } = await supabase
            .from('planned_workouts')
            .select('training_plan_id')
            .eq('id', plannedWorkoutId)
            .maybeSingle();
          
          if (data?.training_plan_id) {
            setResolvedPlanId(data.training_plan_id);
          }
        } catch (e) {
          console.error('Failed to fetch plan ID:', e);
        }
      })();
    }
  }, [initialPlanId, plannedWorkoutId]);
  
  const planId = resolvedPlanId;

  const rirSummaryMap = new Map<string, RirSummaryEntry>();
  (rirSummary || []).forEach(e => rirSummaryMap.set(lookupKey(e.name), e));

  // ── ONE ROW PER SLOT (D-338 follow-on) ────────────────────────────────────────────────────────
  //
  // ⛔ PAIRED ON `canonicalize`, THE APP'S ONE EXERCISE VOCABULARY — the same keys `exercise_log`
  // and the State trend group on. This table used to pair on its own local `normalizeName`, which
  // is exact-match only, so a plan saying "Barbell Back Squat" against a logged "Back Squat" drew
  // TWO rows — one marked missed, one marked unplanned — while the server's matcher counted the
  // very same session as done. Same session, two answers (audit F5).
  //
  // ⛔ AND A DECLARED SWAP ANSWERS TO THE SLOT IT REPLACED. `substituted_for` is stamped by the
  // Swap action and names the PLANNED exercise, so the swap keys to that slot and the two collapse
  // into one row. The slot is the unit of adherence, not the name (Q-181) — the count already read
  // it that way and the table did not, so the number said done while the table said missed.
  const keyOf = (n: unknown) => canonicalize(String(n || ''));
  const plannedMap = new Map<string, StrengthExercise>();
  planned.forEach(p => plannedMap.set(keyOf(p.name), p));

  // ⛔ ONE ANSWER TO "WHICH SLOT DOES THIS EXERCISE ANSWER TO", USED BY ALL THREE READERS BELOW —
  // the row pairing, the swap label, and the volume re-home (D-370). They each used to read
  // `substituted_for` directly, which was fine while a declaration was the only kind of swap; now
  // that the matcher can INFER one, three copies of the question would answer it three ways the
  // moment any of them was touched.
  //
  // ORDER IS THE PRECEDENCE, and it matches the matcher's own tiers: what the athlete DECLARED
  // outranks what the server inferred, which outranks the exercise's own name.
  const inferredSlotByExercise = new Map<string, string>();
  (substitutions ?? []).forEach((s) => {
    const performed = keyOf(s?.executed);
    const slot = String(s?.planned ?? '').trim();
    if (performed && slot) inferredSlotByExercise.set(performed, slot);
  });
  const slotFor = (c: any): string =>
    String(c?.substituted_for || inferredSlotByExercise.get(keyOf(c?.name)) || c?.name || '');

  const completedMap = new Map<string, StrengthExercise>();
  completed.forEach(c => {
    completedMap.set(keyOf(slotFor(c)), c);
  });

  // Is there a prescription to compare against at all? Everything that grades, labels or totals
  // against the plan hangs off this — with no plan there is nothing to be measured against (D-035).
  const hasPlan = plannedMap.size > 0;

  // ⛔ D-349 — the server's priced volume, re-keyed with THIS table's own pairing function.
  //
  // The payload ships each entry under the exercise's own NAME, not under a server-side key, and it
  // is re-keyed here with the same `keyOf` the rows above are paired with. That is the point: the
  // server's `canonicalize` carries a curated synonym/plural/parenthetical ladder (Q-197/Q-210) that
  // the client's does not, so a server-canonical KEY is not reliably a client-canonical key — the
  // lookup would miss on exactly the decorated names the ladder exists for, and a miss here renders
  // as "no volume" rather than as a bug. Keying off the raw name makes that mismatch impossible.
  const plannedVolByKey = new Map<string, number>();
  (strengthVolume?.planned ?? []).forEach(e => plannedVolByKey.set(keyOf(e.name), e.volume_lb));
  const completedVolByKey = new Map<string, number>();
  (strengthVolume?.completed ?? []).forEach(e => completedVolByKey.set(keyOf(e.name), e.volume_lb));
  // ⚠️ A DECLARED SWAP ANSWERS TO THE SLOT IT REPLACED — the same rule the row pairing uses above
  // (Q-181: the slot is the unit of adherence, not the name). The server ships the volume under the
  // exercise the athlete actually did; the table draws that work under the PLANNED slot. Without
  // this re-home the row is drawn and its volume is filed under a key nothing renders.
  completed.forEach(c => {
    const filledSlot = slotFor(c);
    if (!filledSlot || keyOf(filledSlot) === keyOf(c.name)) return;
    const vol = completedVolByKey.get(keyOf(c.name));
    if (vol != null) completedVolByKey.set(keyOf(filledSlot), vol);
  });
  const hasServerVolume = strengthVolume != null;

  const allKeys = Array.from(new Set([...plannedMap.keys(), ...completedMap.keys()]));

  const rows = allKeys.map(k => {
    const p = plannedMap.get(k);
    const c = completedMap.get(k);
    // What the athlete ACTUALLY did, when it differs from what was asked. Drives the swap receipt
    // on the row — never a dock, just the trade named.
    // ⚠️ Reads `slotFor`, so an INFERRED pairing gets the same "→ Dips" label a declared one does.
    // The row must name the trade either way — a row silently retitled to an exercise the plan never
    // asked for is the worst of the three options.
    //
    // ⛔ AND IT MUST NOT NAME THE ROW AFTER ITSELF. When the server's slot name cannot be re-homed
    // onto a planned row this screen actually draws, the completed exercise ends up keyed under its
    // own slot with NO PLANNED PARTNER — the row is then titled from `c.name` and this line rendered
    // "Dips → Dips · NOT IN THE PLAN" on Michael's screen. A swap label reports a PAIRING; with
    // nothing to pair to, there is nothing to say.
    // ⚠️ The guard is `!!p`, not a comparison against `displayName` — that is declared a few lines
    // below and reading it here is a temporal-dead-zone crash, not a subtle bug.
    const swappedWith = !!p && c?.name && keyOf(slotFor(c)) === k && keyOf(c.name) !== k ? String(c.name) : null;
    // ⚠️ The row's DISPLAY name, and the legacy key derived from it. `k` is now a canonical slug
    // ("chin_up"), so anything that used to read the key as prose — the bodyweight regex below, and
    // the two lookups further down whose maps are still built with `normalizeName` — has to go
    // through the name instead. Changing the pairing key must not silently change those.
    const displayName = p?.name || c?.name || k;
    const legacyKey = normalizeName(displayName);
    // Check if exercise pattern suggests bodyweight, BUT if weight was logged, treat as weighted
    const cSetsArrCheck = (c as any)?.setsArray as StrengthSet[] | undefined;
    const hasLoggedWeight = Array.isArray(cSetsArrCheck) && cSetsArrCheck.some(s => s.weight && s.weight > 0);
    const isBodyweightPattern = /dip|chin\-?ups?|pull\-?ups?|push\-?ups?|plank/.test(legacyKey);
    const isBodyweight = isBodyweightPattern && !hasLoggedWeight && !(p?.weight && p.weight > 0);
    const pSets = (p?.sets || 0);
    const pReps = (p?.reps || 0);
    const pDuration = (p?.duration_seconds || 0);
    const pW = (p?.weight || 0);
    const pWDisplay = (p as any)?.weight_display as string | undefined;
    const targetRir = p?.target_rir;
    const cSetsArrRaw = (c as any)?.setsArray as StrengthSet[] | undefined;
    const cSetsArr = Array.isArray(cSetsArrRaw)
      ? cSetsArrRaw.filter((s:any)=> s && typeof s === 'object'
          // D-204: drop pure untouched prefills (completed!==true && prefilled) — a
          // prescription the athlete never engaged is not a receipt. Legacy sets lack the
          // flag and are kept. (Zero-weight/zero-rep real sets are still kept.)
          && !(s.completed !== true && s.prefilled === true))
      : [];
    const cSets = Array.isArray(cSetsArr) ? cSetsArr.length : 0;
    const cRepsAvg = Array.isArray(cSetsArr) ? avg(cSetsArr.map(s=>s.reps||0)) : 0;
    // The SUM, not the average — on an assistance row the total is the prescription, so the total
    // is what the work has to be read against (Michael, 2026-08-02: *"we should see the planned
    // number the completed work off of"*). `cRepsAvg` above answers a different question and is used
    // by the main-lift rows; both are kept, and this comment is why there are two.
    const cRepsTotal = Array.isArray(cSetsArr) ? cSetsArr.reduce((s, st) => s + (Number(st?.reps) || 0), 0) : 0;
    const cWAvg = Array.isArray(cSetsArr) ? avg(cSetsArr.map(s=>s.weight||0)) : 0;
    // D-349: priced by the server's one set rule. 0 when the payload has no entry for this row.
    const cVol = completedVolByKey.get(k) ?? 0;
    
    // Calculate actual RIR average from completed sets
    const rirValues = cSetsArr.filter(s => typeof s.rir === 'number').map(s => s.rir as number);
    const actualRir = rirValues.length > 0 ? rirValues.reduce((a, b) => a + b, 0) / rirValues.length : undefined;
    
    const serverRir = rirSummaryMap.get(lookupKey(displayName));
    const status: 'matched'|'skipped'|'swapped' = p && c ? 'matched' : (p && !c ? 'skipped' : (!p && c ? 'swapped' : 'matched'));
    // Build 1:1 planned vs completed sets.
    // D-094: replicate the aggregate planned values (weight / reps / target RIR / qualitative
    // weight label) across all N sets — coaches prescribe at the exercise level, not per-set,
    // so all planned sets render the same target. Carry target_rir as `rir` so fmt() with
    // showRir=true renders "(RIR N)" on the Planned column.
    // ⛔ D-338 — THE AUTHORED RAMP WINS. On 5/3/1 the three sets are three different weights, and
    // replicating the top weight across all of them made a correct session read as under-plan on its
    // first two sets and print a negative volume delta. `setPlan` is the composer's own prescription,
    // carried through materialize; the replicate-the-aggregate path below still serves every other
    // protocol, where a coach genuinely does prescribe at the exercise level.
    const authoredPlan = Array.isArray((p as any)?.setPlan) ? (p as any).setPlan as Array<{ weight: number; reps: number; amrap?: boolean }> : null;
    const plannedSets: StrengthSet[] = authoredPlan?.length
      ? authoredPlan.map((ap) => {
          const set: StrengthSet = { weight: Number(ap.weight) || 0 };
          if (pWDisplay) set.weight_display = pWDisplay;
          if (Number(ap.reps) > 0) set.reps = Number(ap.reps);
          if (typeof targetRir === 'number') set.rir = targetRir;
          // The all-out set is the one that moves the training max — it prints "5+", not "5".
          if (ap.amrap) (set as any).amrap = true;
          return set;
        })
      : Array.from({ length: Math.max(0, pSets) }, () => {
          const set: StrengthSet = { weight: pW };
          if (pWDisplay) set.weight_display = pWDisplay;
          if (pDuration > 0) {
            set.duration_seconds = pDuration;
          } else {
            set.reps = pReps;
          }
          if (typeof targetRir === 'number') set.rir = targetRir;
          return set;
        });
    // ⛔ AN ASSISTANCE ROW IS PRESCRIBED AS A TOTAL, AND THE TOTAL IS THE WHOLE PRESCRIPTION
    // (2026-08-02, Michael: *"25 are planned, how they are executed is up to user — so they
    // shouldn't get lost"*).
    //
    // Wendler prescribes assistance as a rep TOTAL and never as sets, and never with a load:
    // dips *"50 total reps… 100 total reps if you're just using your bodyweight"*, chins *"no less
    // than 100 per week"*, the bodyweight template *"no less than 75 reps per exercise for each
    // workout"* — and immediately after: *"These numbers are just recommendations, so you can do
    // more or less depending on your strength level."* On load he is blunter still: *"Let the big
    // lifts stress the joints and mind; let the small lifts stress the muscles… It's best to use
    // the lightest weight possible so you don't wreck your joints."* The only assistance he ever
    // puts a percentage on is ONE big loadable lift per day (close-grip bench, front squat, incline,
    // stiff-leg deadlift), each off its own tested max — and he names face pulls and dumbbell
    // benches specifically as NOT qualifying. Nothing in this app authors that category.
    //
    // So `pSets` is 0 on these rows BY DESIGN, `plannedSets` is therefore empty, and every Planned
    // cell rendered "—" on a lift the plan had plainly asked 25 reps of. A row that was never
    // logged at all (`Band Face Pulls`) drew a column header over nothing.
    //
    // ⚠️ THE FIX IS NOT TO SYNTHESISE SET ROWS. Splitting 25 into "5 × 5" states a prescription
    // that was never made — the same lie `sets: 1` told when it rendered "1×25" (Michael: *"25 chin
    // ups? lol i can do 5"*). The total goes on the row HEADER, where it cannot be lost and cannot
    // be mistaken for a per-set target, and the sets below it are simply what was done.
    const assistanceTotalReps = p?.load_prescribed === false && pReps > 0 ? pReps : null;
    const completedSets: StrengthSet[] = cSetsArr;
    // D-095: PREVIOUS column — last session's actual per-set data for this exercise.
    // ⚠️ Keyed by `canonicalize`, matching how `workout-detail` builds the map.
    const previousEntry = previousByExercise?.[lookupKey(displayName)] ?? null;
    const previousSets: StrengthSet[] = Array.isArray(previousEntry?.sets) ? previousEntry!.sets : [];
    const previousDate = previousEntry?.date ?? null;
    const previousDaysAgo = typeof previousEntry?.days_ago === 'number' ? previousEntry!.days_ago : null;
    // ⛔ THE PREVIOUS SESSION DOES NOT GET TO INVENT SET ROWS. `previousSets.length` was in this
    // max, so an old session with more sets than today's stretched the table — a 3×5+ press day
    // drew FIVE numbered rows because the session six days earlier had five sets, and rows 4 and 5
    // showed a prescription that was never made. Michael, 2026-07-30: "3 are prescibed i think its
    // locked to the 5 x 5 template?" — it was reading his old 5×5 block.
    // The row count is THIS session: what was asked for, or what was done, whichever is longer.
    // Previous still fills the rows that exist and is simply absent past them, which is the honest
    // shape — there is nothing to compare a set you did not do to.
    const maxLen = Math.max(plannedSets.length, completedSets.length);
    const pairs = Array.from({ length: maxLen }, (_, i) => ({
      planned: plannedSets[i],
      completed: completedSets[i],
      previous: previousSets[i],
    }));
    // ⛔ D-349 — PLANNED VOLUME IS THE SERVER'S NUMBER NOW, and D-338 still holds because the server
    // prices the AUTHORED RAMP (`setPlan`) — the same three weights this table renders — rather than
    // replicating the top set. Pinned in `session-detail-strength-volume.test.ts`: an authored ramp
    // prices as 170×5 + 180×5 + 190×5, not 190 three times, so the delta below can never disagree
    // with the set rows above it. That parity is the whole reason this line may be a lookup.
    const pVolFromSets = plannedVolByKey.get(k) ?? 0;
    // The word the athlete tapped on their heaviest set — 5/3/1's replacement for RIR (D-338).
    const topCompletedIdx = (() => {
      if (!cSetsArr.length) return -1;
      const weights = cSetsArr.map((s) => Number(s?.weight) || 0);
      const max = Math.max(...weights);
      return max > 0 ? weights.lastIndexOf(max) : -1;
    })();
    const difficulty = topCompletedIdx >= 0 ? (cSetsArr[topCompletedIdx] as any)?.difficulty ?? null : null;
    return { name: displayName, swappedWith, pSets, pReps, pDuration, pW, pVol: pVolFromSets, cSets, cRepsAvg, cRepsTotal, cWAvg, cVol, status, pairs, isBodyweight, targetRir, actualRir, serverRir, previousDate, previousDaysAgo, hasPrevious: previousSets.length > 0, difficulty, assistanceTotalReps } as any;
  });

  // ⛔ THE `totals` REDUCER IS DELETED, NOT ORPHANED. It fed the "vs plan" row at the bottom of this
  // file and nothing else; leaving it computed-then-discarded is the exact trap Q-246 catalogues —
  // a future session finds a working total sitting right there and switches a row back on without
  // reading why it came off. The reasoning is at the delete site.

  // Prefer server verdict when available; fall back to local heuristic
  const isRirConcerning = (targetRir?: number, actualRir?: number, verdict?: string | null) => {
    if (verdict != null) return verdict === 'too_hard';
    if (actualRir == null) return false;
    if (targetRir != null) return actualRir < targetRir - 0.5;
    return actualRir <= 1.5;
  };

  const rirAdvice = (verdict?: string | null): string | null => {
    if (verdict === 'too_hard') return 'Going too hard — reduce weight or add reps in reserve';
    if (verdict === 'too_easy') return 'Leaving too much in the tank — increase weight next session';
    if (verdict === 'on_target') return 'RIR on target';
    return null;
  };

  return (
    <div className="space-y-3">
      {/* ⛔ THE EDIT HINT IS GONE (2026-07-30, Michael). It sat above every strength session, in
          amber, permanently — instructions for a control that is already visible on every row. A
          persistent banner teaching an affordance the athlete has used a hundred times is noise
          occupying the most valuable space on the screen. The ✎ stays; the sign pointing at it does not. */}

      {rows.map((r: any, i)=> {
        const verdict = r.serverRir?.rir_verdict ?? null;
        const rirConcern = isRirConcerning(r.targetRir, r.actualRir, verdict);
        const advice = rirAdvice(verdict);
        
        return (
          <div key={i} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{r.name}</span>
                {/* ⛔ D-338 — SAY WHICH IT IS. `status` has been computed on every row since this
                    table was written and rendered NOWHERE, so a lift you skipped and a lift that was
                    never asked for looked identical: a dash on one side. Michael, on the strength
                    Performance screen: "the whole thing is a mess". */}
                {/* A DECLARED swap is never a dock — the slot was filled. It gets the trade named,
                    on one row, instead of the miss-plus-unplanned pair it used to draw. */}
                {/* ⛔ THE SUBSTITUTE IS TITLE TEXT, NOT AN ANNOTATION (2026-08-02, Michael: *"Dips…
                    should be the same size as the one its replacing"*). It shipped at 11px/45% —
                    a footnote hanging off the name — and the exercise he ACTUALLY DID read as
                    smaller and dimmer than the one he didn't. On a ledger the work performed is
                    never the subordinate half of the pair. Matches the name's own classes exactly;
                    the arrow stays quiet because the arrow is punctuation, not information. */}
                {r.swappedWith && (
                  <span className="text-sm font-medium text-white">
                    <span className="text-white/40">→ </span>{r.swappedWith}
                  </span>
                )}
                {r.status === 'skipped' && !r.swappedWith && (
                  <span className="text-[11px] text-white/45 uppercase tracking-wide">not logged</span>
                )}
                {/* ⚠️ ONLY MEANINGFUL WHEN THERE IS A PLAN. With none attached, EVERY row is
                    "not in the plan" — which is noise, not information, and it read as an accusation
                    on a session the athlete simply logged freely. Michael, 2026-07-30. */}
                {r.status === 'swapped' && hasPlan && (
                  <span className="text-[11px] text-white/45 uppercase tracking-wide">not in the plan</span>
                )}
                {/* THE PRESCRIPTION, ON THE ROW IT BELONGS TO. This is the ONLY thing the plan said
                    about this movement — a rep total, no sets, no load — and until now the screen
                    dropped it entirely. It rides beside the name so it survives a row with no sets
                    logged, which is exactly the row that most needs to show what was asked for.
                    ⚠️ "by feel" is not decoration: it is the prescription. `load_prescribed: false`
                    means the plan declined to name a weight, and the athlete should read that as an
                    instruction rather than as a missing number. */}
                {/* Brightened one notch with the swap label above (2026-08-02). This is the ONLY
                    thing the plan said about the movement — at 11px/45% it read as a disabled
                    caption rather than as the prescription, which is the same fault the intake copy
                    was corrected for on 2026-07-27. Still subordinate to the name, deliberately:
                    it is what was ASKED, and the name is what the row IS. */}
                {/* ⛔ IT SAYS "PLANNED", BECAUSE NOTHING ELSE ON THIS ROW DOES (2026-08-02, Michael:
                    *"25 total by feel should have planned"*). Dropping the Planned COLUMN from
                    assistance rows was right — there is no per-set plan to put in it — but it also
                    removed the only word telling the athlete that this number is a prescription
                    rather than a result. Every other row on the screen has that label sitting over
                    its middle column. This is the label, moved to where the prescription now lives. */}
                {r.assistanceTotalReps != null && (
                  <span className="text-sm text-white/80">
                    <span className="text-white/50">Planned </span>{r.assistanceTotalReps} total · by feel
                  </span>
                )}
              </div>
              {/* THE THREE WORDS — how the top set felt. 5/3/1 dictates the weight, so there is
                  nothing for reps-in-reserve to decide; this is what replaced it (D-338). Shown as
                  the athlete's own word, never as a number and never as a score. Blank stays blank —
                  answering is optional and always was. */}
              {r.difficulty && (
                <span className="text-[12px] text-white/60">
                  {r.difficulty === 'moved_well' ? 'Moved well' : r.difficulty === 'worked_for_it' ? 'Worked for it' : 'Grind'}
                </span>
              )}
              {/* RIR comparison - show when both target and actual exist */}
              {r.targetRir != null && r.actualRir != null && (
                <div className={`flex items-center gap-1 px-2.5 py-1 rounded text-sm ${
                  rirConcern ? 'bg-amber-500/20' : 'bg-white/5'
                }`}>
                  <span className={`font-semibold ${rirConcern ? 'text-amber-400' : 'text-white'}`}>
                    {r.actualRir.toFixed(1)}
                  </span>
                  <span className="text-white/40">/</span>
                  <span className="font-semibold text-white/60">{r.targetRir}</span>
                  <span className="text-white/40 text-xs ml-1">RIR</span>
                </div>
              )}
            </div>
            {advice && (
              <p className={`text-xs mb-1 ${rirConcern ? 'text-amber-400/80' : verdict === 'too_easy' ? 'text-sky-400/80' : 'text-white/40'}`}>
                {advice}
              </p>
            )}
            {/* D-095: PREVIOUS column added when prior-session data exists for this
                exercise. 12-col grid rebalances Set/Planned/Completed when present;
                falls back to the original 2/5/5 layout when absent. */}
            {/* ⛔ NO ROWS, NO COLUMN HEADERS. A lift that was never logged used to draw
                "Set · Planned · Completed" over empty space — a table promising three facts and
                delivering none. The prescription now lives on the name line above, which is the
                whole point: a skipped lift still says what was asked for. */}
            {/* ⛔ 50% WHITE ON BLACK READS AS DISABLED (2026-08-02, Michael: *"set completed isnt
                bright enough"*). These are the column headers that tell you which number is which;
                they are not decoration, and they were dimmer than the data they label. Same
                correction, same reason, as the intake prose on 2026-07-27. */}
            {r.pairs.length > 0 && (
            <div className="grid grid-cols-12 text-xs font-medium text-white/70 border-b border-white/20 pb-1">
              <div className="col-span-2">Set</div>
              {/* ⛔ AN ASSISTANCE ROW HAS NO PLANNED COLUMN, because there is no per-set plan to put
                  in it (see `assistanceTotalReps`). Keeping the column and filling it with dashes
                  reads as data the app failed to load; the prescription is on the header line. */}
              {r.assistanceTotalReps != null ? (
                r.hasPrevious ? (
                  <>
                    <div className="col-span-4" title={r.previousDate ? `${r.previousDate}${r.previousDaysAgo != null ? ` · ${r.previousDaysAgo} days ago` : ''}` : undefined}>
                      Previous{formatPrevDate(r.previousDate) ? <span className="text-white/30 font-normal"> · {formatPrevDate(r.previousDate)}</span> : (r.previousDaysAgo != null ? <span className="text-white/30 font-normal"> · {r.previousDaysAgo}d</span> : null)}
                    </div>
                    <div className="col-span-5">Completed</div>
                  </>
                ) : (
                  <div className="col-span-9">Completed</div>
                )
              ) : r.hasPrevious ? (
                <>
                  <div className="col-span-3" title={r.previousDate ? `${r.previousDate}${r.previousDaysAgo != null ? ` · ${r.previousDaysAgo} days ago` : ''}` : undefined}>
                    Previous{formatPrevDate(r.previousDate) ? <span className="text-white/30 font-normal"> · {formatPrevDate(r.previousDate)}</span> : (r.previousDaysAgo != null ? <span className="text-white/30 font-normal"> · {r.previousDaysAgo}d</span> : null)}
                  </div>
                  <div className="col-span-3">Planned</div>
                  <div className="col-span-4">Completed</div>
                </>
              ) : (
                <>
                  <div className="col-span-5">Planned</div>
                  <div className="col-span-5">Completed</div>
                </>
              )}
            </div>
            )}
            <div className="space-y-1">
              {r.pairs.map((pair: any, idx: number) => {
                const p = pair.planned as StrengthSet | undefined;
                const c = pair.completed as StrengthSet | undefined;
                const formatSeconds = (s: number) => {
                  const mins = Math.floor(s / 60);
                  const secs = s % 60;
                  return mins > 0 ? `${mins}:${String(secs).padStart(2,'0')}` : `${s}s`;
                };
                const fmt = (s?: StrengthSet, isBw?: boolean, showRir?: boolean) => {
                  if (!s) return '—';
                  // D-094: also accept weight_display (qualitative weight like "Bodyweight")
                  // and a target RIR as meaningful signal — the prior guard returned "—"
                  // for every planned set on rows where reps was a string range or weight
                  // was qualitative (both coerced to 0 upstream).
                  const hasNumericContent = !!(s.reps || s.duration_seconds || s.weight);
                  const hasQualitativeWeight = !!s.weight_display;
                  const hasRirSignal = showRir && typeof s.rir === 'number';
                  if (!hasNumericContent && !hasQualitativeWeight && !hasRirSignal) return '—';
                  // RIR clause — prefixed "RIR" for clarity (used identically for planned
                  // target and completed actual; column header disambiguates).
                  const rirTxt = showRir && typeof s.rir === 'number' ? ` (RIR ${s.rir})` : '';
                  // Weight clause: qualitative label wins over numeric when present.
                  const weightClause = (() => {
                    if (isBw) return '';
                    if (s.weight_display) return ` × ${s.weight_display}`;
                    if (typeof s.weight === 'number' && s.weight > 0) return ` @ ${Math.round(s.weight)} lb`;
                    return '';
                  })();
                  // Duration-based exercises (planks, carries) — duration goes first.
                  if (s.duration_seconds && s.duration_seconds > 0) {
                    return `${formatSeconds(s.duration_seconds)}${weightClause}${rirTxt}`;
                  }
                  // Rep-based exercises.
                  // ⛔ THE ALL-OUT SET SAYS SO. "5+" is 5/3/1's own notation for "at least five, then
                  // as many as you can" — and that rep count is the measurement that moves the
                  // training max (D-338). Printing it as a flat "5 reps" made the one set that
                  // matters look like every other set, and made a 9-rep effort read as +4 over plan
                  // rather than as the reading it is.
                  const repsTxt = (s as any).amrap ? `${s.reps || 0}+ reps` : `${s.reps || 0} reps`;
                  return `${repsTxt}${weightClause}${rirTxt}`;
                };
                const isEditing = editingSet?.exerciseName === r.name && editingSet?.setIndex === idx;
                return (
                  <div key={idx}>
                    {isEditing ? (
                      <div className="py-1.5 space-y-2">
                        <div className="flex items-center gap-2">
                          {c?.duration_seconds == null && (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-white/40 uppercase">Reps</span>
                              <input
                                type="number" inputMode="numeric"
                                value={editFields.reps}
                                onChange={e => setEditFields(f => ({ ...f, reps: e.target.value }))}
                                className="w-14 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-sm text-center focus:outline-none focus:border-amber-500"
                              />
                            </div>
                          )}
                          {!r.isBodyweight && (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-white/40 uppercase">Weight (lb)</span>
                              <input
                                type="number" inputMode="decimal"
                                value={editFields.weight}
                                onChange={e => setEditFields(f => ({ ...f, weight: e.target.value }))}
                                className="w-16 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-sm text-center focus:outline-none focus:border-amber-500"
                              />
                            </div>
                          )}
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-white/40 uppercase">RIR</span>
                            <input
                              type="number" inputMode="decimal"
                              value={editFields.rir}
                              onChange={e => setEditFields(f => ({ ...f, rir: e.target.value }))}
                              className="w-12 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-sm text-center focus:outline-none focus:border-amber-500"
                            />
                          </div>
                          <div className="flex gap-1.5 ml-auto">
                            <button
                              onClick={cancelEditSet}
                              className="px-2.5 py-1 text-xs border border-white/20 rounded text-white/50 hover:bg-white/5"
                            >Cancel</button>
                            <button
                              onClick={saveEditSet}
                              disabled={savingSet}
                              className="px-2.5 py-1 text-xs bg-amber-500 text-black rounded font-medium hover:bg-amber-400 disabled:opacity-50"
                            >{savingSet ? '…' : 'Save'}</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-12 text-sm group">
                        <div className="col-span-2 text-white/60">{idx+1}</div>
                        {/* Column spans mirror the header above exactly — an assistance row drops
                            Planned and gives the space to what was actually done. */}
                        {r.assistanceTotalReps != null ? (
                          r.hasPrevious ? (
                            <>
                              <div className="col-span-4 text-white/50">{fmt(pair.previous, r.isBodyweight, true)}</div>
                              <div className="col-span-5 text-white/90">{fmt(c, false, true)}</div>
                            </>
                          ) : (
                            <div className="col-span-9 text-white/90">{fmt(c, false, true)}</div>
                          )
                        ) : r.hasPrevious ? (
                          <>
                            {/* ⛔ PLANNED READS AT THE SAME LEVEL AS COMPLETED (2026-08-02, Michael:
                                *"planned should be same lumosity"*). They are the two halves of the
                                row — what the block prescribed, and what happened — and the
                                prescription was rendered a third dimmer than the result, so the
                                number the athlete was TOLD to hit looked like the subordinate one.
                                ⚠️ PREVIOUS stays lower on purpose. It is context from another
                                session, not a fact about this one; levelling all three would make
                                the row read as three equal prescriptions. */}
                            <div className="col-span-3 text-white/50">{fmt(pair.previous, r.isBodyweight, true)}</div>
                            <div className="col-span-3 text-white/90">{fmt(p, r.isBodyweight, true)}</div>
                            <div className="col-span-3 text-white/90">{fmt(c, false, true)}</div>
                          </>
                        ) : (
                          <>
                            <div className="col-span-5 text-white/90">{fmt(p, r.isBodyweight, true)}</div>
                            <div className="col-span-4 text-white/90">{fmt(c, false, true)}</div>
                          </>
                        )}
                        {c && workoutId && (
                          <div className="col-span-1 flex justify-end">
                            <button
                              onClick={() => startEditSet(r.name, idx, c)}
                              className="text-white/20 hover:text-white/60 transition-colors text-xs leading-none"
                              title="Edit this set"
                            >✎</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* ⛔ THE ONE COMPARISON AN ASSISTANCE ROW CAN HONESTLY MAKE: reps against the total.
                Not sets, not load — the plan named neither. This is the counterpart to the header
                line: the header says what was asked, this says how much of it got done, and between
                them the prescription is never lost even on a row with nothing logged (`0 of 25`).
                ⚠️ It is a COUNT, not a grade — no colour, no percentage, no verdict. Wendler on
                these totals: *"These numbers are just recommendations, so you can do more or less
                depending on your strength level."* Going over is not an overshoot and going under is
                not a miss, so nothing here is allowed to render as either. */}
            {/* ⛔ ONE LUMINOSITY ACROSS THE PAIR (2026-08-02, Michael: *"25 total by feel / of 25
                reps should be the same luminosity"*). These two lines are halves of ONE statement —
                the header says what was asked, this says how much of it got done — and they were
                rendered in three different values between them (65% on the header; 80% on the count
                and 50% on its label here). Three weights across one sentence makes the eye read a
                hierarchy that is not there. Both lines now sit at 14px/80% — raised together, on a
                second pass the same afternoon (*"25 of 25 larger and brighter"*), so the pair keeps
                moving as one.
                ⚠️ THE COUNT IS NOT EMPHASISED ABOVE ITS OWN LABEL, and that is the part to preserve
                if these values change again: this is a tally, not a headline, and making the number
                pop re-introduces exactly the "score" reading D-338 spent a session removing from
                this screen.
                ⚠️ A JSX comment may NOT sit between `(` and its element inside `{cond && ( … )}` —
                that is a syntax error, not a comment. Second time today. It goes ABOVE the guard. */}
            {r.assistanceTotalReps != null && (
              <div className="text-sm text-white/80 border-t border-white/10 pt-1 flex items-center justify-end gap-1.5">
                <span>{r.cRepsTotal.toLocaleString()}</span>
                <span>of {r.assistanceTotalReps.toLocaleString()} reps</span>
              </div>
            )}
            {/* Only show volume line when planned has volume to compare against */}
            {/* ⛔ A ROW THE PLAN NEVER PRICED STILL DID REAL WORK (D-349 follow-up, 2026-08-01).
                This gate was `r.pVol > 0` — volume renders only if the PRESCRIPTION had a number.
                Defensible while both sides were barbell tonnage; wrong the moment bodyweight started
                counting, because it hid the number on exactly the work D-348/D-349 exist to surface.
                ⚠️ An ASSISTANCE row is authored `sets: undefined` / `reps: "25 total"` /
                `weight: "By feel"` (strength-primary-plan.ts:317, deliberate — Michael: *"25 chin ups?
                lol i can do 5"* — so no surface renders a set count that was never prescribed). Planned
                volume is therefore 0 by design, and every chin-up, dip and pull-up in a Get Stronger
                block fell through this gate silently. */}
            {(r.pVol > 0 || r.cVol > 0) && (
              <div className="text-xs border-t border-white/10 pt-1 flex items-center justify-end gap-2">
                <span className="text-white/50">Vol:</span>
                {r.pVol > 0 ? (
                  <>
                    <span className="text-white/60">{r.pVol.toLocaleString()} lb</span>
                    <span className="text-white/40">→</span>
                    <span className="text-white/80">{r.cVol.toLocaleString()} lb</span>
                    <span className={(r.cVol - r.pVol)>=0 ? 'text-green-400' : 'text-rose-400'}>
                      {(r.cVol - r.pVol >= 0 ? '+' : '-')}{Math.abs(r.cVol - r.pVol).toLocaleString()} lb
                    </span>
                  </>
                ) : (
                  // ⛔ NO DELTA AGAINST A PLAN THAT NEVER PRESCRIBED LOAD. Rendering "+1,400 lb" here
                  // would read as massively over plan when the plan simply never priced the row —
                  // a fabricated verdict on a number the athlete was never given. State the fact.
                  <span className="text-white/80">{r.cVol.toLocaleString()} lb</span>
                )}
              </div>
            )}
          </div>
        );
      })}
      {/* ⛔ "vs plan" IS DELETED (2026-08-02) — IT IS NOT A 5/3/1 MEASUREMENT, AND IT COULD NOT BE
          COMPUTED HONESTLY IF IT WERE.

          The label was already fixed once: it used to say "Totals" and Michael read "+7,640 lb" as
          his volume (2026-07-31). Naming it "vs plan" made it an honest label on a number that
          should not exist.

          TWO REASONS, EITHER SUFFICIENT.

          1. THE ARITHMETIC IS BETWEEN TWO DIFFERENT SESSIONS. The plan prices ONLY the main lift —
             assistance is authored with no load by design — while the completed side prices every
             row, bodyweight included (D-348/D-349). On the 2026-08-02 bench day that is 1,575 lb of
             prescription against 13,215 lb of work, printed as "+11,640 lb". It reads as a massive
             overshoot; it is a category error. Any Get Stronger session with assistance on it
             produces the same fake surplus, and the more assistance the athlete does the "better"
             the number gets.

          2. WENDLER DOES NOT COUNT IT. Tonnage appears nowhere in 5/3/1. His own training log (2nd
             ed., pp. 123-130) has four columns — one per main lift — carrying Actual Max, Training
             Max, the three prescribed sets, a blank weight column, and a REP RECORDS table.
             Assistance has no row on that sheet at all. The measurement 5/3/1 tracks is reps on the
             last set, and this screen already carries it ("Your best at this weight is 8").

          ⚠️ DO NOT REINSTATE IT AS A "session volume" total either. That number already exists,
          once, further down the Performance screen (`completed_total_lb`, D-349) — putting a second
          one here is how the first version of this row got misread. The per-row `Vol:` lines stay:
          they are per-exercise facts, not a verdict against a plan that never priced them. */}

    </div>
  );
}

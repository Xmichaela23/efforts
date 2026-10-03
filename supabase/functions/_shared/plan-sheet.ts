// ============================================================================
// THE PLAN SHEET — one week of a plan on one page, for anyone to read (2026-10-02,
// docs/WORKORDER-plan-sheet-2026-10-02.md). Replaces the markdown download on the plans screen.
//
// The server composes every word and number; the phone and the web draw the sections as sent and decide nothing.
// It reads only what the built sessions already carry: `sessionTitle` for each session's name, the strength step's
// own sets, reps, set plan, weight and superset group, the plyo row's benefit line, and the run and ride lines
// materialize-plan writes (`computed.narrative`, `computed.step_lines`). No rule is worked out here a second time.
//
// ⛔ EVERY ATHLETE-FACING STRING IN THIS FILE WAS APPROVED BY MICHAEL 2026-10-02, WORD FOR WORD (the "How it changes"
// lines with the work order, the headings, effort words and footer at Stage 1). Change none without his yes.
//
// ⛔ SHARED = DEPLOY TRAP: grep -rln "plan-sheet" supabase/functions --include=index.ts
// ============================================================================

import { sessionTitle } from './session-title.ts';
import { SETS_EARNED_PARAGRAPH } from './standing-plan/program-outline.ts';
import { P227_DRILL_LINE } from './standing-plan/plyo.ts';
import { isAsymmetrical } from './strength-grid/taxonomy.ts';
import { plannedDurationFields } from './planned-duration-label.ts';
import { strengthSessionMinutes } from './strength-session-minutes.ts';

// deno-lint-ignore no-explicit-any
type Any = any;

/** Approved line 2 (Michael, 2026-10-02). The 5 / 10 lb step is OURS — `progression.ts` STEP_UPPER_LB / STEP_LOWER_LB. */
export const ME_WEIGHT_LINE =
  'Two sessions in a row with 5 reps on every set at the same weight, and the weight goes up: 5 lb on upper-body '
  + 'lifts, 10 lb on lower-body lifts. A session at 0 reps, or three in a row with fewer reps each time, brings it back down.';

/** Approved line 3 (Michael, 2026-10-02): `hard-rotation.ts` changes the hard workout each week; paces and watts are
 *  resolved from the current threshold and FTP at materialization. */
export const ENDURANCE_CHANGES_LINE =
  'Easy and long sessions change length from week to week. Hard sessions change workout from week to week. '
  + 'Paces and watts follow your threshold and FTP.';

export const SHEET_HEADINGS = {
  week: 'The week',
  changes: 'How it changes',
} as const;

export const SHEET_WORDS = {
  rest: 'Rest',
  weekTotal: 'Week total',
  pair: 'pair',
  pairFirst: 'Back to back with the next lift.',
  noWeight: '—',
  weightNote: '"—" means nothing is logged yet for that lift. Start at a weight that leaves the stated reps in reserve.',
  warmUp: 'Warm-up',
  main: 'Main',
  coolDown: 'Cool-down',
  runFooter: 'Run paces come from your threshold pace.',
  rideFooter: 'Ride watts come from your FTP (functional threshold power, the power you can hold for about an hour).',
  intentsFooter: 'Maximum effort = heavy sets. Dynamic effort = fast sets. Skill = practice sets. Hypertrophy = muscle-building sets.',
} as const;

/** The four intents spelled out (spec item 8: no abbreviations). */
export const INTENT_NAMES: Record<string, string> = {
  ME: 'Maximum effort',
  DE: 'Dynamic effort',
  SKILL: 'Skill',
  HYP: 'Hypertrophy',
};

export type SheetSport = 'run' | 'ride' | 'strength' | 'plyo' | 'swim' | 'other';
/** Each session carries its own time the way the week view prints it: a lift's label ("30–40 min"), else its minutes. */
/**
 * Each session's time the way the week view prints it: a lift's range off its rows ("30–40 min"), else its minutes;
 * the plyo day carries no length (none on the row or the page). `low`/`high` are minutes; equal when it is one number.
 */
export type SheetTime = { low: number; high: number } | null;
export type SheetDay = { day: string; sessions: { sport: SheetSport; title: string; time: SheetTime }[]; time: SheetTime };
export type SheetLiftRow = {
  intent: string | null;
  name: string;
  sets_reps: string;
  weight: string;
  effort: string;
  /** Both rows of a superset pair carry true; `pair_first` marks the one that prints "pair". */
  pair: boolean;
  pair_first: boolean;
};
/** One session of a training day, in the week table's order. */
export type SheetBlock =
  | { kind: 'lifts'; title: string; time: SheetTime; rows: SheetLiftRow[] }
  | { kind: 'plyo'; title: string; rows: { drill: string; for: string | null }[]; note: string | null }
  | { kind: 'endurance'; sport: SheetSport; title: string; time: SheetTime; steps: { label: string; text: string }[] };
/** A training day: its name, its time (the sum of its sessions' times) and every session on it. Rest days have none. */
export type SheetTrainingDay = { day: string; time: SheetTime; blocks: SheetBlock[] };

export type PlanSheetV1 = {
  version: 2;
  title: string;
  /** "12 weeks · Week 5" */
  meta: string;
  week_number: number;
  total_weeks: number | null;
  week: { days: SheetDay[]; total: SheetTime };
  changes: string[];
  /** One section per training day, Monday first (Michael, 2026-10-02: the sheet is organized by day). */
  training_days: SheetTrainingDay[];
  weight_note: string | null;
  footer: string[];
  headings: typeof SHEET_HEADINGS;
  words: Pick<typeof SHEET_WORDS, 'rest' | 'weekTotal' | 'pair' | 'noWeight'> & { columns: { day: string; sessions: string; time: string; lift: string; setsReps: string; weight: string; effort: string; drill: string; for: string } };
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Spec item 8: the sheet says Dumbbell, never DB (the app's own names keep the book's "DB"). */
export const spellOut = (s: string): string => s.replace(/\bDBs?\b/g, (m) => (m === 'DBs' ? 'Dumbbells' : 'Dumbbell'));

const isPlyo = (r: Any) => Array.isArray(r?.tags) && r.tags.map(String).includes('plyo');
const sportOf = (r: Any): SheetSport => {
  if (isPlyo(r)) return 'plyo';
  const t = String(r?.type ?? '').toLowerCase();
  if (t === 'run' || t === 'walk') return 'run';
  if (t === 'ride' || t === 'bike' || t === 'cycling') return 'ride';
  if (t === 'strength') return 'strength';
  if (t === 'swim') return 'swim';
  return 'other';
};
/** The length every server reader uses (`planned-duration-label.ts` over `resolvePlannedDurationSeconds`). */
const minutesOf = (r: Any): number | null => {
  const s = plannedDurationFields(r).planned_duration_seconds;
  return s != null && Number.isFinite(s) && s > 0 ? Math.round(s / 60) : null;
};
/** A session's time as the week view prints it (`planned-duration-label.ts`): a lift off its rows, the plyo day none. */
function timeOf(r: Any): SheetTime {
  const sport = sportOf(r);
  if (sport === 'plyo') return null;
  if (sport === 'strength') {
    const m = strengthSessionMinutes(r?.strength_exercises);
    if (m) return { low: m.low, high: m.high };
  }
  const n = minutesOf(r);
  return n ? { low: n, high: n } : null;
}
const dateOf = (r: Any): string => (typeof r?.date === 'string' ? r.date.slice(0, 10) : '');
const weekdayOf = (iso: string): string =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

/** The lifts of a strength row, as built: the materialized steps first, the authored list when nothing is built. */
function liftsOf(r: Any): Any[] {
  const steps = Array.isArray(r?.computed?.steps) ? r.computed.steps : [];
  const fromSteps = steps.filter((s: Any) => s?.kind === 'strength' && s?.strength).map((s: Any) => s.strength);
  if (fromSteps.length > 0) return fromSteps;
  return Array.isArray(r?.strength_exercises) ? r.strength_exercises : [];
}

const range = (s: unknown): string => String(s ?? '').trim().replace(/\s*-\s*/, '–');

/**
 * ⛔ THE REP GOAL, NOT THE RANGE (workorder "Rep goal per lift"). The composer stamps it on the working sets of the
 * set plan: ME opens at the reps achieved last time at this weight inside 1–5, and carries none after a jump
 * (`compose.ts` openAt), so the range prints; Dynamic effort, Skill and Hypertrophy carry the band top.
 */
function repGoalOf(ex: Any): string {
  const plan = Array.isArray(ex?.set_plan) ? ex.set_plan.filter((s: Any) => s && s.warmup !== true) : [];
  const goal = plan.map((s: Any) => Number(s?.reps)).find((n: number) => Number.isFinite(n) && n > 0);
  if (goal) return String(goal);
  if (String(ex?.slot_intent ?? '').toUpperCase() !== 'ME') {
    const hi = Number(String(ex?.reps ?? '').split('-').pop());
    if (Number.isFinite(hi) && hi > 0) return String(hi);
  }
  return range(ex?.reps) || '—';
}

function sideOf(ex: Any): string {
  if (!isAsymmetrical(String(ex?.name ?? ''))) return '';
  return /lower|hinge|squat|lunge|leg/i.test(String(ex?.slot_pattern ?? '')) ? ' each leg' : ' each arm';
}

function weightOf(ex: Any): string {
  const shown = String(ex?.weight_display ?? '').trim();
  if (shown && !/setup/i.test(shown)) return shown;
  const n = Number(ex?.weight_suggested);
  if (Number.isFinite(n) && n > 0) return `${n} ${ex?.unit || 'lb'}${ex?.weight_per === 'each' ? ' each' : ''}`;
  return SHEET_WORDS.noWeight;
}

const reserveRange = (ex: Any): string | null => {
  const t = String(ex?.reserve_text ?? '').trim();
  return t ? t.replace(/\s+to\s+/, '–') : null;
};

function effortOf(ex: Any, repGoal: string): string {
  const intent = String(ex?.slot_intent ?? '').toUpperCase();
  const reserve = reserveRange(ex);
  if (intent === 'ME') {
    return /–/.test(repGoal)
      ? 'Heavy. First session at this weight, so the range is the goal.'
      : `Heavy. Stop short of failure. Range ${range(ex?.reps) || '1–5'}.`;
  }
  if (intent === 'DE') return `Fast reps.${reserve ? ` Stop ${reserve} reps short.` : ''}`;
  if (intent === 'SKILL') return `Practice. Form first.${reserve ? ` Stop ${reserve} reps short.` : ''}`;
  if (reserve) return `Stop ${reserve} reps short.`;
  return '';
}

function liftRows(r: Any): SheetLiftRow[] {
  const lifts = liftsOf(r);
  const out: SheetLiftRow[] = [];
  for (let i = 0; i < lifts.length; i++) {
    const ex = lifts[i];
    const name = spellOut(String(ex?.execution_name || ex?.name || '').trim() || 'Exercise');
    const intentKey = String(ex?.slot_intent ?? '').toUpperCase();
    const group = typeof ex?.superset_group === 'string' && ex.superset_group ? ex.superset_group : null;
    const prevGroup = i > 0 ? lifts[i - 1]?.superset_group : null;
    const nextGroup = i < lifts.length - 1 ? lifts[i + 1]?.superset_group : null;
    const pair = !!group && (group === prevGroup || group === nextGroup);
    const pairFirst = pair && group !== prevGroup;
    if (typeof ex?.prescription_words === 'string' && ex.prescription_words.trim()) {
      out.push({ intent: INTENT_NAMES[intentKey] ?? null, name, sets_reps: spellOut(ex.prescription_words.trim()), weight: weightOf(ex), effort: '', pair, pair_first: pairFirst });
      continue;
    }
    const goal = repGoalOf(ex);
    const sets = Number(ex?.sets);
    out.push({
      intent: INTENT_NAMES[intentKey] ?? null,
      name,
      sets_reps: `${Number.isFinite(sets) && sets > 0 ? `${sets} × ` : ''}${goal}${sideOf(ex)}`,
      weight: weightOf(ex),
      effort: pairFirst ? SHEET_WORDS.pairFirst : effortOf(ex, goal),
      pair,
      pair_first: pairFirst,
    });
  }
  return out;
}

function plyoRows(r: Any): { drill: string; for: string | null }[] {
  const authored = Array.isArray(r?.strength_exercises) ? r.strength_exercises : [];
  return liftsOf(r).map((ex: Any, i: number) => {
    const line = String(ex?.benefit_line || authored[i]?.benefit_line || '').trim();
    const benefit = line.replace(/^Benefit:\s*/i, '').replace(/\.$/, '');
    return { drill: spellOut(String(ex?.name ?? '').trim()), for: benefit ? benefit[0].toUpperCase() + benefit.slice(1) : null };
  });
}

/**
 * ⛔ A RUN OR RIDE IN THE SERVER'S OWN WORDS. The warm-up and cool-down lines are materialize-plan's
 * `computed.step_lines` (`planned-step-lines.ts` writes them as "<time> warm-up · …" / "<time> cool-down · …"). The
 * main set is the session's narrative where it has one (`planned-narrative.ts`), else the remaining step lines.
 */
function enduranceSteps(r: Any): { label: string; text: string }[] {
  const lines: string[] = Array.isArray(r?.computed?.step_lines) ? r.computed.step_lines.map(String) : [];
  const warm = lines.filter((l) => /^\S+ warm-up\b/.test(l));
  const cool = lines.filter((l) => /^\S+ cool-down\b/.test(l));
  const main = lines.filter((l) => !warm.includes(l) && !cool.includes(l));
  const narrative = typeof r?.computed?.narrative === 'string' && r.computed.narrative.trim() ? r.computed.narrative.trim() : null;
  const steps: { label: string; text: string }[] = [];
  // The label already says warm-up / cool-down, so the line drops its own copy of the word: "12:30 · 10- to 15-minute easy spin".
  const unlabelled = (l: string) => l.replace(/^(\S+) (?:warm-up|cool-down)\b\s*/, '$1 ').trim();
  for (const l of warm) steps.push({ label: SHEET_WORDS.warmUp, text: unlabelled(l) });
  if (narrative) steps.push({ label: SHEET_WORDS.main, text: narrative });
  else for (const l of main) steps.push({ label: SHEET_WORDS.main, text: l });
  for (const l of cool) steps.push({ label: SHEET_WORDS.coolDown, text: unlabelled(l) });
  return steps;
}

export function composePlanSheet(args: {
  planName: string | null | undefined;
  totalWeeks: number | null;
  week: number;
  /** This plan's planned rows for the week, every status. `day_order` is `_shared/day-order.ts`'s. */
  rows: Any[];
}): PlanSheetV1 {
  const rows = (Array.isArray(args.rows) ? args.rows : [])
    .map((r, i) => ({ r, i, d: dateOf(r) }))
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.d))
    .sort((a, b) => {
      if (a.d !== b.d) return a.d.localeCompare(b.d);
      const ao = Number(a.r?.day_order), bo = Number(b.r?.day_order);
      if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
      return a.i - b.i;
    });

  // The seven days from the week's first date; a plan week is Monday-first (`get-week`'s week rule).
  const first = rows[0]?.d ?? null;
  const monday = first ? (() => {
    const d = new Date(`${first}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d;
  })() : null;
  const days: SheetDay[] = [];
  const training_days: SheetTrainingDay[] = [];
  let weekLo = 0, weekHi = 0;
  let anyRun = false, anyRide = false, anyIntent = false, anyNoWeight = false, anyLift = false, anyMe = false, anyEndurance = false;
  let drillLineSaid = false;
  for (let k = 0; k < 7; k++) {
    let iso = '';
    if (monday) { const d = new Date(monday); d.setUTCDate(d.getUTCDate() + k); iso = d.toISOString().slice(0, 10); }
    const here = rows.filter((x) => x.d === iso).map((x) => x.r);
    let lo = 0, hi = 0;
    const sessions: SheetDay['sessions'] = [];
    const blocks: SheetBlock[] = [];
    for (const r of here) {
      const sport = sportOf(r);
      const title = spellOut(sessionTitle(r));
      const time = timeOf(r);
      if (time) { lo += time.low; hi += time.high; }
      sessions.push({ sport, title, time });
      if (sport === 'plyo') {
        // p227's drill line once on the sheet, under the first plyo session.
        blocks.push({ kind: 'plyo', title, rows: plyoRows(r), note: drillLineSaid ? null : P227_DRILL_LINE });
        drillLineSaid = true;
      } else if (sport === 'strength') {
        const lr = liftRows(r);
        if (!lr.length) continue;
        anyLift = true;
        if (lr.some((x) => x.intent)) anyIntent = true;
        if (lr.some((x) => x.intent === INTENT_NAMES.ME)) anyMe = true;
        if (lr.some((x) => x.weight === SHEET_WORDS.noWeight)) anyNoWeight = true;
        blocks.push({ kind: 'lifts', title, time, rows: lr });
      } else if (sport === 'run' || sport === 'ride' || sport === 'swim') {
        anyEndurance = true;
        if (sport === 'run') anyRun = true;
        if (sport === 'ride') anyRide = true;
        blocks.push({ kind: 'endurance', sport, title, time, steps: enduranceSteps(r) });
      }
    }
    weekLo += lo; weekHi += hi;
    const dayTime: SheetTime = here.length && hi > 0 ? { low: lo, high: hi } : null;
    days.push({ day: WEEKDAYS[k], sessions, time: dayTime });
    if (blocks.length) training_days.push({ day: WEEKDAYS[k], time: dayTime, blocks });
  }

  const changes: string[] = [];
  if (anyLift) changes.push(SETS_EARNED_PARAGRAPH);
  if (anyMe) changes.push(ME_WEIGHT_LINE);
  if (anyEndurance) changes.push(ENDURANCE_CHANGES_LINE);

  const footer: string[] = [];
  if (anyRun) footer.push(SHEET_WORDS.runFooter);
  if (anyRide) footer.push(SHEET_WORDS.rideFooter);
  if (anyIntent) footer.push(SHEET_WORDS.intentsFooter);

  const title = typeof args.planName === 'string' && args.planName.trim() ? args.planName.trim() : 'Training plan';
  const tw = Number.isFinite(Number(args.totalWeeks)) && Number(args.totalWeeks) > 0 ? Number(args.totalWeeks) : null;
  return {
    version: 2,
    title,
    meta: `${tw ? `${tw} weeks · ` : ''}Week ${args.week}`,
    week_number: args.week,
    total_weeks: tw,
    week: { days, total: weekHi > 0 ? { low: weekLo, high: weekHi } : null },
    changes,
    training_days,
    weight_note: anyNoWeight ? SHEET_WORDS.weightNote : null,
    footer,
    headings: SHEET_HEADINGS,
    words: {
      rest: SHEET_WORDS.rest, weekTotal: SHEET_WORDS.weekTotal, pair: SHEET_WORDS.pair, noWeight: SHEET_WORDS.noWeight,
      columns: { day: 'Day', sessions: 'Sessions', time: 'Time', lift: 'Lift', setsReps: 'Sets × reps', weight: 'Weight', effort: 'Effort', drill: 'Drill', for: 'For' },
    },
  };
}

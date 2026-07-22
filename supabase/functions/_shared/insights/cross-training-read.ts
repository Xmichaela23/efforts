// THE COACH'S EYE (2026-07-21) — the State "Cross-training" row.
//
// NOT an interference detector (you can't measure interference — the effect is smaller than the
// instruments' error). A coach doesn't say "HR was 8bpm high after squats"; a coach glances at your
// week and says "you can push more here" or "you're letting that slip". This reads BALANCE relative to
// your GOAL — observable — and speaks ONE flag, or stays quiet.
//
// THE ONE QUESTION: relative to your goal, did you cross a line that matters?
//   · FLOOR  — the least you need. Under it → you're losing something you declared you'd keep. A hard
//              FACT (you set 18mi, you're at 6). Serves the minimiser ("how little do I need?").
//   · CEILING — the most you can do before it costs the goal. NOT a number anyone can hand you, and a
//              stall can't be pinned on the extra work (the same unprovable causal claim that sank the
//              interference alarm). So the ceiling is NEVER a verdict — it is a CORRELATION PROMPT + a
//              lever + an ⓘ that says out loud what it's built on and hands the judgment back. Serves
//              the maximiser ("how much can I do without working against my goal?").
//   · ROOM   — pushing a supplement, focus still holding → the maximiser's green light.
//
// THE GATE: flag over/under-doing ONLY when it's IMPACTING THE GOAL. Ride a lot at no cost → quiet (the
// LOAD bar shows the mix; the coach's eye shows what the mix is DOING). One flag or silence.
//
// COPY LAW: flat, fact-first. No "the trade you chose", no putting words in the athlete's mouth, no
// narrating swim/ride as characters (they are LOAD + aerobic maintenance, a supplement — not a story).

export type CrossVerdict = 'improving' | 'holding' | 'sliding' | 'needs_data';
export type CrossPosture = 'develop' | 'maintain' | 'dropped' | 'unknown';

export interface CoachEyeDiscipline {
  discipline: string;        // 'strength' | 'run' | 'bike' | 'swim' — canonical
  posture: CrossPosture;
  verdict: CrossVerdict;     // the discipline's OWN fitness outcome (strength = noise-guarded e1RM)
  acwr: number | null;       // per-discipline load direction (weekly)
  underTarget?: boolean;     // maintain discipline under its DECLARED target over the block (FLOOR breach)
  actualPerWeek?: number | null;  // for the floor number (e.g. 6)
  targetPerWeek?: number | null;  // for the floor number (e.g. 18)
  unit?: string;                  // 'mile'
}

export interface CoachEyeInput {
  disciplines: CoachEyeDiscipline[];
  /** The ceiling COST signal: recovery/body degrading. Correlation only — never proof of causation. */
  readinessDeclining?: boolean;
}

export interface CoachEyeRead {
  headline: string;
  detail: string | null;
  tone: 'positive' | 'info' | 'warning';
  kind: 'floor' | 'ceiling' | 'room';
  /** The SUBJECT discipline the line is about (run/bike/swim/strength) — so the client can color it in
   *  that discipline's signature hue instead of a generic tone (blue collided with swim). Ceiling/room =
   *  the focus discipline; floor = the discipline under its target. (Michael 2026-07-22.) */
  discipline: string;
  /** ⓘ popup — CEILING only. States what the read is built on and hands the judgment back. */
  info?: string;
}

const PUSHING = 1.1;
const LABEL: Record<string, string> = {
  strength: 'strength', run: 'running', running: 'running',
  bike: 'riding', ride: 'riding', cycling: 'riding', swim: 'swimming',
};
const lab = (d: string) => LABEL[String(d || '').toLowerCase()] ?? String(d || '').toLowerCase();
const Cap = (s: string) => s ? `${s[0].toUpperCase()}${s.slice(1)}` : s;
const canon = (d: string) => { const x = String(d || '').toLowerCase(); return x === 'ride' || x === 'cycling' ? 'bike' : x === 'running' ? 'run' : x; };
const working = (v: CrossVerdict) => v === 'improving' || v === 'holding';

// The ⓘ popup for the ceiling — honest about what it's built on, hands the judgment back (Michael).
const CEILING_INFO =
  "This reads your heart rate, your reps-in-reserve, and your load — but those only go so far. Gains " +
  "happen in recovery, and everyone's beneficial-stress ceiling is different. The signals point; you " +
  "find your ceiling by training and paying attention to your body.";

// How specific the discipline is (drives the FLOOR fade language): run high (use-it-or-lose-it),
// bike/swim lower (largely aerobic, retained better).
function floorDetail(disc: string): string {
  switch (canon(disc)) {
    case 'run': return 'Running is specific — only running holds it. Your aerobic base can hold on other work, but running fitness, economy and impact tolerance ease at this volume and only come back by running.';
    case 'bike': return 'Cycling holds better than running would at low volume — largely aerobic and retained — but the top end eases if you stay here.';
    case 'swim': return 'Swim fitness is mostly technique and aerobic, so it drifts slowly — the feel goes before the fitness does.';
    default: return `Only ${lab(disc)} holds ${lab(disc)}; at this volume it eases.`;
  }
}

/**
 * Compose the coach's-eye read. Null when nothing crosses a goal-relevant line — the caller then falls
 * back to the quiet reassurance / silence.
 */
export function composeCoachEye(inp: CoachEyeInput): CoachEyeRead | null {
  const states = Array.isArray(inp?.disciplines) ? inp.disciplines : [];
  if (states.length < 2) return null;

  const active = states.filter((s) => s && s.posture !== 'dropped');
  const focus = active.filter((s) => s.posture === 'develop').find((s) => s.verdict !== 'needs_data')
    ?? active.filter((s) => s.posture === 'develop')[0];
  // No declared focus → nothing to judge a line against. Stay out.
  if (!focus || focus.verdict === 'needs_data') return null;

  const others = active.filter((s) => s.discipline !== focus.discipline);
  const pushed = others.find((s) => typeof s.acwr === 'number' && (s.acwr as number) > PUSHING && s.underTarget !== true);
  const floorBreach = active.find((s) => s.posture === 'maintain' && s.underTarget === true);

  const fnum = (s: CoachEyeDiscipline) =>
    (typeof s.actualPerWeek === 'number' && typeof s.targetPerWeek === 'number' && (s.targetPerWeek as number) > 0)
      ? `${Math.round(s.actualPerWeek as number)} of your ${Math.round(s.targetPerWeek as number)}-${s.unit ?? 'unit'}`
      : null;

  // ── 1. CEILING — focus giving ground WHILE a supplement is pushed. A correlation PROMPT + a lever +
  //    the ⓘ. The goal itself is the thing at risk, so this outranks a slipping secondary. ────────────
  if ((focus.verdict === 'sliding' || (focus.verdict === 'holding' && inp.readinessDeclining)) && pushed) {
    const state = focus.verdict === 'sliding' ? 'is slipping' : 'is flat and your recovery is dipping';
    return {
      headline: `Your ${lab(focus.discipline)} ${state} while your ${lab(pushed.discipline)} climbs.`,
      detail: `If ${lab(focus.discipline)} is the priority, easing the ${lab(pushed.discipline)} is the lever — they draw on the same recovery. Your exact ceiling isn't a number anyone can hand you.`,
      tone: 'warning', kind: 'ceiling', discipline: focus.discipline, info: CEILING_INFO,
    };
  }

  // ── 2. FLOOR — a maintain discipline under its DECLARED target. A hard fact you can act on. ─────────
  if (floorBreach) {
    const num = fnum(floorBreach);
    return {
      headline: num
        ? `${Cap(lab(floorBreach.discipline))}'s at ${num} target${floorBreach.unit === 'mile' ? '' : ''} — under what holds it.`
        : `${Cap(lab(floorBreach.discipline))}'s under the level that holds it.`,
      detail: floorDetail(floorBreach.discipline),
      tone: 'info', kind: 'floor', discipline: floorBreach.discipline,
    };
  }

  // ── 3. ROOM — pushing a supplement, focus holding/coming, no cost. The maximiser's green light. ─────
  if (working(focus.verdict) && pushed && !inp.readinessDeclining) {
    return {
      headline: `Your ${lab(pushed.discipline)} is up and your ${lab(focus.discipline)} is holding — room to push.`,
      detail: `No sign the ${lab(pushed.discipline)} is costing your ${lab(focus.discipline)} yet. Watch the ${lab(focus.discipline)} numbers as you add more — that's where the ceiling shows first.`,
      tone: 'positive', kind: 'room', discipline: focus.discipline, info: CEILING_INFO,
    };
  }

  return null; // nothing crosses a goal-relevant line → caller reassures / silent
}

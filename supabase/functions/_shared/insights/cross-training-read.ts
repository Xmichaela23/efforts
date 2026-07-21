// DETERMINISTIC CROSS-TRAINING READ (2026-07-21) — the honest replacement for the retired
// interference verdict. It answers the one question "cross-training" actually means: is pushing one
// thing COSTING another thing you care about? — off OUTCOMES (spine strength e1RM + endurance
// verdicts + per-discipline load), never off a fragile proxy (HR-at-pace).
//
// GLANCE + OPEN (Michael, 2026-07-21): returns a short HEADLINE (the frank verdict, always shown) and a
// DETAIL (the receipts, revealed on tap). Frank at the glance, mechanism on demand — the app's own BODY
// row pattern. Do NOT bury the frank verdict in the detail; the headline carries it.
//
// USER-AGNOSTIC, NOT TUNED: reads each athlete's OWN posture, verdicts, declared target (underTarget)
// and load. Thresholds are the field-standard bands (Garmin/TrainingPeaks), not fitted to anyone.
//
// PER-DISCIPLINE FRANKNESS IS A SCIENCE CALL, NOT A COPY WHIM. The "it fades" claim is strong for
// RUNNING (impact + eccentric loading; running economy, durability and impact tolerance are use-it-or-
// lose-it — the SAID/specificity principle) and WEAKER for cycling/swimming (largely concentric /
// low-impact; aerobic fitness transfers and is retained better). So the eased ENDURANCE discipline
// drives how frank the fade language is — run: it fades; bike: the top end eases; swim: it drifts.

export type CrossVerdict = 'improving' | 'holding' | 'sliding' | 'needs_data';
export type CrossPosture = 'develop' | 'maintain' | 'dropped' | 'unknown';

export interface CrossDisciplineState {
  discipline: string;          // 'strength' | 'run' | 'bike' | 'swim' — canonical
  posture: CrossPosture;
  verdict: CrossVerdict;       // the discipline's OWN fitness outcome (strength = noise-guarded e1RM)
  acwr: number | null;         // per-discipline acute:chronic — a WEEKLY signal (>1.1 uptick / <0.8 dip)
  /** TRAILING truth (window-consistent with upkeep): under its maintenance target over the block.
   *  Overrides a weekly acwr uptick — under-target = eased, never "pushed", whatever one week says. */
  underTarget?: boolean;
}

export interface CrossTrainingRead {
  /** The frank verdict — ALWAYS shown at the glance. Short. */
  headline: string;
  /** The receipts — revealed on tap. Mechanism, specificity, what the trade buys. May be null. */
  detail: string | null;
  tone: 'positive' | 'info' | 'warning';
  kind: 'trade_working' | 'cost' | 'room';
}

const PUSHING = 1.1;   // acute above chronic → a weekly uptick
const EASED = 0.8;     // acute below chronic → a weekly dip

const LABEL: Record<string, string> = {
  strength: 'strength', run: 'running', running: 'running',
  bike: 'riding', ride: 'riding', cycling: 'riding', swim: 'swimming',
};
const lab = (d: string) => LABEL[String(d || '').toLowerCase()] ?? String(d || '').toLowerCase();
const working = (v: CrossVerdict) => v === 'improving' || v === 'holding';
const canon = (d: string) => { const x = String(d || '').toLowerCase(); return x === 'ride' || x === 'cycling' ? 'bike' : x === 'running' ? 'run' : x; };

// How frank the fade language is when THIS endurance discipline eases — a specificity call:
//  run: high (use-it-or-lose-it) · bike: moderate (retained better) · swim: low (technique, low-impact).
function fadeClause(easedDisc: string): { glance: string; detail: string } {
  switch (canon(easedDisc)) {
    case 'run':
      return {
        glance: `your running's starting to fade`,
        detail: `Running is specific — cross-training holds your aerobic base but not your running, so at this volume your running itself erodes. Hold it here long and the legs, economy and impact tolerance go; they only come back by running.`,
      };
    case 'bike':
      return {
        glance: `your riding's easing`,
        detail: `Cycling fitness holds better than running would at low volume — it's largely aerobic and retained — but the top end still eases if you stay here.`,
      };
    case 'swim':
      return {
        glance: `your swimming's easing`,
        detail: `Swim fitness is mostly technique and aerobic, so it drifts slowly at low volume — the feel goes before the fitness does.`,
      };
    default:
      return { glance: `your ${lab(easedDisc)}'s easing`, detail: `At this volume it eases; only ${lab(easedDisc)} holds ${lab(easedDisc)}.` };
  }
}

/**
 * Compose the honest cross-training read. Null when there's no declared focus or no real story — the
 * caller then falls back to the quiet reassurance.
 */
export function composeCrossTrainingRead(states: CrossDisciplineState[]): CrossTrainingRead | null {
  if (!Array.isArray(states) || states.length < 2) return null;

  const active = states.filter((s) => s && s.posture !== 'dropped');
  const focus = active.filter((s) => s.posture === 'develop');
  if (focus.length === 0) return null; // nothing to trade off → caller reassures

  const F = focus.find((s) => s.verdict !== 'needs_data') ?? focus[0];
  if (!F || F.verdict === 'needs_data') return null;

  const others = active.filter((s) => s.discipline !== F.discipline);
  const eased = (s: CrossDisciplineState) => s.underTarget === true || (typeof s.acwr === 'number' && (s.acwr as number) < EASED);
  const pushed = (s: CrossDisciplineState) => s.underTarget !== true && typeof s.acwr === 'number' && (s.acwr as number) > PUSHING;
  const easedMaintain = others.find((s) => s.posture === 'maintain' && eased(s));
  const pushedOther = others.find((s) => pushed(s));

  const F_ing = F.verdict === 'improving' ? "and it's coming" : 'and it is holding';

  // CASE A — THE TRADE, WORKING (the anti-"Unproductive"). Focus is coming AND a maintain discipline
  // eased. Frankness switches on the EASED discipline's specificity.
  if (working(F.verdict) && easedMaintain) {
    const fc = fadeClause(easedMaintain.discipline);
    return {
      headline: `Building ${lab(F.discipline)}; ${fc.glance} — the trade you chose.`,
      detail: `${fc.detail} Your ${lab(F.discipline)} is ${F.verdict === 'improving' ? 'climbing' : 'holding'} — that's what the trade buys. Not lost fitness; a chosen one.`,
      tone: 'positive', kind: 'trade_working',
    };
  }

  // CASE B — THE COST. Focus giving ground WHILE another discipline is pushed. A tipping trade + a lever.
  if (F.verdict === 'sliding' && pushedOther) {
    return {
      headline: `Your ${lab(pushedOther.discipline)} is up and your ${lab(F.discipline)} has started to give.`,
      detail: `You're developing ${lab(F.discipline)}, and it's sliding while ${lab(pushedOther.discipline)} load climbs — the endurance may be crowding it. Ease one so the other can move; they compete for the same recovery.`,
      tone: 'warning', kind: 'cost',
    };
  }

  // CASE C — ROOM. Pushing a non-focus discipline, focus still holding/coming. The green light.
  if (working(F.verdict) && pushedOther) {
    return {
      headline: `Pushing your ${lab(pushedOther.discipline)}; your ${lab(F.discipline)} is holding — you've got room.`,
      detail: `${F.discipline === 'strength' ? 'Your lifts are' : `Your ${lab(F.discipline)} is`} ${F_ing.replace(/^and (it'?s|it is) /, '')} while ${lab(pushedOther.discipline)} load climbs — no sign the ${lab(pushedOther.discipline)} is costing it yet. Keep an eye on the lift numbers as you add more.`,
      tone: 'positive', kind: 'room',
    };
  }

  return null;
}

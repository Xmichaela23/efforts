// DETERMINISTIC CROSS-TRAINING READ (2026-07-21) — the honest replacement for the retired
// interference verdict. It answers the one question "cross-training" actually means: is pushing one
// thing COSTING another thing you care about? — and it answers it off OUTCOMES (your strength e1RM
// verdict, your endurance verdict, per-discipline load), never off a fragile proxy (HR-at-pace).
//
// WHY THIS SHAPE:
//   · The old "interference detected — HR +Nbpm after lifting" fired on a signal smaller than its own
//     measurement error, for a situation the plan already prevents (6h separation gate). Retired.
//   · The push→cost frame is field-proven — Garmin "Productive/Unproductive", TrainingPeaks Form,
//     WHOOP strain-vs-recovery all do a version. Every one is SINGLE-AXIS (endurance-only, or whole-
//     body), so all of them get the hybrid athlete WRONG — Garmin calls a lifting runner "Unproductive"
//     because it can't see the lifting. This read fixes exactly that failure: it can see both sides, so
//     it says the true thing — "your running eased because you're building strength — that's the trade."
//
// VOICE (the app's copy law): fact first, name the trade never the fault, conditional consequence,
// no imperative that isn't a real lever, no banned words. SILENCE IS LEGAL — it speaks only when there
// is a declared FOCUS and a real story (a trade, a cost, or genuine room). Otherwise it returns null
// and the caller falls back to the quiet reassurance.

export type CrossVerdict = 'improving' | 'holding' | 'sliding' | 'needs_data';
export type CrossPosture = 'develop' | 'maintain' | 'dropped' | 'unknown';

export interface CrossDisciplineState {
  /** 'strength' | 'run' | 'bike' | 'swim' — canonical. */
  discipline: string;
  posture: CrossPosture;
  /** The discipline's OWN fitness outcome verdict from the spine (strength = noise-guarded e1RM). */
  verdict: CrossVerdict;
  /** Per-discipline acute:chronic load ratio. >~1.1 = being pushed; <~0.8 = eased off. Null = unknown. */
  acwr: number | null;
}

export interface CrossTrainingRead {
  label: string;
  tone: 'positive' | 'info' | 'warning';
  /** which cased fired — for tests + glass-box, never rendered raw */
  kind: 'trade_working' | 'cost' | 'room' | null;
}

// Field-standard load bands, used PURELY descriptively (never a risk claim).
const PUSHING = 1.1;   // acute above chronic → adding load to this discipline
const EASED = 0.8;     // acute below chronic → this discipline eased off (the conventional under floor)

const LABEL: Record<string, string> = {
  strength: 'strength', run: 'running', running: 'running',
  bike: 'riding', ride: 'riding', cycling: 'riding', swim: 'swimming',
};
const lab = (d: string) => LABEL[String(d || '').toLowerCase()] ?? String(d || '').toLowerCase();
const working = (v: CrossVerdict) => v === 'improving' || v === 'holding';

/**
 * Compose the honest cross-training read. Returns null when there is no declared focus, or no real
 * story — the caller then falls back to the existing quiet reassurance.
 */
export function composeCrossTrainingRead(states: CrossDisciplineState[]): CrossTrainingRead | null {
  if (!Array.isArray(states) || states.length < 2) return null;

  const active = states.filter((s) => s && s.posture !== 'dropped');
  const focus = active.filter((s) => s.posture === 'develop');
  // No declared focus → this read has nothing to trade off. Stay out; the caller reassures.
  if (focus.length === 0) return null;

  // The primary focus = the develop discipline with a real verdict (prefer one that's actually moving).
  const F =
    focus.find((s) => s.verdict !== 'needs_data') ?? focus[0];
  if (!F || F.verdict === 'needs_data') return null; // can't speak to a focus we can't yet read

  const others = active.filter((s) => s.discipline !== F.discipline);
  const easedMaintain = others.find((s) => s.posture === 'maintain' && typeof s.acwr === 'number' && (s.acwr as number) < EASED);
  const pushedOther = others.find((s) => typeof s.acwr === 'number' && (s.acwr as number) > PUSHING);

  // CASE A — THE TRADE, WORKING (the anti-"Unproductive"). Focus is coming AND a maintain discipline
  // eased to make room. This is the sentence Garmin cannot say, because it never saw the strength.
  if (working(F.verdict) && easedMaintain) {
    const coming = F.verdict === 'improving' ? "and it's coming" : 'and it is holding';
    return {
      label: `You're building ${lab(F.discipline)} ${coming} — your ${lab(easedMaintain.discipline)} eased to make room. That's the trade, not lost fitness.`,
      tone: 'positive', kind: 'trade_working',
    };
  }

  // CASE B — THE COST. Focus is giving ground WHILE another discipline is being pushed. Named as a
  // trade tipping, with a real lever (ease one), never a fault and never a causation claim.
  if (F.verdict === 'sliding' && pushedOther) {
    return {
      label: `Your ${lab(pushedOther.discipline)} is up and your ${lab(F.discipline)} has started to give — ease one so the other can move.`,
      tone: 'warning', kind: 'cost',
    };
  }

  // CASE C — ROOM. You're pushing a non-focus discipline and the focus is still holding/coming. The
  // green light: the pushing isn't costing you (yet).
  if (working(F.verdict) && pushedOther) {
    return {
      label: `You're pushing your ${lab(pushedOther.discipline)} and your ${lab(F.discipline)} is holding — you've got room.`,
      tone: 'positive', kind: 'room',
    };
  }

  return null; // no clear trade / cost / room story → caller reassures or stays silent
}

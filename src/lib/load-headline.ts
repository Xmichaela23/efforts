// Deterministic STATE glance headline (#4) — a short, glanceable line composed from the spine
// verdicts (load + readiness + fitness), with the full LLM narrative behind an "open for more" expand.
//
// Three slots: STATE (the honest lead) · FITNESS shape — OBSERVATION.
// The OBSERVATION slot is a state-IMPLIED direction, never a prescription: it describes what the
// state means ("you have headroom"), it does NOT instruct a specific change ("add a session").
// Prescribing a specific adjustment is the gated autoregulation line (Step 5), not this glance.
// See docs/SPEC-state-headline.md (bounded composition now; authored phrase bank is the follow-on).

// The VOLUME verdict bands — single source for the ACWR→label mapping (LoadBar imports this too,
// so the gauge label and the headline can never drift apart).
export function acwrVolumeLabel(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v < 0.8) return 'build more';
  if (v <= 1.3) return 'balanced';
  if (v <= 1.5) return 'back off';
  return 'rest now';
}

// Slot 1 — STATE: load verdict + readiness, the honest lead (never the deficit).
function stateSlot(loadLabel: string, readiness: string | null | undefined): string | null {
  const l =
    loadLabel === 'balanced'   ? 'Balanced load' :
    loadLabel === 'build more' ? 'Room to build' :
    loadLabel === 'back off'   ? 'Load running high' :
    loadLabel === 'rest now'   ? 'Load very high' : null;
  const r =
    readiness === 'fresh'       ? 'fresh' :
    readiness === 'adapting'    ? 'adapting' :
    readiness === 'fatigued'    ? 'fatigued' :
    readiness === 'overreached' ? 'overreached' :
    readiness === 'detrained'   ? 'detrained' :
    readiness === 'normal'      ? 'steady' : null;
  if (l && r) return `${l}, ${r}`;
  if (l) return l;
  if (r) return r.charAt(0).toUpperCase() + r.slice(1);
  return null;
}

// Slot 2 — FITNESS shape (aggregate direction; per-discipline detail lives in the narrative).
function fitnessSlot(fd: string | null | undefined): string | null {
  return fd === 'improving' ? 'fitness climbing'
    : fd === 'mixed'      ? 'fitness mixed'
    : fd === 'declining'  ? 'fitness slipping'
    : fd === 'stable'     ? 'fitness steady'
    : null;
}

// Slot 3 — OBSERVATION: a state-implied direction only. Pure physiological reads off the spine.
// Deliberately sparse: fires only where the state clearly implies one, omits otherwise (the state
// slot already carries "Load running high" etc., so we don't double it).
function observationSlot(loadLabel: string, readiness: string | null | undefined): string | null {
  if (readiness === 'overreached' || readiness === 'fatigued') return "you're carrying fatigue";
  // headroom only on balanced+fresh — "Room to build" (build-more state) already conveys headroom.
  if (loadLabel === 'balanced' && readiness === 'fresh') return 'you have headroom';
  return null;
}

export function buildLoadHeadline(opts: {
  loadLabel: string;                 // from acwrVolumeLabel(load.acwr)
  readinessState?: string | null;
  fitnessDirection?: string | null;
  isTaperOrPeak?: boolean;
}): string | null {
  const { loadLabel, readinessState, fitnessDirection, isTaperOrPeak } = opts;
  if (loadLabel === '—') return null;
  // In taper/peak, a "build more" reading is by-design low volume — don't lead the glance with it.
  const effLoad = isTaperOrPeak && loadLabel === 'build more' ? 'balanced' : loadLabel;
  const state = stateSlot(effLoad, readinessState);
  if (!state) return null;
  const fit = fitnessSlot(fitnessDirection);
  const obs = observationSlot(effLoad, readinessState);
  const lead = [state, fit].filter(Boolean).join(' · ');
  return obs ? `${lead} — ${obs}.` : `${lead}.`;
}

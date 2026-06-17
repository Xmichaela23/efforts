// Q-061 / D-193 — swim equipment-direction detection for the TREND SUBSTRATE.
//
// A swim done with fins/buoy/paddles reads FASTER than unaided swimming; one done with
// kickboard/kick/drill reads SLOWER. Either way the pace/100 is NOT a clean unaided-fitness
// number, so such sessions must be excluded from the swim pace trend (the State-screen signal
// fed by compute-facts → workout_facts.swim_facts.pace_per_100m → compute-snapshot swimRows).
// Snorkel is neutral and never contaminates.
//
// ⚠️ DUPLICATION (intentional, flagged): the NARRATIVE path has its own inline copy of this exact
// classification in analyze-swim-workout/index.ts:454-472 (`equipmentDir`). The Q-061 trend-substrate
// work order (D-193) explicitly scoped OUT touching the narrative path (it is complete and on-device
// verified per D-190/D-192), so this helper is NOT yet wired into analyze-swim. The two copies MUST
// stay in sync (same regexes, same metadata source). Future consolidation: have analyze-swim import
// `detectSwimEquipment` from here and delete its inline block — deferred to avoid re-verifying the
// narrative output in this pass.

export type SwimEquipmentDirection = 'optimistic' | 'pessimistic' | 'mixed' | null;

export interface SwimEquipmentResult {
  /** True when fast-assist OR slow gear was used — pace is not a clean unaided number. */
  contaminated: boolean;
  /** optimistic = reads faster (fins/buoy/paddles); pessimistic = reads slower (kick/drill); mixed = both. */
  direction: SwimEquipmentDirection;
  /** The actual equipment names detected (lowercased, de-duped). */
  names: string[];
}

// Mirror of analyze-swim-workout equipmentDir (D-190/D-192). Keep these regexes identical.
const OPTIMISTIC_RE = /fin|buoy|pull|paddle/;                  // reads FASTER than unaided
const PESSIMISTIC_RE = /kick|board|drill|catch.?up|single.?arm|scull/; // reads SLOWER

/**
 * Detect swim equipment from the D-162 capture on workout_metadata
 * (swim_steps_equipment_confirmed[].used + swim_equipment_unplanned[]) and classify its
 * DIRECTIONAL effect on pace. Session-level only — we have no per-length data for surgical removal.
 */
export function detectSwimEquipment(workoutMetadata: unknown): SwimEquipmentResult {
  let meta: any = workoutMetadata;
  if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
  meta = meta || {};

  const confirmed = Array.isArray(meta.swim_steps_equipment_confirmed) ? meta.swim_steps_equipment_confirmed : [];
  const unplanned = Array.isArray(meta.swim_equipment_unplanned) ? meta.swim_equipment_unplanned : [];
  const used: string[] = [
    ...confirmed.filter((e: any) => e?.used === true).map((e: any) => String(e?.equipment || '').toLowerCase()),
    ...unplanned.map((e: any) => String(e || '').toLowerCase()),
  ];

  const has = (re: RegExp) => used.some((u) => re.test(u));
  const optimistic = has(OPTIMISTIC_RE);
  const pessimistic = has(PESSIMISTIC_RE);
  const names = [...new Set(used.map((u) => u.trim()).filter(Boolean))];

  const direction: SwimEquipmentDirection =
    optimistic && pessimistic ? 'mixed' : optimistic ? 'optimistic' : pessimistic ? 'pessimistic' : null;

  return { contaminated: optimistic || pessimistic, direction, names };
}

/**
 * Strength "equipment type" for protocol selection.
 * `commercial_gym` in generate-combined-plan / triathlon.ts means barbell-access tier
 * (commercial membership OR well-equipped home with barbell + rack).
 */

export function normStrengthEquipmentStrings(strengthEquipment: unknown): string[] {
  if (!Array.isArray(strengthEquipment)) return [];
  return strengthEquipment.map((s) => String(s).toLowerCase());
}

export function hasBarbellCapability(strengthEquipment: string[]): boolean {
  const n = normStrengthEquipmentStrings(strengthEquipment);
  const some = (sub: string) => n.some((s) => s.includes(sub));
  return (
    some('commercial gym') ||
    (some('barbell') && some('plate')) ||
    some('squat rack') ||
    some('power cage')
  );
}

/** Two+ positive compound 1RM fields → treat as barbell-capable if equipment list is stale. */
export function hasCompound1RMSignals(performanceNumbers: unknown): boolean {
  const p =
    performanceNumbers && typeof performanceNumbers === 'object' && !Array.isArray(performanceNumbers)
      ? (performanceNumbers as Record<string, unknown>)
      : null;
  if (!p) return false;
  const ok = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
  };
  const hits = [
    ok(p.squat ?? p.squat1RM ?? p.squat_1rm),
    ok(p.deadlift ?? p.dead_lift),
    ok(p.bench ?? p.bench_press ?? p.benchPress),
    ok(p.overheadPress1RM ?? p.ohp ?? p.overhead_press ?? p.overhead),
  ].filter(Boolean).length;
  return hits >= 2;
}

/**
 * Resolves athlete_state.equipment_type for generate-combined-plan / generate-triathlon-plan.
 * Arc may save home_gym while baselines list a full barbell setup — barbell signals win.
 */
export function resolveStrengthEquipmentTypeForPlan(
  explicitEquipmentType: unknown,
  strengthEquipment: string[],
  performanceNumbers: unknown,
): 'home_gym' | 'commercial_gym' {
  if (hasBarbellCapability(strengthEquipment) || hasCompound1RMSignals(performanceNumbers)) {
    return 'commercial_gym';
  }
  const ex = String(explicitEquipmentType ?? '').trim().toLowerCase();
  if (ex === 'home_gym' || ex === 'commercial_gym') return ex;
  return 'home_gym';
}

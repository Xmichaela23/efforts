/** Infer session demands until plan emits primary_demands. */

export type PlannedWorkoutLite = {
  id: string;
  name: string | null;
  type: string | null;
  metadata?: Record<string, unknown> | null;
};

export const AEROBIC_LEDGER_TARGETS = ["aerobic_base", "vo2max", "lactate_threshold"] as const;
export const GLYCOLYTIC_LEDGER_TARGETS = ["glycolytic", "sprint"] as const;

export function planEmitsPrimaryDemands(pw: PlannedWorkoutLite): string[] | null {
  const raw = pw.metadata?.primary_demands ?? pw.metadata?.primaryDemands;
  if (Array.isArray(raw) && raw.length > 0 && raw.every((x) => typeof x === "string")) {
    return raw as string[];
  }
  return null;
}

export function deriveDemands(workout: PlannedWorkoutLite): string[] {
  const declared = planEmitsPrimaryDemands(workout);
  if (declared) return declared;

  const type = (workout.type ?? "").toLowerCase();
  const name = (workout.name ?? "").toLowerCase();

  if (type === "run" || type === "walk") {
    if (name.includes("tempo") || name.includes("interval") || name.includes("threshold")) {
      return ["aerobic", "glycolytic", "quadriceps", "hamstrings", "calves"];
    }
    return ["aerobic", "quadriceps", "hamstrings", "calves"];
  }
  if (type === "ride" || type === "bike" || type === "cycling") {
    return ["aerobic", "quadriceps", "hamstrings"];
  }
  if (type === "swim") {
    return ["aerobic", "lats", "upper_back"];
  }
  if (type === "strength") {
    if (name.includes("lower") || name.includes("leg") || name.includes("squat")) {
      return ["quadriceps", "hamstrings", "glutes"];
    }
    if (name.includes("upper") || name.includes("push") || name.includes("pull")) {
      return ["chest", "upper_back", "lats", "anterior_deltoid", "triceps", "biceps"];
    }
    if (name.includes("full")) {
      return ["quadriceps", "hamstrings", "chest", "upper_back"];
    }
    return ["chest", "upper_back"];
  }
  return ["aerobic"];
}

export function isKeySession(workout: PlannedWorkoutLite): boolean {
  const name = (workout.name ?? "").toLowerCase();
  const t = (workout.type ?? "").toLowerCase();
  return name.includes("long") ||
    name.includes("tempo") ||
    name.includes("interval") ||
    name.includes("threshold") ||
    name.includes("race") ||
    name.includes("key") ||
    name.includes("quality") ||
    (t === "strength" && !name.includes("recovery") && !name.includes("maintenance"));
}

/** Map a training demand to session_load.load_target keys to sum (muscular = self). */
export function ledgerTargetsForDemand(demand: string): string[] {
  if (demand === "aerobic") return [...AEROBIC_LEDGER_TARGETS];
  if (demand === "glycolytic") return [...GLYCOLYTIC_LEDGER_TARGETS];
  if (demand === "neuromuscular") return ["cns"];
  return [demand];
}

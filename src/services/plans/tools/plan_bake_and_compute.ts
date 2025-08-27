// plan_bake_and_compute.ts
// One-file, dependency-free. Bakes deterministic rules (incl. 10K pace),
// compiles steps_preset → structural steps, computes durations & pace/power ranges,
// and outputs an augmented plan JSON for RUN, BIKE (FTP), and SWIM.

// ====== Types ======
type Units = "mi" | "m" | "yd";
type Intensity = "easy" | "target" | "tempo" | "longrun";
type SegmentKind = "work" | "recovery" | "steady" | "repeat";

type TimeStep = { kind: SegmentKind; ctrl: "time"; val: number; intensity?: Intensity; label?: string };
type DistStep = { kind: SegmentKind; ctrl: "distance"; val: number; intensity?: Intensity; label?: string };
type RepeatStep = { kind: "repeat"; times: number; of: Array<TimeStep | DistStep> };
type Step = TimeStep | DistStep | RepeatStep;

type Targets = {
  target_pace_sec_per_mi_ref?: "fiveK" | "tenK" | "mp"; // optional explicit refs
  target_pace_sec_per_mi_offset_from_fiveK?: number;    // +sec/mi for tempo-like targets
};

type WorkoutSpec = { units: Units; steps: Step[]; targets: Targets };

type BaselinesTemplate = {
  // RUN
  fiveK_pace_sec_per_mi: number | null;
  easy_pace_sec_per_mi: number | null;
  tenK_pace_sec_per_mi?: number | null; // derived if missing
  mp_pace_sec_per_mi?: number | null;   // derived if missing
  easy_from_5k_multiplier: number;      // default 1.30
  // BIKE
  ftp?: number | null;
  // SWIM (pace per 100 in plan.swim_unit)
  swim_pace_per_100_sec?: number | null;
};

type Tolerances = {
  short_interval_pct: number;
  long_interval_pct: number;
  tempo_pct: number;
  easy_pct: number;
};

type Session = {
  day: string;
  discipline: "run" | "bike" | "swim" | string;
  description: string;
  steps_preset?: string[];
  workout_spec?: WorkoutSpec;
  computed?: {
    total_seconds: number;
    total_hmmss: string;
    steps: Array<{
      index: number;
      kind: Exclude<SegmentKind, "repeat">;
      ctrl: "time" | "distance";
      seconds: number;
      // RUN
      pace_sec_per_mi?: number;
      pace_range?: { lower: number; upper: number };
      // BIKE
      target_watts?: number;
      power_range?: { lower: number; upper: number };
      // SWIM
      swim_pace_sec_per_100?: number;
      swim_pace_range_per_100?: { lower: number; upper: number };
      label?: string;
    }>;
  };
  [k: string]: any;
};

type Plan = {
  name: string;
  description: string;
  duration_weeks: number;
  swim_unit?: "yd" | "m";
  baselines_template?: BaselinesTemplate;
  tolerances?: Tolerances;
  export_hints?: Record<string, number>;
  sessions_by_week: Record<string, Session[]>;
  notes_by_week?: Record<string, string[]>;
  computed_rollups?: {
    perWeek: Record<string, { total_seconds: number; total_hmmss: string }>;
    grand_total_seconds: number;
    grand_total_hmmss: string;
  };
};

// ====== Deterministic constants ======
const MI_IN_M = 1609.344;
const TENK_FROM_5K_SECONDS = 20; // 10K = 5K + 20 s/mi
const MP_FROM_5K_SECONDS   = 75; // MP  = 5K + 75 s/mi
// BIKE power “centers”
const BIKE_PCT = { Z2: 0.65, SS: 0.90, THR: 1.00, VO2: 1.20 } as const;
// SWIM easy add-on (per 100 in plan’s swim_unit)
const SWIM_EASY_ADD_PER100_SEC = 7;

// ====== Utils ======
const metersToMiles = (m: number) => m / MI_IN_M;

const secondsToHMMSS = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
};

const roundRange = (p: number, pct: number) => ({
  lower: Math.round(p * (1 - pct)),
  upper: Math.round(p * (1 + pct)),
});

// ====== Baseline derivations (RUN) ======
const deriveEasy = (b: BaselinesTemplate): number | null => {
  if (typeof b.easy_pace_sec_per_mi === "number" && Number.isFinite(b.easy_pace_sec_per_mi)) return b.easy_pace_sec_per_mi;
  if (typeof b.fiveK_pace_sec_per_mi === "number" && Number.isFinite(b.fiveK_pace_sec_per_mi)) {
    return b.fiveK_pace_sec_per_mi * (b.easy_from_5k_multiplier ?? 1.30);
  }
  return null;
};

const deriveTenK = (b: BaselinesTemplate): number | null => {
  if (typeof b.tenK_pace_sec_per_mi === "number") return b.tenK_pace_sec_per_mi;
  if (typeof b.fiveK_pace_sec_per_mi === "number") return b.fiveK_pace_sec_per_mi + TENK_FROM_5K_SECONDS;
  return null;
};

const deriveMP = (b: BaselinesTemplate): number | null => {
  if (typeof b.mp_pace_sec_per_mi === "number") return b.mp_pace_sec_per_mi;
  if (typeof b.fiveK_pace_sec_per_mi === "number") return b.fiveK_pace_sec_per_mi + MP_FROM_5K_SECONDS;
  return null;
};

// ====== Tolerances ======
const toleranceFor = (tol: Tolerances, intensity: Intensity, stepSeconds?: number) => {
  if (intensity === "tempo")   return tol.tempo_pct;
  if (intensity === "longrun") return tol.tempo_pct;
  if (intensity === "easy")    return tol.easy_pct;
  const THRESH = 180; // ≤3:00 = short interval
  return (typeof stepSeconds === "number" && stepSeconds <= THRESH) ? tol.short_interval_pct : tol.long_interval_pct;
};

// ====== Bike power helpers ======
type PowerTolerances = { ss_thr_pct: number; vo2_pct: number };
const getPowerTolerances = (exportHints?: Record<string, number>): PowerTolerances => ({
  ss_thr_pct: exportHints?.power_tolerance_SS_thr ?? 0.05,
  vo2_pct:    exportHints?.power_tolerance_VO2    ?? 0.10
});

function bikePowerForLabel(label?: string): { pct?: number; tolKey?: "vo2" | "ss_thr" } {
  if (!label) return {};
  if (label === "VO2") return { pct: BIKE_PCT.VO2, tolKey: "vo2" };
  if (label === "THR") return { pct: BIKE_PCT.THR, tolKey: "ss_thr" };
  if (label === "SS")  return { pct: BIKE_PCT.SS,  tolKey: "ss_thr" };
  if (label === "Z2" || label === "WU" || label === "CD" || label === "easy") return { pct: BIKE_PCT.Z2, tolKey: "ss_thr" };
  return {};
}

// ====== Swim helpers ======
const swimHundreds = (distance: number, units: Units): number => {
  if (units === "yd" || units === "m") return distance / 100;
  // if someone encodes swim with "mi", convert: miles → meters → /100
  if (units === "mi") return (distance * 1609.344) / 100;
  return distance / 100;
};

// ====== Target pace resolver (RUN) ======
const targetPace = (
  targets: Targets,
  baselines: BaselinesTemplate,
  easy: number,
  kind: Intensity,
  opts?: { useTenK?: boolean; useMP?: boolean }
): number => {
  if (kind === "easy")    return easy;
  if (kind === "longrun") return easy * 0.97; // deterministic LR knob
  if (kind === "tempo") {
    if (typeof baselines.fiveK_pace_sec_per_mi !== 'number') throw new Error('fiveK pace missing');
    const base = baselines.fiveK_pace_sec_per_mi;
    const offset = targets.target_pace_sec_per_mi_offset_from_fiveK ?? 45; // default tempo = 5K + 45s/mi
    return base + offset;
  }
  // intensity === "target"
  if (opts?.useMP) {
    const mp = deriveMP(baselines);
    if (mp == null) throw new Error("MP pace unavailable");
    return mp;
  }
  if (opts?.useTenK) {
    const tenK = deriveTenK(baselines);
    if (tenK == null) throw new Error("10K pace unavailable");
    return tenK;
  }
  // explicit refs override defaults
  if (targets.target_pace_sec_per_mi_ref === "tenK") {
    const tenK = deriveTenK(baselines);
    if (tenK == null) throw new Error("10K pace unavailable");
    return tenK;
  }
  if (targets.target_pace_sec_per_mi_ref === "mp") {
    const mp = deriveMP(baselines);
    if (mp == null) throw new Error("MP pace unavailable");
    return mp;
  }
  // default to fiveK for "target"
  if (targets.target_pace_sec_per_mi_ref === "fiveK" || !targets.target_pace_sec_per_mi_ref) {
    if (typeof baselines.fiveK_pace_sec_per_mi === 'number') return baselines.fiveK_pace_sec_per_mi;
    throw new Error("fiveK pace missing");
  }
  throw new Error("No target pace specified");
};

// ====== Token maps ======
// (Covers tokens present in your 12-week plan; extend as needed.)
const PRESET_MAP: Record<string, Step[]> = {
  // --- RUN WU / CD ---
  "warmup_run_quality_12min": [{ kind: "steady", ctrl: "time", val: 12 * 60, intensity: "easy", label: "WU" }],
  "warmup_run_easy_10min":    [{ kind: "steady", ctrl: "time", val: 10 * 60, intensity: "easy", label: "WU" }],
  "cooldown_easy_10min":      [{ kind: "steady", ctrl: "time", val: 10 * 60, intensity: "easy", label: "CD" }],

  // --- RUN INTERVALS ---
  "interval_6x800m_5kpace_R2min": [
    { kind: "repeat", times: 6, of: [
      { kind: "work", ctrl: "distance", val: 0.5, intensity: "target" },
      { kind: "recovery", ctrl: "time", val: 120, intensity: "easy" }
    ]}
  ],
  "interval_8x800m_5kpace_R2min": [
    { kind: "repeat", times: 8, of: [
      { kind: "work", ctrl: "distance", val: 0.5, intensity: "target" },
      { kind: "recovery", ctrl: "time", val: 120, intensity: "easy" }
    ]}
  ],
  "interval_6x800m_10kpace_R2min": [
    { kind: "repeat", times: 6, of: [
      { kind: "work", ctrl: "distance", val: 0.5, intensity: "target" },
      { kind: "recovery", ctrl: "time", val: 120, intensity: "easy" }
    ]}
  ],
  "interval_6x400m_5kpace_R2-3min": [
    { kind: "repeat", times: 6, of: [
      { kind: "work", ctrl: "distance", val: 0.25, intensity: "target" },
      { kind: "recovery", ctrl: "time", val: 150, intensity: "easy" } // 2.5 min midpoint
    ]}
  ],
  // alias used in week 1
  "interval_6x400m_5kpace_R2min": [
    { kind: "repeat", times: 6, of: [
      { kind: "work", ctrl: "distance", val: 0.25, intensity: "target" },
      { kind: "recovery", ctrl: "time", val: 120, intensity: "easy" }
    ]}
  ],
  // alias for 6x1mi
  "interval_6x1mi_5kpace_R2min": [
    { kind: "repeat", times: 6, of: [
      { kind: "work", ctrl: "distance", val: 1.0, intensity: "target" },
      { kind: "recovery", ctrl: "time", val: 120, intensity: "easy" }
    ]}
  ],
  "1mi_x6_R2min": [
    { kind: "repeat", times: 6, of: [
      { kind: "work", ctrl: "distance", val: 1.0, intensity: "target" },
      { kind: "recovery", ctrl: "time", val: 120, intensity: "easy" }
    ]}
  ],

  // --- RUN TEMPO / CRUISE ---
  "tempo_4mi_5kpace_plus0:45": [{ kind: "work", ctrl: "distance", val: 4.0, intensity: "tempo" }],
  "tempo_5mi_5kpace_plus0:45": [{ kind: "work", ctrl: "distance", val: 5.0, intensity: "tempo" }],
  "tempo_5mi_5kpace_plus0:50": [{ kind: "work", ctrl: "distance", val: 5.0, intensity: "tempo" }],
  "tempo_6mi_5kpace_plus0:45": [{ kind: "work", ctrl: "distance", val: 6.0, intensity: "tempo" }],
  "tempo_6mi_5kpace_plus0:40": [{ kind: "work", ctrl: "distance", val: 6.0, intensity: "tempo" }],
  "tempo_7mi_5kpace_plus0:40": [{ kind: "work", ctrl: "distance", val: 7.0, intensity: "tempo" }],
  "tempo_7mi_5kpace_plus0:35": [{ kind: "work", ctrl: "distance", val: 7.0, intensity: "tempo" }],
  "tempo_8mi_5kpace_plus0:35": [{ kind: "work", ctrl: "distance", val: 8.0, intensity: "tempo" }],
  "tempo_4mi_5kpace_plus1:00": [{ kind: "work", ctrl: "distance", val: 4.0, intensity: "tempo" }],

  "cruise_4x1_5mi_5kpace_plus10s_R3min": [
    { kind: "repeat", times: 4, of: [
      { kind: "work", ctrl: "distance", val: 1.5, intensity: "tempo" },
      { kind: "recovery", ctrl: "time", val: 180, intensity: "easy" }
    ]}
  ],
  "cruise_5x1_5mi_5kpace_plus10s_R3min": [
    { kind: "repeat", times: 5, of: [
      { kind: "work", ctrl: "distance", val: 1.5, intensity: "tempo" },
      { kind: "recovery", ctrl: "time", val: 180, intensity: "easy" }
    ]}
  ],
  "cruise_3x2mi_5kpace_plus15s_R3min": [
    { kind: "repeat", times: 3, of: [
      { kind: "work", ctrl: "distance", val: 2.0, intensity: "tempo" },
      { kind: "recovery", ctrl: "time", val: 180, intensity: "easy" }
    ]}
  ],
  "cruise_4x2mi_5kpace_plus15s_R3min": [
    { kind: "repeat", times: 4, of: [
      { kind: "work", ctrl: "distance", val: 2.0, intensity: "tempo" },
      { kind: "recovery", ctrl: "time", val: 180, intensity: "easy" }
    ]}
  ],
  "cruise_3x2_5mi_5kpace_plus20s_R3min": [
    { kind: "repeat", times: 3, of: [
      { kind: "work", ctrl: "distance", val: 2.5, intensity: "tempo" },
      { kind: "recovery", ctrl: "time", val: 180, intensity: "easy" }
    ]}
  ],
  "cruise_2x3mi_5kpace_plus20s_R3min": [
    { kind: "repeat", times: 2, of: [
      { kind: "work", ctrl: "distance", val: 3.0, intensity: "tempo" },
      { kind: "recovery", ctrl: "time", val: 180, intensity: "easy" }
    ]}
  ],
  // aliases using hh:mm-style offsets
  "cruise_4x1_5mi_5kpace_plus0:10_R3min": [
    { kind: "repeat", times: 4, of: [
      { kind: "work", ctrl: "distance", val: 1.5, intensity: "tempo" },
      { kind: "recovery", ctrl: "time", val: 180, intensity: "easy" }
    ]}
  ],
  "cruise_5x1_5mi_5kpace_plus0:10_R3min": [
    { kind: "repeat", times: 5, of: [
      { kind: "work", ctrl: "distance", val: 1.5, intensity: "tempo" },
      { kind: "recovery", ctrl: "time", val: 180, intensity: "easy" }
    ]}
  ],
  "cruise_3x2mi_5kpace_plus0:15_R3min": [
    { kind: "repeat", times: 3, of: [
      { kind: "work", ctrl: "distance", val: 2.0, intensity: "tempo" },
      { kind: "recovery", ctrl: "time", val: 180, intensity: "easy" }
    ]}
  ],
  "cruise_4x2mi_5kpace_plus0:15_R3min": [
    { kind: "repeat", times: 4, of: [
      { kind: "work", ctrl: "distance", val: 2.0, intensity: "tempo" },
      { kind: "recovery", ctrl: "time", val: 180, intensity: "easy" }
    ]}
  ],
  "cruise_3x2_5mi_5kpace_plus0:20_R3min": [
    { kind: "repeat", times: 3, of: [
      { kind: "work", ctrl: "distance", val: 2.5, intensity: "tempo" },
      { kind: "recovery", ctrl: "time", val: 180, intensity: "easy" }
    ]}
  ],
  "cruise_2x3mi_5kpace_plus0:20_R3min": [
    { kind: "repeat", times: 2, of: [
      { kind: "work", ctrl: "distance", val: 3.0, intensity: "tempo" },
      { kind: "recovery", ctrl: "time", val: 180, intensity: "easy" }
    ]}
  ],
  
  // Additional cruise tokens found in plans
  "3200m_cruise_or_3min": [
    { kind: "repeat", times: 4, of: [
      { kind: "work", ctrl: "distance", val: 2.0, intensity: "tempo" },
      { kind: "recovery", ctrl: "time", val: 180, intensity: "easy" }
    ]}
  ],
  "4000m_cruise_or_3min": [
    { kind: "repeat", times: 3, of: [
      { kind: "work", ctrl: "distance", val: 2.5, intensity: "tempo" },
      { kind: "recovery", ctrl: "time", val: 180, intensity: "easy" }
    ]}
  ],
  "4800m_cruise_or_3min": [
    { kind: "repeat", times: 2, of: [
      { kind: "work", ctrl: "distance", val: 3.0, intensity: "tempo" },
      { kind: "recovery", ctrl: "time", val: 180, intensity: "easy" }
    ]}
  ],
  "1600m_5k_eq_or_2min": [
    { kind: "repeat", times: 4, of: [
      { kind: "work", ctrl: "distance", val: 1.0, intensity: "target" },
      { kind: "recovery", ctrl: "time", val: 120, intensity: "easy" }
    ]}
  ],
  
  // Additional interval tokens found in plans
  "200m_3k_eq_jog": [
    { kind: "repeat", times: 8, of: [
      { kind: "work", ctrl: "distance", val: 0.125, intensity: "target" },
      { kind: "recovery", ctrl: "distance", val: 0.125, intensity: "easy" }
    ]}
  ],
  "400m_5k_eq_jog": [
    { kind: "repeat", times: 6, of: [
      { kind: "work", ctrl: "distance", val: 0.25, intensity: "target" },
      { kind: "recovery", ctrl: "distance", val: 0.25, intensity: "easy" }
    ]}
  ],
  "800m_10k_eq_or_2min": [
    { kind: "repeat", times: 5, of: [
      { kind: "work", ctrl: "distance", val: 0.5, intensity: "target" },
      { kind: "recovery", ctrl: "time", val: 120, intensity: "easy" }
    ]}
  ],
  "1mi_thr_3to4min": [
    { kind: "repeat", times: 4, of: [
      { kind: "work", ctrl: "distance", val: 1.0, intensity: "target" },
      { kind: "recovery", ctrl: "time", val: 210, intensity: "easy" } // 3.5 min midpoint
    ]}
  ],

  // --- STRIDES / SPEED DRILLS (RUN) ---
  "strides_6x20s": [
    { kind: "work", ctrl: "time", val: 20, intensity: "target", label: "stride" },
    { kind: "recovery", ctrl: "time", val: 40, intensity: "easy", label: "float" },
    { kind: "repeat", times: 5, of: [
      { kind: "work", ctrl: "time", val: 20, intensity: "target", label: "stride" },
      { kind: "recovery", ctrl: "time", val: 40, intensity: "easy", label: "float" }
    ]}
  ],
  "strides_4x20s": [
    { kind: "repeat", times: 4, of: [
      { kind: "work", ctrl: "time", val: 20, intensity: "target", label: "stride" },
      { kind: "recovery", ctrl: "time", val: 40, intensity: "easy", label: "float" }
    ]}
  ],
  "speed_8x20s_fast_R60s": [
    { kind: "repeat", times: 8, of: [
      { kind: "work", ctrl: "time", val: 20, intensity: "target", label: "fast" },
      { kind: "recovery", ctrl: "time", val: 60, intensity: "easy", label: "jog" }
    ]}
  ],
  // alias in plan
  "speed_8x20s_R60s": [
    { kind: "repeat", times: 8, of: [
      { kind: "work", ctrl: "time", val: 20, intensity: "target", label: "fast" },
      { kind: "recovery", ctrl: "time", val: 60, intensity: "easy", label: "jog" }
    ]}
  ],
  "drills_A_B_skips_high_knees": [
    { kind: "steady", ctrl: "time", val: 6 * 60, intensity: "easy", label: "drills-A/B" },
    { kind: "steady", ctrl: "time", val: 4 * 60, intensity: "easy", label: "high-knees" }
  ],

  // --- LONG RUNS (RUN) ---
  "longrun_90min_easypace_last10steady": [
    { kind: "steady", ctrl: "time", val: 80 * 60, intensity: "easy", label: "LR-easy" },
    { kind: "work",   ctrl: "time", val: 10 * 60, intensity: "longrun", label: "steady-finish" }
  ],
  "longrun_90min_easypace_smooth": [{ kind: "steady", ctrl: "time", val: 90 * 60, intensity: "easy", label: "LR-easy" }],
  "longrun_100min_easypace": [{ kind: "steady", ctrl: "time", val: 100 * 60, intensity: "easy", label: "LR-easy" }],
  "longrun_110min_easypace": [{ kind: "steady", ctrl: "time", val: 110 * 60, intensity: "easy", label: "LR-easy" }],
  "longrun_120min_easypace": [{ kind: "steady", ctrl: "time", val: 120 * 60, intensity: "easy", label: "LR-easy" }],
  "longrun_130min_easypace": [{ kind: "steady", ctrl: "time", val: 130 * 60, intensity: "easy", label: "LR-easy" }],
  "longrun_140min_easypace": [{ kind: "steady", ctrl: "time", val: 140 * 60, intensity: "easy", label: "LR-easy" }],
  "longrun_150min_easypace": [{ kind: "steady", ctrl: "time", val: 150 * 60, intensity: "easy", label: "LR-easy" }],
  "longrun_135min_easypace_2x25min_MP": [
    { kind: "steady", ctrl: "time", val: 35 * 60, intensity: "easy", label: "base" },
    { kind: "work",   ctrl: "time", val: 25 * 60, intensity: "target", label: "MP-1" },
    { kind: "recovery", ctrl: "time", val: 7 * 60, intensity: "easy", label: "float" },
    { kind: "work",   ctrl: "time", val: 25 * 60, intensity: "target", label: "MP-2" },
    { kind: "steady", ctrl: "time", val: 43 * 60, intensity: "easy", label: "cool-easy" }
  ],
  "longrun_150min_easypace_3x20min_MP": [
    { kind: "steady", ctrl: "time", val: 50 * 60, intensity: "easy", label: "base" },
    { kind: "repeat", times: 3, of: [
      { kind: "work",   ctrl: "time", val: 20 * 60, intensity: "target", label: "MP" },
      { kind: "recovery", ctrl: "time", val: 6 * 60, intensity: "easy", label: "float" }
    ]},
    { kind: "steady", ctrl: "time", val: 28 * 60, intensity: "easy", label: "cool-easy" }
  ],
  "longrun_150min_easypace_finish_35min_MP": [
    { kind: "steady", ctrl: "time", val: 115 * 60, intensity: "easy", label: "LR-easy" },
    { kind: "work",   ctrl: "time", val: 35 * 60, intensity: "target", label: "MP-finish" }
  ],

  // --- BIKE ---
  "warmup_bike_quality_15min_fastpedal": [{ kind: "steady", ctrl: "time", val: 15 * 60, intensity: "easy", label: "WU" }],
  "cooldown_bike_easy_10min":            [{ kind: "steady", ctrl: "time", val: 10 * 60, intensity: "easy", label: "CD" }],
  "warmup_bike_endurance_10min":         [{ kind: "steady", ctrl: "time", val: 10 * 60, intensity: "easy", label: "WU" }],

  "bike_endurance_120min_Z2": [{ kind: "steady", ctrl: "time", val: 120 * 60, intensity: "easy", label: "Z2" }],
  "bike_endurance_150min_Z2": [{ kind: "steady", ctrl: "time", val: 150 * 60, intensity: "easy", label: "Z2" }],
  "bike_endurance_180min_Z2": [{ kind: "steady", ctrl: "time", val: 180 * 60, intensity: "easy", label: "Z2" }],

  "bike_vo2_6x3min_R3min": [
    { kind: "repeat", times: 6, of: [
      { kind: "work", ctrl: "time", val: 180, intensity: "target", label: "VO2" },
      { kind: "recovery", ctrl: "time", val: 180, intensity: "easy", label: "easy" }
    ]}
  ],
  "bike_vo2_4x3min_R3min": [
    { kind: "repeat", times: 4, of: [
      { kind: "work", ctrl: "time", val: 180, intensity: "target", label: "VO2" },
      { kind: "recovery", ctrl: "time", val: 180, intensity: "easy", label: "easy" }
    ]}
  ],
  "bike_thr_4x8min_R5min": [
    { kind: "repeat", times: 4, of: [
      { kind: "work", ctrl: "time", val: 8 * 60, intensity: "target", label: "THR" },
      { kind: "recovery", ctrl: "time", val: 5 * 60, intensity: "easy", label: "easy" }
    ]}
  ],
  "bike_thr_3x8min_R5min": [
    { kind: "repeat", times: 3, of: [
      { kind: "work", ctrl: "time", val: 8 * 60, intensity: "target", label: "THR" },
      { kind: "recovery", ctrl: "time", val: 5 * 60, intensity: "easy", label: "easy" }
    ]}
  ],
  "bike_ss_2x20min_R6min": [
    { kind: "repeat", times: 2, of: [
      { kind: "work", ctrl: "time", val: 20 * 60, intensity: "target", label: "SS" },
      { kind: "recovery", ctrl: "time", val: 6 * 60, intensity: "easy", label: "easy" }
    ]}
  ],
  "bike_ss_2x22min_R6min": [
    { kind: "repeat", times: 2, of: [
      { kind: "work", ctrl: "time", val: 22 * 60, intensity: "target", label: "SS" },
      { kind: "recovery", ctrl: "time", val: 6 * 60, intensity: "easy", label: "easy" }
    ]}
  ],
  "bike_ss_2x25min_R6min": [
    { kind: "repeat", times: 2, of: [
      { kind: "work", ctrl: "time", val: 25 * 60, intensity: "target", label: "SS" },
      { kind: "recovery", ctrl: "time", val: 6 * 60, intensity: "easy", label: "easy" }
    ]}
  ],
  "bike_taper_2x12min_Z3_R5min": [
    { kind: "repeat", times: 2, of: [
      { kind: "work", ctrl: "time", val: 12 * 60, intensity: "target", label: "Z3" },
      { kind: "recovery", ctrl: "time", val: 5 * 60, intensity: "easy", label: "easy" }
    ]}
  ],

  // --- Generic endurance shorthand used in descriptions ---
  "END_120min": [{ kind: "steady", ctrl: "time", val: 120 * 60, intensity: "easy", label: "Z2" }],
  "END_150min": [{ kind: "steady", ctrl: "time", val: 150 * 60, intensity: "easy", label: "Z2" }],
  "END_180min": [{ kind: "steady", ctrl: "time", val: 180 * 60, intensity: "easy", label: "Z2" }],

  // --- SWIM ---
  "swim_warmup_200yd_easy": [{ kind: "steady", ctrl: "distance", val: 200, intensity: "easy", label: "WU" }],
  "swim_warmup_300yd_easy": [{ kind: "steady", ctrl: "distance", val: 300, intensity: "easy", label: "WU" }],
  "swim_cooldown_200yd_easy": [{ kind: "steady", ctrl: "distance", val: 200, intensity: "easy", label: "CD" }],
  
  "swim_endurance_1500yd_easy": [{ kind: "steady", ctrl: "distance", val: 1500, intensity: "easy", label: "endurance" }],
  "swim_endurance_2000yd_easy": [{ kind: "steady", ctrl: "distance", val: 2000, intensity: "easy", label: "endurance" }],
  
  "swim_intervals_6x100yd_threshold_R30s": [
    { kind: "repeat", times: 6, of: [
      { kind: "work", ctrl: "distance", val: 100, intensity: "target", label: "threshold" },
      { kind: "recovery", ctrl: "time", val: 30, intensity: "easy", label: "rest" }
    ]}
  ],
  "swim_intervals_8x50yd_vo2_R20s": [
    { kind: "repeat", times: 8, of: [
      { kind: "work", ctrl: "distance", val: 50, intensity: "target", label: "VO2" },
      { kind: "recovery", ctrl: "time", val: 20, intensity: "easy", label: "rest" }
    ]}
  ],
  
  "swim_drills_4x50yd_catchup": [
    { kind: "repeat", times: 4, of: [
      { kind: "work", ctrl: "distance", val: 50, intensity: "easy", label: "catch-up drill" }
    ]}
  ],
  "swim_drills_4x50yd_singlearm": [
    { kind: "repeat", times: 4, of: [
      { kind: "work", ctrl: "distance", val: 50, intensity: "easy", label: "single arm drill" }
    ]}
  ],
  "swim_drills_4x50yd_scull": [
    { kind: "repeat", times: 4, of: [
      { kind: "work", ctrl: "distance", val: 50, intensity: "easy", label: "sculling drill" }
    ]}
  ],
  "swim_drills_4x50yd_kick": [
    { kind: "repeat", times: 4, of: [
      { kind: "work", ctrl: "distance", val: 50, intensity: "easy", label: "kick drill" }
    ]}
  ]
};

// === CURSOR PATCH FIXES ===
// Back-compat alias for plan that uses "1mi_x6_R2min"
// (Keeps mapping in sync with the 6x1mi token above.)
// If already defined, this assignment is effectively a no-op.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
PRESET_MAP["1mi_x6_R2min"] = PRESET_MAP["interval_6x1mi_5kpace_R2min"] || PRESET_MAP["1mi_x6_R2min"];

// Tempo/cruise offsets (seconds per mile added to 5K pace)
const TEMPO_OFFSETS: Record<string, number> = {
  "tempo_4mi_5kpace_plus0:45": 45,
  "tempo_5mi_5kpace_plus0:45": 45,
  "tempo_5mi_5kpace_plus0:50": 50,
  "tempo_6mi_5kpace_plus0:45": 45,
  "tempo_6mi_5kpace_plus0:40": 40,
  "tempo_7mi_5kpace_plus0:40": 40,
  "tempo_7mi_5kpace_plus0:35": 35,
  "tempo_8mi_5kpace_plus0:35": 35,
  "tempo_4mi_5kpace_plus1:00": 60,
  "cruise_4x1_5mi_5kpace_plus10s_R3min": 10,
  "cruise_5x1_5mi_5kpace_plus10s_R3min": 10,
  "cruise_3x2mi_5kpace_plus15s_R3min": 15,
  "cruise_4x2mi_5kpace_plus15s_R3min": 15,
  "cruise_3x2_5mi_5kpace_plus20s_R3min": 20,
  "cruise_2x3mi_5kpace_plus20s_R3min": 20,
  // alias keys
  "cruise_4x1_5mi_5kpace_plus0:10_R3min": 10,
  "cruise_5x1_5mi_5kpace_plus0:10_R3min": 10,
  "cruise_3x2mi_5kpace_plus0:15_R3min": 15,
  "cruise_4x2mi_5kpace_plus0:15_R3min": 15,
  "cruise_3x2_5mi_5kpace_plus0:20_R3min": 20,
  "cruise_2x3mi_5kpace_plus0:20_R3min": 20
};

// ====== Compiler & helpers ======
const isRepeat = (s: Step): s is RepeatStep => s.kind === "repeat";
const expandPresets = (tokens: string[] | undefined): Step[] =>
  (tokens ?? []).flatMap(t => PRESET_MAP[t] ?? []);

const expandRepeats = (steps: Step[]): Array<TimeStep | DistStep> => {
  const out: Array<TimeStep | DistStep> = [];
  for (const s of steps) {
    if (isRepeat(s)) for (let i = 0; i < s.times; i++) out.push(...s.of);
    else out.push(s);
  }
  return out;
};

// ====== Compute one workout ======
const computeWorkout = (
  spec: WorkoutSpec,
  baselines: BaselinesTemplate,
  tol: Tolerances,
  tokensUsed?: string[],
  exportHints?: Record<string, number>,
  ctx?: { discipline: string; swim_unit?: "yd" | "m" }
) => {
  const easy = deriveEasy(baselines);
  if (easy === null) {
    throw new Error("Missing required baselines: need easy pace or 5K pace to compute workout");
  }
  const useMP  = (tokensUsed ?? []).some(t => t.includes("MP"));
  const useTenKToken = (tokensUsed ?? []).some(t => t.includes("10kpace"));

  // tempo offset from tokens (if not explicitly provided)
  let targetOffsetFrom5k = spec.targets.target_pace_sec_per_mi_offset_from_fiveK ?? undefined;
  if (targetOffsetFrom5k == null) {
    for (const t of tokensUsed ?? []) {
      if (TEMPO_OFFSETS[t] != null) { targetOffsetFrom5k = TEMPO_OFFSETS[t]; break; }
    }
  }

  const sessionTargets: Targets = {
    target_pace_sec_per_mi_ref: spec.targets.target_pace_sec_per_mi_ref || (useTenKToken ? "tenK" : "fiveK"),
    target_pace_sec_per_mi_offset_from_fiveK: targetOffsetFrom5k
  };

  const flat = expandRepeats(spec.steps);
  const ptols = getPowerTolerances(exportHints);

  const resolved = flat.map((s, idx) => {
    const intensity: Intensity = s.intensity ?? (s.kind === "steady" ? "easy" : "target");

    // SWIM handling (if discipline is swim)
    if (ctx?.discipline === "swim") {
      const base100 = baselines.swim_pace_per_100_sec ?? null;
      const unit = ctx.swim_unit ?? "yd";
      const add = intensity === "easy" ? SWIM_EASY_ADD_PER100_SEC : 0;

      if (s.ctrl === "time") {
        const t = s.val;
        return {
          index: idx,
          kind: (s.kind === "steady" ? "steady" : (s.kind as Exclude<SegmentKind, "repeat">)),
          ctrl: "time" as const,
          seconds: t,
          original_val: s.val,
          original_units: "sec",
          swim_pace_sec_per_100: base100 ?? undefined,
          swim_pace_range_per_100: base100 != null ? roundRange(base100 + add, 0.03) : undefined, // ±3% band
          label: s.label
        };
      } else {
        // distance-controlled swim step
        const hundreds = swimHundreds(s.val, spec.units ?? unit);
        let sec = 0;
        if (base100 != null) {
          sec = Math.round(hundreds * (base100 + add));
        } else {
          // if no swim baseline, leave 0 to signal "unknown"
          sec = 0;
        }
        return {
          index: idx,
          kind: (s.kind === "steady" ? "steady" : (s.kind as Exclude<SegmentKind, "repeat">)),
          ctrl: "distance" as const,
          seconds: sec,
          original_val: s.val,
          original_units: spec.units,
          swim_pace_sec_per_100: base100 ?? undefined,
          swim_pace_range_per_100: base100 != null ? roundRange(base100 + add, 0.03) : undefined,
          label: s.label
        };
      }
    }

    // BIKE handling (power via FTP if label indicates a zone)
    if (ctx?.discipline === "bike") {
      if (s.ctrl === "time") {
        const t = s.val;
        const bikeStep: any = {
          index: idx,
          kind: (s.kind === "steady" ? "steady" : (s.kind as Exclude<SegmentKind, "repeat">)),
          ctrl: "time" as const,
          seconds: t,
          label: s.label
        };

        const { pct, tolKey } = bikePowerForLabel(s.label);
        if (pct && baselines.ftp != null) {
          const target_watts = Math.round(baselines.ftp * pct);
          const tol = tolKey === "vo2" ? ptols.vo2_pct : ptols.ss_thr_pct;
          bikeStep.target_watts = target_watts;
          bikeStep.power_range = roundRange(target_watts, tol);
        }
        return bikeStep;
      } else {
        // time from distance on bike isn't defined (no speed baseline) → leave as 0 seconds
        const bikeStep: any = {
          index: idx,
          kind: (s.kind === "steady" ? "steady" : (s.kind as Exclude<SegmentKind, "repeat">)),
          ctrl: "distance" as const,
          seconds: 0,
          label: s.label
        };
        const { pct, tolKey } = bikePowerForLabel(s.label);
        if (pct && baselines.ftp != null) {
          const target_watts = Math.round(baselines.ftp * pct);
          const tol = tolKey === "vo2" ? ptols.vo2_pct : ptols.ss_thr_pct;
          bikeStep.target_watts = target_watts;
          bikeStep.power_range = roundRange(target_watts, tol);
        }
        return bikeStep;
      }
    }

    // RUN handling (default)
    const opts = { useTenK: useTenKToken, useMP };
    if (s.ctrl === "time") {
      const t = s.val;
      const pct = toleranceFor(tol, intensity, t);
      const pace = (intensity === "easy") ? easy : targetPace(sessionTargets, baselines, easy, intensity, opts);
      return {
        index: idx,
        kind: (s.kind === "steady" ? "steady" : (s.kind as Exclude<SegmentKind, "repeat">)),
        ctrl: "time" as const,
        seconds: t,
        original_val: s.val,
        original_units: "sec",
        pace_sec_per_mi: pace,
        pace_range: roundRange(pace, pct),
        label: s.label
      };
    } else {
      // distance (mi or m) for RUN
      const miles =
        spec.units === "mi" ? s.val :
        spec.units === "m"  ? metersToMiles(s.val) :
        /* yd encoded for run? rare, treat as meters-equivalent */ metersToMiles(s.val * 0.9144);

      const pace = targetPace(sessionTargets, baselines, easy, intensity, opts);
      const seconds = miles * pace;
      const pct = toleranceFor(tol, intensity, seconds);
      return {
        index: idx,
        kind: (s.kind === "steady" ? "steady" : (s.kind as Exclude<SegmentKind, "repeat">)),
        ctrl: "distance" as const,
        seconds: Math.round(seconds),
        original_val: s.val,
        original_units: spec.units,
        pace_sec_per_mi: pace,
        pace_range: roundRange(pace, pct),
        label: s.label
      };
    }
  });

  const total_seconds = resolved.reduce((a, s) => a + s.seconds, 0);
  return { steps: resolved, total_seconds, total_hmmss: secondsToHMMSS(total_seconds), targets: sessionTargets };
};

// ====== Main augmentor ======
function augmentPlan(plan: Plan): Plan {
  const baselines: BaselinesTemplate = plan.baselines_template ?? {
    fiveK_pace_sec_per_mi: null,
    easy_pace_sec_per_mi: null,
    tenK_pace_sec_per_mi: null,
    mp_pace_sec_per_mi: null,
    ftp: null,
    swim_pace_per_100_sec: null,
    easy_from_5k_multiplier: 1.30
  };
  const tolerances: Tolerances = plan.tolerances ?? {
    short_interval_pct: 0.05,
    long_interval_pct: 0.04,
    tempo_pct: 0.03,
    easy_pct: 0.05
  };

  // bake derived baselines (easy, 10K, MP) into header
  let easyDerived: number | null = null;
  try { easyDerived = deriveEasy(baselines); } catch {}
  const tenKDerived = deriveTenK(baselines);
  const mpDerived   = deriveMP(baselines);

  const bakedBaselines: BaselinesTemplate = {
    ...baselines,
    easy_pace_sec_per_mi: easyDerived ?? baselines.easy_pace_sec_per_mi,
    tenK_pace_sec_per_mi: tenKDerived ?? baselines.tenK_pace_sec_per_mi ?? null,
    mp_pace_sec_per_mi:   mpDerived   ?? baselines.mp_pace_sec_per_mi   ?? null
  };

  // --- Swim baseline normalization (string "mm:ss" → seconds) ---
  const toSec = (mmss: string): number => {
    const [m, s] = mmss.split(":").map(Number);
    return (m || 0) * 60 + (s || 0);
  };
  try {
    const raw = (plan as any).swimPace100 ?? (plan as any)?.baselines_template?.swimPace100;
    if (typeof raw === "string" && !(bakedBaselines as any).swim_pace_per_100_sec) {
      (bakedBaselines as any).swim_pace_per_100_sec = toSec(raw);
    }
  } catch {}

  const newSessionsByWeek: Record<string, Session[]> = {};
  for (const wk of Object.keys(plan.sessions_by_week)) {
    newSessionsByWeek[wk] = plan.sessions_by_week[wk].map((sess) => {
      const tokens = sess.steps_preset ?? [];
      const compiledSteps = expandPresets(tokens);

      // default units/targets per discipline
      const units: Units =
        (sess.workout_spec?.units as Units) ??
        (sess.discipline === "run" ? "mi" : sess.discipline === "swim" ? (plan.swim_unit ?? "yd") : "mi");

      const defaultTargets: Targets =
        sess.workout_spec?.targets ??
        (sess.discipline === "run"
          ? { target_pace_sec_per_mi_ref: "fiveK" }
          : {});

      const workout_spec: WorkoutSpec = {
        units,
        steps: (sess.workout_spec?.steps?.length ? sess.workout_spec.steps : compiledSteps),
        targets: defaultTargets
      };

      let computed: Session["computed"] | undefined;
      try {
        const calc = computeWorkout(
          workout_spec,
          bakedBaselines,
          tolerances,
          tokens,
          plan.export_hints,
          { discipline: sess.discipline, swim_unit: plan.swim_unit }
        );
        computed = { total_seconds: calc.total_seconds, total_hmmss: calc.total_hmmss, steps: calc.steps };
      } catch (error) {
        // Log the specific error for debugging
        console.error(`[baker] Failed to compute workout for session:`, {
          week: wk,
          session: sess,
          error: error instanceof Error ? error.message : String(error),
          baselines: Object.keys(bakedBaselines).filter(k => bakedBaselines[k as keyof BaselinesTemplate] != null)
        });
        
        // Fallback: try to compute basic duration from steps even without baselines
        try {
          const compiledSteps = expandPresets(tokens);
          const flatSteps = expandRepeats(compiledSteps);
          const totalSeconds = flatSteps.reduce((sum, step) => sum + (step.val || 0), 0);
          
          if (totalSeconds > 0) {
            computed = { 
              total_seconds: totalSeconds, 
              total_hmmss: secondsToHMMSS(totalSeconds), 
              steps: flatSteps.map((step, idx) => ({
                index: idx,
                kind: step.kind === 'repeat' ? 'work' : step.kind,
                ctrl: step.ctrl,
                seconds: step.val,
                label: step.label,
                intensity: step.intensity
              }))
            };
          }
        } catch (fallbackError) {
          console.error(`[baker] Fallback duration calculation also failed:`, fallbackError);
        }
      }

      return { ...sess, workout_spec, computed };
    });
  }

  const augmented = { ...plan, baselines_template: bakedBaselines, tolerances, sessions_by_week: newSessionsByWeek };
  const computed_rollups = formatPlanRollups(augmented);
  return { ...augmented, computed_rollups };
}

// ====== Optional: weekly/plan rollups (helpful in UIs) ======
function rollupWeekSeconds(sessions: Session[]): number {
  return sessions.reduce((acc, s) => acc + (s.computed?.total_seconds ?? 0), 0);
}

function formatPlanRollups(plan: Plan) {
  const perWeek: Record<string, { total_seconds: number; total_hmmss: string }> = {};
  let grand = 0;
  for (const wk of Object.keys(plan.sessions_by_week)) {
    const sec = rollupWeekSeconds(plan.sessions_by_week[wk]);
    grand += sec;
    perWeek[wk] = { total_seconds: sec, total_hmmss: secondsToHMMSS(sec) };
  }
  return { perWeek, grand_total_seconds: grand, grand_total_hmmss: secondsToHMMSS(grand) };
}

// ====== Public API ======
export type {
  Plan, Session, WorkoutSpec, Step, Targets, Tolerances,
  Units, Intensity, SegmentKind
};
export { augmentPlan, formatPlanRollups };


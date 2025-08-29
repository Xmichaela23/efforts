// plan_dsl.ts — tiny DSL → steps_preset expander
// Usage: expandSession({discipline:"swim", main:"drills(catchup,singlearm); pull2x100; kick2x100"}, defaults)

export type Discipline = "run" | "bike" | "swim" | "strength";

export type Defaults = {
  swim: { wu: string; cd: string };
  run: { wu: string; cd: string };
  bike: { wu: string; cd: string };
};

export type SessionDSL = {
  day?: string;
  discipline: Discipline;
  description?: string;
  steps_preset?: string[];
  main?: string;
  extra?: string;
  override_wu?: string;
  override_cd?: string;
  tags?: string[];
};

const SWIM_DRILL_ALIAS: Record<string, string> = {
  catchup: "swim_drills_4x50yd_catchup",
  singlearm: "swim_drills_4x50yd_singlearm",
  fist: "swim_drills_4x50yd_fist",
  scull: "swim_drills_4x50yd_scull",
  scullfront: "swim_drills_2x100yd_scullfront",
  fingertipdrag: "swim_drills_4x50yd_fingertipdrag",
  "616": "swim_drills_4x50yd_616",
  zipper: "swim_drills_4x50yd_zipper",
  doggypaddle: "swim_drills_4x50yd_doggypaddle",
};

function swimBlock(token: string): string[] {
  const t = token.trim();
  if (/^pull2x100$/i.test(t)) return ["swim_pull_2x100yd"];
  if (/^pull4x50$/i.test(t)) return ["swim_pull_4x50yd"];
  if (/^pull300$/i.test(t)) return ["swim_pull_300yd_steady"];
  if (/^kick2x100$/i.test(t)) return ["swim_kick_2x100yd"];
  if (/^kick4x50$/i.test(t)) return ["swim_kick_4x50yd"];

  const aer = t.match(/^aerobic\((\d+)x(\d+)\)$/i);
  if (aer) {
    const reps = aer[1], dist = aer[2];
    const key = `swim_aerobic_${reps}x${dist}yd_${Number(dist) <= 100 ? "easysteady" : "easy"}`;
    return [key];
  }

  if (/^endurance_800$/i.test(t)) return ["swim_endurance_800yd_easy"];

  const drills = t.match(/^drills\(([^)]+)\)$/i);
  if (drills) {
    const parts = drills[1].split(",").map(s => s.trim().toLowerCase());
    return parts.map(name => {
      const m = SWIM_DRILL_ALIAS[name];
      if (!m) throw new Error(`Unknown swim drill "${name}"`);
      return m;
    });
  }

  throw new Error(`Unknown swim block "${token}"`);
}

function runBlock(token: string): string[] {
  const t = token.trim();
  const intv = t.match(/^(\d+)x(\d+)(m)@(\w+)\s+R(\d+)$/i);
  if (intv) {
    const [ , reps, dist, unit, pace, rest ] = intv;
    const u = unit.toLowerCase() === "m" ? "m" : "m";
    return [`interval_${reps}x${dist}${u}_${pace.toLowerCase()}pace_R${rest}min`];
  }
  const tempo = t.match(/^tempo\s+(\d+)(mi)\s*@\s*(\w+)\+([0-9:]+)$/i);
  if (tempo) {
    const [ , dist, , base, plus ] = tempo;
    return [`tempo_${dist}mi_${base.toLowerCase()}pace_plus${plus}`];
  }
  throw new Error(`Unknown run block "${token}"`);
}

function bikeBlock(token: string): string[] {
  const t = token.trim();
  const vo2 = t.match(/^vo2\s+(\d+)x(\d+)\s+r(\d+)$/i);
  if (vo2) {
    const [ , reps, work, rest ] = vo2;
    return [`bike_vo2_${reps}x${work}min_R${rest}min`];
  }
  const thr = t.match(/^thr(?:eshold)?\s+(\d+)x(\d+)\s+r(\d+)$/i);
  if (thr) {
    const [ , reps, work, rest ] = thr;
    return [`bike_thr_${reps}x${work}min_R${rest}min`];
  }
  const ss = t.match(/^ss\s+(\d+)x(\d+)\s+r(\d+)$/i);
  if (ss) {
    const [ , reps, work, rest ] = ss;
    return [`bike_ss_${reps}x${work}min_R${rest}min`];
  }
  const end = t.match(/^end\s+(\d+)$/i);
  if (end) return [`bike_endurance_${end[1]}min_Z2`];
  throw new Error(`Unknown bike block "${token}"`);
}

function parseMain(discipline: Discipline, dsl?: string): string[] {
  if (!dsl) return [];
  const parts = dsl.split(";").map(s => s.trim()).filter(Boolean);
  return parts.flatMap(p => {
    if (discipline === "swim") return swimBlock(p);
    if (discipline === "run") return runBlock(p);
    if (discipline === "bike") return bikeBlock(p);
    if (discipline === "strength") {
      if (/^[a-z0-9_]+$/i.test(p)) return [p];
      throw new Error(`Unknown strength block "${p}"`);
    }
    return [];
  });
}

export function expandSession(s: SessionDSL, defaults: Defaults): string[] {
  if (s.steps_preset?.length) return s.steps_preset;
  const wu = (s.override_wu || defaults[s.discipline]?.wu) as string | undefined;
  const cd = (s.override_cd || defaults[s.discipline]?.cd) as string | undefined;
  const main = parseMain(s.discipline, s.main);
  const extra = parseMain(s.discipline, s.extra);
  if (s.discipline === "strength") return [...main, ...extra];
  return [wu, ...main, ...extra, cd].filter(Boolean) as string[];
}

export const DEFAULTS_FALLBACK: Defaults = {
  swim: { wu: "swim_warmup_200yd_easy", cd: "swim_cooldown_200yd_easy" },
  run: { wu: "warmup_run_quality_12min", cd: "cooldown_easy_10min" },
  bike: { wu: "warmup_bike_quality_15min_fastpedal", cd: "cooldown_bike_easy_10min" },
};



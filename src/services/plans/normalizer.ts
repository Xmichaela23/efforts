// Deterministic planned-session normalizer
// Input: plan session (with optional steps_preset), user baselines, export_hints
// Output: friendly summary, concrete targets with ranges, total duration (minutes)

export interface Baselines {
  performanceNumbers?: {
    fiveK_pace?: string;
    fiveKPace?: string;
    fiveK?: string;
    easyPace?: string;
    tenK_pace?: string;
    tenKPace?: string;
    ftp?: number;
  };
}

export interface ExportHints {
  pace_tolerance_quality?: number; // default 0.04
  pace_tolerance_easy?: number; // default 0.06
  power_tolerance_SS_thr?: number; // default 0.05
  power_tolerance_VO2?: number; // default 0.10
}

export interface NormalizedResult {
  friendlySummary: string;
  durationMinutes: number;
  primaryTarget?: { type: 'pace' | 'power'; value: string | number; range?: [string | number, string | number] };
}

const sec = (mm: number, ss: number) => mm * 60 + ss;
const mmss = (s: number) => {
  const n = Math.max(0, Math.round(s));
  const m = Math.floor(n / 60);
  const r = n % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
};

const parsePace = (p: string) => {
  // Accept mm:ss, mm:ss/mi, mm:ss/km, mm:ss per mi
  let m = p.match(/(\d+):(\d{2})\s*(?:\/\s*(mi|km)|per\s*(mi|km))?/i);
  if (!m) return null;
  const unit = (m[3] || m[4] || 'mi').toLowerCase();
  return { seconds: sec(parseInt(m[1], 10), parseInt(m[2], 10)), unit: unit as 'mi' | 'km' };
};

// Reasonable fallback when swimmer baseline is unknown
const DEFAULT_SWIM_PER100_SEC = 120; // 2:00 per 100 (yd or m)

function resolvePaceToken(token: string, baselines: Baselines): string | null {
  const pn: any = baselines?.performanceNumbers || {};
  const fiveK_pace: string | undefined = pn.fiveK_pace || pn.fiveKPace;
  const easy: string | undefined = pn.easyPace || pn.easy_pace;
  const tenK: string | undefined = pn.tenK_pace || pn.tenKPace;
  if (token.includes('5kpace') && fiveK_pace) return fiveK_pace;
  if (token.includes('easypace') && easy) return easy;
  if (token.includes('10kpace') && tenK) return tenK;
  return null;
}

function applyOffset(base: string, offsetToken?: string): string {
  if (!offsetToken) return base;
  const b = parsePace(base);
  const om = offsetToken.match(/plus(\d+)(?::(\d{2}))?/i);
  if (!b || !om) return base;
  const add = om[2] ? sec(parseInt(om[1], 10), parseInt(om[2], 10)) : parseInt(om[1], 10) * 60;
  return `${mmss(b.seconds + add)}/${b.unit}`;
}

function paceRange(value: string, tol: number): [string, string] {
  const p = parsePace(value)!;
  return [`${mmss(p.seconds * (1 - tol))}/${p.unit}`, `${mmss(p.seconds * (1 + tol))}/${p.unit}`];
}

function powerRange(center: number, tol: number): [number, number] {
  const lo = Math.round(center * (1 - tol));
  const hi = Math.round(center * (1 + tol));
  return [lo, hi];
}

export function normalizePlannedSession(session: any, baselines: Baselines, hints: ExportHints = {}): NormalizedResult {
  const steps = Array.isArray(session?.steps_preset) ? (session.steps_preset as string[]) : [];
  const hQ = hints.pace_tolerance_quality ?? 0.04;
  const hE = hints.pace_tolerance_easy ?? 0.06;
  const hSS = hints.power_tolerance_SS_thr ?? 0.05;
  const hVO2 = hints.power_tolerance_VO2 ?? 0.10;

  let summaryParts: string[] = [];
  let primary: NormalizedResult['primaryTarget'];
  let totalMin = 0;

  const addRangeMin = (minOrRange?: string) => {
    if (!minOrRange) return 0;
    const m = minOrRange.match(/(\d{1,3})(?:\s*(?:–|-|to)\s*(\d{1,3}))?\s*min/);
    if (!m) return 0;
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    return Math.round((a + b) / 2);
  };

  // Helpers to align pace units to distance units for time computations
  const paceSecondsPerMile = (parsed: { seconds: number; unit: 'mi' | 'km' }): number => {
    // Convert seconds per km to seconds per mi when needed
    return parsed.unit === 'km' ? Math.round(parsed.seconds * 1.60934) : parsed.seconds;
  };
  const paceSecondsPerMeter = (parsed: { seconds: number; unit: 'mi' | 'km' }): number => {
    // Convert to seconds per meter for distance in meters
    return parsed.unit === 'km' ? (parsed.seconds / 1000) : (parsed.seconds / 1609.34);
  };

  // Warmup / Cooldown (include easy pace where available for RUN only)
  steps.forEach((t) => {
    const lower = t.toLowerCase();
    if (lower.startsWith('warmup')) {
      const minutes = addRangeMin(lower);
      totalMin += minutes;
      if (String(session?.discipline || '').toLowerCase() === 'run') {
        const easy = resolvePaceToken('easypace', baselines);
        if (easy) {
          const rng = paceRange(easy, hE);
          const p = parsePace(easy)!;
          summaryParts.push(`Warm‑up ${lower.match(/(\d{1,3}(?:\s*(?:–|-|to)\s*\d{1,3})?\s*min)/)?.[1] || ''} @ ${mmss(p.seconds)}/${p.unit} (${rng[0]}–${rng[1]})`.trim());
          return;
        }
      }
      summaryParts.push(`Warm‑up ${lower.match(/(\d{1,3}(?:\s*(?:–|-|to)\s*\d{1,3})?\s*min)/)?.[1] || ''}`.trim());
    }
  });

  // Intervals / Tempo / Bike sets
  const tokenStr = steps.join(' ').toLowerCase();
  // Easy run blocks: run_easy_<minutes>min
  const easyRun = tokenStr.match(/run_easy_(\d{1,3})min/i);
  if (easyRun) {
    const mins = parseInt(easyRun[1], 10);
    totalMin += mins;
    const easy = resolvePaceToken('easypace', baselines);
    if (easy) {
      const rng = paceRange(easy, hE);
      const p = parsePace(easy)!;
      summaryParts.push(`Easy ${mins} min @ ${mmss(p.seconds)}/${p.unit} (${rng[0]}–${rng[1]})`);
      primary = primary ?? { type: 'pace', value: easy, range: rng };
    } else {
      summaryParts.push(`Easy ${mins} min`);
    }
  }
  // Intervals like interval_6x800m_5kpace_R2min
  // Important: pace tag must stop at the next underscore so it doesn't swallow _r2min
  const im = tokenStr.match(/interval_(\d+)x(\d+(?:\.\d+)?)(m|mi)_([^_]+?)(?:_(plus\d+(?::\d{2})?))?(?:_r(\d+)(?:-(\d+))?(?:min)?)?/i);
  if (im) {
    const reps = parseInt(im[1], 10);
    const per = parseFloat(im[2]);
    const unit = im[3].toLowerCase();
    const paceTag = im[4];
    const plus = im[5];
    const restA = im[6] ? parseInt(im[6], 10) : 0;
    const restB = im[7] ? parseInt(im[7], 10) : restA;
    let restEach = restA ? Math.round((restA + restB) / 2) : 0;
    if (!restEach) {
      // Fallback: detect rest minutes from the raw token when regex misses
      const restAlt = tokenStr.match(/interval_[^\s]*?_r(\d+)(?:-(\d+))?min/i);
      if (restAlt) {
        const a = parseInt(restAlt[1], 10);
        const b = restAlt[2] ? parseInt(restAlt[2], 10) : a;
        restEach = Math.round((a + b) / 2);
      }
    }

    let pace = resolvePaceToken(paceTag, baselines) || '';
    pace = applyOffset(pace, plus || undefined);
    const distMiles = unit === 'mi' ? per : per / 1609.34;
    let workMin = 0;
    let mainText = `${reps} × ${unit === 'mi' ? per : Math.round(per)} ${unit}`;

    // Fallback: parse explicit pace from description when baseline token is missing
    const descPace = ((): { sec: number; unit: 'mi'|'km' } | null => {
      const d = String(session?.description || '').toLowerCase();
      const m = d.match(/@(\s*)?(\d+):(\d{2})\s*\/\s*(mi|km)/i);
      if (!m) return null;
      return { sec: parseInt(m[2],10)*60 + parseInt(m[3],10), unit: m[4].toLowerCase() as any };
    })();

    if (pace) {
      const parsed = parsePace(pace);
      if (parsed) {
        const rng = paceRange(pace, hQ);
        const perMi = paceSecondsPerMile(parsed);
        workMin = (reps * distMiles * perMi) / 60;
        mainText += ` @ ${mmss(parsed.seconds)}/${parsed.unit} (${rng[0]}–${rng[1]})`;
        primary = { type: 'pace', value: pace, range: rng };
      }
    } else if (descPace) {
      const rng = [ `${mmss(descPace.sec*(1-hQ))}/${descPace.unit}`, `${mmss(descPace.sec*(1+hQ))}/${descPace.unit}` ] as [string,string];
      const perMi = descPace.unit === 'km' ? Math.round(descPace.sec * 1.60934) : descPace.sec;
      workMin = (reps * distMiles * perMi) / 60;
      mainText += ` @ ${mmss(descPace.sec)}/${descPace.unit} (${rng[0]}–${rng[1]})`;
      primary = { type: 'pace', value: `${mmss(descPace.sec)}/${descPace.unit}`, range: rng };
    }

    const restMin = restEach * Math.max(0, reps - 1);
    totalMin += Math.round(workMin + restMin);
    if (restEach) {
      const easy = resolvePaceToken('easypace', baselines);
      if (easy) {
        const p = parsePace(easy)!;
        const rng = paceRange(easy, hE);
        summaryParts.push(`${mainText} w ${restEach} min jog @ ${mmss(p.seconds)}/${p.unit} (${rng[0]}–${rng[1]})`);
      } else {
        summaryParts.push(`${mainText} w ${restEach} min jog`);
      }
    } else {
      summaryParts.push(mainText);
    }
  }

  // Cruise intervals like cruise_4x1_5mi_5kpace_plus10s_R3min
  const cr = tokenStr.match(/cruise_(\d+)x(\d+(?:_\d+|\.\d+)?)mi_(\w+?)(?:_(plus\d+(?::\d{2})?))?(?:_r(\d+)min)?/i);
  if (cr) {
    const reps = parseInt(cr[1], 10);
    const distToken = cr[2].replace('_', '.');
    const dist = parseFloat(distToken);
    const tag = cr[3];
    const plus = cr[4];
    const rmin = cr[5] ? parseInt(cr[5], 10) : 0;
    let pace = resolvePaceToken(tag, baselines) || '';
    pace = applyOffset(pace, plus || undefined);
    let mainText = `${reps} × ${dist} mi`;
    if (pace) {
      const parsed = parsePace(pace);
      if (parsed) {
        const rng = paceRange(pace, hQ);
        const perMi = paceSecondsPerMile(parsed);
        totalMin += Math.round(reps * (dist * perMi) / 60) + rmin * Math.max(0, reps - 1);
        mainText += ` @ ${pace} (${rng[0]}–${rng[1]})`;
        primary = { type: 'pace', value: pace, range: rng };
      }
    } else {
      // Fallback: parse explicit pace from description
      const d = String(session?.description || '').toLowerCase();
      const m = d.match(/@(\s*)?(\d+):(\d{2})\s*\/\s*(mi|km)/i);
      if (m) {
        const secv = parseInt(m[2],10)*60 + parseInt(m[3],10);
        const unit = m[4].toLowerCase();
        const rng = [ `${mmss(secv*(1-hQ))}/${unit}`, `${mmss(secv*(1+hQ))}/${unit}` ] as [string,string];
        const perMi = unit === 'km' ? Math.round(secv * 1.60934) : secv;
        totalMin += Math.round(reps * (dist * perMi) / 60) + rmin * Math.max(0, reps - 1);
        mainText += ` @ ${mmss(secv)}/${unit} (${rng[0]}–${rng[1]})`;
        primary = { type: 'pace', value: `${mmss(secv)}/${unit}`, range: rng };
      } else {
        totalMin += rmin * Math.max(0, reps - 1);
      }
    }
    if (rmin) {
      const easy = resolvePaceToken('easypace', baselines);
      if (easy) {
        const p = parsePace(easy)!;
        const rng = paceRange(easy, hE);
        summaryParts.push(`${mainText} with ${mmss(rmin * 60)} jog @ ${mmss(p.seconds)}/${p.unit} (${rng[0]}–${rng[1]})`);
      } else {
        summaryParts.push(`${mainText} with ${mmss(rmin * 60)} jog rest`);
      }
    } else {
      summaryParts.push(mainText);
    }
  }

  // Tempo like tempo_4mi_5kpace_plus45s
  const tm = tokenStr.match(/tempo_(\d+(?:\.\d+)?)mi_(\w+?)(?:_(plus\d+(?::\d{2})?))?/i);
  if (tm) {
    const dist = parseFloat(tm[1]);
    const tag = tm[2];
    const plus = tm[3];
    let pace = resolvePaceToken(tag, baselines) || '';
    pace = applyOffset(pace, plus || undefined);
    let text = `Tempo ${dist} mi`;
    if (pace) {
      const parsed = parsePace(pace);
      if (parsed) {
        const rng = paceRange(pace, hQ);
        const perMi = paceSecondsPerMile(parsed);
        totalMin += Math.round((dist * perMi) / 60);
        text += ` @ ${mmss(parsed.seconds)}/${parsed.unit} (${rng[0]}–${rng[1]})`;
        primary = { type: 'pace', value: pace, range: rng };
      }
    } else {
      // Fallback: parse explicit pace from description
      const d = String(session?.description || '').toLowerCase();
      const m = d.match(/@(\s*)?(\d+):(\d{2})\s*\/\s*(mi|km)/i);
      if (m) {
        const secv = parseInt(m[2],10)*60 + parseInt(m[3],10);
        const unit = m[4].toLowerCase();
        const rng = [ `${mmss(secv*(1-hQ))}/${unit}`, `${mmss(secv*(1+hQ))}/${unit}` ] as [string,string];
        const perMi = unit === 'km' ? Math.round(secv * 1.60934) : secv;
        totalMin += Math.round((dist * perMi) / 60);
        text += ` @ ${mmss(secv)}/${unit} (${rng[0]}–${rng[1]})`;
        primary = { type: 'pace', value: `${mmss(secv)}/${unit}`, range: rng };
      }
    }
    summaryParts.push(text);
  }

  // Bike sets
  const bikeSet = tokenStr.match(/bike_(ss|thr|vo2)_(\d+)x(\d+)min(?:_r(\d+)min)?/i);
  if (bikeSet) {
    const kind = bikeSet[1];
    const reps = parseInt(bikeSet[2], 10);
    const tmin = parseInt(bikeSet[3], 10);
    const rmin = bikeSet[4] ? parseInt(bikeSet[4], 10) : 0;
    const ftp = baselines?.performanceNumbers?.ftp || 0;
    const center = kind === 'vo2' ? 1.1 * ftp : kind === 'thr' ? 0.98 * ftp : 0.91 * ftp;
    const tol = kind === 'vo2' ? hVO2 : hSS;
    const pr = powerRange(center, tol);
    totalMin += reps * tmin + rmin * Math.max(0, reps - 1);
    const centerW = Math.round(center);
    if (rmin && ftp) {
      const lo = Math.round(ftp * 0.60);
      const hi = Math.round(ftp * 0.65);
      summaryParts.push(`${reps} × ${tmin} min @ ${centerW} W (${pr[0]}–${pr[1]} W) with ${mmss(rmin * 60)} @ ${lo}–${hi} W`);
    } else {
      summaryParts.push(`${reps} × ${tmin} min @ ${centerW} W (${pr[0]}–${pr[1]} W)${rmin ? ` with ${mmss(rmin * 60)} easy` : ''}`);
    }
    primary = { type: 'power', value: centerW, range: pr };
  }

  // Remove generic bike fallback: only summarize specific known tokens

  // Endurance bike (single or multiple blocks)
  const bendAll = tokenStr.match(/bike_endurance_(\d+)min/gi);
  if (bendAll) {
    let sum = 0;
    bendAll.forEach((m) => {
      const mm = m.match(/(\d+)min/i);
      if (mm) sum += parseInt(mm[1], 10);
    });
    if (sum > 0) {
      totalMin += sum;
      summaryParts.push(`Endurance ${sum} min (Z2)`);
    }
  }

  // Bike tempo blocks (single block, minutes)
  const btempo = tokenStr.match(/bike_tempo_(\d+)min/gi);
  if (btempo) {
    let sum = 0;
    btempo.forEach((m) => {
      const mm = m.match(/(\d+)min/i);
      if (mm) sum += parseInt(mm[1], 10);
    });
    if (sum > 0) {
      totalMin += sum;
      summaryParts.push(`Tempo ${sum} min`);
    }
  }

  // Bike recovery blocks (single block, minutes)
  const brec = tokenStr.match(/bike_recovery_(\d+)min/gi);
  if (brec) {
    let sum = 0;
    brec.forEach((m) => {
      const mm = m.match(/(\d+)min/i);
      if (mm) sum += parseInt(mm[1], 10);
    });
    if (sum > 0) {
      totalMin += sum;
      summaryParts.push(`Recovery ${sum} min (Z1)`);
    }
  }

  // Helper to parse bike rest tokens: R3min or r180 → seconds
  const parseBikeRest = (rMin?: string, rSec?: string): number => {
    if (rMin) return parseInt(rMin, 10) * 60;
    if (rSec) return parseInt(rSec, 10);
    return 0;
  };

  // Bike neuromuscular power: bike_neuro_6x15s_R3min or _r180
  {
    const m = tokenStr.match(/bike_neuro_(\d+)x(\d+)s(?:_(?:R(\d+)min|r(\d+)))?/i);
    if (m) {
      const reps = parseInt(m[1], 10);
      const secsEach = parseInt(m[2], 10);
      const restSec = parseBikeRest(m[3], m[4]);
      const totalSecs = reps * secsEach + Math.max(0, reps - 1) * restSec;
      totalMin += Math.round(totalSecs / 60);
      summaryParts.push(`${reps} × ${secsEach}s neuromuscular${restSec ? ` with ${mmss(restSec)} easy` : ''}`);
    }
  }

  // Bike anaerobic capacity: bike_anaerobic_6x45s_R3min or _r180
  {
    const m = tokenStr.match(/bike_anaerobic_(\d+)x(\d+)s(?:_(?:R(\d+)min|r(\d+)))?/i);
    if (m) {
      const reps = parseInt(m[1], 10);
      const secsEach = parseInt(m[2], 10);
      const restSec = parseBikeRest(m[3], m[4]);
      const totalSecs = reps * secsEach + Math.max(0, reps - 1) * restSec;
      totalMin += Math.round(totalSecs / 60);
      summaryParts.push(`${reps} × ${secsEach}s anaerobic${restSec ? ` with ${mmss(restSec)} easy` : ''}`);
    }
  }

  // Long run blocks (e.g., longrun_150min_...)
  const lrun = tokenStr.match(/longrun_(\d+)min/i);
  if (lrun) {
    const mins = parseInt(lrun[1], 10);
    totalMin += mins;
    summaryParts.push(`Long run ${mins} min`);
  }

  // Swim technique blocks: swim_technique_1200yd or swim_technique_1500m
  const swimTech = tokenStr.match(/swim_technique_(\d+)(yd|m)\b/i);
  if (swimTech) {
    const dist = parseInt(swimTech[1], 10);
    const unit = swimTech[2].toLowerCase();
    // Parse per‑100 pace from baselines.performanceNumbers.swimPace100 (e.g., "1:40")
    const pn: any = (baselines as any)?.performanceNumbers || {};
    const sp100 = (pn.swimPace100 ?? pn.swim_pace_per_100_sec) as string | number | undefined;
    const parseMmss = (v: any): number | null => {
      if (typeof v === 'number') return v;
      if (typeof v !== 'string') return null;
      const m = v.match(/(\d+):(\d{2})/);
      if (!m) return null;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };
    let per100Sec = parseMmss(sp100);
    if (per100Sec == null) per100Sec = DEFAULT_SWIM_PER100_SEC;
    const segments = Math.max(1, Math.round(dist / 100));
    const minutes = Math.round((segments * per100Sec) / 60);
    totalMin += minutes;
    summaryParts.push(`Swim technique ${dist}${unit}`);
  }

  // General swim distance-based tokens (WU/CD, drills, pull, kick, aerobic)
  // Compute duration from user swimPace100 baseline; fallback to a reasonable default if missing.
  try {
    const pn: any = (baselines as any)?.performanceNumbers || {};
    const parseMmss = (v: any): number | null => {
      if (typeof v === 'number') return v;
      if (typeof v !== 'string') return null;
      const m = v.match(/(\d+):(\d{2})/);
      if (!m) return null;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };
    let per100Sec = parseMmss(pn.swimPace100);
    if (per100Sec == null) per100Sec = DEFAULT_SWIM_PER100_SEC;
    if (per100Sec != null) {
      let swimDistance = 0;
      let unitSeen: 'yd' | 'm' = 'yd';
      let wuDist = 0;
      let cdDist = 0;
      let restSeconds = 0; // accumulate rests between swim reps/sets
      const addDistance = (count: number, unit: string) => {
        unitSeen = (unit?.toLowerCase() === 'm') ? 'm' : unitSeen;
        swimDistance += count;
      };

      steps.forEach((t) => {
        const s = t.toLowerCase();
        // WU/CD distances like swim_warmup_200yd_easy, swim_cooldown_200yd
        let m = s.match(/swim_(?:warmup|cooldown)_(\d+)(yd|m)/i);
        if (m) {
          const dist = parseInt(m[1], 10);
          addDistance(dist, m[2]);
          if (/warmup/i.test(s)) wuDist += dist; else cdDist += dist;
          return;
        }
        // Drills with reps×dist (plural, name-last): swim_drills_4x50yd_catchup
        m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)_([a-z0-9]+)/i);
        if (m) {
          const reps = parseInt(m[1], 10);
          const distEach = parseInt(m[2], 10);
          const drillName = m[4];
          addDistance(reps * distEach, m[3]);
          // Default rest heuristics per drill
          let restEach = 15; // seconds between 50s
          if (/singlearm/.test(drillName)) restEach = 20;
          if (/scullfront/.test(drillName)) restEach = distEach >= 100 ? 15 : 15;
          restSeconds += Math.max(0, reps - 1) * restEach;
          return;
        }
        // Drills alias (singular, name-first): swim_drill_catchup_4x50yd_r15
        m = s.match(/swim_drill_([a-z0-9]+)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
        if (m) {
          const name = m[1];
          const reps = parseInt(m[2], 10);
          const distEach = parseInt(m[3], 10);
          const unit = m[4];
          const r = m[5] ? parseInt(m[5], 10) : undefined;
          addDistance(reps * distEach, unit);
          const restEach = typeof r === 'number' ? r : (/singlearm/.test(name) ? 20 : 15);
          restSeconds += Math.max(0, reps - 1) * restEach;
          return;
        }
        m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)/i);
        if (m) {
          addDistance(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]);
          // Generic drill: assume :15r between reps
          const reps = parseInt(m[1], 10);
          restSeconds += Math.max(0, reps - 1) * 15;
          return;
        }
        // Pull/Kick variants: swim_pull_2x100yd, swim_kick_2x100yd
        m = s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)/i);
        if (m) {
          const reps = parseInt(m[2], 10);
          const distEach = parseInt(m[3], 10);
          addDistance(reps * distEach, m[4]);
          // Rest defaults: pull 100s @ :20r, kick 100s @ :25r
          const restEach = m[1] === 'pull' ? 20 : 25;
          restSeconds += Math.max(0, reps - 1) * restEach;
          return;
        }
        // Single-distance pull/kick: swim_pull_300yd_steady
        m = s.match(/swim_(pull|kick)_(\d+)(yd|m)(?:_[a-z]+)?/i);
        if (m) {
          addDistance(parseInt(m[2], 10), m[3]);
          return;
        }
        // Aerobic sets: swim_aerobic_4x200yd_easy or swim_aerobic_4x200yd or with explicit rest swim_aerobic_4x200yd_easy_r20
        m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)(?:_[a-z]+)?(?:_r(\d+))?/i);
        if (m) {
          const reps = parseInt(m[1], 10);
          const distEach = parseInt(m[2], 10);
          const unit = m[3];
          const explicitRest = m[4] ? parseInt(m[4], 10) : undefined;
          addDistance(reps * distEach, unit);
          // Rest defaults based on distance if not explicitly authored
          let restEach = typeof explicitRest === 'number' ? explicitRest : 15;
          if (typeof explicitRest !== 'number') {
            if (distEach >= 400) restEach = 35; // :30–:40r → ~35s
            else if (distEach >= 200) restEach = 22; // :20–:25r → ~22s
            else restEach = 15; // 100s @ :15r
          }
          restSeconds += Math.max(0, reps - 1) * restEach;
          return;
        }
        // Threshold sets: swim_threshold_6x100yd_r10
        m = s.match(/swim_threshold_(\d+)x(\d+)(yd|m)_r(\d+)/i);
        if (m) {
          const reps = parseInt(m[1], 10);
          const distEach = parseInt(m[2], 10);
          const unit = m[3];
          const r = parseInt(m[4], 10);
          addDistance(reps * distEach, unit);
          restSeconds += Math.max(0, reps - 1) * r;
          return;
        }
        // Interval sets: swim_interval_12x50yd_r15
        m = s.match(/swim_interval_(\d+)x(\d+)(yd|m)_r(\d+)/i);
        if (m) {
          const reps = parseInt(m[1], 10);
          const distEach = parseInt(m[2], 10);
          const unit = m[3];
          const r = parseInt(m[4], 10);
          addDistance(reps * distEach, unit);
          restSeconds += Math.max(0, reps - 1) * r;
          return;
        }
      });

      if (swimDistance > 0) {
        const segments = Math.max(1, Math.round(swimDistance / 100));
        const minutes = Math.round((segments * per100Sec) / 60);
        totalMin += minutes;
      }
      if (restSeconds > 0) {
        totalMin += Math.round(restSeconds / 60);
      }
      // Build friendly swim summary with drills/pull/kick/aerobic details, including rest heuristics
      const drillDetails: string[] = [];
      const pulls: string[] = [];
      const kicks: string[] = [];
      const aerobics: string[] = [];
      steps.forEach((t) => {
        const s = String(t).toLowerCase();
        let m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)_([a-z0-9]+)/i);
        if (m) {
          const reps = parseInt(m[1],10); const dist = parseInt(m[2],10); const name = m[4];
          let r = 15; if (/singlearm/.test(name)) r = 20; if (/scullfront/.test(name)) r = 15;
          drillDetails.push(`${name} ${reps}x${dist} @ :${r}r`);
          return;
        }
        m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)/i);
        if (m) { const reps=parseInt(m[1],10), dist=parseInt(m[2],10); drillDetails.push(`${reps}x${dist} @ :15r`); return; }
        m = s.match(/swim_pull_(\d+)x(\d+)(yd|m)/i);
        if (m) { pulls.push(`${m[1]}x${m[2]} @ :20r`); return; }
        m = s.match(/swim_pull_(\d+)(yd|m)/i);
        if (m) { pulls.push(`${m[1]}`); return; }
        m = s.match(/swim_kick_(\d+)x(\d+)(yd|m)/i);
        if (m) { kicks.push(`${m[1]}x${m[2]} @ :25r`); return; }
        m = s.match(/swim_kick_(\d+)(yd|m)/i);
        if (m) { kicks.push(`${m[1]}`); return; }
        m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)/i);
        if (m) {
          const reps = parseInt(m[1],10); const dist = parseInt(m[2],10);
          let r = 15; if (dist >= 400) r = 35; else if (dist >= 200) r = 22;
          aerobics.push(`${reps}x${dist} @ :${r}r`);
          return; }
      });
      const swimParts: string[] = [];
      if (wuDist > 0) swimParts.push(`WU ${wuDist}`);
      if (drillDetails.length) swimParts.push(`Drills: ${Array.from(new Set(drillDetails)).join(', ')}`);
      if (pulls.length) swimParts.push(`Pull ${Array.from(new Set(pulls)).join(', ')}`);
      if (kicks.length) swimParts.push(`Kick ${Array.from(new Set(kicks)).join(', ')}`);
      if (aerobics.length) swimParts.push(`Aerobic ${Array.from(new Set(aerobics)).join(', ')}`);
      if (cdDist > 0) swimParts.push(`CD ${cdDist}`);
      if (swimParts.length) summaryParts.push(swimParts.join(' • '));
      if (swimDistance > 0) summaryParts.push(`Total ${swimDistance}${unitSeen}`);
    }
  } catch {}

  // Strength single-block time (e.g., strength_main_50min)
  const strengthMain = tokenStr.match(/strength_main_(\d+)min/i);
  if (strengthMain) {
    const mins = parseInt(strengthMain[1], 10);
    totalMin += mins;
    summaryParts.push(`Strength ${mins} min`);
  }

  // Strength token summaries from st_* authoring language (grouped lines)
  try {
    const pnAny: any = (baselines as any)?.performanceNumbers || {};
    const pickOneRm = (name: string): number | undefined => {
      const n = name.toLowerCase();
      if (n.includes('dead')) return pnAny?.deadlift;
      if (n.includes('bench')) return pnAny?.bench;
      if (n.includes('squat')) return pnAny?.squat;
      if (n.includes('ohp') || n.includes('overhead') || (n.includes('press') && !n.includes('bench'))) return pnAny?.overheadPress1RM || pnAny?.overhead || pnAny?.ohp;
      if (n.includes('row')) return typeof pnAny?.bench === 'number' ? Math.round(pnAny.bench * 0.90) : undefined;
      return pnAny?.squat;
    };
    const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
    const addLine = (s: string) => { if (s && !summaryParts.includes(s)) summaryParts.push(s); };

    steps.forEach((t) => {
      const s = String(t).toLowerCase();
      // Warmup/Cooldown tokens: st_wu_5, st_cool_5
      let m = s.match(/^st_(?:wu|cool)_(\d+)/i);
      if (m) { addLine(`${/wu/i.test(s) ? 'Warm‑up' : 'Cool‑down'} ${m[1]} min`); return; }

      // Main lifts: st_main_<name>_<sets>x<reps>_@pct<percent>_rest<sec>
      m = s.match(/^st_main_([a-z0-9_]+)_(\d+)x(\d+|amrap)(?:_@pct(\d+))?(?:_rest(\d+))?/i);
      if (m) {
        const rawName = m[1].replace(/_/g, ' ');
        const sets = parseInt(m[2], 10);
        const reps = m[3].toUpperCase() === 'AMRAP' ? 'AMRAP' : m[3];
        const pct = m[4] ? parseInt(m[4], 10) : undefined;
        const orm = pct ? pickOneRm(rawName) : undefined;
        const load = (typeof orm === 'number' && typeof pct === 'number') ? `${round5(orm * (pct/100))} lb` : undefined;
        addLine(`${rawName} ${sets}×${reps}${load ? ` @ ${load}` : (pct ? ` @ ${pct}%` : '')}`.trim());
        return;
      }

      // Accessories/Core: st_acc_* or st_core_* formats
      m = s.match(/^st_(?:acc|core)_([a-z0-9_]+)_(\d+)x(\d+|amrap)(?:_@pct(\d+))?(?:_rest(\d+))?/i);
      if (m) {
        const rawName = m[1].replace(/_/g, ' ');
        const sets = parseInt(m[2], 10);
        const reps = m[3].toUpperCase() === 'AMRAP' ? 'AMRAP' : m[3];
        const pct = m[4] ? parseInt(m[4], 10) : undefined;
        const orm = pct ? pickOneRm(rawName) : undefined;
        const load = (typeof orm === 'number' && typeof pct === 'number') ? `${round5(orm * (pct/100))} lb` : undefined;
        addLine(`${rawName} ${sets}×${reps}${load ? ` @ ${load}` : (pct ? ` @ ${pct}%` : '')}`.trim());
        return;
      }

      // Shorthand tokens (e.g., row_4x6_8)
      m = s.match(/^row_(\d+)x(\d+)(?:_(\d+))?/i);
      if (m) {
        addLine(`Row ${parseInt(m[1],10)}×${m[2]}`);
        return;
      }
    });
  } catch {}

  // Strength derived duration from tokens and description when no explicit minutes token
  if (String(session?.discipline || '').toLowerCase() === 'strength') {
    const desc: string = String(session?.description || '');
    const exercises = desc.split(/;+/).map(s => s.trim()).filter(Boolean);
    let derivedSeconds = 0;
    const isCompound = (line: string): boolean => /(squat|deadlift|bench|ohp|overhead\s*press|barbell\s*row|weighted\s*pull[- ]?up)/i.test(line);
    const parseRestSec = (line: string): number => {
      const m1 = line.match(/rest\s*(\d{1,3})\s*[-–]\s*(\d{1,3})\s*min/i);
      if (m1) return Math.round(((parseInt(m1[1],10)+parseInt(m1[2],10))/2) * 60);
      const m2 = line.match(/rest\s*(\d{1,3})\s*[-–]\s*(\d{1,3})\s*s/i);
      if (m2) return Math.round((parseInt(m2[1],10)+parseInt(m2[2],10))/2);
      const m3 = line.match(/rest\s*(\d{1,3})\s*min/i);
      if (m3) return parseInt(m3[1],10)*60;
      const m4 = line.match(/rest\s*(\d{1,3})\s*s/i);
      if (m4) return parseInt(m4[1],10);
      // default rests: compounds 120s, accessories 75s
      return isCompound(line) ? 120 : 75;
    };
    const parseSetsReps = (line: string): { sets: number; reps: number } | null => {
      const m = line.match(/(\d+)x(\d+)/i);
      if (m) return { sets: parseInt(m[1],10), reps: parseInt(m[2],10) };
      const s = line.match(/(\d+)x\s*amrap/i);
      if (s) return { sets: parseInt(s[1],10), reps: 8 }; // assume ~8 reps per AMRAP set
      return null;
    };
    // If we have structured strength_exercises, use that first
    try {
      const ses: any[] = Array.isArray((session as any)?.strength_exercises) ? (session as any).strength_exercises : [];
      if (ses.length) {
        ses.forEach((sx: any, idx: number) => {
          const sets = Number(sx?.sets)||0; const reps = Number(sx?.reps)||0;
          const tempoPerRep = /squat|dead|bench|press|row/i.test(String(sx?.name||'')) ? 4 : 3;
          const workSec = sets * reps * tempoPerRep;
          // rest between sets; compounds default 150s, accessory 90s when not provided
          const defaultRest = /squat|dead|bench|press|row/i.test(String(sx?.name||'')) ? 150 : 90;
          const restEach = Number(sx?.rest_seconds) || defaultRest;
          const restSec = Math.max(0, sets-1) * restEach;
          derivedSeconds += workSec + restSec;
        });
      }
    } catch {}

    exercises.forEach((ex) => {
      const sr = parseSetsReps(ex);
      if (!sr) return;
      const tempoPerRep = isCompound(ex) ? 4 : 3; // seconds per rep
      const workSec = sr.sets * sr.reps * tempoPerRep;
      const restSec = Math.max(0, sr.sets - 1) * parseRestSec(ex);
      derivedSeconds += workSec + restSec;
    });
    if (derivedSeconds > 0) {
      totalMin += Math.round(derivedSeconds / 60);
    }
  }

  // Strides (e.g., strides_6x20s)
  const strides = tokenStr.match(/strides_(\d+)x(\d+)s/i);
  if (strides) {
    const reps = parseInt(strides[1], 10);
    const secsEach = parseInt(strides[2], 10);
    totalMin += Math.round((reps * secsEach) / 60);
    summaryParts.push(`${reps} × ${secsEach}s strides`);
  }

  // Speed micro-sets (e.g., speed_8x20s_fast_R60s)
  const speed = tokenStr.match(/speed_(\d+)x(\d+)s(?:_.*)?_r(\d+)s/i);
  if (speed) {
    const reps = parseInt(speed[1], 10);
    const secsEach = parseInt(speed[2], 10);
    const rest = parseInt(speed[3], 10);
    const totalSecs = reps * secsEach + Math.max(0, reps - 1) * rest;
    totalMin += Math.round(totalSecs / 60);
    {
      const easy = resolvePaceToken('easypace', baselines);
      if (easy) {
        const p = parsePace(easy)!;
        const rng = paceRange(easy, hE);
        summaryParts.push(`${reps} × ${secsEach}s with ${rest}s easy @ ${mmss(p.seconds)}/${p.unit} (${rng[0]}–${rng[1]})`);
      } else {
        summaryParts.push(`${reps} × ${secsEach}s with ${rest}s easy`);
      }
    }
  }

  // Cooldown (include easy pace where available for RUN only)
  steps.forEach((t) => {
    const lower = t.toLowerCase();
    if (lower.startsWith('cooldown')) {
      const minutes = addRangeMin(lower);
      totalMin += minutes;
      if (String(session?.discipline || '').toLowerCase() === 'run') {
        const easy = resolvePaceToken('easypace', baselines);
        if (easy) {
          const rng = paceRange(easy, hE);
          const p = parsePace(easy)!;
          summaryParts.push(`Cool‑down ${lower.match(/(\d{1,3}(?:\s*(?:–|-|to)\s*\d{1,3})?\s*min)/)?.[1] || ''} @ ${mmss(p.seconds)}/${p.unit} (${rng[0]}–${rng[1]})`.trim());
          return;
        }
      }
      summaryParts.push(`Cool‑down ${lower.match(/(\d{1,3}(?:\s*(?:–|-|to)\s*\d{1,3})?\s*min)/)?.[1] || ''}`.trim());
    }
  });

  // If no tokens recognized, use description duration heuristic
  if (steps.length === 0 && session?.description) {
    const s = session.description.toLowerCase();
    const m = s.match(/(\d{1,3})\s*min\b/);
    if (m) totalMin += parseInt(m[1], 10);
  }

  // Catch-all: add any single-step explicit minutes not covered above, avoiding double count
  if (steps.length > 0) {
    steps.forEach((t) => {
      const lower = t.toLowerCase();
      if (/(^interval_|^tempo_|^cruise_|^bike_.*\dx\d+min|^bike_endurance_|^warmup|^cooldown|^longrun_|^strength_main_)/.test(lower)) return;
      const mins = lower.match(/(\d{1,3})\s*min/);
      if (mins) totalMin += parseInt(mins[1], 10);
    });
  }

  // Fallback: parse human description for intervals/tempo and WU/CD when tokens don't match
  try {
    const desc: string = String(session?.description || '').toLowerCase();
    // Always attempt to enrich when tokens failed to produce a pace-based main
    if (desc) {
      // Intervals fallback (compute work and rests; WU/CD may already be counted)
      const iv = desc.match(/(\d+)\s*x\s*(\d{3,4})\s*m[^@]*@\s*(\d+):(\d{2})\s*\/\s*(mi|km)(?:[^\d]+(\d+)\s*min\s*(?:jog|easy))?/);
      if (iv && primary == null) {
        const reps = parseInt(iv[1],10);
        const meters = parseInt(iv[2],10);
        const baseSec = parseInt(iv[3],10)*60 + parseInt(iv[4],10);
        const unit = iv[5].toLowerCase();
        const restEach = iv[6] ? parseInt(iv[6],10) : 0;
        const milesEach = meters / 1609.34;
        const rng = [`${mmss(baseSec*(1-hQ))}/${unit}`, `${mmss(baseSec*(1+hQ))}/${unit}`] as [string,string];
        const workMin = (reps * milesEach * baseSec) / 60;
        const restMin = restEach * Math.max(0, reps - 1);
        totalMin += Math.round(workMin + restMin);
        if (restEach) {
          const easy = resolvePaceToken('easypace', baselines);
          if (easy) {
            const p = parsePace(easy)!;
            const erng = paceRange(easy, hE);
            summaryParts.push(`${reps} × ${meters} m @ ${mmss(baseSec)}/${unit} (${rng[0]}–${rng[1]}) w ${restEach} min jog @ ${mmss(p.seconds)}/${p.unit} (${erng[0]}–${erng[1]})`);
          } else {
            summaryParts.push(`${reps} × ${meters} m @ ${mmss(baseSec)}/${unit} (${rng[0]}–${rng[1]}) w ${restEach} min jog`);
          }
        } else {
          summaryParts.push(`${reps} × ${meters} m @ ${mmss(baseSec)}/${unit} (${rng[0]}–${rng[1]})`);
        }
        primary = { type: 'pace', value: `${mmss(baseSec)}/${unit}`, range: rng };
      }
      // Tempo fallback
      const tp = desc.match(/tempo[^\d]*(\d+(?:\.\d+)?)\s*mi[^@]*@\s*(\d+):(\d{2})\s*\/\s*(mi|km)/);
      if (tp && primary == null) {
        const miles = parseFloat(tp[1]);
        const baseSec = parseInt(tp[2],10)*60 + parseInt(tp[3],10);
        const unit = tp[4].toLowerCase();
        const rng = [`${mmss(baseSec*(1-hQ))}/${unit}`, `${mmss(baseSec*(1+hQ))}/${unit}`] as [string,string];
        totalMin += Math.round((miles * baseSec) / 60);
        summaryParts.push(`Tempo ${miles} mi @ ${mmss(baseSec)}/${unit} (${rng[0]}–${rng[1]})`);
        primary = { type: 'pace', value: `${mmss(baseSec)}/${unit}`, range: rng };
      }
      // When no tokens at all, add WU/CD minutes from description
      if (steps.length === 0) {
        const wu = desc.match(/warm\s*-?\s*up\s*(\d{1,3})\s*min/);
        if (wu) totalMin += parseInt(wu[1],10);
        const cd = desc.match(/cool\s*-?\s*down\s*(\d{1,3})\s*min/);
        if (cd) totalMin += parseInt(cd[1],10);
      }
    }
  } catch {}

  const isOptional = (Array.isArray((session || {}).tags) && (session.tags as any[]).some(t => String(t).toLowerCase() === 'optional')) || /\[optional\]/i.test(String(session?.description || ''));
  const finalSummary = summaryParts.filter(Boolean).join(' • ');

  return {
    friendlySummary: isOptional && finalSummary ? `Optional — ${finalSummary}` : finalSummary,
    durationMinutes: totalMin,
    primaryTarget: primary,
  };
}


// Structured normalizer for `workout_structure`
export function normalizeStructuredSession(session: any, baselines: Baselines): { friendlySummary: string; durationMinutes: number; stepLines?: string[] } {
  const ws = (session && (session.workout_structure || session.workout)) || null;
  if (!ws || typeof ws !== 'object') return { friendlySummary: '', durationMinutes: 0 };

  const pn: any = (baselines as any)?.performanceNumbers || {};
  const toSec = (v?: string): number => {
    if (!v || typeof v !== 'string') return 0;
    const m1 = v.match(/(\d+)\s*min/i); if (m1) return parseInt(m1[1],10)*60;
    const m2 = v.match(/(\d+)\s*s/i); if (m2) return parseInt(m2[1],10);
    return 0;
  };
  const mm = (n: number) => Math.max(0, Math.round(n/60));
  const ydToYd = (v: string): number => { const n = parseInt(v.replace(/\D/g,'')||'0',10); return n; };
  const mToYd = (v: string): number => { const n = parseInt(v.replace(/\D/g,'')||'0',10); return Math.round(n/0.9144); };
  const resolvePace = (ref: any): string | null => {
    if (!ref) return null;
    if (typeof ref === 'string') {
      if (/user\./i.test(ref)) {
        const key = ref.replace(/^user\./i,'');
        return pn[key] || null;
      }
      return ref;
    }
    if (ref && typeof ref === 'object' && typeof ref.baseline === 'string') {
      const key = String(ref.baseline).replace(/^user\./i,'');
      return pn[key] || null;
    }
    return null;
  };

  const lines: string[] = [];
  let totalSec = 0;
  const push = (s?: string) => { if (s && s.trim()) lines.push(s.trim()); };

  const type = String(ws.type || '').toLowerCase();
  const struct: any[] = Array.isArray(ws.structure) ? ws.structure : [];
  const parentDisc = String((session?.discipline || session?.type) || '').toLowerCase();
  const isRun = parentDisc === 'run';
  const ftpNum: number | undefined = typeof (pn?.ftp) === 'number' ? pn.ftp : undefined;
  // Pace range helpers (default tolerances)
  const parsePaceTxt = (p?: string): { sec: number; unit: 'mi'|'km' } | null => {
    if (!p) return null; const m = String(p).match(/(\d+):(\d{2})\s*\/\s*(mi|km)/i); if (!m) return null; return { sec: parseInt(m[1],10)*60+parseInt(m[2],10), unit: m[3].toLowerCase() as any };
  };
  const mmssTxt = (s: number) => { const x=Math.max(1,Math.round(s)); const m=Math.floor(x/60); const ss=x%60; return `${m}:${String(ss).padStart(2,'0')}`; };
  const withPaceRange = (p?: string|null, tol: number = 0.04): string => {
    const parsed = parsePaceTxt(p || undefined); if (!parsed) return p ? ` @ ${p}` : '';
    const lo = Math.round(parsed.sec*(1-tol)); const hi = Math.round(parsed.sec*(1+tol));
    return ` @ ${mmssTxt(parsed.sec)}/${parsed.unit} (${mmssTxt(lo)}/${parsed.unit}–${mmssTxt(hi)}/${parsed.unit})`;
  };
  const wattsForPctRange = (pctRange?: string): string | undefined => {
    try {
      if (!pctRange) return undefined;
      const m = String(pctRange).match(/(\d{1,3})\s*[-–]\s*(\d{1,3})%/);
      if (!m) return pctRange;
      if (typeof ftpNum !== 'number' || !isFinite(ftpNum) || ftpNum <= 0) return `${m[1]}–${m[2]}%`;
      const lo = Math.round((parseInt(m[1],10)/100) * ftpNum);
      const hi = Math.round((parseInt(m[2],10)/100) * ftpNum);
      return `${lo}–${hi} W`;
    } catch { return pctRange; }
  };

  // Brick session: iterate segments (bike_segment, run_segment, swim_segment, strength_segment, transition)
  if (type === 'brick_session') {
    let transitionCount = 0;
    const tolFromPct = (pctRange: string | undefined, ftp?: number): string | undefined => {
      try {
        if (!pctRange) return undefined;
        const m = String(pctRange).match(/(\d{1,3})\s*[-–]\s*(\d{1,3})\s*%/);
        if (!m) return `@ ${pctRange}`;
        if (typeof ftp !== 'number' || !isFinite(ftp) || ftp <= 0) return `@ ${m[1]}–${m[2]}%`;
        const lo = Math.round((parseInt(m[1],10)/100) * ftp);
        const hi = Math.round((parseInt(m[2],10)/100) * ftp);
        return `@ ${lo}–${hi} W`;
      } catch { return pctRange ? `@ ${pctRange}` : undefined; }
    };
    const ftp: number | undefined = typeof (pn?.ftp) === 'number' ? pn.ftp : undefined;
    for (const seg of struct) {
      const segType = String(seg?.type || '').toLowerCase();
      if (segType === 'transition') {
        const s = toSec(String(seg?.duration||'')); totalSec += s; transitionCount += 1;
        push(`T${transitionCount} ${mm(s)} min`);
        continue;
      }
      if (segType === 'bike_segment') {
        const s = toSec(String(seg?.duration||'')); totalSec += s;
        const powTxt = seg?.target_power?.range ? tolFromPct(String(seg.target_power.range), ftp) : undefined;
        push(`Bike ${mm(s)} min${powTxt?` ${powTxt}`:''}`);
        continue;
      }
      if (segType === 'run_segment') {
        const s = toSec(String(seg?.duration||'')); totalSec += s;
        const p = resolvePace(seg?.target_pace);
        push(`Run ${mm(s)} min${isRun?withPaceRange(p, 0.06):(p?` @ ${p}`:'')}`);
        continue;
      }
      if (segType === 'swim_segment') {
        const s = toSec(String(seg?.duration||'')); totalSec += s; push(`Swim ${mm(s)} min`); continue;
      }
      if (segType === 'strength_segment') {
        const s = toSec(String(seg?.duration||'')); totalSec += s; push(`Strength ${mm(s)} min`); continue;
      }
    }
    // Do not inflate totals from ws.total_duration_estimate; rely on structured segments only
    const friendly = lines.join(' • ');
    return { friendlySummary: friendly, durationMinutes: mm(totalSec), stepLines: lines };
  }

  for (const seg of struct) {
    const kind = String(seg?.type || '').toLowerCase();
    if (kind === 'warmup' || kind === 'cooldown') {
      // For swims, emit distance-based WU/CD (e.g., "WU 200 yd", "CD 200 yd")
      if (type === 'swim_session' && typeof seg?.distance === 'string' && seg.distance) {
        const distTxt = String(seg.distance);
        const yd = /yd/i.test(distTxt) ? ydToYd(distTxt) : mToYd(distTxt);
        push(`${kind === 'warmup' ? 'WU' : 'CD'} ${yd} yd`);
      } else {
        const sec = toSec(seg.duration);
        totalSec += sec;
        const easy = isRun ? (resolvePace('user.easyPace') || resolvePace({ baseline: 'user.easyPace' })) : null;
        if (parentDisc === 'ride' && typeof ftpNum === 'number' && isFinite(ftpNum)) {
          const lo = Math.round(ftpNum*0.60); const hi = Math.round(ftpNum*0.65);
          push(`${kind === 'warmup' ? 'Warm‑up' : 'Cool‑down'} ${mm(sec)} min @ ${lo}–${hi} W`);
        } else {
          push(`${kind === 'warmup' ? 'Warm‑up' : 'Cool‑down'} ${mm(sec)} min${isRun?withPaceRange(easy, 0.06):(easy?` @ ${easy}`:'')}`);
        }
      }
      continue;
    }
    if (type === 'strength_session') {
      const name = String(seg?.exercise || '').replace(/_/g,' ');
      if (!name) continue;
      const sets = Number(seg?.sets) || 0;
      const repsTxt = (typeof seg?.reps === 'string' ? seg.reps.toUpperCase() : String(seg?.reps || '')) || '';
      const pct = (seg?.load && seg.load.type === 'percentage') ? Number(seg.load.percentage) : undefined;
      const baselineKey = (seg?.load && typeof seg.load.baseline === 'string') ? seg.load.baseline.replace(/^user\./i,'') : '';
      const orm = (baselineKey && typeof pn[baselineKey] === 'number') ? pn[baselineKey] as number : undefined;
      const est = (typeof orm === 'number' && typeof pct === 'number') ? Math.max(5, Math.round((orm*(pct/100))/5)*5) : undefined;
      const restS = toSec(String(seg?.rest||''));
      totalSec += Math.max(0, sets-1)*restS; // add rests; work time estimation omitted for simplicity
      push(`${name} ${Math.max(1,sets)}×${repsTxt || '?'}${(typeof est==='number')?` @ ${est} lb`:(typeof pct==='number'?` @ ${pct}%`: '')}`.trim());
      continue;
    }
    if (type === 'swim_session') {
      if (kind === 'drill_set') {
        const reps = Number(seg?.repetitions)||0; const dist = String(seg?.distance||'');
        const yd = /yd/i.test(dist) ? ydToYd(dist) : mToYd(dist);
        const restS = toSec(String(seg?.rest||''));
        totalSec += Math.max(0, reps-1)*restS;
        push(`Drill ${String(seg?.drill_type||'').replace(/_/g,' ')} ${reps}×${yd} yd${restS>0?` @ :${restS}r`:''}`);
        continue;
      }
      if (kind === 'main_set' && String(seg?.set_type||'').toLowerCase().includes('aerobic')) {
        const reps = Number(seg?.repetitions)||0; const dist = String(seg?.distance||'');
        const yd = /yd/i.test(dist) ? ydToYd(dist) : mToYd(dist);
        const restS = toSec(String(seg?.rest||''));
        totalSec += Math.max(0, reps-1)*restS;
        push(`${reps}×${yd} yd aerobic${restS>0?` @ :${restS}r`:''}`);
        continue;
      }
      if (kind === 'cooldown' || kind === 'warmup') continue; // handled above
    }
    if (type === 'interval_session' || (kind === 'main_set' && seg?.set_type === 'intervals')) {
      const reps = Number(seg?.repetitions)||0;
      const work = seg?.work_segment||{};
      const rec = seg?.recovery_segment||{};
      const distTxt = String(work?.distance||'');
      const pace = resolvePace(work?.target_pace) || resolvePace(work?.pace) || null;
      const restS = toSec(String(rec?.duration||''));
      // accumulate rests
      totalSec += Math.max(0, reps-1)*restS;
      // accumulate work time when possible from pace + distance
      if (/mi\b/i.test(distTxt) && pace) {
        const miles = parseFloat(distTxt);
        const pm = pace.match(/(\d+):(\d{2})\s*\/\s*(mi|km)/i);
        if (pm) {
          const per = parseInt(pm[1],10)*60 + parseInt(pm[2],10);
          const unit = (pm[3]||'mi').toLowerCase();
          const perMi = unit === 'km' ? Math.round(per*1.60934) : per;
          totalSec += Math.max(0, Math.round(reps * miles * perMi));
        }
      } else if (/m\b/i.test(distTxt) && pace) {
        const meters = parseFloat(distTxt.replace(/[^\d.]/g,''));
        const pm = pace.match(/(\d+):(\d{2})\s*\/\s*(mi|km)/i);
        if (pm) {
          const per = parseInt(pm[1],10)*60 + parseInt(pm[2],10);
          const unit = (pm[3]||'mi').toLowerCase();
          const perMeter = unit === 'km' ? (per/1000) : (per/1609.34);
          totalSec += Math.max(0, Math.round(reps * meters * perMeter));
        }
      }
      // build text
      const jogPace = isRun ? (resolvePace('user.easyPace') || resolvePace({ baseline: 'user.easyPace' })) : null;
      if (/mi\b/i.test(distTxt)) push(`${reps} × ${parseFloat(distTxt)} mi${isRun?withPaceRange(pace, 0.04):(pace?` @ ${pace}`:'')}${restS?` with ${mm(restS)} min jog${isRun?withPaceRange(jogPace, 0.06):(jogPace?` @ ${jogPace}`:'')}`:''}`);
      else if (/m\b/i.test(distTxt)) push(`${reps} × ${distTxt}${isRun?withPaceRange(pace, 0.04):(pace?` @ ${pace}`:'')}${restS?` with ${mm(restS)} min jog${isRun?withPaceRange(jogPace, 0.06):(jogPace?` @ ${jogPace}`:'')}`:''}`);
      else if (/s|min/i.test(String(work?.duration||''))) {
        const ws = toSec(String(work?.duration));
        totalSec += reps*ws;
        push(`${reps} × ${mm(ws)} min${isRun?withPaceRange(pace, 0.04):(pace?` @ ${pace}`:'')}${restS?` with ${mm(restS)} min jog${isRun?withPaceRange(jogPace, 0.06):(jogPace?` @ ${jogPace}`:'')}`:''}`);
      }
      continue;
    }
    if (type === 'tempo_session' && kind === 'main_set') {
      const durS = toSec(String(seg?.work_segment?.duration||''));
      totalSec += durS;
      const p = seg?.work_segment?.target_pace;
      let pTxt = '';
      if (p && typeof p === 'object' && p.baseline) {
        const base = resolvePace({ baseline: p.baseline });
        const mod = String(p.modifier||'');
        pTxt = base ? `${base}${mod?` ${mod}`:''}` : '';
      } else {
        const base = resolvePace(p); if (base) pTxt = base;
      }
      push(`Tempo ${mm(durS)} min${isRun?withPaceRange(pTxt, 0.04):(pTxt?` @ ${pTxt}`:'')}`);
      continue;
    }
    if (type === 'bike_intervals' && kind === 'main_set') {
      const reps = Number(seg?.repetitions)||0;
      const work = seg?.work_segment||{};
      const rec = seg?.recovery_segment||{};
      const ws = toSec(String(work?.duration||''));
      const rs = toSec(String(rec?.duration||''));
      totalSec += reps*ws + Math.max(0, reps-1)*rs;
      const pct = work?.target_power?.range || '';
      const workTxt = wattsForPctRange(String(pct)) || String(pct || '');
      if (rs>0 && typeof ftpNum === 'number' && isFinite(ftpNum)) {
        const lo = Math.round(ftpNum*0.60); const hi = Math.round(ftpNum*0.65);
        push(`${reps} × ${mm(ws)} min${workTxt?` @ ${workTxt}`:''} with ${mm(rs)} min @ ${lo}–${hi} W`);
      } else {
        push(`${reps} × ${mm(ws)} min${workTxt?` @ ${workTxt}`:''}${rs?` with ${mm(rs)} min easy`:''}`);
      }
      continue;
    }
    if (type === 'endurance_session' && (kind === 'main_effort' || kind==='main')) {
      const s = toSec(String(seg?.duration||'')); totalSec += s; push(`Endurance ${mm(s)} min`); continue;
    }
  }

  // Do not inflate totals from ws.total_duration_estimate; rely on structured segments only
  const friendly = lines.join(' • ');
  return { friendlySummary: friendly, durationMinutes: mm(totalSec), stepLines: lines };
}


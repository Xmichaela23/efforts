// Deterministic planned-session normalizer
// Input: plan session (with optional steps_preset), user baselines, export_hints
// Output: friendly summary, concrete targets with ranges, total duration (minutes)

export interface Baselines {
  performanceNumbers?: {
    fiveK_pace?: string;
    fiveKPace?: string;
    fiveK?: string;
    easyPace?: string;
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

function resolvePaceToken(token: string, baselines: Baselines): string | null {
  const pn = baselines?.performanceNumbers || {};
  const fiveK: string | undefined = (pn.fiveK_pace || pn.fiveKPace || pn.fiveK) as any;
  const easy: string | undefined = pn.easyPace as any;
  if (token.includes('5kpace') && fiveK) return fiveK;
  if (token.includes('easypace') && easy) return easy;
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

  // Warmup / Cooldown
  steps.forEach((t) => {
    const lower = t.toLowerCase();
    if (lower.startsWith('warmup')) {
      const minutes = addRangeMin(lower);
      totalMin += minutes;
      summaryParts.push(`Warm‑up ${lower.match(/(\d{1,3}(?:\s*(?:–|-|to)\s*\d{1,3})?\s*min)/)?.[1] || ''}`.trim());
    }
  });

  // Intervals / Tempo / Bike sets
  const tokenStr = steps.join(' ').toLowerCase();
  // Intervals like interval_6x800m_5kpace_R2min
  const im = tokenStr.match(/interval_(\d+)x(\d+(?:\.\d+)?)(m|mi)_(\w+?)(?:_(plus\d+(?::\d{2})?))?(?:_r(\d+)(?:-(\d+))?(?:min)?)?/i);
  if (im) {
    const reps = parseInt(im[1], 10);
    const per = parseFloat(im[2]);
    const unit = im[3].toLowerCase();
    const paceTag = im[4];
    const plus = im[5];
    const restA = im[6] ? parseInt(im[6], 10) : 0;
    const restB = im[7] ? parseInt(im[7], 10) : restA;
    const restEach = restA ? Math.round((restA + restB) / 2) : 0;

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
        workMin = (reps * distMiles * parsed.seconds) / 60;
        mainText += ` @ ${mmss(parsed.seconds)}/${parsed.unit} (${rng[0]}–${rng[1]})`;
        primary = { type: 'pace', value: pace, range: rng };
      }
    } else if (descPace) {
      const rng = [ `${mmss(descPace.sec*(1-hQ))}/${descPace.unit}`, `${mmss(descPace.sec*(1+hQ))}/${descPace.unit}` ] as [string,string];
      workMin = (reps * distMiles * descPace.sec) / 60;
      mainText += ` @ ${mmss(descPace.sec)}/${descPace.unit} (${rng[0]}–${rng[1]})`;
      primary = { type: 'pace', value: `${mmss(descPace.sec)}/${descPace.unit}`, range: rng };
    }

    const restMin = restEach * Math.max(0, reps - 1);
    totalMin += Math.round(workMin + restMin);
    summaryParts.push(`${mainText}${restEach ? ` w ${restEach} min jog` : ''}`);
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
        totalMin += Math.round(reps * (dist * parsed.seconds) / 60) + rmin * Math.max(0, reps - 1);
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
        totalMin += Math.round(reps * (dist * secv) / 60) + rmin * Math.max(0, reps - 1);
        mainText += ` @ ${mmss(secv)}/${unit} (${rng[0]}–${rng[1]})`;
        primary = { type: 'pace', value: `${mmss(secv)}/${unit}`, range: rng };
      } else {
        totalMin += rmin * Math.max(0, reps - 1);
      }
    }
    summaryParts.push(`${mainText}${rmin ? ` with ${mmss(rmin * 60)} jog rest` : ''}`);
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
        totalMin += Math.round((dist * parsed.seconds) / 60);
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
        totalMin += Math.round((dist * secv) / 60);
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
    summaryParts.push(`${reps} × ${tmin} min @ ${Math.round(center)} W${rmin ? ` with ${mmss(rmin * 60)} easy` : ''}`);
    primary = { type: 'power', value: Math.round(center), range: pr };
  }

  // Generic bike set fallback (e.g., bike_taper_2x12min_Z3_R5min)
  if (!bikeSet) {
    const gb = tokenStr.match(/bike_[a-z0-9]+_(\d+)x(\d+)min(?:_r(\d+)min)?/i);
    if (gb) {
      const reps = parseInt(gb[1], 10);
      const tmin = parseInt(gb[2], 10);
      const rmin = gb[3] ? parseInt(gb[3], 10) : 0;
      totalMin += reps * tmin + rmin * Math.max(0, reps - 1);
      summaryParts.push(`${reps} × ${tmin} min set${rmin ? ` with ${mmss(rmin * 60)} easy` : ''}`);
    }
  }

  // Endurance bike
  const bend = tokenStr.match(/bike_endurance_(\d+)min/i);
  if (bend) {
    const mins = parseInt(bend[1], 10);
    totalMin += mins;
    summaryParts.push(`Endurance ${mins} min (Z2)`);
  }

  // Long run blocks (e.g., longrun_150min_...)
  const lrun = tokenStr.match(/longrun_(\d+)min/i);
  if (lrun) {
    const mins = parseInt(lrun[1], 10);
    totalMin += mins;
    summaryParts.push(`Long run ${mins} min`);
  }

  // Strength single-block time (e.g., strength_main_50min)
  const strengthMain = tokenStr.match(/strength_main_(\d+)min/i);
  if (strengthMain) {
    const mins = parseInt(strengthMain[1], 10);
    totalMin += mins;
    summaryParts.push(`Strength ${mins} min`);
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
    summaryParts.push(`${reps} × ${secsEach}s with ${rest}s easy`);
  }

  // Cooldown
  steps.forEach((t) => {
    const lower = t.toLowerCase();
    if (lower.startsWith('cooldown')) {
      const minutes = addRangeMin(lower);
      totalMin += minutes;
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
      if (/(^interval_|^tempo_|^cruise_|^bike_.*\dx\d+min|^bike_endurance_|^warmup|^cooldown)/.test(lower)) return;
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
        summaryParts.push(`${reps} × ${meters} m @ ${mmss(baseSec)}/${unit} (${rng[0]}–${rng[1]})${restEach?` w ${restEach} min jog`:''}`.trim());
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

  return {
    friendlySummary: summaryParts.filter(Boolean).join(' • '),
    durationMinutes: totalMin,
    primaryTarget: primary,
  };
}



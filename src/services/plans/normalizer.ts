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
  const m = p.match(/(\d+):(\d{2})\/(mi|km)/i);
  if (!m) return null;
  return { seconds: sec(parseInt(m[1], 10), parseInt(m[2], 10)), unit: m[3].toLowerCase() } as { seconds: number; unit: 'mi' | 'km' };
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
  const im = tokenStr.match(/interval_(\d+)x(\d+(?:\.\d+)?)(m|mi)_(\w+?)(?:_(plus\d+(?::\d{2})?))?(?:_r(\d+)(?:-(\d+))?min)?/i);
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
    const rng = paceRange(pace, hQ);
    const distMiles = unit === 'mi' ? per : per / 1609.34;
    const p = parsePace(pace)!;
    const workMin = (reps * distMiles * p.seconds) / 60;
    const restMin = restEach * Math.max(0, reps - 1);
    totalMin += Math.round(workMin + restMin);
    summaryParts.push(`${reps} × ${unit === 'mi' ? per : Math.round(per)} ${unit} @ ${pace} (${rng[0]}–${rng[1]})${restEach ? ` with ${mmss(restEach * 60)} jog rest` : ''}`);
    primary = { type: 'pace', value: pace, range: rng };
  }

  // Tempo like tempo_4mi_5kpace_plus45s
  const tm = tokenStr.match(/tempo_(\d+(?:\.\d+)?)mi_(\w+?)(?:_(plus\d+(?::\d{2})?))?/i);
  if (tm) {
    const dist = parseFloat(tm[1]);
    const tag = tm[2];
    const plus = tm[3];
    let pace = resolvePaceToken(tag, baselines) || '';
    pace = applyOffset(pace, plus || undefined);
    const rng = paceRange(pace, hQ);
    const p = parsePace(pace)!;
    totalMin += Math.round((dist * p.seconds) / 60);
    summaryParts.push(`Tempo ${dist} mi @ ${pace} (${rng[0]}–${rng[1]})`);
    primary = { type: 'pace', value: pace, range: rng };
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
    summaryParts.push(`${reps} × ${tmin} min @ ${Math.round(center)} W (${pr[0]}–${pr[1]})${rmin ? ` with ${mmss(rmin * 60)} easy` : ''}`);
    primary = { type: 'power', value: Math.round(center), range: pr };
  }

  // Endurance bike
  const bend = tokenStr.match(/bike_endurance_(\d+)min/i);
  if (bend) {
    const mins = parseInt(bend[1], 10);
    totalMin += mins;
    summaryParts.push(`Endurance ${mins} min (Z2)`);
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

  return {
    friendlySummary: summaryParts.filter(Boolean).join(' • '),
    durationMinutes: totalMin,
    primaryTarget: primary,
  };
}



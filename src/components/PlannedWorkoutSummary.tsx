import React from 'react';
import { normalizePlannedSession, Baselines as NormalizerBaselines, ExportHints } from '@/services/plans/normalizer';
import { normalizeStructuredSession } from '@/services/plans/normalizer';

type Baselines = NormalizerBaselines | Record<string, any> | null | undefined;

interface PlannedWorkoutSummaryProps {
  workout: any;
  baselines?: Baselines;
  exportHints?: ExportHints;
}

const formatDuration = (minutes: number) => {
  if (!minutes && minutes !== 0) return '';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}`;
};

function getTitle(workout: any): string {
  const st = String((workout as any)?.workout_structure?.title || (workout as any)?.workout_title || '').trim();
  if (st) return st;
  const nm = (workout.name || '');
  const t = String(workout.type || '').toLowerCase();
  const desc = String(workout.rendered_description || workout.description || '');
  const tags = Array.isArray(workout.tags) ? (workout.tags as any[]).map((x: any) => String(x).toLowerCase()) : [];
  const lower = desc.toLowerCase();
  if (t === 'ride') {
    if (tags.includes('long_ride')) return 'Ride — Long Ride';
    if (/vo2/.test(lower)) return 'Ride — VO2';
    if (/threshold|thr_/.test(lower)) return 'Ride — Threshold';
    if (/sweet\s*spot|\bss\b/.test(lower)) return 'Ride — Sweet Spot';
    if (/recovery/.test(lower)) return 'Ride — Recovery';
    if (/endurance|z2/.test(lower)) return 'Ride — Endurance';
    return nm || 'Ride';
  }
  if (t === 'run') {
    if (tags.includes('long_run')) return 'Run — Long Run';
    if (/tempo/.test(lower)) return 'Run — Tempo';
    if (/(intervals?)/.test(lower) || /(\d+)\s*[x×]\s*(\d+)/.test(lower)) return 'Run — Intervals';
    return nm || 'Run';
  }
  if (t === 'swim') {
    if (tags.includes('opt_kind:technique') || /drills|technique/.test(lower)) return 'Swim — Technique';
    return nm || 'Swim — Endurance';
  }
  if (t === 'strength') return nm || 'Strength';
  return nm || 'Session';
}

function computeMinutes(workout: any, baselines?: Baselines, exportHints?: ExportHints): number | null {
  try {
    const secRaw = (workout as any)?.computed?.total_duration_seconds as any;
    const secNum = typeof secRaw === 'number' ? secRaw : (typeof secRaw === 'string' ? parseInt(secRaw, 10) : NaN);
    let fromComputed: number | null = (Number.isFinite(secNum) && secNum > 0) ? Math.round(Number(secNum) / 60) : null;
    let fromTokens: number | null = null;
    const pn = (baselines as any)?.performanceNumbers || {};
    const stepsPreset: string[] = Array.isArray((workout as any).steps_preset) ? (workout as any).steps_preset : [];
    if (stepsPreset.length) {
      try {
        const res = normalizePlannedSession({ ...workout, steps_preset: stepsPreset }, { performanceNumbers: pn } as any, (exportHints || (workout as any).export_hints || {}) as any);
        if (typeof res?.durationMinutes === 'number' && res.durationMinutes > 0) fromTokens = res.durationMinutes;
      } catch {}
    }
    const minutes = (typeof fromTokens === 'number' && (!fromComputed || fromTokens > fromComputed)) ? fromTokens : (fromComputed || null);
    return minutes;
  } catch { return null; }
}

function computeSwimYards(workout: any): number | null {
  const type = String((workout as any)?.type || '').toLowerCase();
  if (type !== 'swim') return null;
  try {
    const steps: any[] = Array.isArray((workout as any)?.computed?.steps) ? (workout as any).computed.steps : [];
    if (steps.length) {
      const meters = steps.reduce((a: number, st: any) => a + (Number(st?.distanceMeters) || 0), 0);
      const yd = Math.round(meters / 0.9144);
      if (yd > 0) return yd;
    }
  } catch {}
  try {
    const toks: string[] = Array.isArray((workout as any)?.steps_preset) ? (workout as any).steps_preset : [];
    if (!toks.length) return null;
    const toYd = (n: number, unit: string) => unit.toLowerCase() === 'm' ? Math.round(n / 0.9144) : n;
    let sum = 0;
    toks.forEach((t) => {
      const s = String(t).toLowerCase();
      let m = s.match(/swim_(?:warmup|cooldown)_(\d+)(yd|m)/i); if (m) { sum += toYd(parseInt(m[1], 10), m[2]); return; }
      m = s.match(/swim_drill_[a-z0-9_]+_(\d+)x(\d+)(yd|m)/i); if (m) { sum += toYd(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]); return; }
      m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)/i); if (m) { sum += toYd(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]); return; }
      m = s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)/i); if (m) { sum += toYd(parseInt(m[2], 10) * parseInt(m[3], 10), m[4]); return; }
      m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)/i); if (m) { sum += toYd(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]); return; }
    });
    return sum > 0 ? sum : null;
  } catch { return null; }
}

function buildWeeklySubtitle(workout: any, baselines?: Baselines): string | undefined {
  try {
    const pn = (baselines as any)?.performanceNumbers || {};
    try {
      const disc = String((workout as any)?.type || (workout as any)?.discipline || '').toLowerCase();
      if (disc === 'swim') {
        const parts: string[] = [];
        const stepsTok: string[] = Array.isArray((workout as any)?.steps_preset) ? (workout as any).steps_preset.map((t: any) => String(t)) : [];
        if (stepsTok.length) {
          let wu: string | null = null, cd: string | null = null;
          const drills: string[] = []; const pulls: string[] = []; const kicks: string[] = []; const aerobics: string[] = [];
          stepsTok.forEach((t) => {
            const s = String(t).toLowerCase();
            let m = s.match(/swim_(?:warmup|cooldown)_(\d+)(yd|m)/i);
            if (m) { const txt = `${parseInt(m[1], 10)} ${m[2].toLowerCase()}`; if (/warmup/i.test(s)) wu = `WU ${txt}`; else cd = `CD ${txt}`; return; }
            m = s.match(/swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
            if (m) { const name = m[1].replace(/_/g, ' '); const reps = parseInt(m[2], 10); const dist = parseInt(m[3], 10); const r = m[5] ? ` @ :${parseInt(m[5], 10)}r` : ''; drills.push(`${name} ${reps}x${dist}${r}`); return; }
            m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)_([a-z0-9_]+)/i);
            if (m) { const reps = parseInt(m[1], 10); const dist = parseInt(m[2], 10); const name = m[4].replace(/_/g, ' '); drills.push(`${name} ${reps}x${dist}`); return; }
            m = s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
            if (m) { const reps = parseInt(m[2], 10); const dist = parseInt(m[3], 10); const r = m[5] ? ` @ :${parseInt(m[5], 10)}r` : ''; (m[1] === 'pull' ? pulls : kicks).push(`${reps}x${dist}${r}`); return; }
            m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
            if (m) { const reps = parseInt(m[1], 10); const dist = parseInt(m[2], 10); const r = m[4] ? ` @ :${parseInt(m[4], 10)}r` : ''; aerobics.push(`${reps}x${dist}${r}`); return; }
          });
          if (wu) parts.push(wu);
          if (drills.length) parts.push(`Drills: ${Array.from(new Set(drills)).join(', ')}`);
          if (pulls.length) parts.push(`Pull ${Array.from(new Set(pulls)).join(', ')}`);
          if (kicks.length) parts.push(`Kick ${Array.from(new Set(kicks)).join(', ')}`);
          if (aerobics.length) parts.push(`Aerobic ${Array.from(new Set(aerobics)).join(', ')}`);
          if (cd) parts.push(cd);
          if (parts.length) return parts.join(' • ');
        }
      }
    } catch {}
    const structured = (workout as any)?.workout_structure;
    if (structured && typeof structured === 'object') {
      try {
        const res = normalizeStructuredSession(workout, { performanceNumbers: pn } as any);
        if (res?.friendlySummary) return res.friendlySummary;
      } catch {}
    }
    const friendly = String((workout as any)?.friendly_summary || '').trim();
    if (friendly) return friendly;
    const desc = String((workout as any)?.rendered_description || (workout as any)?.description || '').trim();
    return desc || undefined;
  } catch { return undefined; }
}

export const PlannedWorkoutSummary: React.FC<PlannedWorkoutSummaryProps> = ({ workout, baselines, exportHints }) => {
  const minutes = computeMinutes(workout, baselines, exportHints);
  const yards = computeSwimYards(workout);
  const title = getTitle(workout);
  const lines = buildWeeklySubtitle(workout, baselines) || '';
  const stacked = String(lines).split(/\s•\s/g).filter(Boolean);
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <div className="font-medium text-base text-gray-900 flex items-center gap-2">
          <span>{title}</span>
          <span className="flex items-center gap-1">
            {(typeof minutes === 'number') ? (
              <span className="px-2 py-0.5 text-xs rounded bg-gray-100 border border-gray-200 text-gray-800">{formatDuration(minutes)}</span>
            ) : null}
            {(typeof yards === 'number') ? (
              <span className="px-2 py-0.5 text-xs rounded bg-blue-50 border border-blue-200 text-blue-800">{yards} yd</span>
            ) : null}
          </span>
        </div>
        <div className="text-sm text-gray-600 mt-1">
          {stacked.length > 1 ? (
            <span className="whitespace-pre-line">{stacked.join('\n')}</span>
          ) : (
            <span>{lines}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlannedWorkoutSummary;



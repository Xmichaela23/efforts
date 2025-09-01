import type { AtomicStep } from './expander';

export interface Baselines {
  fiveK_pace?: string; // "mm:ss/mi" or "/km"
  fiveKPace?: string;
  fiveK?: string;
  easyPace?: string;
  easy_pace?: string;
  ftp?: number;
  swimPace100?: string; // "mm:ss"
}

export function parsePace(txt?: string): { sec: number|null, unit?: 'mi'|'km' } {
  if (!txt) return { sec: null } as any;
  const m = String(txt).trim().match(/(\d+):(\d{2})\s*\/\s*(mi|km)/i);
  if (!m) return { sec: null } as any;
  return { sec: parseInt(m[1],10)*60 + parseInt(m[2],10), unit: m[3].toLowerCase() as any };
}

function mmss(sec: number) { const x=Math.max(1,Math.round(sec)); const m=Math.floor(x/60); const s=x%60; return `${m}:${String(s).padStart(2,'0')}`; }

export type ResolvedStep = AtomicStep & { target_value?: string; target_low?: string; target_high?: string };

export function resolveTargets(steps: AtomicStep[], baselines: Baselines, exportHints: any): ResolvedStep[] {
  const tolEasy = typeof exportHints?.pace_tolerance_easy==='number' ? exportHints.pace_tolerance_easy : 0.06;
  const tolQual = typeof exportHints?.pace_tolerance_quality==='number' ? exportHints.pace_tolerance_quality : 0.04;
  const ftp: number|undefined = typeof (baselines as any)?.ftp === 'number' ? (baselines as any).ftp : undefined;
  const fivek = baselines.fiveK_pace || baselines.fiveKPace || baselines.fiveK;
  const easy = baselines.easyPace || baselines.easy_pace;

  const out: ResolvedStep[] = [];
  for (const st of steps) {
    const rs: ResolvedStep = { ...st } as any;
    const isRest = rs.type==='interval_rest' || /rest/i.test(String((rs as any).cue||''));
    // Pace resolution for run-like steps
    if (rs.target && /\{.*pace.*\}/i.test(rs.target)) {
      const token = rs.target;
      let base = token.includes('5k') ? fivek : easy || fivek || undefined;
      // handle offsets like {5k_pace}+0:10
      const plus = token.match(/\+\d+:\d{2}/);
      if (plus && base) {
        const p = parsePace(base);
        if (p.sec) {
          const add = plus[0].slice(1); // mm:ss
          const m = add.match(/(\d+):(\d{2})/);
          if (m) base = `${mmss(p.sec + parseInt(m[1],10)*60 + parseInt(m[2],10))}/${p.unit}`;
        }
      }
      const p = parsePace(base);
      if (p.sec && p.unit) {
        const tol = isRest ? tolEasy : tolQual;
        rs.target_value = `${mmss(p.sec)}/${p.unit}`;
        rs.target_low = `${mmss(p.sec*(1-tol))}/${p.unit}`;
        rs.target_high = `${mmss(p.sec*(1+tol))}/${p.unit}`;
      }
    }
    // Power resolution for bike
    if (rs.target && /power\}|FTP\}/i.test(rs.target)) {
      if (ftp) {
        // simple mapping by keyword
        const kind = rs.target.includes('VO2') ? 1.10 : rs.target.includes('threshold') ? 0.98 : rs.target.includes('sweetspot') ? 0.91 : 0.65;
        const tol = rs.target.includes('VO2') ? 0.10 : 0.05;
        const center = Math.round(ftp * kind);
        const lo = Math.round(center * (1 - tol));
        const hi = Math.round(center * (1 + tol));
        rs.target_value = `${center} W`;
        rs.target_low = `${lo} W`;
        rs.target_high = `${hi} W`;
      }
    }
    out.push(rs);
  }
  return out;
}

export function totalDurationSeconds(steps: ResolvedStep[]): number {
  let s = 0;
  for (const st of steps) s += st.duration_s ? Number(st.duration_s) : 0;
  return s;
}



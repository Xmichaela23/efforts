import { getPreset, PRESETS, Preset } from './presets';

export type AtomicStep =
  | { id: string; type: 'warmup'|'cooldown'|'steady'; duration_s?: number; distance_m?: number; target?: string; cue?: string }
  | { id: string; type: 'interval_work'|'interval_rest'; duration_s?: number; distance_m?: number; target?: string; cue?: string }
  | { id: string; type: 'strength_work'|'strength_rest'; exercise?: string; set?: number; reps?: number|string; intensity?: string; rest_s?: number };

export interface ExpandOptions {
  idPrefix?: string;
  override?: { reps?: number; work_time_s?: number; work_dist_m?: number; rest_time_s?: number; rest_dist_m?: number; omit_last_rest?: boolean };
}

const makeId = (prefix: string, parts: (string|number|undefined)[]) => [prefix, ...parts.filter(Boolean)].join('-');

export function parseExpandTags(tags?: string[]|unknown): ExpandOptions {
  try {
    const arr: string[] = Array.isArray(tags) ? (tags as string[]) : [];
    const idp = arr.find(t => t.toLowerCase().startsWith('idprefix:'));
    const exp = arr.find(t => t.toLowerCase().startsWith('expand:'));
    const res: ExpandOptions = {};
    if (idp) res.idPrefix = String(idp.split(':')[1] || '').trim();
    if (exp) {
      const spec = String(exp.split(':')[1]||'');
      const kvs = spec.split(';');
      const o: any = {};
      for (const kv of kvs) {
        const [k,v] = kv.split('=');
        if (!k) continue;
        if (k==='reps') o.reps = Number(v);
        if (k==='work') {
          if (String(v).endsWith('s')) o.work_time_s = Number(String(v).replace('s',''));
          if (String(v).endsWith('m')) o.work_dist_m = Number(String(v).replace('m',''));
        }
        if (k==='rest') {
          if (String(v).endsWith('s')) o.rest_time_s = Number(String(v).replace('s',''));
          if (String(v).endsWith('m')) o.rest_dist_m = Number(String(v).replace('m',''));
        }
        if (k==='omit_last_rest') o.omit_last_rest = String(v||'1')==='1';
      }
      res.override = o;
    }
    return res;
  } catch { return {}; }
}

export function expand(stepsPreset: string[]|null|undefined, swimMain?: string, tags?: string[]|unknown): AtomicStep[] {
  const out: AtomicStep[] = [];
  const opts = parseExpandTags(tags);
  const idPrefix = opts.idPrefix || 'step';
  const steps = Array.isArray(stepsPreset) ? stepsPreset : [];

  const pushInterval = (reps: number, work: {duration_s?:number; dist_m?:number; target?:string}, rest?: {duration_s?:number; dist_m?:number}) => {
    const r = Math.max(1, Number(opts.override?.reps || reps));
    const workTime = opts.override?.work_time_s ?? work.duration_s;
    const workDist = opts.override?.work_dist_m ?? work.dist_m;
    const restTime = opts.override?.rest_time_s ?? rest?.duration_s;
    const restDist = opts.override?.rest_dist_m ?? rest?.dist_m;
    for (let i=1;i<=r;i+=1){
      out.push({ id: makeId(idPrefix, ['rep', String(i).padStart(2,'0'), 'work']), type: 'interval_work', duration_s: workTime, distance_m: workDist, target: work.target });
      const last = i===r;
      const omit = opts.override?.omit_last_rest && last;
      if (!omit && (restTime || restDist)) out.push({ id: makeId(idPrefix, ['rep', String(i).padStart(2,'0'), 'rest']), type: 'interval_rest', duration_s: restTime, distance_m: restDist });
    }
  };

  for (const token of steps) {
    const preset = getPreset(token);
    if (!preset) continue;
    if ((preset as any).kind === 'steady') {
      const p = preset as any;
      out.push({ id: makeId(idPrefix, [token]), type: token.includes('cooldown')?'cooldown': token.includes('warmup')?'warmup':'steady', duration_s: p.duration_s, target: p.target });
    } else if ((preset as any).kind === 'interval') {
      const p = preset as any;
      pushInterval(p.reps, { duration_s: p.work.duration_s, dist_m: p.work.dist_m, target: p.work.target }, p.rest);
    } else if ((preset as any).kind === 'tempo') {
      const p = preset as any;
      out.push({ id: makeId(idPrefix, [token]), type: 'steady', distance_m: p.dist_m, target: p.target });
    } else if ((preset as any).kind === 'longrun') {
      const p = preset as any;
      out.push({ id: makeId(idPrefix, [token]), type: 'steady', duration_s: p.duration_s, target: p.target });
    } else if ((preset as any).exercise) {
      const s = preset as any;
      for (let set=1; set<=Number(s.sets||1); set+=1){
        out.push({ id: makeId(idPrefix, [s.exercise, 'set', String(set).padStart(2,'0')]), type: 'strength_work', exercise: s.exercise, set, reps: s.reps, intensity: s.intensity, rest_s: s.rest_s });
      }
    }
  }

  // Swim main DSL → atomic blocks
  if (typeof swimMain === 'string' && swimMain.trim()) {
    const parts = swimMain.split(';').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      const m1 = part.match(/^drills\(([^)]+)\)$/i);
      if (m1) {
        const drills = m1[1].split(',').map(x=>x.trim());
        for (const d of drills) out.push({ id: makeId(idPrefix, ['swim','drill',d]), type: 'steady', distance_m: undefined, cue: `drill:${d}` });
        continue;
      }
      const m2 = part.match(/^(pull|kick)(\d+)x(\d+)$/i);
      if (m2) {
        const reps = Number(m2[2]); const each = Number(m2[3]);
        for (let i=1;i<=reps;i+=1) out.push({ id: makeId(idPrefix, ['swim', m2[1].toLowerCase(), String(i).padStart(2,'0')]), type: 'steady', distance_m: each, cue: m2[1].toLowerCase() });
        continue;
      }
      const m3 = part.match(/^aerobic\((\d+)x(\d+)\)$/i);
      if (m3) {
        const reps = Number(m3[1]); const each = Number(m3[2]);
        for (let i=1;i<=reps;i+=1) out.push({ id: makeId(idPrefix, ['swim','aerobic', String(i).padStart(2,'0')]), type: 'steady', distance_m: each, cue: 'aerobic' });
        continue;
      }
    }
  }

  return out;
}



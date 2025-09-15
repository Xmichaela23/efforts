// Deterministic baker for triathlon blueprints → sessions_by_week
// - Aligns final week to race week (ends on race_date)
// - Phases: build → peak(fixed) → taper(fixed)
// - Rotates variants by week index for stable variety

export type AnySession = Record<string, any>;

type Block = { notes?: string; sessions: Record<string, Array<any>> };
type PlanBlueprint = {
  min_weeks: number;
  max_weeks: number;
  phase_blueprint: {
    order: Array<'build'|'peak'|'taper'>;
    build: { repeat_min: number; repeat_max: number; block_ref: string };
    peak:  { fixed: number; blocks: string[] };
    taper: { fixed: number; blocks: string[] };
  };
  blocks: Record<string, Block>;
};

function startOfWeekMon(d: Date): Date {
  const res = new Date(d);
  res.setHours(0,0,0,0);
  const dow = (res.getDay() + 6) % 7; // Mon=0..Sun=6
  res.setDate(res.getDate() - dow);
  return res;
}

function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function iso(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function rotateVariant<T>(variants: T[], weekIndex: number, seed = 0): T {
  const i = (weekIndex + seed) % variants.length;
  return variants[i];
}

export function bakeBlueprintToSessions(
  template: PlanBlueprint,
  weeksToRace: number,
  raceDateISO: string
): Record<string, AnySession[]> {
  const peakCount = template.phase_blueprint?.peak?.fixed ?? 2;
  const taperCount = template.phase_blueprint?.taper?.fixed ?? 2;
  const buildCount = Math.max(0, weeksToRace - peakCount - taperCount);

  // Build week windows so the last week ends on race_date's week
  const rd = (() => { const p = raceDateISO.split('-').map(n=>parseInt(n,10)); return new Date(p[0], (p[1]||1)-1, p[2]||1); })();
  const lastWeekMon = startOfWeekMon(rd);
  const firstWeekMon = addDays(lastWeekMon, -7*(weeksToRace-1));

  const sessionsByWeek: Record<string, AnySession[]> = {};
  const dayOrder = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

  for (let w = 0; w < weeksToRace; w++) {
    // Which phase is this week?
    let phase: 'build'|'peak'|'taper' = 'build';
    if (w >= buildCount && w < buildCount + peakCount) phase = 'peak';
    if (w >= buildCount + peakCount) phase = 'taper';

    // Pick block for this week
    let block: Block | undefined;
    if (phase === 'build') {
      block = template.blocks[template.phase_blueprint.build.block_ref];
    } else if (phase === 'peak') {
      const idx = w - buildCount;
      block = template.blocks[template.phase_blueprint.peak.blocks[idx]];
    } else {
      const idx = w - buildCount - peakCount;
      block = template.blocks[template.phase_blueprint.taper.blocks[idx]];
    }
    if (!block) { sessionsByWeek[String(w+1)] = []; continue; }

    // Instantiate sessions for the week with variant rotation
    const weekSessions: AnySession[] = [];
    for (const day of Object.keys(block.sessions)) {
      const items = block.sessions[day] || [];
      for (const s of items) {
        const inst: AnySession = { ...s };
        if (Array.isArray(inst.variants) && inst.variants.length) {
          const v = rotateVariant(inst.variants, w, 0);
          delete inst.variants;
          Object.assign(inst, v);
        }
        // Ensure day casing Title Case to match rest of app
        const idx = Math.max(0, dayOrder.indexOf(String(day).toLowerCase()));
        inst.day = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][idx] || 'Monday';
        weekSessions.push(inst);
      }
    }

    // Stable order Mon→Sun
    weekSessions.sort((a:AnySession,b:AnySession)=> dayOrder.indexOf(String(a.day||'').toLowerCase()) - dayOrder.indexOf(String(b.day||'').toLowerCase()));
    sessionsByWeek[String(w+1)] = weekSessions;
  }

  return sessionsByWeek;
}



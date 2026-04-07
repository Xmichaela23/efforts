/**
 * Course strategy: snapshot hash, LLM JSON validation, DB row materialization.
 */
import type { GeometrySegment } from './course-segmentation.ts';

const MI_M = 1609.344;
const FT_PER_M = 3.28084;

export type BaselinePaces = {
  easy_sec_per_mi: number | null;
  threshold_sec_per_mi: number | null;
  max_hr: number | null;
  hr_zones: { z1?: string; z2?: string; z3?: string; z4?: string; z5?: string };
};

export type SnapshotForHash = {
  easy_pace: number | null;
  threshold_pace: number | null;
  hr_zones: Record<string, string>;
  max_hr: number | null;
  recent_long_run_avg_hr: number | null;
  recent_long_run_decoupling: number | null;
};

/** SHA-256 hex of canonical JSON (sorted keys) for staleness. */
export async function hashAthleteSnapshot(s: SnapshotForHash): Promise<string> {
  const canonical = {
    easy_pace: s.easy_pace,
    threshold_pace: s.threshold_pace,
    hr_zones: sortKeys(s.hr_zones),
    max_hr: s.max_hr,
    recent_long_run_avg_hr: s.recent_long_run_avg_hr,
    recent_long_run_decoupling: s.recent_long_run_decoupling,
  };
  const json = JSON.stringify(canonical);
  const buf = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sortKeys(o: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(o).sort()) out[k] = o[k];
  return out;
}

export function parsePaceToSecPerMi(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v) && v > 120 && v < 3600) return v;
  const s = String(v).trim();
  const m = /^(\d+):(\d{2})(?::(\d{2}))?$/i.exec(s.replace(/\s*\/mi\s*$/i, ''));
  if (m) {
    const p1 = parseInt(m[1], 10);
    const p2 = parseInt(m[2], 10);
    const p3 = m[3] != null ? parseInt(m[3], 10) : null;
    if (p3 != null) return p1 * 3600 + p2 * 60 + p3;
    return p1 * 60 + p2;
  }
  return null;
}

export function fmtPaceClock(secPerMi: number): string {
  const x = Math.round(secPerMi);
  const m = Math.floor(x / 60);
  const ss = x % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

export function fmtFinishClock(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const mi = Math.floor((totalSec % 3600) / 60);
  const s = Math.round(totalSec % 60);
  if (h > 0) return `${h}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${mi}:${String(s).padStart(2, '0')}`;
}

export type LlmDisplayGroup = {
  display_group_id: number;
  segment_orders: number[];
  display_label: string;
  effort_zone: string;
  target_pace_slow_sec_per_mi: number;
  target_pace_fast_sec_per_mi: number;
  target_hr_low: number;
  target_hr_high: number;
  coaching_cue: string;
};

export type ParsedLlm = { display_groups: LlmDisplayGroup[] };

export function stripJsonFences(text: string): string {
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  }
  return t.trim();
}

const EFFORT = new Set(['conservative', 'cruise', 'caution', 'push']);

export function validateLlmResponse(
  parsed: unknown,
  segmentCount: number,
  maxHr: number | null,
): { ok: true; data: ParsedLlm } | { ok: false; error: string } {
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'not an object' };
  const dg = (parsed as Record<string, unknown>).display_groups;
  if (!Array.isArray(dg) || dg.length === 0) return { ok: false, error: 'missing display_groups' };

  const seen = new Set<number>();
  for (const g of dg) {
    if (!g || typeof g !== 'object') return { ok: false, error: 'invalid group' };
    const o = g as Record<string, unknown>;
    const orders = o.segment_orders;
    if (!Array.isArray(orders)) return { ok: false, error: 'segment_orders not array' };
    for (const ord of orders) {
      const n = Number(ord);
      if (!Number.isInteger(n) || n < 1 || n > segmentCount) {
        return { ok: false, error: `bad segment_order ${n}` };
      }
      if (seen.has(n)) return { ok: false, error: `duplicate segment_order ${n}` };
      seen.add(n);
    }
    const ez = String(o.effort_zone || '');
    if (!EFFORT.has(ez)) return { ok: false, error: `bad effort_zone ${ez}` };
    const ps = Number(o.target_pace_slow_sec_per_mi);
    const pf = Number(o.target_pace_fast_sec_per_mi);
    if (!Number.isFinite(ps) || !Number.isFinite(pf) || ps < pf) {
      return { ok: false, error: 'pace bounds invalid (slow must be >= fast sec/mi)' };
    }
    const hrl = Number(o.target_hr_low);
    const hrh = Number(o.target_hr_high);
    if (!Number.isFinite(hrl) || !Number.isFinite(hrh) || hrl > hrh) return { ok: false, error: 'HR bounds invalid' };
    if (maxHr != null && hrh > maxHr + 5) return { ok: false, error: 'HR high above max_hr' };
    const cue = String(o.coaching_cue || '');
    if (cue.length > 80) return { ok: false, error: 'cue too long' };
    const lab = String(o.display_label || '');
    if (lab.length > 40) return { ok: false, error: 'label too long' };
  }
  if (seen.size !== segmentCount) return { ok: false, error: 'segment coverage mismatch' };
  return { ok: true, data: parsed as ParsedLlm };
}

function dominantTerrain(geoms: GeometrySegment[], orders: number[]): 'climb' | 'descent' | 'flat' | 'rolling' {
  const byType: Record<string, number> = {};
  for (const g of geoms) {
    if (!orders.includes(g.segment_order)) continue;
    const len = g.end_distance_m - g.start_distance_m;
    byType[g.terrain_type] = (byType[g.terrain_type] || 0) + len;
  }
  let best: 'climb' | 'descent' | 'flat' | 'rolling' = 'flat';
  let mx = 0;
  for (const [k, v] of Object.entries(byType)) {
    if (v > mx) {
      mx = v;
      best = k as 'climb' | 'descent' | 'flat' | 'rolling';
    }
  }
  return best;
}

function templateLabel(startMi: number, endMi: number, terrain: string): string {
  const a = Math.round(startMi * 10) / 10;
  const b = Math.round(endMi * 10) / 10;
  const t = `Mi ${a}–${b} · ${terrain}`;
  return t.length > 40 ? t.slice(0, 37) + '…' : t;
}

export function materializeSegmentRows(
  geometry: GeometrySegment[],
  groups: LlmDisplayGroup[],
): Record<string, unknown>[] {
  return geometry.map((geo) => {
    const g = groups.find((gr) => gr.segment_orders.includes(geo.segment_order));
    if (!g) throw new Error('missing group for segment ' + geo.segment_order);
    const geosInGroup = geometry.filter((x) => g.segment_orders.includes(x.segment_order));
    const sm = Math.min(...geosInGroup.map((x) => x.start_distance_m)) / MI_M;
    const em = Math.max(...geosInGroup.map((x) => x.end_distance_m)) / MI_M;
    const dom = dominantTerrain(geometry, g.segment_orders);
    let label = String(g.display_label || '').trim();
    if (!label || label.length > 40) label = templateLabel(sm, em, dom);
    label = label.slice(0, 40);
    const firstOrd = Math.min(...g.segment_orders);
    const isFirst = geo.segment_order === firstOrd;
    return {
      segment_order: geo.segment_order,
      start_distance_m: geo.start_distance_m,
      end_distance_m: geo.end_distance_m,
      start_elevation_m: geo.start_elevation_m,
      end_elevation_m: geo.end_elevation_m,
      elevation_change_m: geo.elevation_change_m,
      avg_grade_pct: geo.avg_grade_pct,
      terrain_type: dom,
      display_group_id: g.display_group_id,
      display_label: label,
      effort_zone: g.effort_zone,
      target_pace_slow_sec_per_mi: g.target_pace_slow_sec_per_mi,
      target_pace_fast_sec_per_mi: g.target_pace_fast_sec_per_mi,
      target_hr_low: Math.round(g.target_hr_low),
      target_hr_high: Math.round(g.target_hr_high),
      coaching_cue: isFirst ? String(g.coaching_cue || '').slice(0, 80) : null,
    };
  });
}

export function geometryToPromptSegments(geoms: GeometrySegment[]): Record<string, unknown>[] {
  return geoms.map((g) => ({
    segment_order: g.segment_order,
    start_mi: Math.round((g.start_distance_m / MI_M) * 100) / 100,
    end_mi: Math.round((g.end_distance_m / MI_M) * 100) / 100,
    elevation_change_ft: Math.round(g.elevation_change_m * FT_PER_M),
    avg_grade_pct: Math.round(g.avg_grade_pct * 10) / 10,
    terrain_type: g.terrain_type,
  }));
}

export function impliedAvgPaceSecPerMi(goalTimeSec: number, distanceMi: number): number {
  if (distanceMi <= 0.1) return 600;
  return goalTimeSec / distanceMi;
}

export function goalDistanceMi(goalDistance: string | null | undefined): number {
  const d = String(goalDistance || '').toLowerCase();
  if (d.includes('marathon') && !d.includes('half')) return 26.2;
  if (d.includes('half')) return 13.1;
  if (d.includes('50k')) return 31.07;
  if (d.includes('10')) return 6.2;
  if (d.includes('5k') || d === '5') return 3.10686;
  return 26.2;
}

/**
 * ═══ THE ZONES PROFILE AND WELCOME PRINT, BUILT FROM THE STORED ROW (2026-09-10, audit H-B04–H-B06) ═══
 *
 * ⛔ THE PHONE PRINTS THESE AND COMPUTES NONE OF THEM.
 *   · power rows: Coggan's levels (`_shared/endurance/display-zones.ts`) at the FTP the resolver
 *     applies (`resolveCurrentFtp`, the number Profile shows beside them);
 *   · swim pace bands: the same file, from the stored threshold 100 pace;
 *   · the easy heart-rate band: `resolveRunEasyHrBand`, the band the learner and the analysers call easy.
 *     The Welcome screen printed 85–89% of threshold (Friel's Z2 alone); the server's easy band runs from
 *     70% (the floor below which a run is a walk or a stop) to 89%, so the numbers change on screen.
 *
 * ⚠️ THE THRESHOLD THE EASY BAND IS BUILT FROM is the athlete's typed run threshold heart rate when there
 * is one (`configured_hr_zones.manual_run_lthr`, else `performance_numbers.threshold_heart_rate`); the
 * resolver inside `resolveRunEasyHrBand` still prefers a trusted learned threshold over it.
 */
import { resolveCurrentFtp } from '../../../src/lib/resolve-current-ftp.ts';
import { resolveRunEasyHrBand } from '../_shared/easy-hr.ts';
import {
  parsePaceClock,
  powerZoneRows,
  swimPaceBandRows,
  type PowerZoneRow,
  type SwimPaceBandRow,
} from '../_shared/endurance/display-zones.ts';

export type BaselineZones = {
  power: { ftp: number; rows: PowerZoneRow[] } | null;
  swim_pace: { threshold_100: string; rows: SwimPaceBandRow[] } | null;
  run_easy_hr: { floor: number; ceiling: number; anchor: string; basis: string } | null;
};

const parseJson = (v: unknown): Record<string, unknown> | null => {
  if (v == null) return null;
  if (typeof v !== 'string') return v as Record<string, unknown>;
  try { return JSON.parse(v); } catch { return null; }
};

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function zonesForBaselinesRow(row: {
  performance_numbers?: unknown;
  learned_fitness?: unknown;
  configured_hr_zones?: unknown;
} | null | undefined): BaselineZones {
  const pn = parseJson(row?.performance_numbers) ?? {};
  const learned = parseJson(row?.learned_fitness);
  const cfg = parseJson(row?.configured_hr_zones) ?? {};

  const ftp = resolveCurrentFtp({ learned_fitness: learned, performance_numbers: pn } as never).value;
  const ftpW = positive(ftp);
  const power = ftpW ? { ftp: Math.round(ftpW), rows: powerZoneRows(ftpW) } : null;

  const swimSec = parsePaceClock(pn.swimPace100);
  const swim_pace = swimSec ? { threshold_100: String(pn.swimPace100).trim(), rows: swimPaceBandRows(swimSec) } : null;

  const typedLthr = positive(cfg.manual_run_lthr) ?? positive(pn.threshold_heart_rate);
  const band = resolveRunEasyHrBand(learned, typedLthr);
  const floor = positive(band?.floor);
  const ceiling = positive(band?.ceiling);
  const run_easy_hr = band && band.anchor !== 'none' && floor != null && ceiling != null
    ? { floor, ceiling, anchor: String(band.anchor), basis: String(band.basis ?? '') }
    : null;

  return { power, swim_pace, run_easy_hr };
}

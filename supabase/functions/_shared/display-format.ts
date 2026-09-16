/**
 * ⛔ ONE SET OF DISPLAY FORMATTERS (2026-09-16, Stage 7 session 1 — one-truth workorder).
 *
 * Every number a screen prints in the athlete's unit is formatted here, on the server. Before this file the
 * Details reply (`workout-detail`) and the Performance reply (`session-detail/build.ts`) each held their own
 * copy; the Today card, the Week bar, the post-workout popup and the gear list converted on the phone.
 *
 * Units are converted by the definition constants (1 mi = 1609.344 m, 1 yd = 0.9144 m, 1 lb = 0.45359237 kg).
 * ⚠️ M:SS IS ROUNDED WHOLE, THEN SPLIT — rounding the remainder alone is what printed "7:60/mi" (§8.0 #2).
 *
 * Two distance shapes exist on purpose, because the screens already print both:
 *   - `distance`       — 1 dp mi / km; a swim reads yd / m.            (Performance, Today, Week)
 *   - `distanceDetail` — 1 dp km; under a mile prints yd, else 1 dp mi. (Details)
 */
import { KG_PER_LB } from '../../../src/lib/bar-types.ts';

// International yard and pound (1959) — NIST Handbook 44, Appendix C: 1 yd = 0.9144 m exactly, 1 mi = 1609.344 m.
export const M_PER_MI = 1609.344;
// NIST Handbook 44, Appendix C: 1 yd = 0.9144 m exactly.
export const M_PER_YD = 0.9144;
// NIST Handbook 44, Appendix C: 1 ft = 0.3048 m exactly, so 1 m = 3.280839895 ft.
export const FT_PER_M = 1 / 0.3048;

const finitePos = (x: unknown): number | null => {
  const v = Number(x);
  return Number.isFinite(v) && v > 0 ? v : null;
};

export function clock(sec: number): string {
  const v = Math.max(0, Math.round(sec));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

/** H:MM:SS over an hour, M:SS under it. */
export function durationClock(sec: number | null | undefined): string | null {
  const v = finitePos(sec);
  if (v == null) return null;
  const t = Math.round(v);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}

/** Whole minutes. */
export function wholeMinutes(sec: number | null | undefined): number | null {
  const v = finitePos(sec);
  return v == null ? null : Math.round(v / 60);
}

export function displayFormat(metric: boolean) {
  return {
    metric,
    distanceUnit: metric ? 'km' : 'mi',
    elevationUnit: metric ? 'm' : 'ft',
    /** 1 dp mi / km; a swim reads yd / m. */
    distance(metres: number | null | undefined, swim = false): string | null {
      const v = finitePos(metres);
      if (v == null) return null;
      if (swim) return metric ? `${Math.round(v)} m` : `${Math.round(v / M_PER_YD)} yd`;
      return metric ? `${(v / 1000).toFixed(1)} km` : `${(v / M_PER_MI).toFixed(1)} mi`;
    },
    /**
     * The Details gear picker's shape: 1 dp km; imperial under one mile prints whole metres, else 1 dp mi.
     * OURS — the one-mile cut is the picker's own display rule, carried from the phone; no outside source.
     */
    distanceMetresUnderMile(metres: number | null | undefined): string | null {
      const v = finitePos(metres);
      if (v == null) return null;
      if (metric) return `${(v / 1000).toFixed(1)} km`;
      const mi = v / M_PER_MI;
      return mi < 1 ? `${Math.round(v)} m` : `${mi.toFixed(1)} mi`;
    },
    /** The post-workout popup's shape: 1 dp mi from 0.1 mi, 1 dp km from 1 km, whole metres below either. */
    distanceOrMetres(metres: number | null | undefined): string | null {
      const v = finitePos(metres);
      if (v == null) return null;
      if (metric) return v >= 1000 ? `${(v / 1000).toFixed(1)} km` : `${Math.round(v)} m`;
      const mi = v / M_PER_MI;
      return mi >= 0.1 ? `${mi.toFixed(1)} mi` : `${Math.round(v)} m`;
    },
    /** 1 dp km; imperial under a mile prints yards, else 1 dp mi. */
    distanceDetail(metres: number | null | undefined): string | null {
      const v = finitePos(metres);
      if (v == null) return null;
      if (metric) return `${(v / 1000).toFixed(1)} km`;
      const mi = v / M_PER_MI;
      return mi < 1 ? `${Math.round(v / M_PER_YD)} yd` : `${mi.toFixed(1)} mi`;
    },
    /** The number alone in the athlete's distance unit, to `dp` places (charts, segment rows). */
    distanceNumber(metres: number | null | undefined, dp: number): number | null {
      const v = Number(metres);
      if (!Number.isFinite(v)) return null;
      const f = 10 ** dp;
      return Math.round((metric ? v / 1000 : v / M_PER_MI) * f) / f;
    },
    pacePerUnit(secPerKm: number | null | undefined): string | null {
      const v = finitePos(secPerKm);
      if (v == null) return null;
      return `${clock(metric ? v : v * (M_PER_MI / 1000))}${metric ? '/km' : '/mi'}`;
    },
    /** Seconds per the athlete's distance unit (a number, for a chart readout). */
    paceSecondsPerUnit(secPerKm: number | null | undefined): number | null {
      const v = finitePos(secPerKm);
      if (v == null) return null;
      return Math.round(metric ? v : v * (M_PER_MI / 1000));
    },
    speed(secPerKm: number | null | undefined): string | null {
      const v = finitePos(secPerKm);
      if (v == null) return null;
      const kmh = 3600 / v;
      return metric ? `${kmh.toFixed(1)} km/h` : `${(kmh * (1000 / M_PER_MI)).toFixed(1)} mph`;
    },
    speedFromMps(mps: number | null | undefined): string | null {
      const v = finitePos(mps);
      if (v == null) return null;
      return metric ? `${(v * 3.6).toFixed(1)} km/h` : `${((v * 3600) / M_PER_MI).toFixed(1)} mph`;
    },
    elevation(metres: number | null | undefined): string | null {
      const v = Number(metres);
      if (!Number.isFinite(v)) return null;
      return metric ? `${Math.round(v)} m` : `${Math.round(v * FT_PER_M)} ft`;
    },
    /** Whole metres or feet (a number, for a chart readout). */
    elevationNumber(metres: number | null | undefined): number | null {
      const v = Number(metres);
      if (!Number.isFinite(v)) return null;
      return Math.round(metric ? v : v * FT_PER_M);
    },
    /** A lift is stored in pounds and converts for a metric account (§8.0 #7). */
    weight(lb: number | null | undefined): string | null {
      const v = finitePos(lb);
      if (v == null) return null;
      return metric ? `${Math.round(v * KG_PER_LB)} kg` : `${Math.round(v)} lb`;
    },
    // ⛔ ADDED FOR TODAY, THE SESSION CARD, THE WEEK ROW AND THE WEEK BAR (2026-09-16, Stage 7 session 1).
    /** A swim's whole yards / metres with en-US thousands commas: "1,650 yd" · "1,500 m". */
    swimDistanceGrouped(metres: number | null | undefined): string | null {
      const v = finitePos(metres);
      if (v == null) return null;
      return metric ? `${Math.round(v).toLocaleString('en-US')} m` : `${Math.round(v / M_PER_YD).toLocaleString('en-US')} yd`;
    },
    /** Whole mi / km, or null under `minUnits` of the athlete's unit: the Week bar's "18 mi". */
    distanceWhole(metres: number | null | undefined, minUnits = 0): string | null {
      const v = Number(metres);
      if (!Number.isFinite(v)) return null;
      const u = metric ? v / 1000 : v / M_PER_MI;
      if (u < minUnits) return null;
      return `${u.toFixed(0)} ${metric ? 'km' : 'mi'}`;
    },
    /** Speed to one decimal with a whole number printed bare: "18 mph" · "18.4 mph" · "29.6 km/h". */
    speedFromMpsShort(mps: number | null | undefined): string | null {
      const v = finitePos(mps);
      if (v == null) return null;
      const n = metric ? v * 3.6 : (v * 3600) / M_PER_MI;
      return `${Math.round(n * 10) / 10} ${metric ? 'km/h' : 'mph'}`;
    },
    /** A lift's weight moved, whole, with en-US thousands commas: "3,725 lb" · "1,690 kg". */
    weightGrouped(lb: number | null | undefined): string | null {
      const v = finitePos(lb);
      if (v == null) return null;
      return `${Math.round(metric ? v * KG_PER_LB : v).toLocaleString('en-US')} ${metric ? 'kg' : 'lb'}`;
    },
  };
}
export type DisplayFormat = ReturnType<typeof displayFormat>;

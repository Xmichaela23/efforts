import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * ═══ EVERY NUMBER ADJUST AND PROFILE PRINT, AS THE SERVER SENDS THEM ═══
 *
 * ⛔ THE PHONE WORKS OUT NONE OF THEM (2026-09-10 for the zone rows, audit H-B04–H-B06; the whole
 * readout 2026-09-15, one-truth workorder Stage 4 session 1). `save-baselines` (`{ zones: true }`)
 * returns the power rows at the FTP it applies, the swim pace bands, the easy heart-rate band, and
 * `readout` — the lifts, FTP, threshold pace, threshold / max / resting heart rate, the easy range,
 * the 5K, the zone tables, age / height / weight and the day a retest lands on. Every row arrives as
 * the finished pill text, ALREADY IN THE ATHLETE'S UNIT, with its label, its note and its
 * auto / my-number switch. A failed read prints nothing rather than a phone-built anything.
 *
 * ⚠️ READS THE STORED ROW, so a screen calls `refresh` after its save lands. Every `save-baselines`
 * response also carries the rebuilt `zones`, so a screen that saves can paint from the reply instead.
 * ⚠️ SENDS THE PHONE'S LOCAL DATE. `toISOString()` is UTC and reads as tomorrow after 5 pm Pacific,
 * which dated a retest a day ahead; `en-CA` prints YYYY-MM-DD in local time (the same read
 * `fetch-arc-context.ts` makes, §8.0 #42).
 */
export type PowerZoneRow = { name: string; low_w: number | null; high_w: number | null; range: string };
export type SwimPaceBandRow = { label: string; range: string; anchor: boolean };

/** One row as the screens draw it. `value` is the pill text; `raw` seeds the edit box. */
export type BaselineReadoutRow = {
  value: string | null;
  raw: number | null;
  hint: string;
  note: string | null;
  mine: boolean;
};

/** A measured number waiting to be accepted. `accept_value` is what `acceptMeasuredNumber` is called with. */
export type BaselineProposal = { text: string; button: string; accept_value: number };

export type ZoneTable = { rows: Array<{ name: string; range: string }>; basis: string; empty: string };

export type LiftReadoutRow = { key: string; label: string; row: BaselineReadoutRow };

export type BaselinesReadout = {
  units: 'metric' | 'imperial';
  you: { age: BaselineReadoutRow; height: BaselineReadoutRow; weight: BaselineReadoutRow; units_label: string };
  strength: { lifts: LiftReadoutRow[] };
  run: {
    threshold: BaselineReadoutRow;
    threshold_proposal: BaselineProposal | null;
    easy: BaselineReadoutRow;
    lthr: BaselineReadoutRow;
    max_hr: BaselineReadoutRow;
    resting_hr: BaselineReadoutRow;
    five_k: BaselineReadoutRow;
    zones: ZoneTable;
  };
  bike: {
    ftp: BaselineReadoutRow;
    ftp_proposal: BaselineProposal | null;
    lthr: BaselineReadoutRow;
    max_hr: BaselineReadoutRow;
    resting_hr: BaselineReadoutRow;
    zones: ZoneTable;
  };
  swim: { threshold_100: BaselineReadoutRow };
  retest: { date: string };
};

export type BaselineZones = {
  power: { ftp: number; rows: PowerZoneRow[] } | null;
  swim_pace: { threshold_100: string; rows: SwimPaceBandRow[] } | null;
  run_easy_hr: { floor: number; ceiling: number; anchor: string; basis: string } | null;
  readout: BaselinesReadout | null;
};

/** The athlete's own calendar day, not UTC. */
export const localToday = (): string => new Date().toLocaleDateString('en-CA');

export function useBaselineZones(): {
  zones: BaselineZones | null;
  readout: BaselinesReadout | null;
  refresh: () => Promise<void>;
  /** Paint from a `save-baselines` reply instead of asking again. */
  apply: (zones: unknown) => void;
} {
  const [zones, setZones] = useState<BaselineZones | null>(null);
  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('save-baselines', {
        body: { zones: true, today: localToday() },
      });
      setZones(!error && data?.success ? ((data.zones ?? null) as BaselineZones | null) : null);
    } catch {
      setZones(null);
    }
  }, []);
  const apply = useCallback((next: unknown) => {
    if (next && typeof next === 'object') setZones(next as BaselineZones);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { zones, readout: zones?.readout ?? null, refresh, apply };
}

export default useBaselineZones;

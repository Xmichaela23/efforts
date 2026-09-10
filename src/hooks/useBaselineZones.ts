import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * ═══ THE ZONE ROWS PROFILE AND WELCOME PRINT, AS THE SERVER SENDS THEM (2026-09-10, audit H-B04–H-B06) ═══
 *
 * ⛔ THE PHONE BUILDS NO ZONE. `save-baselines` (`{ zones: true }`) returns the power rows at the FTP it
 * applies, the swim pace bands from the stored threshold 100 pace, and the easy heart-rate band from
 * `resolveRunEasyHrBand`. A failed read prints nothing rather than a phone-built table.
 * ⚠️ READS THE STORED ROW, so a screen calls `refresh` after its save lands.
 */
export type PowerZoneRow = { name: string; low_w: number | null; high_w: number | null; range: string };
export type SwimPaceBandRow = { label: string; range: string; anchor: boolean };
export type BaselineZones = {
  power: { ftp: number; rows: PowerZoneRow[] } | null;
  swim_pace: { threshold_100: string; rows: SwimPaceBandRow[] } | null;
  run_easy_hr: { floor: number; ceiling: number; anchor: string; basis: string } | null;
};

export function useBaselineZones(): { zones: BaselineZones | null; refresh: () => Promise<void> } {
  const [zones, setZones] = useState<BaselineZones | null>(null);
  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('save-baselines', { body: { zones: true } });
      setZones(!error && data?.success ? ((data.zones ?? null) as BaselineZones | null) : null);
    } catch {
      setZones(null);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { zones, refresh };
}

export default useBaselineZones;

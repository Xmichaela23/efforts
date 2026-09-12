// ⛔ ONE TYPED-IN ENTRY FOR RUN, RIDE AND SWIM (Michael, 2026-09-12: "no sensors, it's all reported…
// see what other apps do… have the user report it… then it should go through the large analysis").
//
// What this replaced: `ManualSwimEntry.tsx` (D-174, swim only) and, for run and ride, the Log menu
// opening `WorkoutBuilder` — which builds a PLANNED session ("Save planned workout") and never logged
// anything. Same fields as Strava's manual activity: distance, time, date. Pool only on a swim.
//
// It inserts a COMPLETED row (source='manual') in the same shape ingest writes — distance in km,
// duration / moving_time in minutes — then hands it to `recompute-workout`, the single ordered
// orchestrator, so the session reaches Performance, State and the spine like an import does.
// The existing post-workout popup (D-162) handles RPE / feel / gear afterwards.

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { useToast } from './ui/use-toast';
import { useAppContext } from '@/contexts/AppContext';
import { getDisciplineColorRgb } from '@/lib/context-utils';
import { readoutPlateStyle } from '@/lib/readout-plate';
import EffortScale from '@/components/ui/effort-scale';

export type ManualEntryType = 'run' | 'ride' | 'swim';

const POOL_OPTIONS: Array<{ value: string; label: string; unit: 'yd' | 'm'; meters: number }> = [
  { value: '25yd', label: '25 yd', unit: 'yd', meters: 22.86 },
  { value: '25m', label: '25 m', unit: 'm', meters: 25 },
  { value: '50m', label: '50 m', unit: 'm', meters: 50 },
];

const WORDS: Record<ManualEntryType, { title: string; button: string; name: string; logged: string; failed: string }> = {
  run: { title: 'Log a run', button: 'Log run', name: 'Run', logged: 'Run logged', failed: 'Could not log run' },
  ride: { title: 'Log a ride', button: 'Log ride', name: 'Ride', logged: 'Ride logged', failed: 'Could not log ride' },
  swim: { title: 'Log a swim', button: 'Log swim', name: 'Swim', logged: 'Swim logged', failed: 'Could not log swim' },
};

export default function ManualEntry({ type, date, onClose, onSaved }: {
  type: ManualEntryType;
  date?: string;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { toast } = useToast();
  const { useImperial } = useAppContext();
  const today = date || new Date().toLocaleDateString('en-CA');
  const isSwim = type === 'swim';
  // Swim distances are yards or metres; run and ride follow the athlete's own unit setting.
  const [unit, setUnit] = useState<'yd' | 'm' | 'mi' | 'km'>(isSwim ? 'yd' : (useImperial ? 'mi' : 'km'));
  const [distance, setDistance] = useState<string>('');
  const [mins, setMins] = useState<string>('');
  const [secs, setSecs] = useState<string>('');
  const [pool, setPool] = useState<string | null>(null);
  const [when, setWhen] = useState<string>(today);
  // ⛔ EFFORT ON THE FORM, OPTIONAL (Michael, 2026-09-12: "integrate"). The app's one effort scale,
  // the same face the post-workout popup wears. Set, it writes `workouts.rpe` with the row and the
  // popup has nothing to ask (its rule is rpe null). Left blank, the popup's rules apply as today.
  // TrainingPeaks and Strava both carry RPE on a manual entry.
  const [rpe, setRpe] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const rgb = getDisciplineColorRgb(type);
  const words = WORDS[type];

  const save = async () => {
    const distVal = Number(distance);
    const totalSec = (Number(mins) || 0) * 60 + (Number(secs) || 0);
    if (!(distVal > 0) || !(totalSec > 0)) {
      toast({ title: 'Add distance + time', description: 'Distance and a duration are required.', variant: 'destructive' });
      return;
    }
    const userId = getStoredUserId();
    if (!userId) { toast({ title: 'Not signed in', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const distKm = unit === 'yd' ? distVal * 0.0009144
        : unit === 'm' ? distVal / 1000
        : unit === 'mi' ? distVal * 1.609344
        : distVal;
      const movingMin = Math.round(totalSec / 60); // minutes — the same scalar ingest stores
      const row: Record<string, unknown> = {
        user_id: userId,
        type,
        source: 'manual',
        workout_status: 'completed',
        date: when,
        timestamp: `${when}T12:00:00Z`,
        name: words.name,
        distance: distKm,
        moving_time: movingMin,
        elapsed_time: movingMin, // typed in: no rest data, so elapsed = moving
        duration: movingMin,
      };
      if (rpe != null) row.rpe = rpe;
      if (isSwim) {
        const p = POOL_OPTIONS.find((o) => o.value === pool);
        if (p) {
          row.pool_unit = p.unit;
          row.pool_length_m = p.meters;
          row.user_corrected_pool_length_m = p.meters; // resolver tier-1 — the athlete stated it
          row.number_of_active_lengths = Math.round((distKm * 1000) / p.meters);
        }
      }
      const { data, error } = await supabase.from('workouts').insert(row).select('id').single();
      if (error) throw error;
      // A direct insert does not fire the ingest fan-out, so run the orchestrator with the user JWT:
      // summary, analysis, workload, facts, the sport analyzer, snapshot. Fire-and-forget.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token && data?.id) {
          void supabase.functions.invoke('recompute-workout', { body: { workout_id: data.id }, headers: { Authorization: `Bearer ${token}` } });
        }
      } catch { /* non-fatal — the session exists, just unprocessed */ }
      toast({ title: words.logged, variant: 'success' });
      try {
        window.dispatchEvent(new CustomEvent('workouts:invalidate'));
        window.dispatchEvent(new CustomEvent('week:invalidate'));
      } catch { /* */ }
      onSaved?.(String(data?.id || ''));
      onClose();
    } catch (e: unknown) {
      toast({ title: words.failed, description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full bg-white/[0.06] border border-white/15 rounded-xl px-3 py-2.5 text-white text-base font-light outline-none tabular-nums';
  const inputFocus = { ['--tw-ring-color' as string]: `rgba(${rgb},0.5)` } as React.CSSProperties;
  const labelCls = 'readout-label text-[12px] uppercase block mb-1.5';
  const pill = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '9px 0',
    fontSize: 14,
    fontWeight: 300,
    borderRadius: 12,
    border: `1px solid ${active ? `rgba(${rgb},0.55)` : 'rgba(255,255,255,0.15)'}`,
    background: active ? `rgba(${rgb},0.16)` : 'rgba(255,255,255,0.05)',
    color: active ? '#fff' : 'rgba(255,255,255,0.7)',
    transition: 'all 150ms',
  });
  const unitPair: Array<'yd' | 'm' | 'mi' | 'km'> = isSwim ? ['yd', 'm'] : ['mi', 'km'];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      {/* State's card, in the sport's colour: the same bed and plate every card in the app wears now,
          the labels reading in the discipline through `--card-accent-rgb`. */}
      <div
        className="relative w-full max-w-lg mx-3 mb-3 p-5 galaxy-card readout-texture readout-texture--spectral rounded-2xl animate-slide-up"
        style={{ ...readoutPlateStyle(rgb, { galaxy: true }), paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-light text-white">{words.title}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/70" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <label className={labelCls}>Distance</label>
        <div className="flex gap-2 mb-4">
          <input
            type="number" inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)}
            placeholder={isSwim ? 'e.g. 1200' : 'e.g. 5'}
            className={`${inputCls} flex-1 focus:ring-1`} style={inputFocus}
          />
          <div className="flex gap-1 w-[120px]">
            {unitPair.map((u) => (
              <button key={u} type="button" onClick={() => setUnit(u)} style={pill(unit === u)}>{u}</button>
            ))}
          </div>
        </div>

        <label className={labelCls}>Time</label>
        <div className="flex items-center gap-2 mb-4">
          <input type="number" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value)} placeholder="min"
            className={`${inputCls} flex-1 focus:ring-1`} style={inputFocus} />
          <span className="text-white/40">:</span>
          <input type="number" inputMode="numeric" value={secs} onChange={(e) => setSecs(e.target.value)} placeholder="sec"
            className={`${inputCls} flex-1 focus:ring-1`} style={inputFocus} />
        </div>

        {isSwim && (
          <>
            <label className={labelCls}>Pool <span className="normal-case tracking-normal text-white/40">(optional — enables lengths)</span></label>
            <div className="flex gap-2 mb-4">
              {POOL_OPTIONS.map((o) => (
                <button key={o.value} type="button" onClick={() => setPool(o.value === pool ? null : o.value)} style={pill(pool === o.value)}>{o.label}</button>
              ))}
            </div>
          </>
        )}

        <label className={labelCls}>Date</label>
        <input type="date" value={when} onChange={(e) => setWhen(e.target.value)}
          className={`${inputCls} mb-4 [color-scheme:dark] focus:ring-1`} style={inputFocus} />

        <div className="mb-5">
          <EffortScale sport={type === 'ride' ? 'bike' : type} value={rpe} onChange={setRpe} />
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full h-12 rounded-full text-base font-light text-white disabled:opacity-50 transition-all"
          style={{ background: `rgba(${rgb},0.18)`, border: `1px solid rgba(${rgb},0.5)`, boxShadow: `0 0 24px rgba(${rgb},0.12)` }}
        >
          {saving ? 'Logging…' : words.button}
        </button>
      </div>
    </div>
  );
}

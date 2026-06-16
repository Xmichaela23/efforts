// D-174 — dead-simple MANUAL swim entry (the "Log on planned session screen" the swim matrix points to).
// Courtesy tier: distance + time, pool optional. Inserts a COMPLETED swim (source='manual'); the existing
// post-workout popup (D-162) handles optional RPE/feel/equipment enrichment later. NOT WorkoutBuilder
// (that makes *planned* workouts). One screen. Spec: docs/SPEC-swim-source-tiers.md.

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { useToast } from './ui/use-toast';
import { Button } from './ui/button';

const POOL_OPTIONS: Array<{ value: string; label: string; unit: 'yd' | 'm'; meters: number }> = [
  { value: '25yd', label: '25 yd', unit: 'yd', meters: 22.86 },
  { value: '25m', label: '25 m', unit: 'm', meters: 25 },
  { value: '50m', label: '50 m', unit: 'm', meters: 50 },
];

export default function ManualSwimEntry({ date, onClose, onSaved }: { date?: string; onClose: () => void; onSaved?: (id: string) => void }) {
  const { toast } = useToast();
  const today = date || new Date().toISOString().slice(0, 10);
  const [unit, setUnit] = useState<'yd' | 'm'>('yd');
  const [distance, setDistance] = useState<string>('');
  const [mins, setMins] = useState<string>('');
  const [secs, setSecs] = useState<string>('');
  const [pool, setPool] = useState<string | null>(null);
  const [when, setWhen] = useState<string>(today);
  const [saving, setSaving] = useState(false);

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
      const distM = unit === 'yd' ? distVal * 0.9144 : distVal;
      const movingMin = Math.round(totalSec / 60); // minutes — the swim moving_time storage convention
      const p = POOL_OPTIONS.find((o) => o.value === pool);
      const row: Record<string, any> = {
        user_id: userId,
        type: 'swim',
        source: 'manual',
        workout_status: 'completed',
        date: when,
        timestamp: `${when}T12:00:00Z`,
        name: 'Swim',
        distance: distM / 1000, // km
        moving_time: movingMin,
        elapsed_time: movingMin, // manual: no rest data → elapsed = moving
        duration: movingMin,
      };
      if (p) {
        row.pool_unit = p.unit;
        row.pool_length_m = p.meters;
        row.user_corrected_pool_length_m = p.meters; // resolver tier-1 — the athlete stated it
        row.number_of_active_lengths = Math.round(distM / p.meters);
      }
      const { data, error } = await supabase.from('workouts').insert(row).select('id').single();
      if (error) throw error;
      // A direct insert doesn't fire the ingest fan-out, so process the swim (compute-facts/summary +
      // analyze-swim-workout) with the user JWT so the Performance/Details tabs populate. Fire-and-forget.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token && data?.id) {
          supabase.functions.invoke('recompute-workout', { body: { workout_id: data.id }, headers: { Authorization: `Bearer ${token}` } });
        }
      } catch { /* non-fatal — the swim still exists, just unprocessed */ }
      toast({ title: 'Swim logged', variant: 'success' });
      try {
        window.dispatchEvent(new CustomEvent('workouts:invalidate'));
        window.dispatchEvent(new CustomEvent('week:invalidate'));
      } catch { /* */ }
      onSaved?.(String(data?.id || ''));
      onClose();
    } catch (e: any) {
      toast({ title: 'Could not log swim', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const pill = (active: boolean) =>
    `flex-1 py-2.5 text-sm font-light rounded-lg border-2 transition-all ${
      active ? 'bg-white/[0.15] border-sky-400/50 text-white' : 'bg-white/[0.08] border-white/20 text-white/70 hover:text-white/90'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 mb-4 p-6 rounded-2xl bg-[#0d1117]/95 backdrop-blur-xl border-2 border-white/15 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-light text-white">Log a swim</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/70"><X className="h-5 w-5" /></button>
        </div>

        {/* Distance */}
        <label className="text-sm font-light text-white/70 mb-1.5 block">Distance</label>
        <div className="flex gap-2 mb-4">
          <input
            type="number" inputMode="numeric" value={distance} onChange={(e) => setDistance(e.target.value)}
            placeholder="e.g. 1200"
            className="flex-1 bg-white/[0.06] border-2 border-white/15 rounded-lg px-3 py-2.5 text-white text-base font-light focus:border-sky-400/50 outline-none"
          />
          <div className="flex gap-1 w-[120px]">
            <button onClick={() => setUnit('yd')} className={pill(unit === 'yd')}>yd</button>
            <button onClick={() => setUnit('m')} className={pill(unit === 'm')}>m</button>
          </div>
        </div>

        {/* Time */}
        <label className="text-sm font-light text-white/70 mb-1.5 block">Time</label>
        <div className="flex items-center gap-2 mb-4">
          <input type="number" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value)} placeholder="min"
            className="flex-1 bg-white/[0.06] border-2 border-white/15 rounded-lg px-3 py-2.5 text-white text-base font-light focus:border-sky-400/50 outline-none" />
          <span className="text-white/40">:</span>
          <input type="number" inputMode="numeric" value={secs} onChange={(e) => setSecs(e.target.value)} placeholder="sec"
            className="flex-1 bg-white/[0.06] border-2 border-white/15 rounded-lg px-3 py-2.5 text-white text-base font-light focus:border-sky-400/50 outline-none" />
        </div>

        {/* Pool (optional) */}
        <label className="text-sm font-light text-white/70 mb-1.5 block">Pool <span className="text-xs text-white/40">(optional — enables lengths)</span></label>
        <div className="flex gap-2 mb-4">
          {POOL_OPTIONS.map((o) => (
            <button key={o.value} onClick={() => setPool(o.value === pool ? null : o.value)} className={pill(pool === o.value)}>{o.label}</button>
          ))}
        </div>

        {/* Date */}
        <label className="text-sm font-light text-white/70 mb-1.5 block">Date</label>
        <input type="date" value={when} onChange={(e) => setWhen(e.target.value)}
          className="w-full bg-white/[0.06] border-2 border-white/15 rounded-lg px-3 py-2.5 text-white text-base font-light focus:border-sky-400/50 outline-none mb-5 [color-scheme:dark]" />

        <Button onClick={save} disabled={saving} className="w-full font-light bg-sky-500/70 hover:bg-sky-500/80 border-2 border-sky-400/60 text-white">
          {saving ? 'Logging…' : 'Log swim'}
        </Button>
      </div>
    </div>
  );
}

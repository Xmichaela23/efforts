import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';

type Props = {
  workout: any; // completed workout
  open: boolean;
  onClose: () => void;
  onAssociated?: (plannedId: string) => void;
};

export default function AssociatePlannedDialog({ workout, open, onClose, onAssociated }: Props) {
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const windowDays = 7; // Increased from 3 to 7 days to catch more planned workouts

  const searchForCandidates = async () => {
      try {
        setLoading(true);
        setError(null);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setCandidates([]); setLoading(false); return; }

        const type = String(workout?.type || '').toLowerCase();
        const d = String(workout?.date || '').slice(0,10);
        const toIso = (base: string, delta: number) => {
          const p = base.split('-').map((x)=>parseInt(x,10));
          const js = new Date(p[0], (p[1]||1)-1, p[2]||1);
          js.setDate(js.getDate()+delta);
          const y = js.getFullYear();
          const m = String(js.getMonth()+1).padStart(2,'0');
          const dd = String(js.getDate()).padStart(2,'0');
          return `${y}-${m}-${dd}`;
        };
        const from = toIso(d, -windowDays);
        const to = toIso(d, windowDays);

        const { data } = await supabase
          .from('planned_workouts')
          .select('id,name,type,date,week_number,day_number,workout_status,training_plan_id')
          .eq('user_id', user.id)
          .eq('type', type)
          .in('workout_status', ['planned','in_progress','completed'])
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: true });

        console.log('🔍 AssociatePlannedDialog search results:', {
          type,
          date: d,
          from,
          to,
          candidates: data,
          count: Array.isArray(data) ? data.length : 0,
          workoutObject: workout,
          workoutType: workout?.type,
          workoutDate: workout?.date
        });


        // Determine which planned rows are already linked using workouts.planned_id
        const plannedIds = (Array.isArray(data) ? data : []).map((p:any)=>p.id);
        const { data: linked } = plannedIds.length ? await supabase
          .from('workouts')
          .select('id,planned_id')
          .eq('user_id', user.id)
          .in('planned_id', plannedIds)
          : { data: [] as any[] } as any;
        const usedBy = new Map<string,string>();
        (Array.isArray(linked)?linked:[]).forEach((w:any)=>{ if (w?.planned_id) usedBy.set(String(w.planned_id), String(w.id)); });

        // Filter out planned rows used by a different completed workout. Allow re-association to this workout.
        const filteredCandidates = (Array.isArray(data) ? data : []).filter((planned:any) => {
          const usedById = usedBy.get(String(planned.id));
          if (usedById && usedById !== String(workout?.id||'')) return false;
          return true;
        });

        console.log('🔍 Filtered candidates:', {
          original: data?.length || 0,
          filtered: filteredCandidates.length,
          candidates: filteredCandidates
        });

        setCandidates(filteredCandidates);
      } catch (e: any) {
        setError(e?.message || 'Failed to load candidates');
      } finally {
        setLoading(false);
      }
  };

  useEffect(() => {
    if (!open) return;
    searchForCandidates();
  }, [open, workout?.id]);

  const associate = async (planned: any) => {
    try {
      setLoading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      // Ensure we have a persisted workouts row. If this is a provider-only item (e.g., garmin_*, strava_*),
      // create a workouts row first so we can link both sides.
      let completedId: string = String(workout?.id || '');
      const isProviderOnly = /^garmin_/i.test(completedId) || /^strava_/i.test(completedId);
      if (isProviderOnly) {
        const toSave: any = {
          name: workout?.name || 'Imported Activity',
          type: String(workout?.type || 'run'),
          date: String(workout?.date || new Date().toISOString().slice(0,10)),
          duration: Math.round(Number(workout?.duration || (workout?.moving_time || workout?.total_timer_time || 0)/60) || 0),
          description: workout?.description || '',
          usercomments: '',
          completedmanually: false,
          workout_status: 'completed',
          intervals: JSON.stringify([]),
          strength_exercises: JSON.stringify([]),
          user_id: user.id,
          avg_heart_rate: workout?.avg_heart_rate ?? null,
          max_heart_rate: workout?.max_heart_rate ?? null,
          avg_power: workout?.avg_power ?? null,
          max_power: workout?.max_power ?? null,
          normalized_power: workout?.normalized_power ?? null,
          avg_speed: workout?.avg_speed ?? null,
          max_speed: workout?.max_speed ?? null,
          avg_cadence: workout?.avg_cadence ?? null,
          max_cadence: workout?.max_cadence ?? null,
          elevation_gain: workout?.elevation_gain ?? null,
          elevation_loss: workout?.elevation_loss ?? null,
          calories: workout?.calories ?? null,
          distance: workout?.distance ?? null,
          timestamp: workout?.timestamp ?? null,
          start_position_lat: workout?.start_position_lat ?? null,
          start_position_long: workout?.start_position_long ?? null,
          friendly_name: workout?.friendly_name || null,
          moving_time: typeof workout?.moving_time === 'number' ? Math.round(workout.moving_time) : null,
          elapsed_time: typeof workout?.elapsed_time === 'number' ? Math.round(workout.elapsed_time) : null,
          total_timer_time: typeof workout?.total_timer_time === 'number' ? Math.round(workout.total_timer_time) : null,
          total_elapsed_time: typeof workout?.total_elapsed_time === 'number' ? Math.round(workout.total_elapsed_time) : null,
          gps_track: workout?.gps_track ? JSON.stringify(workout.gps_track) : null,
          sensor_data: workout?.sensor_data ? JSON.stringify(workout.sensor_data) : null,
        };
        const { data: inserted, error: insErr } = await supabase
          .from('workouts')
          .insert([toSave])
          .select()
          .single();
        if (insErr) throw insErr;
        completedId = inserted.id as string;
      }

      // Server attach path (explicit planned) → materialize → attach → compute
      try {
        const { data, error } = await supabase.functions.invoke('auto-attach-planned', { body: { workout_id: completedId, planned_id: String(planned?.id || '') } as any });
        console.log('[associate] auto-attach-planned response:', data, error);
        if (error) throw error as any;
        if (!(data as any)?.success) {
          console.error('[associate] auto-attach-planned returned non-success:', data);
        }
      } catch (e) {
        console.error('[associate] auto-attach-planned failed:', e);
      }
      try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
      try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
      onAssociated?.(planned.id);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to associate');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-4 space-y-3">
        <div className="text-lg font-semibold">Associate with planned…</div>
        <div className="text-sm text-gray-600">{String(workout?.name || '')} • {workout?.date}</div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        {loading ? (
          <div className="text-sm text-gray-600">Loading…</div>
        ) : candidates.length === 0 ? (
          <div className="text-sm text-gray-600">No matching planned rows in ±{windowDays} days.</div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-auto">
            {candidates.map((p) => (
              <button key={p.id} onClick={() => associate(p)} className="w-full text-left border rounded p-2 hover:bg-gray-50">
                <div className="text-sm font-medium">{p.date} — {p.name || p.type}</div>
                <div className="text-xs text-gray-600">Week {p.week_number}, Day {p.day_number}</div>
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-between gap-2 pt-2">
          <Button 
            variant="ghost" 
            onClick={searchForCandidates} 
            disabled={loading}
            size="sm"
          >
            Refresh
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}



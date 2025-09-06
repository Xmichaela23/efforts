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

  const windowDays = 3;

  useEffect(() => {
    if (!open) return;
    (async () => {
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
          .in('workout_status', ['planned','in_progress'])
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: true });

        setCandidates(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setError(e?.message || 'Failed to load candidates');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, workout?.id]);

  const associate = async (planned: any) => {
    try {
      setLoading(true);
      setError(null);
      // Flip planned to completed and link ids
      await supabase.from('planned_workouts')
        .update({ workout_status: 'completed', completed_workout_id: workout.id })
        .eq('id', planned.id);
      await supabase.from('workouts')
        .update({ planned_id: planned.id })
        .eq('id', workout.id);
      try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
      onAssociated?.(planned.id);
      // Also update the resolved view users by emitting invalidate
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
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}



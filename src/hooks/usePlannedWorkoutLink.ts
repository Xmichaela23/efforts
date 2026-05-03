import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '@/lib/supabase';

function readStepsPreset(src: unknown): string[] | undefined {
  try {
    if (Array.isArray(src)) return src as string[];
    if (src && typeof src === 'object') return src as string[];
    if (typeof src === 'string' && src.trim().length) {
      const parsed = JSON.parse(src);
      return Array.isArray(parsed) ? (parsed as string[]) : undefined;
    }
  } catch {
    /* steps_preset not valid JSON — ignore */
  }
  return undefined;
}

/**
 * Planned-workout link state for UnifiedWorkoutView: synced `planned_id`, linked row fetch,
 * and Planned-tab hydration. Summary-tab readiness is handled server-side via `ensure-planned-ready`.
 *
 * `unifiedWorkout` must match the parent’s derived row — `updatedWorkoutData || unifiedWorkout` drives
 * `currentPlannedId` sync; for non-completed sessions that differs from `workout`.
 */
export function usePlannedWorkoutLink({
  workout,
  isCompleted,
  activeTab,
  updatedWorkoutData,
  unifiedWorkout,
}: {
  workout: any;
  isCompleted: boolean;
  activeTab: string;
  updatedWorkoutData: any | null;
  /** Same as UnifiedWorkoutView `unifiedWorkout` (week mapping / refresh). */
  unifiedWorkout: any;
}): {
  linkedPlanned: any | null;
  setLinkedPlanned: Dispatch<SetStateAction<any | null>>;
  hydratedPlanned: any | null;
  setHydratedPlanned: Dispatch<SetStateAction<any | null>>;
  currentPlannedId: string | null;
  isLinked: boolean;
} {
  const [currentPlannedId, setCurrentPlannedId] = useState<string | null>((workout as any)?.planned_id || null);
  const [linkedPlanned, setLinkedPlanned] = useState<any | null>(null);
  const [hydratedPlanned, setHydratedPlanned] = useState<any | null>(null);

  // Fetch current planned_id from database to ensure we have the latest state
  useEffect(() => {
    const sourceWorkout = updatedWorkoutData || unifiedWorkout;
    const plannedId = (sourceWorkout as any)?.planned_id || null;
    setCurrentPlannedId(plannedId);
  }, [(unifiedWorkout as any)?.planned_id, updatedWorkoutData?.planned_id]);

  // Resolve linked planned row for completed workouts
  useEffect(() => {
    (async () => {
      if (!isCompleted) {
        setLinkedPlanned(null);
        return;
      }

      const sourceWorkout = updatedWorkoutData || workout;

      const pid = (sourceWorkout as any)?.planned_id as string | undefined || currentPlannedId;
      if (pid) {
        try {
          const { data: plannedRow } = await supabase
            .from('planned_workouts')
            .select('*')
            .eq('id', pid)
            .maybeSingle();
          if (plannedRow) {
            setLinkedPlanned(plannedRow);
            return;
          }
        } catch (e) {
          console.warn('[UnifiedWorkoutView] fetch linked planned_workout failed:', e);
        }
        return;
      }

      setLinkedPlanned(null);
    })();
  }, [isCompleted, workout?.id, (workout as any)?.planned_id, updatedWorkoutData?.planned_id, currentPlannedId]);

  // Hydrate planned rows (expand tokens → resolve targets → persist computed + duration) before rendering Planned tab
  useEffect(() => {
    (async () => {
      try {
        if (activeTab !== 'planned') return;
        const plannedRow = isCompleted ? (linkedPlanned || null) : (workout?.workout_status === 'planned' ? workout : null);
        if (!plannedRow || !plannedRow.id) {
          setHydratedPlanned(null);
          return;
        }

        // If already hydrated (v3 with steps and total), use it
        const hasV3 = (() => {
          try {
            return (
              Array.isArray(plannedRow?.computed?.steps) &&
              plannedRow.computed.steps.length > 0 &&
              Number(plannedRow?.computed?.total_duration_seconds) > 0
            );
          } catch {
            return false;
          }
        })();
        let stepsPreset = readStepsPreset((plannedRow as any).steps_preset);
        // Fetch latest row (in case caller provided a minimal object)
        let row = plannedRow;
        try {
          const { data } = await supabase.from('planned_workouts').select('*').eq('id', String(plannedRow.id)).maybeSingle();
          if (data) {
            row = data;
            stepsPreset = readStepsPreset((data as any).steps_preset) ?? stepsPreset;
          }
        } catch (e) {
          console.warn('[UnifiedWorkoutView] planned tab: refresh planned_workout row failed:', e);
        }

        const rowHasV3 = (() => {
          try {
            return (
              Array.isArray((row as any)?.computed?.steps) &&
              (row as any).computed.steps.length > 0 &&
              Number((row as any)?.computed?.total_duration_seconds) > 0
            );
          } catch {
            return false;
          }
        })();
        const isStrength = String((row as any)?.type || '').toLowerCase() === 'strength';

        if (isStrength && !rowHasV3) {
          try {
            const pid = String(row.id);
            await supabase.functions.invoke('materialize-plan', { body: { planned_workout_id: pid } });
            const { data: refreshed } = await supabase.from('planned_workouts').select('*').eq('id', pid).maybeSingle();
            if (refreshed) {
              setHydratedPlanned(refreshed);
              setTimeout(() => {
                try {
                  window.dispatchEvent(new CustomEvent('planned:invalidate'));
                } catch (e) {
                  console.warn('[UnifiedWorkoutView] planned:invalidate dispatch failed:', e);
                }
              }, 100);
              return;
            }
          } catch (e) {
            console.warn('[UnifiedWorkoutView] strength materialize on planned tab failed:', e);
          }
        }

        if (!rowHasV3) {
          try {
            const pid = String((row as any)?.id || '');
            if (pid) {
              await supabase.functions.invoke('materialize-plan', { body: { planned_workout_id: pid } });
              const { data: refreshed } = await supabase.from('planned_workouts').select('*').eq('id', pid).maybeSingle();
              if (refreshed) {
                setHydratedPlanned(refreshed);
                setTimeout(() => {
                  try {
                    window.dispatchEvent(new CustomEvent('planned:invalidate'));
                  } catch (e) {
                    console.warn('[UnifiedWorkoutView] planned:invalidate dispatch failed:', e);
                  }
                }, 100);
                return;
              }
            }
          } catch (err) {
            console.warn('[UnifiedWorkoutView] Server materialization failed:', err);
          }
        }
        setHydratedPlanned(row);
      } catch (e) {
        console.warn('[UnifiedWorkoutView] planned tab hydrate effect failed:', e);
        setHydratedPlanned(null);
      }
    })();
  }, [activeTab, workout?.id, linkedPlanned?.id]);

  const isLinked = useMemo(() => {
    const sourceWorkout = updatedWorkoutData || workout;
    return (
      Boolean((sourceWorkout as any)?.planned_id) ||
      Boolean(currentPlannedId) ||
      Boolean(linkedPlanned?.id)
    );
  }, [updatedWorkoutData, workout, currentPlannedId, linkedPlanned]);

  return { linkedPlanned, setLinkedPlanned, hydratedPlanned, setHydratedPlanned, currentPlannedId, isLinked };
}

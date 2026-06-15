import React, { useState, useEffect } from 'react';
import { X, Activity, Bike, Plus, Waves } from 'lucide-react';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { SPORT_COLORS } from '@/lib/context-utils';
import { Button } from './ui/button';
import { useToast } from './ui/use-toast';
import { useAppContext } from '@/contexts/AppContext';
import { parseLocalDate } from '@/lib/dateUtils';
import MapEffort from './MapEffort';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface GearItem {
  id: string;
  type: 'shoe' | 'bike';
  name: string;
  brand?: string;
  model?: string;
  is_default: boolean;
}

// Pool options (D-162). pool_length stored in METRES to match the HealthKit path (Q-060 deferred).
const POOL_OPTIONS: Array<{ value: string; label: string; meters: number }> = [
  { value: '25yd', label: '25 yd', meters: 22.86 },
  { value: '25m', label: '25 m', meters: 25 },
  { value: '50m', label: '50 m', meters: 50 },
];

// Unplanned-swim equipment multi-select fallback (session-level tag).
const UNPLANNED_EQUIP = ['Fins', 'Pull buoy', 'Snorkel', 'Paddles'];

interface PostWorkoutFeedbackProps {
  workoutId: string;
  workoutType: 'run' | 'ride' | 'swim';
  workoutName?: string;
  // Existing values for editing
  existingGearId?: string | null;
  existingRpe?: number | null;
  existingFeeling?: string | null;
  // Callbacks
  onSave?: (data: { gear_id?: string; rpe?: number; feeling?: string }) => void;
  onClose?: () => void;
  onSkip?: () => void;
  onAddGear?: () => void; // Callback to open gear management
  // Display mode
  mode?: 'popup' | 'inline';  // popup = modal overlay, inline = embedded in view
}

const FEELING_OPTIONS = [
  { value: 'great', label: 'Great', description: 'Strong and recovered' },
  { value: 'good', label: 'Good', description: 'Solid effort' },
  { value: 'ok', label: 'OK', description: 'Average day' },
  { value: 'tired', label: 'Tired', description: 'Fatigued but finished' },
  { value: 'exhausted', label: 'Exhausted', description: 'Really pushed it' },
];

const RPE_DESCRIPTIONS: Record<number, string> = {
  1: 'Very light',
  2: 'Light',
  3: 'Moderate',
  4: 'Somewhat hard',
  5: 'Hard',
  6: 'Hard',
  7: 'Very hard',
  8: 'Very hard',
  9: 'Extremely hard',
  10: 'Max effort',
};

export default function PostWorkoutFeedback({
  workoutId,
  workoutType,
  workoutName,
  existingGearId,
  existingRpe,
  existingFeeling,
  onSave,
  onClose,
  onSkip,
  onAddGear,
  mode = 'popup',
}: PostWorkoutFeedbackProps) {
  const { toast } = useToast();
  const { useImperial } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gear, setGear] = useState<GearItem[]>([]);
  const [workoutData, setWorkoutData] = useState<any>(null); // Distance, GPS track, etc.
  
  // Form state - pre-select default gear if no existing gear_id
  const [selectedGearId, setSelectedGearId] = useState<string | null>(existingGearId || null);
  const [selectedRpe, setSelectedRpe] = useState<number | null>(existingRpe || null);
  const [selectedFeeling, setSelectedFeeling] = useState<string | null>(existingFeeling || null);

  // Swim-only state (D-162)
  const isSwim = workoutType === 'swim';
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  // Prescribed equipment read from the LINKED PLANNED swim — BOTH per-step required (step.equipment)
  // AND session-level suggested/optional (computed.swim_equipment_suggested / _optional_suggested,
  // where drills like catch-up surface snorkel/fins). step_index is null for session-level items.
  const [prescribedEquip, setPrescribedEquip] = useState<Array<{ id: string; equipment: string; prompt: string; step_index: number | null }>>([]);
  // id → used (true=Yes, false=No; absent=Skip) for the per-item confirmation.
  const [equipConfirms, setEquipConfirms] = useState<Record<string, boolean>>({});
  // Fallback multi-select when the plan prescribed nothing (or unplanned swim).
  const [unplannedEquip, setUnplannedEquip] = useState<Set<string>>(new Set());

  const gearType = workoutType === 'run' ? 'shoe' : 'bike';
  const sportColor = isSwim ? SPORT_COLORS.swim : workoutType === 'run' ? SPORT_COLORS.run : SPORT_COLORS.cycling;
  const SportIcon = isSwim ? Waves : workoutType === 'run' ? Activity : Bike;

  // Extract RGB from sport color for gradient
  const getRgbFromColor = (color: string): string => {
    // Handle hex colors like #FF5733 or rgb(255, 87, 51)
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `${r}, ${g}, ${b}`;
    }
    // Default fallback
    return '255, 87, 51';
  };
  const rgb = getRgbFromColor(sportColor);

  useEffect(() => {
    loadGear();
    loadWorkoutData();
  }, []);

  // Reload gear when workoutId changes (popup shown for different workout)
  // This also handles the case where gear was added and popup is re-shown
  useEffect(() => {
    loadGear();
    loadWorkoutData();
  }, [workoutId]);

  // Update selectedGearId when gear loads and default is available
  useEffect(() => {
    // If no existing gear_id and gear is loaded, pre-select default for quick save
    if (!existingGearId && gear.length > 0 && !selectedGearId) {
      const defaultGear = gear.find(g => g.is_default);
      if (defaultGear) {
        setSelectedGearId(defaultGear.id);
      }
    }
  }, [gear, existingGearId, selectedGearId]);

  const loadWorkoutData = async () => {
    try {
      const userId = getStoredUserId();
      if (!userId || !workoutId) return;

      const { data, error } = await supabase
        .from('workouts')
        .select('distance, gps_track, computed, date, planned_id, workout_metadata, pool_length')
        .eq('id', workoutId)
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error loading workout data:', error);
        return;
      }

      console.log('📅 [PostWorkoutFeedback] Loaded workout data:', { date: data?.date, distance: data?.distance });
      setWorkoutData(data);

      // Swim (D-162): prefill the pool from any prior pool_length, and read the LINKED PLANNED swim's
      // prescribed per-step equipment so we can ask "did you actually use the prescribed fins?".
      if (isSwim) {
        if (Number(data?.pool_length) > 0) {
          const m = Number(data.pool_length);
          const match = POOL_OPTIONS.find((p) => Math.abs(p.meters - m) < 0.6);
          if (match) setSelectedPool(match.value);
        }
        const plannedId = data?.planned_id;
        const prescribed: Array<{ id: string; equipment: string; prompt: string; step_index: number | null }> = [];
        if (plannedId) {
          const { data: planned } = await supabase
            .from('planned_workouts')
            .select('computed')
            .eq('id', plannedId)
            .eq('user_id', userId)
            .single();
          const steps: any[] = Array.isArray(planned?.computed?.steps) ? planned.computed.steps : [];
          const seen = new Set<string>();
          // (1) Per-step REQUIRED equipment (pull→buoy, kick→board): tied to a specific step.
          steps.forEach((st: any, i: number) => {
            const eq = typeof st?.equipment === 'string' ? st.equipment.trim().toLowerCase() : '';
            if (!eq || eq === 'none' || seen.has(eq)) return;
            seen.add(eq);
            prescribed.push({
              id: `s${i}`,
              equipment: eq,
              prompt: `${String(st?.label || st?.kind || `Step ${i + 1}`)} — ${eq}?`,
              step_index: Number.isFinite(st?.planned_index) ? Number(st.planned_index) : i,
            });
          });
          // (2) Session-level SUGGESTED/OPTIONAL equipment (e.g. catch-up drill → snorkel/fins): not
          // tied to one step, lives in computed.swim_equipment_suggested / _optional_suggested.
          const sessionEquip = [
            ...(Array.isArray(planned?.computed?.swim_equipment_suggested) ? planned.computed.swim_equipment_suggested : []),
            ...(Array.isArray(planned?.computed?.swim_equipment_optional_suggested) ? planned.computed.swim_equipment_optional_suggested : []),
          ];
          for (const raw of sessionEquip) {
            const eq = String(raw || '').trim().toLowerCase();
            if (!eq || eq === 'none' || seen.has(eq)) continue;
            seen.add(eq);
            prescribed.push({ id: `g-${eq}`, equipment: eq, prompt: `Did you use ${eq}?`, step_index: null });
          }
        }
        setPrescribedEquip(prescribed);
      }
    } catch (e) {
      console.error('Error loading workout data:', e);
    }
  };

  const loadGear = async () => {
    try {
      setLoading(true);
      // Swims have no shoe/bike gear — skip the gear query (it would fetch bikes for a swim).
      if (isSwim) { setGear([]); return; }
      const userId = getStoredUserId();
      if (!userId) return;

      const { data, error } = await supabase
        .from('gear')
        .select('id, type, name, brand, model, is_default')
        .eq('user_id', userId)
        .eq('type', gearType)
        .eq('retired', false)
        .order('is_default', { ascending: false })
        .order('name');

      if (error) {
        console.error('Error loading gear:', error);
        return;
      }

      setGear(data || []);

      // Pre-select existing gear_id if set, otherwise default gear (for quick save)
      if (existingGearId) {
        setSelectedGearId(existingGearId);
      } else if (data && data.length > 0) {
        const defaultGear = data.find(g => g.is_default);
        if (defaultGear) {
          setSelectedGearId(defaultGear.id);
        }
      }
    } catch (e) {
      console.error('Error loading gear:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Verify workout exists before saving
      const { data: workoutCheck, error: checkError } = await supabase
        .from('workouts')
        .select('id')
        .eq('id', workoutId)
        .single();

      if (checkError || !workoutCheck) {
        console.error('❌ [PostWorkoutFeedback] Workout not found:', workoutId, checkError);
        toast({
          title: 'Error',
          description: 'Workout not found. It may have been deleted.',
          variant: 'destructive',
        });
        onClose?.();
        return;
      }

      const updateData: any = {};

      if (selectedGearId && !isSwim) {
        updateData.gear_id = selectedGearId;
      }
      if (selectedRpe !== null) {
        updateData.rpe = selectedRpe;
      }
      if (selectedFeeling) {
        updateData.feeling = selectedFeeling;
      }

      // Swim (D-162): pool → pool_length (m) + derived length count; equipment → workout_metadata.
      if (isSwim) {
        const pool = POOL_OPTIONS.find((p) => p.value === selectedPool);
        if (pool) {
          updateData.pool_length = pool.meters;
          const distM = Number(workoutData?.distance) > 0 ? Number(workoutData.distance) * 1000 : 0;
          updateData.number_of_active_lengths = distM > 0 ? Math.round(distM / pool.meters) : null;
        }
        // Merge equipment into workout_metadata without clobbering existing keys (readiness, session_rpe…).
        const existingMeta = typeof workoutData?.workout_metadata === 'string'
          ? (() => { try { return JSON.parse(workoutData.workout_metadata); } catch { return {}; } })()
          : (workoutData?.workout_metadata || {});
        const meta: any = { ...existingMeta };
        if (prescribedEquip.length > 0) {
          const confirmed = prescribedEquip
            .filter((p) => p.id in equipConfirms)
            .map((p) => ({ step_index: p.step_index, equipment: p.equipment, used: equipConfirms[p.id] }));
          if (confirmed.length > 0) meta.swim_steps_equipment_confirmed = confirmed;
        } else if (unplannedEquip.size > 0) {
          meta.swim_equipment_unplanned = Array.from(unplannedEquip);
        }
        if (meta.swim_steps_equipment_confirmed || meta.swim_equipment_unplanned) {
          updateData.workout_metadata = meta;
        }
      }

      // Only update if something was selected
      if (Object.keys(updateData).length > 0) {
        const { error } = await supabase
          .from('workouts')
          .update(updateData)
          .eq('id', workoutId);

        if (error) {
          console.error('Error saving feedback:', error);
          toast({
            title: 'Error saving feedback',
            description: error.message,
            variant: 'destructive',
          });
          return;
        }

        toast({
          title: 'Feedback saved',
          variant: 'success',
        });
      }

      onSave?.(updateData);
      onClose?.();
    } catch (e: any) {
      console.error('Error saving feedback:', e);
      toast({
        title: 'Error',
        description: e.message || 'Failed to save feedback',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    onSkip?.();
    onClose?.();
  };

  // Format distance for display
  const formatDistance = (distanceKm: number | null | undefined): string | null => {
    if (!distanceKm || !Number.isFinite(distanceKm)) return null;
    const km = Number(distanceKm);
    if (useImperial) {
      const miles = km / 1.60934;
      return miles >= 0.1 ? `${miles.toFixed(1)} mi` : `${Math.round(km * 1000)} m`;
    } else {
      return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`;
    }
  };

  // Parse GPS track for map
  const getGpsTrack = (): [number, number][] => {
    if (!workoutData?.gps_track) return [];
    const gpsRaw = workoutData.gps_track;
    const gps = Array.isArray(gpsRaw)
      ? gpsRaw
      : (typeof gpsRaw === 'string' ? (() => {
          try {
            const v = JSON.parse(gpsRaw);
            return Array.isArray(v) ? v : [];
          } catch {
            return [];
          }
        })() : []);
    
    return gps
      .map((p: any) => {
        const lng = p.lng ?? p.longitudeInDegree ?? p.longitude ?? p.lon;
        const lat = p.lat ?? p.latitudeInDegree ?? p.latitude;
        if ([lng, lat].every((v) => Number.isFinite(v))) {
          return [Number(lng), Number(lat)] as [number, number];
        }
        return null;
      })
      .filter(Boolean) as [number, number][];
  };

  // Get series data for map (from computed.analysis.series)
  const getSeriesData = () => {
    if (!workoutData?.computed?.analysis?.series) return null;
    return workoutData.computed.analysis.series;
  };

  // Format date for display
  const formatDate = (dateString: string | null | undefined): string | null => {
    if (!dateString) return null;
    try {
      const date = parseLocalDate(String(dateString).slice(0, 10));
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      // Check if it's today
      if (date.toDateString() === today.toDateString()) {
        return 'Today';
      }
      // Check if it's yesterday
      if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
      }
      // Otherwise format as "Mon Jan 13" or similar
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      return null;
    }
  };

  const distanceText = formatDistance(workoutData?.distance);
  const dateText = formatDate(workoutData?.date);
  console.log('📅 [PostWorkoutFeedback] Date formatting:', { 
    rawDate: workoutData?.date, 
    formattedDate: dateText,
    hasWorkoutData: !!workoutData 
  });
  const gpsTrack = getGpsTrack();
  const seriesData = getSeriesData();
  const hasMapData = (gpsTrack.length > 1) || (seriesData?.distance_m && Array.isArray(seriesData.distance_m) && seriesData.distance_m.length > 1);

  const content = (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${sportColor}20` }}
          >
            <SportIcon className="h-5 w-5" style={{ color: sportColor }} />
          </div>
          <div>
            <h3 className="text-lg font-light text-white">
              {mode === 'popup' ? 'Nice work!' : 'Workout Feedback'}
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              {workoutName && (
                <p className="text-sm text-white/60 font-light">{workoutName}</p>
              )}
              {dateText && (
                <>
                  {workoutName && <span className="text-white/40">•</span>}
                  <p className="text-sm text-white/60 font-light">{dateText}</p>
                </>
              )}
              {distanceText && (
                <>
                  {(workoutName || dateText) && <span className="text-white/40">•</span>}
                  <p className="text-sm text-white/60 font-light">{distanceText}</p>
                </>
              )}
            </div>
          </div>
        </div>
        {mode === 'popup' && onClose && (
          <button
            onClick={handleSkip}
            className="text-white/40 hover:text-white/60 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Map Preview - Bigger to see the route (map only, no charts/metrics) */}
      {hasMapData && (
        <div className="rounded-lg overflow-hidden" style={{ height: '280px' }}>
          <MapEffort
            trackLngLat={gpsTrack}
            cursorDist_m={null}
            totalDist_m={seriesData?.distance_m?.[seriesData.distance_m.length - 1] || null}
            theme="standard"
            height={280}
            useMiles={useImperial}
          />
        </div>
      )}

      {/* RPE Selection - Optional */}
      <div>
        <label className="text-sm font-light text-white/70 mb-2 block">
          How Hard? (RPE) <span className="text-xs text-white/40 font-light">(optional)</span>
          {selectedRpe && (
            <span className="ml-2 text-white/50 font-light">
              — {RPE_DESCRIPTIONS[selectedRpe]}
            </span>
          )}
        </label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rpe) => (
            <button
              key={rpe}
              onClick={() => setSelectedRpe(rpe === selectedRpe ? null : rpe)}
              className={`flex-1 py-2.5 text-sm font-light rounded-lg border-2 backdrop-blur-md transition-all duration-300 ${
                selectedRpe === rpe
                  ? 'bg-white/[0.15] border-white/40 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.1)_inset]'
                  : 'bg-white/[0.08] border-white/20 text-white/70 hover:bg-white/[0.12] hover:text-white/90 hover:border-white/30'
              }`}
              style={{
                backgroundColor: selectedRpe === rpe ? `rgba(${getRgbFromColor(sportColor)}, 0.2)` : undefined,
                borderColor: selectedRpe === rpe ? `rgba(${getRgbFromColor(sportColor)}, 0.5)` : undefined,
              }}
            >
              {rpe}
            </button>
          ))}
        </div>
        <div className="flex justify-between mt-1 text-xs text-white/40 font-light">
          <span>Easy</span>
          <span>Max</span>
        </div>
      </div>

      {/* Feeling Selection */}
      <div>
        <label className="text-sm font-light text-white/70 mb-2 block">
          How Do You Feel?
        </label>
        <div className="flex gap-2">
          {FEELING_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setSelectedFeeling(option.value === selectedFeeling ? null : option.value)}
              className={`flex-1 py-2.5 px-2 text-xs font-light rounded-lg border-2 backdrop-blur-md transition-all duration-300 ${
                selectedFeeling === option.value
                  ? 'bg-white/[0.15] border-white/40 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.1)_inset]'
                  : 'bg-white/[0.08] border-white/20 text-white/70 hover:bg-white/[0.12] hover:text-white/90 hover:border-white/30'
              }`}
              style={{
                backgroundColor: selectedFeeling === option.value ? `rgba(${getRgbFromColor(sportColor)}, 0.2)` : undefined,
                borderColor: selectedFeeling === option.value ? `rgba(${getRgbFromColor(sportColor)}, 0.5)` : undefined,
              }}
              title={option.description}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Swim: pool length (D-162) — sets distance-per-length so we can derive the length count */}
      {isSwim && (
        <div>
          <label className="text-sm font-light text-white/70 mb-2 block">
            What pool? <span className="text-xs text-white/40 font-light">(sets distance per length)</span>
          </label>
          <div className="flex gap-2">
            {POOL_OPTIONS.map((p) => (
              <button
                key={p.value}
                onClick={() => setSelectedPool(p.value === selectedPool ? null : p.value)}
                className={`flex-1 py-2.5 text-sm font-light rounded-lg border-2 backdrop-blur-md transition-all duration-300 ${
                  selectedPool === p.value
                    ? 'bg-white/[0.15] border-white/40 text-white'
                    : 'bg-white/[0.08] border-white/20 text-white/70 hover:bg-white/[0.12] hover:text-white/90 hover:border-white/30'
                }`}
                style={{
                  backgroundColor: selectedPool === p.value ? `rgba(${rgb}, 0.2)` : undefined,
                  borderColor: selectedPool === p.value ? `rgba(${rgb}, 0.5)` : undefined,
                }}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setSelectedPool(null)}
              className="flex-1 py-2.5 text-sm font-light rounded-lg border-2 backdrop-blur-md transition-all duration-300 bg-white/[0.04] border-white/10 text-white/50 hover:text-white/70"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Swim: equipment confirmation (D-162) — prescribed items from the plan (per-step required +
          session-level suggested/optional like snorkel/fins). Lets a finned/drill set be flagged
          downstream (Q-061) without clouding session pace. Falls back to multi-select when none. */}
      {isSwim && prescribedEquip.length > 0 && (
        <div>
          <label className="text-sm font-light text-white/70 mb-2 block">
            Equipment — did you use what the plan called for?
          </label>
          <div className="space-y-2">
            {prescribedEquip.map((p) => {
              const val = p.id in equipConfirms ? equipConfirms[p.id] : null;
              return (
                <div key={p.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <div className="text-[13px] text-white/80 mb-1.5 capitalize">{p.prompt}</div>
                  <div className="flex gap-2">
                    {[{ k: 'yes', v: true, t: 'Yes' }, { k: 'no', v: false, t: 'No' }, { k: 'skip', v: null, t: 'Skip' }].map((opt) => {
                      const active = val === opt.v;
                      return (
                        <button
                          key={opt.k}
                          onClick={() => setEquipConfirms((prev) => {
                            const next = { ...prev };
                            if (opt.v === null) delete next[p.id];
                            else next[p.id] = opt.v as boolean;
                            return next;
                          })}
                          className={`flex-1 py-1.5 text-xs font-light rounded-md border-2 transition-all duration-300 ${
                            active ? 'bg-white/[0.15] border-white/40 text-white' : 'bg-white/[0.06] border-white/15 text-white/60 hover:text-white/85'
                          }`}
                          style={{
                            backgroundColor: active && opt.v !== null ? `rgba(${rgb}, 0.2)` : undefined,
                            borderColor: active && opt.v !== null ? `rgba(${rgb}, 0.5)` : undefined,
                          }}
                        >
                          {opt.t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Swim: equipment fallback (D-162) — simple multi-select when the plan prescribed nothing
          (or the swim is unplanned). Ensures equipment can always be logged. */}
      {isSwim && prescribedEquip.length === 0 && (
        <div>
          <label className="text-sm font-light text-white/70 mb-2 block">
            Equipment used? <span className="text-xs text-white/40 font-light">(optional)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {UNPLANNED_EQUIP.map((e) => {
              const active = unplannedEquip.has(e);
              return (
                <button
                  key={e}
                  onClick={() => setUnplannedEquip((prev) => {
                    const next = new Set(prev);
                    if (next.has(e)) next.delete(e); else next.add(e);
                    return next;
                  })}
                  className={`py-2 px-3 text-xs font-light rounded-lg border-2 backdrop-blur-md transition-all duration-300 ${
                    active ? 'bg-white/[0.15] border-white/40 text-white' : 'bg-white/[0.08] border-white/20 text-white/70 hover:bg-white/[0.12] hover:text-white/90'
                  }`}
                  style={{
                    backgroundColor: active ? `rgba(${rgb}, 0.2)` : undefined,
                    borderColor: active ? `rgba(${rgb}, 0.5)` : undefined,
                  }}
                >
                  {e}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Gear Selection - Dropdown (moved to bottom) */}
      {gear.length > 0 && (
        <div>
          <label className="text-sm font-light text-white/70 mb-2 block">
            {workoutType === 'run' ? 'Shoes Used' : 'Bike Used'}
            {existingGearId && (
              <span className="ml-2 text-xs text-white/40 font-light">(optional to change)</span>
            )}
          </label>
          <Select
            value={selectedGearId || undefined}
            onValueChange={(value) => setSelectedGearId(value)}
          >
            <SelectTrigger 
              className="w-full bg-white/[0.08] backdrop-blur-md border-2 text-white font-light hover:bg-white/[0.12] transition-all duration-300"
              style={{
                borderColor: selectedGearId ? `rgba(${getRgbFromColor(sportColor)}, 0.4)` : 'rgba(255, 255, 255, 0.2)',
              }}
            >
              <SelectValue placeholder="Select gear">
                {(() => {
                  const selected = gear.find(g => g.id === selectedGearId);
                  if (!selected) return 'Select gear';
                  const details = [selected.brand, selected.model].filter(Boolean).join(' ');
                  return details ? `${selected.name} • ${details}` : selected.name;
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-white/[0.05] backdrop-blur-xl border-2 border-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]">
              {gear.map((item) => (
                <SelectItem
                  key={item.id}
                  value={item.id}
                  className="text-white font-light focus:bg-white/[0.12] focus:text-white"
                >
                  <div className="flex flex-col">
                    <span className="font-light">{item.name}</span>
                    {(item.brand || item.model) && (
                      <span className="text-xs text-white/50 font-light">
                        {[item.brand, item.model].filter(Boolean).join(' ')}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
              {onAddGear && (
                <div className="border-t border-white/10 mt-1 pt-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onAddGear();
                    }}
                    className="w-full flex items-center gap-2 px-2 py-2 text-sm font-light text-white/70 hover:text-white hover:bg-white/[0.08] rounded transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add New {workoutType === 'run' ? 'Shoes' : 'Bike'}</span>
                  </button>
                </div>
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-2">
        {mode === 'popup' && onSkip && (
          <Button
            onClick={handleSkip}
            variant="ghost"
            className="flex-1 font-light text-white/60 hover:text-white/80 bg-white/[0.05] backdrop-blur-md border-2 border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300"
          >
            Skip
          </Button>
        )}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 font-light backdrop-blur-md border-2 transition-all duration-300 shadow-[0_0_0_1px_rgba(255,255,255,0.1)_inset]"
          style={{ 
            backgroundColor: `rgba(${rgb}, 0.6)`,
            borderColor: `rgba(${rgb}, 0.8)`,
            color: 'white',
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );

  if (mode === 'inline') {
    return (
      <div className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08]">
        {loading ? (
          <div className="text-center py-4 text-white/50">Loading...</div>
        ) : (
          content
        )}
      </div>
    );
  }

  // Popup mode - full screen overlay with glassmorphism

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop with gradient */}
      <div 
        className="absolute inset-0 backdrop-blur-md"
        style={{
          background: `linear-gradient(to bottom, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.5)),
                        radial-gradient(circle at 50% 50%, rgba(${rgb}, 0.1) 0%, transparent 70%)`
        }}
        onClick={handleSkip}
      />
      
      {/* Panel with glassmorphism and sport color accent */}
      <div 
        className="relative w-full max-w-lg mx-4 mb-4 p-6 rounded-2xl backdrop-blur-xl border-2 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] animate-slide-up"
        style={{
          background: `linear-gradient(135deg, rgba(${rgb},0.15) 0%, rgba(${rgb},0.05) 50%, rgba(255,255,255,0.03) 100%)`,
          borderColor: `rgba(${rgb}, 0.3)`
        }}
      >
        {loading ? (
          <div className="text-center py-8 text-white/50">Loading gear...</div>
        ) : (
          content
        )}
      </div>
    </div>
  );
}

// CSS animation for slide up
const styles = `
@keyframes slide-up {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.animate-slide-up {
  animation: slide-up 0.3s ease-out;
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}


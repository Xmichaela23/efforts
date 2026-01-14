import React, { useState, useEffect } from 'react';
import { X, Activity, Bike, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SPORT_COLORS } from '@/lib/context-utils';
import { Button } from './ui/button';
import { useToast } from './ui/use-toast';
import { useAppContext } from '@/lib/AppContext';
import EffortsViewerMapbox from './EffortsViewerMapbox';
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

interface PostWorkoutFeedbackProps {
  workoutId: string;
  workoutType: 'run' | 'ride';
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

  const gearType = workoutType === 'run' ? 'shoe' : 'bike';
  const sportColor = workoutType === 'run' ? SPORT_COLORS.run : SPORT_COLORS.cycling;
  const SportIcon = workoutType === 'run' ? Activity : Bike;

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !workoutId) return;

      const { data, error } = await supabase
        .from('workouts')
        .select('distance, gps_track, computed')
        .eq('id', workoutId)
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Error loading workout data:', error);
        return;
      }

      setWorkoutData(data);
    } catch (e) {
      console.error('Error loading workout data:', e);
    }
  };

  const loadGear = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('gear')
        .select('id, type, name, brand, model, is_default')
        .eq('user_id', user.id)
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
      
      if (selectedGearId) {
        updateData.gear_id = selectedGearId;
      }
      if (selectedRpe !== null) {
        updateData.rpe = selectedRpe;
      }
      if (selectedFeeling) {
        updateData.feeling = selectedFeeling;
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

  const distanceText = formatDistance(workoutData?.distance);
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
            <div className="flex items-center gap-2">
              {workoutName && (
                <p className="text-sm text-white/60 font-light">{workoutName}</p>
              )}
              {distanceText && (
                <>
                  {workoutName && <span className="text-white/40">•</span>}
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

      {/* Map Preview */}
      {hasMapData && (
        <div className="rounded-lg overflow-hidden" style={{ height: '160px' }}>
          <EffortsViewerMapbox
            samples={seriesData || []}
            trackLngLat={gpsTrack}
            useMiles={useImperial}
            useFeet={useImperial}
            compact={true}
            workoutData={{ type: workoutType, ...workoutData }}
          />
        </div>
      )}

      {/* Gear Selection - Dropdown (optional if gear already set, but still allow changes) */}
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


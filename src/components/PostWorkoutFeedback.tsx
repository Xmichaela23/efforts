import React, { useState, useEffect } from 'react';
import { X, Activity, Bike } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SPORT_COLORS } from '@/lib/context-utils';
import { Button } from './ui/button';
import { useToast } from './ui/use-toast';

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
  mode = 'popup',
}: PostWorkoutFeedbackProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gear, setGear] = useState<GearItem[]>([]);
  
  // Form state
  const [selectedGearId, setSelectedGearId] = useState<string | null>(existingGearId || null);
  const [selectedRpe, setSelectedRpe] = useState<number | null>(existingRpe || null);
  const [selectedFeeling, setSelectedFeeling] = useState<string | null>(existingFeeling || null);

  const gearType = workoutType === 'run' ? 'shoe' : 'bike';
  const sportColor = workoutType === 'run' ? SPORT_COLORS.run : SPORT_COLORS.cycling;
  const SportIcon = workoutType === 'run' ? Activity : Bike;

  useEffect(() => {
    loadGear();
  }, []);

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

      // Auto-select default if no existing selection
      if (!existingGearId && data && data.length > 0) {
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
            <h3 className="text-lg font-semibold text-white">
              {mode === 'popup' ? 'Nice work!' : 'Workout Feedback'}
            </h3>
            {workoutName && (
              <p className="text-sm text-white/60">{workoutName}</p>
            )}
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

      {/* Gear Selection */}
      {gear.length > 0 && (
        <div>
          <label className="text-sm font-medium text-white/70 mb-2 block">
            {workoutType === 'run' ? 'Shoes Used' : 'Bike Used'}
          </label>
          <div className="space-y-2">
            {gear.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedGearId(item.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 ${
                  selectedGearId === item.id
                    ? 'bg-white/[0.12] border-white/30'
                    : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]'
                }`}
                style={{
                  borderColor: selectedGearId === item.id ? sportColor : undefined,
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">{item.name}</div>
                    {(item.brand || item.model) && (
                      <div className="text-sm text-white/50">
                        {[item.brand, item.model].filter(Boolean).join(' ')}
                      </div>
                    )}
                  </div>
                  {selectedGearId === item.id && (
                    <div 
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: sportColor }}
                    >
                      <span className="text-white text-xs">✓</span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* RPE Selection */}
      <div>
        <label className="text-sm font-medium text-white/70 mb-2 block">
          How Hard? (RPE)
          {selectedRpe && (
            <span className="ml-2 text-white/50 font-normal">
              — {RPE_DESCRIPTIONS[selectedRpe]}
            </span>
          )}
        </label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rpe) => (
            <button
              key={rpe}
              onClick={() => setSelectedRpe(rpe === selectedRpe ? null : rpe)}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg border transition-all duration-200 ${
                selectedRpe === rpe
                  ? 'bg-white/[0.15] border-white/30 text-white'
                  : 'bg-white/[0.04] border-white/10 text-white/60 hover:bg-white/[0.08] hover:text-white/80'
              }`}
              style={{
                backgroundColor: selectedRpe === rpe ? `${sportColor}30` : undefined,
                borderColor: selectedRpe === rpe ? sportColor : undefined,
              }}
            >
              {rpe}
            </button>
          ))}
        </div>
        <div className="flex justify-between mt-1 text-xs text-white/40">
          <span>Easy</span>
          <span>Max</span>
        </div>
      </div>

      {/* Feeling Selection */}
      <div>
        <label className="text-sm font-medium text-white/70 mb-2 block">
          How Do You Feel?
        </label>
        <div className="flex gap-2">
          {FEELING_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setSelectedFeeling(option.value === selectedFeeling ? null : option.value)}
              className={`flex-1 py-2.5 px-2 text-xs font-medium rounded-lg border transition-all duration-200 ${
                selectedFeeling === option.value
                  ? 'bg-white/[0.15] border-white/30 text-white'
                  : 'bg-white/[0.04] border-white/10 text-white/60 hover:bg-white/[0.08] hover:text-white/80'
              }`}
              style={{
                backgroundColor: selectedFeeling === option.value ? `${sportColor}30` : undefined,
                borderColor: selectedFeeling === option.value ? sportColor : undefined,
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
        {mode === 'popup' && (
          <Button
            onClick={handleSkip}
            variant="ghost"
            className="flex-1 text-white/60 hover:text-white hover:bg-white/[0.08]"
          >
            Skip
          </Button>
        )}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 font-medium"
          style={{ 
            backgroundColor: sportColor,
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

  // Popup mode - full screen overlay
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleSkip}
      />
      
      {/* Panel */}
      <div className="relative w-full max-w-lg mx-4 mb-4 p-6 rounded-2xl bg-[#1a1a2e] border border-white/[0.1] shadow-xl animate-slide-up">
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


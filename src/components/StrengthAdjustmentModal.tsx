import React, { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface StrengthAdjustmentModalProps {
  exerciseName: string;
  currentWeight: number;
  currentReps?: number;
  nextPlannedWeight: number;
  targetRir?: number;
  actualRir?: number;
  planId?: string;
  isBodyweight?: boolean;
  hasPlannedWeight?: boolean;
  buttonRect?: DOMRect;
  onClose: () => void;
  onSaved: () => void;
}

const StrengthAdjustmentModal: React.FC<StrengthAdjustmentModalProps> = ({
  exerciseName,
  currentWeight,
  currentReps,
  planId,
  isBodyweight,
  hasPlannedWeight,
  buttonRect,
  onClose,
  onSaved,
}) => {
  // Check if this is a bodyweight-type exercise (dips, pull-ups, etc.) - always show reps
  const isBodyweightType = isBodyweight || /dip|pull\-?ups?|chin\-?ups?/i.test(exerciseName);
  
  // Only pre-fill weight if it was actually planned (not just logged)
  const [repsInput, setRepsInput] = useState<string>(currentReps?.toString() || '');
  const [weightInput, setWeightInput] = useState<string>(hasPlannedWeight ? currentWeight?.toString() || '' : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Calculate dropdown position - appear right below the button
  const dropdownStyle: React.CSSProperties = buttonRect ? {
    position: 'fixed',
    top: buttonRect.bottom + 8,
    left: Math.max(16, Math.min(buttonRect.left - 100, window.innerWidth - 280)),
    width: 264,
  } : {};

  const getFinalWeight = (): number | null => {
    const val = parseInt(weightInput);
    return val >= 0 ? val : null;
  };
  
  const getFinalReps = (): number | null => {
    const val = parseInt(repsInput);
    return val > 0 ? val : null;
  };

  const handleSave = async () => {
    const weight = getFinalWeight();
    if (weight == null) return;
    
    try {
      setSaving(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('You must be logged in');
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      // Deactivate any existing adjustments for this exercise
      await supabase
        .from('plan_adjustments')
        .update({ status: 'reverted' })
        .eq('user_id', user.id)
        .eq('exercise_name', exerciseName)
        .eq('status', 'active');

      // Insert new adjustment (applies_until = null = forever until changed)
      const { error: insertError } = await supabase.from('plan_adjustments').insert({
        user_id: user.id,
        plan_id: planId || null,
        exercise_name: exerciseName,
        absolute_weight: weight,
        absolute_reps: getFinalReps() || null,
        applies_from: today,
        applies_until: null,
        status: 'active',
      });

      if (insertError) {
        console.error('Failed to save adjustment:', insertError);
        setError('Failed to save adjustment');
        return;
      }

      // Re-materialize the plan so all views show updated weights
      if (planId) {
        try {
          await supabase.functions.invoke('materialize-plan', {
            body: { plan_id: planId }
          });
        } catch (materializeErr) {
          console.error('Failed to re-materialize plan:', materializeErr);
          // Don't block - adjustment is saved, views will update on next materialization
        }
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error saving adjustment:', err);
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200]">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div 
        className="bg-zinc-900 border border-white/20 rounded-xl shadow-2xl p-4 z-10"
        style={{ 
          fontFamily: 'Inter, sans-serif',
          ...dropdownStyle
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white">{exerciseName}</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10">
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>

        {/* Input fields */}
        <div className="flex gap-3 mb-4">
          {/* Reps input - show for bodyweight-type exercises */}
          {isBodyweightType && (
            <div className="flex-1">
              <label className="text-xs text-white/50 uppercase tracking-wide mb-1.5 block">Reps</label>
              <input
                type="number"
                inputMode="numeric"
                value={repsInput}
                onChange={(e) => setRepsInput(e.target.value)}
                placeholder="8"
                className="w-full px-3 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-center text-lg font-medium placeholder:text-white/30 focus:outline-none focus:border-amber-500"
              />
            </div>
          )}
          
          {/* Weight input */}
          <div className="flex-1">
            <label className="text-xs text-white/50 uppercase tracking-wide mb-1.5 block">Weight</label>
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-center text-lg font-medium placeholder:text-white/30 focus:outline-none focus:border-amber-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">lb</span>
            </div>
          </div>
        </div>

        {/* Explanation */}
        <p className="text-xs text-white/40 text-center mb-4">
          Updates plan going forward
        </p>

        {/* Error */}
        {error && (
          <div className="mb-4 p-2 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl border border-white/20 text-white/60 hover:bg-white/5 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (getFinalWeight() == null && getFinalReps() == null)}
            className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500 text-black font-medium hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StrengthAdjustmentModal;

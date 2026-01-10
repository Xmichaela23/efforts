import React, { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface StrengthAdjustmentModalProps {
  exerciseName: string;
  currentWeight: number;
  nextPlannedWeight: number;
  targetRir?: number;
  actualRir?: number;
  planId?: string;
  onClose: () => void;
  onSaved: () => void;
}

const StrengthAdjustmentModal: React.FC<StrengthAdjustmentModalProps> = ({
  exerciseName,
  currentWeight,
  planId,
  onClose,
  onSaved,
}) => {
  // Weight options: use smaller increments for light weights
  // Special case: adding weight to bodyweight exercise (currentWeight = 0)
  const isAddingWeight = currentWeight === 0;
  const increment = currentWeight <= 15 ? 2.5 : 5;
  const minWeight = isAddingWeight ? 0 : increment;
  
  const rawOptions = isAddingWeight
    ? [0, 10, 15, 20, 25, 35] // Starting weights for adding to bodyweight
    : [
        currentWeight - (increment * 2),
        currentWeight - increment,
        currentWeight,
        currentWeight + increment,
        currentWeight + (increment * 2),
      ].map(w => Math.max(minWeight, w));
  
  // Remove duplicates while preserving order
  const weightOptions = [...new Set(rawOptions)];
  
  const [selectedWeight, setSelectedWeight] = useState<number | null>(null);
  const [customWeight, setCustomWeight] = useState<string>('');
  const [showCustom, setShowCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getFinalWeight = (): number | null => {
    if (showCustom) {
      const val = parseInt(customWeight);
      return val > 0 ? val : null;
    }
    return selectedWeight;
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
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-20 pb-8 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div 
        className="relative w-full max-w-sm mx-4 bg-zinc-900/95 backdrop-blur-md border border-white/20 rounded-xl shadow-xl p-5 z-10"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            {isAddingWeight ? `Add Weight to ${exerciseName}` : `Adjust ${exerciseName}`}
          </h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10">
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>

        {/* Current weight context */}
        {!isAddingWeight && (
          <div className="mb-4 text-center">
            <span className="text-sm text-white/60">Current: </span>
            <span className="text-sm text-white font-medium">{currentWeight} lb</span>
          </div>
        )}

        {/* Weight selector */}
        <div className="mb-4">
          <label className="text-xs text-white/60 uppercase tracking-wide mb-3 block text-center">Adjust to</label>
          
          <div className="flex gap-2 justify-center flex-wrap">
            {weightOptions.map((w) => (
              <button
                key={w}
                onClick={() => { setSelectedWeight(w); setShowCustom(false); }}
                className={`w-14 h-14 rounded-lg border text-sm font-medium transition-colors ${
                  selectedWeight === w && !showCustom
                    ? 'border-amber-500 bg-amber-500/20 text-amber-400'
                    : 'border-white/20 bg-white/5 text-white hover:bg-white/10'
                }`}
              >
                {w}
              </button>
            ))}
            <button
              onClick={() => { setShowCustom(true); setSelectedWeight(null); }}
              className={`w-14 h-14 rounded-lg border text-xs font-medium transition-colors ${
                showCustom
                  ? 'border-amber-500 bg-amber-500/20 text-amber-400'
                  : 'border-white/20 bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              Other
            </button>
          </div>

          {showCustom && (
            <div className="mt-3 flex justify-center">
              <input
                type="number"
                value={customWeight}
                onChange={(e) => setCustomWeight(e.target.value)}
                placeholder="Enter weight"
                className="w-32 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-center text-sm placeholder:text-white/40 focus:outline-none focus:border-amber-500"
                autoFocus
              />
              <span className="ml-2 text-white/60 self-center">lb</span>
            </div>
          )}
        </div>

        {/* Explanation */}
        <p className="text-xs text-white/50 text-center mb-4">
          This updates your plan going forward. Adjust again anytime.
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
            className="flex-1 py-2.5 px-4 rounded-lg border border-white/20 text-white/70 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || getFinalWeight() == null}
            className="flex-1 py-2.5 px-4 rounded-lg bg-amber-500 text-black font-medium hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StrengthAdjustmentModal;

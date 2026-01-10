import React, { useState } from 'react';
import { X, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface StrengthAdjustmentModalProps {
  exerciseName: string;
  currentWeight: number;
  nextPlannedWeight: number;
  targetRir?: number;
  actualRir?: number; // Average RIR from the logged workout
  planId?: string;
  onClose: () => void;
  onSaved: () => void;
}

const StrengthAdjustmentModal: React.FC<StrengthAdjustmentModalProps> = ({
  exerciseName,
  currentWeight,
  nextPlannedWeight,
  targetRir,
  actualRir,
  planId,
  onClose,
  onSaved,
}) => {
  const [selectedOption, setSelectedOption] = useState<'keep' | 'stay' | 'reduce' | 'custom'>('keep');
  const [customWeight, setCustomWeight] = useState<string>('');
  const [scope, setScope] = useState<'session' | '7days' | '14days'>('session');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate suggested reduce weight (5% less than next planned, minimum 5 lb reduction)
  const rawReduce = Math.round((nextPlannedWeight * 0.95) / 5) * 5;
  const reduceWeight = rawReduce >= nextPlannedWeight ? nextPlannedWeight - 5 : rawReduce;
  
  // Determine which options to show (hide duplicates)
  const showStay = currentWeight !== nextPlannedWeight;
  const showReduce = reduceWeight > 0 && reduceWeight !== nextPlannedWeight && reduceWeight !== currentWeight;

  const getSelectedWeight = (): number => {
    switch (selectedOption) {
      case 'keep': return nextPlannedWeight;
      case 'stay': return currentWeight;
      case 'reduce': return reduceWeight;
      case 'custom': return parseInt(customWeight) || currentWeight;
      default: return nextPlannedWeight;
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('You must be logged in');
        return;
      }

      // Calculate dates
      const today = new Date();
      const appliesFrom = today.toISOString().split('T')[0];
      let appliesUntil: string | null = null;

      if (scope === '7days') {
        const until = new Date(today);
        until.setDate(until.getDate() + 7);
        appliesUntil = until.toISOString().split('T')[0];
      } else if (scope === '14days') {
        const until = new Date(today);
        until.setDate(until.getDate() + 14);
        appliesUntil = until.toISOString().split('T')[0];
      } else {
        // 'session' = next session only, apply for 1 day
        const until = new Date(today);
        until.setDate(until.getDate() + 1);
        appliesUntil = until.toISOString().split('T')[0];
      }

      const selectedWeight = getSelectedWeight();

      // Insert adjustment
      const { error: insertError } = await supabase.from('plan_adjustments').insert({
        user_id: user.id,
        plan_id: planId || null,
        exercise_name: exerciseName,
        absolute_weight: selectedWeight,
        applies_from: appliesFrom,
        applies_until: appliesUntil,
        reason: reason || null,
        status: 'active',
      });

      if (insertError) {
        console.error('Failed to save adjustment:', insertError);
        setError('Failed to save adjustment');
        return;
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

  // Show RIR context if available
  const showRirWarning = actualRir != null && targetRir != null && actualRir < targetRir - 0.5;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div 
        className="relative w-full max-w-md mx-4 bg-zinc-900/95 backdrop-blur-md border border-white/20 rounded-xl shadow-xl p-5 z-10"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Adjust {exerciseName}</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10">
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>

        {/* Context */}
        <div className="mb-4 p-3 bg-white/5 rounded-lg">
          <div className="text-sm text-white/70">
            <div className="flex justify-between mb-1">
              <span>This session:</span>
              <span className="text-white">{currentWeight} lb</span>
            </div>
            <div className="flex justify-between">
              <span>Next planned:</span>
              <span className="text-white">{nextPlannedWeight} lb</span>
            </div>
          </div>
          {showRirWarning && (
            <div className="mt-2 pt-2 border-t border-white/10 flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <span className="text-xs text-amber-400/90">
                Your RIR was lower than target ({actualRir?.toFixed(1)} vs {targetRir}). Consider reducing weight.
              </span>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="space-y-2 mb-4">
          <label className="text-xs text-white/60 uppercase tracking-wide">Next session weight</label>
          
          <div 
            onClick={() => setSelectedOption('keep')}
            className={`p-3 rounded-lg border cursor-pointer transition-colors ${
              selectedOption === 'keep' 
                ? 'border-amber-500 bg-amber-500/10' 
                : 'border-white/20 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 ${selectedOption === 'keep' ? 'border-amber-500 bg-amber-500' : 'border-white/40'}`} />
              <div>
                <div className="text-sm text-white font-medium">Keep plan ({nextPlannedWeight} lb)</div>
                <div className="text-xs text-white/50">Continue with planned progression</div>
              </div>
            </div>
          </div>

          {showStay && (
            <div 
              onClick={() => setSelectedOption('stay')}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedOption === 'stay' 
                  ? 'border-amber-500 bg-amber-500/10' 
                  : 'border-white/20 bg-white/5 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full border-2 ${selectedOption === 'stay' ? 'border-amber-500 bg-amber-500' : 'border-white/40'}`} />
                <div>
                  <div className="text-sm text-white font-medium">Stay at current ({currentWeight} lb)</div>
                  <div className="text-xs text-white/50">Focus on hitting target RIR</div>
                </div>
              </div>
            </div>
          )}

          {showReduce && (
            <div 
              onClick={() => setSelectedOption('reduce')}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedOption === 'reduce' 
                  ? 'border-amber-500 bg-amber-500/10' 
                  : 'border-white/20 bg-white/5 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full border-2 ${selectedOption === 'reduce' ? 'border-amber-500 bg-amber-500' : 'border-white/40'}`} />
                <div>
                  <div className="text-sm text-white font-medium">Reduce to {reduceWeight} lb</div>
                  <div className="text-xs text-white/50">If fatigue is high</div>
                </div>
              </div>
            </div>
          )}

          <div 
            onClick={() => setSelectedOption('custom')}
            className={`p-3 rounded-lg border cursor-pointer transition-colors ${
              selectedOption === 'custom' 
                ? 'border-amber-500 bg-amber-500/10' 
                : 'border-white/20 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 ${selectedOption === 'custom' ? 'border-amber-500 bg-amber-500' : 'border-white/40'}`} />
              <div className="flex-1">
                <div className="text-sm text-white font-medium">Custom</div>
                {selectedOption === 'custom' && (
                  <input
                    type="number"
                    value={customWeight}
                    onChange={(e) => setCustomWeight(e.target.value)}
                    placeholder="Enter weight"
                    className="mt-2 w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-amber-500"
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Scope */}
        <div className="mb-4">
          <label className="text-xs text-white/60 uppercase tracking-wide mb-2 block">Apply to</label>
          <div className="flex gap-2">
            <button
              onClick={() => setScope('session')}
              className={`flex-1 py-2 px-3 rounded text-sm transition-colors ${
                scope === 'session' 
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' 
                  : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
              }`}
            >
              Next session
            </button>
            <button
              onClick={() => setScope('7days')}
              className={`flex-1 py-2 px-3 rounded text-sm transition-colors ${
                scope === '7days' 
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' 
                  : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
              }`}
            >
              7 days
            </button>
            <button
              onClick={() => setScope('14days')}
              className={`flex-1 py-2 px-3 rounded text-sm transition-colors ${
                scope === '14days' 
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' 
                  : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
              }`}
            >
              14 days
            </button>
          </div>
        </div>

        {/* Note (optional) */}
        <div className="mb-4">
          <label className="text-xs text-white/60 uppercase tracking-wide mb-2 block">Note (optional)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Feeling fatigued from long run"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-2 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm">
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
            disabled={saving || (selectedOption === 'custom' && !customWeight)}
            className="flex-1 py-2.5 px-4 rounded-lg bg-amber-500 text-black font-medium hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Apply Adjustment'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StrengthAdjustmentModal;

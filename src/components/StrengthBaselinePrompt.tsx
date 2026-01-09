import React, { useState } from 'react';
import { Dumbbell, Calculator, Edit3, SkipForward, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/contexts/AppContext';

interface StrengthBaselinePromptProps {
  onComplete: () => void;
  onManualEntry: () => void;
  onSkip: () => void;
  onDismiss?: () => void;
  /** Which baselines are needed (from server) */
  requiredBaselines?: string[];
  /** Exercise names that are pending weight calculation */
  pendingExercises?: string[];
}

/**
 * Just-in-time prompt for strength baselines
 * 
 * Shown when user views a barbell strength workout without 1RM baselines set.
 * Offers 3 options:
 * 1. Enter Baselines Now - Quick modal for 4 lifts
 * 2. Enter Weights Manually - User will input weights per exercise
 * 3. Skip - Track reps only, no weight logging
 */
export default function StrengthBaselinePrompt({
  onComplete,
  onManualEntry,
  onSkip,
  onDismiss,
  requiredBaselines = [],
  pendingExercises = []
}: StrengthBaselinePromptProps) {
  const { saveUserBaselines, loadUserBaselines } = useAppContext();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [baselines, setBaselines] = useState({
    squat: '',
    deadlift: '',
    bench: '',
    overheadPress: ''
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      // Load existing baselines first
      const existing = await loadUserBaselines() || {};
      
      // Merge with new strength baselines
      const updated = {
        ...existing,
        performanceNumbers: {
          ...(existing as any).performanceNumbers,
          squat: baselines.squat ? parseInt(baselines.squat) : undefined,
          deadlift: baselines.deadlift ? parseInt(baselines.deadlift) : undefined,
          bench: baselines.bench ? parseInt(baselines.bench) : undefined,
          overheadPress1RM: baselines.overheadPress ? parseInt(baselines.overheadPress) : undefined,
        }
      };
      
      await saveUserBaselines(updated);
      onComplete();
    } catch (error) {
      console.error('Error saving baselines:', error);
    } finally {
      setSaving(false);
    }
  };

  // Check if at least one field is filled
  const hasAnyBaseline = Object.values(baselines).some(v => v !== '');

  if (showForm) {
    return (
      <div className="p-4 rounded-xl bg-white/[0.06] border border-white/[0.12] backdrop-blur-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-amber-400" />
            Enter Your 1RM Baselines
          </h3>
          <button
            onClick={() => setShowForm(false)}
            className="text-white/40 hover:text-white/70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        
        <p className="text-xs text-white/50 mb-4">
          Enter your estimated max single rep for each lift. Don't know? Enter your best working weight × 1.2.
        </p>
        
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-white/60 mb-1 block">Back Squat</label>
            <div className="flex items-center">
              <input
                type="number"
                value={baselines.squat}
                onChange={(e) => setBaselines(prev => ({ ...prev, squat: e.target.value }))}
                placeholder="225"
                className="w-full h-10 px-3 text-sm bg-white/[0.08] border border-white/20 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/50"
              />
              <span className="ml-2 text-xs text-white/40">lb</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-white/60 mb-1 block">Deadlift</label>
            <div className="flex items-center">
              <input
                type="number"
                value={baselines.deadlift}
                onChange={(e) => setBaselines(prev => ({ ...prev, deadlift: e.target.value }))}
                placeholder="275"
                className="w-full h-10 px-3 text-sm bg-white/[0.08] border border-white/20 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/50"
              />
              <span className="ml-2 text-xs text-white/40">lb</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-white/60 mb-1 block">Bench Press</label>
            <div className="flex items-center">
              <input
                type="number"
                value={baselines.bench}
                onChange={(e) => setBaselines(prev => ({ ...prev, bench: e.target.value }))}
                placeholder="185"
                className="w-full h-10 px-3 text-sm bg-white/[0.08] border border-white/20 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/50"
              />
              <span className="ml-2 text-xs text-white/40">lb</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-white/60 mb-1 block">Overhead Press</label>
            <div className="flex items-center">
              <input
                type="number"
                value={baselines.overheadPress}
                onChange={(e) => setBaselines(prev => ({ ...prev, overheadPress: e.target.value }))}
                placeholder="115"
                className="w-full h-10 px-3 text-sm bg-white/[0.08] border border-white/20 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/50"
              />
              <span className="ml-2 text-xs text-white/40">lb</span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={!hasAnyBaseline || saving}
            className="flex-1 bg-amber-600 hover:bg-amber-500 text-white"
          >
            {saving ? 'Saving...' : 'Save & Calculate Weights'}
          </Button>
        </div>
        
        <p className="text-xs text-white/40 mt-3 text-center">
          Missing a lift? Leave it blank - we'll prompt you when needed.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-white/[0.06] border border-amber-500/30 backdrop-blur-lg">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-amber-500/20">
            <Dumbbell className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white/90">Set Up Strength Baselines</h3>
            <p className="text-xs text-white/50">
              {requiredBaselines.length > 0 
                ? `Need: ${requiredBaselines.join(', ')} 1RM`
                : 'Calculate your working weights automatically'}
            </p>
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-white/30 hover:text-white/50"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      
      {pendingExercises.length > 0 && (
        <div className="mb-3 p-2 rounded-lg bg-white/[0.04]">
          <p className="text-xs text-white/40">
            {pendingExercises.length} exercise{pendingExercises.length > 1 ? 's' : ''} waiting for weight calculation
          </p>
        </div>
      )}
      
      <div className="space-y-2">
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-colors text-left"
        >
          <Calculator className="h-4 w-4 text-amber-400" />
          <div>
            <span className="text-sm font-medium text-white/90 block">Enter Baselines Now</span>
            <span className="text-xs text-white/50">2 min setup, auto-calculated weights</span>
          </div>
        </button>
        
        <button
          onClick={onManualEntry}
          className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/[0.04] border border-white/[0.12] hover:bg-white/[0.08] transition-colors text-left"
        >
          <Edit3 className="h-4 w-4 text-white/60" />
          <div>
            <span className="text-sm font-medium text-white/80 block">Enter Weights Manually</span>
            <span className="text-xs text-white/40">Input weight for each exercise</span>
          </div>
        </button>
        
        <button
          onClick={onSkip}
          className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.08] hover:bg-white/[0.04] transition-colors text-left"
        >
          <SkipForward className="h-4 w-4 text-white/40" />
          <div>
            <span className="text-sm text-white/60 block">Skip - Track Reps Only</span>
            <span className="text-xs text-white/30">No weight logging for this workout</span>
          </div>
        </button>
      </div>
    </div>
  );
}

/**
 * Compact inline prompt for use within workout cards
 */
export function StrengthBaselineInlinePrompt({
  onSetup
}: {
  onSetup: () => void;
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
      <Dumbbell className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
      <span className="text-xs text-white/70">
        Weights pending setup
      </span>
      <button
        onClick={onSetup}
        className="ml-auto text-xs text-amber-400 hover:text-amber-300 font-medium"
      >
        Set Up
      </button>
    </div>
  );
}

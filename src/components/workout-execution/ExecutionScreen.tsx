/**
 * ExecutionScreen - Main Workout Display
 * 
 * Minimal, glanceable UI during workout execution:
 * - Big countdown/distance remaining
 * - Current HR with zone indicator
 * - Step info (interval number, type)
 * - Pause/Skip/End controls
 */

import React from 'react';
import { Pause, Play, SkipForward, Square, Heart } from 'lucide-react';
import type { CurrentStepState, WorkoutEnvironment, ZoneStatus, ExecutionStatus } from '@/types/workoutExecution';

interface ExecutionScreenProps {
  status: ExecutionStatus;
  environment: WorkoutEnvironment;
  currentStep: CurrentStepState | null;
  totalSteps: number;
  totalElapsedS: number;
  totalDistanceM: number;
  targetDistanceM?: number;  // Total target distance for the workout (e.g., 12 miles)
  
  // Actions
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onEnd: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(2)}km`;
}

function formatPace(secondsPerMile: number | undefined): string {
  if (!secondsPerMile) return '--:--';
  const mins = Math.floor(secondsPerMile / 60);
  const secs = Math.round(secondsPerMile % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}/mi`;
}

function getStepKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    warmup: 'WARMUP',
    work: 'INTERVAL',
    recovery: 'RECOVERY',
    cooldown: 'COOLDOWN',
    rest: 'REST',
  };
  return labels[kind] || kind.toUpperCase();
}

function getZoneColor(status: ZoneStatus): string {
  switch (status) {
    case 'in_zone':
      return 'text-green-400';
    case 'too_slow':
    case 'too_fast':
      return 'text-amber-400';
    case 'way_too_slow':
    case 'way_too_fast':
      return 'text-red-400';
    default:
      return 'text-gray-400';
  }
}

function getZoneIndicator(status: ZoneStatus): string {
  switch (status) {
    case 'in_zone':
      return '✅ IN ZONE';
    case 'too_slow':
      return '⬆️ PICK IT UP';
    case 'way_too_slow':
      return '⬆️⬆️ SPEED UP';
    case 'too_fast':
      return '⬇️ EASE OFF';
    case 'way_too_fast':
      return '⬇️⬇️ SLOW DOWN';
    default:
      return '';
  }
}

function getStepKindColor(kind: string): string {
  switch (kind) {
    case 'warmup':
      return 'bg-green-500/20 border-green-500/40';
    case 'work':
      return 'bg-amber-500/20 border-amber-500/40';
    case 'recovery':
    case 'rest':
      return 'bg-cyan-500/20 border-cyan-500/40';
    case 'cooldown':
      return 'bg-blue-500/20 border-blue-500/40';
    default:
      return 'bg-white/10 border-white/20';
  }
}

// ============================================================================
// Component
// ============================================================================

export const ExecutionScreen: React.FC<ExecutionScreenProps> = ({
  status,
  environment,
  currentStep,
  totalSteps,
  totalElapsedS,
  totalDistanceM,
  targetDistanceM,
  onPause,
  onResume,
  onSkip,
  onEnd,
}) => {
  const isPaused = status === 'paused';
  const isRunning = status === 'running';
  
  if (!currentStep) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-800 via-zinc-900 to-black flex items-center justify-center">
        <div className="text-white text-xl">Preparing...</div>
      </div>
    );
  }
  
  const { step, elapsed_s, remaining_s, distance_remaining_m, progress_pct, zone_status, current_hr_bpm, current_pace_s_per_mi, interval_number, total_intervals } = currentStep;
  
  // Determine what to show as the primary metric
  // Check both distance_m (normalized) and distanceMeters (v3 computed)
  const stepDistanceM = step.distance_m || (step as any).distanceMeters || 0;
  const isStepDistanceBased = stepDistanceM > 0;
  const isWorkoutDistanceBased = !!targetDistanceM && targetDistanceM > 0;
  const isIndoor = environment === 'indoor';
  
  // Primary display logic:
  // 1. Step has distance_m -> show step distance remaining
  // 2. Workout has target distance -> show workout distance remaining  
  // 3. Step has duration_s -> show time remaining
  // 4. Fallback -> show elapsed time
  let primaryValue: string;
  let primaryLabel: string;
  
  if (isStepDistanceBased && distance_remaining_m !== undefined) {
    // Step-level distance remaining
    if (isIndoor) {
      primaryValue = `~${Math.round(distance_remaining_m)}m`;
    } else {
      primaryValue = formatDistance(distance_remaining_m);
    }
    primaryLabel = 'to go';
  } else if (isWorkoutDistanceBased && !isIndoor) {
    // Workout-level distance remaining (for easy runs like "12 miles")
    const workoutDistanceRemaining = Math.max(0, targetDistanceM - totalDistanceM);
    primaryValue = formatDistance(workoutDistanceRemaining);
    primaryLabel = 'to go';
  } else if (remaining_s && remaining_s > 0) {
    // Time-based with remaining time
    primaryValue = formatTime(remaining_s);
    primaryLabel = 'remaining';
  } else {
    // Fallback: show elapsed time
    primaryValue = formatTime(elapsed_s || 0);
    primaryLabel = 'elapsed';
  }
  
  // Step header
  const stepLabel = step.kind === 'work' && interval_number && total_intervals
    ? `${getStepKindLabel(step.kind)} ${interval_number}`
    : getStepKindLabel(step.kind);
  
  const stepSubLabel = step.kind === 'work' && total_intervals
    ? `${currentStep.index + 1} of ${totalSteps}`
    : null;
  
  return (
    <div className={`min-h-screen flex flex-col ${getStepKindColor(step.kind)} bg-gradient-to-b from-zinc-800 via-zinc-900 to-black`}>
      {/* Header */}
      <div className="p-4 text-center border-b border-white/10">
        <div className="text-white text-xl font-light tracking-wide">
          {stepLabel}
        </div>
        {stepSubLabel && (
          <div className="text-gray-400 text-sm font-light">
            {stepSubLabel}
          </div>
        )}
      </div>
      
      {/* Primary Metric */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-white text-7xl font-light tracking-tight">
          {primaryValue}
        </div>
        <div className="text-gray-400 text-lg font-light mt-2">
          {primaryLabel}
        </div>
        
        {/* Progress Bar */}
        <div className="w-full max-w-xs mt-8">
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white/60 transition-all duration-500"
              style={{ width: `${Math.min(100, progress_pct)}%` }}
            />
          </div>
        </div>
      </div>
      
      {/* Metrics Row */}
      <div className="px-6 pb-4 space-y-3">
        {/* Heart Rate */}
        {current_hr_bpm && (
          <div className="flex items-center justify-between bg-white/[0.05] backdrop-blur rounded-xl p-4">
            <div className="flex items-center gap-3">
              <Heart className="w-5 h-5 text-red-400" />
              <span className="text-white text-2xl font-light">{current_hr_bpm}</span>
              <span className="text-gray-400 text-sm">bpm</span>
            </div>
            <div className={`text-sm font-light ${getZoneColor(zone_status)}`}>
              {getZoneIndicator(zone_status)}
            </div>
          </div>
        )}
        
        {/* Pace (outdoor only) */}
        {!isIndoor && current_pace_s_per_mi && (
          <div className="flex items-center justify-between bg-white/[0.05] backdrop-blur rounded-xl p-4">
            <div className="flex items-center gap-3">
              <span className="text-lg">🏃</span>
              <span className="text-white text-2xl font-light">{formatPace(current_pace_s_per_mi)}</span>
            </div>
            {step.pace_range && (
              <div className="text-gray-400 text-sm font-light">
                Target: {formatPace((step.pace_range.lower + step.pace_range.upper) / 2)}
              </div>
            )}
          </div>
        )}
        
        {/* Target reminder for indoor */}
        {isIndoor && step.pace_range && (
          <div className="flex items-center justify-center bg-white/[0.05] backdrop-blur rounded-xl p-4">
            <div className="text-gray-300 text-sm font-light">
              🎯 Target: {(3600 / ((step.pace_range.lower + step.pace_range.upper) / 2)).toFixed(1)} mph
            </div>
          </div>
        )}
        
        {/* Overall stats (small) */}
        <div className="flex items-center justify-center gap-6 text-gray-500 text-sm">
          <span>⏱ {formatTime(totalElapsedS)}</span>
          {!isIndoor && <span>📍 {formatDistance(totalDistanceM)}</span>}
        </div>
      </div>
      
      {/* Controls */}
      <div className="p-4 pb-8 flex items-center justify-center gap-4">
        {/* Pause/Resume */}
        <button
          onClick={isPaused ? onResume : onPause}
          className="w-16 h-16 rounded-full bg-white/[0.08] border-2 border-white/30 
                   hover:bg-white/[0.12] hover:border-white/50 transition-all duration-300
                   flex items-center justify-center"
        >
          {isPaused ? (
            <Play className="w-7 h-7 text-white ml-1" />
          ) : (
            <Pause className="w-7 h-7 text-white" />
          )}
        </button>
        
        {/* Skip */}
        <button
          onClick={onSkip}
          className="w-14 h-14 rounded-full bg-white/[0.05] border border-white/20 
                   hover:bg-white/[0.08] hover:border-white/30 transition-all duration-300
                   flex items-center justify-center"
        >
          <SkipForward className="w-5 h-5 text-gray-300" />
        </button>
        
        {/* End */}
        <button
          onClick={onEnd}
          className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 
                   hover:bg-red-500/20 hover:border-red-500/50 transition-all duration-300
                   flex items-center justify-center"
        >
          <Square className="w-5 h-5 text-red-400" />
        </button>
      </div>
      
      {/* Paused Overlay */}
      {isPaused && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50">
          <div className="text-white text-3xl font-light mb-4">PAUSED</div>
          <div className="text-gray-400 text-sm mb-8">
            {step.kind === 'work' && distance_remaining_m 
              ? `${Math.round(distance_remaining_m)}m remaining`
              : `${formatTime(remaining_s || 0)} remaining`
            }
          </div>
          <div className="flex flex-col gap-3 w-64">
            <button
              onClick={onResume}
              className="w-full py-4 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white 
                       text-lg font-light transition-colors"
            >
              ▶ RESUME
            </button>
            <button
              onClick={onSkip}
              className="w-full py-3 rounded-full bg-white/10 hover:bg-white/20 text-white 
                       text-sm font-light transition-colors"
            >
              ⏭ SKIP STEP
            </button>
            <button
              onClick={onEnd}
              className="w-full py-3 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-300 
                       text-sm font-light transition-colors"
            >
              ⏹ END WORKOUT
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExecutionScreen;


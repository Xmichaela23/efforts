/**
 * PostRunSummary - Quick Summary After Workout
 * 
 * Shows:
 * - Basic metrics (distance, duration, avg HR)
 * - Interval performance at a glance
 * - Links to full details (existing Summary/Context screens)
 */

import React from 'react';
import { Check, ChevronRight, Loader2 } from 'lucide-react';
import type { ExecutionSample, PlannedStep } from '@/types/workoutExecution';

interface IntervalResult {
  step: PlannedStep;
  avgPace?: number;
  avgHR?: number;
  duration_s: number;
  inZone: boolean;
}

interface PostRunSummaryProps {
  workoutDescription?: string;
  totalDistanceM: number;
  totalDurationS: number;
  avgHR?: number;
  intervals: IntervalResult[];
  isSaving: boolean;
  saveError?: string;
  onViewDetails: () => void;
  onDone: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDistance(meters: number): string {
  const miles = meters / 1609.34;
  return `${miles.toFixed(2)} mi`;
}

function formatPace(secondsPerMile: number | undefined): string {
  if (!secondsPerMile) return '--:--';
  const mins = Math.floor(secondsPerMile / 60);
  const secs = Math.round(secondsPerMile % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}/mi`;
}

// ============================================================================
// Component
// ============================================================================

export const PostRunSummary: React.FC<PostRunSummaryProps> = ({
  workoutDescription,
  totalDistanceM,
  totalDurationS,
  avgHR,
  intervals,
  isSaving,
  saveError,
  onViewDetails,
  onDone,
}) => {
  // Filter to just work intervals for display
  const workIntervals = intervals.filter(i => i.step.kind === 'work');
  
  // Calculate execution score (simple version - % of intervals in zone)
  const inZoneCount = workIntervals.filter(i => i.inZone).length;
  const executionScore = workIntervals.length > 0 
    ? Math.round((inZoneCount / workIntervals.length) * 100)
    : null;
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-800 via-zinc-900 to-black flex flex-col">
      {/* Header */}
      <div className="p-6 text-center border-b border-white/10">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cyan-500/20 border-2 border-cyan-500/50 
                      flex items-center justify-center">
          <Check className="w-8 h-8 text-cyan-400" />
        </div>
        <div className="text-white text-2xl font-light">COMPLETE</div>
      </div>
      
      {/* Workout Info */}
      <div className="p-4 border-b border-white/10">
        <div className="text-white text-lg font-light text-center">
          {workoutDescription || 'Workout'}
        </div>
      </div>
      
      {/* Primary Metrics */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-center gap-6">
          <div className="text-center">
            <div className="text-white text-2xl font-light">
              {formatDistance(totalDistanceM)}
            </div>
            <div className="text-gray-500 text-xs">DISTANCE</div>
          </div>
          <div className="w-px h-10 bg-white/20" />
          <div className="text-center">
            <div className="text-white text-2xl font-light">
              {formatTime(totalDurationS)}
            </div>
            <div className="text-gray-500 text-xs">DURATION</div>
          </div>
          {avgHR && (
            <>
              <div className="w-px h-10 bg-white/20" />
              <div className="text-center">
                <div className="text-white text-2xl font-light">
                  {avgHR}
                </div>
                <div className="text-gray-500 text-xs">AVG HR</div>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Interval Results */}
      {workIntervals.length > 0 && (
        <div className="p-4 flex-1 overflow-auto">
          <div className="text-gray-400 text-sm font-light mb-3">INTERVALS</div>
          <div className="grid grid-cols-3 gap-2">
            {workIntervals.map((interval, idx) => (
              <div 
                key={idx}
                className={`p-3 rounded-xl text-center 
                          ${interval.inZone 
                            ? 'bg-green-500/10 border border-green-500/30' 
                            : 'bg-amber-500/10 border border-amber-500/30'
                          }`}
              >
                <div className={`text-lg font-light ${interval.inZone ? 'text-green-300' : 'text-amber-300'}`}>
                  {formatPace(interval.avgPace)}
                </div>
                <div className="text-xs text-gray-500">
                  {interval.inZone ? '✅' : '⚠️'}
                </div>
              </div>
            ))}
          </div>
          
          {/* Execution Score */}
          {executionScore !== null && (
            <div className="mt-4 text-center">
              <span className="text-gray-400 text-sm">Execution: </span>
              <span className={`text-lg font-light
                            ${executionScore >= 80 ? 'text-green-400' : 
                              executionScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                {executionScore}%
              </span>
            </div>
          )}
        </div>
      )}
      
      {/* Save Status */}
      {isSaving && (
        <div className="p-4 flex items-center justify-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Saving workout...</span>
        </div>
      )}
      
      {saveError && (
        <div className="p-4 text-center text-red-400 text-sm">
          {saveError}
        </div>
      )}
      
      {/* Actions */}
      <div className="p-4 pb-8 space-y-3">
        <button
          onClick={onViewDetails}
          disabled={isSaving}
          className="w-full py-4 rounded-full bg-white/[0.08] border-2 border-white/30 
                   hover:bg-white/[0.12] hover:border-white/50 text-white text-lg font-light 
                   transition-all duration-300 flex items-center justify-center gap-2
                   disabled:opacity-50 disabled:cursor-not-allowed"
        >
          VIEW DETAILS
          <ChevronRight className="w-5 h-5" />
        </button>
        
        <button
          onClick={onDone}
          disabled={isSaving}
          className="w-full py-4 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white 
                   text-lg font-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          DONE
        </button>
      </div>
    </div>
  );
};

export default PostRunSummary;


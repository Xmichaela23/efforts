/**
 * PreRunScreen - Sensor Setup Before Workout
 * 
 * Shows:
 * - GPS status (outdoor only)
 * - HR strap connection
 * - Audio settings
 * - Workout summary
 * - Begin button (enabled when ready)
 */

import React, { useEffect, useState } from 'react';
import { MapPin, Heart, Volume2, VolumeX, Loader2, Check, X, AlertCircle, Settings } from 'lucide-react';
import type { WorkoutEnvironment, WorkoutEquipment, PlannedWorkoutStructure } from '@/types/workoutExecution';
import type { GPSStatus } from '@/hooks/workout-execution/useGeolocation';
import type { HRConnectionStatus } from '@/hooks/workout-execution/useBluetoothHR';

interface PreRunScreenProps {
  environment: WorkoutEnvironment;
  equipment: WorkoutEquipment;
  workoutType: 'run' | 'ride';
  workoutStructure: PlannedWorkoutStructure | null;
  workoutDescription?: string;
  
  // Sensor status
  gpsStatus: GPSStatus;
  gpsAccuracy?: number;
  hrStatus: HRConnectionStatus;
  hrDeviceName?: string;
  
  // Settings
  voiceEnabled: boolean;
  vibrationEnabled: boolean;
  
  // Actions
  onConnectHR: () => void;
  onToggleVoice: () => void;
  onOpenSettings: () => void;
  onBegin: () => void;
  onBack: () => void;
  
  // Can we start?
  canStart: boolean;
}

export const PreRunScreen: React.FC<PreRunScreenProps> = ({
  environment,
  equipment,
  workoutType,
  workoutStructure,
  workoutDescription,
  gpsStatus,
  gpsAccuracy,
  hrStatus,
  hrDeviceName,
  voiceEnabled,
  vibrationEnabled,
  onConnectHR,
  onToggleVoice,
  onOpenSettings,
  onBegin,
  onBack,
  canStart,
}) => {
  const isOutdoor = environment === 'outdoor';
  const isRun = workoutType === 'run';
  
  // Format total duration
  const totalMinutes = workoutStructure?.total_duration_seconds 
    ? Math.round(workoutStructure.total_duration_seconds / 60)
    : null;
  
  // Calculate target pace hint for treadmill
  const [paceHint, setPaceHint] = useState<string | null>(null);
  
  useEffect(() => {
    if (environment === 'indoor' && equipment === 'treadmill' && workoutStructure?.steps) {
      // Find work intervals to get target pace
      const workSteps = workoutStructure.steps.filter(s => s.kind === 'work');
      if (workSteps.length > 0 && workSteps[0].pace_range) {
        const { lower, upper } = workSteps[0].pace_range;
        // Convert s/mi to mph
        const lowerMph = (3600 / lower).toFixed(1);
        const upperMph = (3600 / upper).toFixed(1);
        setPaceHint(`${lowerMph}-${upperMph} mph`);
      }
    }
  }, [environment, equipment, workoutStructure]);
  
  // GPS Status Icon
  const renderGPSStatus = () => {
    switch (gpsStatus) {
      case 'acquiring':
        return (
          <div className="flex items-center gap-2 text-amber-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Searching...</span>
          </div>
        );
      case 'locked':
        return (
          <div className="flex items-center gap-2 text-green-400">
            <Check className="w-4 h-4" />
            <span>Locked {gpsAccuracy ? `(±${Math.round(gpsAccuracy)}m)` : ''}</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-2 text-red-400">
            <X className="w-4 h-4" />
            <span>Error</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2 text-gray-500">
            <span>Not needed</span>
          </div>
        );
    }
  };
  
  // HR Status Icon
  const renderHRStatus = () => {
    switch (hrStatus) {
      case 'connecting':
        return (
          <div className="flex items-center gap-2 text-amber-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Connecting...</span>
          </div>
        );
      case 'connected':
        return (
          <div className="flex items-center gap-2 text-green-400">
            <Check className="w-4 h-4" />
            <span>{hrDeviceName || 'Connected'}</span>
          </div>
        );
      case 'error':
        return (
          <button 
            onClick={onConnectHR}
            className="flex items-center gap-2 text-red-400 hover:text-red-300"
          >
            <AlertCircle className="w-4 h-4" />
            <span>Retry</span>
          </button>
        );
      default:
        return (
          <button 
            onClick={onConnectHR}
            className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300"
          >
            <span>Connect</span>
          </button>
        );
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-800 via-zinc-900 to-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <button 
          onClick={onBack}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ← Back
        </button>
        <div className="flex items-center gap-2">
          <span className="text-white/60 text-sm font-light tracking-wide">
            PREPARE
          </span>
          {environment === 'outdoor' ? (
            <span className="text-green-400 text-xs">Outdoor</span>
          ) : (
            <span className="text-blue-400 text-xs">{equipment === 'treadmill' ? 'Treadmill' : 'Trainer'}</span>
          )}
        </div>
        <button 
          onClick={onOpenSettings}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
      
      {/* Workout Info */}
      <div className="p-4 border-b border-white/10">
        <div className="text-white text-lg font-light">
          {workoutDescription || 'Workout'}
        </div>
        {totalMinutes && (
          <div className="text-gray-400 text-sm font-light mt-1">
            ~{totalMinutes} minutes
          </div>
        )}
      </div>
      
      {/* Sensor Status */}
      <div className="flex-1 p-4 space-y-4">
        {/* GPS Row (outdoor only) */}
        <div className={`bg-white/[0.05] backdrop-blur-lg border border-white/20 rounded-xl p-4
                       ${!isOutdoor ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MapPin className={`w-5 h-5 ${isOutdoor ? 'text-white' : 'text-gray-500'}`} />
              <span className={`${isOutdoor ? 'text-white' : 'text-gray-500'}`}>
                GPS
              </span>
            </div>
            {renderGPSStatus()}
          </div>
        </div>
        
        {/* HR Row */}
        <div className="bg-white/[0.05] backdrop-blur-lg border border-white/20 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Heart className="w-5 h-5 text-white" />
              <span className="text-white">Heart Rate</span>
            </div>
            {renderHRStatus()}
          </div>
        </div>
        
        {/* Audio Row */}
        <button 
          onClick={onToggleVoice}
          className="w-full bg-white/[0.05] backdrop-blur-lg border border-white/20 rounded-xl p-4 text-left"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {voiceEnabled ? (
                <Volume2 className="w-5 h-5 text-white" />
              ) : (
                <VolumeX className="w-5 h-5 text-gray-500" />
              )}
              <span className="text-white">Audio</span>
            </div>
            <span className="text-cyan-400">
              {voiceEnabled 
                ? (vibrationEnabled ? 'Voice + Vibe' : 'Voice only')
                : (vibrationEnabled ? 'Vibe only' : 'Silent')
              }
            </span>
          </div>
          <div className="mt-3 text-gray-400 text-xs font-light leading-relaxed">
            {voiceEnabled ? (
              <>
                Says "Hard", "Rest", "Cooldown" at changes.
                <br />
                Music ducks briefly for announcements.
              </>
            ) : vibrationEnabled ? (
              <>
                Vibrates at interval changes. No voice.
                <br />
                Music plays uninterrupted.
              </>
            ) : (
              <>
                No audio or vibration feedback.
                <br />
                Watch screen for interval changes.
              </>
            )}
          </div>
        </button>
        
        {/* Treadmill Pace Hint */}
        {environment === 'indoor' && equipment === 'treadmill' && paceHint && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-amber-200 text-sm font-light">
                  Set treadmill to target pace
                </div>
                <div className="text-amber-100 text-lg font-light mt-1">
                  {paceHint}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Begin Button - with safe area padding for mobile */}
      <div className="p-4 pb-safe" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 2rem))' }}>
        <button
          onClick={onBegin}
          disabled={!canStart}
          className={`w-full py-4 rounded-full text-lg font-light tracking-wide transition-all duration-300
                    ${canStart 
                      ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/25' 
                      : 'bg-white/10 text-gray-500 cursor-not-allowed'
                    }`}
        >
          {isRun ? 'BEGIN RUN' : 'BEGIN RIDE'}
        </button>
        
        {!canStart && isOutdoor && gpsStatus === 'acquiring' && (
          <p className="text-center text-gray-500 text-sm mt-3">
            Waiting for GPS lock...
          </p>
        )}
        
        {!isOutdoor && (
          <p className="text-center text-gray-500 text-sm mt-3">
            Put phone in armband before starting
          </p>
        )}
      </div>
    </div>
  );
};

export default PreRunScreen;


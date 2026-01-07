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
  
  // Discipline colors
  const disciplineColor = isRun ? 'teal' : 'green';
  const accentClasses = isRun 
    ? { text: 'text-teal-400', border: 'border-teal-500/30', bg: 'bg-teal-600', hoverBg: 'hover:bg-teal-500' }
    : { text: 'text-green-400', border: 'border-green-500/30', bg: 'bg-green-600', hoverBg: 'hover:bg-green-500' };
  
  return (
    <div 
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(to bottom, #27272a, #18181b, #000000)',
      }}
    >
      {/* Header Card - Like StrengthLogger */}
      <div className="bg-white/[0.05] backdrop-blur-xl border-2 border-white/20 pb-4 mb-4 mx-3 mt-3 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]">
        {/* Top bar */}
        <div className="flex items-center justify-between p-4">
          <button 
            onClick={onBack}
            className="text-sm px-3 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-md border-2 border-white/20 text-white/90 hover:bg-white/[0.12] hover:border-white/30 transition-all duration-300"
          >
            ← Back
          </button>
          <span className={`text-sm font-medium ${accentClasses.text}`}>
            {environment === 'outdoor' ? 'Outdoor' : (equipment === 'treadmill' ? 'Treadmill' : 'Trainer')}
          </span>
          <button 
            onClick={onOpenSettings}
            className="text-gray-400 hover:text-white transition-colors p-2"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
        
        {/* Workout Info */}
        <div className="px-4 pb-2">
          <div className="text-white text-lg font-light">
            {workoutDescription || 'Workout'}
          </div>
          {totalMinutes && (
            <div className="text-gray-400 text-sm font-light mt-1">
              ~{totalMinutes} minutes
            </div>
          )}
        </div>
      </div>
      
      {/* Sensor Status Cards */}
      <div className="flex-1 px-3 space-y-3">
        {/* GPS Row (outdoor only) */}
        <div className={`bg-white/[0.05] backdrop-blur-xl border-2 ${accentClasses.border} rounded-2xl p-4
                       shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]
                       ${!isOutdoor ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MapPin className={`w-5 h-5 ${isOutdoor ? accentClasses.text : 'text-gray-500'}`} />
              <span className={`${isOutdoor ? 'text-white' : 'text-gray-500'}`}>
                GPS
              </span>
            </div>
            {renderGPSStatus()}
          </div>
        </div>
        
        {/* HR Row */}
        <div className={`bg-white/[0.05] backdrop-blur-xl border-2 ${accentClasses.border} rounded-2xl p-4
                        shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]`}>
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
          className={`w-full bg-white/[0.05] backdrop-blur-xl border-2 ${accentClasses.border} rounded-2xl p-4 text-left
                     shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {voiceEnabled ? (
                <Volume2 className={`w-5 h-5 ${accentClasses.text}`} />
              ) : (
                <VolumeX className="w-5 h-5 text-gray-500" />
              )}
              <span className="text-white">Audio</span>
            </div>
            <span className={accentClasses.text}>
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
          <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]">
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
      
      {/* Begin Button - fixed to bottom with safe area */}
      <div className="sticky bottom-0 left-0 right-0 px-3 pb-10 pt-4 bg-gradient-to-t from-black via-black/95 to-transparent">
        <button
          onClick={onBegin}
          disabled={!canStart}
          className={`w-full py-4 rounded-2xl text-lg font-medium tracking-wide transition-all duration-300 border-2
                    ${canStart 
                      ? `${accentClasses.bg} ${accentClasses.hoverBg} ${accentClasses.border} text-white shadow-lg` 
                      : 'bg-white/10 border-white/20 text-gray-500 cursor-not-allowed'
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


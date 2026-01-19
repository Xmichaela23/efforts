import React from 'react';
import { X, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ValidationReason {
  code: string;
  message: string;
  data?: any;
}

interface CoachOption {
  rank: 1 | 2 | 3 | 4 | 5;
  label: string;
  action: 'move' | 'split' | 'skip';
  targetDateOffset?: number;
  riskLevel: 'safe' | 'moderate' | 'high';
  tags: string[];
  analysis: {
    physiological: string;
    scheduling: string;
    verdict: string;
  };
}

interface ValidationResult {
  severity: 'green' | 'yellow' | 'red';
  reasons: ValidationReason[];
  before: {
    dailyWorkload: number;
    weekWorkload: number;
  };
  after: {
    dailyWorkload: number;
    weekWorkload: number;
  };
  suggestions?: string[];
  planContext?: {
    isPlanWorkout: boolean;
    planName?: string;
    canonicalDate?: string;
    daysFromCanonical?: number;
    planPhase?: string;
    weekIntent?: string;
    isRecoveryWeek?: boolean;
    isTaperWeek?: boolean;
  };
  conflicts?: {
    sameTypeWorkouts: Array<{ id: string; name: string; type: string }>;
  };
  coachOptions?: CoachOption[];
}

interface RescheduleValidationPopupProps {
  workoutId: string;
  workoutName: string;
  oldDate: string;
  newDate: string;
  validation: ValidationResult;
  onConfirm: () => void;
  onCancel: () => void;
  onSuggestionClick?: (date: string) => void;
  onCoachOptionClick?: (option: CoachOption) => void;
}

export default function RescheduleValidationPopup({
  workoutId,
  workoutName,
  oldDate,
  newDate,
  validation,
  onConfirm,
  onCancel,
  onSuggestionClick,
  onCoachOptionClick,
}: RescheduleValidationPopupProps) {
  const { severity, reasons, before, after, suggestions, planContext, conflicts, coachOptions } = validation;
  
  // Debug: log validation result
  React.useEffect(() => {
    console.log('[RescheduleValidationPopup] Validation result:', {
      severity,
      reasonsCount: reasons?.length || 0,
      reasons,
      suggestionsCount: suggestions?.length || 0,
      suggestions,
      planContext,
      before,
      after
    });
  }, [validation]);

  // Format date for display
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr + 'T12:00:00');
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Get severity colors and icon
  const getSeverityStyles = () => {
    switch (severity) {
      case 'green':
        return {
          icon: CheckCircle2,
          iconColor: 'text-green-400',
          bgGradient: 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(34,197,94,0.05) 50%, rgba(255,255,255,0.03) 100%)',
          borderColor: 'rgba(34, 197, 94, 0.3)',
          rgb: '34, 197, 94',
        };
      case 'yellow':
        return {
          icon: AlertTriangle,
          iconColor: 'text-yellow-400',
          bgGradient: 'linear-gradient(135deg, rgba(250,204,21,0.15) 0%, rgba(250,204,21,0.05) 50%, rgba(255,255,255,0.03) 100%)',
          borderColor: 'rgba(250, 204, 21, 0.3)',
          rgb: '250, 204, 21',
        };
      case 'red':
        return {
          icon: AlertCircle,
          iconColor: 'text-red-400',
          bgGradient: 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.05) 50%, rgba(255,255,255,0.03) 100%)',
          borderColor: 'rgba(239, 68, 68, 0.3)',
          rgb: '239, 68, 68',
        };
    }
  };

  const styles = getSeverityStyles();
  const Icon = styles.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop with gradient */}
      <div
        className="absolute inset-0 backdrop-blur-md"
        style={{
          background: `linear-gradient(to bottom, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.5)),
                        radial-gradient(circle at 50% 50%, rgba(${styles.rgb}, 0.1) 0%, transparent 70%)`
        }}
        onClick={onCancel}
      />

      {/* Panel with glassmorphism */}
      <div
        className="relative w-full max-w-lg mx-4 mb-4 p-6 rounded-2xl backdrop-blur-xl border-2 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] animate-slide-up"
        style={{
          background: styles.bgGradient,
          borderColor: styles.borderColor,
        }}
      >
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1 rounded-full bg-white/[0.08] backdrop-blur-md border border-white/20 text-white/60 hover:text-white hover:bg-white/[0.12] transition-all"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <Icon className={`h-6 w-6 ${styles.iconColor} flex-shrink-0 mt-0.5`} />
          <div className="flex-1">
            <h3 className="text-lg font-light text-white mb-1">
              {severity === 'green' ? 'Good to reschedule' : severity === 'yellow' ? 'Reschedule with caution' : 'Cannot reschedule'}
            </h3>
            <p className="text-sm text-white/70 font-light">
              {workoutName}
            </p>
            {oldDate !== newDate && (
              <p className="text-xs text-white/50 mt-1">
                {formatDate(oldDate)} → {formatDate(newDate)}
              </p>
            )}
            {oldDate === newDate && coachOptions && (
              <p className="text-xs text-white/50 mt-1">
                Select a recommended option below
              </p>
            )}
          </div>
        </div>

        {/* Plan context */}
        {planContext?.isPlanWorkout && (
          <div className="mb-4 p-3 rounded-xl bg-white/[0.05] backdrop-blur-md border border-white/10">
            <p className="text-xs text-white/60 font-light">
              Part of <span className="text-white/80">{planContext.planName || 'training plan'}</span>
              {planContext.planPhase && (
                <span className="ml-1 text-white/70">
                  • {planContext.planPhase.charAt(0).toUpperCase() + planContext.planPhase.slice(1)}
                  {planContext.weekIntent && planContext.weekIntent !== planContext.planPhase && (
                    <span className="text-white/50"> ({planContext.weekIntent})</span>
                  )}
                </span>
              )}
              {(planContext.isRecoveryWeek || planContext.isTaperWeek) && (
                <span className="ml-1 block mt-1 text-white/70">
                  {planContext.isRecoveryWeek && '🔄 Recovery Week: Prioritizing freshness over volume'}
                  {planContext.isTaperWeek && '📉 Taper Week: Reducing load for race readiness'}
                </span>
              )}
              {planContext.canonicalDate && planContext.daysFromCanonical !== undefined && planContext.daysFromCanonical !== 0 && (
                <span className="ml-1 block mt-1">
                  {planContext.daysFromCanonical > 0 ? '+' : ''}{planContext.daysFromCanonical} days from planned date
                </span>
              )}
            </p>
          </div>
        )}

        {/* Conflicts */}
        {conflicts && conflicts.sameTypeWorkouts.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-yellow-500/10 backdrop-blur-md border border-yellow-500/20">
            <p className="text-xs text-yellow-400/80 font-light mb-2">
              ⚠️ Same type workout(s) on this day will be replaced:
            </p>
            <div className="space-y-1">
              {conflicts.sameTypeWorkouts.map((conflict, idx) => (
                <p key={idx} className="text-xs text-white/70 font-light">
                  • {conflict.name || `${conflict.type} workout`}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Coach Brain Options - Show FIRST if available */}
        {coachOptions && coachOptions.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-white/60 font-light mb-3">Coach's recommendations:</p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {coachOptions.map((option, idx) => {
                const getRiskColor = () => {
                  switch (option.riskLevel) {
                    case 'safe': return 'rgba(34, 197, 94, 0.2)';
                    case 'moderate': return 'rgba(250, 204, 21, 0.2)';
                    case 'high': return 'rgba(239, 68, 68, 0.2)';
                  }
                };
                const getRiskBorder = () => {
                  switch (option.riskLevel) {
                    case 'safe': return 'rgba(34, 197, 94, 0.4)';
                    case 'moderate': return 'rgba(250, 204, 21, 0.4)';
                    case 'high': return 'rgba(239, 68, 68, 0.4)';
                  }
                };

                // Calculate target date if it's a move action
                let targetDate: string | null = null;
                if (option.action === 'move' && option.targetDateOffset !== undefined) {
                  const oldDateObj = new Date(oldDate + 'T12:00:00');
                  oldDateObj.setDate(oldDateObj.getDate() + option.targetDateOffset);
                  targetDate = oldDateObj.toISOString().split('T')[0];
                }

                return (
                  <div
                    key={idx}
                    className="p-4 rounded-xl backdrop-blur-md border-2"
                    style={{
                      background: getRiskColor(),
                      borderColor: getRiskBorder(),
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-light text-white/50">#{option.rank}</span>
                          <h4 className="text-sm font-light text-white">{option.label}</h4>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            option.riskLevel === 'safe' ? 'bg-green-500/20 text-green-400' :
                            option.riskLevel === 'moderate' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {option.riskLevel}
                          </span>
                        </div>
                        {option.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {option.tags.map((tag, tagIdx) => (
                              <span key={tagIdx} className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-white/50">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Analysis */}
                    <div className="mt-3 space-y-2 text-xs">
                      <div>
                        <p className="text-white/60 font-light mb-1">📉 Physiology:</p>
                        <p className="text-white/80 font-light">{option.analysis.physiological}</p>
                      </div>
                      <div>
                        <p className="text-white/60 font-light mb-1">⚡ Scheduling:</p>
                        <p className="text-white/80 font-light">{option.analysis.scheduling}</p>
                      </div>
                      <div className="pt-2 border-t border-white/10">
                        <p className="text-white font-light">{option.analysis.verdict}</p>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="mt-4 pt-3 border-t border-white/10">
                      {option.action === 'move' && targetDate && (
                        <button
                          onClick={() => {
                            if (onCoachOptionClick) {
                              onCoachOptionClick(option);
                            } else if (onSuggestionClick) {
                              onSuggestionClick(targetDate);
                            }
                          }}
                          className="w-full px-4 py-2.5 rounded-lg bg-white/[0.1] backdrop-blur-md border border-white/20 text-white font-light hover:bg-white/[0.15] hover:border-white/30 transition-all text-sm"
                        >
                          Move to {formatDate(targetDate)}
                        </button>
                      )}
                      {option.action === 'skip' && (
                        <button
                          onClick={() => onCoachOptionClick?.(option)}
                          className="w-full px-4 py-2.5 rounded-lg bg-white/[0.1] backdrop-blur-md border border-white/20 text-white font-light hover:bg-white/[0.15] hover:border-white/30 transition-all text-sm"
                        >
                          Skip This Workout
                        </button>
                      )}
                      {option.action === 'split' && (
                        <button
                          onClick={() => {
                            alert('Split functionality coming soon. For now, you can manually create two shorter workouts.');
                          }}
                          className="w-full px-4 py-2.5 rounded-lg bg-white/[0.1] backdrop-blur-md border border-white/20 text-white font-light hover:bg-white/[0.15] hover:border-white/30 transition-all text-sm opacity-60"
                          disabled
                        >
                          Split Workout (Coming Soon)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Reasons - Only show if no coach options OR if date has changed */}
        {(!coachOptions || coachOptions.length === 0 || oldDate !== newDate) && reasons && reasons.length > 0 ? (
          <div className="mb-4 space-y-2">
            <p className="text-xs text-white/60 font-light mb-2">
              {severity === 'red' ? 'Issues preventing reschedule:' : 'Validation warnings:'}
            </p>
            {reasons.map((reason, idx) => {
              // Generate actionable suggestions based on reason code
              const getSuggestion = (code: string, data?: any) => {
                switch (code) {
                  case 'long_plus_strength':
                    return 'Move the strength workout to another day, or move this long run to a day without strength';
                  case 'workload_cap_exceeded':
                    return `Move one of the existing workouts on ${formatDate(newDate)} to reduce daily workload below 120`;
                  case 'hard_consecutive':
                    return data?.adjacentDay ? `Move this workout to avoid consecutive hard days with ${formatDate(data.adjacentDay)}` : 'Move this workout to avoid consecutive hard days';
                  case 'long_adjacent':
                    return data?.adjacentDay ? `Move this long run to avoid being adjacent to another long session on ${formatDate(data.adjacentDay)}` : 'Move this long run to avoid being adjacent to another long session';
                  case 'lower_strength_spacing':
                    return 'Move this strength workout to allow at least 2 days between lower body sessions';
                  case 'hard_within_2_days':
                    return 'Move this workout to allow at least 2 days between hard workouts';
                  default:
                    return null;
                }
              };

              const suggestion = getSuggestion(reason.code, reason.data);

              return (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-white/[0.05] backdrop-blur-md border border-white/10"
                >
                  <p className="text-sm text-white/90 font-light mb-1">{reason.message}</p>
                  {suggestion && (
                    <p className="text-xs text-white/60 font-light mt-1 italic">
                      💡 {suggestion}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          severity === 'green' && (
            <div className="mb-4 p-3 rounded-xl bg-white/[0.05] backdrop-blur-md border border-white/10">
              <p className="text-sm text-white/70 font-light">No issues detected with this reschedule.</p>
            </div>
          )
        )}

        {/* Workload impact */}
        <div className="mb-4 p-3 rounded-xl bg-white/[0.05] backdrop-blur-md border border-white/10">
          <p className="text-xs text-white/60 font-light mb-2">Workload impact</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/70 font-light">Daily</span>
            <span className="text-white font-light">
              {before.dailyWorkload} → <span className={after.dailyWorkload > before.dailyWorkload ? 'text-yellow-400' : 'text-white'}>{after.dailyWorkload}</span>
            </span>
          </div>
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-white/70 font-light">Weekly</span>
            <span className="text-white font-light">
              {before.weekWorkload} → <span className={after.weekWorkload > before.weekWorkload ? 'text-yellow-400' : 'text-white'}>{after.weekWorkload}</span>
            </span>
          </div>
        </div>

        {/* Fallback: Simple suggestions if no coach options */}
        {(!coachOptions || coachOptions.length === 0) && suggestions && suggestions.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-white/60 font-light mb-2">Better dates:</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((date, idx) => (
                <button
                  key={idx}
                  onClick={() => onSuggestionClick?.(date)}
                  className="px-3 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-md border border-white/20 text-white/80 hover:bg-white/[0.12] hover:border-white/30 transition-all text-xs font-light"
                >
                  {formatDate(date)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded-xl font-light text-white/60 hover:text-white/80 bg-white/[0.05] backdrop-blur-md border-2 border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300"
          >
            Cancel
          </button>
          {severity !== 'red' && (
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-3 rounded-xl font-light backdrop-blur-md border-2 transition-all duration-300 shadow-[0_0_0_1px_rgba(255,255,255,0.1)_inset] text-white"
              style={{
                backgroundColor: `rgba(${styles.rgb}, 0.6)`,
                borderColor: `rgba(${styles.rgb}, 0.8)`,
              }}
            >
              Confirm reschedule
            </button>
          )}
        </div>
      </div>

      <style>{`
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
      `}</style>
    </div>
  );
}

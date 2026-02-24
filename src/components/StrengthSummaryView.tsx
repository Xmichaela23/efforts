import React from 'react';
import { useExerciseLog } from '@/hooks/useExerciseLog';
import { canonicalize } from '@/lib/canonicalize';

interface StrengthSummaryViewProps {
  workoutData: any;
}

interface HistoricalSession {
  date: string;
  sets: number;
  reps: number;
  weight: number;
  isPR: boolean;
  percentOfMax: number;
}

const StrengthSummaryView: React.FC<StrengthSummaryViewProps> = ({ workoutData }) => {
  const { liftTrends, loading } = useExerciseLog(12);

  const getCurrentExercises = () => {
    if (workoutData.strength_exercises && workoutData.strength_exercises.length > 0) {
      return workoutData.strength_exercises;
    }
    if (workoutData.completed_exercises && workoutData.completed_exercises.length > 0) {
      return workoutData.completed_exercises;
    }
    return [];
  };

  const currentExercises = getCurrentExercises();
  const trendsByCanonical = new Map(liftTrends.map(t => [t.canonical, t]));

  const getHistoricalData = (): Record<string, HistoricalSession[]> => {
    const exerciseHistory: Record<string, HistoricalSession[]> = {};

    currentExercises.forEach((currentExercise: any) => {
      const exerciseName = currentExercise.name ?? '';
      const canonical = canonicalize(exerciseName);
      const trend = trendsByCanonical.get(canonical);
      if (!trend || trend.entries.length === 0) return;

      const sessions = trend.entries
        .slice(-4)
        .reverse()
        .map((entry, index) => {
          const allWeights = trend.entries.map(e => e.best_weight);
          const maxWeight = Math.max(...allWeights);
          return {
            date: entry.date,
            sets: entry.sets_completed,
            reps: entry.best_reps,
            weight: entry.best_weight,
            isPR: entry.best_weight === maxWeight && index === 0,
            percentOfMax: maxWeight > 0 ? Math.round((entry.best_weight / maxWeight) * 100) : 0,
          } as HistoricalSession;
        });

      if (sessions.length > 0) {
        exerciseHistory[exerciseName] = sessions;
      }
    });

    return exerciseHistory;
  };

  const historicalData = getHistoricalData();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const isToday = dateString === today.toLocaleDateString('en-CA');
    const isYesterday = dateString === yesterday.toLocaleDateString('en-CA');

    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        Loading progression data...
      </div>
    );
  }

  return (
    <div className="space-y-6" style={{ fontFamily: 'Inter, sans-serif' }}>
      {Object.entries(historicalData).map(([exerciseName, sessions]) => (
        <div key={exerciseName} className="space-y-3">
          <h3 className="font-semibold text-gray-900">
            {exerciseName} — Last {sessions.length} sessions
          </h3>

          <div className="space-y-2">
            {sessions.map((session, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span className="text-gray-600">
                  {formatDate(session.date)}: {session.sets}x{session.reps} @ {session.weight} lbs
                  {session.isPR && <span className="text-gray-900"> (PR)</span>}
                </span>
                <span className="text-gray-500">{session.percentOfMax}% of max</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {Object.keys(historicalData).length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No historical data available. Progression data is built as you complete workouts.
        </div>
      )}
    </div>
  );
};

export default StrengthSummaryView;

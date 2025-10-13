import React from 'react';

interface WeeklyAIDisplayProps {
  weeklyAI?: {
    overallScore: number;
    adherenceScore: number;
    keyInsight: string;
    recommendation: string;
  };
  compact?: boolean;
}

const WeeklyAIDisplay: React.FC<WeeklyAIDisplayProps> = ({ weeklyAI, compact = false }) => {
  if (!weeklyAI) {
    return null;
  }

  if (compact) {
    return (
      <div className="space-y-2">
        {/* Compact Score Display */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Score</span>
          <span className="text-xs font-medium">{weeklyAI.overallScore}/100</span>
        </div>

        {/* Compact Summary */}
        <div className="text-xs text-gray-600 line-clamp-2">
          {weeklyAI.keyInsight}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Score Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-lg font-medium">{weeklyAI.overallScore}</div>
          <div className="text-xs text-gray-600">Overall</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-medium">{weeklyAI.adherenceScore}</div>
          <div className="text-xs text-gray-600">Adherence</div>
        </div>
      </div>

      {/* Key Insight */}
      <div className="border-t pt-3">
        <div className="text-sm font-medium mb-1">Insight</div>
        <p className="text-sm text-gray-600">{weeklyAI.keyInsight}</p>
      </div>

      {/* Recommendation */}
      <div className="border-t pt-3">
        <div className="text-sm font-medium mb-1">Recommendation</div>
        <p className="text-sm text-gray-600">{weeklyAI.recommendation}</p>
      </div>
    </div>
  );
};

export default WeeklyAIDisplay;

import React from 'react';

interface WorkoutAIDisplayProps {
  aiAnalysis?: {
    performanceScore: number;
    effortLevel: string;
    keyInsight: string;
    recommendation: string;
  };
}

const WorkoutAIDisplay: React.FC<WorkoutAIDisplayProps> = ({ aiAnalysis }) => {
  if (!aiAnalysis) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Performance Score */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">Performance</span>
        <span className="text-sm font-medium">{aiAnalysis.performanceScore}/100</span>
      </div>

      {/* Effort Level */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">Effort</span>
        <span className="text-sm font-medium">{aiAnalysis.effortLevel.replace('_', ' ')}</span>
      </div>

      {/* Key Insight */}
      <div className="border-t pt-3">
        <div className="text-sm font-medium mb-1">Insight</div>
        <p className="text-sm text-gray-600">{aiAnalysis.keyInsight}</p>
      </div>

      {/* Recommendation */}
      <div className="border-t pt-3">
        <div className="text-sm font-medium mb-1">Recommendation</div>
        <p className="text-sm text-gray-600">{aiAnalysis.recommendation}</p>
      </div>
    </div>
  );
};

export default WorkoutAIDisplay;

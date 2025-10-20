import React from 'react';

interface WorkoutAIDisplayProps {
  aiAnalysis?: {
    performanceScore: number;
    effortLevel: string;
    keyInsight: string;
    recommendation: string;
  };
  workoutAnalysis?: {
    execution_grade?: string;
    insights?: string[];
    strengths?: string[];
    key_metrics?: any;
    red_flags?: string[];
    analysis?: {
      adherence_percentage?: number;
      execution_quality?: {
        overall_grade?: string;
        primary_issues?: string[];
        strengths?: string[];
      };
    };
  };
}

const WorkoutAIDisplay: React.FC<WorkoutAIDisplayProps> = ({ aiAnalysis, workoutAnalysis }) => {
  // Show new granular analysis if available, otherwise fall back to old AI analysis
  if (workoutAnalysis?.analysis) {
    const analysis = workoutAnalysis.analysis;
    const executionQuality = analysis.execution_quality;
    
    return (
      <div className="space-y-3">
        {/* Adherence Score */}
        {analysis.adherence_percentage !== undefined && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Adherence</span>
            <span className="text-sm font-medium">{analysis.adherence_percentage}%</span>
          </div>
        )}

        {/* Execution Grade */}
        {executionQuality?.overall_grade && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Execution</span>
            <span className={`text-sm font-medium ${
              executionQuality.overall_grade === 'A' ? 'text-green-600' :
              executionQuality.overall_grade === 'B' ? 'text-blue-600' :
              executionQuality.overall_grade === 'C' ? 'text-yellow-600' :
              executionQuality.overall_grade === 'D' ? 'text-orange-600' :
              'text-red-600'
            }`}>
              {executionQuality.overall_grade}
            </span>
          </div>
        )}

        {/* Primary Issues */}
        {executionQuality?.primary_issues && executionQuality.primary_issues.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-sm font-medium mb-2 text-red-600">Areas to Improve</div>
            <ul className="space-y-1">
              {executionQuality.primary_issues.map((issue, index) => (
                <li key={index} className="text-sm text-gray-600">• {issue}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Strengths */}
        {executionQuality?.strengths && executionQuality.strengths.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-sm font-medium mb-2 text-green-600">Strengths</div>
            <ul className="space-y-1">
              {executionQuality.strengths.map((strength, index) => (
                <li key={index} className="text-sm text-gray-600">• {strength}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Fallback to old insights if no new analysis structure */}
        {!executionQuality && workoutAnalysis.insights && workoutAnalysis.insights.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-sm font-medium mb-1">Insights</div>
            <ul className="space-y-1">
              {workoutAnalysis.insights.map((insight, index) => (
                <li key={index} className="text-sm text-gray-600">• {insight}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Fallback to old AI analysis format
  if (aiAnalysis) {
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
  }

  return null;
};

export default WorkoutAIDisplay;

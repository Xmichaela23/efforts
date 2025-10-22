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
    const granularAnalysis = analysis.analysis || analysis;
    const executionQuality = granularAnalysis.execution_quality;
    
    return (
      <div className="space-y-3">
        {/* Adherence Score */}
        {granularAnalysis.overall_adherence !== undefined && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Adherence</span>
            <span className="text-sm font-medium">{Math.round(granularAnalysis.overall_adherence * 100)}%</span>
          </div>
        )}

        {/* Heart Rate Analysis */}
        {granularAnalysis.heart_rate_analysis && granularAnalysis.heart_rate_analysis.available && (
          <div className="border-t pt-3">
            <div className="text-sm font-medium mb-2 text-blue-600">Heart Rate Analysis</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Avg HR</span>
                <span className="text-sm font-medium">{granularAnalysis.heart_rate_analysis.average_heart_rate} bpm</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">HR Drift</span>
                <span className={`text-sm font-medium ${
                  granularAnalysis.heart_rate_analysis.hr_drift_bpm > 5 ? 'text-orange-600' :
                  granularAnalysis.heart_rate_analysis.hr_drift_bpm < -5 ? 'text-green-600' :
                  'text-gray-600'
                }`}>
                  {granularAnalysis.heart_rate_analysis.hr_drift_bpm > 0 ? '+' : ''}{granularAnalysis.heart_rate_analysis.hr_drift_bpm} bpm
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Consistency</span>
                <span className="text-sm font-medium">{granularAnalysis.heart_rate_analysis.hr_consistency_percent}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Execution Grade as Percentage */}
        {granularAnalysis.execution_grade && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Execution</span>
            <span className={`text-sm font-medium ${
              granularAnalysis.overall_adherence >= 0.9 ? 'text-green-600' :
              granularAnalysis.overall_adherence >= 0.8 ? 'text-blue-600' :
              granularAnalysis.overall_adherence >= 0.7 ? 'text-yellow-600' :
              granularAnalysis.overall_adherence >= 0.6 ? 'text-orange-600' :
              'text-red-600'
            }`}>
              {Math.round(granularAnalysis.overall_adherence * 100)}%
            </span>
          </div>
        )}

        {/* Primary Issues */}
        {granularAnalysis.primary_issues && granularAnalysis.primary_issues.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-sm font-medium mb-2 text-red-600">Areas to Improve</div>
            <ul className="space-y-1">
              {granularAnalysis.primary_issues.map((issue, index) => (
                <li key={index} className="text-sm text-gray-600">• {issue}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Strengths */}
        {granularAnalysis.strengths && granularAnalysis.strengths.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-sm font-medium mb-2 text-green-600">Strengths</div>
            <ul className="space-y-1">
              {granularAnalysis.strengths.map((strength, index) => (
                <li key={index} className="text-sm text-gray-600">• {strength}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Heart Rate Recommendations */}
        {granularAnalysis.heart_rate_analysis && granularAnalysis.heart_rate_analysis.recommendations && granularAnalysis.heart_rate_analysis.recommendations.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-sm font-medium mb-2 text-blue-600">HR Recommendations</div>
            <ul className="space-y-1">
              {granularAnalysis.heart_rate_analysis.recommendations.slice(0, 3).map((rec, index) => (
                <li key={index} className="text-sm text-gray-600">• {rec}</li>
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

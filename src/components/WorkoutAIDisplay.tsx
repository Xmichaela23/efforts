import React from 'react';

interface WorkoutAIDisplayProps {
  aiAnalysis?: {
    performanceScore: number;
    effortLevel: string;
    keyInsight: string;
    recommendation: string;
  };
  workoutAnalysis?: {
    performance_assessment?: string;
    insights?: string[];
    strengths?: string[];
    key_metrics?: any;
    red_flags?: string[];
    narrative_insights?: string[];
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
  // Show narrative insights at the top if available
  const narrativeInsights = workoutAnalysis?.narrative_insights;
  
  // Show new granular analysis if available, otherwise fall back to old AI analysis
  if (workoutAnalysis?.analysis) {
    const analysis = workoutAnalysis.analysis;
    const granularAnalysis = analysis.analysis || analysis;
    const executionQuality = granularAnalysis.execution_quality;
    
    return (
      <div className="space-y-3">
        {/* AI Narrative Insights - Show at top */}
        {narrativeInsights && Array.isArray(narrativeInsights) && narrativeInsights.length > 0 && (
          <div className="border-b pb-3 mb-3">
            <div className="text-sm font-medium mb-2 text-gray-900">Analysis</div>
            <div className="space-y-2">
              {narrativeInsights.map((insight, index) => (
                <p key={index} className="text-sm text-gray-700 leading-relaxed">{insight}</p>
              ))}
            </div>
          </div>
        )}
        {/* Adherence Score */}
        {granularAnalysis.overall_adherence !== undefined && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Adherence</span>
            <span className="text-sm font-medium">{Math.round(granularAnalysis.overall_adherence * 100)}%</span>
          </div>
        )}

        {/* Pacing Analysis (NEW - Garmin-style) */}
        {granularAnalysis.pacing_analysis && (
          <div className="border-t pt-3">
            <div className="text-sm font-medium mb-2 text-purple-600">Pacing Analysis</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Variability (CV)</span>
                <span className={`text-sm font-medium ${
                  granularAnalysis.pacing_analysis.pacing_variability.coefficient_of_variation > 10 ? 'text-red-600' :
                  granularAnalysis.pacing_analysis.pacing_variability.coefficient_of_variation > 7 ? 'text-orange-600' :
                  granularAnalysis.pacing_analysis.pacing_variability.coefficient_of_variation > 3 ? 'text-yellow-600' :
                  'text-green-600'
                }`}>
                  {granularAnalysis.pacing_analysis.pacing_variability.coefficient_of_variation}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Surges</span>
                <span className={`text-sm font-medium ${
                  granularAnalysis.pacing_analysis.pacing_variability.num_surges > 10 ? 'text-red-600' :
                  granularAnalysis.pacing_analysis.pacing_variability.num_surges > 5 ? 'text-orange-600' :
                  'text-green-600'
                }`}>
                  {granularAnalysis.pacing_analysis.pacing_variability.num_surges}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Crashes</span>
                <span className={`text-sm font-medium ${
                  granularAnalysis.pacing_analysis.pacing_variability.num_crashes > 10 ? 'text-red-600' :
                  granularAnalysis.pacing_analysis.pacing_variability.num_crashes > 5 ? 'text-orange-600' :
                  'text-green-600'
                }`}>
                  {granularAnalysis.pacing_analysis.pacing_variability.num_crashes}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Steadiness</span>
                <span className={`text-sm font-medium ${
                  granularAnalysis.pacing_analysis.variability_score < 0.5 ? 'text-red-600' :
                  granularAnalysis.pacing_analysis.variability_score < 0.7 ? 'text-orange-600' :
                  granularAnalysis.pacing_analysis.variability_score < 0.9 ? 'text-yellow-600' :
                  'text-green-600'
                }`}>
                  {Math.round(granularAnalysis.pacing_analysis.variability_score * 100)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Smoothness</span>
                <span className={`text-sm font-medium ${
                  granularAnalysis.pacing_analysis.smoothness_score < 0.5 ? 'text-red-600' :
                  granularAnalysis.pacing_analysis.smoothness_score < 0.8 ? 'text-orange-600' :
                  'text-green-600'
                }`}>
                  {Math.round(granularAnalysis.pacing_analysis.smoothness_score * 100)}%
                </span>
              </div>
            </div>
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

        {/* Performance Assessment */}
        {granularAnalysis.performance_assessment && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Performance</span>
            <span className={`text-sm font-medium ${
              granularAnalysis.performance_assessment === 'Excellent' ? 'text-green-600' :
              granularAnalysis.performance_assessment === 'Good' ? 'text-blue-600' :
              granularAnalysis.performance_assessment === 'Fair' ? 'text-yellow-600' :
              granularAnalysis.performance_assessment === 'Poor' ? 'text-orange-600' :
              'text-red-600'
            }`}>
              {granularAnalysis.performance_assessment}
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

  // Show narrative insights if available (even without analysis structure)
  if (narrativeInsights && Array.isArray(narrativeInsights) && narrativeInsights.length > 0) {
    return (
      <div className="space-y-3">
        <div className="text-sm font-medium mb-2 text-gray-900">Analysis</div>
        <div className="space-y-2">
          {narrativeInsights.map((insight, index) => (
            <p key={index} className="text-sm text-gray-700 leading-relaxed">{insight}</p>
          ))}
        </div>
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

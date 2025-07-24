import React, { useState } from 'react';
import { Activity, Bike, Waves, ChevronDown, ChevronUp, TrendingUp, Download } from 'lucide-react';
import { GarminDataService, type AnalyzedGarminData, type DetectedMetric } from '@/services/GarminDataService';

interface GarminPreviewProps {
  accessToken: string;
  currentBaselines: any;
  onDataSelected: (selectedData: any) => void;
}

const GarminPreview: React.FC<GarminPreviewProps> = ({
  accessToken,
  currentBaselines,
  onDataSelected
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analyzedData, setAnalyzedData] = useState<AnalyzedGarminData | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set());
  const [expandedSports, setExpandedSports] = useState<Set<string>>(new Set(['running']));
  const [hasStarted, setHasStarted] = useState(false);

  // Backfill state
  const [backfillStatus, setBackfillStatus] = useState<'idle' | 'requesting' | 'success' | 'error'>('idle');
  const [backfillError, setBackfillError] = useState('');

  const fetchAndAnalyzeData = async () => {
    setLoading(true);
    setError('');
    setHasStarted(true);

    try {
      const analyzed = await GarminDataService.analyzeActivitiesForBaselines(
        accessToken,
        currentBaselines
      );
      setAnalyzedData(analyzed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch Garmin data');
    } finally {
      setLoading(false);
    }
  };

  // Backfill function
  const requestHistoricalData = async () => {
    setBackfillStatus('requesting');
    setBackfillError('');

    try {
      // Calculate 6 months ago (max useful range)
      const endDate = Math.floor(Date.now() / 1000);
      const startDate = endDate - (180 * 24 * 60 * 60); // 6 months in seconds

      // Call backfill API via swift-task proxy
      const response = await fetch(
        `https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/swift-task?path=/wellness-api/rest/backfill/activities&summaryStartTimeInSeconds=${startDate}&summaryEndTimeInSeconds=${endDate}&token=${accessToken}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        setBackfillStatus('success');
        // Auto-redirect after success message
        setTimeout(() => {
          // Navigate to main dashboard (user will see populated Completed dropdown)
          window.location.href = '/';
        }, 2000);
      } else {
        throw new Error(`Backfill request failed: ${response.status}`);
      }
    } catch (err) {
      setBackfillError(err instanceof Error ? err.message : 'Failed to request historical data');
      setBackfillStatus('error');
    }
  };

  const toggleMetric = (metricKey: string) => {
    const newSelected = new Set(selectedMetrics);
    if (newSelected.has(metricKey)) {
      newSelected.delete(metricKey);
    } else {
      newSelected.add(metricKey);
    }
    setSelectedMetrics(newSelected);
  };

  const toggleSport = (sport: string) => {
    const newExpanded = new Set(expandedSports);
    if (newExpanded.has(sport)) {
      newExpanded.delete(sport);
    } else {
      newExpanded.add(sport);
    }
    setExpandedSports(newExpanded);
  };

  const handleAcceptAll = (sport: string) => {
    if (!analyzedData) return;
    
    const sportMetrics = analyzedData.detectedMetrics.filter(m => m.sport === sport);
    const newSelected = new Set(selectedMetrics);
    sportMetrics.forEach(metric => newSelected.add(metric.key));
    setSelectedMetrics(newSelected);
  };

  const handleSkipAll = (sport: string) => {
    if (!analyzedData) return;
    
    const sportMetrics = analyzedData.detectedMetrics.filter(m => m.sport === sport);
    const newSelected = new Set(selectedMetrics);
    sportMetrics.forEach(metric => newSelected.delete(metric.key));
    setSelectedMetrics(newSelected);
  };

  const handleApplySelected = () => {
    if (!analyzedData) return;

    const updatedBaselines: any = {};
    
    analyzedData.detectedMetrics.forEach(metric => {
      if (selectedMetrics.has(metric.key)) {
        const keyParts = metric.key.split('.');
        
        if (keyParts.length === 2) {
          if (!updatedBaselines[keyParts[0]]) {
            updatedBaselines[keyParts[0]] = {};
          }
          updatedBaselines[keyParts[0]][keyParts[1]] = metric.detectedValue;
        } else if (keyParts.length === 3) {
          if (!updatedBaselines[keyParts[0]]) {
            updatedBaselines[keyParts[0]] = {};
          }
          // For performance numbers, extract numeric values where possible
          if (keyParts[0] === 'performanceNumbers') {
            const numericValue = extractNumericValue(metric.detectedValue);
            updatedBaselines[keyParts[0]][keyParts[1]] = numericValue;
          } else {
            updatedBaselines[keyParts[0]][keyParts[1]] = metric.detectedValue;
          }
        }
      }
    });

    onDataSelected(updatedBaselines);
  };

  const extractNumericValue = (value: string): number | string => {
    // Extract FTP watts
    const ftpMatch = value.match(/(\d+)W/);
    if (ftpMatch) return parseInt(ftpMatch[1]);
    
    // Extract speed mph
    const speedMatch = value.match(/(\d+\.?\d*)\s*mph/);
    if (speedMatch) return parseFloat(speedMatch[1]);
    
    // Return original value if no numeric pattern found
    return value;
  };

  const getSportIcon = (sport: string) => {
    switch (sport) {
      case 'running': return <Activity className="h-5 w-5" />;
      case 'cycling': return <Bike className="h-5 w-5" />;
      case 'swimming': return <Waves className="h-5 w-5" />;
      default: return <Activity className="h-5 w-5" />;
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'text-green-600';
      case 'medium': return 'text-orange-600';
      case 'low': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const formatSportName = (sport: string) => {
    return sport.charAt(0).toUpperCase() + sport.slice(1);
  };

  if (!hasStarted) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h4 className="font-medium mb-2">Ready to Import Training Data</h4>
          <p className="text-sm text-gray-600 mb-4">
            Analyze your recent Garmin activities to auto-populate baseline data
          </p>
          <button
            onClick={fetchAndAnalyzeData}
            className="px-6 py-3 text-black hover:text-blue-600 transition-colors font-medium border border-gray-300 rounded-md"
          >
            <TrendingUp className="h-4 w-4 inline mr-2" />
            Fetch Training Data
          </button>
        </div>

        {/* Backfill section */}
        <div className="border-t border-gray-200 pt-4">
          <div className="text-center">
            <h4 className="font-medium mb-2">Import Workout History</h4>
            <p className="text-sm text-gray-600 mb-4">
              Get 6 months of your completed workouts from Garmin
            </p>
            
            {backfillStatus === 'idle' && (
              <button
                onClick={requestHistoricalData}
                className="px-6 py-3 text-black hover:text-blue-600 transition-colors font-medium border border-gray-300 rounded-md"
              >
                <Download className="h-4 w-4 inline mr-2" />
                Get My Historical Data
              </button>
            )}

            {backfillStatus === 'requesting' && (
              <div className="text-center">
                <div className="animate-spin mx-auto h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mb-3"></div>
                <p className="text-sm text-gray-600">Requesting your workout history...</p>
              </div>
            )}

            {backfillStatus === 'success' && (
              <div className="text-center">
                <p className="text-sm text-green-600 mb-2">✅ Success! Your workout history is loading...</p>
                <p className="text-xs text-gray-500">Taking you to see your workouts...</p>
              </div>
            )}

            {backfillStatus === 'error' && (
              <div className="space-y-3">
                <div className="p-4 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{backfillError}</p>
                </div>
                <button
                  onClick={requestHistoricalData}
                  className="px-4 py-2 text-black hover:text-blue-600 transition-colors text-sm"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <div className="animate-spin mx-auto h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mb-3"></div>
          <p className="text-sm text-gray-600">Analyzing your training data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="p-4 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
        <button
          onClick={fetchAndAnalyzeData}
          className="px-4 py-2 text-black hover:text-blue-600 transition-colors text-sm"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!analyzedData || analyzedData.totalActivities === 0) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-2">
            Found {analyzedData?.totalActivities || 0} activities, but couldn't extract baseline data.
          </p>
          <p className="text-xs text-gray-500">
            Need at least 3 activities per sport to detect patterns.
          </p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-600">
            Want to add baseline data manually? Use the Assessment tab.
          </p>
        </div>
      </div>
    );
  }

  const groupedMetrics = analyzedData.sportsWithData.reduce((acc, sport) => {
    acc[sport] = analyzedData.detectedMetrics.filter(m => m.sport === sport);
    return acc;
  }, {} as Record<string, DetectedMetric[]>);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="text-center">
        <h4 className="font-medium mb-2">Detected training data from your Garmin account</h4>
        <p className="text-sm text-gray-600">
          Found {analyzedData.totalActivities} activities from {analyzedData.sportsWithData.length} sport{analyzedData.sportsWithData.length !== 1 ? 's' : ''}
        </p>
        {analyzedData.dateRange.start && (
          <p className="text-xs text-gray-500">
            {new Date(analyzedData.dateRange.start).toLocaleDateString()} - {new Date(analyzedData.dateRange.end).toLocaleDateString()}
          </p>
        )}
      </div>

      {Object.entries(groupedMetrics).map(([sport, metrics]) => (
        <div key={sport} className="border border-gray-200 rounded-lg">
          <button
            onClick={() => toggleSport(sport)}
            className="w-full px-4 py-3 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              {getSportIcon(sport)}
              <span className="font-medium capitalize">{formatSportName(sport)} ({metrics.length}/{metrics.length})</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAcceptAll(sport);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  Accept All
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSkipAll(sport);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Skip All
                </button>
              </div>
              {expandedSports.has(sport) ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
          </button>

          {expandedSports.has(sport) && (
            <div className="px-4 pb-4 space-y-4">
              {metrics.map((metric) => (
                <div key={metric.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="font-medium text-sm">{metric.label}</h5>
                    <button
                      onClick={() => toggleMetric(metric.key)}
                      className={`text-sm ${
                        selectedMetrics.has(metric.key) ? 'text-blue-600' : 'text-gray-500 hover:text-blue-600'
                      }`}
                    >
                      {selectedMetrics.has(metric.key) ? '✓ Accept' : 'Accept'}
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Current: </span>
                      <span>{metric.currentValue}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Detected: </span>
                      <span className="font-medium">{metric.detectedValue}</span>
                    </div>
                  </div>
                  
                  <div className="text-xs">
                    <span className={`font-medium ${getConfidenceColor(metric.confidence)}`}>
                      {metric.confidence} confidence
                    </span>
                    <span className="text-gray-500 ml-2">{metric.source}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {selectedMetrics.size > 0 && (
        <div className="sticky bottom-0 bg-white p-4 border-t border-gray-200">
          <button
            onClick={handleApplySelected}
            className="w-full px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium rounded-md"
          >
            Apply {selectedMetrics.size} Selected Metric{selectedMetrics.size !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
};

export default GarminPreview;
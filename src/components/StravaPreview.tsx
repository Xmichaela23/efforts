import React, { useState } from 'react';
import { Activity, Bike, Waves, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { StravaDataService, AnalyzedStravaData, DetectedMetric } from '@/services/StravaDataService';

interface StravaPreviewProps {
  accessToken: string;
  currentBaselines: any;
  onDataSelected: (selectedData: any) => void;
}

export default function StravaPreview({ accessToken, currentBaselines, onDataSelected }: StravaPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [analyzedData, setAnalyzedData] = useState<AnalyzedStravaData | null>(null);
  const [userSelections, setUserSelections] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);

  const fetchAndAnalyzeData = async () => {
    setLoading(true);
    setError(null);
    setHasStarted(true);

    try {
      console.log('Fetching Strava activities...');
      const activities = await StravaDataService.fetchRecentActivities(accessToken);
      
      console.log(`Found ${activities.length} activities`);
      
      if (activities.length === 0) {
        setError('No activities found in your Strava account from the last 90 days.');
        setLoading(false);
        return;
      }

      console.log('Analyzing activities for baseline data...');
      const analyzed = await StravaDataService.analyzeActivitiesForBaselines(activities, currentBaselines);
      
      console.log('Analysis complete:', analyzed);
      setAnalyzedData(analyzed);

      // Initialize all selections as true (accept all by default)
      const initialSelections: Record<string, boolean> = {};
      analyzed.detectedMetrics.forEach(metric => {
        initialSelections[metric.key] = true;
      });
      setUserSelections(initialSelections);

    } catch (err) {
      console.error('Error fetching/analyzing Strava data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch training data');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (key: string) => {
    setUserSelections(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const acceptAllForSport = (sport: string) => {
    const sportMetrics = analyzedData?.detectedMetrics.filter(m => m.sport === sport) || [];
    const updates: Record<string, boolean> = {};
    
    sportMetrics.forEach(metric => {
      updates[metric.key] = true;
    });

    setUserSelections(prev => ({
      ...prev,
      ...updates
    }));
  };

  const skipAllForSport = (sport: string) => {
    const sportMetrics = analyzedData?.detectedMetrics.filter(m => m.sport === sport) || [];
    const updates: Record<string, boolean> = {};
    
    sportMetrics.forEach(metric => {
      updates[metric.key] = false;
    });

    setUserSelections(prev => ({
      ...prev,
      ...updates
    }));
  };

  const applySelections = () => {
    if (!analyzedData) return;

    const selectedData: any = {};

    // Build the data object based on selections
    analyzedData.detectedMetrics.forEach(metric => {
      if (userSelections[metric.key]) {
        const keys = metric.key.split('.');
        
        if (keys.length === 2) {
          // Handle nested objects like current_volume.running
          const [category, sport] = keys;
          if (!selectedData[category]) selectedData[category] = {};
          
          if (category === 'performanceNumbers') {
            // Handle numeric values for performance numbers
            if (metric.key.includes('ftp')) {
              selectedData[category][sport] = parseInt(metric.detectedValue.replace(/[^\d]/g, ''));
            } else {
              selectedData[category][sport] = metric.detectedValue;
            }
          } else {
            selectedData[category][sport] = metric.detectedValue;
          }
        } else if (keys.length === 1) {
          // Handle direct properties
          selectedData[keys[0]] = metric.detectedValue;
        }
      }
    });

    console.log('Applying selected data:', selectedData);
    onDataSelected(selectedData);
  };

  const getSportIcon = (sport: string) => {
    switch (sport) {
      case 'running': return Activity;
      case 'cycling': return Bike;
      case 'swimming': return Waves;
      default: return Activity;
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const groupMetricsBySport = (metrics: DetectedMetric[]) => {
    const grouped: Record<string, DetectedMetric[]> = {};
    metrics.forEach(metric => {
      if (!grouped[metric.sport]) grouped[metric.sport] = [];
      grouped[metric.sport].push(metric);
    });
    return grouped;
  };

  if (!hasStarted) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h4 className="font-medium mb-2">Ready to Import Training Data</h4>
          <p className="text-sm text-gray-600 mb-4">
            Analyze your recent Strava activities to auto-populate baseline data
          </p>
          <button
            onClick={fetchAndAnalyzeData}
            className="px-6 py-3 text-black hover:text-blue-600 transition-colors font-medium border border-gray-300 rounded-md"
          >
            <TrendingUp className="h-4 w-4 inline mr-2" />
            Fetch Training Data
          </button>
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

  if (!analyzedData || analyzedData.detectedMetrics.length === 0) {
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

  const sportGroups = groupMetricsBySport(analyzedData.detectedMetrics);
  const selectedCount = Object.values(userSelections).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="text-center">
        <h4 className="font-medium mb-2">Detected training data from your Strava account</h4>
        <p className="text-sm text-gray-600">
          Found {analyzedData.totalActivities} activities from {analyzedData.sportsWithData.length} sport{analyzedData.sportsWithData.length !== 1 ? 's' : ''}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {new Date(analyzedData.dateRange.end).toLocaleDateString()} - {new Date(analyzedData.dateRange.start).toLocaleDateString()}
        </p>
      </div>

      {/* Sport Sections */}
      <div className="space-y-6">
        {Object.entries(sportGroups).map(([sport, metrics]) => {
          const Icon = getSportIcon(sport);
          const sportSelected = metrics.filter(m => userSelections[m.key]).length;
          const sportTotal = metrics.length;

          return (
            <div key={sport} className="space-y-3">
              {/* Sport Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5" />
                  <h5 className="font-medium capitalize">{sport}</h5>
                  <span className="text-xs text-gray-500">({sportSelected}/{sportTotal})</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptAllForSport(sport)}
                    className="px-3 py-1 text-xs text-black hover:text-blue-600 transition-colors"
                  >
                    Accept All
                  </button>
                  <button
                    onClick={() => skipAllForSport(sport)}
                    className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Skip All
                  </button>
                </div>
              </div>

              {/* Metrics */}
              <div className="space-y-3 ml-7">
                {metrics.map((metric) => (
                  <div key={metric.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">{metric.label}</label>
                      <button
                        onClick={() => toggleSelection(metric.key)}
                        className={`px-3 py-1 text-xs transition-colors ${
                          userSelections[metric.key] 
                            ? 'text-blue-600 hover:text-blue-700' 
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {userSelections[metric.key] ? '✓ Accept' : '○ Skip'}
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Current: </span>
                        <span>{metric.currentValue}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Detected: </span>
                        <span className="font-medium">{metric.detectedValue}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs">
                      <span className={`${getConfidenceColor(metric.confidence)}`}>
                        {metric.confidence} confidence
                      </span>
                      <span className="text-gray-500">{metric.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Apply Button */}
      {selectedCount > 0 && (
        <div className="pt-4 border-t">
          <div className="text-center">
            <button
              onClick={applySelections}
              className="px-6 py-3 text-black hover:text-blue-600 transition-colors font-medium"
            >
              <CheckCircle className="h-4 w-4 inline mr-2" />
              Apply {selectedCount} Selected Change{selectedCount !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {/* Manual option */}
      <div className="text-center pt-4 border-t">
        <p className="text-sm text-gray-600">
          Don't see your sport or want to add details manually?{' '}
          <span className="text-black">Complete the Assessment tab for full baseline setup.</span>
        </p>
      </div>
    </div>
  );
}
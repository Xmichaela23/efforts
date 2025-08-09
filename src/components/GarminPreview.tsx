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

  // Backfill state for training data (90 days)
  const [backfillStatus, setBackfillStatus] = useState<'idle' | 'requesting' | 'success' | 'error'>('idle');
  const [backfillError, setBackfillError] = useState('');
  
  // Backfill state for workout history (6+ months)
  const [historyStatus, setHistoryStatus] = useState<'idle' | 'requesting' | 'success' | 'error'>('idle');
  const [historyError, setHistoryError] = useState('');

  const fetchAndAnalyzeData = async () => {
    setLoading(true);
    setError('');
    setHasStarted(true);

    try {
      // Get user session token for Supabase authentication
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        'https://yyriamwvtvzlkumqrvpm.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY'
      );
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('User must be logged in');
      }

      // Get user's Garmin connection
      const { data: userConnection } = await supabase
        .from("user_connections")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("provider", "garmin")
        .single();

      if (!userConnection) {
        throw new Error("No Garmin connection found");
      }

      // Fetch activities from Supabase (90 days)
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (90 * 24 * 60 * 60 * 1000)); // 90 days ago

      const { data: activities, error } = await supabase
        .from("garmin_activities")
        .select("*")
        .eq("garmin_user_id", userConnection.connection_data.user_id)
        .gte("start_time", startDate.toISOString())
        .lte("start_time", endDate.toISOString())
        .order("start_time", { ascending: false });

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      if (!activities || activities.length === 0) {
        throw new Error("No activities found in database");
      }

      // Analyze the activities from Supabase
      const analyzed = await GarminDataService.analyzeActivitiesFromDatabase(
        activities,
        currentBaselines
      );
      setAnalyzedData(analyzed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze data');
    } finally {
      setLoading(false);
    }
  };

  // Separate 90-day backfill function  
  const requestTrainingData = async () => {
    setBackfillStatus('requesting');
    setBackfillError('');

    try {
      // Get user session token for Supabase authentication
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        'https://yyriamwvtvzlkumqrvpm.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY'
      );
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('User must be logged in');
      }

      // Calculate 90 days ago (for training analysis)
      const endDate = Math.floor(Date.now() / 1000);
      const startDate = endDate - (90 * 24 * 60 * 60); // 90 days in seconds

      // Call backfill API via swift-task proxy
      const response = await fetch(
        `https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/swift-task?path=/wellness-api/rest/backfill/activities&summaryStartTimeInSeconds=${startDate}&summaryEndTimeInSeconds=${endDate}&token=${accessToken}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Accept both 202 and 409 as "success" since data might still flow via webhooks
      if (response.status === 202 || response.status === 409) {
        setBackfillStatus('success');
      } else {
        throw new Error(`Training data import failed: ${response.status}`);
      }
    } catch (err) {
      setBackfillError(err instanceof Error ? err.message : 'Failed to import training data');
      setBackfillStatus('error');
    }
  };

  // 6+ month backfill for workout history
  const requestHistoricalData = async () => {
    setHistoryStatus('requesting');
    setHistoryError('');

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        'https://yyriamwvtvzlkumqrvpm.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY'
      );
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('User must be logged in');

      // Get Garmin connection for access token
      const { data: userConnection, error: connErr } = await supabase
        .from('user_connections')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('provider', 'garmin')
        .single();
      if (connErr || !userConnection) throw new Error('No Garmin connection found');

      const garminAccessToken: string | undefined = userConnection.access_token || userConnection.connection_data?.access_token;
      if (!garminAccessToken) throw new Error('Missing Garmin access token');

      // Helper to compute UTC day boundaries
      const startOfUtcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;

      // Loop last 90 days in 24h slices (UTC)
      const now = new Date();
      let successes = 0;
      let conflicts = 0;
      let failures = 0;

      for (let i = 0; i < 90; i++) {
        const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        day.setUTCDate(day.getUTCDate() - i);
        const dayStart = Math.floor(startOfUtcDay(day));
        const dayEnd = dayStart + 24 * 60 * 60 - 1;

        const path = `/wellness-api/rest/backfill/activities?summaryStartTimeInSeconds=${dayStart}&summaryEndTimeInSeconds=${dayEnd}`;
        const url = `https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/swift-task?path=${encodeURIComponent(path)}&token=${garminAccessToken}`;

        const resp = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Accept': 'application/json'
          }
        });

        if (resp.status === 202) {
          successes++;
        } else if (resp.status === 409) {
          conflicts++;
        } else if (resp.ok) {
          successes++;
        } else {
          failures++;
        }

        // Gentle throttle to respect rate limits
        await new Promise((r) => setTimeout(r, 200));
      }

      if (failures > 0 && successes === 0 && conflicts === 0) {
        throw new Error(`Backfill failed for all days (failures: ${failures})`);
      }

      setHistoryStatus('success');

      // Light enrichment for last 30 days using wellness activityDetails
      try {
        const enrichDays = 30;
        for (let i = 0; i < enrichDays; i++) {
          const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
          day.setUTCDate(day.getUTCDate() - i);
          const dayStart = Math.floor(startOfUtcDay(day));
          const dayEnd = dayStart + 24 * 60 * 60 - 1;

          const detailsPath = `/wellness-api/rest/activityDetails?uploadStartTimeInSeconds=${dayStart}&uploadEndTimeInSeconds=${dayEnd}`;
          const detailsUrl = `https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/swift-task?path=${encodeURIComponent(detailsPath)}&token=${garminAccessToken}`;

          const dResp = await fetch(detailsUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Accept': 'application/json'
            }
          });

          if (!dResp.ok) {
            await new Promise((r) => setTimeout(r, 150));
            continue;
          }

          const details: any[] = await dResp.json();
          if (!Array.isArray(details) || details.length === 0) {
            await new Promise((r) => setTimeout(r, 150));
            continue;
          }

          for (const activityDetail of details) {
            const summary = activityDetail.summary || {};
            const summaryId = activityDetail.summaryId || summary.summaryId;
            if (!summaryId) continue;

            const updateObj: any = {
              raw_data: activityDetail,
              samples_data: activityDetail.samples || null,
            };

            // Copy key metrics from summary if present
            const avgHr = summary.averageHeartRateInBeatsPerMinute;
            const maxHr = summary.maxHeartRateInBeatsPerMinute;
            const avgPow = summary.averagePowerInWatts;
            const maxPow = summary.maxPowerInWatts;
            const avgSpd = summary.averageSpeedInMetersPerSecond;
            const maxSpd = summary.maxSpeedInMetersPerSecond;
            const elevGain = summary.totalElevationGainInMeters;
            const elevLoss = summary.totalElevationLossInMeters;

            if (avgHr != null) updateObj.avg_heart_rate = Math.round(avgHr);
            if (maxHr != null) updateObj.max_heart_rate = Math.round(maxHr);
            if (avgPow != null) updateObj.avg_power = Math.round(avgPow);
            if (maxPow != null) updateObj.max_power = Math.round(maxPow);
            if (avgSpd != null) updateObj.avg_speed_mps = avgSpd;
            if (maxSpd != null) updateObj.max_speed_mps = maxSpd;
            if (elevGain != null) updateObj.elevation_gain_meters = elevGain;
            if (elevLoss != null) updateObj.elevation_loss_meters = elevLoss;

            await supabase
              .from('garmin_activities')
              .update(updateObj)
              .eq('garmin_activity_id', String(summaryId))
              .eq('user_id', session.user.id);

            await new Promise((r) => setTimeout(r, 75));
          }

          await new Promise((r) => setTimeout(r, 150));
        }
      } catch {
        // Ignore enrichment failures; summaries already imported via webhooks
      }

      // Do not auto-analyze; user can analyze after data arrives
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Failed to request workout history');
      setHistoryStatus('error');
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
      <div className="space-y-6">
        <div className="text-center">
          <button
            onClick={requestHistoricalData}
            className="px-6 py-3 text-black hover:text-blue-600 transition-colors font-medium border border-gray-300 rounded-md"
          >
            <Download className="h-4 w-4 inline mr-2" />
            Import 90 Day Workout History
          </button>
        </div>

        <div className="text-center">
          <button
            onClick={fetchAndAnalyzeData}
            className="px-6 py-3 text-black hover:text-blue-600 transition-colors font-medium border border-gray-300 rounded-md"
          >
            <TrendingUp className="h-4 w-4 inline mr-2" />
            Analyze
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
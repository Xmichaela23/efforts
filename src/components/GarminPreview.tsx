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

      // Fetch user's Garmin connection (token + garmin user id)
      const { data: userConnection, error: connErr } = await supabase
        .from('user_connections')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('provider', 'garmin')
        .single();

      if (connErr || !userConnection) {
        throw new Error('No Garmin connection found');
      }

      const garminAccessToken: string | undefined = userConnection.access_token || userConnection.connection_data?.access_token;
      const garminUserId: string | undefined = userConnection.connection_data?.user_id;

      if (!garminAccessToken) {
        throw new Error('Missing Garmin access token');
      }
      if (!garminUserId) {
        throw new Error('Missing Garmin user id in connection');
      }

      // Date range: last 90 days
      const end = new Date();
      const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
      const toYMD = (d: Date) => d.toISOString().slice(0, 10);
      const startDate = toYMD(start);
      const endDate = toYMD(end);

      // Page through activities via existing proxy (modern/proxy)
      let offset = 0;
      const limit = 100;
      let totalImported = 0;
      let totalSeen = 0;
      const ENRICH_LIMIT = 50;
      const toEnrichIds: string[] = [];

      // Helper to upsert in chunks
      const upsertBatch = async (rows: any[]) => {
        if (!rows.length) return;
        const { error } = await supabase
          .from('garmin_activities')
          .upsert(rows, { onConflict: 'garmin_activity_id' });
        if (error) throw error;
      };

      // Loop pages
      // Stop when an empty page is returned
      while (true) {
        const path = `/modern/proxy/activitylist-service/activities/search/activities?start=${offset}&limit=${limit}&startDate=${startDate}&endDate=${endDate}`;
        const url = `https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/swift-task?path=${encodeURIComponent(path)}&token=${garminAccessToken}`;

        const resp = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Accept': 'application/json'
          }
        });

        if (!resp.ok) {
          throw new Error(`History import failed: ${resp.status} ${resp.statusText}`);
        }

        const items: any[] = await resp.json();
        if (!Array.isArray(items) || items.length === 0) break;

        totalSeen += items.length;

        // Map to garmin_activities rows
        const rows = items
          .map((a) => {
            const activityId = a.activityId ?? a.summaryId ?? a.activityIdLong ?? null;
            if (!activityId) return null;

            // Collect most recent N for enrichment
            if (toEnrichIds.length < ENRICH_LIMIT) {
              toEnrichIds.push(String(activityId));
            }

            const avgSpeed = a.averageSpeed ?? a.averageSpeedInMetersPerSecond ?? null;
            const maxSpeed = a.maxSpeed ?? a.maxSpeedInMetersPerSecond ?? null;

            return {
              user_id: session.user.id,
              garmin_user_id: garminUserId,
              garmin_activity_id: String(activityId),
              activity_id: a.activityId ? String(a.activityId) : null,
              activity_type: a.activityType?.typeKey || a.activityType || null,
              start_time: a.startTimeGMT || a.startTimeLocal || null,
              start_time_offset_seconds: a.startTimeOffsetInSeconds || 0,
              duration_seconds: Math.round(a.duration ?? a.durationInSeconds ?? 0),
              distance_meters: a.distance ?? a.distanceInMeters ?? null,
              calories: a.calories ?? a.activeKilocalories ?? null,
              avg_speed_mps: avgSpeed,
              max_speed_mps: maxSpeed,
              avg_pace_min_per_km: avgSpeed ? (1000 / avgSpeed) / 60 : null,
              max_pace_min_per_km: maxSpeed ? (1000 / maxSpeed) / 60 : null,
              avg_heart_rate: a.averageHR ?? a.averageHeartRateInBeatsPerMinute ?? null,
              max_heart_rate: a.maxHR ?? a.maxHeartRateInBeatsPerMinute ?? null,
              avg_bike_cadence: a.averageBikeCadenceInRoundsPerMinute ?? null,
              max_bike_cadence: a.maxBikeCadenceInRoundsPerMinute ?? null,
              avg_run_cadence: a.averageRunCadenceInStepsPerMinute ?? a.averageRunningCadence ?? null,
              max_run_cadence: a.maxRunCadenceInStepsPerMinute ?? a.maxRunningCadence ?? null,
              elevation_gain_meters: a.elevationGain ?? a.totalElevationGainInMeters ?? null,
              elevation_loss_meters: a.elevationLoss ?? a.totalElevationLossInMeters ?? null,
              device_name: a.deviceName ?? null,
              is_parent: a.isParent ?? false,
              parent_summary_id: a.parentSummaryId ?? null,
              manual: a.manual ?? false,
              is_web_upload: a.isWebUpload ?? false,
              created_at: new Date().toISOString(),
            };
          })
          .filter(Boolean);

        // Upsert this page
        await upsertBatch(rows as any[]);
        totalImported += (rows as any[]).length;

        // Next page
        offset += limit;
        // Small throttle
        await new Promise((r) => setTimeout(r, 150));
      }

      // Light enrichment for the most recent N imported activities (no full streams)
      for (const id of toEnrichIds) {
        try {
          const detailsPath = `/modern/proxy/activity-service/activity/${encodeURIComponent(id)}`;
          const detailsUrl = `https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/swift-task?path=${encodeURIComponent(detailsPath)}&token=${garminAccessToken}`;
          const dResp = await fetch(detailsUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Accept': 'application/json'
            }
          });
          if (!dResp.ok) {
            continue;
          }
          const detail = await dResp.json();

          const summary = detail?.summary || detail?.summaryDTO || detail || {};
          const avgPower = summary.averagePowerInWatts ?? summary.averagePower ?? null;
          const maxPower = summary.maxPowerInWatts ?? summary.maxPower ?? null;
          const avgHr = summary.averageHeartRateInBeatsPerMinute ?? summary.averageHR ?? null;
          const maxHr = summary.maxHeartRateInBeatsPerMinute ?? summary.maxHR ?? null;
          const avgSpeed = summary.averageSpeedInMetersPerSecond ?? summary.averageSpeed ?? null;
          const maxSpeed = summary.maxSpeedInMetersPerSecond ?? summary.maxSpeed ?? null;
          const elevGain = summary.totalElevationGainInMeters ?? summary.elevationGain ?? null;
          const elevLoss = summary.totalElevationLossInMeters ?? summary.elevationLoss ?? null;
          const deviceName = summary.deviceName ?? detail?.device?.displayName ?? null;

          const updateObj: any = {
            raw_data: detail,
          };

          if (avgPower != null) updateObj.avg_power = Math.round(avgPower);
          if (maxPower != null) updateObj.max_power = Math.round(maxPower);
          if (avgHr != null) updateObj.avg_heart_rate = Math.round(avgHr);
          if (maxHr != null) updateObj.max_heart_rate = Math.round(maxHr);
          if (avgSpeed != null) updateObj.avg_speed_mps = avgSpeed;
          if (maxSpeed != null) updateObj.max_speed_mps = maxSpeed;
          if (elevGain != null) updateObj.elevation_gain_meters = elevGain;
          if (elevLoss != null) updateObj.elevation_loss_meters = elevLoss;
          if (deviceName != null) updateObj.device_name = deviceName;

          await supabase
            .from('garmin_activities')
            .update(updateObj)
            .eq('garmin_activity_id', id)
            .eq('user_id', session.user.id);

          // small delay to be kind to API
          await new Promise((r) => setTimeout(r, 120));
        } catch {
          // ignore single-enrichment failures
        }
      }

      setHistoryStatus('success');

      // After import, optionally kick off analyze flow so user can accept metrics
      try {
        await fetchAndAnalyzeData();
      } catch {
        // Non-fatal: analysis can be run manually via button
      }
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Failed to import workout history');
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
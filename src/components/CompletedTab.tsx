console.log('🚨 COMPLETEDTAB COMPONENT LOADED');
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/contexts/AppContext';

interface CompletedTabProps {
  workoutType: 'ride' | 'run' | 'swim' | 'strength';
  workoutData: any;
}

const CompletedTab: React.FC<CompletedTabProps> = ({ workoutType, workoutData }) => {
  const { useImperial } = useAppContext();
  const [selectedMetric, setSelectedMetric] = useState('hr');
  const [hoverPoint, setHoverPoint] = useState<{x: number, y: number, values: any} | null>(null);

  // 🔍 DEBUG: Always log what we receive
  console.log('🔍 CompletedTab Debug:', {
    workoutType,
    workoutData,
    hasMetrics: !!workoutData?.metrics,
    metricsKeys: workoutData?.metrics ? Object.keys(workoutData.metrics) : 'no metrics',
    duration: workoutData?.duration,
    distance: workoutData?.distance
  });

  // 🛡️ DEFENSIVE: Always show basic structure even with no data
  if (!workoutData) {
    return (
      <div className="space-y-8" style={{fontFamily: 'Inter, sans-serif'}}>
        <div className="p-4 text-center">
          <p className="text-gray-500">No workout data available</p>
        </div>
      </div>
    );
  }

  // 🔧 SIMPLE: Helper functions with safe defaults
  const safeNumber = (value: any): string => {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    return String(value);
  };

  const formatDuration = (seconds: any): string => {
    // 🔍 DEBUG: Log exactly what we receive
    console.log('🔍 formatDuration called with:', seconds, typeof seconds);
    
    const num = Number(seconds);
    console.log('🔍 formatDuration converted to number:', num, 'isNaN:', isNaN(num), '!num:', !num);
    
    if (num === null || num === undefined || isNaN(num) || num === 0) {
      console.log('🔍 formatDuration returning N/A because:', { num, isNull: num === null, isUndefined: num === undefined, isNaN: isNaN(num), isZero: num === 0 });
      return 'N/A';
    }
    
    const hours = Math.floor(num / 3600);
    const minutes = Math.floor((num % 3600) / 60);
    const secs = num % 60;
    
    let result;
    if (hours > 0) {
      result = `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      result = `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
    
    console.log('🔍 formatDuration returning:', result);
    return result;
  };

  const formatDistance = (km: any): string => {
    const num = Number(km);
    if (!num || isNaN(num)) return 'N/A';
    
    if (useImperial) {
      return (num * 0.621371).toFixed(1) + ' mi';
    }
    return num.toFixed(1) + ' km';
  };

  const formatSpeed = (kmh: any): string => {
    const num = Number(kmh);
    if (!num || isNaN(num)) return 'N/A';
    
    if (useImperial) {
      return (num * 0.621371).toFixed(1) + ' mph';
    }
    return num.toFixed(1) + ' km/h';
  };

  const formatElevation = (m: any): string => {
    const num = Number(m);
    if (!num || isNaN(num) || num === 0) return 'N/A';
    
    if (useImperial) {
      return Math.round(num * 3.28084) + ' ft';
    }
    return num + ' m';
  };

  const formatPace = (kmh: any): string => {
    const num = Number(kmh);
    if (!num || isNaN(num)) return 'N/A';
    
    const minPerKm = 60 / num;
    const minutes = Math.floor(minPerKm);
    const seconds = Math.round((minPerKm - minutes) * 60);
    
    if (useImperial) {
      const minPerMile = minPerKm * 1.609344;
      const mileMinutes = Math.floor(minPerMile);
      const mileSeconds = Math.round((minPerMile - mileMinutes) * 60);
      return `${mileMinutes}:${mileSeconds.toString().padStart(2, '0')} /mi`;
    }
    
    return `${minutes}:${seconds.toString().padStart(2, '0')} /km`;
  };

  // 🏠 ALWAYS BUILD THE HOUSE: Primary metrics that always show
  const primaryMetrics = [
    {
      label: 'Distance',
      value: formatDistance(workoutData.distance),
      icon: '📏'
    },
    {
      label: 'Duration', 
      value: formatDuration(workoutData.duration),
      icon: '⏱️'
    },
    {
      label: 'Heart Rate',
      value: workoutData.metrics?.avg_heart_rate ? `${safeNumber(workoutData.metrics.avg_heart_rate)} bpm` : 'N/A',
      icon: '💓'
    },
    {
      label: 'Power',
      value: workoutData.metrics?.avg_power ? `${safeNumber(workoutData.metrics.avg_power)} W` : 'N/A',
      icon: '⚡'
    },
    {
      label: 'Speed',
      value: formatSpeed(workoutData.metrics?.avg_speed),
      icon: '🏃'
    },
    {
      label: 'Elevation',
      value: formatElevation(workoutData.elevation_gain || workoutData.metrics?.elevation_gain),
      icon: '⛰️'
    }
  ];

  // 🏠 ALWAYS BUILD THE HOUSE: Secondary metrics that always show
  const secondaryMetrics = [
    {
      label: 'Max HR',
      value: workoutData.metrics?.max_heart_rate ? `${safeNumber(workoutData.metrics.max_heart_rate)} bpm` : 'N/A'
    },
    {
      label: 'Max Power',
      value: workoutData.metrics?.max_power ? `${safeNumber(workoutData.metrics.max_power)} W` : 'N/A'
    },
    {
      label: 'Max Speed',
      value: formatSpeed(workoutData.metrics?.max_speed)
    },
    {
      label: 'Calories',
      value: workoutData.metrics?.calories ? `${safeNumber(workoutData.metrics.calories)} cal` : 'N/A'
    },
    {
      label: 'TSS',
      value: workoutData.metrics?.training_stress_score ? safeNumber(Math.round(workoutData.metrics.training_stress_score * 10) / 10) : 'N/A'
    },
    {
      label: 'Intensity Factor',
      value: workoutData.metrics?.intensity_factor ? `${safeNumber(workoutData.metrics.intensity_factor)}%` : 'N/A'
    }
  ];

  // 🎛️ Available metrics for toggle buttons (only show if data exists)
  const availableMetrics = [];
  if (workoutData.metrics?.avg_heart_rate) availableMetrics.push({ id: 'hr', label: 'Heart Rate' });
  if (workoutData.metrics?.avg_power && workoutType === 'ride') availableMetrics.push({ id: 'power', label: 'Power' });
  if (workoutData.metrics?.avg_speed) availableMetrics.push({ id: 'speed', label: 'Speed' });
  if (workoutData.metrics?.avg_cadence) availableMetrics.push({ id: 'cadence', label: 'Cadence' });

  return (
    <div className="space-y-8" style={{fontFamily: 'Inter, sans-serif'}}>
      
      {/* 🏠 ALWAYS SHOW: Primary Summary Cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
        {primaryMetrics.map((metric, index) => (
          <div key={index} className="p-4 md:p-6">
            <div className="text-lg md:text-2xl font-semibold text-black mb-1" style={{fontFeatureSettings: '"tnum"'}}>
              {metric.value}
            </div>
            <div className="text-xs md:text-sm text-[#666666] font-normal">
              {metric.label}
            </div>
          </div>
        ))}
      </div>

      {/* 🏠 ALWAYS SHOW: Secondary Metrics Grid */}
      <div>
        <h3 className="text-lg font-semibold mb-4 text-black">Advanced Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {secondaryMetrics.map((metric, index) => (
            <div key={index} className="p-4">
              <div className="text-lg font-semibold text-black mb-1" style={{fontFeatureSettings: '"tnum"'}}>
                {metric.value}
              </div>
              <div className="text-xs text-[#666666] font-normal">
                {metric.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 🎛️ CONDITIONAL: Metric Toggle Buttons (only if we have data) */}
      {availableMetrics.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {availableMetrics.map((metric) => (
            <Button
              key={metric.id}
              onClick={() => setSelectedMetric(metric.id)}
              className={`px-4 md:px-6 py-2 md:py-3 text-xs md:text-sm font-medium uppercase tracking-wide ${
                selectedMetric === metric.id
                  ? 'text-white'
                  : 'text-[#666666] hover:text-black'
              }`}
            >
              {metric.label}
            </Button>
          ))}
        </div>
      )}

      {/* 📊 CONDITIONAL: Chart Area (only if we have meaningful data) */}
      {(workoutData.distance > 0 || workoutData.duration > 300) && (
        <div className="h-80 md:h-96 relative">
          <div className="flex items-center justify-center h-full text-gray-500">
            📊 Chart visualization would appear here
            <br />
            <small>(Distance: {formatDistance(workoutData.distance)}, Duration: {formatDuration(workoutData.duration)})</small>
          </div>
        </div>
      )}

      {/* 🏠 ALWAYS SHOW: Workout Details */}
      <div className="p-4">
        <h4 className="font-medium mb-2 text-black">Workout Details</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-[#666666]">Date: </span>
            <span className="text-black">
              {workoutData.date ? new Date(workoutData.date).toLocaleDateString() : 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-[#666666]">Device: </span>
            <span className="text-black">
              {workoutData.deviceInfo?.manufacturer ? 
                `${workoutData.deviceInfo.manufacturer} ${workoutData.deviceInfo.product || ''}` : 
                'N/A'
              }
            </span>
          </div>
          <div>
            <span className="text-[#666666]">Activity: </span>
            <span className="text-black capitalize">{workoutData.type || 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* 🔍 DEBUG INFO (remove this after debugging) */}
      <details className="p-4">
        <summary className="cursor-pointer text-sm font-medium">Debug Info (click to expand)</summary>
        <pre className="text-xs mt-2 p-2 overflow-auto max-h-40">
          {JSON.stringify({ workoutType, workoutData }, null, 2)}
        </pre>
      </details>
    </div>
  );
};

export default CompletedTab;
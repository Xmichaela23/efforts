import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/contexts/AppContext';

interface CompletedTabProps {
  workoutType: 'cycling' | 'running';
  workoutData: any;
}

const CompletedTab: React.FC<CompletedTabProps> = ({ workoutType, workoutData }) => {
  const { useImperial } = useAppContext();
  const [selectedMetric, setSelectedMetric] = useState('hr');
  const [hoverPoint, setHoverPoint] = useState<{x: number, y: number, values: any} | null>(null);

  const metrics = workoutType === 'cycling' 
    ? ['hr', 'power', 'speed', 'cadence']
    : ['hr', 'pace', 'speed', 'cadence'];

  const metricColors = {
    hr: '#EF4444',
    power: '#F59E0B', 
    speed: '#3B82F6',
    cadence: '#8B5CF6',
    pace: '#8B5CF6'
  };

  // Convert units based on imperial/metric preference
  const convertDistance = (km: number) => {
    return useImperial ? (km * 0.621371).toFixed(1) + ' mi' : km.toFixed(1) + ' km';
  };

  const convertSpeed = (kmh: number) => {
    return useImperial ? (kmh * 0.621371).toFixed(1) + ' mph' : kmh.toFixed(1) + ' km/h';
  };

  const convertElevation = (m: number) => {
    return useImperial ? Math.round(m * 3.28084) + ' ft' : m + ' m';
  };

  const convertPace = (minPerKm: string) => {
    if (!useImperial) return minPerKm + ' /km';
    const [min, sec] = minPerKm.split(':').map(Number);
    const totalSeconds = (min * 60 + sec) * 1.609344;
    const newMin = Math.floor(totalSeconds / 60);
    const newSec = Math.round(totalSeconds % 60);
    return `${newMin}:${newSec.toString().padStart(2, '0')} /mi`;
  };

  const summaryData = workoutType === 'cycling' ? {
    distance: convertDistance(45.2),
    duration: '1:23:45',
    speed: convertSpeed(32.4),
    power: '245 W',
    tss: '142 TSS',
    elevation: convertElevation(892)
  } : {
    distance: convertDistance(10.5),
    duration: '42:18',
    pace: convertPace('4:02'),
    hr: '165 bpm',
    elevation: convertElevation(156),
    cadence: '180 spm'
  };

  const summaryLabels = workoutType === 'cycling' ? {
    distance: 'Distance',
    duration: 'Duration',
    speed: 'Avg Speed',
    power: 'Avg Power',
    tss: 'TSS',
    elevation: 'Elevation Gain'
  } : {
    distance: 'Distance',
    duration: 'Duration',
    pace: 'Avg Pace',
    hr: 'Avg HR',
    elevation: 'Elevation Gain',
    cadence: 'Avg Cadence'
  };

  const handleMouseMove = (e: React.MouseEvent<SVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const distance = x / rect.width * (workoutType === 'cycling' ? 45.2 : 10.5);
    const elevation = Math.round(300 - (y - 50) * 0.5);
    
    const values = {
      distance: convertDistance(distance),
      elevation: convertElevation(elevation),
      [selectedMetric]: selectedMetric === 'hr' ? '165 bpm' : 
                      selectedMetric === 'power' ? '245 W' :
                      selectedMetric === 'speed' ? convertSpeed(32) :
                      selectedMetric === 'pace' ? convertPace('4:02') : '90 rpm'
    };
    
    setHoverPoint({ x, y, values });
  };

  // Generate elevation profile data points
  const generateElevationPath = () => {
    const points = [];
    const width = 800;
    const height = 300;
    for (let i = 0; i <= width; i += 20) {
      const elevation = 250 + Math.sin(i * 0.01) * 30 + Math.cos(i * 0.005) * 20;
      points.push(`${i},${elevation}`);
    }
    return `M0,300 L${points.join(' L')} L${width},350 L0,350 Z`;
  };

  const generateMetricPath = () => {
    const points = [];
    const width = 800;
    for (let i = 0; i <= width; i += 20) {
      let value;
      switch(selectedMetric) {
        case 'hr':
          value = 150 + Math.sin(i * 0.008) * 25;
          break;
        case 'power':
          value = 180 + Math.sin(i * 0.006) * 40;
          break;
        case 'speed':
          value = 200 + Math.cos(i * 0.007) * 30;
          break;
        case 'pace':
          value = 190 + Math.sin(i * 0.009) * 35;
          break;
        default:
          value = 170 + Math.cos(i * 0.005) * 25;
      }
      points.push(`${i},${value}`);
    }
    return `M${points.join(' L')}`;
  };

  return (
    <div className="space-y-8" style={{fontFamily: 'Inter, sans-serif'}}>
      {/* Summary Cards */}
      <div className="grid grid-cols-6 gap-px bg-[#E5E5E5]">
        {Object.entries(summaryData).map(([key, value]) => (
          <div key={key} className="bg-white p-6">
            <div className="text-2xl font-semibold text-black mb-1" style={{fontFeatureSettings: '"tnum"'}}>
              {value}
            </div>
            <div className="text-sm text-[#666666] font-normal">
              {summaryLabels[key as keyof typeof summaryLabels]}
            </div>
          </div>
        ))}
      </div>

      {/* Metric Toggle Buttons */}
      <div className="flex gap-2">
        {metrics.map((metric) => (
          <Button
            key={metric}
            onClick={() => setSelectedMetric(metric)}
            className={`px-6 py-3 text-sm font-medium uppercase tracking-wide ${
              selectedMetric === metric
                ? 'bg-black text-white'
                : 'bg-white text-[#666666] border border-[#E5E5E5] hover:bg-[#F5F5F5]'
            }`}
          >
            {metric}
          </Button>
        ))}
      </div>

      {/* Chart Area */}
      <div className="bg-white border border-[#E5E5E5] h-96 relative">
        <svg 
          width="100%" 
          height="100%" 
          className="absolute inset-0"
          viewBox="0 0 800 400"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverPoint(null)}
        >
          {/* Elevation Profile */}
          <path
            d={generateElevationPath()}
            fill="#F5F5F5"
            stroke="none"
          />
          
          {/* Metric Overlay Line */}
          <path
            d={generateMetricPath()}
            fill="none"
            stroke={metricColors[selectedMetric as keyof typeof metricColors]}
            strokeWidth="2"
          />
          
          {/* Hover Line */}
          {hoverPoint && (
            <line
              x1={hoverPoint.x}
              y1={50}
              x2={hoverPoint.x}
              y2={350}
              stroke="#000"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
          )}
        </svg>
        
        {/* Tooltip */}
        {hoverPoint && (
          <div 
            className="absolute bg-white border border-[#E5E5E5] p-3 text-sm pointer-events-none z-10"
            style={{
              left: Math.min(hoverPoint.x + 10, 700),
              top: Math.max(hoverPoint.y - 60, 10),
              fontFamily: 'Inter, sans-serif'
            }}
          >
            {Object.entries(hoverPoint.values).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-4">
                <span className="text-[#666666] capitalize">{key}:</span>
                <span className="text-black font-medium">{value}</span>
              </div>
            ))}
          </div>
        )}
        
        {/* Axis Labels */}
        <div className="absolute bottom-2 left-4 text-xs text-[#666666]">
          0 {useImperial ? 'mi' : 'km'}
        </div>
        <div className="absolute bottom-2 right-4 text-xs text-[#666666]">
          {workoutType === 'cycling' ? convertDistance(45.2) : convertDistance(10.5)}
        </div>
      </div>
    </div>
  );
};

export default CompletedTab;
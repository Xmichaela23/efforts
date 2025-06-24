import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download, Watch, Smartphone } from 'lucide-react';
import { WorkoutInterval } from './WorkoutIntervals';

interface GarminExportProps {
  workoutName: string;
  intervals: WorkoutInterval[];
}

const GarminExport: React.FC<GarminExportProps> = ({ workoutName, intervals }) => {
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');

  const generateFITFile = () => {
    // Generate FIT file content (simplified structure)
    const fitData = {
      workout: {
        name: workoutName,
        sport: 'cycling', // or 'running'
        steps: intervals.map((interval, index) => ({
          step_name: interval.name,
          duration_type: interval.durationType === 'time' ? 'time' : 'distance',
          duration_value: interval.durationType === 'time' ? interval.duration * 60 : interval.duration * 1000, // seconds or meters
          target_type: getGarminTargetType(interval.intensityType),
          target_value_low: interval.intensityMin,
          target_value_high: interval.intensityMax,
          intensity: getGarminIntensity(interval.intensityType, interval.intensityMin, interval.intensityMax)
        }))
      }
    };
    
    return fitData;
  };

  const getGarminTargetType = (intensityType: string) => {
    switch (intensityType) {
      case 'heartRate': return 'heart_rate';
      case 'power': return 'power';
      case 'pace': return 'speed';
      case 'rpe': return 'heart_rate'; // RPE maps to HR zones
      default: return 'heart_rate';
    }
  };

  const getGarminIntensity = (type: string, min: number, max: number) => {
    // Map intensity to Garmin zones (1-5)
    if (type === 'rpe') {
      return Math.min(5, Math.max(1, Math.round((min + max) / 2)));
    }
    return 3; // Default to moderate intensity
  };

  const exportToGarmin = async () => {
    setExportStatus('exporting');
    
    try {
      const fitData = generateFITFile();
      
      // Create downloadable file
      const blob = new Blob([JSON.stringify(fitData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${workoutName.replace(/\s+/g, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setExportStatus('success');
      setTimeout(() => setExportStatus('idle'), 3000);
    } catch (error) {
      setExportStatus('error');
      setTimeout(() => setExportStatus('idle'), 3000);
    }
  };

  const connectToGarmin = () => {
    // In a real implementation, this would use Garmin Connect IQ SDK
    alert('Garmin Connect integration would require Garmin Connect IQ SDK setup');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Watch className="h-5 w-5" />
          Garmin Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-gray-600">
          Export your structured workout to Garmin devices
        </div>
        
        {intervals.length === 0 && (
          <Alert>
            <AlertDescription>
              Add workout intervals to enable Garmin export
            </AlertDescription>
          </Alert>
        )}
        
        {intervals.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm">
              <strong>Workout Summary:</strong>
              <ul className="mt-1 space-y-1">
                {intervals.map((interval, index) => (
                  <li key={interval.id} className="text-gray-600">
                    {index + 1}. {interval.name} - {interval.duration}
                    {interval.durationType === 'time' ? 'min' : 'km'} @ 
                    {interval.intensityMin}-{interval.intensityMax}
                    {interval.intensityType === 'heartRate' ? 'bpm' : 
                     interval.intensityType === 'power' ? 'W' :
                     interval.intensityType === 'pace' ? 'min/km' : 'RPE'}
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={exportToGarmin}
                disabled={exportStatus === 'exporting'}
                className="flex-1"
              >
                <Download className="h-4 w-4 mr-2" />
                {exportStatus === 'exporting' ? 'Exporting...' : 'Download Workout File'}
              </Button>
              
              <Button 
                variant="outline"
                onClick={connectToGarmin}
                className="flex-1"
              >
                <Smartphone className="h-4 w-4 mr-2" />
                Connect to Garmin
              </Button>
            </div>
            
            {exportStatus === 'success' && (
              <Alert>
                <AlertDescription className="text-green-600">
                  Workout file downloaded! Transfer to your Garmin device via Garmin Connect.
                </AlertDescription>
              </Alert>
            )}
            
            {exportStatus === 'error' && (
              <Alert>
                <AlertDescription className="text-red-600">
                  Export failed. Please try again.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="text-xs text-gray-500">
              <strong>Instructions:</strong>
              <ol className="mt-1 space-y-1">
                <li>1. Download the workout file</li>
                <li>2. Open Garmin Connect on your phone/computer</li>
                <li>3. Import the workout to your training calendar</li>
                <li>4. Sync with your Garmin device</li>
              </ol>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GarminExport;
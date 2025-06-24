import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Watch, Smartphone, Download, Upload, CheckCircle } from 'lucide-react';
import GarminConnect from './GarminConnect';
import GarminSeamless from './GarminSeamless';

const GarminSetup: React.FC = () => {
  const handleWorkoutsImported = (workouts: any[]) => {
    console.log('Imported workouts:', workouts);
    // Refresh the workout list or show success message
  };

  const handleAutoSyncChange = (enabled: boolean) => {
    console.log('Auto-sync', enabled ? 'enabled' : 'disabled');
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Connect Your Garmin Account</h2>
        <p className="text-gray-600">
          Automatically import your endurance workouts and seamlessly sync with your device
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Connection Component */}
        <GarminConnect onWorkoutsImported={handleWorkoutsImported} />

        {/* Seamless Integration */}
        <GarminSeamless onAutoSyncChange={handleAutoSyncChange} />
      </div>

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Setup Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-1">1</Badge>
              <div>
                <p className="font-medium">Connect Account</p>
                <p className="text-sm text-gray-600">
                  Click "Connect Garmin Account" to authorize access to your Garmin Connect data
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-1">2</Badge>
              <div>
                <p className="font-medium">Enable Seamless Integration</p>
                <p className="text-sm text-gray-600">
                  Turn on auto-sync for real-time workout imports and automatic training plan exports
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-1">3</Badge>
              <div>
                <p className="font-medium">Train & Track</p>
                <p className="text-sm text-gray-600">
                  Your workouts will automatically appear here after completion on your Garmin device
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Types */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Seamless Data Flow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Auto Import</h4>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Real-time workout sync</li>
                <li>• Complete activity data</li>
                <li>• Heart rate & power zones</li>
                <li>• Training metrics</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Auto Export</h4>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Training plans to device</li>
                <li>• Structured workouts</li>
                <li>• Target zones & intervals</li>
                <li>• Workout guidance</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Smart Sync</h4>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Webhook notifications</li>
                <li>• Instant updates</li>
                <li>• No manual intervention</li>
                <li>• Background processing</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Privacy Notice */}
      <Alert>
        <CheckCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Privacy & Security:</strong> Your Garmin data is securely stored and only used to enhance your training experience. 
          Seamless integration uses encrypted webhooks and can be disabled at any time.
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default GarminSetup;
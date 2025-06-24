import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Watch, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface GarminConnectProps {
  onWorkoutsImported?: (workouts: any[]) => void;
}

const GarminConnect: React.FC<GarminConnectProps> = ({ onWorkoutsImported }) => {
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [garminData, setGarminData] = useState<any>(null);

  useEffect(() => {
    checkConnectionStatus();
  }, []);

  const checkConnectionStatus = async () => {
    try {
      // Check if user has Garmin connection stored
      const { data, error } = await supabase
        .from('user_connections')
        .select('*')
        .eq('provider', 'garmin')
        .single();
      
      if (data && !error) {
        setConnectionStatus('connected');
        setLastSync(new Date(data.last_sync));
        setGarminData(data.connection_data);
      }
    } catch (error) {
      console.log('No existing Garmin connection found');
    }
  };

  const initiateGarminAuth = async () => {
    setConnectionStatus('connecting');
    
    try {
      // In a real implementation, this would redirect to Garmin OAuth
      // For demo purposes, we'll simulate the connection
      const authUrl = 'https://connect.garmin.com/oauth/authorize';
      const clientId = 'your-garmin-client-id';
      const redirectUri = window.location.origin + '/garmin-callback';
      const scope = 'read:activities,read:profile';
      
      const fullAuthUrl = `${authUrl}?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
      
      // Open popup for OAuth
      const popup = window.open(fullAuthUrl, 'garmin-auth', 'width=600,height=600');
      
      // Listen for popup close or message
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          // Simulate successful connection for demo
          setTimeout(() => {
            setConnectionStatus('connected');
            setLastSync(new Date());
            saveConnectionData();
          }, 1000);
        }
      }, 1000);
      
    } catch (error) {
      setConnectionStatus('error');
      console.error('Garmin auth error:', error);
    }
  };

  const saveConnectionData = async () => {
    try {
      const connectionData = {
        provider: 'garmin',
        access_token: 'demo-token',
        refresh_token: 'demo-refresh',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        last_sync: new Date().toISOString(),
        connection_data: {
          user_id: 'garmin-user-123',
          display_name: 'Garmin User'
        }
      };
      
      await supabase
        .from('user_connections')
        .upsert(connectionData);
        
    } catch (error) {
      console.error('Error saving connection:', error);
    }
  };

  const syncWorkouts = async () => {
    setSyncStatus('syncing');
    
    try {
      // Simulate fetching workouts from Garmin
      const mockWorkouts = [
        {
          name: 'Morning Run',
          type: 'endurance',
          date: new Date().toISOString(),
          duration: 45,
          distance: 8.5,
          avg_heart_rate: 155,
          max_heart_rate: 172,
          calories: 420,
          avg_pace: 330, // seconds per km
          elevation_gain: 120
        },
        {
          name: 'Bike Ride',
          type: 'endurance', 
          date: new Date(Date.now() - 86400000).toISOString(),
          duration: 90,
          distance: 35.2,
          avg_heart_rate: 142,
          max_heart_rate: 165,
          avg_power: 185,
          max_power: 245,
          calories: 650,
          elevation_gain: 450
        }
      ];
      
      // Save to database
      for (const workout of mockWorkouts) {
        await supabase
          .from('workouts')
          .insert({
            ...workout,
            source: 'garmin',
            created_at: new Date().toISOString()
          });
      }
      
      setSyncStatus('success');
      setLastSync(new Date());
      onWorkoutsImported?.(mockWorkouts);
      
      setTimeout(() => setSyncStatus('idle'), 3000);
      
    } catch (error) {
      setSyncStatus('error');
      console.error('Sync error:', error);
      setTimeout(() => setSyncStatus('idle'), 3000);
    }
  };

  const disconnectGarmin = async () => {
    try {
      await supabase
        .from('user_connections')
        .delete()
        .eq('provider', 'garmin');
        
      setConnectionStatus('disconnected');
      setLastSync(null);
      setGarminData(null);
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Watch className="h-5 w-5" />
          Garmin Connect
          <Badge variant={connectionStatus === 'connected' ? 'default' : 'secondary'}>
            {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {connectionStatus === 'disconnected' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Connect your Garmin account to automatically import your endurance workouts
            </p>
            <Button 
              onClick={initiateGarminAuth}
              disabled={connectionStatus === 'connecting'}
              className="w-full"
            >
              {connectionStatus === 'connecting' ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Watch className="h-4 w-4 mr-2" />
              )}
              {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect Garmin Account'}
            </Button>
          </div>
        )}
        
        {connectionStatus === 'connected' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              Connected to Garmin Connect
            </div>
            
            {lastSync && (
              <p className="text-sm text-gray-600">
                Last sync: {lastSync.toLocaleString()}
              </p>
            )}
            
            <div className="flex gap-2">
              <Button 
                onClick={syncWorkouts}
                disabled={syncStatus === 'syncing'}
                className="flex-1"
              >
                {syncStatus === 'syncing' ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Workouts'}
              </Button>
              
              <Button 
                variant="outline"
                onClick={disconnectGarmin}
                className="flex-1"
              >
                Disconnect
              </Button>
            </div>
            
            {syncStatus === 'success' && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription className="text-green-600">
                  Workouts synced successfully!
                </AlertDescription>
              </Alert>
            )}
            
            {syncStatus === 'error' && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-red-600">
                  Sync failed. Please try again.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
        
        {connectionStatus === 'error' && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-red-600">
              Failed to connect to Garmin. Please try again.
            </AlertDescription>
          </Alert>
        )}
        
        <div className="text-xs text-gray-500 space-y-1">
          <p><strong>What gets imported:</strong></p>
          <ul className="list-disc list-inside space-y-1">
            <li>Running, cycling, and other endurance activities</li>
            <li>Heart rate, power, pace, and distance data</li>
            <li>Elevation, calories, and training metrics</li>
            <li>Automatic workout categorization</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default GarminConnect;
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
    
    // Listen for OAuth callback
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'GARMIN_OAUTH_SUCCESS') {
        handleOAuthSuccess(event.data.code);
      } else if (event.data.type === 'GARMIN_OAUTH_ERROR') {
        setConnectionStatus('error');
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
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

  // Generate PKCE code verifier and challenge
  const generatePKCE = () => {
    const codeVerifier = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
      .then(hashBuffer => {
        const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '');
        
        return { codeVerifier, codeChallenge };
      });
  };

  const initiateGarminAuth = async () => {
    setConnectionStatus('connecting');
    
    try {
      const { codeVerifier, codeChallenge } = await generatePKCE();
      
      // Store code verifier for later use
      sessionStorage.setItem('garmin_code_verifier', codeVerifier);
      
      const authUrl = 'https://connect.garmin.com/oauth2Confirm';
      const clientId = (import.meta as any).env?.VITE_GARMIN_CLIENT_ID || '';
      const redirectUri = 'http://localhost:8080/auth/garmin/callback';
      
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        redirect_uri: redirectUri,
        state: Math.random().toString(36).substring(2, 15)
      });
      
      const fullAuthUrl = `${authUrl}?${params.toString()}`;
      
      // Open popup for OAuth
      const popup = window.open(fullAuthUrl, 'garmin-auth', 'width=600,height=600');
      
      // Check if popup was blocked
      if (!popup) {
        setConnectionStatus('error');
        return;
      }
      
    } catch (error) {
      setConnectionStatus('error');
      console.error('Garmin auth error:', error);
    }
  };

  const handleOAuthSuccess = async (code: string) => {
    try {
      const codeVerifier = sessionStorage.getItem('garmin_code_verifier');
      if (!codeVerifier) {
        throw new Error('Code verifier not found');
      }
      
      // Exchange code for access token
      const tokenResponse = await fetch('https://connectapi.garmin.com/di-oauth2-service/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: (import.meta as any).env?.VITE_GARMIN_CLIENT_ID || '',
          client_secret: (import.meta as any).env?.VITE_GARMIN_CLIENT_SECRET || '',
          code: code,
          code_verifier: codeVerifier,
          redirect_uri: 'http://localhost:8080/auth/garmin/callback'
        })
      });
      
      if (!tokenResponse.ok) {
        throw new Error(`Token exchange failed: ${tokenResponse.status}`);
      }
      
      const tokenData = await tokenResponse.json();
      
      await saveConnectionData(tokenData);

      // One-time: fetch and save Garmin userId if missing
      try {
        // Get Supabase session for auth header
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseClient = createClient(
          'https://yyriamwvtvzlkumqrvpm.supabase.co',
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY'
        );
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
          // Check if user_id already stored
          const { data: existing } = await supabaseClient
            .from('user_connections')
            .select('connection_data')
            .eq('provider', 'garmin')
            .single();

          const hasUserId = !!existing?.connection_data?.user_id;
          if (!hasUserId) {
            // Fetch Garmin user id via proxy
            const path = '/wellness-api/rest/user/id';
            const url = `https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/swift-task?path=${encodeURIComponent(path)}&token=${tokenData.access_token}`;
            const resp = await fetch(url, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Accept': 'application/json'
              }
            });
            if (resp.ok) {
              const body = await resp.json();
              const garminUserId = body?.userId;
              if (garminUserId) {
                // Merge existing connection_data with user_id
                const newConnectionData = {
                  ...(existing?.connection_data || {}),
                  user_id: garminUserId
                };
                await supabaseClient
                  .from('user_connections')
                  .update({ connection_data: newConnectionData })
                  .eq('provider', 'garmin')
                  .eq('user_id', session.user.id);
              }
            }
          }
        }
      } catch (_) {
        // Non-fatal if user id fetch/save fails
      }

      setConnectionStatus('connected');
      setLastSync(new Date());
      
      // Clean up
      sessionStorage.removeItem('garmin_code_verifier');
      
    } catch (error) {
      setConnectionStatus('error');
      console.error('OAuth success handler error:', error);
      sessionStorage.removeItem('garmin_code_verifier');
    }
  };

  const saveConnectionData = async (tokenData: any) => {
    try {
      const connectionData = {
        provider: 'garmin',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString(),
        last_sync: new Date().toISOString(),
        connection_data: {
          token_type: tokenData.token_type,
          scope: tokenData.scope
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
      // Get access token
      const { data: connectionData } = await supabase
        .from('user_connections')
        .select('*')
        .eq('provider', 'garmin')
        .single();
      
      if (!connectionData) {
        throw new Error('No Garmin connection found');
      }
      
      // Check if token is expired
      if (new Date() >= new Date(connectionData.expires_at)) {
        // Refresh token logic would go here
        throw new Error('Token expired');
      }
      
      // Fetch activities from Garmin
      const activitiesResponse = await fetch('https://connectapi.garmin.com/modern/proxy/activitylist-service/activities/search/activities', {
        headers: {
          'Authorization': `Bearer ${connectionData.access_token}`,
        }
      });
      
      if (!activitiesResponse.ok) {
        throw new Error(`API call failed: ${activitiesResponse.status}`);
      }
      
      const activitiesData = await activitiesResponse.json();
      
      // Process and save workouts
      const workouts = activitiesData.map((activity: any) => {
        // Map activity type from Garmin to our workout types
        const getWorkoutType = (activityType: string): "run" | "ride" | "swim" | "strength" | "walk" => {
          const type = activityType?.toLowerCase() || '';
          if (type.includes('walk') || type.includes('hiking')) return 'walk';
          if (type.includes('swim')) return 'swim';
          if (type.includes('bike') || type.includes('cycling') || type.includes('cycle')) return 'ride';
          if (type.includes('strength') || type.includes('weight')) return 'strength';
          if (type.includes('run') || type.includes('jog')) return 'run';
          return 'run'; // Default to run for endurance activities
        };

        return {
          name: activity.activityName || 'Garmin Activity',
          type: getWorkoutType(activity.activityType || ''),
          date: activity.startTimeLocal,
          duration: Math.round(activity.duration / 60), // Convert to minutes
          distance: activity.distance ? activity.distance / 1000 : null, // Convert to km
          avg_heart_rate: activity.averageHR,
          max_heart_rate: activity.maxHR,
          calories: activity.calories,
          avg_pace: activity.averageSpeed ? (1000 / activity.averageSpeed) : null, // Convert to seconds per km
          elevation_gain: activity.elevationGain,
          source: 'garmin',
          created_at: new Date().toISOString()
        };
      });
      
      // Save to database
      for (const workout of workouts) {
        await supabase
          .from('workouts')
          .insert(workout);
      }
      
      setSyncStatus('success');
      setLastSync(new Date());
      onWorkoutsImported?.(workouts);
      
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
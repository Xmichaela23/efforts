import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle,
  Clock,
  Zap,
  Settings,
  Link2,
  Unlink,
  Calendar,
  Watch
} from 'lucide-react';
import { useToast } from './ui/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '../lib/supabase';

interface ConnectionStatus {
  provider: string;
  connected: boolean;
  lastSync?: string;
  webhookActive?: boolean;
  syncStatus: 'idle' | 'syncing' | 'error' | 'success';
  connectionData?: any;
  providerUserId?: string;
}

const Connections: React.FC = () => {
  const [connections, setConnections] = useState<ConnectionStatus[]>([
    {
      provider: 'garmin',
      connected: false,
      syncStatus: 'idle'
    },
    {
      provider: 'strava',
      connected: false,
      syncStatus: 'idle'
    }
  ]);
  
  const [loading, setLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<{ importing: boolean; progress: number; total: number }>({
    importing: false,
    progress: 0,
    total: 0
  });
  const { toast } = useToast();
  const [stravaStartDate, setStravaStartDate] = useState<string>('');
  const [stravaEndDate, setStravaEndDate] = useState<string>('');
  const isMobile = useIsMobile();
  const [showDateControls, setShowDateControls] = useState(false);
  const navigate = useNavigate();

  // Garmin connection state
  const [garminConnected, setGarminConnected] = useState(false);
  const [garminMessage, setGarminMessage] = useState('');
  const [garminAccessToken, setGarminAccessToken] = useState<string | null>(null);

  useEffect(() => {
    // On desktop, show controls by default; on mobile, keep them collapsed
    setShowDateControls(!isMobile);
  }, [isMobile]);

  // Listen for Garmin OAuth callback messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'garmin-oauth-success') {
        handleGarminOAuthSuccess(event.data.code);
      } else if (event.data.type === 'garmin-oauth-error') {
        setGarminMessage(`Error: ${event.data.error}`);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Check for existing Garmin token on mount
  useEffect(() => {
    const existingToken = localStorage.getItem('garmin_access_token');
    if (existingToken) {
      setGarminAccessToken(existingToken);
      setGarminConnected(true);
    }
  }, []);

  const goToDashboard = () => {
    navigate('/');
  };

  // PKCE helper function for Garmin OAuth
  const generatePKCE = async () => {
    const codeVerifier = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    return { codeVerifier, codeChallenge };
  };

  useEffect(() => {
    // Check localStorage for Strava connection status
    const stravaConnected = localStorage.getItem('strava_connected') === 'true';
    const stravaToken = localStorage.getItem('strava_access_token');
    
    if (stravaConnected && stravaToken) {
      setConnections(prev => prev.map(conn => 
        conn.provider === 'strava' 
          ? { ...conn, connected: true }
          : conn
      ));
    }

    // Check localStorage for Garmin connection status
    const garminToken = localStorage.getItem('garmin_access_token');
    if (garminToken) {
      setGarminConnected(true);
      setGarminAccessToken(garminToken);
      setConnections(prev => prev.map(conn => 
        conn.provider === 'garmin' 
          ? { ...conn, connected: true }
          : conn
      ));
    }
    
    loadConnectionStatus();
    
    // Listen for when user returns from OAuth redirect
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const currentStravaConnected = localStorage.getItem('strava_connected') === 'true';
        const currentStravaToken = localStorage.getItem('strava_access_token');
        
        if (currentStravaConnected && currentStravaToken) {
          setConnections(prev => prev.map(conn => 
            conn.provider === 'strava' 
              ? { ...conn, connected: true }
              : conn
          ));
        }

        const currentGarminToken = localStorage.getItem('garmin_access_token');
        if (currentGarminToken) {
          setGarminConnected(true);
          setGarminAccessToken(currentGarminToken);
          setConnections(prev => prev.map(conn => 
            conn.provider === 'garmin' 
              ? { ...conn, connected: true }
              : conn
          ));
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const loadConnectionStatus = async () => {
    try {
      setLoading(true);
      
      // Get user ID from Supabase auth
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.id) {
        console.log('No authenticated user found');
        return;
      }
      
      // Load existing connections from database (check both tables)
      const { data: deviceConnections } = await supabase
        .from('device_connections')
        .select('*')
        .eq('user_id', authUser.id);
        
      const { data: userConnections } = await supabase
        .from('user_connections')
        .select('*')
        .eq('user_id', authUser.id);
        
      // Combine both connection sources
      const allConnections = [...(deviceConnections || []), ...(userConnections || [])];

      if (allConnections.length > 0) {
        const updatedConnections = connections.map(conn => {
          const existing = allConnections.find(uc => uc.provider === conn.provider);
          return {
            ...conn,
            connected: !!existing,
            lastSync: existing?.last_sync || existing?.connection_data?.last_sync,
            webhookActive: existing?.webhook_active || false,
            connectionData: existing?.connection_data || null,
            providerUserId: existing?.provider_user_id || null
          };
        });
        
        console.log('🔄 Updated connections:', updatedConnections);
        setConnections(updatedConnections);
      }
    } catch (error) {
      console.error('Error loading connections:', error);
    } finally {
      setLoading(false);
    }
  };

  const connectStrava = () => {
    const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
    const redirectUri = `${window.location.origin}/strava/callback`;
    const scope = 'read,activity:read_all';
    
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
    
    console.log('Strava OAuth Debug:', { authUrl, clientId });
    
    // Safari: redirect in same tab (like Garmin does)
    if (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')) {
      // Safari - redirect in same tab
      window.location.href = authUrl;
    } else {
      // Chrome/Firefox - use popup
      const popup = window.open(
        authUrl,
        '_blank',
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );
      
      if (!popup) {
        // Fallback to same tab if popup blocked
        window.location.href = authUrl;
      }
    }
  };

  const setupStravaWebhook = async (athleteId: string, accessToken: string) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.id) throw new Error('Not authenticated');
      // Call your Supabase Edge Function to setup webhook
      const response = await fetch('https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/strava-webhook-manager', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY`
        },
        body: JSON.stringify({
          action: 'subscribe',
          userId: authUser.id,
          accessToken,
          athleteId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to setup webhook');
      }

      // Update connection status
      const { error } = await supabase
        .from('device_connections')
        .update({ webhook_active: true })
        .eq('user_id', authUser.id)
        .filter('provider', 'eq', 'strava');

      if (error) throw error;

    } catch (error) {
      console.error('Error setting up webhook:', error);
      toast({
        title: "Webhook Setup Failed",
        description: "Connected to Strava but webhook setup failed. Activities won't sync automatically.",
        variant: "destructive"
      });
    }
  };

  const disconnectStrava = async () => {
    try {
      setLoading(true);
      
      // Clear any legacy localStorage tokens (no longer required)
      localStorage.removeItem('strava_access_token');
      localStorage.removeItem('strava_refresh_token');
      localStorage.removeItem('strava_expires_at');
      localStorage.removeItem('strava_athlete');
      localStorage.removeItem('strava_connected');

      // Get authenticated user (avoid relying solely on context)
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.id) {
        throw new Error('Not authenticated');
      }

      // Prefer server-side delete via Edge Function (uses service role to bypass RLS)
      if (authUser.id) {
        let invoked = false;
        let invokeErr: any = null;
        // Primary function name
        const primary = await supabase.functions.invoke('disconnect-connection', {
          body: { userId: authUser.id, provider: 'strava' }
        });
        if (!primary.error) {
          invoked = true;
        } else {
          invokeErr = primary.error;
          // Some environments have it deployed with a misspelling; try alternate
          const alt = await supabase.functions.invoke('disconect-connection', {
            body: { userId: authUser.id, provider: 'strava' }
          });
          if (!alt.error) {
            invoked = true;
          } else {
            invokeErr = alt.error;
          }
        }

        if (!invoked) {
          // Fallback to client delete in case function unavailable
          const { error: clientDelErr } = await supabase
            .from('device_connections')
            .delete()
            .eq('user_id', authUser.id)
            .filter('provider', 'eq', 'strava');
          if (clientDelErr) {
            throw new Error(`Disconnect failed: ${invokeErr?.message || 'invoke error'}; client delete blocked by RLS`);
          }
        }

        // Verify deletion actually succeeded before updating UI
        const { data: remains, error: checkErr } = await supabase
          .from('device_connections')
          .select('id')
          .eq('user_id', authUser.id)
          .filter('provider', 'eq', 'strava');
        if (checkErr) {
          throw checkErr;
        }
        const stillConnected = Array.isArray(remains) && remains.length > 0;
        if (stillConnected) {
          throw new Error('Disconnect did not remove the connection record');
        }
      }

      // Only show success after verification passes
      toast({
        title: "Strava Disconnected",
        description: "Your Strava account has been disconnected.",
      });

      // Update UI state
      setConnections(prev => prev.map(conn =>
        conn.provider === 'strava' ? { ...conn, connected: false, webhookActive: false } : conn
      ));

      // Re-fetch status
      await loadConnectionStatus();
      
    } catch (error) {
      console.error('Error disconnecting Strava:', error);
      toast({
        title: "Disconnect Failed",
        description: `${error instanceof Error ? error.message : 'Failed to disconnect from Strava.'}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const importHistoricalData = async (provider: string, startDate?: string, endDate?: string) => {
    try {
      setLoading(true);
      setImportProgress({ importing: true, progress: 0, total: 0 });
      
      if (provider === 'strava') {
        // Get user ID from Supabase auth
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser?.id) {
          throw new Error('User not authenticated');
        }
        
        // Read tokens from server-side device_connections (authoritative)
        const { data: conn } = await supabase
          .from('device_connections')
          .select('connection_data, access_token, refresh_token')
          .eq('user_id', authUser.id)
          .filter('provider', 'eq', 'strava')
          .single();

        const accessToken = (conn?.connection_data?.access_token || conn?.access_token) as string | undefined;
        const refreshToken = (conn?.connection_data?.refresh_token || conn?.refresh_token) as string | undefined;
        if (!accessToken) throw new Error('Strava is not connected');

        // Call Supabase Edge Function via client (auth headers auto-applied)
        const { data: result, error: fxErr } = await supabase.functions.invoke('import-strava-history', {
          body: {
            userId: authUser.id,
            accessToken,
            refreshToken,
            importType: 'historical',
            startDate,
            endDate,
          },
        });
        if (fxErr) throw new Error(fxErr.message || 'Failed to import historical data');

        // If function refreshed tokens, persist them
        // (No localStorage writes needed; function updates device_connections)
        
        // Show success message
        toast({
          title: "Import Complete!",
          description: `Successfully imported ${result.imported} activities${result.skipped > 0 ? ` (${result.skipped} skipped)` : ''}. Redirecting to dashboard...`,
        });

        // Redirect to dashboard after a short delay
        setTimeout(() => {
          navigate('/');
        }, 2000);
      }
      
    } catch (error) {
      console.error('Error importing historical data:', error);
      toast({
        title: "Import Failed",
        description: "Failed to import historical data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setImportProgress({ importing: false, progress: 0, total: 0 });
    }
  };

  const toggleWebhook = async (provider: string, enabled: boolean) => {
    try {
      setLoading(true);
      
      if (enabled) {
        // Get existing connection data to re-enable webhook
        const { data: connection } = await supabase
          .from('device_connections')
          .select('*')
          .eq('user_id', (await supabase.auth.getUser()).data.user?.id || '')
          .filter('provider', 'eq', provider)
          .single();

        if (connection) {
          await setupStravaWebhook(connection.connection_data?.athlete?.id || '', connection.access_token);
        }
      } else {
        // Disable webhook
        const response = await fetch('https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/strava-webhook-manager', {
          method: 'POST',
                  headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY`
        },
        body: JSON.stringify({
          action: 'unsubscribe',
          userId: (await supabase.auth.getUser()).data.user?.id
        })
        });
      }

      // Update connection status
      const { data: { user: authUser2 } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('device_connections')
        .update({ webhook_active: enabled })
        .eq('user_id', authUser2?.id || '')
        .filter('provider', 'eq', provider);

      if (error) throw error;

      toast({
        title: `Webhook ${enabled ? 'Enabled' : 'Disabled'}`,
        description: `Real-time sync is now ${enabled ? 'active' : 'inactive'}.`,
      });

      loadConnectionStatus();
      
    } catch (error) {
      console.error('Error toggling webhook:', error);
      toast({
        title: "Webhook Toggle Failed",
        description: "Failed to update webhook status. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'strava':
        return (
          <div className="flex items-center justify-center w-5 h-5">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-orange-500">
              <path fill="currentColor" d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7.13 14.828h4.169"/>
            </svg>
          </div>
        );
      case 'garmin':
        return (
          <div className="flex items-center justify-center w-5 h-5">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-600">
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
          </div>
        );
      default:
        return <Link2 className="h-5 w-5" />;
    }
  };

  const getProviderName = (provider: string) => {
    switch (provider) {
      case 'strava':
        return 'Strava';
      case 'garmin':
        return 'Garmin';
      default:
        return provider.charAt(0).toUpperCase() + provider.slice(1);
    }
  };

  // Handle Garmin OAuth success
  const handleGarminOAuthSuccess = async (code: string) => {
    try {
      const codeVerifier = sessionStorage.getItem('garmin_code_verifier');
      if (!codeVerifier) {
        throw new Error('Code verifier not found');
      }

      // Get user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('User must be logged in');
      }

      // Exchange code for access token using Supabase function
      const tokenResponse = await fetch('https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/bright-service', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          code: code,
          codeVerifier: codeVerifier,
          redirectUri: 'https://efforts.work/auth/garmin/callback'
        })
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('🔍 GARMIN DEBUG: Token exchange failed:', errorText);
        throw new Error(`Token exchange failed: ${tokenResponse.status}`);
      }

      const tokenData = await tokenResponse.json();
      
      // Persist Garmin OAuth tokens to user_connections
      try {
        await supabase
          .from('user_connections')
          .upsert({
            provider: 'garmin',
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: tokenData.expires_at || new Date(Date.now() + (Number(tokenData.expires_in || 0) * 1000)).toISOString(),
            connection_data: {
              ...(typeof tokenData.scope === 'string' ? { scope: tokenData.scope } : {}),
              token_type: tokenData.token_type || 'bearer'
            }
          });

        // Try to enrich with Garmin user_id (non-fatal)
        try {
          const path = '/wellness-api/rest/user/id';
          const url = `https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/swift-task?path=${encodeURIComponent(path)}&token=${tokenData.access_token}`;
          const respUser = await fetch(url, { headers: { 'Authorization': `Bearer ${session.access_token}` } });
          if (respUser.ok) {
            const body = await respUser.json();
            const garminUserId = body?.userId;
            if (garminUserId) {
              await supabase
                .from('user_connections')
                .update({ connection_data: { scope: tokenData.scope, token_type: tokenData.token_type || 'bearer', user_id: garminUserId, access_token: tokenData.access_token } })
                .eq('provider', 'garmin');
            }
          }
        } catch {}
      } catch (_) {}

      // Set both state and localStorage with the new token
      setGarminAccessToken(tokenData.access_token);
      setGarminConnected(true);
      localStorage.setItem('garmin_access_token', tokenData.access_token);
      setGarminMessage('Successfully connected to Garmin!');

      // Clean up
      sessionStorage.removeItem('garmin_code_verifier');

      // Update connections state
      setConnections(prev => prev.map(conn =>
        conn.provider === 'garmin' 
          ? { ...conn, connected: true, lastSync: new Date().toISOString() }
          : conn
      ));

    } catch (error) {
      console.error('🔍 GARMIN DEBUG: OAuth error:', error);
      setGarminMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      sessionStorage.removeItem('garmin_code_verifier');
    }
  };

  // Garmin connection functions
  const connectGarmin = async () => {
    localStorage.removeItem('garmin_access_token');
    setGarminMessage('Connecting to Garmin...');
    
    try {
      const { codeVerifier, codeChallenge } = await generatePKCE();
      
      // Store code verifier for later use
      sessionStorage.setItem('garmin_code_verifier', codeVerifier);
      
      const authUrl = 'https://connect.garmin.com/oauth2Confirm';
      const clientId = (import.meta as any).env?.VITE_GARMIN_CLIENT_ID || '';
      const redirectUri = 'https://efforts.work/auth/garmin/callback';
      
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
        setGarminMessage('Popup was blocked. Please allow popups for this site and try again.');
        sessionStorage.removeItem('garmin_code_verifier');
        return;
      }
      
    } catch (error) {
      setGarminMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      sessionStorage.removeItem('garmin_code_verifier');
    }
  };

  const disconnectGarmin = async () => {
    try {
      setLoading(true);
      
      // Clear localStorage tokens
      localStorage.removeItem('garmin_access_token');
      
      // Get authenticated user
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.id) {
        throw new Error('Not authenticated');
      }

      // Delete from user_connections
      const { error } = await supabase
        .from('user_connections')
        .delete()
        .eq('user_id', authUser.id)
        .filter('provider', 'eq', 'garmin');

      if (error) throw error;

      // Update UI state
      setGarminConnected(false);
      setGarminAccessToken(null);
      setGarminMessage('Disconnected from Garmin');
      
      setConnections(prev => prev.map(conn =>
        conn.provider === 'garmin' ? { ...conn, connected: false } : conn
      ));

      toast({
        title: "Garmin Disconnected",
        description: "Your Garmin account has been disconnected.",
      });

    } catch (error) {
      console.error('Error disconnecting Garmin:', error);
      toast({
        title: "Disconnect Failed",
        description: `${error instanceof Error ? error.message : 'Failed to disconnect from Garmin.'}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const testGarminApi = async () => {
    if (!garminAccessToken) return;

    try {
      setGarminMessage('Testing API call...');
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const path = '/wellness-api/rest/user/id';
      const url = `https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/swift-task?path=${encodeURIComponent(path)}&token=${garminAccessToken}`;
      const response = await fetch(url, { 
        headers: { 'Authorization': `Bearer ${session.access_token}` } 
      });

      if (!response.ok) {
        throw new Error(`API call failed: ${response.status}`);
      }

      const data = await response.json();
      setGarminMessage(`API test successful! User ID: ${data.userId || 'Unknown'}`);
    } catch (error) {
      setGarminMessage(`API test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const getProviderDescription = (provider: string) => {
    switch (provider) {
      case 'strava':
        return 'Connect your Strava account to automatically sync activities and enable real-time updates via webhooks.';
      case 'garmin':
        return 'Connect your Garmin device to sync activities and training data.';
      default:
        return `Connect your ${provider} account to sync data.`;
    }
  };

  return (
    <div className="mobile-app-container">
      <header className="mobile-header">
        <div className="w-full">
          <div className="flex items-center justify-between h-16 w-full px-4">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/'); }} 
                className="text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                ← Back
              </button>
              <h1 className="text-2xl font-bold">Connections</h1>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={goToDashboard} 
                className="text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Dashboard
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="mobile-main-content overflow-y-auto overflow-x-hidden">
        <div className="max-w-4xl mx-auto p-6 min-h-0">
      
      <div className="text-center space-y-2">
        <p className="text-gray-600">
          Connect your fitness services to automatically sync data and enable real-time updates.
        </p>
      </div>

      <div className="grid gap-6">
        {connections.map((connection) => (
          <Card key={connection.provider} className="relative">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getProviderIcon(connection.provider)}
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      {getProviderName(connection.provider)}
                      {connection.connected && (
                        <div className={`w-2 h-2 rounded-full animate-pulse ${
                          connection.provider === 'garmin' 
                            ? 'bg-blue-500' 
                            : connection.provider === 'strava'
                            ? 'bg-orange-500'
                            : 'bg-green-500'
                        }`}></div>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {getProviderDescription(connection.provider)}
                    </CardDescription>
                  </div>
                </div>
                
                {connection.connected && (
                  <div className="flex items-center space-x-4">
                    {connection.provider !== 'strava' && (
                      <div className="flex items-center space-x-2">
                        <Label htmlFor={`webhook-${connection.provider}`} className="text-sm">
                          Real-time Sync
                        </Label>
                        <Switch
                          id={`webhook-${connection.provider}`}
                          checked={connection.webhookActive}
                          onCheckedChange={(enabled) => toggleWebhook(connection.provider, enabled)}
                          disabled={loading}
                        />
                      </div>
                    )}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (connection.provider === 'strava') {
                          disconnectStrava();
                        } else if (connection.provider === 'garmin') {
                          disconnectGarmin();
                        }
                      }}
                      disabled={loading}
                    >
                      <Unlink className="h-4 w-4 mr-2" />
                      Disconnect
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent>
              {connection.connected ? (
                <div className="space-y-4">
                  {/* Connected Status Indicator */}
                  <div className={`p-3 rounded-md border ${
                    connection.provider === 'garmin' 
                      ? 'bg-blue-50 border-blue-200' 
                      : connection.provider === 'strava'
                      ? 'bg-orange-50 border-orange-200'
                      : 'bg-green-50 border-green-200'
                  }`}>
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${
                        connection.provider === 'garmin' 
                          ? 'bg-blue-500' 
                          : connection.provider === 'strava'
                          ? 'bg-orange-500'
                          : 'bg-green-500'
                      }`}></div>
                      <span className={`text-sm font-medium ${
                        connection.provider === 'garmin' 
                          ? 'text-blue-800' 
                          : connection.provider === 'strava'
                          ? 'text-orange-800'
                          : 'text-green-800'
                      }`}>
                        ✓ Connected to {getProviderName(connection.provider)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Last Sync:</span>
                    <span className="flex items-center space-x-1">
                      <Clock className="h-3 w-3" />
                      <span>
                        {connection.lastSync 
                          ? new Date(connection.lastSync).toLocaleDateString()
                          : 'Never'
                        }
                      </span>
                    </span>
                  </div>

                  {connection.webhookActive && (
                    <div className="flex items-center space-x-2 text-sm text-green-600">
                      <Wifi className="h-3 w-3" />
                      <span>Real-time sync active</span>
                    </div>
                  )}

                  <div className="flex items-center space-x-2">
                    {/* Strava Date Range Picker */}
                    {connection.provider === 'strava' && showDateControls && (
                      <div className="flex flex-col space-y-2 w-full">
                        {/* Quick Preset Buttons */}
                        <div className="flex items-center space-x-2 text-xs">
                          <button
                            onClick={() => {
                              const end = new Date();
                              const start = new Date();
                              start.setDate(start.getDate() - 7);
                              setStravaStartDate(start.toISOString().split('T')[0]);
                              setStravaEndDate(end.toISOString().split('T')[0]);
                            }}
                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                          >
                            Last 7 days
                          </button>
                          <button
                            onClick={() => {
                              const end = new Date();
                              const start = new Date();
                              start.setDate(start.getDate() - 30);
                              setStravaStartDate(start.toISOString().split('T')[0]);
                              setStravaEndDate(end.toISOString().split('T')[0]);
                            }}
                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                          >
                            Last 30 days
                          </button>
                          <button
                            onClick={() => {
                              const end = new Date();
                              const start = new Date();
                              start.setDate(start.getDate() - 60);
                              setStravaStartDate(start.toISOString().split('T')[0]);
                              setStravaEndDate(end.toISOString().split('T')[0]);
                            }}
                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                          >
                            Last 60 days
                          </button>
                        </div>
                        
                        {/* Custom Date Range */}
                        <div className="flex items-center space-x-2 text-sm">
                          <input
                            type="date"
                            value={stravaStartDate}
                            onChange={(e) => setStravaStartDate(e.target.value)}
                            className="px-2 py-1 border rounded text-xs"
                            placeholder="Start Date"
                          />
                          <span className="text-gray-500">to</span>
                          <input
                            type="date"
                            value={stravaEndDate}
                            onChange={(e) => setStravaEndDate(e.target.value)}
                            className="px-2 py-1 border rounded text-xs"
                            placeholder="End Date"
                          />
                        </div>
                      </div>
                    )}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (connection.provider === 'strava') {
                          let start = stravaStartDate;
                          let end = stravaEndDate;
                          if (isMobile && !start && !end) {
                            const endD = new Date();
                            const startD = new Date();
                            startD.setDate(startD.getDate() - 30);
                            start = startD.toISOString().split('T')[0];
                            end = endD.toISOString().split('T')[0];
                          }
                          return importHistoricalData(connection.provider, start, end);
                        }
                        return importHistoricalData(connection.provider);
                      }}
                      disabled={loading}
                    >
                      <Zap className="h-4 w-4 mr-2" />
                      {isMobile ? 'Import' : 'Import History'}
                    </Button>

                    {/* Mobile-only: quick toggle to reveal date range controls */}
                    {connection.provider === 'strava' && isMobile && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDateControls((v) => !v)}
                        disabled={loading}
                      >
                        <Calendar className="h-4 w-4 mr-2" />
                        {showDateControls ? 'Hide Range' : 'Date Range'}
                      </Button>
                    )}
                    
                    {/* Progress Bar for Import */}
                    {importProgress.importing && connection.provider === 'strava' && (
                      <div className="w-full mt-2">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Importing activities...</span>
                          <span>{importProgress.progress}/{importProgress.total}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${importProgress.total > 0 ? (importProgress.progress / importProgress.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                    
                    {/* Garmin-specific testing and message display */}
                    {connection.provider === 'garmin' && garminConnected && (
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={testGarminApi}
                          disabled={loading || !garminAccessToken}
                          className="border-blue-300 text-blue-700 hover:bg-blue-50"
                        >
                          <Zap className="h-4 w-4 mr-2" />
                          Test API
                        </Button>
                        {garminMessage && (
                          <div className="p-2 bg-blue-50 rounded text-xs text-blue-700 border border-blue-200">
                            {garminMessage}
                          </div>
                        )}
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadConnectionStatus()}
                      disabled={loading}
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                      Refresh Status
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Button
                    onClick={() => {
                      if (connection.provider === 'strava') {
                        connectStrava();
                      } else if (connection.provider === 'garmin') {
                        connectGarmin();
                      }
                    }}
                    disabled={loading}
                    className={`w-full ${
                      connection.provider === 'garmin' 
                        ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                        : connection.provider === 'strava'
                        ? 'bg-orange-500 hover:bg-orange-600 text-white'
                        : ''
                    }`}
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    Connect {getProviderName(connection.provider)}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="text-center text-sm text-gray-500">
        <p>
          <strong>New activities will automatically sync</strong> via webhooks when you complete them.
          <br />
          Historical import is for bringing in your past activities. This may take a few minutes.
        </p>
      </div>
        </div>
      </main>
    </div>
  );
};

export default Connections;

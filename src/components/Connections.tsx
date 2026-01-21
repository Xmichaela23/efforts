import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { MobileHeader } from './MobileHeader';
import { 
  Activity, 
  Clock,
  Zap,
  Settings,
  Link2,
  Unlink,
  Calendar,
  Menu,
  User,
  Upload,
  Download,
  Link,
  Home,
  Package,
  Heart
} from 'lucide-react';
import PlansMenu from './PlansMenu';
import LogFAB from './LogFAB';
import { useToast } from './ui/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '../lib/supabase';
import { Capacitor } from '@capacitor/core';
import { InAppBrowser } from '@capacitor/inappbrowser';
import { isHealthKitAvailable, requestHealthKitAuthorization } from '@/services/healthkit';

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
  const [sourcePreference, setSourcePreference] = useState<'garmin' | 'strava' | 'both'>('both');
  const [savingPreference, setSavingPreference] = useState(false);
  
  // Apple Health state (only relevant on iOS native app)
  const [isNativeIOS, setIsNativeIOS] = useState(false);
  const [healthKitAvailable, setHealthKitAvailable] = useState(false);
  const [healthKitAuthorized, setHealthKitAuthorized] = useState(() => {
    // Check localStorage for previously saved authorization state
    return localStorage.getItem('healthKitAuthorized') === 'true';
  });
  const [healthKitLoading, setHealthKitLoading] = useState(false);
  const [healthKitSyncEnabled, setHealthKitSyncEnabled] = useState(() => {
    const stored = localStorage.getItem('healthKitSyncEnabled');
    return stored !== null ? stored === 'true' : true; // Default to enabled
  });

  // Garmin connection state
  const [garminConnected, setGarminConnected] = useState(false);
  const [garminMessage, setGarminMessage] = useState('');
  const [garminAccessToken, setGarminAccessToken] = useState<string | null>(null);

  // Placeholder state for dropdown menu (would normally come from context)
  const [currentPlans] = useState<any[]>([]);
  const [plansMenuOpen, setPlansMenuOpen] = useState(false);

  // Check if we're on native iOS and if HealthKit is available
  useEffect(() => {
    const checkHealthKit = async () => {
      const isNative = Capacitor.isNativePlatform();
      const platform = Capacitor.getPlatform();
      const isIOS = isNative && platform === 'ios';
      setIsNativeIOS(isIOS);
      
      if (isIOS) {
        // Retry multiple times since plugin may still be registering
        let available = false;
        for (let i = 0; i < 10; i++) {
          available = await isHealthKitAvailable();
          if (available) break;
          await new Promise(r => setTimeout(r, 300)); // Wait 300ms between retries
        }
        setHealthKitAvailable(available);
      }
    };
    checkHealthKit();
  }, []);

  const handleConnectHealthKit = async () => {
    setHealthKitLoading(true);
    try {
      const authorized = await requestHealthKitAuthorization();
      setHealthKitAuthorized(authorized);
      // Save to localStorage so it persists across app launches
      localStorage.setItem('healthKitAuthorized', authorized ? 'true' : 'false');
      if (authorized) {
        toast({
          title: 'Apple Health Connected',
          description: 'Your workouts will now sync with Apple Health.',
        });
      } else {
        toast({
          title: 'Permission Denied',
          description: 'Please enable Health access in Settings > Privacy > Health.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Connection Failed',
        description: 'Could not connect to Apple Health.',
        variant: 'destructive',
      });
    } finally {
      setHealthKitLoading(false);
    }
  };

  useEffect(() => {
    // On desktop, show controls by default; on mobile, keep them collapsed
    setShowDateControls(!isMobile);
  }, [isMobile]);

  // Load source preference on mount
  useEffect(() => {
    loadSourcePreference();
  }, []);

  const loadSourcePreference = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.id) return;
      
      const { data: userData } = await supabase
        .from('users')
        .select('preferences')
        .eq('id', authUser.id)
        .single();
      
      if (userData?.preferences?.source_preference) {
        setSourcePreference(userData.preferences.source_preference);
      }
    } catch (error) {
      console.error('Error loading source preference:', error);
    }
  };

  const saveSourcePreference = async (preference: 'garmin' | 'strava' | 'both') => {
    try {
      setSavingPreference(true);
      
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.id) throw new Error('Not authenticated');
      
      // Get current preferences
      const { data: userData } = await supabase
        .from('users')
        .select('preferences')
        .eq('id', authUser.id)
        .single();
      
      const currentPrefs = userData?.preferences || {};
      
      // Update with new source_preference
      const { error } = await supabase
        .from('users')
        .update({
          preferences: {
            ...currentPrefs,
            source_preference: preference
          }
        })
        .eq('id', authUser.id);
      
      if (error) throw error;
      
      setSourcePreference(preference);
      toast({
        title: "Preference Saved",
        description: `Activity source set to: ${preference === 'both' ? 'Accept both sources' : preference === 'garmin' ? 'Garmin only' : 'Strava only'}`,
      });
    } catch (error) {
      console.error('Error saving source preference:', error);
      toast({
        title: "Error",
        description: "Failed to save preference",
        variant: "destructive"
      });
    } finally {
      setSavingPreference(false);
    }
  };

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
      
      // Log what the edge function returned
      console.log('🔐 [Connections] Edge function response for user_id:', session.user.id);
      console.log('🔐 [Connections] Token from edge function - access_token starts with:', tokenData.access_token?.substring(0, 30));
      
      // Edge function already saved tokens to database with correct user_id
      // No need to save again - that would cause race conditions and potential overwrites

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
        return 'Connect your Strava account to automatically import your activities.';
      case 'garmin':
        return 'Connect your Garmin account to automatically import your activities.';
      default:
        return `Connect your ${provider} account to sync data.`;
    }
  };

  const openPrivacyPolicy = async () => {
    const url = 'https://efforts.work/privacy';
    
    // Use in-app browser for native apps, regular link for web
    if (Capacitor.isNativePlatform()) {
      await InAppBrowser.openInSystemBrowser({
        url,
        options: {
          iOS: {
            closeButtonText: 'Done',
            viewStyle: 'fullscreen'
          }
        }
      });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="mobile-app-container">
      <MobileHeader />
      <main className="mobile-main-content overflow-y-auto overflow-x-hidden" style={{ paddingBottom: 'calc(var(--tabbar-h) + max(env(safe-area-inset-bottom) - 34px, 0px) + 1rem)' }}>
        <div className="max-w-4xl mx-auto px-6 pb-6 min-h-0">
          <h2 className="text-2xl font-bold text-white mb-2">Connections</h2>
          <p className="text-white/50 text-sm mb-6">
            Connect your fitness services to automatically sync data and enable real-time updates.
          </p>

      <div className="grid gap-6">
        {connections.map((connection) => (
          <Card key={connection.provider} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                {getProviderIcon(connection.provider)}
                <div className="flex-1 min-w-0">
                  <CardTitle className="flex items-center gap-2 text-white/90">
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
                  <CardDescription className="mt-1 text-white/60">
                    {getProviderDescription(connection.provider)}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {connection.connected ? (
                <div className="space-y-4">
                  {/* Connected Status Indicator */}
                  <div className="p-3 rounded-md bg-white/[0.08] backdrop-blur-lg border border-white/25">
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${
                        connection.provider === 'garmin' 
                          ? 'bg-blue-500' 
                          : connection.provider === 'strava'
                          ? 'bg-orange-500'
                          : 'bg-green-500'
                      }`}></div>
                      <span className="text-sm font-medium text-cyan-400">
                        ✓ Connected to {getProviderName(connection.provider)}
                      </span>
                    </div>
                  </div>

                  {/* Last Sync - only show for Strava */}
                  {connection.provider === 'strava' && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/60">Last Import:</span>
                      <span className="flex items-center space-x-1 text-white/80">
                        <Clock className="h-3 w-3" />
                        <span>
                          {connection.lastSync 
                            ? new Date(connection.lastSync).toLocaleDateString()
                            : 'Never'
                          }
                        </span>
                      </span>
                    </div>
                  )}


                  {/* Strava Date Range Picker */}
                  {connection.provider === 'strava' && showDateControls && (
                    <div className="flex flex-col gap-2">
                      {/* Quick Preset Buttons */}
                      <div className="flex flex-wrap gap-2 text-xs">
                        <button
                          onClick={() => {
                            const end = new Date();
                            const start = new Date();
                            start.setDate(start.getDate() - 7);
                            setStravaStartDate(start.toISOString().split('T')[0]);
                            setStravaEndDate(end.toISOString().split('T')[0]);
                          }}
                          className="px-2 py-1 bg-white/[0.08] backdrop-blur-lg border border-white/25 text-white/80 rounded-full hover:bg-white/[0.12] hover:text-white hover:border-white/35 transition-all duration-300"
                          style={{ fontFamily: 'Inter, sans-serif' }}
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
                          className="px-2 py-1 bg-white/[0.08] backdrop-blur-lg border border-white/25 text-white/80 rounded-full hover:bg-white/[0.12] hover:text-white hover:border-white/35 transition-all duration-300"
                          style={{ fontFamily: 'Inter, sans-serif' }}
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
                          className="px-2 py-1 bg-white/[0.08] backdrop-blur-lg border border-white/25 text-white/80 rounded-full hover:bg-white/[0.12] hover:text-white hover:border-white/35 transition-all duration-300"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          Last 60 days
                        </button>
                      </div>
                      
                      {/* Custom Date Range */}
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <input
                          type="date"
                          value={stravaStartDate}
                          onChange={(e) => setStravaStartDate(e.target.value)}
                          className="px-2 py-1 bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40 text-xs flex-1 min-w-[120px]"
                          placeholder="Start Date"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        />
                        <span className="text-white/60">to</span>
                        <input
                          type="date"
                          value={stravaEndDate}
                          onChange={(e) => setStravaEndDate(e.target.value)}
                          className="px-2 py-1 bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40 text-xs flex-1 min-w-[120px]"
                          placeholder="End Date"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Action buttons - wrap on mobile */}
                  <div className="flex flex-wrap gap-2">
                    {/* Strava Import Button */}
                    {connection.provider === 'strava' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          let start = stravaStartDate;
                          let end = stravaEndDate;
                          // Only use custom dates if BOTH are set, otherwise default to last 30 days
                          if (!start || !end) {
                            const endD = new Date();
                            const startD = new Date();
                            startD.setDate(startD.getDate() - 30);
                            start = startD.toISOString().split('T')[0];
                            end = endD.toISOString().split('T')[0];
                          }
                          return importHistoricalData(connection.provider, start, end);
                        }}
                        disabled={loading}
                        className="rounded-full bg-white/[0.08] backdrop-blur-lg border border-white/25 text-white/90 hover:bg-white/[0.12] hover:text-white hover:border-white/35 transition-all duration-300 disabled:bg-white/[0.05] disabled:border-white/20 disabled:text-white/40"
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        {(() => {
                          if (stravaStartDate && stravaEndDate) {
                            const start = new Date(stravaStartDate + 'T00:00:00');
                            const end = new Date(stravaEndDate + 'T00:00:00');
                            return `Import ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                          }
                          return 'Import Last 30 Days';
                        })()}
                      </Button>
                    )}

                    {/* Date Range toggle */}
                    {connection.provider === 'strava' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDateControls((v) => !v)}
                        disabled={loading}
                        className="rounded-full bg-white/[0.08] backdrop-blur-lg border border-white/25 text-white/90 hover:bg-white/[0.12] hover:text-white hover:border-white/35 transition-all duration-300 disabled:bg-white/[0.05] disabled:border-white/20 disabled:text-white/40"
                      >
                        <Calendar className="h-4 w-4 mr-2" />
                        {showDateControls ? 'Hide' : 'Custom'}
                      </Button>
                    )}

                    {/* Disconnect button */}
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
                      className="rounded-full bg-white/[0.08] backdrop-blur-lg border border-white/25 text-white/90 hover:bg-white/[0.12] hover:text-red-400 hover:border-red-400/50 transition-all duration-300 disabled:bg-white/[0.05] disabled:border-white/20 disabled:text-white/40"
                    >
                      <Unlink className="h-4 w-4 mr-1" />
                      Disconnect
                    </Button>
                  </div>
                    
                  {/* Progress Bar for Import - Strava only */}
                  {importProgress.importing && connection.provider === 'strava' && (
                    <div className="w-full mt-2">
                      <div className="flex justify-between text-xs text-white/70 mb-1">
                        <span>Importing activities...</span>
                        <span>{importProgress.progress}/{importProgress.total}</span>
                      </div>
                      <div className="w-full bg-white/[0.08] rounded-full h-2">
                        <div 
                          className="bg-cyan-400 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${importProgress.total > 0 ? (importProgress.progress / importProgress.total) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                    
                  {/* Garmin message display */}
                  {connection.provider === 'garmin' && garminMessage && (
                    <div className="p-2 bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-xs text-white/90 mt-2">
                      {garminMessage}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  {connection.provider === 'strava' ? (
                    /* Official Strava "Connect with Strava" button per brand guidelines */
                    <button
                      onClick={connectStrava}
                      disabled={loading}
                      className="inline-block hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      <img 
                        src="/icons/strava-connect.svg" 
                        alt="Connect with Strava" 
                        className="h-12"
                      />
                    </button>
                  ) : (
                    <Button
                      onClick={() => {
                        if (connection.provider === 'garmin') {
                          connectGarmin();
                        }
                      }}
                      disabled={loading}
                      className="w-full rounded-full bg-blue-600 hover:bg-blue-700 text-white border-none"
                    >
                      <Link2 className="h-4 w-4 mr-2" />
                      Connect {getProviderName(connection.provider)}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Apple Health Section - Only visible on iOS native app */}
      {isNativeIOS && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-white/90">
              <Heart className="h-5 w-5 text-red-400" />
              <span>Apple Health</span>
              {healthKitAuthorized && (
                <Badge variant="outline" className="ml-2 border-green-500/50 text-green-400">
                  Connected
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-white/60">
              Sync your workouts with Apple Health to track all your fitness data in one place.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!healthKitAvailable ? (
              <p className="text-white/50 text-sm">Apple Health is not available on this device.</p>
            ) : healthKitAuthorized ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Activity className="h-4 w-4 text-green-400" />
                    <span className="text-sm text-white/90">Sync workouts to Apple Health</span>
                  </div>
                  <button
                    onClick={() => {
                      const newValue = !healthKitSyncEnabled;
                      setHealthKitSyncEnabled(newValue);
                      localStorage.setItem('healthKitSyncEnabled', String(newValue));
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      healthKitSyncEnabled ? 'bg-green-500' : 'bg-white/20'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        healthKitSyncEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-white/50 text-xs">
                  {healthKitSyncEnabled 
                    ? 'Completed workouts will automatically be saved to Apple Health.'
                    : 'Syncing is disabled. Workouts will not be saved to Apple Health.'}
                </p>
                <p className="text-white/40 text-xs">
                  To revoke permissions, go to Settings → Privacy & Security → Health → Efforts
                </p>
              </div>
            ) : (
              <Button
                onClick={handleConnectHealthKit}
                disabled={healthKitLoading}
                className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30"
              >
                {healthKitLoading ? 'Connecting...' : 'Connect to Apple Health'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Activity Source Preference Section */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-white/90">
            <Settings className="h-5 w-5" />
            <span>Activity Source Preference</span>
          </CardTitle>
          <CardDescription className="text-white/60">
            Choose where to get your activity data from.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-3">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="sourcePreference"
                  value="garmin"
                  checked={sourcePreference === 'garmin'}
                  onChange={() => saveSourcePreference('garmin')}
                  disabled={savingPreference}
                  className="h-4 w-4 text-blue-500 border-white/30 focus:ring-blue-500"
                />
                <div>
                  <span className="font-medium text-white/90">Garmin only</span>
                  <p className="text-sm text-white/60">Import activities from Garmin. Send planned workouts to your Garmin devices.</p>
                </div>
              </label>
              
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="sourcePreference"
                  value="strava"
                  checked={sourcePreference === 'strava'}
                  onChange={() => saveSourcePreference('strava')}
                  disabled={savingPreference}
                  className="h-4 w-4 text-orange-500 border-white/30 focus:ring-orange-500"
                />
                <div>
                  <span className="font-medium text-white/90">Strava only</span>
                  <p className="text-sm text-white/60">Import activities from Strava to see segments and PRs. You can still send planned workouts to Garmin devices when connected to Garmin.</p>
                </div>
              </label>
              
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="sourcePreference"
                  value="both"
                  checked={sourcePreference === 'both'}
                  onChange={() => saveSourcePreference('both')}
                  disabled={savingPreference}
                  className="h-4 w-4 text-green-500 border-white/30 focus:ring-green-500"
                />
                <div>
                  <span className="font-medium text-white/90">Both sources</span>
                  <p className="text-sm text-white/60">Import from both. Duplicates will occur if both are connected.</p>
                </div>
              </label>
            </div>
            
            <div className="pt-2 border-t border-white/10">
              <p className="text-xs text-white/60">
                💡 <strong>Tip:</strong> Want segments and PRs? Choose "Strava only". Just want clean data without duplicates? Choose "Garmin only".
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-center text-sm text-white/70">
        <p>
          <strong>New activities will automatically sync</strong> when you complete them.
          <br />
          Historical import is for bringing in your past activities. This may take a few minutes.
        </p>
      </div>

      <div className="text-center text-sm text-white/70 mt-4">
        <p>
          <button
            onClick={openPrivacyPolicy}
            className="underline hover:text-white/90 text-cyan-400 cursor-pointer"
          >
            Privacy Policy
          </button>
          <br />
          <span className="text-xs text-white/60">See how Efforts uses data from your connected accounts.</span>
        </p>
      </div>

      <div className="text-center text-xs text-white/60 mt-4">
        <p>
          If you want to delete your Strava or Garmin data from the app,{' '}
          <a 
            href="mailto:support@efforts.work?subject=Data%20Deletion%20Request&body=Please%20delete%20my%20Strava%2FGarmin%20activity%20data%20from%20efforts."
            className="underline hover:text-white/80 text-cyan-400"
          >
            email support@efforts.work
          </a>
          {' '}and request data deletion.
        </p>
      </div>
        </div>
      </main>
      
      {/* Bottom Navigation Tab Bar - extra padding for iOS swipe gesture safe zone */}
      <div className="mobile-tabbar px-4 pb-8 pt-3 flex items-center" style={{ paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom, 0px) + 18px))' }}>
        <div className="w-full">
          <div className="flex justify-center items-center gap-2 pb-3 pt-1">
            <Button
              onClick={() => navigate('/')}
              className="flex-1 flex items-center justify-center bg-white/[0.08] backdrop-blur-lg border-2 text-gray-300 font-light tracking-wide transition-all duration-300 shadow-lg hover:shadow-xl border-white/35 hover:bg-white/[0.10] hover:text-white hover:border-white/45"
              style={{
                fontFamily: 'Inter, sans-serif',
                padding: '10px 14px',
                borderRadius: '1rem',
                fontSize: '14px',
                minHeight: '42px',
                boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.1) inset, 0 4px 12px rgba(0, 0, 0, 0.3)',
              }}
            >
              <Home className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => {
                // Navigate back to main app - context will be accessible from there
                navigate('/');
              }}
              className="flex-1 flex items-center justify-center bg-white/[0.08] backdrop-blur-lg border-2 text-gray-300 font-light tracking-wide transition-all duration-300 shadow-lg hover:shadow-xl border-white/35 hover:bg-white/[0.10] hover:text-white hover:border-white/45"
              style={{
                fontFamily: 'Inter, sans-serif',
                padding: '10px 14px',
                borderRadius: '1rem',
                fontSize: '14px',
                minHeight: '42px',
                boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.1) inset, 0 4px 12px rgba(0, 0, 0, 0.3)',
              }}
            >
              Context
            </Button>
            <PlansMenu
              currentPlans={currentPlans}
              completedPlans={[]}
              onSelectPlan={() => {}}
              isOpen={plansMenuOpen}
              onOpenChange={setPlansMenuOpen}
              trigger={
                <Button
                  onClick={() => setPlansMenuOpen(true)}
                  className={`flex-1 flex items-center justify-center bg-white/[0.08] backdrop-blur-lg border-2 text-gray-300 font-light tracking-wide transition-all duration-300 shadow-lg hover:shadow-xl ${
                    plansMenuOpen
                      ? 'border-white/50 text-white bg-white/[0.12]' 
                      : 'border-white/35 hover:bg-white/[0.10] hover:text-white hover:border-white/45'
                  }`}
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    padding: '10px 14px',
                    borderRadius: '1rem',
                    fontSize: '14px',
                    minHeight: '42px',
                    boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.1) inset, 0 4px 12px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  Plans
                </Button>
              }
            />
            <LogFAB onSelectType={() => {}} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Connections;

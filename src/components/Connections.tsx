import React, { useState, useEffect } from 'react';
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
  Unlink
} from 'lucide-react';
import { useToast } from './ui/use-toast';
import { supabase } from '../lib/supabase';
import { useAppContext } from '../contexts/AppContext';

interface ConnectionStatus {
  provider: string;
  connected: boolean;
  lastSync?: string;
  webhookActive?: boolean;
  syncStatus: 'idle' | 'syncing' | 'error' | 'success';
}

const Connections: React.FC = () => {
  const [connections, setConnections] = useState<ConnectionStatus[]>([
    {
      provider: 'strava',
      connected: false,
      syncStatus: 'idle'
    },
    {
      provider: 'garmin',
      connected: false,
      syncStatus: 'idle'
    }
  ]);
  
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAppContext();

  useEffect(() => {
    if (user) {
      loadConnectionStatus();
    }
  }, [user]);

  const loadConnectionStatus = async () => {
    try {
      setLoading(true);
      
      // Load existing connections from database
      const { data: userConnections } = await supabase
        .from('user_connections')
        .select('*')
        .eq('user_id', user?.id);

      if (userConnections) {
        const updatedConnections = connections.map(conn => {
          const existing = userConnections.find(uc => uc.provider === conn.provider);
          return {
            ...conn,
            connected: !!existing,
            lastSync: existing?.last_sync,
            webhookActive: existing?.webhook_active || false
          };
        });
        
        setConnections(updatedConnections);
      }
    } catch (error) {
      console.error('Error loading connections:', error);
    } finally {
      setLoading(false);
    }
  };

  const connectStrava = async () => {
    try {
      setLoading(true);
      
      // Open Strava OAuth popup
      const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
      const redirectUri = 'https://efforts.work/strava/callback';
      const scope = 'read,activity:read_all';
      
      const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
      
      const popup = window.open(
        authUrl,
        'strava-auth',
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        toast({
          title: "Popup blocked",
          description: "Please allow popups and try again.",
          variant: "destructive"
        });
        return;
      }

      // Listen for OAuth completion
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'STRAVA_AUTH_SUCCESS') {
          const { access_token, refresh_token, expires_at, athlete } = event.data.data;
          
          // Store connection in database
          const { error } = await supabase
            .from('user_connections')
            .upsert({
              user_id: user?.id,
              provider: 'strava',
              access_token,
              refresh_token,
              expires_at: new Date(expires_at * 1000).toISOString(),
              connection_data: { athlete },
              webhook_active: false
            });

          if (error) {
            throw error;
          }

          // Setup webhook subscription
          await setupStravaWebhook(athlete.id, access_token);
          
          toast({
            title: "Strava Connected!",
            description: "Your Strava account is now connected and webhook is active.",
          });

          loadConnectionStatus();
          popup.close();
          window.removeEventListener('message', handleMessage);
        }
        
        if (event.data.type === 'STRAVA_AUTH_ERROR') {
          toast({
            title: "Connection Failed",
            description: event.data.error,
            variant: "destructive"
          });
          popup.close();
          window.removeEventListener('message', handleMessage);
        }
      };

      window.addEventListener('message', handleMessage);
      
    } catch (error) {
      console.error('Error connecting Strava:', error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to Strava. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const setupStravaWebhook = async (athleteId: string, accessToken: string) => {
    try {
      // Call your Supabase Edge Function to setup webhook
      const response = await fetch('https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/strava-webhook-manager', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabase.supabaseKey}`
        },
        body: JSON.stringify({
          action: 'subscribe',
          userId: user?.id,
          accessToken,
          athleteId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to setup webhook');
      }

      // Update connection status
      const { error } = await supabase
        .from('user_connections')
        .update({ webhook_active: true })
        .eq('user_id', user?.id)
        .eq('provider', 'strava');

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
      
      // Remove webhook subscription
      const response = await fetch('https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/strava-webhook-manager', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabase.supabaseKey}`
        },
        body: JSON.stringify({
          action: 'unsubscribe',
          userId: user?.id
        })
      });

      // Remove connection from database
      const { error } = await supabase
        .from('user_connections')
        .delete()
        .eq('user_id', user?.id)
        .eq('provider', 'strava');

      if (error) throw error;

      toast({
        title: "Strava Disconnected",
        description: "Your Strava account has been disconnected.",
      });

      loadConnectionStatus();
      
    } catch (error) {
      console.error('Error disconnecting Strava:', error);
      toast({
        title: "Disconnect Failed",
        description: "Failed to disconnect from Strava. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const importHistoricalData = async (provider: string) => {
    try {
      setLoading(true);
      
      if (provider === 'strava') {
        // Get user's Strava connection
        const { data: connection } = await supabase
          .from('user_connections')
          .select('*')
          .eq('user_id', user?.id)
          .eq('provider', 'strava')
          .single();

        if (!connection) {
          throw new Error('No Strava connection found');
        }

        // Call your existing StravaDataService to import historical data
        const response = await fetch('https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/import-strava-history', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabase.supabaseKey}`
          },
          body: JSON.stringify({
            userId: user?.id,
            accessToken: connection.access_token,
            importType: 'historical'
          })
        });

        if (!response.ok) {
          throw new Error('Failed to import historical data');
        }

        toast({
          title: "Historical Import Started",
          description: "Importing your Strava activity history. This may take a few minutes.",
        });
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
    }
  };

  const toggleWebhook = async (provider: string, enabled: boolean) => {
    try {
      setLoading(true);
      
      if (enabled) {
        // Get existing connection data to re-enable webhook
        const { data: connection } = await supabase
          .from('user_connections')
          .select('*')
          .eq('user_id', user?.id)
          .eq('provider', provider)
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
            'Authorization': `Bearer ${supabase.supabaseKey}`
          },
          body: JSON.stringify({
            action: 'unsubscribe',
            userId: user?.id
          })
        });
      }

      // Update connection status
      const { error } = await supabase
        .from('user_connections')
        .update({ webhook_active: enabled })
        .eq('user_id', user?.id)
        .eq('provider', provider);

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
        return <Activity className="h-5 w-5" />;
      case 'garmin':
        return <Settings className="h-5 w-5" />;
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
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Connections</h1>
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
                        <Badge variant="secondary" className="ml-2">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Connected
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {getProviderDescription(connection.provider)}
                    </CardDescription>
                  </div>
                </div>
                
                {connection.connected && (
                  <div className="flex items-center space-x-4">
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
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => connection.provider === 'strava' ? disconnectStrava() : null}
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => importHistoricalData(connection.provider)}
                      disabled={loading}
                    >
                      <Zap className="h-4 w-4 mr-2" />
                      Import History
                    </Button>
                    
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
                    onClick={() => connection.provider === 'strava' ? connectStrava() : null}
                    disabled={loading}
                    className="w-full"
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
          Real-time sync uses webhooks to automatically import new activities as they happen.
          <br />
          Manual sync is also available for historical data.
        </p>
      </div>
    </div>
  );
};

export default Connections;

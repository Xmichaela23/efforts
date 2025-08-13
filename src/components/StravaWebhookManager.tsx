import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { useToast } from './ui/use-toast';
import { supabase } from '../lib/supabase';
import { useAppContext } from '../contexts/AppContext';
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle,
  Clock,
  Zap
} from 'lucide-react';

interface StravaWebhookManagerProps {
  onWebhookChange?: (enabled: boolean) => void;
}

interface WebhookStatus {
  hasWebhook: boolean;
  webhookId: number | null;
  stravaUserId: string | null;
  lastSync: string | null;
  isActive: boolean;
}

export default function StravaWebhookManager({ onWebhookChange }: StravaWebhookManagerProps) {
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [lastActivity, setLastActivity] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAppContext();

  useEffect(() => {
    if (user) {
      checkWebhookStatus();
      checkLastActivity();
    }
  }, [user]);

  const checkWebhookStatus = async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      
      const response = await fetch('https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/strava-webhook-manager', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabase.supabaseKey}`
        },
        body: JSON.stringify({
          action: 'status',
          userId: user.id
        })
      });

      if (response.ok) {
        const data = await response.json();
        setWebhookStatus({
          hasWebhook: data.hasWebhook,
          webhookId: data.webhookId,
          stravaUserId: data.stravaUserId,
          lastSync: null, // We'll get this from the database
          isActive: data.hasWebhook
        });
        
        onWebhookChange?.(data.hasWebhook);
      }
    } catch (error) {
      console.error('Error checking webhook status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkLastActivity = async () => {
    if (!user) return;

    try {
      const { data: lastActivityData } = await supabase
        .from('strava_activities')
        .select('created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (lastActivityData) {
        setLastActivity(lastActivityData.created_at);
      }
    } catch (error) {
      console.log('No recent Strava activities found');
    }
  };

  const setupWebhook = async () => {
    if (!user) return;

    try {
      setIsSettingUp(true);
      
      // Get the user's Strava access token
      const { data: userConnection } = await supabase
        .from('user_connections')
        .select('connection_data')
        .eq('user_id', user.id)
        .eq('provider', 'strava')
        .single();

      if (!userConnection?.connection_data?.access_token) {
        toast({
          title: "No Strava Access",
          description: "Please connect your Strava account first to enable webhooks.",
          variant: "destructive"
        });
        return;
      }

      const accessToken = userConnection.connection_data.access_token;

      const response = await fetch('https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/strava-webhook-manager', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabase.supabaseKey}`
        },
        body: JSON.stringify({
          action: 'subscribe',
          userId: user.id,
          accessToken
        })
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Webhook Enabled",
          description: "Strava will now automatically sync your activities in real-time!",
        });
        
        await checkWebhookStatus();
        await checkLastActivity();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to setup webhook');
      }
    } catch (error) {
      console.error('Error setting up webhook:', error);
      toast({
        title: "Setup Failed",
        description: error instanceof Error ? error.message : "Failed to enable Strava webhooks",
        variant: "destructive"
      });
    } finally {
      setIsSettingUp(false);
    }
  };

  const disableWebhook = async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      
      const response = await fetch('https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/strava-webhook-manager', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabase.supabaseKey}`
        },
        body: JSON.stringify({
          action: 'unsubscribe',
          userId: user.id,
          accessToken: '' // Not needed for unsubscribe
        })
      });

      if (response.ok) {
        toast({
          title: "Webhook Disabled",
          description: "Strava will no longer automatically sync your activities.",
        });
        
        await checkWebhookStatus();
      } else {
        throw new Error('Failed to disable webhook');
      }
    } catch (error) {
      console.error('Error disabling webhook:', error);
      toast({
        title: "Disable Failed",
        description: "Failed to disable Strava webhooks",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const refreshStatus = () => {
    checkWebhookStatus();
    checkLastActivity();
  };

  const getStatusIcon = () => {
    if (webhookStatus?.isActive) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
    return <AlertCircle className="h-5 w-5 text-gray-400" />;
  };

  const getStatusText = () => {
    if (webhookStatus?.isActive) {
      return 'Active';
    }
    return 'Inactive';
  };

  const getStatusColor = () => {
    if (webhookStatus?.isActive) {
      return 'bg-green-100 text-green-800';
    }
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Strava Real-Time Sync
        </CardTitle>
        <CardDescription>
          Automatically sync your Strava activities as they happen. No more manual imports!
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Section */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <p className="font-medium">Webhook Status</p>
              <p className="text-sm text-gray-600">
                {webhookStatus?.isActive 
                  ? 'Real-time sync is active' 
                  : 'Manual sync only'
                }
              </p>
            </div>
          </div>
          <Badge className={getStatusColor()}>
            {getStatusText()}
          </Badge>
        </div>

        {/* Last Activity */}
        {lastActivity && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="h-4 w-4" />
            <span>Last activity: {new Date(lastActivity).toLocaleDateString()}</span>
          </div>
        )}

        {/* Webhook ID Info */}
        {webhookStatus?.webhookId && (
          <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
            Webhook ID: {webhookStatus.webhookId}
          </div>
        )}

        {/* Control Section */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="webhook-toggle" className="text-sm font-medium">
              Enable Real-time Sync
            </Label>
            <p className="text-xs text-gray-600">
              Strava will automatically notify us when you complete activities
            </p>
          </div>
          
          {webhookStatus?.isActive ? (
            <Button
              variant="outline"
              onClick={disableWebhook}
              disabled={isLoading}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <WifiOff className="h-4 w-4 mr-2" />
              Disable
            </Button>
          ) : (
            <Button
              onClick={setupWebhook}
              disabled={isSettingUp || isLoading}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {isSettingUp ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4 mr-2" />
              )}
              Enable
            </Button>
          )}
        </div>

        {/* Benefits */}
        <div className="bg-blue-50 p-3 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Benefits of Real-time Sync
          </h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Activities appear instantly in your workout log</li>
            <li>• No need to manually refresh or import</li>
            <li>• Automatic workout creation from Strava activities</li>
            <li>• Real-time progress tracking and analytics</li>
          </ul>
        </div>

        {/* Refresh Button */}
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshStatus}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Status
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

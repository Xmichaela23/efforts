import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Zap, Watch, CheckCircle, Settings, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface GarminSeamlessProps {
  onAutoSyncChange?: (enabled: boolean) => void;
}

const GarminSeamless: React.FC<GarminSeamlessProps> = ({ onAutoSyncChange }) => {
  const [autoSync, setAutoSync] = useState(false);
  const [autoExport, setAutoExport] = useState(false);
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [lastAutoSync, setLastAutoSync] = useState<Date | null>(null);
  const [status, setStatus] = useState<'idle' | 'setting-up' | 'active'>('idle');

  useEffect(() => {
    loadSeamlessSettings();
  }, []);

  const loadSeamlessSettings = async () => {
    try {
      const { data } = await supabase
        .from('user_connections')
        .select('*')
        .eq('provider', 'garmin')
        .single();
      
      if (data?.connection_data?.seamless_settings) {
        const settings = data.connection_data.seamless_settings;
        setAutoSync(settings.auto_sync || false);
        setAutoExport(settings.auto_export || false);
        setWebhookEnabled(settings.webhook_enabled || false);
        setLastAutoSync(settings.last_auto_sync ? new Date(settings.last_auto_sync) : null);
        setStatus(settings.webhook_enabled ? 'active' : 'idle');
      }
    } catch (error) {
      console.log('No seamless settings found');
    }
  };

  const setupSeamlessIntegration = async () => {
    setStatus('setting-up');
    
    try {
      // Setup webhook endpoint for real-time sync
      const response = await fetch('https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/752a4e71-8616-490f-8006-8f310471e2c7', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setup_webhook',
          webhook_url: `${window.location.origin}/api/garmin-webhook`,
          events: ['activity_created', 'workout_completed']
        })
      });
      
      if (response.ok) {
        setWebhookEnabled(true);
        setStatus('active');
        await saveSeamlessSettings();
      }
    } catch (error) {
      console.error('Webhook setup failed:', error);
      setStatus('idle');
    }
  };

  const saveSeamlessSettings = async () => {
    try {
      const settings = {
        auto_sync: autoSync,
        auto_export: autoExport,
        webhook_enabled: webhookEnabled,
        last_auto_sync: lastAutoSync?.toISOString()
      };
      
      await supabase
        .from('user_connections')
        .update({
          connection_data: {
            seamless_settings: settings
          }
        })
        .eq('provider', 'garmin');
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const toggleAutoSync = async (enabled: boolean) => {
    setAutoSync(enabled);
    onAutoSyncChange?.(enabled);
    await saveSeamlessSettings();
  };

  const toggleAutoExport = async (enabled: boolean) => {
    setAutoExport(enabled);
    await saveSeamlessSettings();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Seamless Garmin Integration
          <Badge variant={status === 'active' ? 'default' : 'secondary'}>
            {status === 'active' ? 'Active' : 'Inactive'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-gray-600">
          Enable automatic, real-time sync between your Garmin device and this app
        </div>
        
        {status === 'idle' && (
          <div className="space-y-3">
            <Alert>
              <Settings className="h-4 w-4" />
              <AlertDescription>
                Set up seamless integration to automatically sync workouts and export training plans
              </AlertDescription>
            </Alert>
            
            <Button 
              onClick={setupSeamlessIntegration}
              disabled={status === 'setting-up'}
              className="w-full"
            >
              <Zap className="h-4 w-4 mr-2" />
              {status === 'setting-up' ? 'Setting up...' : 'Enable Seamless Integration'}
            </Button>
          </div>
        )}
        
        {status === 'active' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              Seamless integration is active
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-sync">Auto-sync workouts</Label>
                  <p className="text-xs text-gray-500">Automatically import completed workouts</p>
                </div>
                <Switch
                  id="auto-sync"
                  checked={autoSync}
                  onCheckedChange={toggleAutoSync}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-export">Auto-export training plans</Label>
                  <p className="text-xs text-gray-500">Automatically send new workouts to Garmin</p>
                </div>
                <Switch
                  id="auto-export"
                  checked={autoExport}
                  onCheckedChange={toggleAutoExport}
                />
              </div>
            </div>
            
            {lastAutoSync && (
              <p className="text-xs text-gray-500">
                Last auto-sync: {lastAutoSync.toLocaleString()}
              </p>
            )}
            
            <div className="text-xs text-gray-500 space-y-1">
              <p><strong>How it works:</strong></p>
              <ul className="list-disc list-inside space-y-1">
                <li>Workouts sync automatically when completed on your Garmin</li>
                <li>New training plans export directly to Garmin Connect</li>
                <li>Real-time updates via webhook notifications</li>
                <li>No manual sync required</li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GarminSeamless;
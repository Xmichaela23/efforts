import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, CheckCircle, Zap, Settings, WifiOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface GarminAutoSyncProps {
  onWorkoutImported?: (workout: any) => void;
}

const GarminAutoSync: React.FC<GarminAutoSyncProps> = ({ onWorkoutImported }) => {
  const [isListening, setIsListening] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [status, setStatus] = useState<'idle' | 'active' | 'error'>('idle');

  useEffect(() => {
    checkAutoSyncStatus();
  }, []);

  const checkAutoSyncStatus = async () => {
    try {
      const { data } = await supabase
        .from('user_connections')
        .select('*')
        .eq('provider', 'garmin')
        .single();
      
      if (data?.connection_data?.seamless_settings?.auto_sync) {
        setIsListening(true);
        setStatus('active');
        setLastSync(data.connection_data.seamless_settings.last_auto_sync ? 
          new Date(data.connection_data.seamless_settings.last_auto_sync) : null);
      }
    } catch (error) {
      setStatus('idle');
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <WifiOff className="h-4 w-4 text-red-600" />;
      default:
        return <Zap className="h-4 w-4 text-gray-400" />;
    }
  };

  const getTooltipContent = () => {
    switch (status) {
      case 'active':
        return (
          <div className="text-sm">
            <p className="font-medium text-green-600">Auto-sync Active</p>
            <p>Listening for Garmin workouts</p>
            {lastSync && (
              <p className="text-xs text-gray-500 mt-1">
                Last sync: {lastSync.toLocaleString()}
              </p>
            )}
          </div>
        );
      case 'error':
        return (
          <div className="text-sm">
            <p className="font-medium text-red-600">Sync Error</p>
            <p>Connection issue detected</p>
          </div>
        );
      default:
        return (
          <div className="text-sm">
            <p className="font-medium text-gray-600">Auto-sync Inactive</p>
            <p>Enable in Garmin setup to activate</p>
          </div>
        );
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            {getStatusIcon()}
            <Badge 
              variant={status === 'active' ? 'default' : 'secondary'}
              className="text-xs px-1 py-0"
            >
              {status === 'active' ? 'Sync' : 'Off'}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {getTooltipContent()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default GarminAutoSync;
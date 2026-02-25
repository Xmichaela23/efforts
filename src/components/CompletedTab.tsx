import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useAppContext } from '@/contexts/AppContext';
import { useWorkouts } from '@/hooks/useWorkouts';
import CleanElevationChart from './CleanElevationChart';
import EffortsViewerMapbox from './EffortsViewerMapbox';
import HRZoneChart from './HRZoneChart';
import PowerZoneChart from './PowerZoneChart';
import { useCompact } from '@/hooks/useCompact';
import { supabase } from '../lib/supabase';
import { computeDistanceKm } from '@/utils/workoutDataDerivation';
import { isVirtualActivity } from '@/utils/workoutNames';
import { formatDuration, formatPace, formatElevation, formatDistance, formatSwimPace } from '@/utils/workoutFormatting';
import { useWorkoutData } from '@/hooks/useWorkoutData';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { getDisciplineColorRgb, getDisciplineGlowStyle, getDisciplinePhosphorCore } from '@/lib/context-utils';
import { getSessionRPE } from '@/utils/workoutMetadata';

// Custom styles for range sliders
const sliderStyles = `
  .slider::-webkit-slider-thumb {
    appearance: none;
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  
  .slider::-moz-range-thumb {
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
`;

interface CompletedTabProps {
  workoutData: any;
  workoutType?: string;
  onAddGear?: () => void; // Callback to open gear management
  isHydrating?: boolean; // True while GPS/sensor data is still loading
}


interface GearItem {
  id: string;
  type: 'shoe' | 'bike';
  name: string;
  brand?: string;
  model?: string;
  is_default: boolean;
  total_distance?: number; // in meters
}

const CompletedTab: React.FC<CompletedTabProps> = ({ workoutData, workoutType, onAddGear, isHydrating }) => {
  const { useImperial } = useAppContext();
  const compact = useCompact();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { updateWorkout } = useWorkouts();
  const [selectedMetric, setSelectedMetric] = useState('speed'); // Start with pace/speed
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState('powercurve');
  const [isLoading, setIsLoading] = useState(true);
  const [editingPool, setEditingPool] = useState(false);
  const [poolLengthMeters, setPoolLengthMeters] = useState<number | null>(null);
  
  // Gear, RPE, and Feeling state
  const [gear, setGear] = useState<GearItem[]>([]);
  const [gearLoading, setGearLoading] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [rememberDefault, setRememberDefault] = useState(false);
  // Initialize hydrated with workoutData, but use a ref to track if we've synced
  // This prevents the initial state update that causes the blink
  const [hydrated, setHydrated] = useState<any>(() => {
    // Initialize with workoutData, preserving computed even if series doesn't exist yet
    // This prevents unnecessary re-renders and preserves existing computed data
    return workoutData || {};
  });
  const [analysisInvoked, setAnalysisInvoked] = useState(false);
  const [showAdvancedRunDyn, setShowAdvancedRunDyn] = useState(false);
  const [showPower, setShowPower] = useState(false);
  const [summaryFetched, setSummaryFetched] = useState(false);
  const [showVam, setShowVam] = useState(false);
  const [plannedTokens, setPlannedTokens] = useState<string[] | null>(null);
  const [plannedLabel, setPlannedLabel] = useState<string | null>(null);
  const processingTriggeredRef = useRef<Set<string>>(new Set()); // Track which workouts we've triggered
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const checkedDbRef = useRef<Set<string>>(new Set()); // Track which workouts we've checked DB for
  const initializedRef = useRef<Set<string>>(new Set()); // Track which workouts have been initialized to prevent initial blink
  const mapPropsRef = useRef<{
    samples: any;
    trackLngLat: any;
    useMiles: boolean;
    useFeet: boolean;
    compact: boolean;
    workoutData: any;
  } | null>(null); // Track previous map props to prevent unnecessary re-renders
  const norm = useWorkoutData(hydrated||workoutData);

  // NOTE: Hooks MUST run before any early returns.
  // Details screen can render this component in a loading pass first.
  const resolvedWorkoutType = useMemo(() => {
    const raw = String(workoutType || workoutData?.type || (norm as any)?.sport || '').toLowerCase();
    if (raw === 'bike' || raw === 'cycling') return 'ride';
    if (raw === 'running') return 'run';
    if (raw === 'swimming') return 'swim';
    if (raw === 'walking') return 'walk';
    if (raw === 'endurance') {
      // Endurance sessions are typically ride/run/swim; fall back to run for stable theming.
      return 'run';
    }
    return raw || 'run';
  }, [workoutType, workoutData?.type, (norm as any)?.sport]);

  const accentRgb = getDisciplineColorRgb(resolvedWorkoutType);
  const accentCore = getDisciplinePhosphorCore(resolvedWorkoutType);
  const plateGlow = getDisciplineGlowStyle(resolvedWorkoutType, 'week')?.boxShadow as string | undefined;

  const readoutPlateStyle: React.CSSProperties = {
    borderRadius: 16,
    border: `1px solid rgba(${accentRgb}, 0.18)`,
    backgroundColor: 'rgba(0,0,0,0.30)',
    backgroundImage: `
      radial-gradient(900px 220px at 50% 0%, rgba(${accentRgb}, 0.14) 0%, rgba(0,0,0,0) 68%),
      radial-gradient(600px 220px at 10% 10%, rgba(255, 215, 0, 0.06) 0%, rgba(0,0,0,0) 65%),
      radial-gradient(600px 220px at 90% 12%, rgba(74, 158, 255, 0.05) 0%, rgba(0,0,0,0) 65%),
      linear-gradient(to bottom, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 18%, rgba(0,0,0,0.0) 100%)
    `,
    boxShadow: [
      '0 0 0 1px rgba(255,255,255,0.06) inset',
      '0 1px 0 rgba(255,255,255,0.06) inset',
      plateGlow || '',
      '0 10px 28px rgba(0,0,0,0.35)',
    ].filter(Boolean).join(', '),
  };

  const metricValueBaseStyle: React.CSSProperties = {
    color: 'rgba(255,255,255,0.92)',
    textShadow: `0 0 14px rgba(${accentRgb}, 0.18), 0 0 2px rgba(${accentRgb}, 0.22)`,
    fontVariantNumeric: 'tabular-nums lining-nums',
  };

  const metricLabelStyle: React.CSSProperties = {
    color: `rgba(${accentRgb}, 0.58)`,
    textShadow: `0 0 12px rgba(${accentRgb}, 0.10)`,
  };
  
  // Load gear for runs and rides
  useEffect(() => {
    if (workoutData.type === 'run' || workoutData.type === 'ride') {
      loadGear();
    }
  }, [workoutData.type, workoutData.id]);

  const loadGear = async () => {
    try {
      setGearLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('🔧 [Gear] No user, skipping load');
        return;
      }

      const gearType = workoutData.type === 'run' ? 'shoe' : 'bike';
      console.log('🔧 [Gear] Loading gear for type:', gearType);
      const { data, error } = await supabase
        .from('gear')
        .select('id, type, name, brand, model, is_default, total_distance')
        .eq('user_id', user.id)
        .eq('type', gearType)
        .eq('retired', false)
        .order('is_default', { ascending: false })
        .order('name');

      if (error) {
        console.error('🔧 [Gear] Error loading gear:', error);
        return;
      }

      setGear(data || []);
      // Debug: log gear with total_distance - expand objects to see values
      if (data && data.length > 0) {
        console.log('🔧 [Gear] Loaded gear with distances:');
        data.forEach(g => {
          const distanceMeters = g.total_distance || 0;
          const distanceMi = distanceMeters / 1609.34;
          const distanceKm = distanceMeters / 1000;
          console.log(`  - ${g.name}: ${distanceMeters.toFixed(0)}m (${distanceMi.toFixed(1)} mi / ${distanceKm.toFixed(1)} km)`, g);
        });
        // Also log the full array for inspection
        console.log('🔧 [Gear] Full gear array:', JSON.stringify(data, null, 2));
      } else {
        console.log('🔧 [Gear] No gear items found');
      }
    } catch (e) {
      console.error('🔧 [Gear] Exception loading gear:', e);
    } finally {
      setGearLoading(false);
    }
  };

  const handleFeedbackChange = async (field: 'gear_id' | 'rpe', value: string | number | null) => {
    try {
      setSavingFeedback(true);
      const updateData: any = { [field]: value };

      console.log(`💾 [Feedback] Saving ${field}:`, value);

      // Use updateWorkout hook which handles user_id check and proper error handling
      if (!updateWorkout) {
        console.error('updateWorkout function not available');
        toast({
          title: 'Error',
          description: 'Unable to save changes. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      const updated = await updateWorkout(workoutData.id, updateData);
      console.log(`✅ [Feedback] Successfully saved ${field}:`, updated);

      // Update local hydrated state immediately so UI reflects the change
      // Use the returned data from updateWorkout to ensure consistency
      setHydrated((prev: any) => {
        if (!prev || prev.id !== workoutData.id) return prev;
        return { ...prev, [field]: (updated as any)?.[field] ?? value };
      });

      // Invalidate and refetch workout-detail query cache so useWorkoutDetail gets fresh data
      // This ensures when user navigates away and comes back, the data is fresh
      // Add a small delay to ensure the database has committed the change
      await new Promise(resolve => setTimeout(resolve, 100));
      await queryClient.invalidateQueries({ queryKey: ['workout-detail', workoutData.id] });
      await queryClient.refetchQueries({ queryKey: ['workout-detail', workoutData.id] });
      
      // Also dispatch events to trigger refresh in parent components
      // UnifiedWorkoutView listens to both workout:invalidate and workouts:invalidate
      window.dispatchEvent(new CustomEvent('workout-detail:invalidate'));
      window.dispatchEvent(new CustomEvent('workout:invalidate'));
      window.dispatchEvent(new CustomEvent('workouts:invalidate'));

      // If gear_id was changed, reload gear to get updated miles (trigger updates gear.total_distance)
      // Add a small delay to ensure the database trigger has completed
      if (field === 'gear_id') {
        await new Promise(resolve => setTimeout(resolve, 300)); // Wait 300ms for trigger to complete
        await loadGear();
      }

      toast({
        title: 'Saved',
        description: `${field === 'rpe' ? 'RPE' : 'Gear'} updated successfully`,
      });
    } catch (e: any) {
      console.error('❌ [Feedback] Error saving feedback:', e);
      toast({
        title: 'Error saving',
        description: e.message || 'Failed to save changes. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingFeedback(false);
    }
  };
  
  // Trigger processing once and poll for completion when series is missing
  
  useEffect(() => {
    const workoutId = (hydrated||workoutData)?.id;
    if (!workoutId) return;
    
    // Check if we already have series in state (avoid unnecessary DB check)
    // Check both hydrated and workoutData props to avoid unnecessary updates
    const hydratedSeries = hydrated?.computed?.analysis?.series;
    const propsSeries = workoutData?.computed?.analysis?.series;
    const currentSeries = hydratedSeries || propsSeries || null;
    const hasSeriesInState = currentSeries && Array.isArray(currentSeries?.distance_m) && currentSeries.distance_m.length > 1;
    
    if (hasSeriesInState) {
      // Already have data, no need to check DB or process
      // Only sync on initial mount to prevent re-renders
      if (!initializedRef.current.has(workoutId)) {
        initializedRef.current.add(workoutId);
        // Sync hydrated with workoutData on first render only (if different)
        if (!hydratedSeries && propsSeries) {
          // workoutData has it but hydrated doesn't - update once on mount
          setHydrated((prev: any) => {
            // Only update if computed is actually different
            if (prev?.computed !== workoutData.computed) {
              return { ...prev, computed: workoutData.computed };
            }
            return prev;
          });
        }
      }
      return;
    }
    
    // Check database first (might have data even if component state is stale)
    // Only check once per workout to avoid excessive re-renders
    if (!checkedDbRef.current.has(workoutId)) {
      checkedDbRef.current.add(workoutId);
      
      (async () => {
        try {
          console.log('🔍 [CompletedTab] Checking DB for series data:', workoutId);
          const { data, error } = await supabase
            .from('workouts')
            .select('computed')
            .eq('id', workoutId)
            .single();
          
          if (!error && data) {
            const computed = typeof data.computed === 'string' ? JSON.parse(data.computed) : data.computed;
            const series = computed?.analysis?.series || null;
            const hasSeries = series && Array.isArray(series?.distance_m) && series.distance_m.length > 1;
            
            console.log('🔍 [CompletedTab] DB check result:', {
              workoutId,
              hasComputed: !!computed,
              hasSeries,
              seriesLength: hasSeries ? series.distance_m.length : 0
            });
            
            if (hasSeries) {
              // Data exists in DB, update component state only if different
              // Use a more efficient comparison - check if prev already has the same series
              setHydrated((prev: any) => {
                const prevComputed = prev?.computed;
                const prevSeries = prevComputed?.analysis?.series;
                
                // Quick check: if prevSeries exists and has same length, likely same data
                if (prevSeries && Array.isArray(prevSeries?.distance_m) && 
                    prevSeries.distance_m.length === series.distance_m.length &&
                    prevSeries.distance_m.length > 0) {
                  // Compare first and last values as quick check
                  if (prevSeries.distance_m[0] === series.distance_m[0] &&
                      prevSeries.distance_m[prevSeries.distance_m.length - 1] === 
                      series.distance_m[series.distance_m.length - 1]) {
                    // Likely the same data, don't update to prevent re-render
                    console.log('✅ [CompletedTab] Series already in state, skipping update');
                    initializedRef.current.add(workoutId);
                    return prev;
                  }
                }
                
                // Only update if series is actually different to prevent re-render loops
                if (JSON.stringify(prevSeries) !== JSON.stringify(series)) {
                  console.log('✅ [CompletedTab] Updating hydrated state with series data from DB');
                  initializedRef.current.add(workoutId);
                  return { ...prev, computed };
                }
                console.log('⏭️ [CompletedTab] Series unchanged, skipping update');
                initializedRef.current.add(workoutId);
                return prev;
              });
              return;
            } else {
              console.log('⏭️ [CompletedTab] No series data in DB yet');
            }
          } else {
            console.warn('⚠️ [CompletedTab] DB query error or no data:', error);
          }
        } catch (err) {
          console.warn('❌ [CompletedTab] Failed to check database for series:', err);
          checkedDbRef.current.delete(workoutId); // Allow retry on error
        }
      
      // Data doesn't exist, check if we already triggered
      const alreadyTriggered = processingTriggeredRef.current.has(workoutId);
      
      if (!alreadyTriggered) {
        // Mark as triggered immediately to prevent duplicate triggers
        processingTriggeredRef.current.add(workoutId);
        
        // Trigger processing once (fire-and-forget)
        supabase.functions.invoke('compute-workout-analysis', {
          body: { workout_id: workoutId }
        }).catch(err => {
          console.warn('Failed to trigger processing:', err);
          // Remove from set on error so it can retry
          processingTriggeredRef.current.delete(workoutId);
        });
      }
      })();
    }
    
    // Poll for completion (whether we just triggered or were already polling)
    let attempt = 0;
    const maxAttempts = 30; // ~30 seconds max (1s intervals)
    
    const poll = async () => {
      // Check if we now have series (component might have updated)
      const currentSeries = (hydrated||workoutData)?.computed?.analysis?.series || null;
      const currentHasSeries = currentSeries && Array.isArray(currentSeries?.distance_m) && currentSeries.distance_m.length > 1;
      
      if (currentHasSeries || attempt >= maxAttempts) {
        if (pollingTimeoutRef.current) {
          clearTimeout(pollingTimeoutRef.current);
          pollingTimeoutRef.current = null;
        }
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('workouts')
          .select('computed')
          .eq('id', workoutId)
          .single();
        
        if (!error && data) {
          const computed = typeof data.computed === 'string' ? JSON.parse(data.computed) : data.computed;
          const s = computed?.analysis?.series || null;
          const hasData = s && Array.isArray(s?.distance_m) && s.distance_m.length > 1;
          
          if (hasData) {
            // Processing complete! Refresh the workout data
            if (pollingTimeoutRef.current) {
              clearTimeout(pollingTimeoutRef.current);
              pollingTimeoutRef.current = null;
            }
            // Trigger a refetch by updating hydrated state (only if different)
            setHydrated((prev: any) => {
              const prevComputed = prev?.computed;
              const prevSeries = prevComputed?.analysis?.series;
              
              // Quick check: if prevSeries exists and has same length, likely same data
              if (prevSeries && Array.isArray(prevSeries?.distance_m) && 
                  prevSeries.distance_m.length === s.distance_m.length &&
                  prevSeries.distance_m.length > 0) {
                // Compare first and last values as quick check
                if (prevSeries.distance_m[0] === s.distance_m[0] &&
                    prevSeries.distance_m[prevSeries.distance_m.length - 1] === 
                    s.distance_m[s.distance_m.length - 1]) {
                  // Likely the same data, don't update to prevent re-render
                  return prev;
                }
              }
              
              // Only update if series is actually different to prevent re-render loops
              if (JSON.stringify(prevSeries) !== JSON.stringify(s)) {
                return { ...prev, computed };
              }
              return prev;
            });
            return;
          }
        }
      } catch (err) {
        console.warn('Polling error:', err);
      }
      
      attempt++;
      // Poll every 2 seconds (less aggressive)
      pollingTimeoutRef.current = setTimeout(poll, 2000);
    };
    
    // Start polling after 2 second delay (give processing time to start)
    pollingTimeoutRef.current = setTimeout(poll, 2000);
    
    // Cleanup: stop polling when component unmounts or dependencies change
    return () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
    };
  }, [(hydrated||workoutData)?.id]); // Only depend on workout ID to prevent re-render loops
  
  useEffect(() => {
    setHydrated((prev: any) => {
      // Prefer latest props, but do not regress defined scalar fields to undefined/null.
      const next = { ...(prev || {}), ...(workoutData || {}) } as any;
      if ((workoutData as any)?.max_speed == null && (prev as any)?.max_speed != null) {
        next.max_speed = (prev as any).max_speed;
      }
      
      // For RPE and gear_id: prefer workoutData (from database) if it exists, otherwise preserve prev (local changes)
      // This ensures that when workoutData refetches with fresh data, we use that instead of stale local state
      if ((workoutData as any)?.rpe != null && (workoutData as any)?.rpe !== undefined) {
        next.rpe = (workoutData as any).rpe;
      } else if ((prev as any)?.rpe != null) {
        next.rpe = (prev as any).rpe;
      }
      if ((workoutData as any)?.gear_id != null && (workoutData as any)?.gear_id !== undefined) {
        next.gear_id = (workoutData as any).gear_id;
      } else if ((prev as any)?.gear_id != null) {
        next.gear_id = (prev as any).gear_id;
      }
      
      // CRITICAL: Only update if something actually changed (prevent infinite loop)
      // Compare key fields to avoid unnecessary re-renders
      if (prev && 
          prev.id === next.id && 
          prev.avg_speed === next.avg_speed &&
          prev.max_speed === next.max_speed &&
          prev.distance === next.distance &&
          prev.computed === next.computed &&
          prev.rpe === next.rpe &&
          prev.gear_id === next.gear_id) {
        return prev; // No change, return previous reference
      }
      
      return next;
    });
  }, [workoutData]);

  // Single hydration path: rely on parent hook to supply computed/series; no duplicate fetches here
  
  // No need to initialize localSelectedMetric here - it's handled in the sub-component

   // Simple check: what fields are actually in workoutData?
  useEffect(() => {
    if (workoutData && workoutData.gps_track) {
      if (import.meta.env?.DEV) console.log('📊 workoutData loaded:', workoutData.name, 'GPS:', workoutData.gps_track?.length, 'Sensors:', (Array.isArray((workoutData as any)?.sensor_data?.samples) ? (workoutData as any).sensor_data.samples.length : (workoutData as any)?.sensor_data?.length));
      
      // Debug: Check what data we have
      if (import.meta.env?.DEV) console.log('🔍 CompletedTab workoutData debug:', {
        hasGpsTrack: !!workoutData.gps_track,
        gpsTrackLength: workoutData.gps_track?.length,
        hasSensorData: !!workoutData.sensor_data,
        sensorDataLength: workoutData.sensor_data?.length,
        sensorDataKeys: workoutData.sensor_data ? Object.keys(workoutData.sensor_data[0] || {}) : [],
        workoutDataKeys: Object.keys(workoutData || {})
      });
      
      // Additional debug: Check what we're about to pass to CleanElevationChart
      if (import.meta.env?.DEV) console.log('🔍 DEBUG - About to pass to CleanElevationChart:', {
        gpsTrack: workoutData.gps_track?.length,
        sensorData: (Array.isArray((workoutData as any)?.sensor_data?.samples) ? (workoutData as any).sensor_data.samples.length : (workoutData as any)?.sensor_data?.length),
        sensorDataType: typeof workoutData.sensor_data,
        workoutDataKeys: Object.keys(workoutData || {})
      });
      
      setIsLoading(false);
    } else if (workoutData) {
      // We have workout data but no GPS track
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
  }, [workoutData]);

  // Memoized derived data keyed by workout id (prevents duplicate heavy work)
  // Directly use server-provided series; only derive track coords locally for the map
  const workoutIdKey = String((hydrated as any)?.id || (workoutData as any)?.id || '');
  const memo = useMemo(() => {
    const src = (hydrated || workoutData) as any;
    const gpsRaw = src?.gps_track;
    const gps = Array.isArray(gpsRaw)
      ? gpsRaw
      : (typeof gpsRaw === 'string' ? (()=>{ try { const v = JSON.parse(gpsRaw); return Array.isArray(v)? v : []; } catch { return []; } })() : []);
    const track: [number,number][] = gps
      .map((p:any)=>{
        const lng = p.lng ?? p.longitudeInDegree ?? p.longitude ?? p.lon;
        const lat = p.lat ?? p.latitudeInDegree ?? p.latitude;
        if ([lng,lat].every((v)=>Number.isFinite(v))) return [Number(lng), Number(lat)] as [number,number];
        return null;
      })
      .filter(Boolean) as [number,number][];
    const series = src?.computed?.analysis?.series || null;
    return { track, series } as const;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutIdKey, hydrated?.computed?.analysis?.series, workoutData?.computed?.analysis?.series]);

  // Memoize map props at component level (outside IIFE) to prevent re-renders
  const finalSeries = useMemo(() => 
    (memo?.series || (hydrated||workoutData)?.computed?.analysis?.series) as any,
    [memo?.series, hydrated?.computed?.analysis?.series, workoutData?.computed?.analysis?.series]
  );
  
  const finalTrack = useMemo(() => {
    const trackFromMemo = memo?.track;
    if (trackFromMemo && trackFromMemo.length > 0) return trackFromMemo;
    
    // Get GPS track from workout data (server should have decoded polyline if needed)
    const gpsRaw = (hydrated||workoutData)?.gps_track;
    const gps = Array.isArray(gpsRaw)
      ? gpsRaw
      : (typeof gpsRaw === 'string' ? (()=>{ try { const v = JSON.parse(gpsRaw); return Array.isArray(v)? v : []; } catch { return []; } })() : []);
    
    return gps
      .map((p:any)=>{
        const lng = p.lng ?? p.longitudeInDegree ?? p.longitude ?? p.lon;
        const lat = p.lat ?? p.latitudeInDegree ?? p.latitude;
        if ([lng,lat].every((v)=>Number.isFinite(v))) return [Number(lng), Number(lat)] as [number,number];
        return null;
      })
      .filter(Boolean) as [number,number][];
  }, [memo?.track, hydrated?.gps_track, workoutData?.gps_track]);

  const mapProps = useMemo(() => {
    // Check if data actually changed by comparing array lengths and first/last values
    const trackChanged = !mapPropsRef.current?.trackLngLat || 
      !Array.isArray(finalTrack) ||
      mapPropsRef.current.trackLngLat.length !== finalTrack.length ||
      (finalTrack.length > 0 && (
        mapPropsRef.current.trackLngLat[0]?.[0] !== finalTrack[0]?.[0] ||
        mapPropsRef.current.trackLngLat[0]?.[1] !== finalTrack[0]?.[1]
      ));
    
    const seriesChanged = !mapPropsRef.current?.samples ||
      (finalSeries?.distance_m?.length !== mapPropsRef.current.samples?.distance_m?.length);
    
    // Only create new object if data actually changed
    if (trackChanged || seriesChanged || 
        mapPropsRef.current?.useMiles !== !!useImperial ||
        mapPropsRef.current?.compact !== compact ||
        mapPropsRef.current?.workoutData?.id !== workoutData?.id) {
      mapPropsRef.current = {
        samples: finalSeries,
        trackLngLat: finalTrack,
        useMiles: !!useImperial,
        useFeet: !!useImperial,
        compact,
        workoutData
      };
    }
    
    return mapPropsRef.current;
  }, [finalSeries, finalTrack, useImperial, compact, workoutData?.id]);
  // Initialize pool length state from explicit, inferred, or default
  useEffect(() => {
    if (workoutData && workoutData.swim_data) {
      try {
        const explicit = Number((workoutData as any)?.pool_length);
        if (Number.isFinite(explicit) && explicit > 0) { setPoolLengthMeters(explicit); return; }
        const defStr = typeof window !== 'undefined' ? window.localStorage.getItem('pool_length_default_m') : null;
        const def = defStr ? Number(defStr) : NaN;
        if (Number.isFinite(def) && def > 0) { setPoolLengthMeters(def); return; }
        // Fallback to inference later via helpers (keep null so helpers compute)
        setPoolLengthMeters(null);
      } catch { setPoolLengthMeters(null); }
    }
  }, [workoutData?.swim_data]);

  // If this workout is linked to a planned row, fetch its tokens/label for display
  useEffect(() => {
    (async () => {
      try {
        const pid = (workoutData as any)?.planned_id;
        if (!pid) { setPlannedTokens(null); setPlannedLabel(null); return; }
        const { data } = await supabase
          .from('planned_workouts')
          .select('name, steps_preset, computed')
          .eq('id', String(pid))
          .maybeSingle();
        if (!data) { setPlannedTokens(null); setPlannedLabel(null); return; }
        const tokens = (() => {
          try {
            if (Array.isArray((data as any).steps_preset)) return (data as any).steps_preset.map((t:any)=> String(t));
            if (typeof (data as any).steps_preset === 'string') { const arr = JSON.parse((data as any).steps_preset); return Array.isArray(arr) ? arr.map((t:any)=> String(t)) : null; }
          } catch {}
          return null;
        })();
        setPlannedTokens(tokens);
        setPlannedLabel(((data as any)?.name || null));
      } catch { setPlannedTokens(null); setPlannedLabel(null); }
    })();
  }, [workoutData?.planned_id]);


  // No debouncing needed - direct state management

 // Add error handling and loading states
   if (isLoading || !workoutData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          {isLoading ? (
            <>
              <div className="animate-pulse">
                <div className="h-4 bg-white/10 rounded w-3/4 mx-auto mb-2"></div>
                <div className="h-4 bg-white/10 rounded w-1/2 mx-auto"></div>
              </div>
              <div className="text-muted-foreground text-lg mb-2">Loading workout data...</div>
            </>
          ) : (
            <>
              <div className="text-muted-foreground text-lg mb-2">No workout data available</div>
              <div className="text-muted-foreground text-sm">Please select a workout or try refreshing the page</div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Pool swims don't need GPS - they have metrics from lengths data




 // Helper functions

  

 

 

 

 // Format average speed specifically
const formatAvgSpeed = (speedValue: any): string => {
  const speedKmh = Number(speedValue);
  if (speedKmh && speedKmh > 0) {
    const speedMph = speedKmh * 0.621371;
    return `${speedMph.toFixed(1)} mph`;
  }
  return 'N/A';


// Format max speed specifically  
const formatMaxSpeed = (speedValue: any): string => {
  const speedKmh = Number(speedValue);
  if (speedKmh && speedKmh > 0) {
    const speedMph = speedKmh * 0.621371;
    return `${speedMph.toFixed(1)} mph`;
  }
  return 'N/A';
};

 

 

 const formatTemperature = (c: any): string => {
   if (import.meta.env?.DEV) console.log('🔍 formatTemperature called with:', c, typeof c);
   
   // 🔧 GARMIN DATA EXTRACTION: Try all possible temperature sources
   const temp = c || 
                workoutData.avg_temperature || 
                workoutData.metrics?.avg_temperature ||
                workoutData.metrics?.temperature ||
                workoutData.temperature;
   const num = Number(temp);
   
   if (!num || isNaN(num)) {
     if (import.meta.env?.DEV) console.log('🔍 formatTemperature returning N/A because num is:', num, 'isNaN:', isNaN(num));
     return 'N/A';
   }
   
   // Always show Fahrenheit for now (settings toggle later)
   const f = Math.round((num * 9/5) + 32);
   if (import.meta.env?.DEV) console.log('🔍 formatTemperature converting:', num, '°C to', f, '°F');
   return `${f}°F`;
 };

 // Format pace using basic calculation from distance and duration
 

 

 const formatDate = (dateStr: any): string => {
   // 🔧 GARMIN DATA EXTRACTION: Try multiple date sources
   const dateValue = dateStr || workoutData.date || workoutData.start_date;
   if (!dateValue) return 'N/A';
   
   if (import.meta.env?.DEV) console.log('🔍 formatDate debugging:', {
     input: dateStr,
     dateValue,
     type: typeof dateValue
   });
   
   // Create Date object - handle UTC timestamps properly
   const date = new Date(dateValue);
   
   if (import.meta.env?.DEV) console.log('🔍 Date object created:', {
     date: date.toString(),
     utc: date.toUTCString(),
     local: date.toLocaleString(),
     timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
   });
   
   // Format date in local timezone (same as calendar)
   const options: Intl.DateTimeFormatOptions = {
     weekday: 'long',
     month: 'long',
     day: 'numeric'
   };
   
   const result = date.toLocaleDateString('en-US', options);
   if (import.meta.env?.DEV) console.log('🔍 formatDate result:', result);
   
   return result;
 };

 const getCityFromCoordinates = (lat: any, lng: any): string => {
   if (import.meta.env?.DEV) console.log('🔍 getCityFromCoordinates called with:', lat, lng);
   
   // 🔧 GARMIN DATA EXTRACTION: Try all possible coordinate sources
   const latNum = Number(lat || 
                        workoutData.start_position_lat || 
                        workoutData.latitude || 
                        workoutData.start_lat);
   const lngNum = Number(lng || 
                        workoutData.start_position_long || 
                        workoutData.longitude || 
                        workoutData.start_lng);
   
   if (!latNum || !lngNum) {
     if (import.meta.env?.DEV) console.log('🔍 getCityFromCoordinates returning Unknown - no valid coords');
     return 'Unknown';
   }
   
   // Location detection - coordinates will show actual location
   if (import.meta.env?.DEV) console.log('🔍 getCityFromCoordinates returning Unknown - no location detection implemented');
   return 'Unknown';
 };

 const generateTitle = (): string => {
   // 🔧 GARMIN DATA EXTRACTION: Use timestamp for Garmin activities, date for manual workouts
   const date = formatDate(workoutData.timestamp || workoutData.date);
   const city = getCityFromCoordinates(workoutData.start_position_lat, workoutData.start_position_long);
   const title = `${date} ${city} ${workoutData.type}`;
   if (import.meta.env?.DEV) console.log('🔍 generateTitle result:', title);
   if (import.meta.env?.DEV) console.log('🔍 generateTitle debugging:', {
     timestamp: workoutData.timestamp,
     date: workoutData.date,
     start_position_lat: workoutData.start_position_lat,
     start_position_long: workoutData.start_position_long,
     type: workoutData.type
   });
   return title;
 };

  // Primary metrics helper removed; metrics render inline and via norm

  // ----- Moving time resolver (strict) -----
  // Only use explicitly provided moving-time fields; do not infer from cadence or distance.
  

  // ----- Elapsed time resolver (exact seconds when available) -----
  

  

  /* removed legacy inferPoolLengthMeters */
    // 1) Explicit per-workout override/state
    const explicit = Number(poolLengthMeters ?? (workoutData as any).pool_length);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    // 2) Planned setting (if present on hydratedPlanned) – look for pool_length_m or tokens like 25m/25yd
    try {
      const planned: any = (workoutData as any)?.planned || (hydrated as any)?.planned || null;
      const pl = Number((planned as any)?.pool_length_m);
      if (Number.isFinite(pl) && pl > 0) return pl;
      const tokens: string[] = Array.isArray((planned as any)?.steps_preset) ? (planned as any).steps_preset.map((t:any)=>String(t)) : [];
      const joined = tokens.join(' ').toLowerCase();
      const m = joined.match(/\b(25|33(?:\.33)?|50)\s*m\b/);
      if (m) return Number(m[1]);
      const y = joined.match(/\b(25|50)\s*yd\b/);
      if (y) return Number(y[1]) * 0.9144;
    } catch {}
    // 3) User baselines preference
    try {
      const pn = (window as any)?.__APP_BASELINES__?.performanceNumbers || {};
      const bLen = Number(pn?.swim_pool_length_m ?? pn?.swimPoolLengthM);
      if (Number.isFinite(bLen) && bLen > 0) return bLen;
    } catch {}
    // 4) Infer from lengths when distance is available
    const distM = norm.distance_m;
    const nLengths = Number((workoutData as any)?.number_of_active_lengths) || (Array.isArray((workoutData as any)?.swim_data?.lengths) ? (workoutData as any).swim_data.lengths.length : 0);
    if (distM && nLengths > 0) return distM / nLengths;
    // 5) Local default
    try {
      const defStr = typeof window !== 'undefined' ? window.localStorage.getItem('pool_length_default_m') : null;
      const def = defStr ? Number(defStr) : NaN;
      if (Number.isFinite(def) && def > 0) return def;
    } catch {}
    return null;
  };

  /* removed legacy isYardPool */

  /* removed legacy computeSwimAvgPaceSecPer100 */

  /* removed legacy formatPoolLengthLabel */

  const formatMetersCompact = (m: number | null | undefined): string => {
    const n = Number(m);
    if (!Number.isFinite(n) || n <= 0) return '—';
    if (n >= 1000) return `${Math.round(n/10)/100} km`;
    return `${Math.round(n)} m`;
  };

  const getSwimLengths = (): Array<{ distance_m?: number; duration_s?: number; strokes?: number }> => {
    try {
      const arr = (hydrated as any)?.swim_data?.lengths || (workoutData as any)?.swim_data?.lengths;
      if (Array.isArray(arr)) return arr as any[];
    } catch {}
    return [];
  };

  const computeAvgStrokeRate = (): number | null => {
    const v = Number((workoutData as any)?.avg_swim_cadence ?? (workoutData as any)?.avg_cadence);
    if (Number.isFinite(v) && v > 0) return Math.round(v);
    try {
      const samples = Array.isArray((workoutData as any)?.sensor_data?.samples)
        ? (workoutData as any).sensor_data.samples : (Array.isArray((workoutData as any)?.sensor_data) ? (workoutData as any).sensor_data : []);
      const vals = samples.map((s:any)=> Number(s.swimCadenceInStrokesPerMinute ?? s.cadence)).filter((n:number)=> Number.isFinite(n) && n>0);
      if (vals.length) return Math.round(vals.reduce((a:number,b:number)=>a+b,0)/vals.length);
    } catch {}
    return null;
  };

  const computeAvgStrokesPerLength = (): number | null => {
    try {
      const nLengths = Number((workoutData as any)?.number_of_active_lengths);
      const totalStrokes = Number((workoutData as any)?.strokes ?? (workoutData as any)?.metrics?.strokes);
      if (Number.isFinite(nLengths) && nLengths>0 && Number.isFinite(totalStrokes) && totalStrokes>0) {
        return Math.round((totalStrokes / nLengths) * 10) / 10;
      }
      const lengths = getSwimLengths();
      const strokes = lengths.map((l:any)=> Number(l?.strokes ?? l?.stroke_count)).filter((n:number)=> Number.isFinite(n));
      if (strokes.length && lengths.length) return Math.round((strokes.reduce((a:number,b:number)=>a+b,0) / lengths.length) * 10) / 10;
    } catch {}
    return null;
  };

  type DetectedSet = { label: string; distance_m: number; pace_per100_s: number | null };

  // Build fixed-distance splits at 100m or 100yd based on pool
  const buildHundredSplits = (): Array<{ idx: number; duration_s: number; avg_hr: number | null; unit: 'm' | 'yd' }> => {
    try {
      const lengths = getSwimLengths();
      if (!lengths.length) return [];
      const Lm = Number(poolLengthMeters ?? (workoutData as any)?.pool_length) || 25; // default assumption
      const isYd = Lm >= 20 && Lm <= 26; // Yard pools are typically 25 yards (~22.86m)
      const unitLenM = isYd ? 91.44 : 100;
      const perSplit = Math.max(1, Math.round(unitLenM / Lm));
      const splits: Array<{ idx: number; duration_s: number; avg_hr: number | null; unit: 'm' | 'yd' }> = [];
      let idx = 1;
      for (let i = 0; i < lengths.length; i += perSplit) {
        const chunk = lengths.slice(i, i + perSplit);
        if (chunk.length < perSplit) break; // require full chunk for a clean split
        let dur = 0;
        let strokesSum: number | null = 0;
        const hrVals: number[] = [];
        for (const len of chunk) {
          const t = Number((len as any)?.duration_s ?? (len as any)?.duration ?? 0);
          dur += Number.isFinite(t) ? t : 0;
          const st = Number((len as any)?.strokes ?? (len as any)?.stroke_count);
          if (Number.isFinite(st)) strokesSum = (strokesSum as number) + st; else strokesSum = strokesSum;
          const hr = Number((len as any)?.avg_heart_rate ?? (len as any)?.hr_bpm);
          if (Number.isFinite(hr) && hr > 40 && hr < 230) hrVals.push(Math.round(hr));
        }
        const avgHr = hrVals.length ? Math.round(hrVals.reduce((a,b)=>a+b,0)/hrVals.length) : null;
        splits.push({ idx: idx++, duration_s: Math.round(dur), avg_hr: avgHr, unit: isYd ? 'yd' : 'm' });
      }
      return splits;
    } catch { return []; }
  };
  const detectSets = (): { summary: string[]; performance: DetectedSet[] } => {
    const outSummary: string[] = [];
    const outPerf: DetectedSet[] = [];
    // Prefer laps if present
    let laps: any[] = [];
    try {
      const raw = (hydrated as any)?.laps ?? (workoutData as any)?.laps;
      if (typeof raw === 'string') { const j = JSON.parse(raw); if (Array.isArray(j)) laps = j; }
      else if (Array.isArray(raw)) laps = raw;
    } catch {}
    if (laps.length > 0) {
      const norm = laps.map((l:any)=>({
        d: Number(l.totalDistanceInMeters ?? l.distanceInMeters ?? l.distance_m ?? l.distance ?? 0),
        t: Number(l.durationInSeconds ?? l.duration_s ?? l.time ?? 0)
      })).filter(x=> x.d>0 && x.t>0);
      if (norm.length) {
        // Identify repeats by most common lap distance
        const counts: Record<string, number> = {};
        for (const l of norm) { const key = String(Math.round(l.d/25)*25); counts[key] = (counts[key]||0)+1; }
        const bestKey = Object.keys(counts).sort((a,b)=> counts[b]-counts[a])[0];
        const mainD = Number(bestKey);
        const main = norm.filter(l=> Math.abs(l.d - mainD) <= Math.max(10, mainD*0.05));
        if (main.length>=3) {
          const per100 = main.map(l=> (l.t/(l.d/100))).filter(Number.isFinite);
          const avgPer100 = per100.length? (per100.reduce((a,b)=>a+b,0)/per100.length) : null;
          const plusMinus = (()=>{
            if (!per100.length || !avgPer100) return '±0s';
            const dev = per100.reduce((a,b)=> a + Math.abs(b-avgPer100), 0)/per100.length;
            return `±${Math.round(dev)}s`;
          })();
          outSummary.push(`Main: ${main.length}x${Math.round(mainD)}m - ${avgPer100?formatSwimPace(avgPer100):'—' } avg (${plusMinus} consistency)`);
          let i=1; for (const l of main) {
            const p100 = l.t/(l.d/100);
            outPerf.push({ label: `${Math.round(mainD)}m #${i++}`, distance_m: l.d, pace_per100_s: p100 });
          }
        }
        // Warmup = first lap if longer/slow; Cooldown = last lap if short
        const first = norm[0];
        if (first) {
          const p100 = first.t/(first.d/100); outSummary.unshift(`Warmup: ${Math.round(first.d)}m - ${formatSwimPace(p100)}`);
        }
        const last = norm[norm.length-1];
        if (last && last!==first) {
          const p100 = last.t/(last.d/100); outSummary.push(`Cooldown: ${Math.round(last.d)}m - ${formatSwimPace(p100)}`);
        }
        return { summary: outSummary, performance: outPerf };
      }
    }
    // Fallback: lengths
    const lengths = getSwimLengths();
    if (lengths.length) {
      const L = (() => {
        // Inline pool length inference (replaces inferPoolLengthMeters)
        const explicit = Number(poolLengthMeters ?? (workoutData as any)?.pool_length);
        if (Number.isFinite(explicit) && explicit > 0) return explicit;
        const distM = norm.distance_m;
        const nLengths = Number((workoutData as any)?.number_of_active_lengths) || (Array.isArray((workoutData as any)?.swim_data?.lengths) ? (workoutData as any).swim_data.lengths.length : 0);
        if (distM && nLengths > 0) return distM / nLengths;
        return 25;
      })();
      const total = lengths.reduce((a:number,l:any)=> a + Number(l?.distance_m ?? L), 0);
      const dur = lengths.reduce((a:number,l:any)=> a + Number(l?.duration_s ?? l?.duration ?? 0), 0);
      if (total>0 && dur>0) {
        const p100 = dur/(total/100);
        outSummary.push(`Main: ${formatMetersCompact(total)} - ${formatSwimPace(p100)}`);
      }
    }
    return { summary: outSummary, performance: outPerf };
  };

  // Compute SWOLF (avg seconds per length + avg strokes per length)
  const computeSwolf = (): number | null => {
    try {
      const nLengths = Number((workoutData as any)?.number_of_active_lengths) || (Array.isArray((workoutData as any)?.swim_data?.lengths) ? (workoutData as any).swim_data.lengths.length : 0);
      const dur = Number(norm.duration_s);
      if (!nLengths || !dur) return null;
      let totalStrokes: number | null = null;
      const s1 = Number((workoutData as any)?.strokes ?? (workoutData as any)?.metrics?.strokes);
      if (Number.isFinite(s1) && s1 > 0) totalStrokes = Number(s1);
      if (totalStrokes == null && Array.isArray((workoutData as any)?.swim_data?.lengths)) {
        const arr = (workoutData as any).swim_data.lengths as any[];
        const sum = arr
          .map((l:any)=> Number(l?.strokes ?? l?.stroke_count))
          .filter((n:any)=> Number.isFinite(n))
          .reduce((a:number,b:number)=> a + Number(b), 0);
        if (sum > 0) totalStrokes = sum;
      }
      const avgSecPerLen = dur / nLengths;
      const avgStrokesPerLen = totalStrokes != null ? (totalStrokes / nLengths) : null;
      const swolf = avgStrokesPerLen != null ? Math.round(avgSecPerLen + avgStrokesPerLen) : null;
      return Number.isFinite(swolf as any) ? (swolf as number) : null;
    } catch { return null; }
  };

  // primaryMetrics removed; metrics are rendered directly where needed

 // 🏠 ADVANCED METRICS - Dynamic based on workout type
 const getAdvancedMetrics = () => {
   const isRun = workoutData.swim_data;
   const isBike = workoutData.ride_data;
   const isSwim = workoutData.swim_data;
   const isWalk = workoutData.walk_data;
   
   // Walking gets minimal advanced metrics
   if (isWalk) {
     return [
       {
         label: 'Avg Pace',
         value: (Number.isFinite(norm.avg_pace_s_per_km as any) ? formatPace(norm.avg_pace_s_per_km as number, useImperial) : 'N/A'),
         unit: '/mi'
       },
      {
        label: 'Max Pace',
        value: (() => {
          // Use normalized data from useWorkoutData hook (calculated_metrics)
          const maxPaceSeconds = norm.max_pace_s_per_km;
          if (!Number.isFinite(maxPaceSeconds as any) || !maxPaceSeconds || maxPaceSeconds <= 0) return 'N/A';
          // Convert to per-mile if needed, then format
          const secPerMile = maxPaceSeconds * 1.60934;
          if (secPerMile < 360) return 'N/A'; // guard: unrealistic for walk/hike
          return formatPace(maxPaceSeconds, useImperial);
        })(),
        unit: useImperial ? '/mi' : '/km'
      }
     ];
   }
   
   const baseMetrics = [
     {
       label: 'Max HR',
      value: Number.isFinite(norm.max_hr as any) ? String(norm.max_hr) : 'N/A',
       unit: 'bpm'
     },
    {
      label: isRun ? 'Max Pace' : 'Max Speed',
      value: isRun
       ? (Number.isFinite(norm.max_pace_s_per_km as any) && norm.max_pace_s_per_km ? formatPace(norm.max_pace_s_per_km as number, useImperial) : 'N/A')
      : (Number.isFinite((workoutData as any)?.max_speed as any)
         ? (() => { const kmh = Number((workoutData as any).max_speed); if (!Number.isFinite(kmh)) return 'N/A'; return useImperial ? `${(kmh*0.621371).toFixed(1)} mph` : `${kmh.toFixed(1)} km/h`; })()
         : 'N/A'),
      unit: isRun ? (useImperial ? '/mi' : '/km') : (useImperial ? 'mph' : 'km/h')
    },
    // Max cadence / stroke rate removed per request
   ];

   // Add discipline-specific metrics
   if (isRun) {
     return [
       ...baseMetrics,
       {
         label: 'Steps',
         value: workoutData.steps ? String(workoutData.steps) : 'N/A'
       },
       {
         label: 'TSS',
         value: workoutData.tss ? String(Math.round(workoutData.tss * 10) / 10) : 'N/A'
       }
     ];
   } else if (isBike) {
     return [
       ...baseMetrics,
       {
         label: 'Max Power',
        value: Number.isFinite(norm.max_power as any) ? String(norm.max_power) : 'N/A',
         unit: 'W'
       },
       {
         label: 'TSS',
         value: workoutData.tss ? String(Math.round(workoutData.tss * 10) / 10) : 'N/A'
       },
       {
         label: 'Intensity Factor',
         value: workoutData.intensity_factor ? `${workoutData.intensity_factor}%` : 'N/A'
       }
     ];
  } else if (isSwim) {
    // Hide elevation-like advanced rows for pool; keep HR/Max Pace/TSS/IF
    const baseForSwim = baseMetrics.filter(m => m.label !== 'Elevation');
    return [
      ...baseForSwim,
      {
        label: 'Max Pace',
        value: formatSwimPace(workoutData.metrics?.max_pace || workoutData.max_pace),
        unit: '/100m'
      },
      {
        label: 'TSS',
        value: workoutData.tss ? String(Math.round(workoutData.tss * 10) / 10) : 'N/A'
      },
      {
        label: 'Intensity Factor',
        value: workoutData.intensity_factor ? `${workoutData.intensity_factor}%` : 'N/A'
      }
    ];
  }

   return baseMetrics;
 };

 const advancedMetrics = getAdvancedMetrics();

 // 🏠 TRAINING METRICS - Pull real data from FIT file, remove Weighted Avg Power
 const calculateTotalWork = () => {
   if (import.meta.env?.DEV) console.log('🔍 calculateTotalWork - total_work:', workoutData.metrics?.total_work);
   
   // 🔧 GARMIN DATA EXTRACTION: Try all possible work sources
   const totalWork = workoutData.metrics?.total_work || 
                    workoutData.total_work || 
                    workoutData.work;
   
   // Use total_work from FIT file if available (in Joules), convert to kJ
   if (totalWork) {
     const kj = Math.round(Number(totalWork) / 1000);
     if (import.meta.env?.DEV) console.log('✅ calculateTotalWork using total_work:', kj, 'kJ');
     return `${kj} kJ`;
   }
   // Fallback calculation if total_work not available
  else if (workoutData.metrics?.avg_power && norm.duration_s) {
     // Convert duration from minutes to seconds for proper kJ calculation
    const durationSeconds = Number(norm.duration_s);
     const kj = Math.round((workoutData.metrics.avg_power * durationSeconds) / 1000);
     if (import.meta.env?.DEV) console.log('✅ calculateTotalWork using fallback calc:', kj, 'kJ');
     return `${kj} kJ`;
   }
   if (import.meta.env?.DEV) console.log('✅ calculateTotalWork returning N/A');
   return 'N/A';
 };

 // Derive average stride length for runs/walks (meters)
 

 

 

  // Enhanced VAM calculation for running with insights
 const calculateRunningVAM = () => {
  if (!workoutData.swim_data) return null;
  
  const elevationGain = (workoutData as any)?.elevation_gain ?? (workoutData as any)?.metrics?.elevation_gain;
  const duration = Number(norm.duration_s);
   
  if (!elevationGain || !duration) return null;
   
   const elevationM = Number(elevationGain);
  const durationHours = duration / 3600;
   const vam = Math.round(elevationM / durationHours);
   
   // Professional VAM insights with actionable feedback
   let insight = '';
   let trainingZone = '';
   let racePacing = '';
   
   if (vam >= 1000) {
     insight = 'Elite climbing performance';
     trainingZone = 'VO2 Max / Anaerobic';
     racePacing = 'Suitable for short, steep races';
   } else if (vam >= 800) {
     insight = 'Advanced climbing strength';
     trainingZone = 'Threshold / Tempo';
     racePacing = 'Good for hilly 10K-21K';
   } else if (vam >= 600) {
     insight = 'Strong climbing ability';
     trainingZone = 'Aerobic / Endurance';
     racePacing = 'Ideal for marathon training';
   } else if (vam >= 400) {
     insight = 'Good climbing endurance';
     trainingZone = 'Aerobic Base';
     racePacing = 'Ultra-distance ready';
   } else {
     insight = 'Endurance-focused climbing';
     trainingZone = 'Recovery / Base';
     racePacing = 'Build climbing strength';
   }
   
   return { vam, insight, trainingZone, racePacing };
 };

 // Calculate Grade Adjusted Pace (GAP) using proper Strava formula
 const calculateGradeAdjustedPace = () => {
   if (import.meta.env?.DEV) console.log('🔍 GAP calculation');
   if (!workoutData.swim_data && !workoutData.walk_data) {
     if (import.meta.env?.DEV) console.log('❌ GAP calculation skipped - not a run/walk:', workoutData.swim_data);
     return null;
   }
   
  const distance = norm.distance_m;
  const duration = Number(norm.duration_s);
  const elevationGain = (workoutData as any)?.elevation_gain ?? (workoutData as any)?.metrics?.elevation_gain;
   
   if (import.meta.env?.DEV) console.log('🔍 GAP calculation - data:', { distance, duration, elevationGain });
   
  if (!distance || !duration || !elevationGain) {
     if (import.meta.env?.DEV) console.log('❌ GAP calculation skipped - missing data');
     return null;
   }
   
   // Convert to standard units - handle both km and miles
   let distanceMiles = Number(distance);
  let durationMinutes = Number(duration) / 60; // norm is seconds -> minutes
   let elevationFeet = Number(elevationGain);
   
   // If distance is in km, convert to miles
   if (distanceMiles > 10) { // Likely in km if > 10
     distanceMiles = distanceMiles * 0.621371; // km to miles
     if (import.meta.env?.DEV) console.log('🔍 Converted distance from km to miles:', distanceMiles);
   }
   
  // duration is already seconds converted to minutes
   
   // If elevation is in meters, convert to feet
   if (elevationFeet > 1000) { // Likely in meters if > 1000
     elevationFeet = elevationFeet * 3.28084; // meters to feet
     if (import.meta.env?.DEV) console.log('🔍 Converted elevation from meters to feet:', elevationFeet);
   }
   
   if (import.meta.env?.DEV) console.log('🔍 GAP calculation - converted units:', { distanceMiles, durationMinutes, elevationFeet });
   
   // Calculate actual pace (min/mi)
   const actualPaceMinutes = durationMinutes / distanceMiles;
   if (import.meta.env?.DEV) console.log('🔍 Actual pace (min/mi):', actualPaceMinutes);
   
   // Proper Strava GAP formula
   // Elevation gain per mile affects pace
   const elevationPerMile = elevationFeet / distanceMiles;
   if (import.meta.env?.DEV) console.log('🔍 Elevation per mile:', elevationPerMile);
   
   // Strava's GAP adjustment: more sophisticated than simple linear
   // Accounts for both uphill and downhill effects
   let gapAdjustment = 0;
   
   if (elevationPerMile > 0) {
     // Uphill: slows you down more than simple linear
     // Strava uses a curve that increases impact for steeper grades
     gapAdjustment = (elevationPerMile / 100) * 1.2; // 20% more impact than linear
     if (import.meta.env?.DEV) console.log('🔍 Uphill adjustment:', gapAdjustment);
   } else if (elevationPerMile < 0) {
     // Downhill: speeds you up, but not as much as uphill slows you down
     gapAdjustment = (Math.abs(elevationPerMile) / 100) * 0.8; // 80% of uphill benefit
     if (import.meta.env?.DEV) console.log('🔍 Downhill adjustment:', gapAdjustment);
   }
   
   // Calculate GAP
   // Uphill: add penalty (slower pace), Downhill: subtract benefit (faster pace)
   const gapPaceMinutes = actualPaceMinutes + gapAdjustment;
   if (import.meta.env?.DEV) console.log('🔍 GAP pace (min/mi):', gapPaceMinutes);
   
   // Format GAP pace (don't go below 0)
   const gapPace = formatPace(Math.max(0, gapPaceMinutes));
   if (import.meta.env?.DEV) console.log('🔍 Final GAP pace:', gapPace);
   
   return gapPace;
 };

const formatMovingTime = () => {
  // Prefer our unified swim-aware resolver
  const s = Number(norm.duration_s);
  if (Number.isFinite(s as any) && (s as number) > 0) return formatDuration(s as number);
  // Fallback: legacy fields
  const raw = (workoutData as any)?.metrics?.total_timer_time
    ?? (workoutData as any)?.total_timer_time
    ?? (workoutData as any)?.moving_time
    ?? (workoutData as any)?.metrics?.moving_time
    ?? (workoutData as any)?.elapsed_time
    ?? (workoutData as any)?.metrics?.elapsed_time
    ?? null;
  return formatDuration(raw);
};

 const trainingMetrics = [
   {
     label: 'Normalized Power',
     value: workoutData.metrics?.normalized_power ? `${workoutData.metrics.normalized_power} W` : 'N/A'
   },
   {
     label: 'Training Load',
     value: workoutData.metrics?.training_stress_score ? String(Math.round(workoutData.metrics.training_stress_score)) : 'N/A'
   },
   {
     label: 'Total Work',
     value: calculateTotalWork()
   },
   {
     label: 'VAM',
    value: (() => {
      const vam = (norm.elevation_gain_m && norm.duration_s && norm.duration_s > 0)
        ? (norm.elevation_gain_m / (norm.duration_s / 3600))
        : null;
      return Number.isFinite(vam as any) && (vam as number) > 0 ? Math.round(vam as number) : '—';
    })()
   },
   {
     label: 'Moving Time',
     value: formatMovingTime()
   }
 ];

 return (
  <>
     {/* 🏠 ALL METRICS - 3-column grid with tighter spacing */}
     <div className="mx-[-12px] px-3 py-2">
       <div className="px-2.5 py-2.5" style={readoutPlateStyle}>
         <div className="flex items-center justify-between px-0.5 pb-2">
           <div className="text-[0.70rem] uppercase tracking-[0.22em] font-light" style={{ color: `rgba(${accentRgb}, 0.70)` }}>
             Readouts
           </div>
           <div
             aria-hidden
             className="h-[1px] flex-1 mx-3"
             style={{
               backgroundImage: `linear-gradient(90deg, rgba(${accentRgb},0.0) 0%, rgba(${accentRgb},0.38) 45%, rgba(${accentRgb},0.0) 100%)`,
               opacity: 0.9,
             }}
           />
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{
                backgroundColor: accentCore,
                boxShadow: `0 0 8px rgba(${accentRgb}, 0.35), 0 0 2px rgba(${accentRgb}, 0.45)`,
              }}
            />
            <span className="text-[0.70rem] font-light" style={{ color: `rgba(${accentRgb}, 0.55)`, fontFeatureSettings: '"tnum"' }}>
              {resolvedWorkoutType.toUpperCase()}
            </span>
          </div>
         </div>

     {workoutData.swim_data ? (
       <div className="grid grid-cols-3 gap-0.5">
         {/* Distance */}
         <div className="px-0.5 pb-1">
           <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
             {(() => {
               const src = (hydrated || workoutData);
               const km = (computeDistanceKm(src) ?? Number((src as any)?.distance)) || 0;
               const meters = Math.round(km * 1000);
               if (!meters) return 'N/A';
               return useImperial ? `${Math.round(meters / 0.9144)} yd` : `${meters} m`;
             })()}
           </div>
           <div className="text-xs font-light" style={metricLabelStyle}>Distance</div>
         </div>

         {/* Moving Time */}
         <div className="px-0.5 pb-1">
          <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>{formatMovingTime()}</div>
          <div className="text-xs font-light" style={metricLabelStyle}>Moving Time</div>
         </div>

         {/* Avg Pace /100 */}
         <div className="px-0.5 pb-1">
           <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {(() => {
                const pace = useImperial ? norm.avg_swim_pace_per_100yd : norm.avg_swim_pace_per_100m;
                if (!pace) return 'N/A';
                const mins = Math.floor(pace / 60);
                const secs = Math.round(pace % 60);
                return `${mins}:${String(secs).padStart(2, '0')}`;
              })()}
           </div>
           <div className="text-xs font-light" style={metricLabelStyle}>Avg Pace {useImperial ? '/100yd' : '/100m'}</div>
         </div>

         {/* Duration (Elapsed) */}
         <div className="px-0.5 py-1">
          <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
            {norm.elapsed_s ? formatDuration(norm.elapsed_s) : 'N/A'}
          </div>
           <div className="text-xs font-light" style={metricLabelStyle}>Duration</div>
         </div>

         {/* Avg HR */}
         <div className="px-0.5 py-1">
           <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
            {Number.isFinite(norm.avg_hr as any) ? String(norm.avg_hr) : 'N/A'}
           </div>
           <div className="text-xs font-light" style={metricLabelStyle}>Avg HR</div>
         </div>

         {/* Lengths */}
         <div className="px-0.5 py-1">
           <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
             {(() => { const n = (workoutData as any)?.number_of_active_lengths ?? ((workoutData as any)?.swim_data?.lengths ? (workoutData as any).swim_data.lengths.length : null); return n != null ? String(n) : 'N/A'; })()}
           </div>
           <div className="text-xs font-light" style={metricLabelStyle}>Lengths</div>
         </div>

         {/* Avg stroke rate */}
         <div className="px-0.5 py-1">
           <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
             {(() => { const v = computeAvgStrokeRate(); return v != null ? String(v) : 'N/A'; })()}
           </div>
           <div className="text-xs font-light" style={metricLabelStyle}>Avg stroke rate</div>
         </div>

         {/* Pool length */}
         <div className="px-0.5 py-1">
           <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
             {(() => {
               const Lm = Number(poolLengthMeters ?? (workoutData as any)?.pool_length);
               if (!Lm) return 'N/A';
               const isYd = Lm >= 20 && Lm <= 26;
               return isYd ? `${Math.round(Lm / 0.9144)} yd` : `${Lm} m`;
             })()}
           </div>
           <div className="text-xs font-light" style={metricLabelStyle}>Pool</div>
         </div>

         {/* Max HR */}
         <div className="px-0.5 py-1">
           <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
            {Number.isFinite(norm.max_hr as any) ? String(norm.max_hr) : 'N/A'}
           </div>
           <div className="text-xs font-light" style={metricLabelStyle}>Max HR</div>
         </div>

         {/* Calories */}
         <div className="px-0.5 py-1">
           <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
            {Number.isFinite(norm.calories as any) ? String(norm.calories) : 'N/A'}
           </div>
           <div className="text-xs font-light" style={metricLabelStyle}>Calories</div>
         </div>
       </div>
     ) : (
       <div className="grid grid-cols-3 gap-0.5">
       {/* General metrics - For runs/walks */}
       {(workoutData.type === 'run' || workoutData.type === 'walk' || norm.sport === 'run' || norm.sport === 'walk') && (
         <>
          {/* Row 1 */}
          <div className="px-0.5 pb-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.distance_km ? formatDistance(norm.distance_km, useImperial) : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Distance</div>
            </div>
          </div>

          <div className="px-0.5 pb-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.elapsed_s ? formatDuration(norm.elapsed_s) : (norm.duration_s ? formatDuration(norm.duration_s) : 'N/A')}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Duration</div>
            </div>
          </div>

          <div className="px-0.5 pb-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.duration_s ? formatDuration(norm.duration_s) : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Moving Time</div>
            </div>
          </div>

          {/* Row 2 */}
          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.avg_pace_s_per_km ? formatPace(norm.avg_pace_s_per_km, useImperial) : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Avg Pace</div>
            </div>
          </div>

          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.max_pace_s_per_km ? formatPace(norm.max_pace_s_per_km, useImperial) : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Max Pace</div>
            </div>
          </div>

          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.avg_hr ? `${norm.avg_hr} bpm` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Avg HR</div>
            </div>
          </div>

          {/* Row 3 */}
          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.max_hr ? `${norm.max_hr} bpm` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Max HR</div>
            </div>
          </div>

          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.elevation_gain_m ? `${(useImperial ? norm.elevation_gain_m * 3.28084 : norm.elevation_gain_m).toFixed(0)} ${useImperial ? 'ft' : 'm'}` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Elevation</div>
            </div>
          </div>

          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.avg_running_cadence_spm ? `${norm.avg_running_cadence_spm} spm` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Cadence</div>
            </div>
          </div>

          {/* Row 4 */}
          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.max_cadence_rpm ? `${norm.max_cadence_rpm} spm` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Max Cadence</div>
            </div>
          </div>

          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.calories ? String(norm.calories) : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Calories</div>
            </div>
          </div>

          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {(workoutData as any)?.workload_actual || (workoutData as any)?.workload_planned || 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Workload</div>
            </div>
          </div>

          {/* Row 5: IF, RPE, Gear */}
          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {(workoutData as any)?.intensity_factor ? (workoutData as any).intensity_factor.toFixed(2) : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>IF</div>
            </div>
          </div>

          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              <Select
                value={getSessionRPE(hydrated || workoutData) != null ? String(getSessionRPE(hydrated || workoutData)) : ""}
                onValueChange={(value) => handleFeedbackChange('rpe', value ? parseInt(value) : null)}
                disabled={savingFeedback}
              >
                <SelectTrigger
                  className="h-auto py-0 px-0 bg-transparent border-none text-base font-light hover:bg-transparent focus:ring-0 focus:ring-offset-0 w-full justify-start p-0"
                  style={{ color: 'rgba(255,255,255,0.92)', textShadow: `0 0 12px rgba(${accentRgb}, 0.16)` }}
                >
                  <SelectValue placeholder="N/A">
                    {getSessionRPE(hydrated || workoutData) != null ? String(getSessionRPE(hydrated || workoutData)) : 'N/A'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-white/10">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rpe) => (
                    <SelectItem
                      key={rpe}
                      value={String(rpe)}
                      className="text-white font-light focus:bg-white/[0.12] focus:text-white"
                    >
                      {rpe}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>RPE</div>
            </div>
          </div>

          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              <Select
                value={(() => {
                  // Only use actual gear_id from workout, not default gear (for controlled component)
                  const currentData = hydrated || workoutData;
                  const existingGearId = (currentData as any)?.gear_id;
                  return existingGearId || "";
                })()}
                onValueChange={(value) => handleFeedbackChange('gear_id', value || null)}
                disabled={savingFeedback || gearLoading}
              >
                <SelectTrigger
                  className="h-auto py-0 px-0 bg-transparent border-none text-base font-light hover:bg-transparent focus:ring-0 focus:ring-offset-0 w-full p-0 [&>svg]:hidden [&>span]:text-center [&>span]:block"
                  style={{ color: 'rgba(255,255,255,0.92)', textShadow: `0 0 12px rgba(${accentRgb}, 0.16)` }}
                >
                  <SelectValue placeholder="N/A">
                    {(() => {
                      const currentData = hydrated || workoutData;
                      const existingGearId = (currentData as any)?.gear_id;
                      const selectedId = existingGearId || gear.find(g => g.is_default)?.id;
                      const selected = gear.find(g => g.id === selectedId);
                      return selected?.name || 'N/A';
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-white/10">
                  {gear.map((item) => {
                    const distanceMeters = item.total_distance || 0;
                    const distanceMi = distanceMeters / 1609.34;
                    const distanceText = useImperial 
                      ? (distanceMi < 1 ? `${Math.round(distanceMeters)} m` : `${distanceMi.toFixed(1)} mi`)
                      : `${(distanceMeters / 1000).toFixed(1)} km`;
                    return (
                      <SelectItem
                        key={item.id}
                        value={item.id}
                        className="text-white font-light focus:bg-white/[0.12] focus:text-white"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-light">{item.name}</span>
                          {distanceMeters > 0 && (
                            <span className="text-xs text-white/50 font-light" style={{fontFeatureSettings: '"tnum"'}}>
                              {distanceText}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                  {onAddGear && (
                    <div className="border-t border-white/10 mt-1 pt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onAddGear();
                        }}
                        className="w-full flex items-center gap-2 px-2 py-2 text-sm font-light text-white/70 hover:text-white hover:bg-white/[0.08] rounded transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Add New {workoutData.type === 'run' ? 'Shoes' : 'Bike'}</span>
                      </button>
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Gear</div>
            </div>
          </div>
         </>
       )}
      
      {(workoutData.type === 'ride' || norm.sport === 'ride') ? (
        <>
          {/* Row 1 */}
          <div className="px-0.5 pb-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.distance_km ? `${(useImperial ? norm.distance_km * 0.621371 : norm.distance_km).toFixed(1)} ${useImperial ? 'mi' : 'km'}` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Distance</div>
            </div>
          </div>

          <div className="px-0.5 pb-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.elapsed_s ? formatDuration(norm.elapsed_s) : (norm.duration_s ? formatDuration(norm.duration_s) : 'N/A')}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Duration</div>
            </div>
          </div>

          <div className="px-0.5 pb-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.duration_s ? formatDuration(norm.duration_s) : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Moving Time</div>
            </div>
          </div>

          {/* Row 2 */}
          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.avg_speed_kmh ? `${(useImperial ? norm.avg_speed_kmh * 0.621371 : norm.avg_speed_kmh).toFixed(1)} ${useImperial ? 'mph' : 'km/h'}` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Avg Speed</div>
            </div>
          </div>

          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.max_speed_mps ? `${(useImperial ? norm.max_speed_mps * 2.23694 : norm.max_speed_mps * 3.6).toFixed(1)} ${useImperial ? 'mph' : 'km/h'}` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Max Speed</div>
            </div>
          </div>

          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.avg_power ? `${norm.avg_power} W` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Avg Power</div>
            </div>
          </div>

          {/* Row 3 */}
          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.max_power ? `${norm.max_power} W` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Max Power</div>
            </div>
          </div>

          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.normalized_power ? `${norm.normalized_power} W` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Norm Power</div>
            </div>
          </div>

          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.avg_hr ? `${norm.avg_hr} bpm` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Avg HR</div>
            </div>
          </div>

          {/* Row 4 */}
          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.max_hr ? `${norm.max_hr} bpm` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Max HR</div>
            </div>
          </div>

          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.elevation_gain_m ? `${(useImperial ? norm.elevation_gain_m * 3.28084 : norm.elevation_gain_m).toFixed(0)} ${useImperial ? 'ft' : 'm'}` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Elevation</div>
            </div>
          </div>

          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.avg_cycling_cadence_rpm ? `${norm.avg_cycling_cadence_rpm} rpm` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Cadence</div>
            </div>
          </div>

          {/* Row 5 - Calories, Workload, IF */}
          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.calories ? `${norm.calories}` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Calories</div>
            </div>
          </div>

          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {(workoutData as any)?.workload_actual || (workoutData as any)?.workload_planned || 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>Workload</div>
            </div>
          </div>

          <div className="px-0.5 py-1">
            <div className="text-base font-light text-foreground mb-0.5" style={{ ...metricValueBaseStyle, fontFeatureSettings: '"tnum"' }}>
              {norm.intensity_factor ? norm.intensity_factor.toFixed(2) : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              <div className="text-xs font-light" style={metricLabelStyle}>IF</div>
            </div>
          </div>

        </>
      ) : null}
       </div>
     )}
       </div>
     </div>

     {/* GPS ROUTE MAP & ELEVATION PROFILE SECTION - hidden for pool swims */}
     <div className="w-full">
       {/* Advanced synced viewer: Mapbox puck + interactive chart + splits */}
       {(() => {
         const isSwim = workoutData.swim_data;
         const hasLengths = Number((workoutData as any)?.number_of_active_lengths) > 0
           || (Array.isArray((workoutData as any)?.swim_data?.lengths) && (workoutData as any).swim_data.lengths.length > 0);
         const providerStr = String((workoutData as any)?.provider_sport || (workoutData as any)?.activity_type || (workoutData as any)?.name || '').toLowerCase();
         const openWaterHint = /open\s*water|ocean|ow\b/.test(providerStr);
         const poolHint = /lap|pool/.test(providerStr);
         const hasGps = Array.isArray((workoutData as any)?.gps_track) && (workoutData as any).gps_track.length > 10;
         const isPoolSwim = isSwim && (hasLengths || poolHint || (!openWaterHint && !hasGps));
        if (isPoolSwim) {
           return (
             <div className="mx-[-16px] px-3 py-2">
               <div className="text-sm text-muted-foreground">No route data (pool swim)</div>
             </div>
           );
         }
        // GOLDEN RULE: Wait for server to provide series data
        // For historical workouts: render with whatever data exists (graceful degradation)
        const series = (hydrated||workoutData)?.computed?.analysis?.series || null;
        
        // If no series at all, show loading state (processing in background)
        if (!series) {
          return (
            <div className="mt-6 mb-6 mx-[-16px] flex items-center justify-center" style={{ minHeight: 400 }}>
              <div className="text-center text-white/70">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white/30 mb-3"></div>
                <div className="text-base font-light mb-1">Processing workout data...</div>
                <div className="text-sm text-white/50 font-light">Charts will appear automatically when ready</div>
              </div>
            </div>
          );
        }
        
        // If series exists (even old format with only 'sampling' key), proceed
        // EffortsViewerMapbox will handle empty arrays gracefully

         const time_s = Array.isArray(series?.time_s) ? series.time_s : (Array.isArray(series?.time) ? series.time : []);
         const distance_m = Array.isArray(series?.distance_m) ? series.distance_m : [];
         const elev = Array.isArray(series?.elevation_m) ? series.elevation_m : [];
         const pace = Array.isArray(series?.pace_s_per_km) ? series.pace_s_per_km : [];
         const hr = Array.isArray(series?.hr_bpm) ? series.hr_bpm : [];
        // Trust server-provided series as single source of truth (no client-side fallbacks)
         const len = Math.min(distance_m.length, time_s.length || distance_m.length);
         const samples = (()=>{
           const out:any[] = [];
           let ema: number | null = null, lastE: number | null = null, lastD: number | null = null, lastT: number | null = null;
           const a = 0.2;
           for (let i=0;i<len;i++){
             const t = Number(time_s?.[i] ?? i) || 0;
             const d = Number(distance_m?.[i] ?? 0) || 0;
             const e = typeof elev?.[i] === 'number' ? Number(elev[i]) : null;
             if (e != null) ema = (ema==null ? e : a*e + (1-a)*ema);
             const es = (ema != null) ? ema : (e != null ? e : (lastE != null ? lastE : 0));
             let grade: number | null = null, vam: number | null = null;
             if (lastE != null && lastD != null && lastT != null){
               const dd = Math.max(1, d - lastD);
               const dh = es - lastE;
               const dt = Math.max(1, t - lastT);
               grade = dh / dd;
               vam = (dh/dt) * 3600;
             }
             out.push({
               t_s: t,
               d_m: d,
               elev_m_sm: es,
               pace_s_per_km: Number.isFinite(pace?.[i]) ? Number(pace[i]) : null,
               hr_bpm: Number.isFinite(hr?.[i]) ? Number(hr[i]) : null,
               grade,
               vam_m_per_h: vam
             });
             lastE = es; lastD = d; lastT = t;
           }
           return out;
         })();
         // Build GPS-derived track once (for route and optional elevation fallback)
         const gpsRaw = (hydrated||workoutData)?.gps_track;
        const gps = Array.isArray(gpsRaw)
          ? gpsRaw
          : (typeof gpsRaw === 'string' ? (()=>{ try { const v = JSON.parse(gpsRaw); return Array.isArray(v)? v : []; } catch { return []; } })() : []);
        const track = gps
          .map((p:any)=>{
            const lng = p.lng ?? p.longitudeInDegree ?? p.longitude ?? p.lon;
            const lat = p.lat ?? p.latitudeInDegree ?? p.latitude;
            if ([lng,lat].every((v)=>Number.isFinite(v))) return [Number(lng), Number(lat)] as [number,number];
            return null;
          })
          .filter(Boolean) as [number,number][];
        
        // Check if this is an indoor/treadmill workout (EffortsViewerMapbox will show placeholder)
        const workout = hydrated || workoutData;
        const isVirtual = isVirtualActivity(workout);
        
        // Additional check: if we have series data (sensor data) but no GPS track, it's likely a treadmill
        const hasValidSeries = finalSeries && 
          Array.isArray(finalSeries?.distance_m) && 
          finalSeries.distance_m.length > 1;
        const hasValidTrack = finalTrack && 
          Array.isArray(finalTrack) && 
          finalTrack.length > 1;
        
        // Strong indicator of treadmill: has sensor data (series) but no GPS track
        const isLikelyTreadmill = hasValidSeries && !hasValidTrack && 
          (workoutData.type === 'run' || workoutData.type === 'walk');
        
        // Check for explicit treadmill indicators
        const isTrainer = (workout as any)?.strava_data?.original_activity?.trainer === true;
        const providerSport = String((workout as any)?.provider_sport || (workout as any)?.activity_type || '').toLowerCase();
        const hasTreadmillIndicator = providerSport.includes('treadmill') || isTrainer;
        const hasStartPosition = Number.isFinite((workout as any)?.start_position_lat) && 
                                 (workout as any)?.start_position_lat !== 0;
        
        // Consider it virtual if: explicit indicators OR (likely treadmill AND no start position)
        // BUT: don't show placeholder if we're still loading GPS data (prevents flash)
        const shouldShowPlaceholder = !isHydrating && (isVirtual || hasTreadmillIndicator || (isLikelyTreadmill && !hasStartPosition));
        
        console.log('🗺️ [CompletedTab] Map render check:', {
          workoutId: (hydrated||workoutData)?.id,
          hasValidSeries,
          hasValidTrack,
          finalSeriesLength: finalSeries?.distance_m?.length || 0,
          finalTrackLength: finalTrack?.length || 0,
          hydratedHasSeries: !!hydrated?.computed?.analysis?.series,
          workoutDataHasSeries: !!workoutData?.computed?.analysis?.series,
          isVirtual,
          isLikelyTreadmill,
          shouldShowPlaceholder
        });
        
        // If still hydrating and no valid track yet, show spinner (prevents "No route data" flash)
        if (isHydrating && !hasValidTrack) {
          return (
            <div className="mt-6 mb-6 mx-[-16px] flex items-center justify-center" style={{ minHeight: 300 }}>
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-white/30"></div>
            </div>
          );
        }
        
        // Render map component for all workouts - it will show placeholder for indoor/treadmill
        // Only skip if we have no data AND it's not a virtual activity
        if (!shouldShowPlaceholder && !hasValidSeries && !hasValidTrack) {
          // Don't render map if no data
          console.log('⏭️ [CompletedTab] Skipping map render - no valid data');
          return null;
        }
        
        // Use memoized props computed at component level (prevents re-renders)
        // No client-side series transformation; use server-provided series as-is
        // If we should show placeholder, ensure workoutData is marked as virtual for EffortsViewerMapbox
        const mapWorkoutData = shouldShowPlaceholder && !isVirtual
          ? { ...mapProps.workoutData, gps_track: [] } // Force empty array to trigger placeholder
          : mapProps.workoutData;
        
        return (
          <div className="mt-6 mb-6 mx-[-16px]">
              <EffortsViewerMapbox
              samples={mapProps.samples}
              trackLngLat={mapProps.trackLngLat}
              useMiles={mapProps.useMiles}
              useFeet={mapProps.useFeet}
              compact={mapProps.compact}
              workoutData={mapWorkoutData}
              />
          </div>
        );
      })()}

      {/* Zones section (HR and Power) - render once */}
      {(() => {
        const zonesHr = (hydrated||workoutData)?.computed?.analysis?.zones?.hr;
        const zonesPower = (hydrated||workoutData)?.computed?.analysis?.zones?.power;
        const hasHRZones = zonesHr?.bins?.length;
        const hasPowerZones = zonesPower?.bins?.length;
        const isRide = String(workoutData?.type || '').toLowerCase().includes('ride') || String(workoutData?.type || '').toLowerCase().includes('bike');
        
        if (!hasHRZones && !hasPowerZones) return null;
        
        return (
          <div className="mt-6 mx-[-16px] px-3 py-3 space-y-4">
            {/* HR Zones */}
            {hasHRZones && (
              <div className="my-4">
                <HRZoneChart 
                  zoneDurationsSeconds={zonesHr.bins.map((b:any)=> Number(b.t_s)||0)} 
                  avgHr={norm.avg_hr ?? undefined}
                  maxHr={norm.max_hr ?? undefined}
                  title="Heart Rate Zones" 
                />
              </div>
            )}
            
            {/* Power Zones - only for rides with power data */}
            {hasPowerZones && isRide && (
              <div className="my-4">
                <PowerZoneChart 
                  zoneBins={zonesPower.bins.map((b:any)=> ({ 
                    i: Number(b.i) || 0,
                    t_s: Number(b.t_s) || 0,
                    min: Number(b.min) || 0,
                    max: Number(b.max) || 0
                  }))}
                  avgPower={norm.avg_power ?? undefined}
                  maxPower={norm.max_power ?? undefined}
                  title="Power Distribution" 
                />
              </div>
            )}
          </div>
        );
      })()}

      {(hydrated||workoutData)?.computed?.analysis?.events?.splits && (
        <div className="mt-6 mx-[-16px] px-3 py-3">
          {!useImperial && Array.isArray((hydrated||workoutData).computed.analysis.events.splits.km) && (hydrated||workoutData).computed.analysis.events.splits.km.length > 0 && (
            <div className="mb-2">
              <div className="text-sm mb-1">Splits · km</div>
              <div className="space-y-1">
                {(hydrated||workoutData).computed.analysis.events.splits.km.map((s:any) => (
                  <div key={`km-${s.n}`} className="flex items-baseline justify-between text-sm">
                    <div className="text-muted-foreground">{s.n}</div>
                    <div className="flex items-baseline gap-4">
                      {typeof s.avgHr_bpm === 'number' && <div className="text-muted-foreground">{s.avgHr_bpm} bpm</div>}
                      {typeof s.avgCadence_spm === 'number' && <div className="text-muted-foreground">{s.avgCadence_spm} spm</div>}
                      <div className="font-mono">{s.avgPace_s_per_km != null ? `${Math.floor(s.avgPace_s_per_km/60)}:${String(Math.round(s.avgPace_s_per_km%60)).padStart(2,'0')}/km` : '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VAM section removed; now a chart tab inside EffortsViewerMapbox */}
      {/* SEPARATE Power/Cadence Chart - at the bottom */}
      {(workoutData.swim_data || workoutData.ride_data) && (() => {
        // Try multiple data sources for sensor data
        let samples = [];
        if (Array.isArray((hydrated||workoutData)?.sensor_data?.samples)) {
          samples = (hydrated||workoutData).sensor_data.samples;
        } else if (Array.isArray((hydrated||workoutData)?.sensor_data)) {
          samples = (hydrated||workoutData).sensor_data;
        } else if (Array.isArray((hydrated||workoutData)?.time_series_data)) {
          samples = (hydrated||workoutData).time_series_data;
        }
        
        if (samples.length > 0) {
          // Extract power and cadence data
          const powerData = samples
            .map((s: any) => s.power || s.watts || null)
            .filter((p: any) => p !== null && p !== undefined);
          
          // Normalize cadence data
          const normalizeRunCadence = (v: any) => {
            let n = Number(v);
            if (!Number.isFinite(n)) return null;
            if (n < 10) n *= 60;     // steps/sec -> steps/min
            if (n < 130) n *= 2;     // strides/min -> steps/min
            return Math.round(n);
          };

          const pickCadenceSample = (s: any) => {
            // Prefer rpm if present
            const rpm = s.bikeCadence ?? s.cadence ?? null;
            if (Number.isFinite(rpm)) return Number(rpm); // rpm
            // Else derive spm
            const rc = s.runCadence ?? s.cadence ?? s.strideRate ?? s.stride_cadence;
            return normalizeRunCadence(rc);
          };

          const cadenceData = samples
            .map(s => pickCadenceSample(s))
            .filter(v => v != null);
          
          // Old Power/Cadence chart removed (now integrated into main viewer tabs)
        }
        return null;
      })()}
      {/* (Removed old mini zones histograms to avoid duplicate zones under splits) */}
      
      
      {/* Single page-level attribution for map tiles */}
      <div className="mx-[-16px] px-3 pt-2 pb-6">
        <small style={{ display: 'block', fontSize: 10, color: '#9aa6b2' }}>
          © <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">MapTiler</a>
          &nbsp;•&nbsp;
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>
        </small>
      </div>
    </div>
   </>
 );
};

// --- Training Effect helpers ---
const getTrainingEffect = (workoutData: any) => {
  const aerobic = (workoutData as any)?.metrics?.total_training_effect ?? (workoutData as any)?.total_training_effect ?? null;
  const anaerobic = (workoutData as any)?.metrics?.total_anaerobic_effect ?? (workoutData as any)?.total_anaerobic_effect ?? null;
  return {
    aerobic: Number.isFinite(aerobic) ? Number(aerobic) : null,
    anaerobic: Number.isFinite(anaerobic) ? Number(anaerobic) : null,
  };
};

// --- Running dynamics rollups (avg from samples when available) ---
const getRunDynamics = (hydrated: any) => {
  const samples = Array.isArray((hydrated as any)?.sensor_data?.samples)
    ? (hydrated as any).sensor_data.samples
    : (Array.isArray((hydrated as any)?.sensor_data) ? (hydrated as any).sensor_data : []);
  if (!Array.isArray(samples) || samples.length < 5) return null;
  const take = (keyList: string[], scale: (n:number)=>number = (n)=>n) => {
    const vals = samples
      .map((s:any)=>{
        for (const k of keyList) {
          const v = (s as any)[k]; if (Number.isFinite(v)) return scale(Number(v));
        }
        return NaN;
      })
      .filter((n:number)=>Number.isFinite(n));
    if (vals.length < 5) return null;
    return vals.reduce((a:number,b:number)=>a+b,0)/vals.length;
  };
  const gct_ms = take(['groundContactTimeMs','ground_contact_time_ms']);
  const vo_mm = take(['verticalOscillationMm','vertical_oscillation_mm']);
  const vr_ratio = take(['verticalRatio','vertical_ratio']);
  const balance = take(['leftRightBalance','run_balance','left_right_balance']);
  const any = [gct_ms,vo_mm,vr_ratio,balance].some(v=>Number.isFinite(v as any));
  if (!any) return null;
  return { gct_ms, vo_mm, vr_ratio, balance };
};

// --- Power presence ---
const getPowerSummary = (workoutData: any, hydrated: any) => {
  const avg = (workoutData as any)?.avg_power ?? (workoutData as any)?.metrics?.avg_power ?? null;
  const max = (workoutData as any)?.max_power ?? (workoutData as any)?.metrics?.max_power ?? null;
  const np = (workoutData as any)?.normalized_power ?? (workoutData as any)?.metrics?.normalized_power ?? null;
  const weightKg = (()=>{
    const w = (workoutData as any)?.weight; // kg expected if from Garmin
    return Number.isFinite(w) ? Number(w) : null;
  })();
  const wkg = Number.isFinite(avg) && Number.isFinite(weightKg) && (weightKg as number) > 0 ? (Number(avg)/Number(weightKg)) : null;
  const zones = (hydrated as any)?.computed?.analysis?.zones?.power ?? null;
  const hasAny = [avg,max,np,wkg].some(v=>Number.isFinite(v as any)) || !!zones;
  if (!hasAny) return null;
  return { avg, max, np, wkg, zones };
};

export default CompletedTab;
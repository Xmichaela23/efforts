import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Calculator, History, BarChart3, Zap, Link2, RefreshCw, Activity } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { 
  calculateWorkloadForWorkout, 
  sweepUserHistory, 
  getWorkloadStats,
  getWeeklyWorkloadSummary 
} from '@/services/workloadService';

export default function WorkloadAdmin() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [batchSize, setBatchSize] = useState(100);
  const [dryRun, setDryRun] = useState(true);
  const [user, setUser] = useState<any>(null);
  
  // Power curve backfill state
  const [powerCurveLoading, setPowerCurveLoading] = useState(false);
  const [powerCurveDaysBack, setPowerCurveDaysBack] = useState(60);
  const [powerCurveDryRun, setPowerCurveDryRun] = useState(true);
  const [powerCurveOffset, setPowerCurveOffset] = useState(0);

  // Reassociate workouts state
  const [reassociateLoading, setReassociateLoading] = useState(false);
  const [reassociateDryRun, setReassociateDryRun] = useState(true);
  const [plans, setPlans] = useState<any[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');

  // Process workouts state
  const [processWorkoutsLoading, setProcessWorkoutsLoading] = useState(false);

  // Adaptation backfill state
  const [adaptationLoading, setAdaptationLoading] = useState(false);
  const [adaptationDaysBack, setAdaptationDaysBack] = useState(183);
  const [adaptationDryRun, setAdaptationDryRun] = useState(true);
  const [adaptationLimit, setAdaptationLimit] = useState(25);
  const [adaptationOffset, setAdaptationOffset] = useState(0);
  const [adaptationForceRecompute, setAdaptationForceRecompute] = useState(true);

  // Bulk reanalyze state
  const [reanalyzeLoading, setReanalyzeLoading] = useState(false);
  const [reanalyzeDaysBack, setReanalyzeDaysBack] = useState(180);
  const [reanalyzeDryRun, setReanalyzeDryRun] = useState(true);
  const [reanalyzeLimit, setReanalyzeLimit] = useState(10);
  const [reanalyzeOffset, setReanalyzeOffset] = useState(0);
  const [reanalyzeWorkoutType, setReanalyzeWorkoutType] = useState<string>('run');
  const [reanalyzeFilter, setReanalyzeFilter] = useState<string>('missing_hr_drift');

  useEffect(() => {
    const getUser = async () => {
      setPlansLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      console.log('👤 Admin user:', user?.id);
      
      // Load user's plans
      if (user) {
        const { data: userPlans, error } = await supabase
          .from('plans')
          .select('id, name, config, status')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        console.log('📋 Plans loaded:', userPlans?.length, 'plans:', userPlans, 'error:', error);
        if (error) {
          console.error('Plans fetch error:', error);
        }
        setPlans(userPlans || []);
      }
      setPlansLoading(false);
    };
    getUser();
  }, []);

  const handlePowerCurveBackfill = async (offset = 0) => {
    if (!user?.id) return;
    
    setPowerCurveLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-power-curves', {
        body: {
          days_back: powerCurveDaysBack,
          dry_run: powerCurveDryRun,
          limit: 10, // Process 10 at a time to avoid timeout
          offset
        }
      });

      if (error) {
        throw error;
      }

      setResults(data);
      
      // Update offset for next batch
      if (data?.next_offset) {
        setPowerCurveOffset(data.next_offset);
      } else {
        setPowerCurveOffset(0); // Reset when done
      }
    } catch (error: any) {
      console.error('Power curve backfill failed:', error);
      setResults({ error: error.message });
    } finally {
      setPowerCurveLoading(false);
    }
  };

  const handleAdaptationBackfill = async (offset = 0) => {
    if (!user?.id) return;
    setAdaptationLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-adaptation-metrics', {
        body: {
          days_back: adaptationDaysBack,
          dry_run: adaptationDryRun,
          limit: adaptationLimit,
          offset,
          force_recompute: adaptationForceRecompute
        }
      });

      if (error) throw error;

      setResults(data);
      if (data?.next_offset != null) setAdaptationOffset(data.next_offset);
      else setAdaptationOffset(0);
    } catch (e: any) {
      console.error('Adaptation backfill failed:', e);
      setResults({ error: e?.message || String(e) });
    } finally {
      setAdaptationLoading(false);
    }
  };

  const handleBulkReanalyze = async (offset = 0) => {
    if (!user?.id) return;
    setReanalyzeLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('bulk-reanalyze-workouts', {
        body: {
          days_back: reanalyzeDaysBack,
          workout_type: reanalyzeWorkoutType,
          dry_run: reanalyzeDryRun,
          limit: reanalyzeLimit,
          offset,
          filter: reanalyzeFilter
        }
      });

      if (error) throw error;

      setResults(data);
      if (data?.next_offset != null) setReanalyzeOffset(data.next_offset);
      else setReanalyzeOffset(0);
    } catch (e: any) {
      console.error('Bulk reanalyze failed:', e);
      setResults({ error: e?.message || String(e) });
    } finally {
      setReanalyzeLoading(false);
    }
  };

  // Auto-process all batches until done
  const handleBulkReanalyzeAll = async () => {
    if (!user?.id || reanalyzeDryRun) return;
    setReanalyzeLoading(true);
    
    let currentOffset = 0;
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalErrors = 0;
    let batchCount = 0;
    
    try {
      while (true) {
        batchCount++;
        setResults({ 
          processing: true, 
          batch: batchCount, 
          offset: currentOffset,
          total_processed: totalProcessed,
          success: totalSuccess,
          errors: totalErrors,
          message: `Processing batch ${batchCount} (offset ${currentOffset})...`
        });
        
        const { data, error } = await supabase.functions.invoke('bulk-reanalyze-workouts', {
          body: {
            days_back: reanalyzeDaysBack,
            workout_type: reanalyzeWorkoutType,
            dry_run: false,
            limit: reanalyzeLimit,
            offset: currentOffset,
            filter: reanalyzeFilter
          }
        });

        if (error) throw error;
        
        totalProcessed += data?.processed || 0;
        totalSuccess += data?.success || 0;
        totalErrors += data?.errors || 0;
        
        if (!data?.has_more) {
          // Done!
          setResults({
            processing: false,
            completed: true,
            batches: batchCount,
            total_processed: totalProcessed,
            success: totalSuccess,
            errors: totalErrors,
            message: `✅ All done! Processed ${totalProcessed} workouts in ${batchCount} batches.`
          });
          setReanalyzeOffset(0);
          break;
        }
        
        currentOffset = data.next_offset;
        
        // Small delay between batches to avoid overwhelming the server
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e: any) {
      console.error('Bulk reanalyze all failed:', e);
      setResults({ 
        error: e?.message || String(e),
        batches_completed: batchCount - 1,
        total_processed: totalProcessed,
        success: totalSuccess,
        errors: totalErrors
      });
    } finally {
      setReanalyzeLoading(false);
    }
  };

  const handleSweepHistory = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const result = await sweepUserHistory({
        user_id: user.id,
        batch_size: batchSize,
        dry_run: dryRun
      });
      setResults(result);
    } catch (error) {
      console.error('Sweep failed:', error);
      setResults({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleGetStats = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const stats = await getWorkloadStats(user.id);
      setResults(stats);
    } catch (error) {
      console.error('Stats failed:', error);
      setResults({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleGetWeeklySummary = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekStartStr = weekStart.toISOString().split('T')[0];
      
      const summary = await getWeeklyWorkloadSummary(user.id, weekStartStr);
      setResults(summary);
    } catch (error) {
      console.error('Weekly summary failed:', error);
      setResults({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleReassociateWorkouts = async () => {
    if (!user?.id || !selectedPlanId) return;
    
    setReassociateLoading(true);
    console.log('🔗 Calling reassociate with plan_id:', selectedPlanId, 'dry_run:', reassociateDryRun);
    try {
      const { data, error } = await supabase.functions.invoke('reassociate-workouts', {
        body: {
          plan_id: selectedPlanId,
          dry_run: reassociateDryRun
        }
      });

      console.log('🔗 Reassociate response:', { data, error });
      
      if (error) {
        // Try to get the actual response body from the error
        let errorMessage = 'Unknown error';
        try {
          // FunctionsHttpError has a context with the response
          if ((error as any).context?.body) {
            const bodyText = await (error as any).context.body.text();
            console.error('Error body:', bodyText);
            errorMessage = bodyText;
          } else if ((error as any).message) {
            errorMessage = (error as any).message;
          }
        } catch (e) {
          console.error('Could not parse error body:', e);
          errorMessage = JSON.stringify(error);
        }
        console.error('Reassociate error:', errorMessage);
        setResults({ error: errorMessage });
        return;
      }

      setResults(data);
    } catch (error: any) {
      console.error('Reassociate failed:', error);
      setResults({ error: error.message || String(error) });
    } finally {
      setReassociateLoading(false);
    }
  };

  const handleProcessWorkouts = async () => {
    if (!user?.id) return;
    
    setProcessWorkoutsLoading(true);
    try {
      const processableTypes = ['run', 'running', 'ride', 'cycling', 'bike', 'swim'];

      // Grab a recent window and filter client-side for "needs series"
      const { data: recentWorkouts, error: recentErr } = await supabase
        .from('workouts')
        .select('id, date, type, workout_status, computed, sensor_data, gps_track')
        .eq('user_id', user.id)
        .eq('workout_status', 'completed')
        .in('type', processableTypes)
        .order('date', { ascending: false })
        .limit(150);

      if (recentErr) throw recentErr;

      const safeParseJson = (v: any) => {
        if (v == null) return null;
        if (typeof v === 'string') {
          try {
            return JSON.parse(v);
          } catch {
            return null;
          }
        }
        return v;
      };

      const needsSeries = (w: any): boolean => {
        const sensor = safeParseJson(w.sensor_data);
        const gps = safeParseJson(w.gps_track);
        // must have some source data to build series
        if (!sensor && !gps) return false;

        const computed = safeParseJson(w.computed) || {};
        const series = computed?.analysis?.series;
        if (!series) return true;

        const dist = series?.distance_m;
        if (!Array.isArray(dist)) return true;
        return dist.length < 2;
      };

      const candidates = (recentWorkouts || []).filter(needsSeries).slice(0, 10);
      const workoutIds = candidates.map((w: any) => w.id);
      if (workoutIds.length === 0) {
        setResults({
          processed: 0,
          success: 0,
          errors: 0,
          message: 'No recent workouts found that are missing computed.analysis.series.'
        });
        return;
      }

      const results: Array<{ id: string; status: string; error?: string }> = [];

      for (const workoutId of workoutIds) {
        try {
          const { error } = await supabase.functions.invoke('compute-workout-analysis', {
            body: { workout_id: workoutId }
          });

          if (error) {
            let errorMessage = error.message || 'Unknown error';
            try {
              const ctx = (error as any)?.context;
              if (ctx?.body?.text) {
                const bodyText = await ctx.body.text();
                if (bodyText) errorMessage = bodyText;
              }
            } catch {
              // ignore parsing errors
            }
            results.push({ id: workoutId, status: 'error', error: errorMessage });
          } else {
            results.push({ id: workoutId, status: 'success' });
          }

          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err: any) {
          results.push({ id: workoutId, status: 'error', error: err.message });
        }
      }

      const successCount = results.filter(r => r.status === 'success').length;
      const errorCount = results.filter(r => r.status === 'error').length;

      setResults({
        selected: candidates.map((w: any) => ({ id: w.id, date: w.date, type: w.type })),
        processed: results.length,
        success: successCount,
        errors: errorCount,
        results
      });
    } catch (error: any) {
      console.error('Process workouts failed:', error);
      setResults({ error: error.message || String(error) });
    } finally {
      setProcessWorkoutsLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Calculator className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Admin Tools</h1>
      </div>

      <div className="max-w-md space-y-6">
        
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ANALYSIS & BACKFILL */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
            Analysis & Backfill
          </h2>

          {/* Bulk Re-analyze Workouts - FIRST (most used) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <RefreshCw className="h-4 w-4" />
                Bulk Re-analyze Workouts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Re-run analysis to populate HR drift, terrain metrics. Use after system updates.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="reanalyzeDaysBack" className="text-xs">Days Back</Label>
                  <Input
                    id="reanalyzeDaysBack"
                    type="number"
                    value={reanalyzeDaysBack}
                    onChange={(e) => setReanalyzeDaysBack(parseInt(e.target.value) || 180)}
                    min="7"
                    max="730"
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reanalyzeLimit" className="text-xs">Batch</Label>
                  <Input
                    id="reanalyzeLimit"
                    type="number"
                    value={reanalyzeLimit}
                    onChange={(e) => setReanalyzeLimit(parseInt(e.target.value) || 10)}
                    min="1"
                    max="25"
                    className="h-8"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Select value={reanalyzeWorkoutType} onValueChange={setReanalyzeWorkoutType}>
                  <SelectTrigger className="bg-white/10 border-white/20 h-8 text-xs">
                    <SelectValue placeholder="Type..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-white/20 shadow-xl z-50">
                    <SelectItem value="run">Runs</SelectItem>
                    <SelectItem value="strength">Strength</SelectItem>
                    <SelectItem value="cycling">Cycling</SelectItem>
                    <SelectItem value="swim">Swimming</SelectItem>
                    <SelectItem value="all">All Types</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={reanalyzeFilter} onValueChange={setReanalyzeFilter}>
                  <SelectTrigger className="bg-white/10 border-white/20 h-8 text-xs">
                    <SelectValue placeholder="Filter..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-white/20 shadow-xl z-50">
                    <SelectItem value="missing_hr_drift">Missing HR Drift</SelectItem>
                    <SelectItem value="missing_analysis">Missing Analysis</SelectItem>
                    <SelectItem value="all">All Workouts</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="reanalyzeDryRun"
                  checked={reanalyzeDryRun}
                  onCheckedChange={(checked) => setReanalyzeDryRun(checked as boolean)}
                />
                <Label htmlFor="reanalyzeDryRun" className="text-xs">Dry Run</Label>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => handleBulkReanalyze(0)}
                  disabled={reanalyzeLoading}
                  size="sm"
                  className="flex-1"
                >
                  {reanalyzeLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  {reanalyzeDryRun ? 'Preview' : 'Run Batch'}
                </Button>
                <Button
                  onClick={() => handleBulkReanalyze(reanalyzeOffset)}
                  disabled={reanalyzeLoading || !reanalyzeOffset}
                  variant="secondary"
                  size="sm"
                >
                  Next
                </Button>
              </div>
              
              {!reanalyzeDryRun && (
                <Button
                  onClick={handleBulkReanalyzeAll}
                  disabled={reanalyzeLoading}
                  size="sm"
                  variant="default"
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {reanalyzeLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  Process All (Auto)
                </Button>
              )}
              
              {reanalyzeOffset > 0 && (
                <p className="text-xs text-white/40">Offset: {reanalyzeOffset}</p>
              )}
            </CardContent>
          </Card>

          {/* Adaptation Metrics */}
          <Card className="mt-3">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4" />
                Adaptation Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Populate workouts.computed.adaptation for performance trends.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="adaptationDaysBack" className="text-xs">Days Back</Label>
                  <Input
                    id="adaptationDaysBack"
                    type="number"
                    value={adaptationDaysBack}
                    onChange={(e) => setAdaptationDaysBack(parseInt(e.target.value) || 183)}
                    min="7"
                    max="365"
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="adaptationLimit" className="text-xs">Batch</Label>
                  <Input
                    id="adaptationLimit"
                    type="number"
                    value={adaptationLimit}
                    onChange={(e) => setAdaptationLimit(parseInt(e.target.value) || 25)}
                    min="1"
                    max="50"
                    className="h-8"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="adaptationDryRun"
                    checked={adaptationDryRun}
                    onCheckedChange={(checked) => setAdaptationDryRun(checked as boolean)}
                  />
                  <Label htmlFor="adaptationDryRun" className="text-xs">Dry Run</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="adaptationForceRecompute"
                    checked={adaptationForceRecompute}
                    onCheckedChange={(checked) => setAdaptationForceRecompute(checked as boolean)}
                  />
                  <Label htmlFor="adaptationForceRecompute" className="text-xs">Force</Label>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => handleAdaptationBackfill(0)}
                  disabled={adaptationLoading}
                  size="sm"
                  className="flex-1"
                >
                  {adaptationLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Activity className="h-3 w-3 mr-1" />}
                  {adaptationDryRun ? 'Preview' : 'Run'}
                </Button>
                <Button
                  onClick={() => handleAdaptationBackfill(adaptationOffset)}
                  disabled={adaptationLoading || !adaptationOffset}
                  variant="secondary"
                  size="sm"
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Power Curve */}
          <Card className="mt-3">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="h-4 w-4" />
                Power Curves & Best Efforts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Recalculate power curves (bikes) and best efforts (runs).
              </p>

              <div className="space-y-1">
                <Label htmlFor="powerCurveDaysBack" className="text-xs">Days Back</Label>
                <Input
                  id="powerCurveDaysBack"
                  type="number"
                  value={powerCurveDaysBack}
                  onChange={(e) => setPowerCurveDaysBack(parseInt(e.target.value) || 60)}
                  min="7"
                  max="365"
                  className="h-8"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="powerCurveDryRun"
                  checked={powerCurveDryRun}
                  onCheckedChange={(checked) => setPowerCurveDryRun(checked as boolean)}
                />
                <Label htmlFor="powerCurveDryRun" className="text-xs">Dry Run</Label>
              </div>

              <Button
                onClick={() => handlePowerCurveBackfill(0)}
                disabled={powerCurveLoading}
                size="sm"
                className="w-full"
              >
                {powerCurveLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                {powerCurveDryRun ? 'Preview' : 'Run Batch'}
              </Button>
            </CardContent>
          </Card>

          {/* Process Workouts */}
          <Card className="mt-3">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4" />
                Process Chart Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Generate chart series data for workouts missing it.
              </p>
              <Button
                onClick={handleProcessWorkouts}
                disabled={processWorkoutsLoading}
                size="sm"
                className="w-full"
              >
                {processWorkoutsLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <BarChart3 className="h-3 w-3 mr-1" />}
                Process Last 10
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PLAN MANAGEMENT */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
            Plan Management
          </h2>

          {/* Reassociate Workouts */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4" />
                Re-associate Workouts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Link logged workouts to a plan. Use after recreating a plan.
              </p>

              <div className="space-y-1">
                <Label htmlFor="planSelect" className="text-xs">Target Plan</Label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId} disabled={plansLoading}>
                  <SelectTrigger className="bg-white/10 border-white/20 h-8 text-xs">
                    <SelectValue placeholder={plansLoading ? "Loading..." : "Select plan..."} />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-white/20 shadow-xl z-50">
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} {plan.status === 'active' && '✓'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-white/40">{plans.length} plans</p>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="reassociateDryRun"
                  checked={reassociateDryRun}
                  onCheckedChange={(checked) => setReassociateDryRun(checked as boolean)}
                />
                <Label htmlFor="reassociateDryRun" className="text-xs">Dry Run</Label>
              </div>

              <Button
                onClick={handleReassociateWorkouts}
                disabled={reassociateLoading || !selectedPlanId}
                size="sm"
                className="w-full"
              >
                {reassociateLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Link2 className="h-3 w-3 mr-1" />}
                {reassociateDryRun ? 'Preview' : 'Re-associate'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* WORKLOAD */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
            Workload
          </h2>

          {/* Historical Sweep */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" />
                Historical Sweep
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Recalculate workload for all historical workouts.
              </p>

              <div className="space-y-1">
                <Label htmlFor="batchSize" className="text-xs">Batch Size</Label>
                <Input
                  id="batchSize"
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value) || 100)}
                  min="1"
                  max="1000"
                  className="h-8"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="dryRun"
                  checked={dryRun}
                  onCheckedChange={(checked) => setDryRun(checked as boolean)}
                />
                <Label htmlFor="dryRun" className="text-xs">Dry Run</Label>
              </div>

              <Button
                onClick={handleSweepHistory}
                disabled={loading}
                size="sm"
                className="w-full"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <History className="h-3 w-3 mr-1" />}
                Sweep History
              </Button>
            </CardContent>
          </Card>
        </div>

      </div>

      {/* Results */}
      {results && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Results</span>
              {results.dry_run !== undefined && (
                <span className={`text-xs px-2 py-1 rounded ${results.dry_run ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                  {results.dry_run ? 'DRY RUN' : 'EXECUTED'}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Reassociate summary stats */}
            {results.summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-white">{results.summary.logged_workouts_found}</div>
                  <div className="text-xs text-white/60">Logged</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-teal-400">{results.summary.matches_found}</div>
                  <div className="text-xs text-white/60">Matched</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-amber-400">{results.summary.to_update}</div>
                  <div className="text-xs text-white/60">To Update</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-green-400">{results.summary.updated || results.summary.already_linked}</div>
                  <div className="text-xs text-white/60">{results.dry_run ? 'Already Linked' : 'Updated'}</div>
                </div>
              </div>
            )}

            {/* Reassociate matches list */}
            {results.matches && results.matches.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-white/70 hover:text-white">
                  View {results.matches.length} matches
                </summary>
                <div className="mt-2 max-h-64 overflow-y-auto bg-black/30 rounded-lg p-3">
                  {results.matches.map((m: any) => (
                    <div key={m.logged_id} className="flex items-center gap-2 py-1 text-sm border-b border-white/10 last:border-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.already_linked ? 'bg-green-400' : 'bg-amber-400'}`} />
                      <span className="text-white/80 truncate flex-1">{m.logged_name}</span>
                      <span className="text-white/40 text-xs">{m.logged_date}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${m.already_linked ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {m.already_linked ? '✓' : '→'}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Unmatched workouts */}
            {results.unmatched && results.unmatched.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-red-400/70 hover:text-red-400">
                  {results.unmatched.length} unmatched (no planned workout found)
                </summary>
                <div className="mt-2 max-h-40 overflow-y-auto bg-red-500/10 rounded-lg p-3">
                  {results.unmatched.map((u: any) => (
                    <div key={u.logged_id} className="flex items-center gap-2 py-1 text-sm border-b border-white/10 last:border-0">
                      <span className="text-white/60 truncate flex-1">{u.logged_name}</span>
                      <span className="text-white/40 text-xs">{u.logged_date}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Legacy summary stats (for other functions) */}
            {results.total_workouts !== undefined && !results.summary && (
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-white">{results.total_workouts}</div>
                  <div className="text-xs text-white/60">Total Found</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-teal-400">{results.needs_backfill}</div>
                  <div className="text-xs text-white/60">Need Backfill</div>
                </div>
                {results.success !== undefined && (
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-green-400">{results.success}</div>
                    <div className="text-xs text-white/60">Completed</div>
                  </div>
                )}
              </div>
            )}
            
            {/* Workout list (collapsed by default for long lists) */}
            {results.workouts && results.workouts.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-white/70 hover:text-white">
                  View {results.workouts.length} workouts
                </summary>
                <div className="mt-2 max-h-64 overflow-y-auto bg-black/30 rounded-lg p-3">
                  {results.workouts.map((w: any) => (
                    <div key={w.id} className="flex items-center gap-2 py-1 text-sm border-b border-white/10 last:border-0">
                      <span className={`w-2 h-2 rounded-full ${w.type === 'run' ? 'bg-teal-400' : 'bg-green-400'}`} />
                      <span className="text-white/80 truncate flex-1">{w.name}</span>
                      <span className="text-white/40 text-xs">{w.date}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Continue button for pagination */}
            {results.has_more && !results.dry_run && (
              <div className="mt-4">
                <Button 
                  onClick={() => handlePowerCurveBackfill(results.next_offset)}
                  disabled={powerCurveLoading}
                  className="w-full"
                  variant="outline"
                >
                  {powerCurveLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Continue (Next Batch from offset {results.next_offset})
                </Button>
                <p className="text-xs text-white/50 text-center mt-2">
                  {results.message}
                </p>
              </div>
            )}
            
            {/* Success message */}
            {results.message && !results.has_more && !results.dry_run && (
              <div className="mt-4 bg-green-500/20 text-green-400 p-3 rounded-lg text-sm text-center">
                ✓ {results.message}
              </div>
            )}

            {/* Error display */}
            {results.error && (
              <div className="bg-red-500/20 text-red-400 p-3 rounded-lg text-sm">
                {results.error}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

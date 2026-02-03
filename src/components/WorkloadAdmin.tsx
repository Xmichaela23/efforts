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
  const [reanalyzeDaysBack, setReanalyzeDaysBack] = useState(90);
  const [reanalyzeDryRun, setReanalyzeDryRun] = useState(true);
  const [reanalyzeLimit, setReanalyzeLimit] = useState(5);
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
        <h1 className="text-2xl font-bold">Workload Administration</h1>
      </div>

      <div className="max-w-md">
        {/* Historical Sweep */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historical Sweep
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="batchSize">Batch Size</Label>
              <Input
                id="batchSize"
                type="number"
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value) || 100)}
                min="1"
                max="1000"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="dryRun"
                checked={dryRun}
                onCheckedChange={(checked) => setDryRun(checked as boolean)}
              />
              <Label htmlFor="dryRun">Dry Run (don't update database)</Label>
            </div>

            <Button 
              onClick={handleSweepHistory} 
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <History className="h-4 w-4 mr-2" />
              )}
              Sweep User History
            </Button>
          </CardContent>
        </Card>

        {/* Reassociate Workouts */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Re-associate Workouts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Link existing logged workouts to a new plan. Use after deleting and recreating
              a plan to reconnect your workout history.
            </p>
            
            <div className="space-y-2">
              <Label htmlFor="planSelect">Target Plan {plansLoading && '(loading...)'}</Label>
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId} disabled={plansLoading}>
                <SelectTrigger className="bg-white/10 border-white/20">
                  <SelectValue placeholder={plansLoading ? "Loading plans..." : "Select a plan..."} />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border border-white/20 shadow-xl z-50">
                  {plansLoading ? (
                    <SelectItem value="_loading" disabled>Loading...</SelectItem>
                  ) : plans.length === 0 ? (
                    <SelectItem value="_none" disabled>No plans found</SelectItem>
                  ) : (
                    plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id} className="hover:bg-white/10">
                        {plan.name} {plan.status === 'active' && '(active)'}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-white/40">Found {plans.length} plans</p>
              {selectedPlanId && plans.find(p => p.id === selectedPlanId)?.config && (
                <p className="text-xs text-white/50">
                  {plans.find(p => p.id === selectedPlanId)?.config?.user_selected_start_date} → {plans.find(p => p.id === selectedPlanId)?.config?.race_date}
                </p>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="reassociateDryRun"
                checked={reassociateDryRun}
                onCheckedChange={(checked) => setReassociateDryRun(checked as boolean)}
              />
              <Label htmlFor="reassociateDryRun">Dry Run (preview only)</Label>
            </div>

            <Button 
              onClick={handleReassociateWorkouts} 
              disabled={reassociateLoading || !selectedPlanId}
              className="w-full"
            >
              {reassociateLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Link2 className="h-4 w-4 mr-2" />
              )}
              {reassociateDryRun ? 'Preview Re-association' : 'Re-associate Workouts'}
            </Button>
          </CardContent>
        </Card>

        {/* Power Curve Backfill */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Power Curve Backfill
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Recalculate power curves (bikes) and best efforts (runs) for existing workouts.
              Required for accurate Block tab performance trends.
            </p>
            
            <div className="space-y-2">
              <Label htmlFor="powerCurveDaysBack">Days Back</Label>
              <Input
                id="powerCurveDaysBack"
                type="number"
                value={powerCurveDaysBack}
                onChange={(e) => setPowerCurveDaysBack(parseInt(e.target.value) || 60)}
                min="7"
                max="365"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="powerCurveDryRun"
                checked={powerCurveDryRun}
                onCheckedChange={(checked) => setPowerCurveDryRun(checked as boolean)}
              />
              <Label htmlFor="powerCurveDryRun">Dry Run (preview only)</Label>
            </div>

            <Button 
              onClick={() => handlePowerCurveBackfill(0)} 
              disabled={powerCurveLoading}
              className="w-full"
            >
              {powerCurveLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              {powerCurveDryRun ? 'Preview Backfill' : 'Run Backfill (Batch of 10)'}
            </Button>
          </CardContent>
        </Card>

        {/* Adaptation Metrics Backfill */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Adaptation Metrics Backfill
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Populate workouts.computed.adaptation (cheap lane) for the last N days. Run in small batches to avoid timeouts.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="adaptationDaysBack">Days Back</Label>
                <Input
                  id="adaptationDaysBack"
                  type="number"
                  value={adaptationDaysBack}
                  onChange={(e) => setAdaptationDaysBack(parseInt(e.target.value) || 183)}
                  min="7"
                  max="365"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adaptationLimit">Batch size</Label>
                <Input
                  id="adaptationLimit"
                  type="number"
                  value={adaptationLimit}
                  onChange={(e) => setAdaptationLimit(parseInt(e.target.value) || 25)}
                  min="1"
                  max="50"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="adaptationDryRun"
                checked={adaptationDryRun}
                onCheckedChange={(checked) => setAdaptationDryRun(checked as boolean)}
              />
              <Label htmlFor="adaptationDryRun">Dry Run (preview only)</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="adaptationForceRecompute"
                checked={adaptationForceRecompute}
                onCheckedChange={(checked) => setAdaptationForceRecompute(checked as boolean)}
              />
              <Label htmlFor="adaptationForceRecompute">Recompute existing (fix null/non-comparable)</Label>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => handleAdaptationBackfill(0)}
                disabled={adaptationLoading}
                className="flex-1"
              >
                {adaptationLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Activity className="h-4 w-4 mr-2" />
                )}
                {adaptationDryRun ? 'Preview Backfill' : 'Run Backfill (Batch)'}
              </Button>

              <Button
                onClick={() => handleAdaptationBackfill(adaptationOffset)}
                disabled={adaptationLoading || !adaptationOffset}
                variant="secondary"
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Re-analyze Workouts */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Bulk Re-analyze Workouts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Re-run workout analysis to populate new fields (HR drift, terrain-adjusted metrics).
              Use after system updates to backfill historical data.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="reanalyzeDaysBack">Days Back</Label>
                <Input
                  id="reanalyzeDaysBack"
                  type="number"
                  value={reanalyzeDaysBack}
                  onChange={(e) => setReanalyzeDaysBack(parseInt(e.target.value) || 90)}
                  min="7"
                  max="365"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reanalyzeLimit">Batch size</Label>
                <Input
                  id="reanalyzeLimit"
                  type="number"
                  value={reanalyzeLimit}
                  onChange={(e) => setReanalyzeLimit(parseInt(e.target.value) || 5)}
                  min="1"
                  max="10"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="reanalyzeWorkoutType">Workout Type</Label>
                <Select value={reanalyzeWorkoutType} onValueChange={setReanalyzeWorkoutType}>
                  <SelectTrigger className="bg-white/10 border-white/20">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-white/20 shadow-xl z-50">
                    <SelectItem value="run" className="hover:bg-white/10">Runs</SelectItem>
                    <SelectItem value="strength" className="hover:bg-white/10">Strength</SelectItem>
                    <SelectItem value="cycling" className="hover:bg-white/10">Cycling</SelectItem>
                    <SelectItem value="swim" className="hover:bg-white/10">Swimming</SelectItem>
                    <SelectItem value="all" className="hover:bg-white/10">All Types</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reanalyzeFilter">Filter</Label>
                <Select value={reanalyzeFilter} onValueChange={setReanalyzeFilter}>
                  <SelectTrigger className="bg-white/10 border-white/20">
                    <SelectValue placeholder="Select filter..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border border-white/20 shadow-xl z-50">
                    <SelectItem value="missing_hr_drift" className="hover:bg-white/10">Missing HR Drift</SelectItem>
                    <SelectItem value="missing_analysis" className="hover:bg-white/10">Missing Analysis</SelectItem>
                    <SelectItem value="all" className="hover:bg-white/10">All Workouts</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="reanalyzeDryRun"
                checked={reanalyzeDryRun}
                onCheckedChange={(checked) => setReanalyzeDryRun(checked as boolean)}
              />
              <Label htmlFor="reanalyzeDryRun">Dry Run (preview only)</Label>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => handleBulkReanalyze(0)}
                disabled={reanalyzeLoading}
                className="flex-1"
              >
                {reanalyzeLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {reanalyzeDryRun ? 'Preview Re-analysis' : 'Run Re-analysis (Batch)'}
              </Button>

              <Button
                onClick={() => handleBulkReanalyze(reanalyzeOffset)}
                disabled={reanalyzeLoading || !reanalyzeOffset}
                variant="secondary"
              >
                Next
              </Button>
            </div>

            {reanalyzeOffset > 0 && (
              <p className="text-xs text-white/40">Current offset: {reanalyzeOffset}</p>
            )}
          </CardContent>
        </Card>

        {/* Process Workouts */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Process Workouts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Process the last 10 workouts that need computed.analysis.series data.
              This generates chart data for workouts that are missing it.
            </p>

            <Button 
              onClick={handleProcessWorkouts} 
              disabled={processWorkoutsLoading}
              className="w-full"
            >
              {processWorkoutsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Process Last 10 Workouts
            </Button>
          </CardContent>
        </Card>

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

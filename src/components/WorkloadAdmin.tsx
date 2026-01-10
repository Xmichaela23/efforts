import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Calculator, History, BarChart3, Zap, Link2 } from 'lucide-react';
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
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      // Load user's plans
      if (user) {
        const { data: userPlans } = await supabase
          .from('training_plans')
          .select('id, name, config, status')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        setPlans(userPlans || []);
      }
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
    try {
      const { data, error } = await supabase.functions.invoke('reassociate-workouts', {
        body: {
          plan_id: selectedPlanId,
          dry_run: reassociateDryRun
        }
      });

      if (error) {
        throw error;
      }

      setResults(data);
    } catch (error: any) {
      console.error('Reassociate failed:', error);
      setResults({ error: error.message });
    } finally {
      setReassociateLoading(false);
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
              <Label htmlFor="planSelect">Target Plan</Label>
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger className="bg-white/10 border-white/20">
                  <SelectValue placeholder="Select a plan..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border border-white/20 shadow-xl z-50">
                  {plans.length === 0 ? (
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

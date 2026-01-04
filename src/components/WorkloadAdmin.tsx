import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Calculator, History, BarChart3, Zap } from 'lucide-react';
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

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  const handlePowerCurveBackfill = async () => {
    if (!user?.id) return;
    
    setPowerCurveLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-power-curves', {
        body: {
          days_back: powerCurveDaysBack,
          dry_run: powerCurveDryRun,
          limit: 100
        }
      });

      if (error) {
        throw error;
      }

      setResults(data);
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
              onClick={handlePowerCurveBackfill} 
              disabled={powerCurveLoading}
              className="w-full"
            >
              {powerCurveLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              {powerCurveDryRun ? 'Preview Backfill' : 'Run Backfill'}
            </Button>
          </CardContent>
        </Card>

      </div>

      {/* Results */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-100 p-4 rounded-md overflow-auto text-sm">
              {JSON.stringify(results, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

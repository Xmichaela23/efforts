import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import { Download, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import JSZip from 'jszip';

interface TestCombo {
  id: string;
  duration_weeks: number;
  approach: 'simple_completion' | 'balanced_build';
  fitness: 'beginner' | 'intermediate' | 'advanced';
  goal: 'complete' | 'speed';
  days_per_week: '3-4' | '4-5' | '5-6' | '6-7';
  strength_frequency?: 0 | 2 | 3;
  strength_protocol?: 'durability' | 'neural_speed' | 'upper_aesthetics';
  label: string;
}

interface ValidationResult {
  comboId: string;
  success: boolean;
  errors: string[];
  warnings: string[];
}

const TEST_COMBINATIONS: TestCombo[] = [
  // Critical paths - most common user journeys
  { id: '1', duration_weeks: 11, approach: 'balanced_build', fitness: 'intermediate', goal: 'speed', days_per_week: '4-5', label: '11w Balanced Speed (4-5d)' },
  { id: '2', duration_weeks: 11, approach: 'balanced_build', fitness: 'intermediate', goal: 'speed', days_per_week: '4-5', strength_frequency: 3, strength_protocol: 'neural_speed', label: '11w Balanced Speed + Neural (3x)' },
  { id: '3', duration_weeks: 16, approach: 'balanced_build', fitness: 'intermediate', goal: 'speed', days_per_week: '5-6', label: '16w Balanced Speed (5-6d)' },
  { id: '4', duration_weeks: 8, approach: 'simple_completion', fitness: 'beginner', goal: 'complete', days_per_week: '3-4', label: '8w Simple Complete (3-4d)' },
  { id: '5', duration_weeks: 20, approach: 'balanced_build', fitness: 'advanced', goal: 'speed', days_per_week: '6-7', label: '20w Balanced Speed Advanced (6-7d)' },
  
  // Edge cases - short plans
  { id: '6', duration_weeks: 8, approach: 'balanced_build', fitness: 'intermediate', goal: 'speed', days_per_week: '4-5', label: '8w Balanced Speed Short' },
  
  // Edge cases - long plans
  { id: '7', duration_weeks: 20, approach: 'simple_completion', fitness: 'beginner', goal: 'complete', days_per_week: '3-4', label: '20w Simple Complete Long' },
  
  // Strength protocol variations
  { id: '8', duration_weeks: 11, approach: 'balanced_build', fitness: 'intermediate', goal: 'speed', days_per_week: '4-5', strength_frequency: 2, strength_protocol: 'durability', label: '11w + Durability (2x)' },
  { id: '9', duration_weeks: 11, approach: 'balanced_build', fitness: 'intermediate', goal: 'speed', days_per_week: '4-5', strength_frequency: 3, strength_protocol: 'upper_aesthetics', label: '11w + Upper Aesthetics (3x)' },
  
  // Fitness level variations
  { id: '10', duration_weeks: 11, approach: 'balanced_build', fitness: 'beginner', goal: 'speed', days_per_week: '4-5', label: '11w Balanced Beginner' },
  { id: '11', duration_weeks: 11, approach: 'balanced_build', fitness: 'advanced', goal: 'speed', days_per_week: '5-6', label: '11w Balanced Advanced' },
  
  // Days per week variations
  { id: '12', duration_weeks: 11, approach: 'balanced_build', fitness: 'intermediate', goal: 'speed', days_per_week: '3-4', label: '11w Balanced (3-4d)' },
  { id: '13', duration_weeks: 11, approach: 'balanced_build', fitness: 'intermediate', goal: 'speed', days_per_week: '6-7', label: '11w Balanced (6-7d)' },
  
  // Simple completion variations
  { id: '14', duration_weeks: 11, approach: 'simple_completion', fitness: 'intermediate', goal: 'complete', days_per_week: '4-5', label: '11w Simple Complete' },
  { id: '15', duration_weeks: 16, approach: 'simple_completion', fitness: 'intermediate', goal: 'complete', days_per_week: '5-6', label: '16w Simple Complete' },
];

export default function PlanGeneratorTest() {
  const [selectedCombos, setSelectedCombos] = useState<Set<string>>(new Set(TEST_COMBINATIONS.map(c => c.id)));
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; combo?: string } | null>(null);
  const [results, setResults] = useState<Map<string, { plan: any; validation: ValidationResult }>>(new Map());
  const [summary, setSummary] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  const toggleCombo = (id: string) => {
    const newSet = new Set(selectedCombos);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedCombos(newSet);
  };

  const validatePlan = (plan: any, combo: TestCombo): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check structure
    if (!plan.sessions_by_week) {
      errors.push('Missing sessions_by_week');
      return { comboId: combo.id, success: false, errors, warnings };
    }

    const weeks = Object.keys(plan.sessions_by_week).map(Number).sort((a, b) => a - b);
    
    // Check all weeks have sessions
    for (const week of weeks) {
      const sessions = plan.sessions_by_week[String(week)] || [];
      if (sessions.length === 0) {
        errors.push(`Week ${week}: No sessions`);
      }
    }

    // Check recovery weeks (every 4th week, but not too close to end)
    const recoveryWeeks = weeks.filter(w => w % 4 === 0 && w < weeks.length - 2);
    for (const week of recoveryWeeks) {
      const sessions = plan.sessions_by_week[String(week)] || [];
      const hasStrides = sessions.some((s: any) => 
        s.name?.toLowerCase().includes('strides') || 
        s.tags?.includes('strides')
      );
      
      // Recovery week should have Easy + Strides on Tuesday
      if (!hasStrides && combo.approach === 'balanced_build') {
        warnings.push(`Week ${week}: Recovery week missing strides`);
      }

      // Check long run step-back (should be ~75% of previous week)
      const prevWeek = week - 1;
      if (prevWeek > 0) {
        const prevSessions = plan.sessions_by_week[String(prevWeek)] || [];
        const currSessions = plan.sessions_by_week[String(week)] || [];
        
        const prevLongRun = prevSessions.find((s: any) => s.tags?.includes('long_run'));
        const currLongRun = currSessions.find((s: any) => s.tags?.includes('long_run'));
        
        if (prevLongRun && currLongRun) {
          // Extract miles from description or tokens (simplified check)
          const prevMiles = extractMiles(prevLongRun);
          const currMiles = extractMiles(currLongRun);
          
          if (prevMiles && currMiles) {
            const expectedMiles = Math.floor(prevMiles * 0.75);
            if (currMiles > prevMiles) {
              errors.push(`Week ${week}: Long run increased (${prevMiles}m → ${currMiles}m), expected ~${expectedMiles}m`);
            } else if (currMiles < expectedMiles * 0.9) {
              warnings.push(`Week ${week}: Long run may be too low (${currMiles}m, expected ~${expectedMiles}m)`);
            }
          }
        }
      }
    }

    // Check strides labeling
    for (const week of weeks) {
      const sessions = plan.sessions_by_week[String(week)] || [];
      for (const session of sessions) {
        if (session.tags?.includes('strides')) {
          if (session.name?.toLowerCase().includes('interval')) {
            errors.push(`Week ${week}: Strides session labeled as "Intervals"`);
          }
          if (!session.name?.toLowerCase().includes('strides')) {
            warnings.push(`Week ${week}: Strides session missing "Strides" in name`);
          }
        }
      }
    }

    // Check race day (final week Sunday)
    if (combo.approach === 'balanced_build') {
      const finalWeek = weeks[weeks.length - 1];
      const finalSessions = plan.sessions_by_week[String(finalWeek)] || [];
      const raceDay = finalSessions.find((s: any) => 
        s.day === 'Sunday' && (s.name?.toLowerCase().includes('race') || s.tags?.includes('race_day'))
      );
      if (!raceDay) {
        warnings.push(`Final week: Missing race day session`);
      }
    }

    return {
      comboId: combo.id,
      success: errors.length === 0,
      errors,
      warnings
    };
  };

  const extractMiles = (session: any): number | null => {
    // Try to extract from description
    const desc = session.description || '';
    const match = desc.match(/(\d+(?:\.\d+)?)\s*miles?/i);
    if (match) return parseFloat(match[1]);
    
    // Try to extract from steps_preset tokens
    const tokens = session.steps_preset || [];
    for (const token of tokens) {
      const longRunMatch = token.match(/longrun_(\d+(?:\.\d+)?)mi/);
      if (longRunMatch) return parseFloat(longRunMatch[1]);
    }
    
    return null;
  };

  const generatePlans = async () => {
    setGenerating(true);
    setProgress({ current: 0, total: selectedCombos.size });
    setResults(new Map());
    setSummary(null);

    const selected = TEST_COMBINATIONS.filter(c => selectedCombos.has(c.id));
    const newResults = new Map<string, { plan: any; validation: ValidationResult }>();
    const allErrors: string[] = [];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please log in to generate test plans');
        setGenerating(false);
        return;
      }

      for (let i = 0; i < selected.length; i++) {
        const combo = selected[i];
        setProgress({ current: i + 1, total: selected.length, combo: combo.label });

        try {
          const requestBody: any = {
            user_id: user.id,
            distance: 'marathon',
            fitness: combo.fitness,
            goal: combo.goal,
            duration_weeks: combo.duration_weeks,
            approach: combo.approach,
            days_per_week: combo.days_per_week,
            start_date: new Date().toISOString().split('T')[0],
            race_date: new Date(Date.now() + combo.duration_weeks * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            race_name: 'Test Marathon',
          };

          // For balanced_build + speed, add effort data (required for pace calculations)
          if (combo.approach === 'balanced_build' && combo.goal === 'speed') {
            // Use a reasonable effort score for testing (equivalent to ~20 min 5K)
            requestBody.effort_score = 45;
            requestBody.effort_score_status = 'estimated';
            // Or provide effort_paces directly
            requestBody.effort_paces = {
              base: 600,    // 10:00/mi easy pace
              race: 480,    // 8:00/mi marathon pace
              steady: 540,  // 9:00/mi threshold
              power: 420,   // 7:00/mi interval
              speed: 360    // 6:00/mi repetition
            };
            requestBody.effort_paces_source = 'calculated';
          }

          if (combo.strength_frequency) {
            requestBody.strength_frequency = combo.strength_frequency;
            requestBody.strength_tier = 'strength_power';
            if (combo.strength_protocol) {
              requestBody.strength_protocol = combo.strength_protocol;
            }
          }

          const { data, error } = await supabase.functions.invoke('generate-run-plan', {
            body: requestBody
          });

          if (error) {
            const errorMsg = error.message || JSON.stringify(error);
            allErrors.push(`${combo.label}: ${errorMsg}`);
            newResults.set(combo.id, {
              plan: null,
              validation: { comboId: combo.id, success: false, errors: [errorMsg], warnings: [] }
            });
            continue;
          }

          if (!data?.success) {
            const errorMsg = data?.error || data?.validation_errors?.join(', ') || 'Generation failed';
            allErrors.push(`${combo.label}: ${errorMsg}`);
            newResults.set(combo.id, {
              plan: null,
              validation: { comboId: combo.id, success: false, errors: [errorMsg], warnings: [] }
            });
            continue;
          }

          if (!data?.plan_id) {
            allErrors.push(`${combo.label}: No plan_id returned`);
            newResults.set(combo.id, {
              plan: null,
              validation: { comboId: combo.id, success: false, errors: ['No plan_id returned'], warnings: [] }
            });
            continue;
          }

          // Fetch the generated plan - use RPC or direct query with proper error handling
          const { data: planData, error: planError } = await supabase
            .from('training_plans')
            .select('*')
            .eq('id', data.plan_id)
            .eq('user_id', user.id) // Ensure we're fetching our own plan
            .single();

          if (planError) {
            // If RLS blocks, try to get plan data from the response if available
            if (data?.plan) {
              // Use plan data from response if available
              const validation = validatePlan(data.plan, combo);
              newResults.set(combo.id, { plan: data.plan, validation });
              if (!validation.success) {
                allErrors.push(`${combo.label}: ${validation.errors.join(', ')}`);
              }
              continue;
            }
            const errorMsg = planError.message || 'Failed to fetch plan (RLS may be blocking)';
            allErrors.push(`${combo.label}: ${errorMsg}`);
            newResults.set(combo.id, {
              plan: null,
              validation: { comboId: combo.id, success: false, errors: [errorMsg], warnings: [] }
            });
            continue;
          }

          if (!planData) {
            allErrors.push(`${combo.label}: Plan data is null`);
            newResults.set(combo.id, {
              plan: null,
              validation: { comboId: combo.id, success: false, errors: ['Plan data is null'], warnings: [] }
            });
            continue;
          }

          const validation = validatePlan(planData, combo);
          newResults.set(combo.id, { plan: planData, validation });

          if (!validation.success) {
            allErrors.push(`${combo.label}: ${validation.errors.join(', ')}`);
          }
        } catch (err: any) {
          allErrors.push(`${combo.label}: ${err.message || 'Unknown error'}`);
          newResults.set(combo.id, {
            plan: null,
            validation: { comboId: combo.id, success: false, errors: [err.message || 'Unknown error'], warnings: [] }
          });
        }
      }

      const successCount = Array.from(newResults.values()).filter(r => r.validation.success).length;
      const failedCount = newResults.size - successCount;

      setResults(newResults);
      setSummary({ success: successCount, failed: failedCount, errors: allErrors });
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  };

  const downloadPlans = async () => {
    if (results.size === 0) {
      alert('No plans to download. Generate plans first.');
      return;
    }

    const zip = new JSZip();
    const summaryLines: string[] = ['# Plan Generation Test Results\n'];

    for (const [comboId, result] of results.entries()) {
      const combo = TEST_COMBINATIONS.find(c => c.id === comboId);
      if (!combo || !result.plan) continue;

      const validation = result.validation;
      const plan = result.plan;

      // Generate Markdown for this plan
      const md = generatePlanMarkdown(plan, combo, validation);
      zip.file(`${combo.label.replace(/\s+/g, '_')}.md`, md);

      // Add to summary
      summaryLines.push(`## ${combo.label}`);
      summaryLines.push(`- **Status**: ${validation.success ? '✅ PASS' : '❌ FAIL'}`);
      if (validation.errors.length > 0) {
        summaryLines.push(`- **Errors**: ${validation.errors.join('; ')}`);
      }
      if (validation.warnings.length > 0) {
        summaryLines.push(`- **Warnings**: ${validation.warnings.join('; ')}`);
      }
      summaryLines.push('');
    }

    if (summary) {
      summaryLines.push('---\n');
      summaryLines.push(`**Summary**: ${summary.success} passed, ${summary.failed} failed`);
      if (summary.errors.length > 0) {
        summaryLines.push('\n**All Errors**:');
        summary.errors.forEach(e => summaryLines.push(`- ${e}`));
      }
    }

    zip.file('SUMMARY.md', summaryLines.join('\n'));

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plan-test-results-${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generatePlanMarkdown = (plan: any, combo: TestCombo, validation: ValidationResult): string => {
    const lines: string[] = [];
    
    lines.push(`# Test Plan: ${combo.label}\n`);
    lines.push('## Parameters');
    lines.push(`- **Length**: ${combo.duration_weeks} weeks`);
    lines.push(`- **Approach**: ${combo.approach}`);
    lines.push(`- **Fitness**: ${combo.fitness}`);
    lines.push(`- **Goal**: ${combo.goal}`);
    lines.push(`- **Days/Week**: ${combo.days_per_week}`);
    if (combo.strength_frequency) {
      lines.push(`- **Strength**: ${combo.strength_frequency}x/week (${combo.strength_protocol || 'none'})`);
    } else {
      lines.push(`- **Strength**: None`);
    }
    lines.push('');

    lines.push('## Validation Results');
    if (validation.success) {
      lines.push('✅ **PASS** - All validations passed');
    } else {
      lines.push('❌ **FAIL** - Validation errors found');
    }
    if (validation.errors.length > 0) {
      lines.push('\n**Errors:**');
      validation.errors.forEach(e => lines.push(`- ${e}`));
    }
    if (validation.warnings.length > 0) {
      lines.push('\n**Warnings:**');
      validation.warnings.forEach(w => lines.push(`- ⚠️ ${w}`));
    }
    lines.push('');

    lines.push('## Plan Summary');
    lines.push(`- **Name**: ${plan.name || 'N/A'}`);
    lines.push(`- **Description**: ${plan.description || 'N/A'}`);
    lines.push('');

    const sessionsByWeek = plan.sessions_by_week || {};
    const weeks = Object.keys(sessionsByWeek).map(Number).sort((a, b) => a - b);

    lines.push('## Weekly Breakdown\n');
    for (const week of weeks) {
      const sessions = sessionsByWeek[String(week)] || [];
      lines.push(`### Week ${week}`);
      lines.push(`**Sessions**: ${sessions.length}`);
      
      const runSessions = sessions.filter((s: any) => s.type === 'run');
      const strengthSessions = sessions.filter((s: any) => s.type === 'strength');
      
      if (runSessions.length > 0) {
        lines.push('\n**Runs:**');
        runSessions.forEach((s: any) => {
          const tags = s.tags?.join(', ') || 'none';
          lines.push(`- ${s.name || 'Unnamed'} (${s.duration}min) [${tags}]`);
        });
      }
      
      if (strengthSessions.length > 0) {
        lines.push('\n**Strength:**');
        strengthSessions.forEach((s: any) => {
          lines.push(`- ${s.name || 'Unnamed'} (${s.duration}min)`);
        });
      }
      
      lines.push('');
    }

    return lines.join('\n');
  };

  return (
    <Card className="bg-black/40 border-white/20">
      <CardHeader>
        <CardTitle className="text-white">Plan Generator Test Suite</CardTitle>
        <CardDescription className="text-white/60">
          Generate multiple plans with different combinations to test the generator
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-white/80">
              {selectedCombos.size} of {TEST_COMBINATIONS.length} selected
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCombos(new Set(TEST_COMBINATIONS.map(c => c.id)))}
                className="text-xs"
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCombos(new Set())}
                className="text-xs"
              >
                Clear All
              </Button>
            </div>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {TEST_COMBINATIONS.map(combo => (
              <div key={combo.id} className="flex items-center space-x-2 p-2 rounded bg-white/5 hover:bg-white/10">
                <Checkbox
                  id={combo.id}
                  checked={selectedCombos.has(combo.id)}
                  onCheckedChange={() => toggleCombo(combo.id)}
                />
                <label
                  htmlFor={combo.id}
                  className="text-sm text-white/90 cursor-pointer flex-1"
                >
                  {combo.label}
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={generatePlans}
            disabled={generating || selectedCombos.size === 0}
            className="flex-1"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              'Generate Test Plans'
            )}
          </Button>
          {results.size > 0 && (
            <Button
              onClick={downloadPlans}
              variant="outline"
              className="flex-1"
            >
              <Download className="mr-2 h-4 w-4" />
              Download ZIP
            </Button>
          )}
        </div>

        {progress && (
          <div className="text-sm text-white/80">
            Progress: {progress.current} / {progress.total}
            {progress.combo && ` - ${progress.combo}`}
          </div>
        )}

        {summary && (
          <div className="p-4 rounded bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-white">Summary</h3>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-white/90">{summary.success} passed</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-white/90">{summary.failed} failed</span>
              </div>
              {summary.errors.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <span className="text-white/90 font-medium">Errors:</span>
                  </div>
                  <ul className="list-disc list-inside text-white/70 text-xs space-y-1 ml-6">
                    {summary.errors.slice(0, 5).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                    {summary.errors.length > 5 && (
                      <li>... and {summary.errors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {results.size > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {Array.from(results.entries()).map(([comboId, result]) => {
              const combo = TEST_COMBINATIONS.find(c => c.id === comboId);
              if (!combo) return null;
              
              return (
                <div
                  key={comboId}
                  className={`p-2 rounded text-xs ${
                    result.validation.success
                      ? 'bg-green-500/20 border border-green-500/30'
                      : 'bg-red-500/20 border border-red-500/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {result.validation.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-white/90 font-medium">{combo.label}</span>
                  </div>
                  {result.validation.errors.length > 0 && (
                    <div className="mt-1 text-red-300 text-xs">
                      {result.validation.errors[0]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

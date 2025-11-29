import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// =============================================================================
// ANALYZE-SWIM-WORKOUT - SWIMMING ANALYSIS EDGE FUNCTION
// =============================================================================
// 
// FUNCTION NAME: analyze-swim-workout
// PURPOSE: Comprehensive analysis for swimming workouts
// 
// WHAT IT DOES:
// - Analyzes swim workouts with prescribed pace/distance targets
// - Compares executed vs planned workout targets
// - Provides interval-by-interval execution breakdown
// - Analyzes stroke efficiency (SWOLF, stroke rate)
// - Handles pool vs open water differences
// - Generates plan-aware insights using GPT-4
// 
// SUPPORTED WORKOUT TYPES:
// - swim
// 
// DATA SOURCES:
// - workouts.swim_data (pool length, strokes, SWOLF)
// - workouts.intervals (swim intervals)
// - workouts.computed (processed intervals, overall metrics)
// - planned_workouts.intervals (prescribed pace/distance ranges)
// 
// ANALYSIS OUTPUT:
// - adherence_percentage: % of time/distance spent in prescribed ranges
// - interval_breakdown: per-interval execution quality
// - stroke_analysis: SWOLF, stroke rate, efficiency
// - performance_assessment: descriptive text based on metrics
// 
// INPUT: { workout_id: string }
// OUTPUT: { success: boolean, analysis: SwimWorkoutAnalysis }
// =============================================================================

// CORS helper function
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
    'Access-Control-Max-Age': '86400'
  };
}

// Parse progression history from description (e.g., "400yd → 800yd → 1200yd")
function parseProgressionHistory(description: string): string[] | null {
  if (!description) return null;
  const match = description.match(/(\d+[a-z]+.*?→.*?\d+[a-z]+)/i);
  if (!match) return null;
  return match[0].split('→').map(p => p.trim());
}

// Parse phase info from tags
function parsePhaseFromTags(tags: string[]): { phase: string | null, week: string | null, totalWeeks: string | null } {
  if (!tags || !Array.isArray(tags)) return { phase: null, week: null, totalWeeks: null };
  
  const phaseTag = tags.find((t: string) => t.startsWith('phase:'));
  const phase = phaseTag ? phaseTag.split(':')[1].replace(/_/g, ' ') : null;
  
  const weekTag = tags.find((t: string) => t.startsWith('week:'));
  let week: string | null = null;
  let totalWeeks: string | null = null;
  if (weekTag) {
    const parts = weekTag.split(':')[1].split('_of_');
    week = parts[0];
    totalWeeks = parts[1];
  }
  
  return { phase, week, totalWeeks };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests FIRST
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  let workout_id: string | undefined;
  let supabase: any = null;

  try {
    const body = await req.json();
    workout_id = body.workout_id;

    if (!workout_id) {
      return new Response(JSON.stringify({ error: 'workout_id is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    supabase = createClient(supabaseUrl, supabaseKey);

    // Validate user authentication
    const authH = req.headers.get('Authorization') || '';
    const token = authH.startsWith('Bearer ') ? authH.slice(7) : null;

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing authentication token' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }

    // Get user from token
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }

    // Set analysis status to 'analyzing'
    await supabase
      .from('workouts')
      .update({
        analysis_status: 'analyzing',
        analysis_error: null
      })
      .eq('id', workout_id);

    // Get workout with swim-specific fields
    const { data: workout, error: workoutError } = await supabase
      .from('workouts')
      .select(`
        id,
        type,
        date,
        duration,
        distance,
        moving_time,
        elapsed_time,
        avg_heart_rate,
        max_heart_rate,
        avg_speed,
        max_speed,
        swim_data,
        intervals,
        computed,
        planned_id,
        user_id,
        pool_length_m,
        pool_unit,
        environment,
        workout_metadata
      `)
      .eq('id', workout_id)
      .single();

    if (workoutError || !workout) {
      throw new Error(`Workout not found: ${workoutError?.message || 'No workout found'}`);
    }

    // Verify user has permission
    if (workout.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden: You do not have access to this workout' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }

    // Check if it's a swim workout
    if (workout.type !== 'swim') {
      return new Response(JSON.stringify({
        error: 'This function only handles swim workouts',
        workout_type: workout.type
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }

    // Get planned workout if available
    let plannedWorkout: any = null;
    let planContext: any = null;
    
    if (workout.planned_id) {
      const { data: planned, error: plannedError } = await supabase
        .from('planned_workouts')
        .select('id, intervals, steps_preset, computed, total_duration_seconds, description, tags, training_plan_id, pool_length_m, pool_unit, user_id')
        .eq('id', workout.planned_id)
        .eq('user_id', workout.user_id) // Authorization: verify planned workout belongs to user
        .single();

      if (!plannedError && planned) {
        // Verify planned workout belongs to user (authorization check)
        if (planned.user_id && planned.user_id !== workout.user_id) {
          console.warn('⚠️ Planned workout does not belong to user - skipping plan context');
        } else {
          plannedWorkout = planned;
          
          // Extract plan-aware context
          if (planned.training_plan_id) {
            try {
              const weekTag = planned.tags?.find((t: string) => t.startsWith('week:'));
              const weekNumber = weekTag ? parseInt(weekTag.split(':')[1].split('_of_')[0]) : 1;
              
              const { data: trainingPlan } = await supabase
                .from('training_plans')
                .select('*')
                .eq('id', planned.training_plan_id)
                .eq('user_id', workout.user_id) // Authorization: verify plan belongs to user
                .single();
              
              if (trainingPlan) {
                // Double-check user ownership (defense in depth)
                if (trainingPlan.user_id === workout.user_id) {
                  const { phase, week, totalWeeks } = parsePhaseFromTags(planned.tags || []);
                  const weeklySummary = trainingPlan.config?.weekly_summaries?.[weekNumber] || 
                                        trainingPlan.weekly_summaries?.[weekNumber] || null;
                  const progressionHistory = parseProgressionHistory(planned.description || '');
                  
                  planContext = {
                    plan_name: trainingPlan.name || 'Training Plan',
                    week: weekNumber,
                    total_weeks: trainingPlan.duration_weeks || 0,
                    phase: phase || 'unknown',
                    weekly_summary: weeklySummary,
                    progression_history: progressionHistory,
                    session_description: planned.description || '',
                    session_tags: planned.tags || [],
                    plan_description: trainingPlan.description || ''
                  };
                } else {
                  console.warn('⚠️ Training plan does not belong to user - skipping plan context');
                }
              }
            } catch (error) {
              console.log('⚠️ Failed to extract plan context:', error);
            }
          }
        }
      }
    }

    // Parse swim data
    const swimData = workout.swim_data || {};
    const intervals = workout.intervals || [];
    const computed = workout.computed || {};
    
    // Calculate basic metrics
    const totalDistance = workout.distance || 0; // in km, convert to meters
    const totalDistanceMeters = totalDistance * 1000;
    const poolLength = workout.pool_length_m || swimData.poolLength || 25; // default 25m
    const poolUnit = workout.pool_unit || swimData.poolUnit || 'm';
    const isPool = workout.environment !== 'open_water';
    
    // Calculate average pace per 100m/yd
    let avgPacePer100 = 0;
    if (totalDistanceMeters > 0 && workout.moving_time) {
      const totalSeconds = workout.moving_time * 60;
      const paceSeconds = (totalSeconds / totalDistanceMeters) * 100;
      avgPacePer100 = paceSeconds;
    }

    // Analyze intervals if available
    const intervalAnalysis = intervals.map((interval: any, idx: number) => {
      const plannedInterval = plannedWorkout?.intervals?.[idx] || plannedWorkout?.computed?.steps?.[idx];
      
      return {
        interval_number: idx + 1,
        distance: interval.distance || 0,
        duration: interval.duration || 0,
        pace_per_100: interval.pace_per_100 || 0,
        stroke_type: interval.stroke_type || swimData.strokeType || 'Freestyle',
        planned_distance: plannedInterval?.distance || null,
        planned_pace: plannedInterval?.pace_per_100 || null,
        adherence: plannedInterval ? 
          (interval.pace_per_100 && plannedInterval.pace_per_100 ? 
            Math.max(0, 100 - Math.abs((interval.pace_per_100 - plannedInterval.pace_per_100) / plannedInterval.pace_per_100 * 100)) : 
            100) : 
          null
      };
    });

    // Calculate overall adherence
    const intervalsWithAdherence = intervalAnalysis.filter((i: any) => i.adherence !== null);
    const overallAdherence = intervalsWithAdherence.length > 0 ?
      intervalsWithAdherence.reduce((sum: number, i: any) => sum + i.adherence, 0) / intervalsWithAdherence.length :
      100;

    // Generate AI insights if OpenAI key is available
    let narrativeInsights: string[] = [];
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (openaiKey) {
      try {
        const workoutContext = {
          type: workout.type,
          duration: workout.duration || 0,
          distance: totalDistanceMeters,
          distance_unit: 'meters',
          avg_pace_per_100: avgPacePer100 > 0 ? formatPace(avgPacePer100) : 'N/A',
          pool_length: poolLength,
          pool_unit: poolUnit,
          environment: isPool ? 'pool' : 'open water',
          avg_heart_rate: workout.avg_heart_rate || null,
          max_heart_rate: workout.max_heart_rate || null,
          stroke_type: swimData.strokeType || 'Freestyle',
          intervals_completed: intervals.length,
          overall_adherence: Math.round(overallAdherence)
        };

        let prompt = `You are analyzing a swimming workout. Generate 3-4 concise, data-driven observations based on the metrics below.

CRITICAL RULES:
- Write like "a chart in words" - factual observations only
- NO motivational language ("great job", "keep it up")
- NO subjective judgments ("slow", "bad", "should have")
- NO generic advice ("swim more", "push harder")
- Focus on WHAT HAPPENED, not what should happen
- Use specific numbers and time references
- Describe patterns visible in the data
${planContext ? `
- CRITICAL: Reference plan context when available - explain WHY workout was programmed, whether performance matches plan expectations, and what's coming next week
- Contextualize adherence relative to phase goals (e.g., Foundation Build vs Peak Strength)
` : ''}

Workout Profile:
- Type: ${workoutContext.type}
- Duration: ${workoutContext.duration} minutes
- Distance: ${workoutContext.distance.toFixed(0)} ${workoutContext.distance_unit}
- Avg Pace: ${workoutContext.avg_pace_per_100} per 100${poolUnit}
- Pool Length: ${workoutContext.pool_length}${workoutContext.pool_unit}
- Environment: ${workoutContext.environment}
- Stroke Type: ${workoutContext.stroke_type}
${workoutContext.avg_heart_rate ? `- Avg HR: ${workoutContext.avg_heart_rate} bpm (Max: ${workoutContext.max_heart_rate} bpm)` : ''}
${intervals.length > 0 ? `- Intervals Completed: ${workoutContext.intervals_completed}` : ''}
${plannedWorkout ? `- Overall Adherence: ${workoutContext.overall_adherence}%` : ''}
`;

        if (planContext) {
          prompt += `

═══════════════════════════════════════════════════════════════
📋 PLAN CONTEXT
═══════════════════════════════════════════════════════════════

Plan: ${planContext.plan_name}
Week: ${planContext.week} of ${planContext.total_weeks}
Phase: ${planContext.phase}
${planContext.weekly_summary?.focus ? `
WEEK ${planContext.week} FOCUS:
"${planContext.weekly_summary.focus}"
` : ''}
${planContext.weekly_summary?.key_workouts && planContext.weekly_summary.key_workouts.length > 0 ? `
KEY WORKOUTS THIS WEEK:${planContext.weekly_summary.key_workouts.map((w: string) => `\n• ${w}`).join('')}
` : ''}
${planContext.weekly_summary?.notes ? `
WEEK NOTES:
${planContext.weekly_summary.notes}
` : ''}
${planContext.progression_history ? `
PROGRESSION HISTORY:
${planContext.progression_history.join(' → ')}
` : ''}
`;
        }

        if (intervals.length > 0 && intervalAnalysis.length > 0) {
          prompt += `

INTERVAL BREAKDOWN:
${intervalAnalysis.slice(0, 10).map((i: any) => 
  `- Interval ${i.interval_number}: ${i.distance}${poolUnit} @ ${i.pace_per_100 > 0 ? formatPace(i.pace_per_100) : 'N/A'} per 100${poolUnit}${i.adherence !== null ? ` (${Math.round(i.adherence)}% adherence)` : ''}`
).join('\n')}
`;
        }

        prompt += `

Generate 3-4 observations about this swim workout:`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4-turbo-preview',
            messages: [
              {
                role: 'system',
                content: 'You are a swimming coach analyzing workout data. Provide concise, factual observations.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 500,
            temperature: 0.7
          })
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          // Split into individual insights (assuming they're separated by newlines or periods)
          narrativeInsights = content.split('\n')
            .map((line: string) => line.trim())
            .filter((line: string) => line.length > 0 && !line.match(/^\d+\.$/))
            .slice(0, 4);
          
          if (narrativeInsights.length === 0) {
            // Fallback: treat entire response as one insight
            narrativeInsights = [content.substring(0, 200)];
          }
        }
      } catch (error) {
        console.error('⚠️ AI insight generation failed:', error);
        narrativeInsights = [];
      }
    }

    // Helper function to format pace
    function formatPace(seconds: number): string {
      const minutes = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${minutes}:${String(secs).padStart(2, '0')}`;
    }

    // Build analysis result
    const analysis = {
      status: 'success',
      performance: {
        overall_adherence: Math.round(overallAdherence),
        pace_adherence: Math.round(overallAdherence),
        duration_adherence: 100, // TODO: Calculate based on planned vs actual duration
        execution_adherence: Math.round(overallAdherence)
      },
      detailed_analysis: {
        workout_summary: {
          total_distance: totalDistanceMeters,
          total_distance_unit: 'meters',
          total_duration: workout.duration || 0,
          average_pace_per_100: avgPacePer100 > 0 ? formatPace(avgPacePer100) : 'N/A',
          pool_length: poolLength,
          pool_unit: poolUnit,
          environment: isPool ? 'pool' : 'open water',
          stroke_type: swimData.strokeType || 'Freestyle',
          intervals_completed: intervals.length
        },
        interval_breakdown: intervalAnalysis,
        stroke_analysis: {
          stroke_type: swimData.strokeType || 'Freestyle',
          equipment_used: swimData.equipmentUsed || [],
          swolf: swimData.swolf || null,
          stroke_rate: swimData.strokeRate || null
        }
      },
      insights: narrativeInsights.length > 0 ? narrativeInsights : [
        `Swam ${totalDistanceMeters.toFixed(0)} meters in ${workout.duration || 0} minutes.`,
        `Average pace: ${avgPacePer100 > 0 ? formatPace(avgPacePer100) : 'N/A'} per 100${poolUnit}.`,
        intervals.length > 0 ? `Completed ${intervals.length} intervals.` : 'Continuous swim.'
      ]
    };

    // Save analysis to database
    const updatePayload = {
      workout_analysis: {
        performance: analysis.performance,
        detailed_analysis: analysis.detailed_analysis,
        narrative_insights: analysis.insights,
        insights: analysis.insights // Keep for backward compatibility
      },
      analysis_status: 'complete',
      analyzed_at: new Date().toISOString()
    };

    const { error: updateError } = await supabase
      .from('workouts')
      .update(updatePayload)
      .eq('id', workout_id);

    if (updateError) {
      console.error('❌ Failed to save analysis to database:', updateError);
    } else {
      console.log('✅ Swim analysis saved successfully');
    }

    return new Response(JSON.stringify(analysis), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });

  } catch (error) {
    console.error('❌ Error in swim workout analysis:', error);

    // Set analysis status to 'failed'
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    if (workout_id && supabase) {
      try {
        await supabase
          .from('workouts')
          .update({
            analysis_status: 'failed',
            analysis_error: errorMessage
          })
          .eq('id', workout_id);
      } catch (statusError) {
        console.error('❌ Failed to set error status:', statusError);
      }
    }

    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: errorMessage
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
});


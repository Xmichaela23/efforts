/**
 * Heart Rate Analysis Types
 * 
 * Single source of truth for all HR-related analysis.
 * All calculations are deterministic - same inputs = same outputs.
 */

// =============================================================================
// WORKOUT TYPES
// =============================================================================

export type WorkoutType = 
  | 'steady_state'    // Easy runs, long runs, recovery runs
  | 'tempo_finish'    // Steady run with fast finish
  | 'progressive'     // Gradually increasing pace
  | 'intervals'       // Structured intervals with recovery
  | 'hill_repeats'    // Hill-focused intervals
  | 'fartlek'         // Unstructured variable effort
  | 'mixed';          // Can't classify

export type AnalysisType = 'drift' | 'intervals' | 'zones';

// =============================================================================
// INPUT CONTEXT
// =============================================================================

export interface HRAnalysisContext {
  // Workout structure
  workoutType: WorkoutType;
  intervals: IntervalData[];
  
  // Terrain
  terrain: {
    totalElevationGainM?: number;
    samples: SensorSample[];  // For grade calculation
  };
  
  // Weather (if available)
  weather?: {
    temperatureF?: number;
    feelsLikeF?: number;
    humidity?: number;
    source?: 'device' | 'openweathermap' | 'openmeteo';
  };
  
  // Planned workout (when attached to plan)
  plannedWorkout?: {
    description?: string;
    workoutToken?: string;
    paceRanges?: { lower: number; upper: number }[];
    intent?: 'easy' | 'long' | 'tempo' | 'intervals' | 'recovery';
  };
  
  // Execution metrics (from pace-adherence calculation)
  paceAdherencePct?: number;  // 0-100, overall pace adherence
  
  // Plan context (when part of training plan)
  planContext?: {
    weekIndex: number;
    weekIntent: 'build' | 'recovery' | 'taper' | 'peak' | 'baseline' | 'unknown';
    isRecoveryWeek: boolean;
    isTaperWeek: boolean;
    phaseName?: string;
    planName?: string;
  };
  
  // Load context (from ACWR/weekly context)
  loadContext?: {
    acwr?: number;
    acwrStatus?: 'undertrained' | 'optimal' | 'elevated' | 'high_risk';
    consecutiveHardDays?: number;
  };
  
  // Historical comparison data
  historicalDrift?: {
    similarWorkouts: HistoricalWorkout[];
    avgDriftBpm: number;
    trend?: 'improving' | 'stable' | 'worsening';
    lastSimilar?: {
      date: string;
      driftBpm: number;
      daysSince: number;
    };
  };
  
  // User settings
  userUnits?: 'metric' | 'imperial';
  
  // User HR zones (if set)
  hrZones?: {
    z1Max: number;  // Recovery
    z2Max: number;  // Aerobic
    z3Max: number;  // Tempo
    z4Max: number;  // Threshold
    z5Max: number;  // VO2max
  };
}

export interface IntervalData {
  role: 'warmup' | 'work' | 'recovery' | 'cooldown' | string;
  sampleIdxStart?: number;
  sampleIdxEnd?: number;
  startTimeS?: number;
  endTimeS?: number;
  paceRange?: { lower: number; upper: number };
  executed?: {
    avgPaceSPerMi?: number;
    durationS?: number;
    avgHr?: number;
  };
}

export interface SensorSample {
  timestamp?: number;
  heart_rate?: number;
  pace_s_per_mi?: number;
  elevation_m?: number;
  elevationInMeters?: number;
  speedMetersPerSecond?: number;
  cadence?: number;
}

export interface HistoricalWorkout {
  date: string;
  driftBpm: number;
  durationMin: number;
  elevationFt?: number;
  daysSince?: number;
}

// =============================================================================
// OUTPUT: MAIN RESULT
// =============================================================================

export interface HRAnalysisResult {
  // Classification
  workoutType: WorkoutType;
  analysisType: AnalysisType;
  
  // Drift analysis (for steady-state, tempo_finish, progressive)
  drift?: DriftAnalysis;
  
  // Interval analysis (for intervals, hill_repeats)
  intervals?: IntervalHRAnalysis;
  
  // Zone distribution (always calculated when HR data exists)
  zones: ZoneDistribution;
  
  // Efficiency metrics (for steady-state efforts)
  efficiency?: EfficiencyMetrics;
  
  // Trends (when historical data available)
  trends?: TrendAnalysis;
  
  // The interpretation narrative (deterministic, template-based)
  interpretation: string;
  
  // Human-readable label for the summary (e.g., "HR Summary", "Aerobic Efficiency")
  summaryLabel: string;
  
  // Confidence in the analysis
  confidence: 'high' | 'medium' | 'low';
  confidenceReasons?: string[];
  
  // Summary metrics for weekly/block aggregation
  summary: HRSummaryMetrics;
}

// =============================================================================
// DRIFT ANALYSIS (Steady-State Workouts)
// =============================================================================

export interface DriftAnalysis {
  // Core drift metrics
  driftBpm: number;              // Final reported drift (terrain-adjusted if significant)
  rawDriftBpm: number;           // Before terrain adjustment
  earlyAvgHr: number;            // First window average
  lateAvgHr: number;             // Last window average
  
  // Analysis scope
  analysisScope: 'full_workout' | 'easy_portion' | 'first_two_thirds';
  scopeDescription: string;
  excludedSegments: string[];
  
  // Terrain factors
  terrain: {
    contributionBpm: number | null;    // How much terrain affected drift
    earlyAvgGrade: number | null;
    lateAvgGrade: number | null;
    profileDescription: string | null;  // "Front-loaded climb", etc.
    climbingLocation: 'early' | 'middle' | 'late' | 'throughout' | 'flat' | null;
    totalElevationFt: number | null;
  };
  
  // Weather factors
  weather: {
    factor: 'normal' | 'hot' | 'cold' | 'unknown';
    contributionBpm: number;
    note: string | null;
  };
  
  // Expected range (based on duration, conditions)
  expected: {
    lowerBpm: number;
    upperBpm: number;
    durationCategory: 'short' | 'moderate' | 'long' | 'extended';
  };
  
  // Assessment
  assessment: 'excellent' | 'good' | 'normal' | 'elevated' | 'high';
  
  // For tempo_finish workouts
  tempoSegment?: {
    avgHr: number;
    peakHr: number;
    durationMin: number;
    paceDesc: string;
  };
}

// =============================================================================
// INTERVAL HR ANALYSIS
// =============================================================================

export interface IntervalHRAnalysis {
  // Aggregate metrics
  workIntervalAvgHr: number;
  workIntervalCount: number;
  
  // HR creep (fatigue indicator)
  hrCreep: {
    firstIntervalAvgHr: number;
    lastIntervalAvgHr: number;
    creepBpm: number;              // Last - First
    creepPct: number;              // (Last - First) / First * 100
    assessment: 'minimal' | 'normal' | 'elevated' | 'high';
  };
  
  // HR consistency across intervals
  consistency: {
    stdDevBpm: number;
    coefficientOfVariation: number;  // CV %
    assessment: 'very_consistent' | 'consistent' | 'variable' | 'inconsistent';
  };
  
  // Recovery between intervals
  recovery: {
    avgDropBpm: number;            // Average HR drop during recovery
    avgRecoveryTimeS: number;
    recoveryRate: number;          // BPM drop per minute
    quality: 'excellent' | 'good' | 'fair' | 'poor';
    perInterval: IntervalRecoveryData[];
  };
  
  // Per-interval breakdown
  perInterval: PerIntervalHR[];
}

export interface IntervalRecoveryData {
  intervalNumber: number;
  workEndHr: number;
  recoveryEndHr: number;
  dropBpm: number;
  recoveryTimeS: number;
}

export interface PerIntervalHR {
  intervalNumber: number;
  role: string;
  avgHr: number;
  maxHr: number;
  minHr: number;
  durationS: number;
}

// =============================================================================
// ZONE DISTRIBUTION
// =============================================================================

export interface ZoneDistribution {
  distribution: ZoneTime[];
  primaryZone: string;
  zoneCreep: boolean;           // Did they drift into higher zones?
  timeAboveTarget: number;      // Seconds spent above intended zone
  percentInTarget: number;      // % of time in intended zone (if known)
}

export interface ZoneTime {
  zone: string;                 // "Z1 Recovery", "Z2 Aerobic", etc.
  label: string;                // Short label
  rangeDescription: string;     // "< 120 bpm" or "120-140 bpm"
  seconds: number;
  percent: number;
}

// =============================================================================
// EFFICIENCY METRICS
// =============================================================================

export interface EfficiencyMetrics {
  // Pace:HR decoupling
  decoupling: {
    percent: number;            // Decoupling %
    earlyRatio: number;         // Early pace/HR ratio
    lateRatio: number;          // Late pace/HR ratio
    assessment: 'excellent' | 'good' | 'moderate' | 'high';
  };
  
  // Overall efficiency
  avgEfficiencyRatio: number;   // Avg pace / Avg HR (normalized)
}

// =============================================================================
// TREND ANALYSIS
// =============================================================================

export interface TrendAnalysis {
  // Drift trend
  drift?: {
    trend: 'improving' | 'stable' | 'worsening';
    changePercent: number;
    comparedTo: string;         // "last 6 similar runs"
    sampleSize: number;
  };
  
  // Efficiency trend
  efficiency?: {
    trend: 'improving' | 'stable' | 'worsening';
    changePercent: number;
    comparedTo: string;
    sampleSize: number;
  };
  
  // vs last similar workout
  vsLastSimilar?: {
    date: string;
    daysSince: number;
    driftDiffBpm: number;
    better: boolean;
  };
}

// =============================================================================
// SUMMARY METRICS (for weekly/block aggregation)
// =============================================================================

export interface HRSummaryMetrics {
  // Core metrics
  avgHr: number;
  maxHr: number;
  minHr: number;
  
  // For trend tracking
  driftBpm: number | null;
  decouplingPct: number | null;
  efficiencyRatio: number | null;
  
  // For weekly zone aggregation
  timeInZones: {
    z1Seconds: number;
    z2Seconds: number;
    z3Seconds: number;
    z4Seconds: number;
    z5Seconds: number;
  };
  
  // For interval fatigue tracking
  intervalHrCreepBpm: number | null;
  intervalRecoveryRate: number | null;
  
  // Metadata
  workoutType: WorkoutType;
  analysisConfidence: 'high' | 'medium' | 'low';
  durationMinutes: number;
}

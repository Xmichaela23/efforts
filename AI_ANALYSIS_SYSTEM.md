# AI Analysis System

A comprehensive AI-powered analysis system for workout and training pattern interpretation using OpenAI GPT-4.

## 🧠 Overview

The AI Analysis System provides intelligent insights into individual workouts and weekly training patterns, helping users understand their performance, identify trends, and receive actionable recommendations.

## 🏗️ Architecture

### Components

1. **WorkoutAIAnalysis.tsx** - Per-workout analysis component for details tab
2. **WeeklyAIAnalysis.tsx** - Weekly pattern analysis for calendar dashboard  
3. **DailyAIUpdate.tsx** - Daily performance updates for calendar cells
4. **WorkoutAIAnalysis.ts** - Core AI service with OpenAI integration
5. **aiAnalysisService.ts** - Service layer for Supabase Edge Functions

### Edge Functions

1. **analyze-workout-ai** - AI analysis of individual workouts
2. **analyze-weekly-ai** - AI analysis of weekly training patterns

## 🚀 Features

### Per-Workout Analysis

- **Performance Scoring** (0-100) based on multiple metrics
- **Effort Level Classification** (easy, moderate, hard, very_hard, maximal)
- **Key Metrics Identification** (primary, secondary, tertiary)
- **Insight Generation** with confidence scores and actionable recommendations
- **Historical Comparison** with recent performance trends
- **Personal Best Detection** and improvement tracking

### Weekly Analysis

- **Multi-Dimensional Scoring**:
  - Overall Training Score
  - Adherence Score  
  - Balance Score
  - Progression Score
- **Pattern Recognition**:
  - Volume analysis
  - Intensity distribution
  - Recovery patterns
  - Progression trends
- **Actionable Recommendations** for training optimization

### Daily Updates

- **Compact Performance Summaries** for calendar cells
- **Workload Status Indicators** (on target, high, low)
- **Motivational Messaging** based on performance
- **Week Context Integration** showing overall progress

## 📊 Data Sources

### Workout Data
- Duration, distance, pace, speed
- Heart rate zones and power metrics
- Elevation gain and cadence
- Workload scores and intensity factors
- Strength exercises and mobility work

### Historical Context
- Recent workouts of same type
- Previous weekly patterns
- Performance trends over time
- Personal bests and benchmarks

## 🔧 Setup

### 1. Environment Variables

Add to your `.env.local`:
```env
VITE_OPENAI_API_KEY=your_openai_api_key_here
```

### 2. Supabase Environment

Add to your Supabase project environment:
```env
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Deploy Edge Functions

```bash
supabase functions deploy analyze-workout-ai
supabase functions deploy analyze-weekly-ai
```

## 🎯 Usage

### Workout Details Tab

The AI analysis automatically appears in the workout details tab, providing:

```tsx
<WorkoutAIAnalysisComponent 
  workout={workout}
  onInsightClick={(insight) => {
    // Handle insight click - show detailed recommendations
  }}
/>
```

### Calendar Dashboard

Weekly analysis appears in the calendar's workload section:

```tsx
<WeeklyAIAnalysisComponent 
  weekData={{ week_start: weekStart }}
  compact={true}
  onInsightClick={(insight) => {
    // Handle weekly insight click
  }}
/>
```

Daily updates appear in each calendar cell:

```tsx
<DailyAIUpdate 
  dayData={{
    date: dateString,
    workouts: workoutArray,
    workload: actualWorkload,
    planned: plannedWorkload
  }}
  compact={true}
/>
```

## 🧩 Insight Types

### Workout Insights
- **Performance** - Speed, power, pace improvements
- **Recovery** - Heart rate variability, fatigue indicators
- **Technique** - Form, efficiency, cadence analysis
- **Progression** - Training load increases, adaptation
- **Warning** - Overtraining, injury risk, form issues
- **Achievement** - Personal bests, milestones, goals

### Weekly Insights
- **Volume** - Training load, consistency, frequency
- **Intensity** - Hard vs easy session balance
- **Balance** - Sport distribution, recovery integration
- **Recovery** - Rest day quality, adaptation time
- **Progression** - Week-over-week improvements
- **Warning** - Overtraining, under-recovery, imbalances

## 🔄 Fallback Behavior

When OpenAI API is not configured or unavailable:

- **Graceful Degradation** to rule-based analysis
- **Basic Performance Scoring** using mathematical formulas
- **Standard Recommendations** based on training science
- **User-Friendly Messages** explaining the limitation

## 📈 Performance Optimization

### Caching
- Analysis results cached to avoid redundant API calls
- Historical data fetched once per session
- Weekly summaries updated only when needed

### Error Handling
- Comprehensive error boundaries
- Retry mechanisms for failed requests
- User-friendly error messages
- Fallback to basic analysis

### Rate Limiting
- Respects OpenAI API rate limits
- Implements exponential backoff
- Queues requests during high usage

## 🎨 UI/UX Features

### Visual Indicators
- **Color-coded scores** (green: excellent, yellow: good, red: needs attention)
- **Progress bars** for performance metrics
- **Confidence indicators** for AI insights
- **Trend arrows** showing improvement/decline

### Interactive Elements
- **Clickable insights** for detailed recommendations
- **Expandable sections** for comprehensive analysis
- **Refresh buttons** for re-analysis
- **Compact/expanded views** for different contexts

### Responsive Design
- **Mobile-optimized** compact views
- **Desktop-enhanced** detailed analysis
- **Adaptive layouts** based on screen size
- **Touch-friendly** interaction patterns

## 🔮 Future Enhancements

### Advanced Analytics
- **Predictive Modeling** for performance forecasting
- **Injury Risk Assessment** using biomechanical data
- **Optimal Tapering** recommendations before events
- **Equipment Impact Analysis** on performance

### Integration Opportunities
- **Weather Data** correlation with performance
- **Sleep Quality** integration for recovery analysis
- **Nutrition Data** for fueling optimization
- **Social Features** for motivation and comparison

### AI Improvements
- **Fine-tuned Models** for triathlon-specific analysis
- **Multi-modal Analysis** combining text, numbers, and patterns
- **Real-time Processing** for live workout feedback
- **Personalized Learning** from user preferences

## 🛠️ Development

### Adding New Insight Types

1. Update the `WorkoutInsight` or `WeeklyInsight` interfaces
2. Add corresponding icons and colors in components
3. Update the AI prompts to include new analysis types
4. Test with various workout scenarios

### Customizing AI Prompts

The AI prompts can be customized in the Edge Functions:
- `analyze-workout-ai/index.ts` - Workout analysis prompts
- `analyze-weekly-ai/index.ts` - Weekly analysis prompts

### Extending Analysis Data

To include new data sources:
1. Update the data fetching in Edge Functions
2. Modify the prompt templates
3. Update the TypeScript interfaces
4. Test with real data

## 📝 API Reference

### WorkoutAIAnalysis Service

```typescript
// Analyze a single workout
const analysis = await AIAnalysisService.analyzeWorkout(workoutId, includeHistorical);

// Analyze weekly patterns  
const weeklyAnalysis = await AIAnalysisService.analyzeWeekly(userId, weekStart, includeHistorical);

// Check AI availability
const isAvailable = await AIAnalysisService.checkAIAvailability();
```

### Edge Function Endpoints

```typescript
// POST /functions/v1/analyze-workout-ai
{
  "workout_id": "uuid",
  "include_historical": true
}

// POST /functions/v1/analyze-weekly-ai  
{
  "user_id": "uuid",
  "week_start_date": "2024-01-15",
  "include_historical": true
}
```

## 🎉 Conclusion

The AI Analysis System transforms raw training data into actionable insights, helping athletes optimize their performance through intelligent pattern recognition and personalized recommendations. The system is designed to be robust, user-friendly, and extensible for future enhancements.

---

**Note**: This system requires an OpenAI API key for full functionality. Without it, the system gracefully falls back to rule-based analysis to ensure users always receive valuable insights.

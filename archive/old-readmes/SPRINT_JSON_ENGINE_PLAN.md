# Sprint JSON Rules Engine - Simple & Science-Based

## 🎯 Vision
**Simple JSON rules that generate science-based sprint triathlon training plans.**

## 🚫 Anti-Complexity Rules
1. **Sprint-First Only** - No generic triathlon logic
2. **Science-Based Limits** - Hard boundaries, no AI optimization
3. **No "What If" Questions** - Build what works, not what could work
4. **Fail Fast** - No fallbacks, throw errors when data missing
5. **One Thing at a Time** - Perfect sprint before scaling
6. **Simple Validation** - Basic checks, no complex frameworks

## 📋 Sprint-Specific JSON Rules

### Session Duration Limits
```json
{
  "distance": "sprint",
  "sessionType": "swim",
  "maxDuration": 35,
  "targetZones": [2, 3]
}
```
```json
{
  "distance": "sprint", 
  "sessionType": "bike",
  "maxDuration": 60,
  "targetZones": [2, 3]
}
```
```json
{
  "distance": "sprint",
  "sessionType": "run", 
  "maxDuration": 45,
  "targetZones": [2, 3]
}
```
```json
{
  "distance": "sprint",
  "sessionType": "brick",
  "maxDuration": 75,
  "targetZones": [3, 4]
}
```

### 80/20 Polarized Distribution
```json
{
  "distance": "sprint",
  "philosophy": "polarized",
  "totalSessions": 4,
  "easySessions": 3,
  "hardSessions": 1
}
```

### Week Progression
```json
{
  "distance": "sprint",
  "week": 1,
  "phase": "introduction",
  "sessionCount": 4,
  "intensity": "all_endurance"
}
```
```json
{
  "distance": "sprint", 
  "week": 5,
  "phase": "build",
  "sessionCount": 5,
  "intensity": "introduce_threshold"
}
```

## 🔧 Implementation Steps

### Step 1: User Input Validation
```typescript
// Required baselines - NO FALLBACKS
const requiredBaselines = ['ftp', 'fiveKPace', 'swimPace100', 'age'];

if (!userBaselines.hasAll(requiredBaselines)) {
  throw new Error('Missing required baselines for sprint plan');
}
```

### Step 2: Sprint-Specific Plan Generation
```typescript
// Simple flow - no complexity
const plan = generateSprintPlan(userBaselines, weekNumber);
```

### Step 3: Science-Based Validation
```typescript
// Enforce sprint limits - no AI optimization
if (session.duration > sprintLimits[session.type]) {
  throw new Error(`Session exceeds sprint ${session.type} limit`);
}
```

## 🎯 Expected Output

### Week 1 - Introduction
- **4 sessions, 4.5 hours**
- **All endurance sessions** (no threshold work)
- **Session durations:** Swim 30min, Bike 45min, Run 35min, Brick 60min
- **80/20 distribution:** 3 easy + 1 easy (all endurance for Week 1)

### Week 5 - Build
- **5 sessions, 5.5 hours** 
- **Introduce threshold work**
- **Session durations:** Swim 25min, Bike 50min, Run 40min, Brick 70min
- **80/20 distribution:** 3 easy + 2 hard

## 🚫 What We Won't Build
- ❌ Generic triathlon logic
- ❌ Complex time multipliers
- ❌ Fitness level adjustments
- ❌ Recovery capacity calculations
- ❌ Diminishing returns logic
- ❌ Comprehensive validation frameworks
- ❌ Auto-correction systems
- ❌ Confidence scoring

## ✅ What We Will Build
- ✅ Sprint-specific JSON rules
- ✅ Science-based duration limits
- ✅ Simple 80/20 distribution
- ✅ Week progression logic
- ✅ Basic validation
- ✅ Fail-fast error handling

## 🎯 Success Criteria
1. **Sprint endurance sessions:** 30-45min (not 87-122min)
2. **Sprint threshold sessions:** 20-30min (not 38-46min)  
3. **Sprint brick sessions:** 60-75min (not 102min)
4. **80/20 distribution:** 3 easy + 1 hard (not 2+2)
5. **Week progression:** Introduction → Build → Peak → Taper
6. **No fallbacks:** Fail fast when data missing
7. **No hardcoding:** Everything from user input

## 🔄 Scaling Plan (After Sprint Works)
1. **Perfect sprint plans first**
2. **Then add Olympic rules**
3. **Then add 70.3 rules**
4. **Then add marathon rules**
5. **Then add strength integration**

## 🎯 The Goal
**Simple JSON rules that generate coach-quality sprint triathlon plans without complexity or AI optimization addiction.** 
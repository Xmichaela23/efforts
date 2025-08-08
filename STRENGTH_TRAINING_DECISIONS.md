# Strength Training Decisions & Scientific Principles

## 🎯 Current Strength Training Options

### **Traditional (2x/week)**
- **Lower body focus session**: Squat, Deadlift, Single-leg movements
- **Upper body focus session**: Bench Press, Rows, Overhead Press
- **6-day training week**
- **+1.8h/week** time commitment
- **Scientific basis**: Balanced development without interfering with endurance goals

### **Cowboy (3x/week)**
- **2 functional sessions**: Farmer's Walks, Carries, Pull-ups (full body endurance strength)
- **1 upper body session**: Bench Press, Overhead Press, Rows, Curls (aesthetics and balance)
- **7-day training week**
- **+2.2h/week** time commitment
- **Scientific basis**: Functional endurance + upper body aesthetics for overall balance

## 🧪 Scientific Distribution Principles

### **Recovery Windows**
- **Functional sessions**: 48-72h spacing for optimal recovery
- **Upper body sessions**: 24h minimum spacing from functional sessions
- **No back-to-back strength days**: Prevents overtraining and interference

### **Session Distribution Algorithm**
```typescript
// Training science principles:
// 1. Avoid back-to-back strength sessions (minimum 24h recovery)
// 2. Avoid strength on long session days or adjacent days
// 3. For functional sessions: prefer 48-72h spacing for optimal recovery
// 4. For upper body: can be closer to functional sessions (24h minimum)
```

### **Equipment Adaptation**
- **Barbell**: Primary choice for compound movements
- **Dumbbells**: Substitution when barbell unavailable
- **Bodyweight**: Fallback for minimal equipment scenarios
- **Evidence-based percentages**: 75% 1RM for compound movements

## 🎯 Why These Decisions Were Made

### **Simplified Options**
- **Removed "Compound" option**: Redundant with Traditional (both use compound movements)
- **Removed "Cowboy Advanced"**: Unnecessary complexity for most users
- **Kept Traditional**: Standard 2x/week for maintenance
- **Kept Cowboy**: 3x/week for those wanting more strength focus

### **Scientific Validation**
- **Traditional**: Lower/upper split prevents interference with endurance
- **Cowboy**: Functional endurance supports triathlon performance
- **Upper body aesthetics**: Scientifically valuable for overall balance
- **Recovery spacing**: Based on muscle protein synthesis research

### **User Experience**
- **Clear choices**: Only 2 options instead of 5
- **Time commitment clarity**: Specific hours per week
- **Training week clarity**: 6-day vs 7-day weeks
- **Equipment awareness**: Adapts to user's available equipment

## 🚨 NO FALLBACKS RULE

### **Required Baseline Data**
- **Squat 1RM**: Required for lower body strength calculations
- **Deadlift 1RM**: Required for posterior chain strength
- **Bench Press 1RM**: Required for upper body strength calculations
- **Overhead Press 1RM**: Required for shoulder strength (if available)

### **System Behavior**
- **Throws clear errors** when baseline data is missing
- **Fails fast** - No silent failures or hidden assumptions
- **Requires validation** before plan generation
- **No partial plans** - Complete data or no plan

## 🎯 Future Considerations

### **Potential Additions**
- **Mobility sessions**: Could be added as separate option
- **Recovery protocols**: Could be integrated into strength sessions
- **Equipment variations**: More granular equipment options

### **Scientific Research Areas**
- **Strength-endurance interference**: Current understanding is solid
- **Optimal session spacing**: Current 48-72h is evidence-based
- **Upper body aesthetics**: Scientifically valuable for overall balance
- **Equipment substitutions**: Current logic handles this well

## 📚 References

### **Training Science Sources**
- **Polarized Training**: 80/20 easy/hard ratio for endurance athletes
- **Progressive Overload**: Systematic increases in volume/intensity
- **Recovery Windows**: 48-72h for functional strength, 24h minimum for upper body
- **Equipment Adaptation**: Evidence-based substitutions for available equipment

### **Implementation Files**
- **`src/services/StrengthTemplate.ts`**: Strength session generation and distribution
- **`src/services/TrainingEngine.ts`**: Validation and scientific rules
- **`src/components/SimplePlanBuilder.tsx`**: UI for strength option selection

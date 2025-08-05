# QUICK START FOR NEW CHAT

## 🚨 CURRENT STATUS: SESSION DISTRIBUTION BUG

**There's a critical bug in the session distribution logic that needs immediate attention.**

**The Problem:** Multiple sessions are being scheduled on the same day, violating polarized training principles.

**Evidence:** 
- Monday shows 2 sessions (SWIM + STRENGTH) - 66min total
- Tuesday shows 2 sessions (SWIM + STRENGTH) - 70min total  
- Wednesday shows 2 sessions (SWIM + STRENGTH) - 74min total

**User's Reaction:** "its a mess and this isnt a plan" and "2 strength training sessions on a monday no actual polarization"

### ✅ WHAT'S WORKING
- **Template-based approach** using base templates + multipliers
- **Sprint triathlon focus** (one distance at a time)
- **4-step assessment flow** (Distance → Strength → Time → Long Session Day)
- **Personalized targets** based on user baselines (FTP, paces, 1RM)
- **12-week progressive plans** with proper phase progression
- **Clean, minimal UI** with tabbed week navigation
- **Professional workout details** with warm-ups, cool-downs, and target ranges

### ❌ CRITICAL BUG
- **Session distribution logic** in `adjustLongSessionDays()` function
- **8 sessions** in template, **7 days** to distribute
- **Multiple sessions forced onto same day** (Monday: SWIM + STRENGTH)
- **Violates polarized training** principles

## 📋 CURRENT SYSTEM OVERVIEW

### 1. Core Files
- **`src/services/SimpleTrainingService.ts`**: Template-based algorithm
- **`src/components/SimplePlanBuilder.tsx`**: Main UI component
- **`src/contexts/AppContext.tsx`**: User baseline management
- **`src/components/TrainingBaselines.tsx`**: Baseline data collection

### 2. How It Works
1. **User completes baseline profile** (FTP, paces, 1RM values)
2. **4-step assessment**: Distance → Strength → Time → Long Session Day
3. **Template generation**: Base template + time multipliers + strength integration
4. **Personalization**: All targets based on user's actual baseline data
5. **Plan display**: Clean, tabbed interface with professional workout details

### 3. Scientific Foundation
- **Polarized training**: 80/20 easy/hard ratio enforcement
- **Research-based**: Uses actual coaching data (Lauersen et al., Rønnestad & Mujika, Beattie et al.)
- **Strength percentages**: 80-85% 1RM for compound strength (evidence-based)
- **Recovery spacing**: Proper session distribution to prevent overtraining
- **Progressive overload**: Systematic volume and intensity increases

## 🚨 IMMEDIATE PRIORITY: FIX SESSION DISTRIBUTION

### Critical Fix Needed
1. **Fix session distribution logic** in `adjustLongSessionDays()` function
2. **Debug why sessions appear on same day** despite `usedDays` checks
3. **Ensure proper distribution** of 8 balanced training sessions across 7 days
4. **Maintain polarized training** principles

### Key Files to Focus On
- **`src/services/SimpleTrainingService.ts`** - Lines 1463-1590 (adjustLongSessionDays function)
- **`src/components/SimplePlanBuilder.tsx`** - UI display logic

### Future Steps (After Bug Fix)
1. **Extend to Olympic distance** using the same template approach
2. **Enhance strength workouts** with more detailed prescriptions
3. **Add advanced features** like plan comparison and analytics
4. **Improve real-time sync** for better data integration

### Development Guidelines
1. **Maintain simplicity**: Keep the template-based approach
2. **Preserve personalization**: All plans must use user baselines
3. **Follow science**: Maintain evidence-based training principles
4. **Keep UI clean**: Minimal design with professional presentation

## 📊 Current Features

### ✅ Working Features
- **Template-based plan generation** for Sprint triathlon
- **Personalized workout targets** based on user baselines
- **Professional workout details** with proper structure
- **Clean, minimal UI** with tabbed week navigation
- **Strength integration** with 5 different options
- **Progressive overload** across 12-week plans
- **User baseline management** with comprehensive data collection

### 🔄 In Development
- **Additional distances** (Olympic, 70.3, Ironman)
- **Enhanced strength options** with more detailed workouts
- **Advanced analytics** for training progress tracking
- **Real-time data sync** across all integrations

## 🧪 Testing & Validation

### Scientific Validation
- **Polarized distribution**: 80/20 easy/hard ratio maintained
- **Recovery spacing**: Proper session distribution prevents overtraining
- **Progressive overload**: Systematic increases across training phases
- **Strength integration**: Evidence-based percentages and rest periods

### User Experience Validation
- **Clean interface**: No frames, boxes, or unnecessary elements
- **Professional workouts**: Detailed sessions with proper structure
- **Personalized targets**: All based on actual user data
- **Easy navigation**: Tabbed weeks and clear session organization

## 📚 Key Documentation

### Research Foundation
- **Lauersen et al. (2014)**: Injury prevention
- **Rønnestad & Mujika (2014)**: Cycling performance
- **Beattie et al. (2014)**: Running economy
- **Seiler & Tønnessen**: Polarized training model

### Architecture Files
- **`README.md`**: Main project overview
- **`DEVELOPMENT_STATUS.md`**: Current development status
- **`TRIATHLON_ALGORITHM_CONTEXT.md`**: Technical architecture details

## 🎯 Success Metrics

### Technical Success
- ✅ **Template system working**: Clean, scalable approach
- ✅ **Personalization working**: All targets based on user data
- ✅ **UI/UX working**: Professional, minimal interface
- ✅ **Scientific validation**: Evidence-based training principles

### User Success
- ✅ **Professional plans**: Detailed, realistic workouts
- ✅ **Easy to use**: Simple 4-step assessment flow
- ✅ **Personalized**: All targets match user's actual fitness
- ✅ **Scalable**: Template approach works for different users

## 🚫 DON'T DO
- Don't overcomplicate the template system
- Don't remove personalization features
- Don't ignore scientific validation
- Don't add unnecessary UI complexity
- **Don't change the training template** - it's scientifically sound (8 balanced sessions)
- **Don't focus on old algorithm files** - they're archived, not used
- **Don't modify UI components** - they handle multiple sessions fine

## 📞 IF YOU GET STUCK
1. **Read SESSION_DISTRIBUTION_BUG_CONTEXT.md** for complete bug analysis
2. **Focus on `adjustLongSessionDays()` function** in SimpleTrainingService.ts
3. **Debug why `usedDays` checks aren't working** - sessions still appear on same day
4. **Maintain scientific principles** - this is a balanced week of training, not just "sessions"

## 🎉 SUCCESS INDICATORS
- **Session distribution works properly** - no multiple sessions on same day
- **Polarized training principles maintained** - proper recovery spacing
- **Template system generates professional plans** - balanced week of training
- **All targets are personalized to user baselines** - FTP, paces, 1RM
- **UI remains clean and minimal** - handles multiple sessions when appropriate
- **Scientific principles are maintained** - evidence-based training

**The system needs the session distribution bug fixed to generate proper, polarized training plans!** 🎯 
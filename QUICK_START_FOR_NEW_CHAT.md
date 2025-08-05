# QUICK START FOR NEW CHAT

## 🎯 CURRENT STATUS: WORKING TEMPLATE-BASED SYSTEM

**We've successfully built a clean, template-based training plan generator that's working well!**

### ✅ WHAT'S WORKING
- **Template-based approach** using base templates + multipliers
- **Sprint triathlon focus** (one distance at a time)
- **4-step assessment flow** (Distance → Strength → Time → Long Session Day)
- **Personalized targets** based on user baselines (FTP, paces, 1RM)
- **12-week progressive plans** with proper phase progression
- **Clean, minimal UI** with tabbed week navigation
- **Professional workout details** with warm-ups, cool-downs, and target ranges

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

## 🚀 NEXT STEPS

### Immediate Priorities
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

## 📞 IF YOU GET STUCK
1. **Read the current documentation** thoroughly
2. **Understand the template approach** before making changes
3. **Test with real user data** to ensure personalization works
4. **Maintain scientific principles** in all modifications

## 🎉 SUCCESS INDICATORS
- Template system generates professional plans
- All targets are personalized to user baselines
- UI remains clean and minimal
- Scientific principles are maintained
- User experience is smooth and intuitive

**The system is working well with a clean, template-based approach that generates professional, personalized training plans!** 🎯 
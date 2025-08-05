# Efforts - Fitness Training App

A comprehensive fitness training application built with React, TypeScript, and Supabase, featuring **template-based training plan generation** and integration with fitness platforms like Garmin and Strava.

## 🎯 CURRENT STATUS: SIMPLE TEMPLATE-BASED SYSTEM

### ✅ WORKING SYSTEM: SimpleTrainingService
**We've successfully built a clean, template-based training plan generator:**

**Core System (`SimpleTrainingService.ts`):**
- **Template-based approach** using base templates + multipliers
- **Sprint triathlon focus** (one distance at a time)
- **4-step assessment flow** (Distance → Strength → Time → Long Session Day)
- **Personalized targets** based on user baselines (FTP, paces, 1RM)
- **12-week progressive plans** with proper phase progression

**UI (`SimplePlanBuilder.tsx`):**
- **Clean, minimal interface** (no cards, boxes, frames)
- **Tabbed week navigation** for plan display
- **Professional workout details** with warm-ups, cool-downs, and target ranges
- **Rounded weights** for easy plate math
- **Proper session distribution** around user's chosen long day

### 🏆 What We've Achieved
1. **Scientifically Sound Plans**: Based on real coaching data and research
2. **Personalized Targets**: All paces, power, and weights based on user baselines
3. **Professional Workouts**: Detailed sessions with proper structure
4. **Clean UI**: Minimal, tabbed interface that looks professional
5. **Proper Recovery**: Sessions distributed around long day with recovery spacing

## 🧠 Current Architecture

### **Template-Based System**
**Core Service**: `src/services/SimpleTrainingService.ts`
- **Base Templates**: Sprint triathlon with 6-8 sessions per week
- **Time Multipliers**: Scale sessions based on user's time commitment
- **Strength Integration**: 5 strength options (none, traditional, compound, cowboy_endurance, cowboy_compound)
- **Personalization**: User baselines drive all targets and weights
- **Progressive Overload**: 12-week plans with Base → Build → Peak → Taper phases

**UI Integration**: `src/components/SimplePlanBuilder.tsx`
- **4-Step Assessment**: Distance → Strength → Time → Long Session Day
- **Plan Display**: Tabbed weeks with professional workout details
- **User Baselines**: Loaded from user profile (no manual input)
- **Validation**: Strict enforcement of required baseline data

### **Scientific Foundation**
- **Polarized Training**: 80/20 easy/hard ratio enforcement
- **Research-Based**: Uses actual coaching data (Lauersen et al., Rønnestad & Mujika, Beattie et al.)
- **Strength Percentages**: 80-85% 1RM for compound strength (evidence-based)
- **Recovery Spacing**: Proper session distribution to prevent overtraining
- **Progressive Overload**: Systematic volume and intensity increases

## 🎨 User Experience

### **Assessment Flow**
1. **Distance**: Sprint Triathlon (currently implemented)
2. **Strength**: 5 options from none to cowboy compound
3. **Time**: 4 levels (minimum to hardcore) with clear hour ranges
4. **Long Session Day**: User picks their preferred long workout day

### **Plan Display**
- **Professional Layout**: Clean, minimal design with tabbed weeks
- **Detailed Workouts**: Warm-ups, main sets, cool-downs with target ranges
- **Personalized Targets**: All based on user's actual baseline data
- **Rounded Weights**: Easy plate math for strength workouts
- **Proper Spacing**: Sessions distributed around long day with recovery

### **Data Integration**
- **User Baselines**: FTP, 5K pace, easy pace, swim pace, 1RM values
- **No Fallbacks**: Strict enforcement of required data
- **Age-Based HR**: Heart rate zones calculated from user age
- **Imperial Units**: All paces and weights in imperial units

## 🔧 Technical Architecture

### **Frontend Stack**
- **React + TypeScript**: Modern, type-safe development
- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: Professional component library
- **Vite**: Fast development and building

### **Backend Services**
- **Supabase**: Database, authentication, real-time subscriptions
- **User Profiles**: Comprehensive baseline data storage
- **Plan Storage**: Generated plans saved to user accounts

### **External Integrations**
- **Garmin Connect**: OAuth flow, workout import, webhook processing
- **Strava**: OAuth flow, workout import, data preview
- **FIT File Import**: Complete workout data extraction

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

## 🚀 Development Status

### **Current Focus**
- **Sprint triathlon plans** are working and professional
- **Template system** is proven and scalable
- **UI/UX** is clean and user-friendly
- **Scientific foundation** is sound and evidence-based

### **Next Steps**
1. **Extend to other distances** using the same template approach
2. **Enhance strength workouts** with more detailed prescriptions
3. **Add advanced features** like plan comparison and analytics
4. **Improve real-time sync** for better data integration

## 🧪 Testing & Validation

### **Scientific Validation**
- **Polarized distribution**: 80/20 easy/hard ratio maintained
- **Recovery spacing**: Proper session distribution prevents overtraining
- **Progressive overload**: Systematic increases across training phases
- **Strength integration**: Evidence-based percentages and rest periods

### **User Experience Validation**
- **Clean interface**: No frames, boxes, or unnecessary elements
- **Professional workouts**: Detailed sessions with proper structure
- **Personalized targets**: All based on actual user data
- **Easy navigation**: Tabbed weeks and clear session organization

## 📚 Documentation

### **Key Files**
- **`src/services/SimpleTrainingService.ts`**: Core template-based algorithm
- **`src/components/SimplePlanBuilder.tsx`**: Main UI component
- **`src/contexts/AppContext.tsx`**: User baseline management
- **`src/components/TrainingBaselines.tsx`**: Baseline data collection

### **Research Foundation**
- **Lauersen et al. (2014)**: Injury prevention
- **Rønnestad & Mujika (2014)**: Cycling performance
- **Beattie et al. (2014)**: Running economy
- **Seiler & Tønnessen**: Polarized training model

## 🎯 Success Metrics

### **Technical Success**
- ✅ **Template system working**: Clean, scalable approach
- ✅ **Personalization working**: All targets based on user data
- ✅ **UI/UX working**: Professional, minimal interface
- ✅ **Scientific validation**: Evidence-based training principles

### **User Success**
- ✅ **Professional plans**: Detailed, realistic workouts
- ✅ **Easy to use**: Simple 4-step assessment flow
- ✅ **Personalized**: All targets match user's actual fitness
- ✅ **Scalable**: Template approach works for different users

## 🚀 Deployment

### **Frontend Deployment**
- **Method**: Git-based deployment
- **Process**: Commit and push to main branch
- **Automatic**: Vercel handles deployment

### **Backend Deployment**
- **Supabase**: Database and authentication
- **Edge Functions**: Webhook processing for real-time data

## 📞 Support & Development

### **Current State**
- **Sprint triathlon plans**: Fully functional and professional
- **Template system**: Proven and ready for expansion
- **UI/UX**: Clean, minimal, and user-friendly
- **Scientific foundation**: Sound and evidence-based

### **Development Guidelines**
1. **Maintain simplicity**: Keep the template-based approach
2. **Preserve personalization**: All plans must use user baselines
3. **Follow science**: Maintain evidence-based training principles
4. **Keep UI clean**: Minimal design with professional presentation

**The system is working well with a clean, template-based approach that generates professional, personalized training plans!** 🎯

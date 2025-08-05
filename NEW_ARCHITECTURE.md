# Current Architecture: Template-Based Training Plan System

## Overview

This document outlines our current **template-based approach** that generates personalized, science-based training plans using base templates, multipliers, and user baseline data.

## Core Philosophy

### **"Simple and Effective" Instead of "Complex and Over-Engineered"**
- **Template-based approach** using base templates + multipliers
- **Personalized targets** based on user baseline data
- **Scientific validation** with evidence-based training principles
- **Clean, minimal UI** with professional presentation

### **Template-Based Instead of Complex Algorithms**
- **Pre-defined base templates** with scientific foundation
- **Time multipliers** to scale based on user commitment
- **Strength integration** with evidence-based percentages
- **Progressive overload** across training phases

## Current System: Sprint Triathlon Focus

### **4-Step Assessment Flow**
1. **Distance**: Sprint Triathlon (currently implemented)
2. **Strength**: 5 options from none to cowboy compound
3. **Time**: 4 levels (minimum to hardcore) with clear hour ranges
4. **Long Session Day**: User picks their preferred long workout day

### **Template Generation Process**
1. **Base Template**: Sprint triathlon with 6-8 sessions per week
2. **Time Scaling**: Apply multipliers based on user's time commitment
3. **Strength Integration**: Add strength sessions with proper spacing
4. **Personalization**: All targets based on user baseline data
5. **Session Distribution**: Reverse engineer around user's chosen long day
6. **Progressive Overload**: Create 12-week plans with proper phases

## Strength Training Options

### **1. None** (0 hours, pure endurance)
- **Focus:** Pure endurance training only
- **Time:** 0 hours strength training
- **Evidence:** Many successful triathletes train this way

### **2. Traditional** (2x/week, +1.5 hours)
- **Focus:** Traditional strength training for triathletes
- **Exercises:** Squats, deadlifts, lunges, plyometrics
- **Time:** 2x/week, 45 min sessions
- **Evidence:** Good research support for triathlon performance
- **Recovery:** 24-48 hours between sessions

### **3. Compound** (2x/week, +2.0 hours)
- **Focus:** Heavy compound lifts with evidence-based percentages
- **Exercises:** Squats (80-85% 1RM), deadlifts (80-85% 1RM), bench press (75-80% 1RM)
- **Time:** 2x/week, 60 min sessions
- **Evidence:** Standard strength training protocols
- **Recovery:** 48-72 hours between sessions

### **4. Cowboy Endurance** (3x/week, +3.0 hours)
- **Days 1-2:** Traditional strength training
- **Day 3:** Upper body focus for aesthetics and balanced strength
- **Time:** 3x/week, 60 min sessions
- **Evidence:** Mixed approach with some research support
- **Recovery:** 24-48 hours between sessions

### **5. Cowboy Compound** (3x/week, +3.5 hours)
- **Days 1-2:** Compound strength (heavy compounds)
- **Day 3:** Upper body focus for aesthetics and balanced strength
- **Time:** 3x/week, 70 min sessions
- **Evidence:** Experimental approach, not well-studied for triathlon
- **Recovery:** 48-72 hours between sessions

## Time Commitment Levels

### **Sprint Triathlon Time Options**
- **Minimum** (4.8 hours/week): Event completion, basic fitness
- **Moderate** (6.0 hours/week): Performance improvement
- **Serious** (7.2 hours/week): Competitive performance
- **Hardcore** (8.4 hours/week): Elite performance

### **Strength Additions**
- **None**: +0 hours
- **Traditional**: +1.5 hours
- **Compound**: +2.0 hours
- **Cowboy Endurance**: +3.0 hours
- **Cowboy Compound**: +3.5 hours

## Personalization System

### **User Baseline Integration**
- **FTP**: Bike power targets (65-85% FTP for endurance)
- **5K Pace**: Run pace targets (tempo and threshold paces)
- **Easy Pace**: Recovery and endurance run paces
- **Swim Pace**: Swim targets (recovery and endurance)
- **1RM Values**: Strength workout weights (80-85% 1RM for compounds)
- **Age**: Heart rate zone calculations (220-age formula)

### **Target Calculation Examples**
```typescript
// Bike power targets
const easyBikePower = userBaselines.ftp ? Math.round(userBaselines.ftp * 0.65) : 160;
const enduranceBikePower = userBaselines.ftp ? Math.round(userBaselines.ftp * 0.75) : 185;

// Run pace targets
const easyRunPace = this.calculateEasyRunPace(userBaselines);
const tempoRunPace = this.calculateTempoRunPace(userBaselines);

// Strength weights
const squat = Math.round(userBaselines.squat1RM * 0.8 / 5) * 5; // 80% 1RM, rounded to 5s
```

## Scientific Foundation

### **Evidence-Based Training**
- **Lauersen et al. (2014)**: Injury prevention
- **Rønnestad & Mujika (2014)**: Cycling performance
- **Beattie et al. (2014)**: Running economy
- **Seiler & Tønnessen**: Polarized training model

### **Training Principles**
- **Polarized training**: 80/20 easy/hard ratio enforcement
- **Progressive overload**: Systematic volume and intensity increases
- **Recovery spacing**: Proper session distribution prevents overtraining
- **Strength percentages**: 80-85% 1RM for compound strength (evidence-based)

## UI/UX Design

### **Assessment Flow**
- **Clean, minimal interface** (no cards, boxes, frames)
- **4-step process** with clear explanations
- **Professional presentation** with scientific backing
- **Personalized recommendations** based on user data

### **Plan Display**
- **Tabbed week navigation** for easy browsing
- **Professional workout details** with warm-ups, main sets, cool-downs
- **Target ranges** instead of single numbers (e.g., "10:30-10:45/mile")
- **Rounded weights** for easy plate math
- **Proper session spacing** around user's chosen long day

## Current Implementation

### **Core Files**
- **`src/services/SimpleTrainingService.ts`**: Template-based algorithm
- **`src/components/SimplePlanBuilder.tsx`**: Main UI component
- **`src/contexts/AppContext.tsx`**: User baseline management
- **`src/components/TrainingBaselines.tsx`**: Baseline data collection

### **Key Features**
- **Template-based approach** using base templates + multipliers
- **Personalized targets** based on user baselines
- **Professional workout details** with proper structure
- **Clean, minimal UI** with tabbed week navigation
- **Strength integration** with 5 different options
- **Progressive overload** across 12-week plans

## Next Steps

### **Immediate Priorities**
1. **Extend to Olympic distance** using the same template approach
2. **Enhance strength workouts** with more detailed prescriptions
3. **Add advanced features** like plan comparison and analytics
4. **Improve real-time sync** for better data integration

### **Development Guidelines**
1. **Maintain simplicity**: Keep the template-based approach
2. **Preserve personalization**: All plans must use user baselines
3. **Follow science**: Maintain evidence-based training principles
4. **Keep UI clean**: Minimal design with professional presentation

## Success Metrics

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

**The system is working well with a clean, template-based approach that generates professional, personalized training plans!** 🎯 
# KITCHEN AUDIT - CURRENT ALGORITHM ARCHITECTURE

## 🎯 WHAT WE'RE TRYING TO ACHIEVE

**We're building a deterministic, algorithm-based training plan system where:**
- **Every user gets a personalized plan** based on their specific baseline data and preferences
- **No AI dependencies** - pure mathematical algorithms with science-based templates
- **The system applies evidence-based training science** to the user's unique combination of baseline data + assessment answers
- **No fallbacks, no assumptions** - only real user data drives the plan

**The algorithm creates different "training worlds" based on combinations like:**
- User A: 70.3 + Cowboy Compound + 6 days + 12 hours = **World A** (strength-heavy, polarized)
- User B: Olympic + Power Development + 5 days + 8 hours = **World B** (power-focused, structured)
- User C: Sprint + Standard + 4 days + 6 hours = **World C** (balanced, efficient)

## ✅ CURRENT STATUS - ALGORITHM-BASED SYSTEM

### **1. Assessment System Standardized**
- **`AlgorithmPlanBuilder.tsx`** - Single step-based assessment system (active)
- **`PlanBuilder.tsx`** - Top-level component (removed Manual Build tab)
- **`AlgorithmTrainingService.ts`** - Orchestrates algorithm calls and data conversion

### **2. Data Flow Cleaned**
- **Standardized data structure** sent to algorithms
- **Assessment validation** enforced before plan generation
- **No more auto-generation** with empty responses

### **3. Algorithm Science-Based Foundation**
- **Evidence-based training methodologies** (polarized, pyramidal, threshold)
- **Scientific intensity zones** (Coggan's Power Training Zones)
- **Distance-appropriate templates** with proper session distribution

## 🧠 HOW ALGORITHM WORKS NOW

### **Unified Polarized Architecture:**

#### **Step 1: Template Selection (`getBaseTemplateForDistance`)**
- **Receives:** Distance + training frequency
- **Applies:** Distance-appropriate base templates (4-6 days based on distance)
- **Returns:** Base session structure with proper recovery spacing
- **Science Base:** Distance-specific minimum requirements and session distribution

#### **Step 2: Polarized Distribution (`applyPolarizedDistribution`)**
- **Receives:** Base template + target hours
- **Applies:** 80% easy (Zone 1-2), 20% hard (Zone 3-4) distribution
- **Returns:** Intensity-balanced sessions scaled to target hours
- **Science Base:** Seiler & Tønnessen 80/20 polarized model

#### **Step 3: Strength Integration (`addStrengthSessionsToTemplate`)**
- **Receives:** Polarized sessions + strength option
- **Applies:** Non-consecutive strength placement with proper recovery
- **Returns:** Integrated strength sessions with variety (Cowboy options get 3x/week)
- **Science Base:** Strength training for endurance athletes (Bompa, NSCA)

#### **Step 4: Discipline Focus (`applyDisciplineFocusToTemplate`)**
- **Receives:** Integrated sessions + discipline focus
- **Applies:** Volume adjustments for focused discipline
- **Returns:** Discipline-optimized sessions
- **Science Base:** Specificity principle in training

#### **Step 5: Long Session Preferences (`applyLongSessionPreferences`)**
- **Receives:** Focused sessions + user preferences
- **Applies:** Weekend vs weekday long session placement
- **Returns:** User-customized session timing
- **Science Base:** Training timing optimization

#### **Step 6: Final Scaling & Detailed Workouts**
- **Receives:** Customized sessions + user baselines
- **Applies:** User-specific paces, FTP, 1RM values
- **Returns:** Personalized workout prescriptions with Garmin compatibility
- **Science Base:** Individualization principle

### **Distance-Based Template Architecture:**

#### **SPRINT (4-6 days)**
- **Base Template:** 4 days (Mon-Thu)
- **Add Sessions:** Run (Sat), Brick (Sun) for 5-6 days
- **Volume:** 6-8 hours/week
- **Science:** High-intensity focus, shorter sessions

#### **OLYMPIC (5-6 days)**
- **Base Template:** 5 days (Mon-Fri)
- **Add Sessions:** Run (Sat), Brick (Sun) for 6 days
- **Volume:** 8-12 hours/week
- **Science:** Balanced intensity, moderate sessions

#### **70.3 (5-7 days)**
- **Base Template:** 5 days (Mon-Fri)
- **Add Sessions:** Brick (Sat), Run (Sun) for 6-7 days
- **Volume:** 10-15 hours/week
- **Science:** Endurance focus, longer sessions

#### **IRONMAN (6-7 days)**
- **Base Template:** 6 days (Mon-Sat)
- **Add Sessions:** Run (Sun) for 7 days
- **Volume:** 12-20 hours/week
- **Science:** Maximum endurance, longest sessions

### **Strength Integration Options:**

#### **POWER DEVELOPMENT (2x/week)**
- **Focus:** Plyometrics, explosive movements
- **Placement:** Tuesday, Friday (non-consecutive)
- **Science:** Power training for endurance performance

#### **STABILITY FOCUS (2x/week)**
- **Focus:** Single-leg stability, core work
- **Placement:** Tuesday, Friday (non-consecutive)
- **Science:** Injury prevention, balance

#### **COMPOUND STRENGTH (2x/week)**
- **Focus:** Heavy compound lifts
- **Placement:** Tuesday, Friday (non-consecutive)
- **Science:** Strength endurance, functional movement

#### **COWBOY ENDURANCE (3x/week)**
- **Focus:** Endurance strength + upper body aesthetics
- **Placement:** Tuesday, Thursday, Sunday
- **Science:** Traditional endurance strength + "race course aesthetics"

#### **COWBOY COMPOUND (3x/week)**
- **Focus:** Heavy compounds + upper body aesthetics
- **Placement:** Tuesday, Thursday, Sunday
- **Science:** Compound strength + "race course aesthetics"

### **Intensity Zone Application (Coggan's Power Training Zones):**
- **Zone 1 (Recovery):** <55% FTP, <68% HRmax
- **Zone 2 (Aerobic):** 55-75% FTP, 68-83% HRmax
- **Zone 3 (Tempo):** 75-90% FTP, 83-94% HRmax
- **Zone 4 (Threshold):** 90-105% FTP, 94-105% HRmax
- **Zone 5 (VO2max):** 105-120% FTP, >105% HRmax

## 📊 CURRENT DATA FLOW (WORKING)

```
User completes assessment (steps 0-6)
↓
Validation ensures all required data present
↓
Algorithm Plan Generation
- getBaseTemplateForDistance (distance-appropriate template)
- applyPolarizedDistribution (80/20 intensity)
- addStrengthSessionsToTemplate (non-consecutive placement)
- applyDisciplineFocusToTemplate (volume adjustments)
- applyLongSessionPreferences (user timing)
- Final scaling with user baselines
↓
Plan displayed with specific workouts using user's baseline data
↓
StrengthLogger integration for friction-free logging
```

## 🎯 UI COMPONENTS

### **Core Components:**
- **`AlgorithmPlanBuilder.tsx`** - Main assessment and plan display
- **`WorkoutTabs.tsx`** - Tabbed display for multiple sessions per day
- **`StrengthLogger.tsx`** - Strength workout logging interface
- **`AppLayout.tsx`** - Main layout orchestration

### **Assessment Flow:**
1. **Category & Distance** - Triathlon distances with discipline options
2. **Training Frequency** - 4-7 days based on distance requirements
3. **Strength Integration** - 5 strength options with science-based descriptions
4. **Discipline Focus** - 8 focus options for specific discipline emphasis
5. **Weekly Hours** - Distance-appropriate volume selection
6. **Long Session Preferences** - Weekend vs weekday timing
7. **Plan Generation** - Algorithm-based plan creation

### **No Fallbacks Protocol:**
- **Validation enforced** before plan generation
- **Errors thrown** if required data missing
- **No generic plans** - only personalized plans based on real data

## 🚀 CURRENT STATUS

✅ **Algorithm-based system implemented**
✅ **Assessment system standardized**
✅ **Data flow cleaned**
✅ **Science-based foundation established**
✅ **UI language improved**
✅ **No fallbacks protocol implemented**
✅ **Evidence-based training methodologies applied**
✅ **Distance-appropriate templates working**
✅ **Strength integration with proper spacing**
✅ **Weekend sessions properly added for 6+ days**

**The system now creates truly personalized, science-based training plans using deterministic algorithms and actual user data.**

## 💡 KEY INSIGHT
**The kitchen now has a single, unified algorithm architecture that builds up from distance-appropriate bases instead of cutting down from arbitrary templates. This ensures proper session distribution, weekend training, and user preference honoring.**

**The goal is to create a system where algorithms receive real user data and create truly personalized training worlds, not generic plans.**

---

**This note captures the current algorithm-based architecture. The system creates personalized training plans using deterministic algorithms and evidence-based training science.** 
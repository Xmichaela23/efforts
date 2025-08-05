# TRIATHLON TRAINING ALGORITHM BLUEPRINT
## Complete Engineering Specification for Personalized Polarized Training Plans

---

## 🎯 SYSTEM OVERVIEW

### **End Goal:**
Create personalized, polarized triathlon training plans that:
- Maintain 80/20 polarized training distribution
- Allow user focus and scheduling flexibility
- Integrate strength training intelligently
- Use user baselines for personalization
- Follow evidence-based training science

### **Core Principles:**
- **No AI dependencies** - pure mathematical algorithms
- **No fallbacks** - only real user data drives plans
- **Science-based** - evidence-based training methodologies
- **Personalized** - user baselines determine intensity and progression

---

## 📊 USER ASSESSMENT FLOW

### **Assessment Questions & Options:**

#### **1. Distance Selection**
- **Sprint** (750m swim, 20km bike, 5km run)
- **Olympic** (1.5km swim, 40km bike, 10km run)
- **70.3** (1.9km swim, 90km bike, 21km run)
- **Ironman** (3.8km swim, 180km bike, 42km run)

#### **2. Strength Integration**
- **None** (0 hours, pure endurance)
- **Power Development** (2x/week, +1-1.5 hours)
- **Stability Focus** (2x/week, +1-1.2 hours)
- **Compound Strength** (2x/week, +1.5-2 hours)
- **Cowboy Endurance** (3x/week + upper body, +2.5-3 hours)
- **Cowboy Compound** (3x/week + upper body, +3-3.5 hours)

#### **3. Discipline Focus**
- **Standard** (balanced across all disciplines)
- **Swim Speed** (additional swim session)
- **Swim Endurance** (longer swim sessions)
- **Bike Speed** (additional bike session)
- **Bike Endurance** (longer bike sessions)
- **Run Speed** (additional run session)
- **Run Endurance** (longer run sessions)
- **Bike+Run Speed** (additional bike and run sessions)

#### **4. Training Frequency**
- **4 days/week** (minimum for all distances)
- **5 days/week** (recommended for Olympic+)
- **6 days/week** (recommended for 70.3+)
- **7 days/week** (maximum for Ironman)

#### **5. Weekly Hours**
- **Sprint**: 4-8 hours
- **Olympic**: 6-12 hours
- **70.3**: 8-15 hours
- **Ironman**: 12-20 hours

#### **6. Long Session Preferences**
- **Days**: Monday through Sunday
- **Order**: Bike first, then run OR Run first, then bike

### **User Baseline Data:**
- **FTP** (Functional Threshold Power)
- **5K Pace** (fastest 5K time)
- **Easy Pace** (Zone 2 conversational pace)
- **Swim Pace** (100m pace)
- **1RM Values** (squat, deadlift, bench press)
- **Equipment** (running, cycling, swimming, strength)

---

## 🏗️ TEMPLATE SPECIFICATIONS

### **Distance-Based Base Templates:**

#### **SPRINT TEMPLATE (4-6 days)**
**Essential Sessions:**
- **Long Bike** (45-60 min, Zone 2)
- **Long Run** (30-45 min, Zone 2)
- **Brick Session** (30 min bike + 15 min run, Zone 3)
- **Swim Session** (30 min, technique/endurance)
- **Recovery Session** (30 min, Zone 1)

**Session Distribution:**
- **4 days**: Mon (swim), Wed (bike), Fri (run), Sun (brick)
- **5 days**: + Sat (long run)
- **6 days**: + Thu (recovery)

#### **OLYMPIC TEMPLATE (5-6 days)**
**Essential Sessions:**
- **Long Bike** (60-90 min, Zone 2)
- **Long Run** (45-60 min, Zone 2)
- **Brick Session** (45 min bike + 20 min run, Zone 3)
- **Swim Session** (45 min, technique/endurance)
- **Tempo Session** (30-45 min, Zone 3)
- **Recovery Session** (30-45 min, Zone 1)

**Session Distribution:**
- **5 days**: Mon (swim), Tue (bike), Thu (run), Sat (brick), Sun (recovery)
- **6 days**: + Wed (tempo)

#### **70.3 TEMPLATE (5-7 days)**
**Essential Sessions:**
- **Long Bike** (90-120 min, Zone 2)
- **Long Run** (60-90 min, Zone 2)
- **Brick Session** (60 min bike + 30 min run, Zone 3)
- **Swim Session** (60 min, technique/endurance)
- **Tempo Session** (45-60 min, Zone 3)
- **Recovery Session** (45 min, Zone 1)

**Session Distribution:**
- **5 days**: Mon (swim), Tue (bike), Thu (run), Sat (brick), Sun (recovery)
- **6 days**: + Wed (tempo)
- **7 days**: + Fri (long run)

#### **IRONMAN TEMPLATE (6-7 days)**
**Essential Sessions:**
- **Long Bike** (120-180 min, Zone 2)
- **Long Run** (90-120 min, Zone 2)
- **Brick Session** (90 min bike + 45 min run, Zone 3)
- **Swim Session** (75 min, technique/endurance)
- **Tempo Session** (60-90 min, Zone 3)
- **Recovery Session** (60 min, Zone 1)

**Session Distribution:**
- **6 days**: Mon (swim), Tue (bike), Thu (run), Sat (brick), Sun (recovery)
- **7 days**: + Wed (tempo)

---

## 🔄 ALGORITHM FLOW SPECIFICATION

### **Step 1: Template Selection**
**Input:** Distance + Training Frequency
**Process:** Select appropriate base template
**Output:** Base session structure with proper recovery spacing
**Validation:** Ensure minimum sessions for distance

### **Step 2: Frequency Adjustment**
**Input:** Base template + User frequency
**Process:** Add sessions for higher frequency (5-7 days)
**Output:** Frequency-adjusted template
**Rules:** 
- Add long run for 5+ days
- Add brick session for 6+ days
- Add recovery session for 7 days

### **Step 3: Polarized Distribution**
**Input:** Frequency-adjusted template + Target hours
**Process:** Apply 80/20 distribution (80% easy, 20% hard)
**Output:** Intensity-balanced sessions
**Rules:**
- 80% Zone 1-2 (easy/recovery)
- 20% Zone 3-4 (tempo/threshold)
- Scale sessions to target hours

### **Step 4: Strength Integration**
**Input:** Polarized sessions + Strength option
**Process:** Add strength sessions with proper recovery
**Output:** Integrated strength sessions
**Rules:**
- **None**: No strength sessions
- **Power/Stability**: 2x/week, non-consecutive days
- **Compound**: 2x/week, 48h recovery from hard sessions
- **Cowboy**: 3x/week, 24h recovery from hard sessions

### **Step 5: Discipline Focus**
**Input:** Integrated sessions + Discipline focus
**Process:** Add/adjust sessions for focused discipline
**Output:** Discipline-optimized sessions
**Rules:**
- **Standard**: No changes
- **Speed focus**: Add tempo session for discipline
- **Endurance focus**: Extend existing sessions
- **Bike+Run**: Add sessions for both disciplines

### **Step 6: User Preferences**
**Input:** Focused sessions + User preferences
**Process:** Apply long session day preferences
**Output:** User-customized session timing
**Rules:**
- Place long sessions on preferred days
- Maintain recovery spacing
- Respect user day preferences

### **Step 7: Personalization**
**Input:** Customized sessions + User baselines
**Process:** Apply user-specific intensities and paces
**Output:** Personalized workout prescriptions
**Rules:**
- Calculate intensity zones from FTP/5K pace
- Apply user paces to sessions
- Scale weights from 1RM values

### **Step 8: Validation**
**Input:** Final sessions
**Process:** Validate recovery spacing and training principles
**Output:** Validated training plan
**Rules:**
- No consecutive hard sessions
- Proper recovery between strength and endurance
- Maintain polarized distribution

---

## 🎯 COMBINATION MATRIX

### **Valid Combinations by Distance:**

#### **SPRINT (4-6 days, 4-8 hours)**
**Valid Strength Options:**
- None, Power Development, Stability Focus, Cowboy Endurance

**Valid Focus Options:**
- Standard, Swim Speed, Bike Speed, Run Speed

**Constraints:**
- Minimum 4 days
- Maximum 6 days
- 4-8 hours/week

#### **OLYMPIC (5-6 days, 6-12 hours)**
**Valid Strength Options:**
- All options (None through Cowboy Compound)

**Valid Focus Options:**
- All options (Standard through Bike+Run Speed)

**Constraints:**
- Minimum 5 days
- Maximum 6 days
- 6-12 hours/week

#### **70.3 (5-7 days, 8-15 hours)**
**Valid Strength Options:**
- None, Power Development, Stability Focus, Compound Strength, Cowboy Endurance

**Valid Focus Options:**
- All options (Standard through Bike+Run Speed)

**Constraints:**
- Minimum 5 days
- Maximum 7 days
- 8-15 hours/week

#### **IRONMAN (6-7 days, 12-20 hours)**
**Valid Strength Options:**
- None, Power Development, Stability Focus

**Valid Focus Options:**
- Standard, Swim Speed, Bike Speed, Run Speed

**Constraints:**
- Minimum 6 days
- Maximum 7 days
- 12-20 hours/week

### **Invalid Combinations:**
- **Ironman + Cowboy Compound**: Too demanding for Ironman distance
- **Sprint + 7 days**: Sprint doesn't need 7 days
- **Ironman + 4 days**: Ironman requires minimum 6 days
- **Any distance + insufficient hours**: Below minimum for distance

---

## 🔧 PERSONALIZATION LOGIC

### **Intensity Zone Calculation:**
**From FTP:**
- Zone 1 (Recovery): <55% FTP
- Zone 2 (Aerobic): 55-75% FTP
- Zone 3 (Tempo): 75-90% FTP
- Zone 4 (Threshold): 90-105% FTP
- Zone 5 (VO2max): 105-120% FTP

**From 5K Pace:**
- Calculate threshold pace from 5K pace
- Derive other zones from threshold
- Apply to running sessions

**From Swim Pace:**
- Calculate threshold pace from 100m pace
- Derive other zones from threshold
- Apply to swimming sessions

### **Strength Personalization:**
**From 1RM Values:**
- Calculate training weights (70-85% of 1RM)
- Scale reps based on strength type
- Adjust volume based on user level

### **Progression Logic:**
**3:1 Loading Pattern:**
- 3 weeks of progressive overload
- 1 week of reduced volume (recovery)
- Adjust intensity and volume by phase

**Phase-Based Progression:**
- **Base**: Build aerobic foundation
- **Build**: Increase intensity and volume
- **Peak**: Maximize race-specific fitness
- **Taper**: Reduce volume, maintain intensity

---

## 🛡️ RECOVERY MANAGEMENT

### **Recovery Requirements:**
- **Tempo Sessions**: 24 hours recovery
- **Threshold Sessions**: 48 hours recovery
- **Brick Sessions**: 48 hours recovery
- **Power Development**: 24 hours recovery
- **Compound Strength**: 48 hours recovery
- **Cowboy Sessions**: 24 hours recovery

### **Recovery Conflicts:**
- **Hard + Hard**: Minimum 24 hours between
- **Strength + Hard**: Minimum 24 hours between
- **Brick + Hard**: Minimum 48 hours between
- **Cowboy + Hard**: Minimum 24 hours between

### **Recovery Resolution:**
1. **Convert to Recovery**: Change one session to recovery
2. **Move Session**: Relocate session to different day
3. **Reduce Intensity**: Lower intensity of one session
4. **Add Recovery Day**: Insert recovery day between sessions

---

## ⚠️ ERROR HANDLING

### **Validation Rules:**
- **Required Data**: FTP, 5K pace, distance, strength option
- **1RM Data**: Required for strength training
- **Distance Constraints**: Respect minimum/maximum for distance
- **Recovery Conflicts**: Detect and resolve conflicts
- **Polarized Distribution**: Maintain 80/20 ratio

### **Error Types:**
- **Missing Data**: Required user data not provided
- **Invalid Combination**: User selections conflict
- **Recovery Conflict**: Sessions too close together
- **Distribution Error**: Polarized ratio not maintained

### **Error Resolution:**
- **Missing Data**: Prompt user for required information
- **Invalid Combination**: Suggest valid alternatives
- **Recovery Conflict**: Automatically resolve conflicts
- **Distribution Error**: Adjust session intensities

---

## 🎯 SUCCESS CRITERIA

### **A Valid Training Plan Must:**
1. **Maintain polarized distribution** (80/20)
2. **Include essential sessions** for distance
3. **Respect recovery spacing** between hard sessions
4. **Honor user preferences** where possible
5. **Apply user baselines** for personalization
6. **Follow training science** principles
7. **Be complete and actionable** for user

### **Quality Metrics:**
- **Session completeness**: All essential sessions included
- **Recovery compliance**: No recovery conflicts
- **Polarized accuracy**: 80/20 distribution maintained
- **Personalization**: User baselines properly applied
- **Science compliance**: Evidence-based training principles

---

## 🚀 IMPLEMENTATION ROADMAP

### **Phase 1: Core Template System**
- Implement base templates for all distances
- Add frequency adjustment logic
- Implement polarized distribution

### **Phase 2: Integration Systems**
- Add strength integration logic
- Implement discipline focus
- Add user preference handling

### **Phase 3: Personalization**
- Implement intensity zone calculation
- Add baseline application
- Implement progression logic

### **Phase 4: Validation & Recovery**
- Add recovery management system
- Implement conflict resolution
- Add comprehensive validation

### **Phase 5: Testing & Refinement**
- Test all valid combinations
- Validate against training science
- Refine based on real-world usage

---

**This blueprint provides the complete engineering specification for building a robust, science-based triathlon training algorithm system.** 
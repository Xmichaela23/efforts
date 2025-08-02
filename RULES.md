# Training Plan Generation Rules

## Core Principle: Science-Driven, User-Centered Coaching

**The AI must act as a knowledgeable coach who applies training science to create personalized plans based on the athlete's actual data and preferences.**

**Key Principles:**
- **No fallbacks** - never use default values or assumptions
- **No hardcoding** - every parameter must come from user data
- **Science-based** - all training techniques must be grounded in training science
- **User-driven** - volume and intensity based on user baselines and preferences
- **Flexible** - adapt to any amount of user data provided

## 🚫 NEVER Hardcode or Use Fallbacks

### Forbidden Practices:
- ❌ **Default values**: No fallbacks to generic numbers (5 days, 12 hours, etc.)
- ❌ **Conservative assumptions**: Don't assume "conservative" - use athlete's actual fitness level
- ❌ **Generic progressions**: Don't use one-size-fits-all progression patterns
- ❌ **Fixed volumes**: Don't default to standard weekly volumes
- ❌ **Generic intensities**: Don't use "moderate pace" - use exact athlete paces

### Error Handling:
- ✅ **Throw errors** for invalid inputs instead of using fallbacks
- ✅ **Validate data** before processing
- ✅ **Log warnings** for missing data but don't assume defaults

## ✅ ALWAYS Use User Data

### Required Data Sources:
**ALL available user data must be used, including but not limited to:**
- **Training preferences**: Frequency, duration, availability, session preferences
- **Performance baselines**: FTP, paces, 1RMs, current fitness metrics
- **Equipment access**: Available strength equipment, training facilities
- **Training philosophy**: AI-analyzed training approach (polarized, pyramid, threshold)
- **Strength focus**: AI-determined strength training priorities
- **Goals and constraints**: Race goals, timeline, experience level
- **Any additional user-provided data**: The system should adapt to new data points as they're added

**Principle**: Use every piece of user data available - don't ignore any information the user has provided.

## 🧠 Apply Training Science Intelligently

### Polarized Training (Current Focus):
- **80% Easy (Zone 2)**: Use athlete's exact easy paces/power
- **20% Hard (Zone 4+)**: Use athlete's exact threshold paces/power
- **No Zone 3**: Avoid the "gray zone" that polarized training excludes
- **Volume Calculation**: Calculate from user's duration preferences, then apply 80/20 split

### Progression Principles:
- **Week 1**: Use athlete's current fitness level and training philosophy
- **Week 2**: Increase volume based on athlete's volume increase capacity
- **Week 3**: Progress intensity based on athlete's current fitness
- **Week 4**: Peak week respecting athlete's current capabilities

### Strength Integration:
- **Equipment-based**: Only prescribe exercises for available equipment
- **Focus-driven**: Use athlete's strength focus to guide exercise selection
- **Recovery-aware**: Strength should enhance recovery, not hinder it
- **Volume-balanced**: With limited training days, every session must count

## 🎯 Coaching Approach

### The AI Must:
1. **Think like a coach**: "What will help this athlete perform better in their race?"
2. **Respect constraints**: Work within the athlete's schedule and preferences
3. **Use exact numbers**: Never say "moderate pace" - use exact paces/power
4. **Apply science**: Use training philosophy principles, not rigid formulas
5. **Consider context**: Factor in athlete's current fitness, experience, and goals

### The AI Must NOT:
1. **Make assumptions**: Don't assume what the athlete can handle
2. **Use generic templates**: Don't apply one-size-fits-all approaches
3. **Ignore data**: Don't override user preferences with "better" defaults
4. **Rush progression**: Don't progress faster than the athlete's current fitness supports

## 📊 Data Validation Rules

### Required Validation:
- ✅ **All user data must be validated** before processing
- ✅ **Training preferences** must be complete and valid
- ✅ **Performance baselines** must be available for selected disciplines
- ✅ **Equipment information** must be provided for strength training
- ✅ **Training philosophy** must be determined by AI analysis
- ✅ **Any missing critical data** should trigger descriptive errors, not fallbacks

### Error Responses:
- ❌ **Don't use fallbacks** for missing data
- ✅ **Throw descriptive errors** explaining what data is missing
- ✅ **Log detailed information** about what data was received
- ✅ **Guide user** to provide missing information

## 🔄 Continuous Improvement

### Review Process:
1. **Check for hardcoding** in every code change
2. **Verify data usage** - ensure all user data is being used
3. **Test with edge cases** - what happens with unusual user inputs?
4. **Validate science application** - are we applying training principles correctly?

### Documentation:
- ✅ **Document all data sources** used in plan generation
- ✅ **Explain training science** behind each decision
- ✅ **Track user feedback** on plan quality and appropriateness
- ✅ **Update rules** based on coaching best practices

---

**Remember: We are building a coach, not a template generator. Every decision must be based on the athlete's actual data and applied training science.**

---

# Visual Design Rules

## Core Principle: Minimal, Card-Free Design

**Maintain the app's established minimal design language with no cards, clean typography, and seamless visual continuity.**

## 🚫 NEVER Use Cards or Heavy Containers

### Forbidden Design Elements:
- ❌ **Card components**: No `Card`, `CardContent`, `CardHeader` components
- ❌ **Heavy borders**: No thick borders or container boxes
- ❌ **Background containers**: No colored backgrounds or containers
- ❌ **Shadow effects**: No box shadows or elevation
- ❌ **Rounded corners**: No excessive border radius
- ❌ **Separated sections**: No visual separation between related content

### Avoid These Patterns:
- ❌ `<Card><CardContent>...</CardContent></Card>`
- ❌ `<div className="bg-white border rounded-lg shadow">`
- ❌ `<div className="p-4 bg-gray-50 border">`

## ✅ ALWAYS Use Minimal Design

### Preferred Design Elements:
- ✅ **Clean typography**: Use consistent text hierarchy
- ✅ **Subtle spacing**: Use `mb-4`, `mt-2`, `space-y-3` for spacing
- ✅ **Minimal borders**: Only use borders when absolutely necessary
- ✅ **Flat design**: No shadows, no elevation
- ✅ **Seamless flow**: Content should flow naturally without visual breaks

### Design Patterns:
- ✅ `<div className="mb-4 text-gray-800 font-medium">` (clean headers)
- ✅ `<div className="space-y-3 mb-6">` (consistent spacing)
- ✅ `<button className="w-full p-3 text-left transition-colors">` (minimal buttons)
- ✅ `<div className="text-sm text-gray-600 mb-4">` (subtle descriptions)

## 🎨 Visual Continuity Rules

### Typography Hierarchy:
1. **Main headers**: `text-gray-800 font-medium` (step titles)
2. **Sub headers**: `text-sm text-gray-600 mb-3` (section labels)
3. **Body text**: `text-sm text-gray-600` (descriptions)
4. **Interactive text**: `text-black` (buttons, selections)

### Spacing System:
- **Section spacing**: `mb-6` between major sections
- **Element spacing**: `mb-4` between related elements
- **List spacing**: `space-y-3` for button lists
- **Inline spacing**: `gap-3` for horizontal elements

### Color Palette:
- **Primary text**: `text-gray-800` (main content)
- **Secondary text**: `text-gray-600` (descriptions, labels)
- **Interactive states**: `bg-gray-200` (selected), `hover:bg-gray-100` (hover)
- **Accent colors**: `text-blue-800` (only for important info boxes)

## 🔄 Consistency Guidelines

### Component Patterns:
- **Buttons**: Always use `w-full p-3 text-left transition-colors`
- **Info boxes**: Use `p-3 bg-blue-50 border-l-4 border-blue-400` sparingly
- **Form elements**: Use minimal styling, no containers
- **Lists**: Use `space-y-3` for consistent spacing

### Layout Principles:
- **Full width**: Components should use full available width
- **No containers**: Don't wrap content in unnecessary containers
- **Natural flow**: Content should flow vertically without visual breaks
- **Consistent padding**: Use `p-3` for interactive elements

### State Management:
- **Selected state**: `bg-gray-200 text-black`
- **Default state**: `bg-transparent text-black`
- **Hover state**: `hover:bg-gray-100`
- **Disabled state**: `bg-gray-100 text-gray-400 cursor-not-allowed`

## 📱 Responsive Considerations

### Mobile-First Design:
- **Full width**: All elements should be full width on mobile
- **Touch targets**: Minimum 44px height for interactive elements
- **Readable text**: Minimum 14px font size for body text
- **Adequate spacing**: Use `mb-4` and `space-y-3` for touch-friendly spacing

### Desktop Enhancements:
- **Maintain minimalism**: Don't add complexity on larger screens
- **Consistent spacing**: Keep the same spacing system across breakpoints
- **No layout changes**: Maintain the same visual structure

## 🎯 Design Review Checklist

### Before Implementing:
1. ✅ **No cards**: Are we using any card components?
2. ✅ **Minimal borders**: Are borders necessary or can we remove them?
3. ✅ **Consistent spacing**: Are we using the established spacing system?
4. ✅ **Typography hierarchy**: Are we following the text hierarchy?
5. ✅ **Color consistency**: Are we using the established color palette?
6. ✅ **Visual flow**: Does content flow naturally without breaks?

### Code Review:
- ✅ **Check for Card components**: Search for `Card`, `CardContent`
- ✅ **Check for heavy styling**: Look for `border`, `shadow`, `rounded-lg`
- ✅ **Check spacing**: Ensure consistent use of `mb-4`, `space-y-3`
- ✅ **Check colors**: Verify use of `text-gray-800`, `text-gray-600`

---

**Remember: The app's strength is its minimal, clean design. Every new component should feel like it was always part of the app.** 
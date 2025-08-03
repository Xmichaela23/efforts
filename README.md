# Efforts - Fitness Training App

A comprehensive fitness training application built with React, TypeScript, and Supabase, featuring algorithm-powered training plan generation and integration with fitness platforms like Garmin and Strava.

## Development Status & Integration Guide

### App Complexity & Architecture
This app has reached a significant level of complexity requiring careful consideration of component interdependencies and backend integrations. The architecture includes:

- **Frontend**: React + TypeScript + Vite with shadcn/ui components
- **Backend**: Supabase (database, auth, Edge Functions)
- **Algorithm Integration**: AlgorithmTrainingService for deterministic plan generation
- **Third-party APIs**: Garmin Connect, Strava integration
- **Real-time Data**: Webhooks for live fitness data synchronization

### Integration Status
- ✅ **Garmin Connect**: Full integration with webhook processing and detailed sensor data
- ✅ **Strava**: Basic integration implemented
- ✅ **AlgorithmTrainingService**: Algorithm-based training plan generation with unified polarized architecture
- 🔄 **Ongoing**: Continuous refinement of data processing and UI components

### Critical Dependencies
- **Supabase Edge Functions**: Handle webhook processing for real-time data
- **User Connections**: Store API tokens and connection data for third-party services
- **Database Schema**: Comprehensive workout and activity data structures
- **Context Management**: AppContext for global state and data flow

### Development Guidelines
1. **Component Sensitivity**: Changes to components must consider impact on other working elements
2. **Backend Integration**: Complex integrations require thorough understanding of API documentation
3. **Data Flow**: Understand how data moves from webhooks → database → frontend components
4. **Testing**: Physical activities may be required to test fitness integrations

### CRITICAL: SLOW DOWN AND UNDERSTAND FIRST
**STOP RUSHING TO FIX THINGS!**
- 🛑 **Ask questions** before making any changes
- 🤔 **Understand the problem** completely before acting
- 💬 **Discuss the approach** with the user first
- ✅ **Get agreement** before touching any code
- ❌ **Don't assume** you know what the user wants

**The user has been burned by AI making changes before understanding the problem.**
**SLOW DOWN. LISTEN. UNDERSTAND. THEN ACT.**

### Third-Party Integration Best Practices
**CRITICAL**: When integrating any third-party service, ALWAYS request:
- 📋 **Official API documentation** (manuals, guides, SDK docs)
- 🔗 **Webhook/push notification specifications**
- 📊 **Data structure examples** (sample payloads, response formats)
- ⚙️ **Configuration requirements** (endpoints, authentication, rate limits)
- 🧪 **Testing tools** (sandbox environments, data generators)

**Why this matters**: The Garmin integration required multiple debugging cycles because we didn't have the official manual initially. The manual would have immediately revealed:
- Push vs Ping service differences
- Exact data structure (root-level vs nested fields)
- Webhook payload formats
- Required vs optional fields

**Rule**: Request documentation FIRST, implement SECOND. This saves hours of debugging and prevents incorrect assumptions.

### Deployment Strategy

#### Frontend Deployment (React App)
- **Method**: Git-based deployment
- **Process**: 
  1. Make changes to React components
  2. Commit with descriptive messages: `git commit -m "Add event-based training recommendations with smart gating"`
  3. Push to main branch: `git push`
  4. Automatic deployment via git workflow
- **Files**: All React/TypeScript files in `src/` directory

#### Backend Deployment (Supabase Edge Functions)
- **Method**: Manual copy/paste deployment
- **Process**:
  1. Develop Edge Functions locally in `supabase/functions/`
  2. Test locally with `supabase start`
  3. Copy the TypeScript code from `index.ts` files
  4. Paste into Supabase Dashboard → Edge Functions → [Function Name] → Edit
  5. Save and deploy
- **Files**: `supabase/functions/*/index.ts`
- **Why this approach**: Gives full control over when Edge Function updates go live

#### Deployment Workflow
1. **Frontend changes**: Commit and push to git (automatic deployment)
2. **Backend changes**: Copy/paste to Supabase dashboard (manual deployment)
3. **Testing**: Test frontend changes first, then deploy backend
4. **Rollback**: Can quickly revert Edge Functions in dashboard if needed

### Session Continuity Notes
- **Context Maintenance**: This AI maintains conversation context and code understanding across sessions
- **Documentation**: Key architectural decisions and integration details are documented in this README
- **Component Dependencies**: See `COMPONENT_DEPENDENCIES.md` for detailed component relationships
- **Development Status**: See `DEVELOPMENT_STATUS.md` for current feature status

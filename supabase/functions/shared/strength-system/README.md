# Shared Strength System

Discipline-agnostic strength training protocol system for endurance athletes.

## Architecture

**Three-layer system:**

1. **Protocols** - Generate intent sessions (what to do, no day assignment)
2. **Placement Policies** - Assign intents to days (when to do it)
3. **Guardrails** - Validate and modify placement (is it safe/optimal)

## Usage

```typescript
import { 
  StrengthProtocol,
  ProtocolContext,
  getIntentMetadata 
} from '../shared/strength-system/index.ts';

// Create context from your plan generator
const context: ProtocolContext = {
  weekIndex: 5,
  weekInPhase: 2,
  phase: { name: 'Speed', ... },
  primarySchedule: {
    longSessionDays: ['Sunday'],
    qualitySessionDays: ['Tuesday', 'Thursday'],
    easySessionDays: ['Monday', 'Wednesday', 'Friday']
  },
  // ...
};

// Get protocol (from selector) - uses canonical ID
const protocol = getProtocol('upper_aesthetics');

// Generate intent sessions
const intentSessions = protocol.createWeekSessions(context);

// Assign to days (placement policy)
const placedSessions = placementPolicy.assignSessions(
  intentSessions,
  context.primarySchedule,
  guardrailResults
);
```

## Structure

```
strength-system/
  ├── protocols/
  │   ├── intent-taxonomy.ts    # Intent definitions & metadata
  │   ├── types.ts              # Protocol contract & types
  │   ├── upper-priority-hybrid.ts  # Protocol implementations
  │   └── ...
  ├── placement/
  │   ├── policies.ts            # Placement policy implementations
  │   └── ...
  ├── guardrails/
  │   └── engine.ts             # Guardrail validation engine
  └── index.ts                  # Main exports
```

## Intents

Intents are abstract session types:

- **Lower:** `LOWER_NEURAL`, `LOWER_DURABILITY`, `LOWER_POWER`, `LOWER_MAINTENANCE`
- **Upper:** `UPPER_STRENGTH`, `UPPER_POSTURE`, `UPPER_MAINTENANCE`
- **Full Body:** `FULLBODY_MAINTENANCE`

Each intent has metadata (constraints, exercise families, rep ranges, etc.).

## Discipline Support

This system works for:
- **Running** - Long runs, quality runs
- **Cycling** - Long rides, quality rides
- **Triathlon** - Long runs + rides + swims

The `primarySchedule` in `ProtocolContext` is normalized across disciplines:
- `longSessionDays: string[]` - Days with longest/highest volume sessions (e.g., ['Sunday'])
- `qualitySessionDays: string[]` - Days with quality/speed work (intervals, tempo, etc.)
- `easySessionDays: string[]` - Days with easy/recovery sessions

**Future extensibility:**
- For multi-sport (triathlon): Can extend to `schedules: { primary, secondary?, tertiary? }` or `scheduleBlocks: Day[]` with discipline tags
- For high-fatigue days: Can add `highFatigueDays: string[]` for days with tempo + long-ish sessions

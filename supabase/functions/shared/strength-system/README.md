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
  runSchedule: {
    longRunDay: 'Sunday',
    qualityRunDays: ['Tuesday', 'Thursday'],
    easyRunDays: ['Monday', 'Wednesday', 'Friday']
  },
  // ...
};

// Get protocol (from selector)
const protocol = getProtocol('upper_priority_hybrid');

// Generate intent sessions
const intentSessions = protocol.createWeekSessions(context);

// Assign to days (placement policy)
const placedSessions = placementPolicy.assignSessions(
  intentSessions,
  context.runSchedule,
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

The `runSchedule` in `ProtocolContext` can be extended to support multiple sports.

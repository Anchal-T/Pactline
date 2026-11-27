# @pactline/domain

Core domain types, Zod schemas, and shared specialist contracts for the Pactline procurement continuity system.

## What's Inside

### Type Definitions
- **IDs & Branded Types** (`ids.ts`) — Type-safe identifiers
- **Entities** (`entities.ts`) — Core domain entity types (incidents, POs, etc.)
- **Events** (`events.ts`) — System event schemas
- **Contracts** (`contracts.ts`) — Specialist result envelopes and shared schemas

### Validation & Processing
- **Validator** (`validator.ts`) — Envelope validation with no-invention rule
- **Canonical JSON** (`canonical.ts`) — Idempotency key generation
- **Grounding Validator** (`grounding.ts`) — Checks model outputs against evidence
- **MCP Schema Generator** (`mcp-schema.js`) — JSON Schema from Zod for MCP tools

### State Management
- **Incident State Machine** (`incident-state-machine.ts`) — Lifecycle management with invariant enforcement

## Incident State Machine

The Incident State Machine manages the full lifecycle of procurement continuity incidents from detection through verified closure.

### State Graph

```
                    ┌─────────┐
                    │DETECTED │
                    └────┬────┘
                         │
                         ▼
                 ┌──────────────┐
                 │INVESTIGATING ├──────┐
                 └──────┬───────┘      │
                        │              ▼
                        │         ┌────────┐
                        │         │BLOCKED │
                        │         └───┬────┘
                        │             │
                        ▼             │
                   ┌────────┐         │
                   │PLANNING│◄────────┘
                   └───┬────┘
                       │
           ┌───────────┴───────────┐
           │                       │
           ▼                       ▼
   ┌───────────────┐      ┌──────────┐
   │AWAITING_      │      │EXECUTING │
   │APPROVAL       │      └────┬─────┘
   └───┬───────────┘           │
       │                       │
       │  ┌────────────────────┤
       │  │                    │
       ▼  ▼                    ▼
   ┌──────────┐          ┌──────────┐
   │EXECUTING │          │ESCALATED │
   └────┬─────┘          └────┬─────┘
        │                     │
        ▼                     │
   ┌─────────┐                │
   │MITIGATED├────────┐       │
   └────┬────┘        │       │
        │             │       │
        │             ▼       ▼
        │        ┌────────────────┐
        │        │INVESTIGATING   │ (reopen)
        │        └────────────────┘
        ▼
   ┌──────────┐
   │VERIFYING │
   └────┬─────┘
        │
    ┌───┴───┐
    │       │
    ▼       ▼
┌────────┐ ┌────────┐
│CLOSED  │ │PLANNING│ (failed inspection)
└────────┘ └────────┘
```

### Key Features

1. **Deterministic Validation**
   - Type-safe state transitions
   - Precondition checks before every transition
   - Invariant enforcement (owner, next_action/blocker, next_review_at on all open incidents)

2. **Optimistic Version Control**
   - Every successful transition increments version
   - Enables DB-level optimistic locking
   - Prevents concurrent modification races

3. **Closure Guards** (AGENTS.md Invariant 5)
   - Requires `accepted_qty >= required_qty` OR
   - Valid waiver + schedule disposition
   - Prevents premature closure on email/ETA alone

4. **Audit Trail**
   - Every transition produces an audit record
   - Captures actor, reason, timestamp, metadata
   - Works for both successful and failed transitions

5. **Pure Function Design**
   - No side effects or DB writes
   - Caller executes transition with optimistic locking
   - Easy to test and reason about

### Usage Example

```typescript
import { IncidentStateMachine } from "@pactline/domain";

const state: IncidentState = {
  id: "INC-0001",
  status: "DETECTED",
  version: 1,
  owner: null,
  next_action: null,
  blocker: null,
  next_review_at: null,
  accepted_qty: 0,
  required_qty: 2,
  has_valid_waiver: false,
  has_schedule_disposition: false,
  has_valid_approval: false,
  approval_expired: false,
};

const request: TransitionRequest = {
  to: "INVESTIGATING",
  actor: "operator-1",
  reason: "Starting investigation",
  owner: "operator-1",
  next_action: "gather facts",
  next_review_at: new Date(Date.now() + 3600000),
};

const result = IncidentStateMachine.transition(state, request);

if (result.success) {
  // Execute DB update with optimistic locking:
  // UPDATE incidents
  // SET status = ?, version = ?, owner = ?, next_action = ?, updated_at = ?
  // WHERE id = ? AND version = ?

  console.log(`Transitioned to ${result.to_status}, version ${result.new_version}`);
} else {
  console.error(`Transition failed: ${result.error}`);
}

// Audit data available in both success and failure cases
console.log(`Actor: ${result.audit.actor}, Reason: ${result.audit.reason}`);
```

### Helper Methods

```typescript
// Check if a transition is valid
IncidentStateMachine.isValidTransition("DETECTED", "INVESTIGATING"); // true
IncidentStateMachine.isValidTransition("DETECTED", "CLOSED"); // false

// Get valid next states
IncidentStateMachine.getValidNextStates("INVESTIGATING");
// ["PLANNING", "BLOCKED"]

// Check if reopening is allowed
IncidentStateMachine.canReopen("MITIGATED"); // true
IncidentStateMachine.canReopen("CLOSED"); // false

// Validate Invariant 8 (open incidents must have owner + review + action/blocker)
const error = IncidentStateMachine.validateInvariant8(state);
if (error) {
  console.error(`Invariant violation: ${error}`);
}

// Get human-readable status description
IncidentStateMachine.getStatusDescription("INVESTIGATING");
// "Root cause investigation in progress"
```

## Testing

Run the test suite:

```bash
pnpm test
```

**Coverage:** 118 tests passing, including 45 state machine-specific tests covering:
- Valid and invalid transitions
- Precondition enforcement
- Invariant validation
- Optimistic version control
- Audit trail generation

## Integration Points

This package is used by:
- `@pactline/incident-runtime` — Incident lifecycle orchestration
- `@pactline/db` — Database schema and constraints
- `@pactline/api` — REST endpoints for incident management
- `@pactline/frontend` — UI state rendering and actions
- `@pactline/mcp` — MCP server incident tools

## Specifications

Implements requirements from:
- `docs/04_System_Workflows.md` §3 — Incident lifecycle state machine
- `AGENTS.md` §5 — Structural invariants (especially Invariant 5 and 8)
- `docs/checklist.md` Phase 2C — Incident state machine

## License

See repository root LICENSE file.

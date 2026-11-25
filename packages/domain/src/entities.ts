// Core entity shapes — world model per Phase 3 of AGENTS.md
// These are plain TypeScript types; Drizzle schema lives in @pactline/db

export type IncidentStatus =
  | "DETECTED"
  | "INVESTIGATING"
  | "PLANNING"
  | "AWAITING_APPROVAL"
  | "EXECUTING"
  | "MITIGATED"
  | "VERIFYING"
  | "CLOSED"
  | "ESCALATED"
  | "BLOCKED";

export type IncidentSeverity = "CRITICAL" | "WARNING" | "FLOAT_ABSORBED" | "NONE";

export type ComplianceFindingResult = "PASS" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE";

export type SpecialistRole =
  | "INVESTIGATION"
  | "COMPLIANCE_EXTRACTION"
  | "ALTERNATIVE_SOURCING";

export type ActionStatus = "PENDING" | "DISPATCHING" | "CONFIRMED" | "UNCERTAIN" | "FAILED";

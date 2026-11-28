// SYNTHETIC sandbox fixture: the chilled-water pump delay incident at two points in its lifecycle.
import type { IncidentState, TransitionRequest } from "@pactline/domain";

const OPEN = {
  id: "inc-chwp-delay-001",
  owner: "pm-mech-01",
  next_action: "Confirm receipt and inspection of pump packages",
  blocker: null,
  next_review_at: new Date("2027-01-08T15:00:00Z"),
  required_qty: 2,
  has_valid_waiver: false,
  has_schedule_disposition: false,
  has_valid_approval: true,
  approval_expired: false,
} as const;

/** Receiving inspection under way: `accepted` of the 2 required pumps have passed inspection. */
export const verifying = (accepted: number): IncidentState => ({ ...OPEN, status: "VERIFYING", version: 7, accepted_qty: accepted });

/** Substitute PO placed and the vendor has committed an arrival; nothing received yet. */
export const mitigated = (): IncidentState => ({ ...OPEN, status: "MITIGATED", version: 6, accepted_qty: 0 });

export const CLOSE: TransitionRequest = { to: "CLOSED", actor: "operator", reason: "Pumps received and accepted" };

export const REOPEN: TransitionRequest = {
  to: "INVESTIGATING",
  actor: "operator",
  reason: "Vendor slipped the mitigated delivery",
  owner: "pm-mech-01",
  next_action: "Investigate the new delivery slip",
  next_review_at: new Date("2026-12-22T15:00:00Z"),
};

// Event envelope schema per Phase 3 of AGENTS.md
import { z } from "zod";

export const EventEnvelopeSchema = z.object({
  event_id: z.string().uuid(),
  type: z.string(),
  project_id: z.string(),
  subject_type: z.string(),
  subject_id: z.string(),
  occurred_at: z.string().datetime(),
  received_at: z.string().datetime(),
  source: z.string(),
  source_event_id: z.string().optional(),
  evidence_ref: z.string().optional(),
  correlation_id: z.string().optional(),
  payload: z.record(z.unknown()),
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export type DomainEventType =
  | "VendorCommitmentChanged"
  | "MilestoneMissed"
  | "SupplierResponseReceived"
  | "RequirementSetRevised"
  | "SubmittalReceived"
  | "OfferReceived"
  | "OfferExpired"
  | "ApprovalGranted"
  | "ApprovalRejected"
  | "ShipmentReceived"
  | "InspectionCompleted"
  | "FollowUpDue"
  | "ScheduleRevised";

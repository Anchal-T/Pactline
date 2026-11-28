// SYNTHETIC sandbox fixture: a supplier offer, the substitution approval pinned to it, and a gateway wired to
// the in-memory store and the fault-injecting sandbox adapter. Not real project records.
import type { ApprovalId, OfferId, POLineId } from "@pactline/domain";
import {
  type ActionProposal,
  type Approval,
  type RevisionPins,
  ExecutionGateway,
  MemoryGatewayStore,
  SandboxExternalAdapter,
} from "@pactline/execution-gateway";

export const OFFER = {
  id: "offer-bg-e1510-2026-12" as OfferId,
  expiresAt: new Date("2026-12-18T23:59:59Z"),
} as const;

export const SUBJECT = "pol-chwp-1-2" as POLineId;
export const APPROVAL_ID = "appr-sub-bg-e1510-001" as ApprovalId;

export const PINS: Readonly<Required<Omit<RevisionPins, "schedule_rev">>> = {
  requirement_rev: "reqset-chwp-r3",
  config_rev: "cfg-bg-e1510-r1",
  offer_rev: "offer-bg-e1510-r1",
  plan_rev: "plan-chwp-r2",
};

/** Granted by the engineer of record. It outlives the offer, so only the gateway's offer check can stop a late substitution. */
export const SUBSTITUTION_APPROVAL: Approval = {
  approval_id: APPROVAL_ID,
  granted_by: "eor-mech-01",
  granted_role: "ENGINEER_OF_RECORD",
  granted_at: new Date("2026-12-15T15:00:00Z"),
  expires_at: new Date("2026-12-31T23:59:59Z"),
  pins: { ...PINS },
  scope: "substitute_product",
  subject_id: SUBJECT,
};

export const substitution = (actionId: string): ActionProposal => ({
  action_id: actionId,
  action_type: "substitute_product",
  incident_id: "inc-chwp-delay-001",
  actor: "operator",
  reason: "Substitute the delayed pump with the accepted Bell & Gossett offer",
  subject_id: SUBJECT,
  approval_id: APPROVAL_ID,
  arguments: { offer_id: OFFER.id, qty: 2 },
});

export async function sandboxGateway(start: Date, current: RevisionPins = PINS) {
  let now = start;
  const clock = () => now;
  const store = new MemoryGatewayStore(clock);
  const adapter = new SandboxExternalAdapter();
  await store.setRevisions(SUBJECT, { ...current });
  await store.setApproval(SUBSTITUTION_APPROVAL);
  await store.setOffer({ offer_rev: PINS.offer_rev, expires_at: OFFER.expiresAt });
  return {
    gateway: new ExecutionGateway({ store, adapter, clock }),
    store,
    adapter,
    setNow: (next: Date) => {
      now = next;
    },
  };
}

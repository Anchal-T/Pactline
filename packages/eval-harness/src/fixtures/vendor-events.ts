// SYNTHETIC sandbox fixture: revisions of one vendor commitment email, as raw envelopes. Not real vendor messages.
import { EventNormalizer, type NormalizedEvent } from "@pactline/domain";

const EVENT_IDS: Record<number, string> = {
  1: "7b0c2d1e-4f5a-4b6c-8d7e-9f0a1b2c3d01",
  2: "7b0c2d1e-4f5a-4b6c-8d7e-9f0a1b2c3d02",
};

const ARRIVAL: Record<number, string> = { 1: "2026-12-29", 2: "2027-01-07" };

/** Revision `version` of the vendor's commitment for the chilled-water pump PO line. */
export function vendorCommitment(version: 1 | 2): NormalizedEvent {
  const result = EventNormalizer.normalize({
    event_id: EVENT_IDS[version],
    type: "VendorCommitmentChanged",
    project_id: "proj-chw-plant",
    subject_type: "POLine",
    subject_id: "pol-chwp-1-2",
    occurred_at: version === 1 ? "2026-12-10T14:00:00Z" : "2026-12-14T09:00:00Z",
    received_at: version === 1 ? "2026-12-10T14:02:00Z" : "2026-12-14T09:03:00Z",
    source: "vendor-email",
    source_event_id: `vc-chwp-0042-v${version}`,
    evidence_ref: `sandbox://vendor-email/vc-chwp-0042-v${version}.eml`,
    payload: { revised_arrival_date: ARRIVAL[version], reason: "Impeller casting rework" },
  });
  if (!result.success || !result.event) throw new Error(`fixture event v${version} did not normalize: ${result.error}`);
  return result.event;
}

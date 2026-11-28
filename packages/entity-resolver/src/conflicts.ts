import { canonicalJson, type Assertion, type Confidence, type SourceRef, type SpecialistResult } from "@pactline/domain";

/** One side of a disagreement: who asserted what, and the evidence they cited. */
export interface AssertionWitness {
  specialist: string;
  run_id: string;
  value: unknown;
  confidence: Confidence;
  citations: SourceRef[];
}

export interface DisagreementRaised {
  type: "DisagreementRaised";
  claim_key: string;
  left: AssertionWitness;
  right: AssertionWitness;
}

/**
 * Joins every specialist assertion on `claim_key` and raises one disagreement per pair of assertions whose
 * values differ (by canonical JSON). Agreement raises nothing. Output is ordered by claim key, then by
 * (specialist, run_id, assertion index) of each side, independent of input order.
 */
export function detectConflicts(results: readonly SpecialistResult[]): DisagreementRaised[] {
  const byClaim = new Map<string, Array<{ order: string; value: string; witness: AssertionWitness }>>();
  for (const env of results) {
    env.assertions.forEach((assertion, index) => {
      const entry = { order: `${env.specialist}\u0000${env.run_id}\u0000${String(index).padStart(6, "0")}`, value: canonicalJson(assertion.value), witness: witness(env, assertion) };
      byClaim.set(assertion.claim_key, [...(byClaim.get(assertion.claim_key) ?? []), entry]);
    });
  }
  const out: DisagreementRaised[] = [];
  for (const claim_key of [...byClaim.keys()].sort()) {
    const entries = byClaim.get(claim_key)!.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[i]!.value !== entries[j]!.value) out.push({ type: "DisagreementRaised", claim_key, left: entries[i]!.witness, right: entries[j]!.witness });
      }
    }
  }
  return out;
}

function witness(env: SpecialistResult, assertion: Assertion): AssertionWitness {
  const citations = assertion.refs.map((id) => {
    const ref = env.evidence.find((e) => e.ref_id === id);
    if (!ref) throw new Error(`${env.specialist} ${env.run_id}: assertion ${assertion.claim_key} cites ref ${id} that is not in its evidence`);
    return ref;
  });
  return { specialist: env.specialist, run_id: env.run_id, value: assertion.value, confidence: assertion.confidence, citations };
}

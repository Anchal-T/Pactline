export type AgentId = "op" | "inv" | "cmp" | "src" | "sch" | "gw" | "hu";

export interface Agent {
  id: AgentId;
  name: string;
  mark: string;
  color: string;
  kind: "model" | "deterministic" | "human";
  takes: string;
  returns: string;
  boundary: string;
}

export const AGENTS: Record<AgentId, Agent> = {
  op: {
    id: "op",
    name: "Operator",
    mark: "Op",
    color: "var(--ag-op)",
    kind: "model",
    takes: "The triggering event, the incident and a pinned project snapshot",
    returns: "Next step, delegated tasks, a ranked recovery plan",
    boundary: "Owns the incident but cannot approve its own plan",
  },
  inv: {
    id: "inv",
    name: "Investigation",
    mark: "In",
    color: "var(--ag-inv)",
    kind: "model",
    takes: "Conflicting commitments, PO history and vendor messages",
    returns: "Supported hypotheses, confirmed facts, missing evidence",
    boundary: "Read-only. Cannot assert an unconfirmed root cause",
  },
  cmp: {
    id: "cmp",
    name: "Compliance",
    mark: "Co",
    color: "var(--ag-cmp)",
    kind: "model",
    takes: "Spec revision, exact configuration and its data sheets",
    returns: "Pass, fail or unknown per requirement, with citations",
    boundary: "Extraction only. A deterministic check decides each result",
  },
  src: {
    id: "src",
    name: "Sourcing",
    mark: "So",
    color: "var(--ag-src)",
    kind: "model",
    takes: "Required configuration, quantity and latest viable date",
    returns: "Candidate products with availability evidence and expiry",
    boundary: "No invented stock, prices or dates. Places no orders",
  },
  sch: {
    id: "sch",
    name: "Schedule engine",
    mark: "Sc",
    color: "var(--ag-sch)",
    kind: "deterministic",
    takes: "Schedule revision, dependencies and the new forecast",
    returns: "Need date, usable date, float consumed, critical path",
    boundary: "Pure calculation. Cannot touch the baseline",
  },
  gw: {
    id: "gw",
    name: "Execution gateway",
    mark: "Gw",
    color: "var(--ag-gw)",
    kind: "deterministic",
    takes: "An authorised action and its pinned approval",
    returns: "A receipt with an idempotency key, or a refusal",
    boundary: "Reconciles before any retry. Never sends twice",
  },
  hu: {
    id: "hu",
    name: "Engineer of record",
    mark: "ER",
    color: "var(--ag-hu)",
    kind: "human",
    takes: "The exact plan, configuration and revision to approve",
    returns: "Approve, reject or ask for more evidence",
    boundary: "Holds technical authority. The agents never do",
  },
};

export const KIND_LABEL: Record<Agent["kind"], string> = {
  model: "Model specialist",
  deterministic: "Deterministic code",
  human: "Human approver",
};

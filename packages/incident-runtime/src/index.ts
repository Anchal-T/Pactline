// IncidentRuntime — four stateless ticks driven by an injected Clock
// ingestEvent: normalize + write event, trigger incident rules
// tickIncidents: review due incidents through the decider (lease + CAS commit)
// tickTasks: run specialist tasks; drifted or lease-lost results are audit-only
// tickOutbox: flush pending action_receipts via ExecutionGateway

export * from "./incident-runtime.js";
export * from "./ports.js";
export * from "./memory-stores.js";

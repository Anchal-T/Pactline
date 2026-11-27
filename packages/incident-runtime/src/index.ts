// IncidentRuntime — four stateless ticks driven by injected Clock
// ingestEvent: normalize + write event, trigger incident rules
// tickIncidents: advance open incidents (dispatch operator decisions)
// tickTasks: collect completed specialist task results
// tickOutbox: flush pending action_receipts via ExecutionGateway
// Clock interface: real time in prod, VirtualClock in eval harness

export * from "./incident-runtime.js";

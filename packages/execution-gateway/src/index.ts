// ExecutionGateway — deterministic RBAC + transactional outbox
// Checks: approval-pin validity, action scope, idempotency, preconditions
// Commits action_receipts (status=DISPATCHING) BEFORE calling ExternalAdapter
// On uncertain outcome: reconcile() before retry, escalate if unresolvable

export * from "./execution-gateway.js";
export * from "./sandbox-adapter.js";

// 12 mandatory scenarios from AGENTS.md Phase 4:
// 1.  Float-absorbed non-critical delay (no false critical escalation)
// 2.  Stale / out-of-order vendor update
// 3.  Mandatory pump-curve head failure (FAIL)
// 4.  Missing motor/curve evidence (UNKNOWN, never PASS)
// 5.  Expired supplier offer rejected before execution
// 6.  Spec or offer revision invalidating a prior approval
// 7.  Process crash after external write (reconcile → 0 duplicate writes)
// 8.  Supplier silence timeout → bounded follow-up → escalation
// 9.  Partial acceptance (accepted_qty < required_qty blocks closure)
// 10. Post-mitigation delay → reopen incident from MITIGATED
// 11. Parallel incidents contending on the same POLine
// 12. Prompt injection in vendor email/submittal PDF (0 unauthorized writes)
export {};

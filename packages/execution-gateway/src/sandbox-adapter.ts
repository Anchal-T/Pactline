// Sandbox External Adapter — Phase 2E
// Implements ExternalAdapter with fault injection for testing

import type { ExternalAdapter, ActionReceipt, ExecutionResult } from "./execution-gateway.js";

/**
 * Fault injection configuration
 */
export interface FaultConfig {
  // Simulate crash after write (before returning success)
  crashAfterWrite?: boolean;

  // Simulate timeout
  timeout?: boolean;
  timeoutMs?: number;

  // Simulate failure
  fail?: boolean;
  failureMessage?: string;

  // Simulate uncertain outcome
  uncertain?: boolean;

  // Simulate an external system that cannot be queried during reconcile
  reconcileFails?: boolean;
}

/**
 * In-memory store for sandbox external operations
 */
interface SandboxOperation {
  idempotency_key: string;
  external_id: string;
  action_type: string;
  /** Outbound messages go only to the destination and template the gateway checked. */
  recipient: string | null;
  template_id: string | null;
  arguments: Record<string, unknown>;
  executed_at: Date;
}

/**
 * Sandbox External Adapter
 *
 * Simulates external systems (vendor email, ERP, etc.) for testing.
 * Supports fault injection for crash recovery testing.
 */
export class SandboxExternalAdapter implements ExternalAdapter {
  /** Every execute that reached the external system, duplicates included, so tests can count writes. */
  private executions: SandboxOperation[] = [];
  private nextExternalId = 1;

  constructor(private faultConfig: FaultConfig = {}) {}

  async execute(action: ActionReceipt): Promise<ExecutionResult> {
    // Simulate timeout
    if (this.faultConfig.timeout) {
      await this.sleep(this.faultConfig.timeoutMs || 5000);
      return {
        success: false,
        uncertain: true,
        error: "Timeout",
      };
    }

    // Simulate failure
    if (this.faultConfig.fail) {
      return {
        success: false,
        error: this.faultConfig.failureMessage || "Simulated failure",
      };
    }

    // Simulate uncertain outcome
    if (this.faultConfig.uncertain) {
      return {
        success: false,
        uncertain: true,
        error: "Network error - state uncertain",
      };
    }

    // Perform the "external" operation
    const externalId = `ext-${this.nextExternalId++}`;

    const operation: SandboxOperation = {
      idempotency_key: action.idempotency_key,
      external_id: externalId,
      action_type: action.action_type,
      recipient: action.recipient,
      template_id: action.template_id,
      arguments: action.arguments,
      executed_at: new Date(),
    };

    this.executions.push(operation);

    // Log the simulated operation
    // Simulate crash after write (for testing reconciliation)
    if (this.faultConfig.crashAfterWrite) {
      // In real scenario, process would crash here
      // For testing, we just throw to simulate incomplete response
      throw new Error("Simulated crash after write");
    }

    return {
      success: true,
      external_id: externalId,
    };
  }

  async reconcile(idempotencyKey: string): Promise<string | null> {
    const operation = this.getOperation(idempotencyKey);

    if (operation) {
      return operation.external_id;
    }

    // Deterministic: the external system cannot be queried
    if (this.faultConfig.reconcileFails) {
      throw new Error("Cannot verify external state");
    }

    // Not found - safe to retry
    return null;
  }

  /**
   * Check if an operation was actually executed (for testing)
   */
  hasOperation(idempotencyKey: string): boolean {
    return this.executions.some((o) => o.idempotency_key === idempotencyKey);
  }

  /**
   * Get operation details (for testing)
   */
  getOperation(idempotencyKey: string): SandboxOperation | undefined {
    return this.executions.find((o) => o.idempotency_key === idempotencyKey);
  }

  /**
   * Number of writes that reached the external system, optionally for one key (for testing)
   */
  getOperationCount(idempotencyKey?: string): number {
    return idempotencyKey === undefined ? this.executions.length : this.executions.filter((o) => o.idempotency_key === idempotencyKey).length;
  }

  /**
   * Reset the adapter state (for testing)
   */
  reset(): void {
    this.executions = [];
    this.nextExternalId = 1;
  }

  /**
   * Update fault configuration (for testing)
   */
  setFaultConfig(config: FaultConfig): void {
    this.faultConfig = config;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

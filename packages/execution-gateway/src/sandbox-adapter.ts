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
}

/**
 * In-memory store for sandbox external operations
 */
interface SandboxOperation {
  idempotency_key: string;
  external_id: string;
  action_type: string;
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
  private operations: Map<string, SandboxOperation> = new Map();
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
      arguments: action.arguments,
      executed_at: new Date(),
    };

    this.operations.set(action.idempotency_key, operation);

    // Log the simulated operation
    console.log(`[SANDBOX] Executed ${action.action_type}: ${externalId}`);

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
    const operation = this.operations.get(idempotencyKey);

    if (operation) {
      console.log(`[SANDBOX] Reconciled ${idempotencyKey} -> ${operation.external_id}`);
      return operation.external_id;
    }

    // Check if this is a truly uncertain case (simulated)
    if (this.faultConfig.uncertain && Math.random() < 0.5) {
      throw new Error("Cannot verify external state");
    }

    // Not found - safe to retry
    return null;
  }

  /**
   * Check if an operation was actually executed (for testing)
   */
  hasOperation(idempotencyKey: string): boolean {
    return this.operations.has(idempotencyKey);
  }

  /**
   * Get operation details (for testing)
   */
  getOperation(idempotencyKey: string): SandboxOperation | undefined {
    return this.operations.get(idempotencyKey);
  }

  /**
   * Get count of executed operations (for testing)
   */
  getOperationCount(): number {
    return this.operations.size;
  }

  /**
   * Reset the adapter state (for testing)
   */
  reset(): void {
    this.operations.clear();
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

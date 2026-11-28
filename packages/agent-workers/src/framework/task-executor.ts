// Task executor with database integration and stale-pin detection
import type { AgentTask, AgentWorker, TaskRecord, TaskStatus, Clock, StatePin } from "./agent-runner.js";

/**
 * Task store interface for database persistence.
 * Implementation in packages/db will provide Postgres-backed version.
 */
export interface TaskStore {
  /**
   * Fetch pending tasks with FOR UPDATE SKIP LOCKED.
   * Returns tasks that are not currently being processed.
   */
  fetchPendingTasks(limit: number): Promise<TaskRecord[]>;

  /**
   * Get a specific task by ID.
   */
  getTask(task_id: string): Promise<TaskRecord | null>;

  /**
   * Update task status and optionally set result.
   */
  updateTask(
    task_id: string,
    status: TaskStatus,
    updates: {
      started_at?: string;
      completed_at?: string;
      output?: unknown;
      model_usage?: unknown;
      error?: string;
    },
  ): Promise<void>;

  /**
   * Check if input state pin has drifted from current world state.
   * Returns true if any pinned revision has changed.
   */
  checkStateDrift(state_pin: StatePin): Promise<boolean>;
}

/**
 * Task execution coordinator.
 * Manages task lifecycle, stale-pin detection, and result persistence.
 */
export class TaskExecutor {
  constructor(
    private readonly store: TaskStore,
    private readonly clock: Clock,
  ) {}

  /**
   * Tick: fetch and execute pending tasks.
   * This is called periodically by the runtime (e.g., every 10 seconds).
   */
  async tickTasks(workers: Map<string, AgentWorker<unknown, unknown>>, limit: number = 10): Promise<void> {
    const tasks = await this.store.fetchPendingTasks(limit);

    for (const task of tasks) {
      await this.executeTask(task, workers);
    }
  }

  /**
   * Execute a single task with stale-pin detection.
   */
  private async executeTask(
    taskRecord: TaskRecord,
    workers: Map<string, AgentWorker<unknown, unknown>>,
  ): Promise<void> {
    const { task_id, role, state_pin } = taskRecord;

    try {
      // Check for stale pin before execution
      const isStale = await this.store.checkStateDrift(state_pin);

      if (isStale) {
        // State has drifted — mark as STALE for audit but don't execute
        await this.store.updateTask(task_id, "STALE", {
          completed_at: this.clock.now().toISOString(),
          error: "Input state pin has drifted from current world state",
        });
        return;
      }

      // Mark as running
      await this.store.updateTask(task_id, "RUNNING", {
        started_at: this.clock.now().toISOString(),
      });

      // Get worker for this role
      const worker = workers.get(role);
      if (!worker) {
        throw new Error(`No worker registered for role: ${role}`);
      }

      // Convert task record to agent task
      const agentTask: AgentTask = {
        task_id: taskRecord.task_id,
        incident_id: taskRecord.incident_id,
        role: taskRecord.role,
        objective: `Execute ${role} specialist`, // TODO: load from task metadata
        state_pin: taskRecord.state_pin,
        input: taskRecord.input,
        evidence_refs: [], // TODO: load from task metadata
      };

      // Execute worker
      const result = await worker.execute(agentTask);

      // P1 #2: Re-check state drift AFTER execution — the world may have changed while running.
      // If any pinned revision is now stale, record the output but mark STALE (not COMPLETED)
      // so the operator knows the result was computed against an older snapshot.
      const isDriftedAfter = await this.store.checkStateDrift(state_pin);
      if (isDriftedAfter) {
        await this.store.updateTask(task_id, "STALE", {
          completed_at: this.clock.now().toISOString(),
          output: result.output,
          model_usage: result.model_usage,
          error: "State pin drifted during task execution; result may be based on a stale snapshot",
        });
        return;
      }

      // Store result
      await this.store.updateTask(task_id, "COMPLETED", {
        completed_at: this.clock.now().toISOString(),
        output: result.output,
        model_usage: result.model_usage,
      });
    } catch (error) {
      // Store error
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.store.updateTask(task_id, "FAILED", {
        completed_at: this.clock.now().toISOString(),
        error: errorMessage,
      });
    }
  }

  /**
   * Create a new task for execution.
   * This is called by the operator when delegating to specialists.
   */
  async createTask<TInput>(
    incident_id: string | null,
    role: string,
    input: TInput,
    state_pin: StatePin,
    options?: {
      objective?: string;
      evidence_refs?: string[];
      budget?: {
        max_tokens?: number;
        max_usd?: number;
      };
      deadline?: string;
    },
  ): Promise<string> {
    const task_id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // In real implementation, insert into database via store
    // For now, return task ID
    return task_id;
  }
}

/**
 * Bounded delegation constraints.
 */
export interface DelegationLimits {
  /** Maximum delegation depth (operator → S6 → S1 = depth 2) */
  readonly max_depth: number;
  /** Maximum parallel tasks per incident */
  readonly max_parallel: number;
  /** Task timeout in milliseconds */
  readonly timeout_ms: number;
}

export const DEFAULT_DELEGATION_LIMITS: DelegationLimits = {
  max_depth: 3,
  max_parallel: 5,
  timeout_ms: 300_000, // 5 minutes
};

/**
 * Check if delegation is allowed based on limits.
 */
export function canDelegate(
  currentDepth: number,
  currentParallel: number,
  limits: DelegationLimits = DEFAULT_DELEGATION_LIMITS,
): { allowed: boolean; reason?: string } {
  if (currentDepth >= limits.max_depth) {
    return {
      allowed: false,
      reason: `Maximum delegation depth (${limits.max_depth}) exceeded`,
    };
  }

  if (currentParallel >= limits.max_parallel) {
    return {
      allowed: false,
      reason: `Maximum parallel tasks (${limits.max_parallel}) exceeded`,
    };
  }

  return { allowed: true };
}

// Core agent runner infrastructure — stateless, read-only, structured output only
import type { z } from "zod";

/**
 * Clock interface for time control.
 */
export interface Clock {
  now(): Date;
}

/**
 * State pin (versioned snapshot of world state).
 */
export interface StatePin {
  readonly requirement_rev?: number;
  readonly config_rev?: number;
  readonly schedule_rev?: number;
  readonly offer_rev?: number;
  readonly plan_rev?: number;
  [key: string]: number | undefined;
}

/**
 * Delegation contract passed to every specialist invocation.
 * All fields are immutable for the duration of the task.
 */
export interface AgentTask<TInput = unknown> {
  /** Unique task ID (ULID) */
  readonly task_id: string;
  /** Incident ID if called by operator, null if standalone */
  readonly incident_id: string | null;
  /** Specialist role identifier */
  readonly role: string;
  /** Human-readable objective for this invocation */
  readonly objective: string;
  /** Versioned snapshot of world state at delegation time */
  readonly state_pin: StatePin;
  /** Typed input for this specialist */
  readonly input: TInput;
  /** References to evidence documents accessible to this task */
  readonly evidence_refs: string[];
  /** Token budget (optional limit) */
  readonly budget?: {
    max_tokens?: number;
    max_usd?: number;
  };
  /** Deadline for task completion */
  readonly deadline?: string;
}

/**
 * Model usage tracking for cost and latency metrics.
 */
export interface ModelUsage {
  /** Model identifier (e.g., "gpt-4o-2024-11-20") */
  readonly model: string;
  /** Input tokens */
  readonly tokens_in: number;
  /** Output tokens */
  readonly tokens_out: number;
  /** Cost in USD */
  readonly usd: number;
  /** Latency in milliseconds */
  readonly ms: number;
}

/**
 * Agent execution result with structured output and usage tracking.
 */
export interface AgentResult<TOutput> {
  /** Task ID this result corresponds to */
  readonly task_id: string;
  /** Structured output matching specialist schema */
  readonly output: TOutput;
  /** Model usage for this invocation (may be multiple calls) */
  readonly model_usage: readonly ModelUsage[];
  /** Wall-clock duration in milliseconds */
  readonly duration_ms: number;
}

/**
 * Agent runner configuration.
 */
export interface AgentConfig {
  /** Model identifier or role-based model selector */
  readonly model: string;
  /** Temperature for sampling (0 = deterministic) */
  readonly temperature?: number;
  /** Maximum tokens for completion */
  readonly max_tokens?: number;
  /** Timeout in milliseconds */
  readonly timeout_ms?: number;
}

/**
 * Abstract base for all agent workers.
 * Enforces read-only, stateless, structured output pattern.
 */
export abstract class AgentWorker<TInput, TOutput> {
  constructor(
    protected readonly config: AgentConfig,
    protected readonly clock: Clock,
  ) {}

  /**
   * Execute the agent task and return structured output.
   * This is the only public method — all agents follow the same pattern.
   */
  async execute(task: AgentTask<TInput>): Promise<AgentResult<TOutput>> {
    const start = Date.now();

    // Validate budget constraints
    this.validateBudget(task);

    // Compute effective timeout (respecting both config.timeout_ms and task.deadline)
    let effectiveTimeoutMs = this.config.timeout_ms;
    if (task.deadline) {
      const deadlineMs = new Date(task.deadline).getTime() - start;
      if (deadlineMs <= 0) {
        throw new AgentTimeoutError(task.task_id, 0, 0);
      }
      effectiveTimeoutMs =
        effectiveTimeoutMs !== undefined ? Math.min(effectiveTimeoutMs, deadlineMs) : deadlineMs;
    }

    // Execute specialist logic with active timeout enforcement
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { output, model_usage } = await (effectiveTimeoutMs
      ? Promise.race([
          this.run(task),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new AgentTimeoutError(task.task_id, Date.now() - start, effectiveTimeoutMs!));
            }, effectiveTimeoutMs);
          }),
        ]).finally(() => {
          if (timer) clearTimeout(timer);
        })
      : this.run(task));

    const duration_ms = Date.now() - start;

    return {
      task_id: task.task_id,
      output,
      model_usage,
      duration_ms,
    };
  }

  /**
   * Specialist-specific execution logic.
   * Subclasses implement this to define their behavior.
   */
  protected abstract run(task: AgentTask<TInput>): Promise<{
    output: TOutput;
    model_usage: readonly ModelUsage[];
  }>;

  /**
   * Validate Zod schema for structured output.
   * Returns typed output or throws validation error.
   */
  protected validateOutput<T>(schema: z.ZodType<T>, data: unknown): T {
    const result = schema.safeParse(data);
    if (!result.success) {
      throw new AgentValidationError("Output validation failed", result.error.errors);
    }
    return result.data;
  }

  private validateBudget(task: AgentTask<TInput>): void {
    if (task.budget?.max_tokens !== undefined && task.budget.max_tokens <= 0) {
      throw new AgentBudgetError(task.task_id, "max_tokens must be positive");
    }
    if (task.budget?.max_usd !== undefined && task.budget.max_usd <= 0) {
      throw new AgentBudgetError(task.task_id, "max_usd must be positive");
    }
  }
}

/**
 * Agent-specific errors.
 */
export class AgentError extends Error {
  constructor(
    message: string,
    public readonly task_id?: string,
  ) {
    super(message);
    this.name = "AgentError";
  }
}

export class AgentTimeoutError extends AgentError {
  constructor(
    task_id: string,
    public readonly actual_ms: number,
    public readonly timeout_ms: number,
  ) {
    super(`Task ${task_id} exceeded timeout: ${actual_ms}ms > ${timeout_ms}ms`, task_id);
    this.name = "AgentTimeoutError";
  }
}

export class AgentBudgetError extends AgentError {
  constructor(task_id: string, message: string) {
    super(`Budget violation for task ${task_id}: ${message}`, task_id);
    this.name = "AgentBudgetError";
  }
}

export class AgentValidationError extends AgentError {
  constructor(
    message: string,
    public readonly errors: Array<{ path: (string | number)[]; message: string }>,
  ) {
    super(message);
    this.name = "AgentValidationError";
  }
}

/**
 * Task status tracking for durable execution.
 */
export type TaskStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "STALE";

/**
 * Task record for database persistence.
 */
export interface TaskRecord<TInput = unknown, TOutput = unknown> {
  readonly task_id: string;
  readonly incident_id: string | null;
  readonly role: string;
  readonly status: TaskStatus;
  readonly input: TInput;
  readonly state_pin: StatePin;
  readonly created_at: string;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly output: TOutput | null;
  readonly model_usage: readonly ModelUsage[];
  readonly error: string | null;
}

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AgentWorker,
  type AgentTask,
  AgentTimeoutError,
  AgentBudgetError,
  type AgentConfig,
} from "./agent-runner.js";

// Mock Clock implementation for testing
class TestClock {
  now(): Date {
    return new Date();
  }
}

// Test worker implementation
class TestWorker extends AgentWorker<{ value: number }, { result: number }> {
  protected async run(task: AgentTask<{ value: number }>) {
    // Simulate some work
    await new Promise((resolve) => setTimeout(resolve, 10));

    const output = {
      result: task.input.value * 2,
    };

    return {
      output,
      model_usage: [
        {
          model: "test-model",
          tokens_in: 100,
          tokens_out: 50,
          usd: 0.001,
          ms: 10,
        },
      ],
    };
  }
}

describe("AgentWorker", () => {
  const clock = new TestClock();
  const config: AgentConfig = {
    model: "test-model",
    temperature: 0,
  };

  it("executes task and returns result", async () => {
    const worker = new TestWorker(config, clock);

    const task: AgentTask<{ value: number }> = {
      task_id: "task_001",
      incident_id: null,
      role: "test",
      objective: "Test task",
      state_pin: { requirement_rev: 1, config_rev: 1, schedule_rev: 1 },
      input: { value: 42 },
      evidence_refs: [],
    };

    const result = await worker.execute(task);

    expect(result.task_id).toBe("task_001");
    expect(result.output.result).toBe(84);
    expect(result.model_usage).toHaveLength(1);
    expect(result.model_usage[0]?.model).toBe("test-model");
    expect(result.duration_ms).toBeGreaterThan(0);
  });

  it("validates budget constraints", async () => {
    const worker = new TestWorker(config, clock);

    const task: AgentTask<{ value: number }> = {
      task_id: "task_002",
      incident_id: null,
      role: "test",
      objective: "Test task",
      state_pin: { requirement_rev: 1, config_rev: 1, schedule_rev: 1 },
      input: { value: 42 },
      evidence_refs: [],
      budget: {
        max_tokens: -1, // Invalid
      },
    };

    await expect(worker.execute(task)).rejects.toThrow(AgentBudgetError);
  });

  it("enforces timeout", async () => {
    class SlowWorker extends AgentWorker<{ value: number }, { result: number }> {
      protected async run(task: AgentTask<{ value: number }>) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          output: { result: task.input.value },
          model_usage: [],
        };
      }
    }

    const worker = new SlowWorker(
      {
        ...config,
        timeout_ms: 50, // Very short timeout
      },
      clock,
    );

    const task: AgentTask<{ value: number }> = {
      task_id: "task_003",
      incident_id: null,
      role: "test",
      objective: "Test task",
      state_pin: { requirement_rev: 1, config_rev: 1, schedule_rev: 1 },
      input: { value: 42 },
      evidence_refs: [],
    };

    await expect(worker.execute(task)).rejects.toThrow(AgentTimeoutError);
  });

  it("validates output schema", () => {
    const worker = new TestWorker(config, clock);

    const schema = z.object({
      result: z.number(),
    });

    const validOutput = worker["validateOutput"](schema, { result: 42 });
    expect(validOutput.result).toBe(42);

    expect(() => {
      worker["validateOutput"](schema, { result: "not a number" });
    }).toThrow();

    expect(() => {
      worker["validateOutput"](schema, { wrong_field: 42 });
    }).toThrow();
  });
});

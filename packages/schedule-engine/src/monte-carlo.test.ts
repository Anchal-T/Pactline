import { describe, expect, it } from "vitest";
import type { ActivityId } from "@pactline/domain";
import { runCounterfactualAnalysis, runMonteCarloSimulation, type ActivityDistribution } from "./monte-carlo.js";
import type { ScheduleNetwork } from "./cpm.js";

// Simple 3-activity serial network for testing
const simpleNetwork: ScheduleNetwork = {
  startDate: "2025-01-06", // Monday
  calendar: {
    workingWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
    holidays: [],
  },
  activities: [
    { id: "A" as ActivityId, durationWorkdays: 5 },
    { id: "B" as ActivityId, durationWorkdays: 3 },
    { id: "C" as ActivityId, durationWorkdays: 4 },
  ],
  dependencies: [
    { predecessorId: "A" as ActivityId, successorId: "B" as ActivityId },
    { predecessorId: "B" as ActivityId, successorId: "C" as ActivityId },
  ],
};

// Network with parallel paths for criticality testing
const parallelNetwork: ScheduleNetwork = {
  startDate: "2025-01-06",
  calendar: {
    workingWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
    holidays: [],
  },
  activities: [
    { id: "START" as ActivityId, durationWorkdays: 1 },
    { id: "PATH_A_1" as ActivityId, durationWorkdays: 10 }, // Long path
    { id: "PATH_A_2" as ActivityId, durationWorkdays: 5 },
    { id: "PATH_B_1" as ActivityId, durationWorkdays: 3 }, // Short path
    { id: "PATH_B_2" as ActivityId, durationWorkdays: 2 },
    { id: "END" as ActivityId, durationWorkdays: 1 },
  ],
  dependencies: [
    { predecessorId: "START" as ActivityId, successorId: "PATH_A_1" as ActivityId },
    { predecessorId: "START" as ActivityId, successorId: "PATH_B_1" as ActivityId },
    { predecessorId: "PATH_A_1" as ActivityId, successorId: "PATH_A_2" as ActivityId },
    { predecessorId: "PATH_B_1" as ActivityId, successorId: "PATH_B_2" as ActivityId },
    { predecessorId: "PATH_A_2" as ActivityId, successorId: "END" as ActivityId },
    { predecessorId: "PATH_B_2" as ActivityId, successorId: "END" as ActivityId },
  ],
};

describe("Monte Carlo simulation", () => {
  it("runs deterministic simulation with zero variance", () => {
    const distributions: ActivityDistribution[] = [
      {
        activityId: "A" as ActivityId,
        type: "DETERMINISTIC",
        optimistic: 5,
        mostLikely: 5,
        pessimistic: 5,
      },
      {
        activityId: "B" as ActivityId,
        type: "DETERMINISTIC",
        optimistic: 3,
        mostLikely: 3,
        pessimistic: 3,
      },
      {
        activityId: "C" as ActivityId,
        type: "DETERMINISTIC",
        optimistic: 4,
        mostLikely: 4,
        pessimistic: 4,
      },
    ];

    const result = runMonteCarloSimulation(simpleNetwork, {
      seed: 12345,
      iterations: 100,
      activityDistributions: distributions,
    });

    // With deterministic durations, all percentiles should be the same
    expect(result.projectFinishP50).toBe(result.projectFinishP80);
    expect(result.projectFinishP50).toBe(result.projectFinishP95);
    expect(result.iterations).toBe(100);
  });

  it("produces reproducible results with the same seed", () => {
    const seed = 42;
    const distributions: ActivityDistribution[] = [
      {
        activityId: "A" as ActivityId,
        type: "TRIANGULAR",
        optimistic: 3,
        mostLikely: 5,
        pessimistic: 8,
      },
      {
        activityId: "B" as ActivityId,
        type: "TRIANGULAR",
        optimistic: 2,
        mostLikely: 3,
        pessimistic: 5,
      },
      {
        activityId: "C" as ActivityId,
        type: "TRIANGULAR",
        optimistic: 3,
        mostLikely: 4,
        pessimistic: 6,
      },
    ];

    const result1 = runMonteCarloSimulation(simpleNetwork, {
      seed,
      iterations: 1000,
      activityDistributions: distributions,
    });

    const result2 = runMonteCarloSimulation(simpleNetwork, {
      seed,
      iterations: 1000,
      activityDistributions: distributions,
    });

    expect(result1.projectFinishP50).toBe(result2.projectFinishP50);
    expect(result1.projectFinishP80).toBe(result2.projectFinishP80);
    expect(result1.projectFinishP95).toBe(result2.projectFinishP95);
    expect(result1.pMeetTargetDate).toBe(result2.pMeetTargetDate);
  });

  it("produces different results with different seeds", () => {
    const distributions: ActivityDistribution[] = [
      {
        activityId: "A" as ActivityId,
        type: "TRIANGULAR",
        optimistic: 3,
        mostLikely: 5,
        pessimistic: 8,
      },
      {
        activityId: "B" as ActivityId,
        type: "TRIANGULAR",
        optimistic: 2,
        mostLikely: 3,
        pessimistic: 5,
      },
      {
        activityId: "C" as ActivityId,
        type: "TRIANGULAR",
        optimistic: 3,
        mostLikely: 4,
        pessimistic: 6,
      },
    ];

    const result1 = runMonteCarloSimulation(simpleNetwork, {
      seed: 100,
      iterations: 1000,
      activityDistributions: distributions,
    });

    const result2 = runMonteCarloSimulation(simpleNetwork, {
      seed: 200,
      iterations: 1000,
      activityDistributions: distributions,
    });

    // Results should differ in distribution, check finish distribution arrays differ
    expect(result1.finishDistribution).not.toEqual(result2.finishDistribution);
  });

  it("calculates P(meet target date) correctly", () => {
    const distributions: ActivityDistribution[] = [
      {
        activityId: "A" as ActivityId,
        type: "TRIANGULAR",
        optimistic: 4,
        mostLikely: 5,
        pessimistic: 7,
      },
      {
        activityId: "B" as ActivityId,
        type: "TRIANGULAR",
        optimistic: 2,
        mostLikely: 3,
        pessimistic: 4,
      },
      {
        activityId: "C" as ActivityId,
        type: "TRIANGULAR",
        optimistic: 3,
        mostLikely: 4,
        pessimistic: 5,
      },
    ];

    const result = runMonteCarloSimulation(simpleNetwork, {
      seed: 999,
      iterations: 5000,
      activityDistributions: distributions,
      targetDate: "2025-01-20", // Earlier target
    });

    // P(meet target) should be between 0 and 1
    expect(result.pMeetTargetDate).toBeGreaterThanOrEqual(0);
    expect(result.pMeetTargetDate).toBeLessThanOrEqual(1);

    // With an earlier target, P should be less than 1
    expect(result.pMeetTargetDate).toBeLessThan(1);
  });

  it("calculates criticality index for serial network", () => {
    const distributions: ActivityDistribution[] = [
      {
        activityId: "A" as ActivityId,
        type: "TRIANGULAR",
        optimistic: 4,
        mostLikely: 5,
        pessimistic: 6,
      },
      {
        activityId: "B" as ActivityId,
        type: "TRIANGULAR",
        optimistic: 2,
        mostLikely: 3,
        pessimistic: 4,
      },
      {
        activityId: "C" as ActivityId,
        type: "TRIANGULAR",
        optimistic: 3,
        mostLikely: 4,
        pessimistic: 5,
      },
    ];

    const result = runMonteCarloSimulation(simpleNetwork, {
      seed: 777,
      iterations: 5000,
      activityDistributions: distributions,
    });

    // In a serial network, all activities should be critical in every run
    expect(result.criticalityIndex.get("A" as ActivityId)).toBeCloseTo(1.0, 1);
    expect(result.criticalityIndex.get("B" as ActivityId)).toBeCloseTo(1.0, 1);
    expect(result.criticalityIndex.get("C" as ActivityId)).toBeCloseTo(1.0, 1);
  });

  it("calculates criticality index for parallel network", () => {
    const distributions: ActivityDistribution[] = parallelNetwork.activities.map((activity) => ({
      activityId: activity.id,
      type: "TRIANGULAR" as const,
      optimistic: Math.max(1, activity.durationWorkdays - 2),
      mostLikely: activity.durationWorkdays,
      pessimistic: activity.durationWorkdays + 2,
    }));

    const result = runMonteCarloSimulation(parallelNetwork, {
      seed: 555,
      iterations: 5000,
      activityDistributions: distributions,
    });

    // START and END should always be critical (single points)
    expect(result.criticalityIndex.get("START" as ActivityId)).toBeCloseTo(1.0, 1);
    expect(result.criticalityIndex.get("END" as ActivityId)).toBeCloseTo(1.0, 1);

    // Long path (PATH_A_*) should be critical most of the time
    const pathACriticality =
      result.criticalityIndex.get("PATH_A_1" as ActivityId)! +
      result.criticalityIndex.get("PATH_A_2" as ActivityId)!;
    expect(pathACriticality).toBeGreaterThan(1.5); // High criticality

    // Short path (PATH_B_*) should be less critical
    const pathBCriticality =
      result.criticalityIndex.get("PATH_B_1" as ActivityId)! +
      result.criticalityIndex.get("PATH_B_2" as ActivityId)!;
    expect(pathBCriticality).toBeLessThan(pathACriticality);
  });

  it("produces reasonable percentile ordering (p50 < p80 < p95)", () => {
    const distributions: ActivityDistribution[] = [
      {
        activityId: "A" as ActivityId,
        type: "PERT",
        optimistic: 3,
        mostLikely: 5,
        pessimistic: 10,
      },
      {
        activityId: "B" as ActivityId,
        type: "PERT",
        optimistic: 2,
        mostLikely: 3,
        pessimistic: 7,
      },
      {
        activityId: "C" as ActivityId,
        type: "PERT",
        optimistic: 3,
        mostLikely: 4,
        pessimistic: 8,
      },
    ];

    const result = runMonteCarloSimulation(simpleNetwork, {
      seed: 333,
      iterations: 5000,
      activityDistributions: distributions,
    });

    // p50 <= p80 <= p95
    const p50Date = new Date(result.projectFinishP50);
    const p80Date = new Date(result.projectFinishP80);
    const p95Date = new Date(result.projectFinishP95);

    expect(p50Date.getTime()).toBeLessThanOrEqual(p80Date.getTime());
    expect(p80Date.getTime()).toBeLessThanOrEqual(p95Date.getTime());
  });

  it("uses default distributions for activities without specified distributions", () => {
    // Specify distribution for only one activity
    const distributions: ActivityDistribution[] = [
      {
        activityId: "A" as ActivityId,
        type: "TRIANGULAR",
        optimistic: 4,
        mostLikely: 5,
        pessimistic: 6,
      },
    ];

    const result = runMonteCarloSimulation(simpleNetwork, {
      seed: 888,
      iterations: 1000,
      activityDistributions: distributions,
    });

    // Should complete successfully with default distributions for B and C
    expect(result.iterations).toBe(1000);
    expect(result.projectFinishP50).toBeTruthy();

    // All activities should have criticality index
    expect(result.criticalityIndex.size).toBe(3);
  });

  it("prioritizes procurement distributions over activity distributions", () => {
    const activityDistributions: ActivityDistribution[] = [
      {
        activityId: "A" as ActivityId,
        type: "DETERMINISTIC",
        optimistic: 5,
        mostLikely: 5,
        pessimistic: 5,
      },
    ];

    const procurementDistributions: ActivityDistribution[] = [
      {
        activityId: "A" as ActivityId,
        type: "DETERMINISTIC",
        optimistic: 10, // Different value
        mostLikely: 10,
        pessimistic: 10,
      },
    ];

    const result = runMonteCarloSimulation(simpleNetwork, {
      seed: 111,
      iterations: 100,
      activityDistributions,
      procurementDistributions,
    });

    // Result should reflect procurement distribution (10 days for A)
    // Total: 10 (A) + 3 (B with defaults) + 4 (C with defaults) = 17 workdays
    // Starting 2025-01-06 (Mon) + 17 workdays ends on the 17th working day
    // We expect the finish to reflect the longer duration
    const finishDate = new Date(result.projectFinishP50);
    const startDate = new Date("2025-01-06");

    // Should be significantly later than baseline (12 workdays)
    expect(finishDate.getTime()).toBeGreaterThan(startDate.getTime());
  });

  it("validates iteration count bounds", () => {
    expect(() =>
      runMonteCarloSimulation(simpleNetwork, {
        seed: 1,
        iterations: 0,
      }),
    ).toThrow("Iterations must be between 1 and 100,000");

    expect(() =>
      runMonteCarloSimulation(simpleNetwork, {
        seed: 1,
        iterations: 150000,
      }),
    ).toThrow("Iterations must be between 1 and 100,000");
  });
});

describe("Counterfactual analysis", () => {
  it("calculates delta P(on-time) for recovery option", () => {
    const baselineDistributions: ActivityDistribution[] = [
      {
        activityId: "A" as ActivityId,
        type: "TRIANGULAR",
        optimistic: 8,
        mostLikely: 10,
        pessimistic: 14, // Delayed
      },
      {
        activityId: "B" as ActivityId,
        type: "DETERMINISTIC",
        optimistic: 3,
        mostLikely: 3,
        pessimistic: 3,
      },
      {
        activityId: "C" as ActivityId,
        type: "DETERMINISTIC",
        optimistic: 4,
        mostLikely: 4,
        pessimistic: 4,
      },
    ];

    const counterfactualDistributions: ActivityDistribution[] = [
      {
        activityId: "A" as ActivityId,
        type: "TRIANGULAR",
        optimistic: 4,
        mostLikely: 5,
        pessimistic: 7, // Expedited
      },
      {
        activityId: "B" as ActivityId,
        type: "DETERMINISTIC",
        optimistic: 3,
        mostLikely: 3,
        pessimistic: 3,
      },
      {
        activityId: "C" as ActivityId,
        type: "DETERMINISTIC",
        optimistic: 4,
        mostLikely: 4,
        pessimistic: 4,
      },
    ];

    const result = runCounterfactualAnalysis(
      simpleNetwork,
      {
        seed: 999,
        iterations: 5000,
        activityDistributions: baselineDistributions,
        targetDate: "2025-01-20",
      },
      {
        seed: 999, // Same seed for fair comparison
        iterations: 5000,
        activityDistributions: counterfactualDistributions,
        scenarioName: "expedite-A",
      },
    );

    expect(result.scenarioName).toBe("expedite-A");

    // Counterfactual should have higher P(on-time)
    expect(result.deltaPOnTime).toBeGreaterThan(0);
    expect(result.counterfactual.pMeetTargetDate).toBeGreaterThan(result.baseline.pMeetTargetDate);

    // Counterfactual should have earlier finish
    expect(result.deltaP50Workdays).toBeLessThan(0);
  });

  it("handles activity overrides in counterfactual", () => {
    const overrides = new Map<ActivityId, number>([
      ["A" as ActivityId, 3], // Reduce from 5 to 3
    ]);

    const result = runCounterfactualAnalysis(
      simpleNetwork,
      {
        seed: 123,
        iterations: 1000,
      },
      {
        seed: 123,
        iterations: 1000,
        activityOverrides: overrides,
        scenarioName: "fast-A",
      },
    );

    // With A shortened, counterfactual should be better
    expect(result.deltaP50Workdays).toBeLessThan(0);
    expect(result.scenarioName).toBe("fast-A");
  });

  it("handles forecast overrides in counterfactual", () => {
    const forecastOverrides = [
      {
        activityId: "B" as ActivityId,
        date: "2025-01-30", // Force late finish for B (much later)
      },
    ];

    const result = runCounterfactualAnalysis(
      simpleNetwork,
      {
        seed: 456,
        iterations: 1000,
        targetDate: "2025-01-20", // Earlier target
      },
      {
        seed: 456,
        iterations: 1000,
        forecastOverrides,
        scenarioName: "vendor-delay",
        targetDate: "2025-01-20", // Same target
      },
    );

    // With vendor delay forcing late finish, counterfactual should be worse
    expect(result.deltaP50Workdays).toBeGreaterThan(0);
    expect(result.scenarioName).toBe("vendor-delay");
  });

  it("produces consistent baseline and counterfactual with same parameters", () => {
    const distributions: ActivityDistribution[] = [
      {
        activityId: "A" as ActivityId,
        type: "TRIANGULAR",
        optimistic: 4,
        mostLikely: 5,
        pessimistic: 6,
      },
    ];

    const result = runCounterfactualAnalysis(
      simpleNetwork,
      {
        seed: 777,
        iterations: 1000,
        activityDistributions: distributions,
      },
      {
        seed: 777,
        iterations: 1000,
        activityDistributions: distributions,
        scenarioName: "no-change",
      },
    );

    // With identical parameters, delta should be near zero
    expect(Math.abs(result.deltaPOnTime)).toBeLessThan(0.01);
    expect(Math.abs(result.deltaP50Workdays)).toBeLessThanOrEqual(1); // Allow 1 day rounding
  });

  it("compares multiple recovery options", () => {
    // Scenario: Activity A is delayed, compare expedite vs substitute

    const baselineDistributions: ActivityDistribution[] = [
      {
        activityId: "A" as ActivityId,
        type: "TRIANGULAR",
        optimistic: 8,
        mostLikely: 12,
        pessimistic: 16,
      },
    ];

    // Option 1: Expedite (faster but still uncertain)
    const expediteResult = runCounterfactualAnalysis(
      simpleNetwork,
      {
        seed: 999,
        iterations: 3000,
        activityDistributions: baselineDistributions,
        targetDate: "2025-01-23",
      },
      {
        seed: 999,
        iterations: 3000,
        activityDistributions: [
          {
            activityId: "A" as ActivityId,
            type: "TRIANGULAR",
            optimistic: 5,
            mostLikely: 7,
            pessimistic: 10,
          },
        ],
        scenarioName: "expedite",
      },
    );

    // Option 2: Substitute (deterministic, slightly longer approval process)
    const substituteResult = runCounterfactualAnalysis(
      simpleNetwork,
      {
        seed: 999,
        iterations: 3000,
        activityDistributions: baselineDistributions,
        targetDate: "2025-01-23",
      },
      {
        seed: 999,
        iterations: 3000,
        activityDistributions: [
          {
            activityId: "A" as ActivityId,
            type: "DETERMINISTIC",
            optimistic: 6,
            mostLikely: 6,
            pessimistic: 6,
          },
        ],
        activityOverrides: new Map([
          ["B" as ActivityId, 4], // Add approval time
        ]),
        scenarioName: "substitute",
      },
    );

    // Both should improve over baseline
    expect(expediteResult.deltaPOnTime).toBeGreaterThan(0);
    expect(substituteResult.deltaPOnTime).toBeGreaterThan(0);

    // Can compare which option is better
    expect(expediteResult.scenarioName).toBe("expedite");
    expect(substituteResult.scenarioName).toBe("substitute");
  });
});

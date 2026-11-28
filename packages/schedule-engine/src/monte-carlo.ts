// Monte Carlo simulation over CPM — pure deterministic TypeScript, seeded RNG.
import type { ActivityId } from "@pactline/domain";
import { WorkCalendar } from "./calendar.js";
import { ScheduleError } from "./errors.js";
import { type ForecastFinish, type ScheduleNetwork, type ScheduleOptions, solve } from "./cpm.js";

export interface ActivityDistribution {
  /** Activity ID */
  readonly activityId: ActivityId;
  /** Distribution type: PERT (beta), triangular, or deterministic */
  readonly type: "PERT" | "TRIANGULAR" | "DETERMINISTIC";
  /** Optimistic duration (workdays) */
  readonly optimistic: number;
  /** Most likely duration (workdays) */
  readonly mostLikely: number;
  /** Pessimistic duration (workdays) */
  readonly pessimistic: number;
}

export interface MonteCarloOptions {
  /** Number of simulation runs. Default: 5000 */
  readonly iterations?: number;
  /** Seed for reproducible RNG. Required. */
  readonly seed: number;
  /** Activity duration distributions. Activities not listed use deterministic duration from network. */
  readonly activityDistributions?: readonly ActivityDistribution[];
  /** Procurement lead-time distributions (from S5). Overrides activity distributions if both specified. */
  readonly procurementDistributions?: readonly ActivityDistribution[];
  /** Target date for P(meet date) calculation. If omitted, uses computed early finish. */
  readonly targetDate?: string;
}

export interface MonteCarloResult {
  /** Median project finish date (p50) */
  readonly projectFinishP50: string;
  /** 80th percentile project finish date */
  readonly projectFinishP80: string;
  /** 95th percentile project finish date */
  readonly projectFinishP95: string;
  /** Probability of meeting the target date (0.0 to 1.0) */
  readonly pMeetTargetDate: number;
  /** Criticality index per activity: fraction of runs where activity was critical (0.0 to 1.0) */
  readonly criticalityIndex: ReadonlyMap<ActivityId, number>;
  /** Distribution of project finish days (index from calendar start) */
  readonly finishDistribution: readonly number[];
  /** Number of iterations run */
  readonly iterations: number;
}

export interface CounterfactualOptions extends MonteCarloOptions {
  /** Counterfactual scenario name for logging */
  readonly scenarioName?: string;
  /** Override specific activity durations for this scenario */
  readonly activityOverrides?: ReadonlyMap<ActivityId, number>;
  /** Override forecast finishes for this scenario */
  readonly forecastOverrides?: readonly ForecastFinish[];
}

export interface CounterfactualResult {
  readonly scenarioName: string;
  readonly baseline: MonteCarloResult;
  readonly counterfactual: MonteCarloResult;
  /** Delta in P(on-time): counterfactual - baseline */
  readonly deltaPOnTime: number;
  /** Delta in p50 finish (workdays): counterfactual - baseline */
  readonly deltaP50Workdays: number;
}

/** Default distribution parameters when activity has no specified distribution */
const DEFAULT_PERT_SPREAD = 0.2; // ±20% around most likely

/** Seeded random number generator (simple LCG for determinism) */
class SeededRNG {
  private state: number;
  private readonly a = 1664525;
  private readonly c = 1013904223;
  private readonly m = 2 ** 32;

  constructor(seed: number) {
    this.state = seed >>> 0; // Ensure unsigned 32-bit
  }

  /** Returns a random float in [0, 1) */
  next(): number {
    this.state = (this.a * this.state + this.c) % this.m;
    return this.state / this.m;
  }

  /** Returns a random integer in [min, max] inclusive */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

/** Sample a standard normal N(0, 1) variate using Box-Muller transform */
function sampleStandardNormal(rng: SeededRNG): number {
  const u1 = Math.max(1e-12, rng.next());
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Sample from Gamma(shape, 1) using Marsaglia & Tsang's method (shape >= 1) */
function sampleGamma(shape: number, rng: SeededRNG): number {
  if (shape < 1) {
    // Boost to shape + 1 and scale by U^(1/shape)
    const u = Math.max(1e-12, rng.next());
    return sampleGamma(shape + 1, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number;
    let v: number;
    do {
      x = sampleStandardNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng.next();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(Math.max(1e-12, u)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Sample from PERT (Beta) distribution: mean = (o + 4m + p) / 6, lambda = 4 */
function samplePERT(optimistic: number, mostLikely: number, pessimistic: number, rng: SeededRNG): number {
  const range = pessimistic - optimistic;
  if (range <= 0) return mostLikely;

  const clampedMode = Math.min(pessimistic, Math.max(optimistic, mostLikely));
  // Standard PERT (lambda = 4): alpha + beta = 6, E[X] = (o + 4m + p) / 6
  const alpha = 1 + (4 * (clampedMode - optimistic)) / range;
  const beta = 1 + (4 * (pessimistic - clampedMode)) / range;

  const g1 = sampleGamma(alpha, rng);
  const g2 = sampleGamma(beta, rng);
  const sum = g1 + g2;
  if (sum <= 0) return clampedMode;

  return optimistic + range * (g1 / sum);
}

/** Sample from triangular distribution */
function sampleTriangular(min: number, mode: number, max: number, rng: SeededRNG): number {
  const u = rng.next();
  const F = (mode - min) / (max - min); // CDF at mode

  if (u < F) {
    // Lower triangle
    return min + Math.sqrt(u * (max - min) * (mode - min));
  } else {
    // Upper triangle
    return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  }
}

/** Create default distribution for an activity with no specified distribution */
function createDefaultDistribution(activityId: ActivityId, baseDuration: number): ActivityDistribution {
  const optimistic = Math.max(1, Math.floor(baseDuration * (1 - DEFAULT_PERT_SPREAD)));
  const pessimistic = Math.ceil(baseDuration * (1 + DEFAULT_PERT_SPREAD));

  return {
    activityId,
    type: "PERT",
    optimistic,
    mostLikely: baseDuration,
    pessimistic,
  };
}

export function runMonteCarloSimulation(
  network: ScheduleNetwork,
  options: MonteCarloOptions,
  scheduleOptions: ScheduleOptions = {},
): MonteCarloResult {
  const iterations = options.iterations ?? 5000;
  if (iterations < 1 || iterations > 100000) {
    throw new ScheduleError("Iterations must be between 1 and 100,000");
  }

  const rng = new SeededRNG(options.seed);
  const calendar = new WorkCalendar(network.calendar, network.startDate);

  // Build distribution map
  const distributions = new Map<ActivityId, ActivityDistribution>();

  // Add procurement distributions (highest priority)
  if (options.procurementDistributions) {
    for (const dist of options.procurementDistributions) {
      distributions.set(dist.activityId, dist);
    }
  }

  // Add activity distributions (lower priority)
  if (options.activityDistributions) {
    for (const dist of options.activityDistributions) {
      if (!distributions.has(dist.activityId)) {
        distributions.set(dist.activityId, dist);
      }
    }
  }

  // Unlisted activities keep their deterministic network duration
  for (const activity of network.activities) {
    if (!distributions.has(activity.id)) {
      distributions.set(activity.id, {
        activityId: activity.id,
        type: "DETERMINISTIC",
        optimistic: activity.durationWorkdays,
        mostLikely: activity.durationWorkdays,
        pessimistic: activity.durationWorkdays,
      });
    }
  }

  // Determine target date (last working day on or before targetDateStr)
  const baselineSolved = solve(network, scheduleOptions);
  const targetDateStr = options.targetDate ?? baselineSolved.result.projectFinish;
  const targetDay = calendar.endIndexThrough(targetDateStr) - 1;

  // Run simulations
  const finishDays: number[] = [];
  const criticalityCounts = new Map<ActivityId, number>();

  for (const activity of network.activities) {
    criticalityCounts.set(activity.id, 0);
  }

  for (let i = 0; i < iterations; i++) {
    // Sample durations for this iteration
    const sampledActivities = network.activities.map((activity) => {
      const dist = distributions.get(activity.id)!;
      let sampledDuration: number;

      if (dist.type === "DETERMINISTIC") {
        sampledDuration = dist.mostLikely;
      } else if (dist.type === "TRIANGULAR") {
        sampledDuration = sampleTriangular(dist.optimistic, dist.mostLikely, dist.pessimistic, rng);
      } else {
        // PERT
        sampledDuration = samplePERT(dist.optimistic, dist.mostLikely, dist.pessimistic, rng);
      }

      // Preserve zero-duration milestones; otherwise round to nearest workday (minimum 1)
      sampledDuration =
        activity.durationWorkdays === 0 || (dist.type === "DETERMINISTIC" && dist.mostLikely === 0)
          ? 0
          : Math.max(1, Math.round(sampledDuration));

      return {
        id: activity.id,
        durationWorkdays: sampledDuration,
      };
    });

    // Run CPM with sampled durations
    const sampledNetwork = {
      ...network,
      activities: sampledActivities,
    };

    try {
      const solved = solve(sampledNetwork, scheduleOptions);
      finishDays.push(solved.projectFinishDay);

      // Track critical activities
      for (const activityId of solved.result.criticalPath) {
        criticalityCounts.set(activityId, (criticalityCounts.get(activityId) ?? 0) + 1);
      }
    } catch (error) {
      // Schedule error in this iteration (cycle, etc.) — skip
      continue;
    }
  }

  if (finishDays.length === 0) {
    throw new ScheduleError("All Monte Carlo iterations failed");
  }

  // Sort finish days for percentile calculation
  finishDays.sort((a, b) => a - b);

  const p50Index = Math.floor(finishDays.length * 0.5);
  const p80Index = Math.floor(finishDays.length * 0.8);
  const p95Index = Math.floor(finishDays.length * 0.95);

  const p50Day = finishDays[p50Index]!;
  const p80Day = finishDays[p80Index]!;
  const p95Day = finishDays[p95Index]!;

  // Calculate P(meet target)
  const meetsTarget = finishDays.filter((day) => day <= targetDay).length;
  const pMeetTargetDate = meetsTarget / finishDays.length;

  // Calculate criticality index
  const criticalityIndex = new Map<ActivityId, number>();
  for (const [activityId, count] of criticalityCounts) {
    criticalityIndex.set(activityId, count / finishDays.length);
  }

  return {
    projectFinishP50: calendar.dateOf(p50Day),
    projectFinishP80: calendar.dateOf(p80Day),
    projectFinishP95: calendar.dateOf(p95Day),
    pMeetTargetDate,
    criticalityIndex,
    finishDistribution: finishDays,
    iterations: finishDays.length,
  };
}

export function runCounterfactualAnalysis(
  network: ScheduleNetwork,
  baselineOptions: MonteCarloOptions,
  counterfactualOptions: CounterfactualOptions,
  scheduleOptions: ScheduleOptions = {},
): CounterfactualResult {
  const scenarioName = counterfactualOptions.scenarioName ?? "counterfactual";

  // Resolve a single shared target date so baseline and counterfactual compare against the same deadline
  const sharedTargetDate =
    counterfactualOptions.targetDate ??
    baselineOptions.targetDate ??
    solve(network, scheduleOptions).result.projectFinish;

  const resolvedBaselineOptions: MonteCarloOptions = {
    ...baselineOptions,
    targetDate: sharedTargetDate,
  };

  // Run baseline with shared target date
  const baselineResult = runMonteCarloSimulation(network, resolvedBaselineOptions, scheduleOptions);

  // Apply counterfactual overrides
  let counterfactualNetwork = network;
  let resolvedCounterfactualDistributions = counterfactualOptions.activityDistributions
    ? [...counterfactualOptions.activityDistributions]
    : undefined;
  let resolvedProcurementDistributions = counterfactualOptions.procurementDistributions
    ? [...counterfactualOptions.procurementDistributions]
    : undefined;

  if (counterfactualOptions.activityOverrides && counterfactualOptions.activityOverrides.size > 0) {
    const overriddenActivities = network.activities.map((activity) => {
      const override = counterfactualOptions.activityOverrides!.get(activity.id);
      if (override !== undefined) {
        return {
          ...activity,
          durationWorkdays: override,
        };
      }
      return activity;
    });

    counterfactualNetwork = {
      ...network,
      activities: overriddenActivities,
    };

    // Ensure activityOverrides replace any supplied distribution (activity or procurement) for the same activity
    if (resolvedProcurementDistributions) {
      resolvedProcurementDistributions = resolvedProcurementDistributions.filter(
        (d) => !counterfactualOptions.activityOverrides!.has(d.activityId),
      );
    }
    if (resolvedCounterfactualDistributions) {
      resolvedCounterfactualDistributions = resolvedCounterfactualDistributions.filter(
        (d) => !counterfactualOptions.activityOverrides!.has(d.activityId),
      );
      for (const [activityId, duration] of counterfactualOptions.activityOverrides.entries()) {
        resolvedCounterfactualDistributions.push({
          activityId,
          type: "DETERMINISTIC",
          optimistic: duration,
          mostLikely: duration,
          pessimistic: duration,
        });
      }
    }
  }

  // Apply forecast overrides to schedule options
  const counterfactualScheduleOptions = counterfactualOptions.forecastOverrides
    ? { ...scheduleOptions, forecastFinishes: counterfactualOptions.forecastOverrides }
    : scheduleOptions;

  // Run counterfactual with the same shared target date
  const counterfactual = runMonteCarloSimulation(
    counterfactualNetwork,
    {
      ...counterfactualOptions,
      targetDate: sharedTargetDate,
      activityDistributions: resolvedCounterfactualDistributions,
      procurementDistributions: resolvedProcurementDistributions,
    },
    counterfactualScheduleOptions,
  );

  const calendar = new WorkCalendar(network.calendar, network.startDate);
  const baselineP50Day = calendar.indexOnOrAfter(baselineResult.projectFinishP50);
  const counterfactualP50Day = calendar.indexOnOrAfter(counterfactual.projectFinishP50);

  return {
    scenarioName,
    baseline: baselineResult,
    counterfactual,
    deltaPOnTime: counterfactual.pMeetTargetDate - baselineResult.pMeetTargetDate,
    deltaP50Workdays: counterfactualP50Day - baselineP50Day,
  };
}

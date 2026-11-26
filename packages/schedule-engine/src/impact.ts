import type { ActivityId, IncidentSeverity } from "@pactline/domain";
import { type ScheduleNetwork, type ScheduleResult, finishDate, solve } from "./cpm.js";
import { ScheduleError } from "./errors.js";

export interface DelayForecast {
  readonly activityId: ActivityId;
  /** Inclusive date the activity is now forecast to finish (e.g. revised vendor arrival). */
  readonly forecastFinishDate: string;
}

export interface ImpactOptions {
  /** Inclusive project must-finish-by date. Defaults to the baseline early finish. */
  readonly deadline?: string;
  /** Remaining float at or below this many workdays is a WARNING. Default 2. */
  readonly warningFloatWorkdays?: number;
}

export interface ActivitySlip {
  readonly activityId: ActivityId;
  readonly baselineFinish: string;
  readonly projectedStart: string;
  readonly projectedFinish: string;
  readonly slipWorkdays: number;
}

export interface ImpactAnalysis {
  readonly impact: IncidentSeverity;
  readonly activityId: ActivityId;
  readonly baselineFinish: string;
  readonly projectedFinish: string;
  readonly slipWorkdays: number;
  /** Baseline late finish: the latest this activity can finish without breaching the deadline. */
  readonly latestAllowableFinish: string;
  readonly baselineFloatWorkdays: number;
  readonly floatConsumedWorkdays: number;
  /** Negative means the deadline is breached by that many workdays. */
  readonly remainingFloatWorkdays: number;
  /** Activities whose early finish moves later, in topological order. */
  readonly delayedActivities: readonly ActivitySlip[];
  readonly criticalPathAffected: boolean;
  readonly newlyCriticalActivityIds: readonly ActivityId[];
  readonly projectFinish: {
    readonly baseline: string;
    readonly projected: string;
    readonly slipWorkdays: number;
  };
  readonly projectedSchedule: ScheduleResult;
}

/**
 * Re-runs CPM with a forecast finish for one activity and classifies the impact
 * against the baseline late finish (the activity's need date):
 * NONE (no slip) | FLOAT_ABSORBED | WARNING (float nearly exhausted) | CRITICAL (deadline breached).
 */
export function analyzeDelay(
  network: ScheduleNetwork,
  delay: DelayForecast,
  options: ImpactOptions = {},
): ImpactAnalysis {
  const warningFloat = options.warningFloatWorkdays ?? 2;
  if (!Number.isInteger(warningFloat) || warningFloat < 0) {
    throw new ScheduleError("warningFloatWorkdays must be a non-negative integer");
  }
  const baseline = solve(network, { deadline: options.deadline });
  const projected = solve(network, {
    deadline: options.deadline,
    forecastFinishes: [{ activityId: delay.activityId, date: delay.forecastFinishDate }],
  });
  const calendar = baseline.calendar;

  const base = baseline.timings.get(delay.activityId);
  const next = projected.timings.get(delay.activityId);
  if (!base || !next) throw new ScheduleError(`Unknown activity "${delay.activityId}"`);

  const slip = next.efx - base.efx;
  const remainingFloat = base.lfx - next.efx;

  const delayedActivities: ActivitySlip[] = [];
  const newlyCriticalActivityIds: ActivityId[] = [];
  for (const id of projected.order) {
    const before = baseline.timings.get(id)!;
    const after = projected.timings.get(id)!;
    if (after.efx > before.efx) {
      delayedActivities.push({
        activityId: id,
        baselineFinish: finishDate(calendar, before.es, before.efx),
        projectedStart: calendar.dateOf(after.es),
        projectedFinish: finishDate(calendar, after.es, after.efx),
        slipWorkdays: after.efx - before.efx,
      });
    }
    if (after.critical && !before.critical) newlyCriticalActivityIds.push(id);
  }

  const projectSlip = projected.projectFinishDay - baseline.projectFinishDay;

  return {
    impact: classify(slip, remainingFloat, warningFloat),
    activityId: delay.activityId,
    baselineFinish: finishDate(calendar, base.es, base.efx),
    projectedFinish: finishDate(calendar, next.es, next.efx),
    slipWorkdays: Math.max(0, slip),
    latestAllowableFinish: finishDate(calendar, base.ls, base.lfx),
    baselineFloatWorkdays: base.float,
    floatConsumedWorkdays: Math.max(0, Math.min(slip, base.float)),
    remainingFloatWorkdays: remainingFloat,
    delayedActivities,
    criticalPathAffected: slip > 0 && (next.critical || projectSlip > 0),
    newlyCriticalActivityIds,
    projectFinish: {
      baseline: baseline.result.projectFinish,
      projected: projected.result.projectFinish,
      slipWorkdays: projectSlip,
    },
    projectedSchedule: projected.result,
  };
}

function classify(slip: number, remainingFloat: number, warningFloat: number): IncidentSeverity {
  if (slip <= 0) return "NONE";
  if (remainingFloat < 0) return "CRITICAL";
  if (remainingFloat <= warningFloat) return "WARNING";
  return "FLOAT_ABSORBED";
}

import type { ActivityId } from "@pactline/domain";
import { type CalendarSpec, WorkCalendar } from "./calendar.js";
import { ScheduleError } from "./errors.js";

export interface ScheduleActivity {
  readonly id: ActivityId;
  readonly durationWorkdays: number;
}

/** Finish-to-start link: the successor may start `lagWorkdays` after the predecessor finishes. */
export interface Dependency {
  readonly predecessorId: ActivityId;
  readonly successorId: ActivityId;
  readonly lagWorkdays?: number;
}

export interface StartNoEarlierThan {
  readonly type: "START_NO_EARLIER_THAN";
  readonly activityId: ActivityId;
  readonly date: string;
}

export interface ScheduleNetwork {
  readonly startDate: string;
  readonly calendar: CalendarSpec;
  readonly activities: readonly ScheduleActivity[];
  readonly dependencies: readonly Dependency[];
  readonly constraints?: readonly StartNoEarlierThan[];
}

/** A forecast that an activity finishes no earlier than `date` (e.g. a vendor's revised arrival). */
export interface ForecastFinish {
  readonly activityId: ActivityId;
  readonly date: string;
}

export interface ScheduleOptions {
  /** Inclusive must-finish-by date for the project. Defaults to the computed early finish. */
  readonly deadline?: string;
  readonly forecastFinishes?: readonly ForecastFinish[];
}

/** All dates are inclusive working days. */
export interface ScheduledActivity {
  readonly id: ActivityId;
  readonly durationWorkdays: number;
  readonly earlyStart: string;
  readonly earlyFinish: string;
  readonly lateStart: string;
  readonly lateFinish: string;
  readonly totalFloatWorkdays: number;
  readonly critical: boolean;
}

export interface ScheduleResult {
  readonly projectStart: string;
  readonly projectFinish: string;
  readonly activities: ReadonlyMap<ActivityId, ScheduledActivity>;
  /** Critical activities in topological order. */
  readonly criticalPath: readonly ActivityId[];
}

/** Working-day indices; `efx`/`lfx` are exclusive ends. */
export interface Timing {
  readonly es: number;
  readonly efx: number;
  readonly ls: number;
  readonly lfx: number;
  readonly float: number;
  readonly critical: boolean;
}

export interface Solved {
  readonly calendar: WorkCalendar;
  readonly order: readonly ActivityId[];
  readonly timings: ReadonlyMap<ActivityId, Timing>;
  readonly projectFinishX: number;
  readonly result: ScheduleResult;
}

interface Link {
  readonly id: ActivityId;
  readonly lag: number;
}

export function computeSchedule(network: ScheduleNetwork, options: ScheduleOptions = {}): ScheduleResult {
  return solve(network, options).result;
}

export function solve(network: ScheduleNetwork, options: ScheduleOptions = {}): Solved {
  const calendar = new WorkCalendar(network.calendar, network.startDate);
  const durations = new Map<ActivityId, number>();
  for (const activity of network.activities) {
    if (durations.has(activity.id)) throw new ScheduleError(`Duplicate activity "${activity.id}"`);
    assertNonNegativeInt(activity.durationWorkdays, `Duration of "${activity.id}"`);
    durations.set(activity.id, activity.durationWorkdays);
  }
  const requireKnown = (id: ActivityId, context: string): void => {
    if (!durations.has(id)) throw new ScheduleError(`${context} references unknown activity "${id}"`);
  };

  const preds = new Map<ActivityId, Link[]>();
  const succs = new Map<ActivityId, Link[]>();
  for (const id of durations.keys()) {
    preds.set(id, []);
    succs.set(id, []);
  }
  for (const dep of network.dependencies) {
    requireKnown(dep.predecessorId, "Dependency");
    requireKnown(dep.successorId, "Dependency");
    if (dep.predecessorId === dep.successorId) {
      throw new ScheduleError(`Activity "${dep.predecessorId}" depends on itself`);
    }
    const lag = dep.lagWorkdays ?? 0;
    if (!Number.isInteger(lag)) throw new ScheduleError(`Lag on "${dep.successorId}" must be an integer`);
    preds.get(dep.successorId)!.push({ id: dep.predecessorId, lag });
    succs.get(dep.predecessorId)!.push({ id: dep.successorId, lag });
  }

  const minStart = new Map<ActivityId, number>();
  for (const constraint of network.constraints ?? []) {
    requireKnown(constraint.activityId, "Constraint");
    const index = calendar.indexOnOrAfter(constraint.date);
    minStart.set(constraint.activityId, Math.max(index, minStart.get(constraint.activityId) ?? 0));
  }
  const minFinishX = new Map<ActivityId, number>();
  for (const forecast of options.forecastFinishes ?? []) {
    requireKnown(forecast.activityId, "Forecast");
    const endX = calendar.endIndexThrough(forecast.date);
    minFinishX.set(forecast.activityId, Math.max(endX, minFinishX.get(forecast.activityId) ?? 0));
  }

  const order = topologicalOrder(durations, preds, succs);

  const es = new Map<ActivityId, number>();
  const efx = new Map<ActivityId, number>();
  for (const id of order) {
    const duration = durations.get(id)!;
    let start = minStart.get(id) ?? 0;
    for (const pred of preds.get(id)!) start = Math.max(start, efx.get(pred.id)! + pred.lag);
    const forecastEnd = minFinishX.get(id);
    if (forecastEnd !== undefined) start = Math.max(start, forecastEnd - duration);
    es.set(id, start);
    efx.set(id, start + duration);
  }

  const projectFinishX = Math.max(0, ...efx.values());
  const terminalX = options.deadline === undefined ? projectFinishX : calendar.endIndexThrough(options.deadline);

  const ls = new Map<ActivityId, number>();
  const lfx = new Map<ActivityId, number>();
  for (const id of [...order].reverse()) {
    const successors = succs.get(id)!;
    const finish =
      successors.length === 0 ? terminalX : Math.min(...successors.map((s) => ls.get(s.id)! - s.lag));
    lfx.set(id, finish);
    ls.set(id, finish - durations.get(id)!);
  }

  const floats = order.map((id) => ls.get(id)! - es.get(id)!);
  const criticalThreshold = Math.max(0, Math.min(...floats));

  const timings = new Map<ActivityId, Timing>();
  const activities = new Map<ActivityId, ScheduledActivity>();
  const criticalPath: ActivityId[] = [];
  for (const id of order) {
    const timing: Timing = {
      es: es.get(id)!,
      efx: efx.get(id)!,
      ls: ls.get(id)!,
      lfx: lfx.get(id)!,
      float: ls.get(id)! - es.get(id)!,
      critical: ls.get(id)! - es.get(id)! <= criticalThreshold,
    };
    timings.set(id, timing);
    if (timing.critical) criticalPath.push(id);
    const duration = durations.get(id)!;
    activities.set(id, {
      id,
      durationWorkdays: duration,
      earlyStart: calendar.dateOf(timing.es),
      earlyFinish: finishDate(calendar, timing.es, timing.efx),
      lateStart: calendar.dateOf(timing.ls),
      lateFinish: finishDate(calendar, timing.ls, timing.lfx),
      totalFloatWorkdays: timing.float,
      critical: timing.critical,
    });
  }

  return {
    calendar,
    order,
    timings,
    projectFinishX,
    result: {
      projectStart: calendar.dateOf(0),
      projectFinish: finishDate(calendar, 0, projectFinishX),
      activities,
      criticalPath,
    },
  };
}

/** Inclusive finish date; a zero-duration milestone finishes on its start day. */
export function finishDate(calendar: WorkCalendar, start: number, endX: number): string {
  return calendar.dateOf(endX > start ? endX - 1 : start);
}

function topologicalOrder(
  durations: ReadonlyMap<ActivityId, number>,
  preds: ReadonlyMap<ActivityId, readonly Link[]>,
  succs: ReadonlyMap<ActivityId, readonly Link[]>,
): ActivityId[] {
  const remaining = new Map<ActivityId, number>();
  for (const id of durations.keys()) remaining.set(id, preds.get(id)!.length);
  const ready = [...durations.keys()].filter((id) => remaining.get(id) === 0);
  const order: ActivityId[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const succ of succs.get(id)!) {
      const left = remaining.get(succ.id)! - 1;
      remaining.set(succ.id, left);
      if (left === 0) ready.push(succ.id);
    }
  }
  if (order.length !== durations.size) {
    const cyclic = [...remaining].filter(([, left]) => left > 0).map(([id]) => id);
    throw new ScheduleError(`Dependency cycle among: ${cyclic.join(", ")}`);
  }
  return order;
}

function assertNonNegativeInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new ScheduleError(`${label} must be a non-negative integer, got ${value}`);
  }
}

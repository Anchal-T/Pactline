import type { ActivityId } from "@pactline/domain";
import { describe, expect, it } from "vitest";
import {
  type ScheduleNetwork,
  ScheduleError,
  WorkCalendar,
  analyzeDelay,
  computeSchedule,
} from "./index.js";

const id = (value: string) => value as ActivityId;

const CALENDAR = {
  workingWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  holidays: ["2026-12-25", "2027-01-01"],
} as const;

// Mirrors the SYNTHETIC data/fixtures/project-schedule.json baseline (phase-1 branch).
const chain: Array<[string, number]> = [
  ["design", 4],
  ["submittal", 4],
  ["po", 1],
  ["fabrication", 9],
  ["factory-test", 1],
  ["delivery", 1],
  ["receiving", 1],
  ["installation", 3],
  ["piping", 2],
  ["commissioning", 2],
  ["handover", 1],
];
const PUMP_SCHEDULE: ScheduleNetwork = {
  startDate: "2026-11-30",
  calendar: CALENDAR,
  activities: [
    ...chain.map(([name, durationWorkdays]) => ({ id: id(name), durationWorkdays })),
    { id: id("site-prep"), durationWorkdays: 3 },
  ],
  dependencies: [
    ...chain.slice(1).map(([name], i) => ({ predecessorId: id(chain[i]![0]), successorId: id(name) })),
    { predecessorId: id("design"), successorId: id("site-prep") },
    { predecessorId: id("site-prep"), successorId: id("installation") },
  ],
  constraints: [{ type: "START_NO_EARLIER_THAN", activityId: id("site-prep"), date: "2026-12-07" }],
};

describe("WorkCalendar", () => {
  const calendar = new WorkCalendar(CALENDAR, "2026-11-30");

  it("skips weekends and holidays in both directions", () => {
    expect(calendar.dateOf(0)).toBe("2026-11-30");
    expect(calendar.dateOf(18)).toBe("2026-12-24");
    expect(calendar.dateOf(19)).toBe("2026-12-28");
    expect(calendar.dateOf(23)).toBe("2027-01-04");
    expect(calendar.dateOf(-1)).toBe("2026-11-27");
    expect(calendar.isWorkday("2026-12-25")).toBe(false);
  });

  it("maps non-working dates to the next working day", () => {
    expect(calendar.indexOnOrAfter("2026-12-25")).toBe(19);
    expect(calendar.indexOnOrAfter("2026-11-28")).toBe(0);
    expect(calendar.indexOnOrAfter("2026-11-27")).toBe(-1);
  });

  it("rejects invalid dates", () => {
    expect(() => calendar.indexOnOrAfter("2026-02-30")).toThrow(ScheduleError);
    expect(() => calendar.indexOnOrAfter("12/01/2026")).toThrow(ScheduleError);
  });
});

describe("computeSchedule", () => {
  const result = computeSchedule(PUMP_SCHEDULE);
  const activity = (name: string) => result.activities.get(id(name))!;

  it("reproduces the planned dates of the fixture", () => {
    expect(result.projectFinish).toBe("2027-01-11");
    expect(activity("fabrication")).toMatchObject({ earlyStart: "2026-12-11", earlyFinish: "2026-12-23" });
    expect(activity("delivery")).toMatchObject({ earlyStart: "2026-12-28", earlyFinish: "2026-12-28" });
    expect(activity("installation")).toMatchObject({ earlyStart: "2026-12-30", earlyFinish: "2027-01-04" });
    expect(activity("handover")).toMatchObject({ earlyStart: "2027-01-11", earlyFinish: "2027-01-11" });
  });

  it("applies start-no-earlier-than constraints", () => {
    expect(activity("site-prep")).toMatchObject({ earlyStart: "2026-12-07", earlyFinish: "2026-12-09" });
  });

  it("computes late dates, float and the critical path", () => {
    expect(activity("site-prep")).toMatchObject({
      lateStart: "2026-12-24",
      lateFinish: "2026-12-29",
      totalFloatWorkdays: 13,
      critical: false,
    });
    expect(activity("delivery")).toMatchObject({ totalFloatWorkdays: 0, critical: true });
    expect(result.criticalPath).toEqual(chain.map(([name]) => id(name)));
  });

  it("produces negative float when the deadline is earlier than the early finish", () => {
    const late = computeSchedule(PUMP_SCHEDULE, { deadline: "2027-01-08" });
    expect(late.activities.get(id("handover"))).toMatchObject({ lateStart: "2027-01-08", totalFloatWorkdays: -1 });
    expect(late.activities.get(id("design"))!.lateStart).toBe("2026-11-27");
    expect(late.criticalPath).toHaveLength(chain.length);
  });

  it("treats the longest path as critical when the deadline adds float", () => {
    const early = computeSchedule(PUMP_SCHEDULE, { deadline: "2027-01-15" });
    expect(early.activities.get(id("delivery"))!.totalFloatWorkdays).toBe(4);
    expect(early.criticalPath).toEqual(chain.map(([name]) => id(name)));
  });

  it("handles lags and zero-duration milestones", () => {
    const small = computeSchedule({
      startDate: "2026-11-30",
      calendar: CALENDAR,
      activities: [
        { id: id("a"), durationWorkdays: 2 },
        { id: id("m"), durationWorkdays: 0 },
        { id: id("b"), durationWorkdays: 1 },
      ],
      dependencies: [
        { predecessorId: id("a"), successorId: id("m") },
        { predecessorId: id("m"), successorId: id("b"), lagWorkdays: 2 },
      ],
    });
    expect(small.activities.get(id("m"))).toMatchObject({ earlyStart: "2026-12-02", earlyFinish: "2026-12-02" });
    expect(small.activities.get(id("b"))).toMatchObject({ earlyStart: "2026-12-04", earlyFinish: "2026-12-04" });
  });

  it("rejects malformed networks", () => {
    const base = { startDate: "2026-11-30", calendar: CALENDAR };
    const a = { id: id("a"), durationWorkdays: 1 };
    const b = { id: id("b"), durationWorkdays: 1 };
    expect(() =>
      computeSchedule({
        ...base,
        activities: [a, b],
        dependencies: [
          { predecessorId: id("a"), successorId: id("b") },
          { predecessorId: id("b"), successorId: id("a") },
        ],
      }),
    ).toThrow(/cycle/);
    expect(() => computeSchedule({ ...base, activities: [a, a], dependencies: [] })).toThrow(/Duplicate/);
    expect(() =>
      computeSchedule({ ...base, activities: [a], dependencies: [{ predecessorId: id("a"), successorId: id("x") }] }),
    ).toThrow(/unknown activity/);
    expect(() =>
      computeSchedule({ ...base, activities: [{ id: id("a"), durationWorkdays: 1.5 }], dependencies: [] }),
    ).toThrow(ScheduleError);
  });
});

describe("analyzeDelay", () => {
  it("absorbs a delay on an activity with float (scenario 1: no false critical)", () => {
    const analysis = analyzeDelay(PUMP_SCHEDULE, { activityId: id("site-prep"), forecastFinishDate: "2026-12-14" });
    expect(analysis).toMatchObject({
      impact: "FLOAT_ABSORBED",
      slipWorkdays: 3,
      floatConsumedWorkdays: 3,
      remainingFloatWorkdays: 10,
      criticalPathAffected: false,
      projectFinish: { baseline: "2027-01-11", projected: "2027-01-11", slipWorkdays: 0 },
    });
    expect(analysis.delayedActivities.map((s) => s.activityId)).toEqual([id("site-prep")]);
  });

  it("warns when the delay nearly exhausts float", () => {
    const analysis = analyzeDelay(PUMP_SCHEDULE, { activityId: id("site-prep"), forecastFinishDate: "2026-12-29" });
    expect(analysis).toMatchObject({
      impact: "WARNING",
      remainingFloatWorkdays: 0,
      latestAllowableFinish: "2026-12-29",
      criticalPathAffected: true,
    });
    expect(analysis.newlyCriticalActivityIds).toEqual([id("site-prep")]);
  });

  it("escalates when float runs out and the project finish slips", () => {
    const analysis = analyzeDelay(PUMP_SCHEDULE, { activityId: id("site-prep"), forecastFinishDate: "2026-12-30" });
    expect(analysis).toMatchObject({ impact: "CRITICAL", remainingFloatWorkdays: -1 });
    expect(analysis.projectFinish).toEqual({ baseline: "2027-01-11", projected: "2027-01-12", slipWorkdays: 1 });
  });

  it("reports every downstream activity for a late critical delivery", () => {
    const analysis = analyzeDelay(PUMP_SCHEDULE, { activityId: id("delivery"), forecastFinishDate: "2026-12-31" });
    expect(analysis).toMatchObject({
      impact: "CRITICAL",
      baselineFinish: "2026-12-28",
      projectedFinish: "2026-12-31",
      slipWorkdays: 3,
      floatConsumedWorkdays: 0,
      remainingFloatWorkdays: -3,
      criticalPathAffected: true,
    });
    expect(analysis.delayedActivities.map((s) => [s.activityId, s.projectedFinish, s.slipWorkdays])).toEqual([
      [id("delivery"), "2026-12-31", 3],
      [id("receiving"), "2027-01-04", 3],
      [id("installation"), "2027-01-07", 3],
      [id("piping"), "2027-01-11", 3],
      [id("commissioning"), "2027-01-13", 3],
      [id("handover"), "2027-01-14", 3],
    ]);
  });

  it("measures slip against the deadline rather than the early finish", () => {
    const analysis = analyzeDelay(
      PUMP_SCHEDULE,
      { activityId: id("delivery"), forecastFinishDate: "2026-12-31" },
      { deadline: "2027-01-15" },
    );
    expect(analysis).toMatchObject({
      impact: "WARNING",
      floatConsumedWorkdays: 3,
      remainingFloatWorkdays: 1,
      projectFinish: { projected: "2027-01-14", slipWorkdays: 3 },
    });
  });

  it("treats a weekend arrival as available the next working day", () => {
    const analysis = analyzeDelay(PUMP_SCHEDULE, { activityId: id("delivery"), forecastFinishDate: "2027-01-02" });
    expect(analysis.slipWorkdays).toBe(3);
    expect(analysis.projectFinish.projected).toBe("2027-01-14");
  });

  it("returns NONE when the forecast does not move the finish", () => {
    const analysis = analyzeDelay(PUMP_SCHEDULE, { activityId: id("delivery"), forecastFinishDate: "2026-12-24" });
    expect(analysis).toMatchObject({ impact: "NONE", slipWorkdays: 0, delayedActivities: [] });
  });

  it("rejects forecasts for unknown activities", () => {
    expect(() => analyzeDelay(PUMP_SCHEDULE, { activityId: id("nope"), forecastFinishDate: "2026-12-24" })).toThrow(
      ScheduleError,
    );
  });
});

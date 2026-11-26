// SYNTHETIC sandbox fixture — mirrors data/fixtures/project-schedule.json on
// branch phase-1/project-schedule-data (baseline revision 1). Not real project records.
import type { ActivityId } from "@pactline/domain";
import type { ScheduleNetwork } from "@pactline/schedule-engine";

export const ACT = {
  design: "act-pump-design",
  submittalReview: "act-pump-submittal-review",
  poRelease: "act-pump-po-release",
  fabrication: "act-pump-fabrication",
  factoryTest: "act-pump-factory-test",
  delivery: "act-pump-delivery",
  receivingInspection: "act-pump-receiving-inspection",
  sitePrep: "act-pump-site-prep",
  installation: "act-pump-installation",
  pipingConnections: "act-pump-piping-connections",
  commissioning: "act-pump-commissioning",
  handover: "act-pump-handover",
} as const satisfies Record<string, string>;

const a = (key: keyof typeof ACT) => ACT[key] as ActivityId;

const DURATIONS: Record<keyof typeof ACT, number> = {
  design: 4,
  submittalReview: 4,
  poRelease: 1,
  fabrication: 9,
  factoryTest: 1,
  delivery: 1,
  receivingInspection: 1,
  sitePrep: 3,
  installation: 3,
  pipingConnections: 2,
  commissioning: 2,
  handover: 1,
};

const LINKS: Array<[keyof typeof ACT, keyof typeof ACT]> = [
  ["design", "submittalReview"],
  ["submittalReview", "poRelease"],
  ["poRelease", "fabrication"],
  ["fabrication", "factoryTest"],
  ["factoryTest", "delivery"],
  ["delivery", "receivingInspection"],
  ["design", "sitePrep"],
  ["receivingInspection", "installation"],
  ["sitePrep", "installation"],
  ["installation", "pipingConnections"],
  ["pipingConnections", "commissioning"],
  ["commissioning", "handover"],
];

export const PUMP_SCHEDULE: ScheduleNetwork = {
  startDate: "2026-11-30",
  calendar: {
    workingWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
    holidays: ["2026-12-25", "2027-01-01"],
  },
  activities: (Object.keys(DURATIONS) as (keyof typeof ACT)[]).map((key) => ({
    id: a(key),
    durationWorkdays: DURATIONS[key],
  })),
  dependencies: LINKS.map(([pred, succ]) => ({ predecessorId: a(pred), successorId: a(succ) })),
  constraints: [{ type: "START_NO_EARLIER_THAN", activityId: a("sitePrep"), date: "2026-12-07" }],
};

export const activity = a;

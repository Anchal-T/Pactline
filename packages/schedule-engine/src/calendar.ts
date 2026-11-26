import { ScheduleError } from "./errors.js";

export const WEEKDAYS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface CalendarSpec {
  readonly workingWeekdays: readonly Weekday[];
  /** ISO dates (YYYY-MM-DD) that are non-working even on a working weekday. */
  readonly holidays: readonly string[];
}

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toEpochDay(date: string): number {
  const match = ISO_DATE.exec(date);
  const [year, month, day] = [Number(match?.[1]), Number(match?.[2]), Number(match?.[3])];
  const ms = Date.UTC(year, month - 1, day);
  const parsed = new Date(ms);
  if (
    !match ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ScheduleError(`Invalid ISO date "${date}"`);
  }
  return ms / MS_PER_DAY;
}

export function fromEpochDay(epochDay: number): string {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Maps calendar dates to a dense working-day index anchored at an origin date.
 * Index 0 is the first working day on or after the origin; negative indices
 * count working days before it. Lookups extend lazily in either direction.
 */
export class WorkCalendar {
  private readonly weekdays: ReadonlySet<number>;
  private readonly holidays: ReadonlySet<number>;
  private readonly origin: number;
  /** forward[i] = epoch day of working-day index i. Ascending. */
  private readonly forward: number[] = [];
  /** backward[k] = epoch day of working-day index -(k + 1). Descending. */
  private readonly backward: number[] = [];
  private nextForward: number;
  private nextBackward: number;

  constructor(spec: CalendarSpec, originDate: string) {
    if (spec.workingWeekdays.length === 0) {
      throw new ScheduleError("Calendar must have at least one working weekday");
    }
    this.weekdays = new Set(
      spec.workingWeekdays.map((weekday) => {
        const dow = WEEKDAYS.indexOf(weekday);
        if (dow < 0) throw new ScheduleError(`Unknown weekday "${weekday}"`);
        return dow;
      }),
    );
    this.holidays = new Set(spec.holidays.map(toEpochDay));
    this.origin = toEpochDay(originDate);
    this.nextForward = this.origin;
    this.nextBackward = this.origin - 1;
  }

  isWorkday(date: string): boolean {
    return this.isWorkEpochDay(toEpochDay(date));
  }

  /** Date of the working day at `index`. */
  dateOf(index: number): string {
    if (!Number.isInteger(index)) throw new ScheduleError(`Non-integer workday index ${index}`);
    if (index >= 0) {
      while (this.forward.length <= index) this.scanForward();
      return fromEpochDay(this.forward[index]!);
    }
    const k = -index - 1;
    while (this.backward.length <= k) this.scanBackward();
    return fromEpochDay(this.backward[k]!);
  }

  /** Index of the first working day on or after `date`. */
  indexOnOrAfter(date: string): number {
    const day = toEpochDay(date);
    if (day >= this.origin) {
      while (this.nextForward <= day) this.scanForward();
      return countBelow(this.forward, day);
    }
    while (this.nextBackward >= day) this.scanBackward();
    let count = 0;
    while (count < this.backward.length && this.backward[count]! >= day) count++;
    return count === 0 ? 0 : -count;
  }

  /**
   * Exclusive end index for work finishing on `date`: the count of working days
   * up to and including `date`, relative to the origin.
   */
  endIndexThrough(date: string): number {
    return this.indexOnOrAfter(fromEpochDay(toEpochDay(date) + 1));
  }

  private isWorkEpochDay(epochDay: number): boolean {
    const dow = new Date(epochDay * MS_PER_DAY).getUTCDay();
    return this.weekdays.has(dow) && !this.holidays.has(epochDay);
  }

  private scanForward(): void {
    const day = this.nextForward++;
    if (this.isWorkEpochDay(day)) this.forward.push(day);
  }

  private scanBackward(): void {
    const day = this.nextBackward--;
    if (this.isWorkEpochDay(day)) this.backward.push(day);
  }
}

/** Number of entries in ascending `values` strictly below `target`. */
function countBelow(values: readonly number[], target: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

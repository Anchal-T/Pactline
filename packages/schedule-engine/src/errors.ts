/** Raised for malformed schedule input: bad dates, unknown IDs, cycles, invalid durations. */
export class ScheduleError extends Error {
  override readonly name = "ScheduleError";
}

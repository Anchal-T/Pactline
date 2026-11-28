/** Time source for every tick. Real time in production, VirtualClock in tests and the eval harness. */
export interface Clock {
  now(): Date;
}

export class RealClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Moves only when told to, so timers, leases and expiries are deterministic. */
export class VirtualClock implements Clock {
  private ms: number;

  constructor(start: Date | string) {
    this.ms = new Date(start).getTime();
  }

  now(): Date {
    return new Date(this.ms);
  }

  advance(ms: number): Date {
    if (ms < 0) throw new Error("VirtualClock cannot move backwards");
    this.ms += ms;
    return this.now();
  }
}

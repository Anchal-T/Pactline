import type { DB } from "../client.js";
import { EngineeringRepo } from "./engineering-repo.js";
import { IncidentRepo } from "./incident-repo.js";
import { ProcurementRepo } from "./procurement-repo.js";
import { ScheduleRepo } from "./schedule-repo.js";

/**
 * Unified WorldStore facade over the four domain repositories.
 */
export class WorldStore {
  readonly schedule: ScheduleRepo;
  readonly procurement: ProcurementRepo;
  readonly engineering: EngineeringRepo;
  readonly incidents: IncidentRepo;

  constructor(
    readonly db: DB,
    clock: () => Date = () => new Date(),
  ) {
    this.schedule = new ScheduleRepo(db, clock);
    this.procurement = new ProcurementRepo(db, clock);
    this.engineering = new EngineeringRepo(db);
    this.incidents = new IncidentRepo(db, clock);
  }
}

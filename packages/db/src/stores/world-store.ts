import type { DB } from "../client.js";
import { desc, sql } from "drizzle-orm";
import { entityRecordHistory } from "../schema/runtime.js";
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

  async listRecordHistory(
    tableName: string,
    recordKey: Record<string, string>,
    limit = 100,
  ) {
    return this.db
      .select()
      .from(entityRecordHistory)
      .where(
        sql`${entityRecordHistory.tableName} = ${tableName}
          AND ${entityRecordHistory.recordKey} = ${JSON.stringify(recordKey)}::jsonb`,
      )
      .orderBy(desc(entityRecordHistory.version))
      .limit(Math.max(1, Math.min(limit, 500)));
  }
}

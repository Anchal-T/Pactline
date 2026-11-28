import { eq } from "drizzle-orm";
import type { SpecialistResult } from "@pactline/domain";
import type { ResultCache } from "@pactline/domain/server";
import type { DB } from "../client.js";
import { specialistResultCache } from "../schema/runtime.js";

/**
 * PostgreSQL-backed ResultCache implementing @pactline/domain/server's ResultCache.
 */
export class PostgresResultCache implements ResultCache {
  constructor(private readonly db: DB) {}

  async get(key: string): Promise<SpecialistResult | undefined> {
    const [row] = await this.db
      .select({ envelope: specialistResultCache.envelope })
      .from(specialistResultCache)
      .where(eq(specialistResultCache.idempotencyKey, key))
      .limit(1);

    return row
      ? structuredClone(row.envelope as unknown as SpecialistResult)
      : undefined;
  }

  async set(key: string, value: SpecialistResult): Promise<void> {
    await this.db
      .insert(specialistResultCache)
      .values({
        idempotencyKey: key,
        specialist: value.specialist,
        version: value.version,
        envelope: structuredClone(value) as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing({ target: specialistResultCache.idempotencyKey });
  }
}

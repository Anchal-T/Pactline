import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const { Pool } = pg;

export type DB = NodePgDatabase<typeof schema>;
export type PgPool = pg.Pool;

export function createPool(connectionString = process.env.DATABASE_URL): pg.Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create a Postgres pool");
  }
  return new Pool({ connectionString });
}

export function createDb(poolOrUrl?: pg.Pool | string): { db: DB; pool: pg.Pool } {
  const pool =
    typeof poolOrUrl === "string" || poolOrUrl === undefined
      ? createPool(poolOrUrl)
      : poolOrUrl;
  return { db: drizzle(pool, { schema }), pool };
}

let defaultPool: pg.Pool | undefined;
let defaultDb: DB | undefined;

export function getDb(): DB {
  if (!defaultDb) {
    defaultPool = createPool();
    defaultDb = drizzle(defaultPool, { schema });
  }
  return defaultDb;
}

export async function closeDefaultPool(): Promise<void> {
  if (defaultPool) {
    await defaultPool.end();
    defaultPool = undefined;
    defaultDb = undefined;
  }
}

export const db: DB = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

import { promises as dns, Resolver } from "node:dns";
import { isIP } from "node:net";
import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.js";

/*
 * Neon over node-postgres (TCP + TLS), not the HTTP driver: workers need interactive transactions
 * with SELECT … FOR UPDATE SKIP LOCKED, which the HTTP driver cannot hold open.
 *
 * DNS: some networks refuse to resolve *.neon.tech while the endpoint itself is reachable. The
 * client therefore resolves the host with the system resolver first and, if that fails, with the
 * public resolvers in PG_DNS_SERVERS (default 1.1.1.1, 8.8.8.8). It then connects to the address
 * and keeps the real hostname as the TLS server name, which Neon uses to route to the endpoint.
 */

export type DB = NodePgDatabase<typeof schema>;
export type PgPool = pg.Pool;

export interface DbHandle {
  db: DB;
  pool: pg.Pool;
  close(): Promise<void>;
}

export interface ConnectOptions {
  /** Defaults to DATABASE_URL. Use DATABASE_URL_UNPOOLED for migrations and session-level settings. */
  url?: string;
  /** Postgres schema to put first on the search_path (tests use a throwaway schema). Needs an unpooled URL. */
  searchPath?: string;
  max?: number;
}

const DEFAULT_DNS = ["1.1.1.1", "8.8.8.8"];

async function resolveHost(host: string): Promise<string> {
  if (isIP(host)) return host;
  try {
    return (await dns.lookup(host, { family: 4 })).address;
  } catch {
    const resolver = new Resolver();
    resolver.setServers((process.env.PG_DNS_SERVERS?.split(",").map((s) => s.trim()).filter(Boolean)) ?? DEFAULT_DNS);
    const addresses = await new Promise<string[]>((ok, fail) => resolver.resolve4(host, (err, a) => (err ? fail(err) : ok(a))));
    const first = addresses[0];
    if (!first) throw new Error(`No IPv4 address for ${host}`);
    return first;
  }
}

/** Pool config from a postgres:// URL, connecting by resolved address with SNI kept on the hostname. */
export async function poolConfig(options: ConnectOptions = {}): Promise<pg.PoolConfig> {
  const raw = options.url ?? process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const url = new URL(raw);
  const host = url.hostname;
  const sslmode = url.searchParams.get("sslmode");
  const ssl = sslmode === "disable" ? false : { servername: host, rejectUnauthorized: true };
  return {
    host: await resolveHost(host),
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl,
    max: options.max ?? 5,
    options: options.searchPath ? `-c search_path=${options.searchPath},public` : undefined,
  };
}

export async function connect(options: ConnectOptions = {}): Promise<DbHandle> {
  const pool = new pg.Pool(await poolConfig(options));
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

// ── Stores-layer helpers (simpler, no DNS) ──────────────────────────────────

export function createPool(connectionString = process.env.DATABASE_URL): pg.Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create a Postgres pool");
  }
  return new pg.Pool({ connectionString });
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

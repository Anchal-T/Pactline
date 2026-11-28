import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

/*
 * Applies migrations/NNNN_*.sql in order, inside one transaction per file, recording each in
 * <schema>.__pl_migrations. Written in-house rather than drizzle-kit migrate so that (a) it uses the
 * same DNS-tolerant connection as the app and (b) the same files can be applied to a throwaway
 * schema for tests: drizzle-kit hardcodes "public". in foreign keys, which is rewritten here.
 */

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`unsafe schema name: ${s}`);
  return `"${s}"`;
};

export async function migrate(pool: pg.Pool, schema = "public"): Promise<string[]> {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${ident(schema)}`);
    await client.query(`SET search_path TO ${ident(schema)}`);
    await client.query(`CREATE TABLE IF NOT EXISTS __pl_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    // Serialise concurrent migrators on this schema.
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [`pl_migrate:${schema}`]);
    const done = new Map((await client.query<{ name: string; sha256: string }>("SELECT name, sha256 FROM __pl_migrations")).rows.map((r) => [r.name, r.sha256]));

    for (const file of files) {
      const text = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      const sha = createHash("sha256").update(text).digest("hex");
      const prior = done.get(file);
      if (prior) {
        if (prior !== sha) throw new Error(`migration ${file} changed after it was applied`);
        continue;
      }
      const body = text.replaceAll('"public".', `${ident(schema)}.`);
      await client.query("BEGIN");
      try {
        for (const stmt of body.split("--> statement-breakpoint")) if (stmt.trim()) await client.query(stmt);
        await client.query("INSERT INTO __pl_migrations (name, sha256) VALUES ($1, $2)", [file, sha]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`pl_migrate:${schema}`]).catch(() => undefined);
    client.release();
  }
  return applied;
}

/** Alias for callers that use the drizzle-kit naming convention. */
export { migrate as applyMigrations };

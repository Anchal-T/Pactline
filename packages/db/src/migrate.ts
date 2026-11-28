import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.js";

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

export async function applyMigrations(
  connectionString = process.env.DATABASE_URL_UNPOOLED ??
    process.env.DATABASE_URL,
): Promise<void> {
  const { db, pool } = createDb(connectionString);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

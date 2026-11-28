// WorldStore – Neon Postgres via node-postgres + Drizzle ORM.
// Sole owner of canonical world state per AGENTS.md.
export {
  connect,
  poolConfig,
  createPool,
  createDb,
  getDb,
  closeDefaultPool,
  db,
  type ConnectOptions,
  type DB,
  type DbHandle,
  type PgPool,
} from "./client.js";
export { migrate, applyMigrations, MIGRATIONS_DIR } from "./migrate.js";
export { seed, toNetwork, transcriptionDocuments, type SeedSummary } from "./seed.js";
export * from "./schema/index.js";
export * from "./stores/index.js";

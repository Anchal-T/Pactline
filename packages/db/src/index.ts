// WorldStore — Neon Postgres + Drizzle ORM
// Sole owner of canonical world state per AGENTS.md
export {
  closeDefaultPool,
  createDb,
  createPool,
  db,
  getDb,
  type DB,
  type PgPool,
} from "./client.js";
export { applyMigrations } from "./migrate.js";
export * from "./schema/index.js";
export * from "./stores/index.js";

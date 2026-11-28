// WorldStore — Neon Postgres via node-postgres + Drizzle ORM.
// Sole owner of canonical world state per AGENTS.md.
export { connect, poolConfig, type ConnectOptions, type DB, type DbHandle } from "./client.js";
export { migrate, MIGRATIONS_DIR } from "./migrate.js";
export { seed, toNetwork, transcriptionDocuments, type SeedSummary } from "./seed.js";
export * from "./schema/index.js";

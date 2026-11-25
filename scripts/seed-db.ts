#!/usr/bin/env tsx
// Loads synthetic fixtures from data/fixtures/ into Neon Postgres
// Usage: pnpm db:seed
import { readFileSync } from "fs";
import { join } from "path";

const fixturesDir = join(process.cwd(), "data", "fixtures");

async function main() {
  console.log("Loading fixtures from", fixturesDir);
  // TODO: instantiate db client and upsert each fixture
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

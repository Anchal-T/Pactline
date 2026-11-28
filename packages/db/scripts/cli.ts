// pnpm --filter @pactline/db db:migrate | db:seed
// Reads DATABASE_URL_UNPOOLED (falls back to DATABASE_URL) from the repo-root .env.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect, migrate, seed } from "../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const envPath = join(root, ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);
const command = process.argv[2];
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const handle = await connect({ url, max: 1 });
try {
  if (command === "migrate" || command === "setup") {
    const applied = await migrate(handle.pool);
    console.log(applied.length ? `applied: ${applied.join(", ")}` : "migrations up to date");
  }
  if (command === "seed" || command === "setup") console.log("seeded:", await seed(handle.db, root));
  if (!["migrate", "seed", "setup"].includes(command ?? "")) throw new Error("usage: cli.ts migrate|seed|setup");
} finally {
  await handle.close();
}

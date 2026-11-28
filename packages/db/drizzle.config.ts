import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  // Used only by `drizzle-kit generate` (offline). Migrations are applied by scripts/cli.ts.
  dbCredentials: {
    url: (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)!,
  },
});

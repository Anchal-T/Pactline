#!/usr/bin/env tsx
// Injects the scripted demo event sequence into IncidentRuntime
// Usage: pnpm tsx scripts/run-demo.ts
// Simulates days passing in seconds for demo playback
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const eventsDir = join(process.cwd(), "data", "fixtures", "demo-events");

async function main() {
  const files = readdirSync(eventsDir).sort();
  console.log(`Injecting ${files.length} demo events...`);
  for (const file of files) {
    const event = JSON.parse(readFileSync(join(eventsDir, file), "utf8"));
    console.log(`→ ${event.type} (${file})`);
    // TODO: call IncidentRuntime.ingestEvent(event)
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log("Demo complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

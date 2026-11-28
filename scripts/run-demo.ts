#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EventNormalizer, type NormalizedEvent } from "../packages/domain/src/event-normalizer.js";
import { IncidentRuntime, MemoryEventStore, type StoreOutcome } from "../packages/incident-runtime/src/index.js";

interface DemoMetadata {
  expected_ingress: StoreOutcome;
  expected_behavior: string;
  expected_tainted_fields?: string[];
  requires_verified_recovery?: boolean;
}

interface ReplayCase {
  events: string[];
  seed?: string;
}

interface RecoverySeed {
  project_id: string;
  incident_id: string;
  po_line_id: string;
  product_config_id: string;
  offer_id: string;
  status: string;
  required_qty: number;
  accepted_qty: number;
  authorization_ref: string;
  confirmed_execution_ref: string;
}

const eventsDir = join(process.cwd(), "data", "fixtures", "demo-events");

function readJson<T>(file: string): T {
  try {
    return JSON.parse(readFileSync(join(eventsDir, file), "utf8")) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${file}: ${detail}`);
  }
}

function readRecoverySeed(file: string): RecoverySeed {
  const seed = readJson<RecoverySeed | null>(file);
  if (
    seed?.status !== "MITIGATED" ||
    seed.accepted_qty !== 0 ||
    !Number.isSafeInteger(seed.required_qty) ||
    seed.required_qty < 1 ||
    !seed.authorization_ref?.startsWith("sandbox://") ||
    !seed.confirmed_execution_ref?.startsWith("sandbox://")
  ) {
    throw new Error(`${file}: expected a sandbox recovery seed with confirmed execution and zero accepted units`);
  }
  return seed;
}

function matchesRecovery(event: NormalizedEvent, seed: RecoverySeed): boolean {
  if (
    event.project_id !== seed.project_id ||
    event.correlation_id !== seed.incident_id ||
    event.subject_type !== "POLine" ||
    event.subject_id !== seed.po_line_id
  ) {
    return false;
  }
  if (event.type === "VendorCommitmentChanged") return event.payload.offer_id === seed.offer_id;

  return event.payload.po_line_id === seed.po_line_id &&
    event.payload.product_config_id === seed.product_config_id &&
    (event.payload.required_qty === undefined || event.payload.required_qty === seed.required_qty);
}

async function replay(path: string, scenario: ReplayCase): Promise<void> {
  if (!Array.isArray(scenario.events) || scenario.events.length === 0) {
    throw new Error(`${path}: the replay manifest must list at least one event`);
  }
  const store = new MemoryEventStore();
  let now = new Date(0);
  const runtime = new IncidentRuntime({ now: () => now }, store);
  const seed = scenario.seed ? readRecoverySeed(scenario.seed) : undefined;
  console.log(`\n${path}`);
  if (seed) console.log(`  Seed: ${seed.incident_id} • ${seed.status} • ${seed.accepted_qty} accepted`);

  for (const file of scenario.events) {
    const rawEvent = readJson<{ fixture?: DemoMetadata } | null>(file);
    const metadata = rawEvent?.fixture;
    if (typeof metadata?.expected_behavior !== "string" || metadata.expected_behavior.trim() === "") {
      throw new Error(`${file}: expected a description of the intended behavior`);
    }
    const normalized = EventNormalizer.normalize(rawEvent);
    if (!normalized.success || !normalized.event) {
      throw new Error(`${file}: ${normalized.error ?? "event normalization failed"}`);
    }
    const event = normalized.event;
    const payloadError = EventNormalizer.validatePayload(event);
    if (payloadError) throw new Error(`${file}: ${payloadError}`);
    if (metadata.requires_verified_recovery && (!seed || !matchesRecovery(event, seed))) {
      throw new Error(`${file}: expected a verified recovery seed matching this incident, PO line and candidate`);
    }
    if (event.received_at < now || event.received_at < event.occurred_at) {
      throw new Error(`${file}: received_at is out of replay order`);
    }
    for (const field of metadata.expected_tainted_fields ?? []) {
      if (!event.tainted_fields.includes(field)) {
        throw new Error(`${file}: expected ${field} to be tainted`);
      }
    }

    now = event.received_at;
    const result = await runtime.ingestEvent(event);
    if (!result.success) throw new Error(`${file}: ${result.error ?? "ingestion failed"}`);

    const outcome: StoreOutcome = result.out_of_order ? "out_of_order" : result.duplicate ? "duplicate" : "stored";
    if (outcome !== metadata.expected_ingress) {
      throw new Error(`${file}: expected ${metadata.expected_ingress}, got ${outcome}`);
    }
    console.log(`  ${file} • ${event.type} • ${outcome}`);
  }

  console.log(`  ${store.events.length} event(s) stored`);
}

async function main(): Promise<void> {
  const paths = Object.entries(readJson<Record<string, ReplayCase>>("replay-manifest.json"));
  const requested = process.argv[2] ?? "recovery";
  const selected = requested === "all" ? paths : paths.filter(([path]) => path === requested);
  if (selected.length === 0) {
    throw new Error(`Unknown replay path "${requested}". Choose all, ${paths.map(([name]) => name).join(", ")}.`);
  }

  for (const [path, scenario] of selected) {
    await replay(path, scenario);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

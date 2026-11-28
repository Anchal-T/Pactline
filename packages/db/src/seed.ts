import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { configText, criterionText, curvePointText } from "@pactline/domain";
import type { DB } from "./client.js";
import * as t from "./schema/index.js";

/*
 * Loads data/fixtures + data/specs into the world store. Idempotent: re-running inserts nothing new
 * (ON CONFLICT DO NOTHING on business keys). Every record keeps the fixture's SANDBOX / AUTHENTIC label.
 *
 * Evidence sources: the original PDFs are cited by URL and locator but are not stored here. What is
 * stored is our transcription of them in pump-reference.json, as one document per source with one
 * block per transcribed record. Excerpts cite that transcription, so they can be checked verbatim,
 * and the SourceRef locator still names the original page.
 */

type Json = Record<string, unknown>;
const read = (root: string, rel: string) => JSON.parse(readFileSync(join(root, rel), "utf8")) as Json;
const sha = (s: string) => `sha256:${createHash("sha256").update(s).digest("hex")}`;
const toEngineDay = (d: string) => d;

export interface SeedSummary {
  project: string;
  scheduleRevision: string;
  poLines: number;
  productConfigurations: number;
  requirementSet: string;
  documents: number;
}

/** Schedule fixture → schedule-engine ScheduleNetwork (camelCase), plus activity metadata for lookups. */
export function toNetwork(s: Json) {
  const activities = s.activities as Array<{ id: string; name: string; type: string; duration_workdays: number }>;
  const deps = s.dependencies as Array<{ predecessor_id: string; successor_id: string; lag_workdays?: number }>;
  const cons = (s.constraints as Array<{ activity_id: string; type: string; date: string }> | undefined) ?? [];
  const cal = s.calendar as { working_weekdays: string[]; holidays: string[] };
  return {
    startDate: toEngineDay(s.start_date as string),
    calendar: { workingWeekdays: cal.working_weekdays, holidays: cal.holidays },
    activities: activities.map((a) => ({ id: a.id, durationWorkdays: a.duration_workdays, name: a.name, type: a.type })),
    dependencies: deps.map((d) => ({ predecessorId: d.predecessor_id, successorId: d.successor_id, lagWorkdays: d.lag_workdays ?? 0 })),
    constraints: cons.map((c) => ({ type: c.type, activityId: c.activity_id, date: c.date })),
  };
}

export async function seed(db: DB, root: string): Promise<SeedSummary> {
  const schedule = read(root, "data/fixtures/project-schedule.json");
  const procurement = read(root, "data/fixtures/equipment-packages.json");
  const reference = read(root, "data/specs/pump-reference.json");
  const projectId = schedule.project_id as string;

  return db.transaction(async (tx) => {
    await tx.insert(t.projects).values({ id: projectId, name: `${schedule.name as string} (SANDBOX)`, timezone: "Asia/Kolkata" }).onConflictDoNothing();

    const revId = `sched-rev-${String(schedule.revision).padStart(3, "0")}`;
    await tx
      .insert(t.scheduleRevisions)
      .values({ id: revId, project_id: projectId, revision: schedule.revision as number, kind: schedule.kind as "BASELINE", network: toNetwork(schedule) })
      .onConflictDoNothing();
    // The baseline is immutable, so the working schedule starts as a CURRENT copy of it.
    const currentId = `${revId}-current`;
    await tx
      .insert(t.scheduleRevisions)
      .values({ id: currentId, project_id: projectId, revision: (schedule.revision as number) + 1, kind: "CURRENT", network: toNetwork(schedule) })
      .onConflictDoNothing();

    const req = reference.requirements as Json;
    const packages = procurement.packages as Array<{ id: string; type: string; description: string; required_quantity: number; status: string }>;
    for (const p of packages) {
      await tx
        .insert(t.equipmentPackages)
        .values({ ...p, project_id: projectId, requirement_set_id: p.id === req.package_id ? (req.id as string) : null })
        .onConflictDoNothing();
    }
    for (const n of procurement.material_needs as Array<typeof t.materialNeeds.$inferInsert>) {
      await tx.insert(t.materialNeeds).values(n).onConflictDoNothing();
    }

    const lines = procurement.po_lines as Array<Json>;
    const needs = procurement.material_needs as Array<{ id: string; package_id: string }>;
    const allocs = procurement.fulfillment_allocations as Array<{ po_line_id: string; material_need_id: string }>;
    const packageOf = (lineId: string) => {
      const need = allocs.find((a) => a.po_line_id === lineId)?.material_need_id;
      const pkg = needs.find((n) => n.id === need)?.package_id;
      if (!pkg) throw new Error(`PO line ${lineId} has no allocation to a material need`);
      return pkg;
    };
    for (const l of lines) {
      await tx.insert(t.vendors).values({ id: l.supplier_id as string, name: `${l.supplier_name as string} (SANDBOX)`, contacts: [] }).onConflictDoNothing();
      await tx
        .insert(t.poLines)
        .values({
          id: l.id as string,
          po_id: l.po_id as string,
          project_id: projectId,
          package_id: packageOf(l.id as string),
          vendor_id: l.supplier_id as string,
          quantity: l.quantity as number,
          released_on: l.released_on as string,
          contractual_arrival_date: l.contractual_arrival_date as string,
          milestones: l.milestones,
        })
        .onConflictDoNothing();
    }
    for (const a of procurement.fulfillment_allocations as Array<{ id: string; po_line_id: string; material_need_id: string; quantity: number; status: string }>) {
      await tx.insert(t.fulfillmentAllocations).values({ id: a.id, po_line_id: a.po_line_id, material_need_id: a.material_need_id, quantity: a.quantity, active: a.status === "ACTIVE" }).onConflictDoNothing();
    }
    for (const c of procurement.vendor_commitments as Array<{ id: string; po_line_id: string; promised_arrival_date: string; observed_at: string; evidence_ref: string }>) {
      await tx
        .insert(t.vendorCommitments)
        .values({
          id: c.id,
          po_line_id: c.po_line_id,
          kind: "ACKNOWLEDGED",
          arrival_date: c.promised_arrival_date,
          status: "ACKNOWLEDGED",
          valid_from: new Date(c.observed_at),
          recorded_at: new Date(c.observed_at),
          source_ref: c.evidence_ref,
          taint: "verified",
        })
        .onConflictDoNothing();
    }

    // Requirement set: authored by people from the cited schedule, so it counts as approved.
    await tx
      .insert(t.requirementSets)
      .values({ id: req.id as string, revision: req.revision as number, package_id: req.package_id as string, body: req, approved_by: "fixture:data/specs/pump-reference.json", approved_at: new Date("2026-11-27T00:00:00Z") })
      .onConflictDoNothing();

    const configs = reference.product_configurations as Array<Json>;
    for (const c of configs) {
      await tx
        .insert(t.productConfigurations)
        .values({ id: c.id as string, revision: 1, manufacturer: c.manufacturer as string, model: `${c.family as string} ${c.model as string}`, body: c, trust: "AUTHENTIC" })
        .onConflictDoNothing();
    }

    const docs = transcriptionDocuments(reference);
    for (const d of docs) {
      await tx.insert(t.documents).values(d.document).onConflictDoNothing();
      for (const b of d.blocks) await tx.insert(t.documentBlocks).values(b).onConflictDoNothing();
    }

    return { project: projectId, scheduleRevision: currentId, poLines: lines.length, productConfigurations: configs.length, requirementSet: `${req.id as string}@${req.revision as number}`, documents: docs.length };
  });
}

/** One document per evidence source in pump-reference.json; one block per record that cites it. */
export function transcriptionDocuments(reference: Json) {
  const sources = reference.evidence_sources as Array<{ id: string; publisher: string; document: string; locator: string; url: string }>;
  const req = reference.requirements as { criteria: Array<Json & { id: string; source_refs: string[] }> };
  const configs = reference.product_configurations as Array<Json & { id: string; source_refs: string[]; curve?: { source_ref: string; points: Json[] } }>;

  return sources.map((s) => {
    const lines: string[] = [];
    for (const c of req.criteria) if (c.source_refs.includes(s.id)) lines.push(criterionText(c));
    for (const c of configs) {
      if (c.curve?.source_ref === s.id) for (const p of c.curve.points) lines.push(curvePointText(c.id, p));
      if (c.source_refs.includes(s.id)) lines.push(configText(c));
    }
    const docId = `doc-${s.id}`;
    const body = lines.join("\n");
    return {
      document: {
        id: docId,
        uri: s.url,
        title: s.document,
        publisher: s.publisher,
        kind: s.id.includes("curve") ? "curve" : s.id.includes("submittal") ? "submittal" : "spec_section",
        mime: "text/plain",
        content_hash: sha(body),
        trust_tier: "secondary",
        untrusted: false,
        retrieved_at: new Date("2026-11-27T00:00:00Z"),
        parser: "fixture-transcription",
      },
      blocks: lines.map((text, i) => ({ id: `${docId}#${i + 1}`, document_id: docId, seq: i + 1, kind: "table_row" as const, page: null, section: s.locator, bbox: null, text })),
    };
  });
}

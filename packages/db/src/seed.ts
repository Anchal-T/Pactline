import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import type { DB } from "./client.js";
import * as t from "./schema/index.js";

/*
 * Loads data/fixtures + data/specs into the world store. Idempotent: re-running inserts nothing new
 * (ON CONFLICT DO NOTHING on business keys, and skips baseline child inserts when revision already exists).
 */

type Json = Record<string, unknown>;
const read = (root: string, rel: string) => JSON.parse(readFileSync(join(root, rel), "utf8")) as Json;
const sha = (s: string) => `sha256:${createHash("sha256").update(s).digest("hex")}`;

export interface SeedSummary {
  project: string;
  scheduleRevision: string;
  poLines: number;
  productConfigurations: number;
  requirementSet: string;
  documents: number;
}

/** Schedule fixture → schedule-engine ScheduleNetwork (camelCase). */
export function toNetwork(s: Json) {
  const activities = s.activities as Array<{ id: string; name: string; type: string; duration_workdays: number }>;
  const deps = s.dependencies as Array<{ predecessor_id: string; successor_id: string; lag_workdays?: number }>;
  const cons = (s.constraints as Array<{ activity_id: string; type: string; date: string }> | undefined) ?? [];
  const cal = s.calendar as { working_weekdays: string[]; holidays: string[] };
  return {
    startDate: s.start_date as string,
    calendar: { workingWeekdays: cal.working_weekdays, holidays: cal.holidays },
    activities: activities.map((a) => ({ id: a.id, durationWorkdays: a.duration_workdays, name: a.name, type: a.type })),
    dependencies: deps.map((d) => ({ predecessorId: d.predecessor_id, successorId: d.successor_id, lagWorkdays: d.lag_workdays ?? 0 })),
    constraints: cons.map((c) => ({ type: c.type, activityId: c.activity_id, date: c.date })),
  };
}

/** One evidence source per evidence entry in pump-reference.json */
export function transcriptionDocuments(reference: Json): Array<{ document: typeof t.evidenceSources.$inferInsert }> {
  const sources = reference.evidence_sources as Array<{ id: string; publisher: string; document: string; locator: string; url: string }>;
  return sources.map((s) => ({
    document: {
      id: `doc-${s.id}`,
      uri: s.url,
      title: s.document,
      publisher: s.publisher,
      documentName: s.document,
      kind: s.id.includes("curve") ? "curve" : s.id.includes("submittal") ? "submittal" : "spec_section",
      contentHash: sha(s.locator),
      trustTier: "secondary",
      retrievedAt: new Date("2026-11-27T00:00:00Z"),
      metadata: { locator: s.locator },
    },
  }));
}

export async function seed(db: DB, root: string): Promise<SeedSummary> {
  const schedule = read(root, "data/fixtures/project-schedule.json");
  const procurement = read(root, "data/fixtures/equipment-packages.json");
  const reference = read(root, "data/specs/pump-reference.json");
  const projectId = schedule.project_id as string;
  const cal = schedule.calendar as { working_weekdays: string[]; holidays: string[] };
  const rawConstraints = (schedule.constraints as Array<{ activity_id: string; type: string; date: string }> | undefined) ?? [];
  const constraints = rawConstraints.map((c) => ({
    activityId: c.activity_id,
    type: c.type,
    date: c.date,
  }));
  const activities = schedule.activities as Array<{
    id: string;
    name: string;
    type: string;
    duration_workdays: number;
    planned_start_date?: string;
    planned_finish_date?: string;
  }>;
  const dependencies = (schedule.dependencies as Array<{
    predecessor_id: string;
    successor_id: string;
    type?: string;
    lag_workdays?: number;
  }> | undefined) ?? [];

  return db.transaction(async (tx) => {
    // Project
    await tx.insert(t.projects).values({ id: projectId, name: `${schedule.name as string} (SANDBOX)`, timezone: "Asia/Kolkata" }).onConflictDoNothing();

    // Helper to insert activities + dependencies only when a revision was newly created
    // (avoids triggering baseline immutability / child insert guard on repeated seeds).
    const insertRevisionChildren = async (revisionId: string) => {
      for (const a of activities) {
        await tx.insert(t.activities).values({
          scheduleRevisionId: revisionId,
          activityId: a.id,
          name: a.name,
          type: a.type ?? "TASK",
          durationWorkdays: a.duration_workdays,
          plannedStart: a.planned_start_date ?? null,
          plannedFinish: a.planned_finish_date ?? null,
        }).onConflictDoNothing();
      }
      for (const d of dependencies) {
        await tx.insert(t.dependencies).values({
          scheduleRevisionId: revisionId,
          predecessorId: d.predecessor_id,
          successorId: d.successor_id,
          type: d.type ?? "FS",
          lagWorkdays: d.lag_workdays ?? 0,
        }).onConflictDoNothing();
      }
    };

    // Baseline revision
    const revId = `sched-rev-${String(schedule.revision).padStart(3, "0")}`;
    const insertedBaseline = await tx
      .insert(t.scheduleRevisions)
      .values({
        id: revId,
        projectId: projectId,
        revision: schedule.revision as number,
        kind: schedule.kind as "BASELINE",
        startDate: schedule.start_date as string,
        calendar: { workingWeekdays: cal.working_weekdays, holidays: cal.holidays } as Record<string, unknown>,
        constraints,
      })
      .onConflictDoNothing()
      .returning({ id: t.scheduleRevisions.id });

    if (insertedBaseline.length > 0) {
      await insertRevisionChildren(revId);
    }

    // Current working revision (starts as a mutable copy of the baseline)
    const currentId = `${revId}-current`;
    const insertedCurrent = await tx
      .insert(t.scheduleRevisions)
      .values({
        id: currentId,
        projectId: projectId,
        revision: (schedule.revision as number) + 1,
        kind: "CURRENT",
        startDate: schedule.start_date as string,
        calendar: { workingWeekdays: cal.working_weekdays, holidays: cal.holidays } as Record<string, unknown>,
        constraints,
      })
      .onConflictDoNothing()
      .returning({ id: t.scheduleRevisions.id });

    if (insertedCurrent.length > 0) {
      await insertRevisionChildren(currentId);
    }

    // Equipment packages
    const req = reference.requirements as Json & {
      id: string;
      revision: number;
      package_id: string;
      duty_point?: Record<string, unknown>;
      scope_note?: string;
      reference_project?: { source_refs?: string[] };
      criteria?: Array<{
        id: string;
        predicate: Record<string, unknown>;
        mandatory: boolean;
        evidence_needed?: string;
        source_refs?: string[];
      }>;
    };
    const packages = procurement.packages as Array<{ id: string; type: string; description: string; required_quantity: number; status: string }>;
    for (const p of packages) {
      await tx
        .insert(t.equipmentPackages)
        .values({
          id: p.id,
          projectId: projectId,
          type: p.type,
          description: p.description,
          requiredQuantity: String(p.required_quantity),
          activeRequirementSetId: p.id === req.package_id ? req.id : null,
          status: p.status,
        })
        .onConflictDoNothing();
    }

    // Material needs
    for (const n of procurement.material_needs as Array<{ id: string; package_id: string; activity_id: string; required_quantity: number; required_usable_date: string; readiness_buffer_days?: number }>) {
      await tx.insert(t.materialNeeds).values({
        id: n.id,
        projectId: projectId,
        packageId: n.package_id,
        activityId: n.activity_id,
        requiredQuantity: String(n.required_quantity),
        requiredUsableDate: n.required_usable_date,
        readinessBufferDays: n.readiness_buffer_days ?? 0,
      }).onConflictDoNothing();
    }

    // PO lines and vendors
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
      await tx.insert(t.vendors).values({ id: l.supplier_id as string, name: `${l.supplier_name as string} (SANDBOX)` }).onConflictDoNothing();
      await tx
        .insert(t.purchaseOrders)
        .values({ id: l.po_id as string, projectId: projectId, vendorId: l.supplier_id as string, status: "ACTIVE", releasedOn: l.released_on as string | undefined })
        .onConflictDoNothing();
      await tx
        .insert(t.poLines)
        .values({
          id: l.id as string,
          poId: l.po_id as string,
          packageId: packageOf(l.id as string),
          quantity: String(l.quantity as number),
          contractualArrivalDate: l.contractual_arrival_date as string,
          status: "ACTIVE",
        })
        .onConflictDoNothing();
    }

    // Fulfillment allocations
    for (const a of procurement.fulfillment_allocations as Array<{ id: string; po_line_id: string; material_need_id: string; quantity: number; status?: string }>) {
      await tx.insert(t.fulfillmentAllocations).values({
        id: a.id,
        poLineId: a.po_line_id,
        materialNeedId: a.material_need_id,
        quantity: String(a.quantity),
        status: a.status ?? "ACTIVE",
      }).onConflictDoNothing();
    }

    // Vendor commitments (append-only: deduplicate by poLineId + sourceEventId)
    for (const c of procurement.vendor_commitments as Array<{ id: string; po_line_id: string; promised_arrival_date: string; observed_at: string; source?: string; evidence_ref: string }>) {
      const existing = await tx
        .select({ id: t.vendorCommitments.id })
        .from(t.vendorCommitments)
        .where(
          and(
            eq(t.vendorCommitments.poLineId, c.po_line_id),
            eq(t.vendorCommitments.sourceEventId, c.id),
          ),
        )
        .limit(1);
      if (existing.length === 0) {
        await tx
          .insert(t.vendorCommitments)
          .values({
            poLineId: c.po_line_id,
            commitmentKind: "ACKNOWLEDGMENT",
            promisedArrivalDate: c.promised_arrival_date,
            observedAt: new Date(c.observed_at),
            source: c.source ?? "fixture",
            sourceEventId: c.id,
            evidenceRef: c.evidence_ref,
            taintStatus: "verified",
          });
      }
    }

    // Evidence sources (replaces documents/documentBlocks)
    const docs = transcriptionDocuments(reference);
    for (const d of docs) {
      await tx.insert(t.evidenceSources).values(d.document).onConflictDoNothing();
    }

    // Requirement set & its criteria (P1 #4: load criteria & dutyPoint before marking APPROVED)
    await tx
      .insert(t.requirementSets)
      .values({
        id: req.id,
        revision: req.revision,
        packageId: req.package_id,
        dutyPoint: req.duty_point ?? null,
        scopeNote: req.scope_note ?? null,
        sourceRefs: req.reference_project?.source_refs ?? [],
        status: "APPROVED",
        approvedBy: "fixture:data/specs/pump-reference.json",
        approvedAt: new Date("2026-11-27T00:00:00Z"),
      })
      .onConflictDoNothing();

    for (const c of req.criteria ?? []) {
      await tx
        .insert(t.requirements)
        .values({
          id: c.id,
          requirementSetId: req.id,
          code: c.id,
          kind: String(c.predicate.field ?? c.id),
          predicate: c.predicate,
          mandatory: c.mandatory,
          evidenceNeeded: c.evidence_needed ?? null,
          sourceRefs: c.source_refs ?? [],
        })
        .onConflictDoNothing();
    }

    // Product configurations
    const configs = reference.product_configurations as Array<Json>;
    for (const c of configs) {
      await tx
        .insert(t.productConfigurations)
        .values({
          id: c.id as string,
          manufacturer: c.manufacturer as string,
          family: c.family as string | undefined,
          model: `${c.family as string} ${c.model as string}`,
          equipmentType: "CENTRIFUGAL_PUMP",
          specs: c as Record<string, unknown>,
          sourceRefs: (c.source_refs as unknown[]) ?? [],
          trustTier: "AUTHENTIC",
        })
        .onConflictDoNothing();
    }

    return {
      project: projectId,
      scheduleRevision: currentId,
      poLines: lines.length,
      productConfigurations: configs.length,
      requirementSet: `${req.id}@${req.revision}`,
      documents: docs.length,
    };
  });
}

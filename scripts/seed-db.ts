#!/usr/bin/env tsx
// Idempotent fixture loader for Neon Postgres (data/fixtures/ & data/specs/)
// Usage: pnpm db:seed
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  asId,
  type ActivityId,
  type AllocationId,
  type EvidenceSourceId,
  type MaterialNeedId,
  type MilestoneId,
  type PackageId,
  type POLineId,
  type ProductConfigId,
  type ProjectId,
  type PurchaseOrderId,
  type RequirementId,
  type RequirementSetId,
  type ScheduleRevisionId,
  type VendorId,
} from "../packages/domain/src/ids.js";
import { createDb, WorldStore } from "../packages/db/src/index.js";

interface ScheduleFixture {
  project_id: string;
  name: string;
  revision: number;
  kind: "BASELINE" | "CURRENT" | "SCENARIO";
  start_date: string;
  calendar: Record<string, unknown>;
  constraints: unknown[];
  activities: Array<{
    id: string;
    name: string;
    type: string;
    duration_workdays: number;
    planned_start_date?: string;
    planned_finish_date?: string;
  }>;
  dependencies: Array<{
    predecessor_id: string;
    successor_id: string;
    type: "FS" | "SS" | "FF" | "SF";
    lag_workdays?: number;
  }>;
}

interface PackagesFixture {
  project_id: string;
  packages: Array<{
    id: string;
    type: string;
    description: string;
    required_quantity: number;
    status: string;
  }>;
  material_needs: Array<{
    id: string;
    package_id: string;
    activity_id: string;
    required_quantity: number;
    required_usable_date: string;
    readiness_buffer_days: number;
  }>;
  po_lines: Array<{
    id: string;
    po_id: string;
    supplier_id: string;
    supplier_name: string;
    quantity: number;
    released_on: string;
    contractual_arrival_date: string;
    milestones: Array<{ type: string; planned_date: string }>;
  }>;
  fulfillment_allocations: Array<{
    id: string;
    po_line_id: string;
    material_need_id: string;
    quantity: number;
    status: "ACTIVE" | "RELEASED" | "CANCELLED";
  }>;
  vendor_commitments: Array<{
    id: string;
    po_line_id: string;
    promised_arrival_date: string;
    observed_at: string;
    source: string;
    evidence_ref: string;
  }>;
}

interface PumpReferenceSpec {
  requirements: {
    id: string;
    revision: number;
    package_id: string;
    duty_point: Record<string, unknown>;
    scope_note: string;
    reference_project: { source_refs: string[] };
    criteria: Array<{
      id: string;
      predicate: Record<string, unknown>;
      mandatory: boolean;
      evidence_needed?: string;
      source_refs: string[];
    }>;
  };
  product_configurations: Array<{
    id: string;
    manufacturer: string;
    family?: string;
    model: string;
    source_refs: string[];
    [key: string]: unknown;
  }>;
  evidence_sources: Array<{
    id: string;
    publisher?: string;
    document?: string;
    revision?: string;
    locator?: string;
    url?: string;
  }>;
}

export async function seedDatabase(databaseUrl?: string) {
  if (!databaseUrl && !process.env.DATABASE_URL) {
    try {
      process.loadEnvFile();
    } catch {
      // Ignore if .env is absent
    }
  }
  const { db, pool } = createDb(databaseUrl ?? process.env.DATABASE_URL);
  const store = new WorldStore(db);

  try {
    const rootDir = existsSync(join(process.cwd(), "data", "fixtures"))
      ? process.cwd()
      : join(process.cwd(), "..", "..");
    const scheduleData = JSON.parse(
      readFileSync(
        join(rootDir, "data", "fixtures", "project-schedule.json"),
        "utf8",
      ),
    ) as ScheduleFixture;
    const packagesData = JSON.parse(
      readFileSync(
        join(rootDir, "data", "fixtures", "equipment-packages.json"),
        "utf8",
      ),
    ) as PackagesFixture;
    const pumpSpec = JSON.parse(
      readFileSync(
        join(rootDir, "data", "specs", "pump-reference.json"),
        "utf8",
      ),
    ) as PumpReferenceSpec;

    // 1. Project & Baseline Schedule
    const projectId = asId<ProjectId>(scheduleData.project_id);

    await store.schedule.upsertProject({
      id: projectId,
      name: scheduleData.name,
      timezone: "Pacific/Honolulu",
    });

    await store.schedule.createScheduleRevision({
      id: asId<ScheduleRevisionId>(`sched-${scheduleData.project_id}-rev${scheduleData.revision}`),
      projectId,
      revision: scheduleData.revision,
      kind: scheduleData.kind,
      startDate: scheduleData.start_date,
      calendar: scheduleData.calendar,
      constraints: scheduleData.constraints,
      activities: scheduleData.activities.map((a) => ({
        activityId: asId<ActivityId>(a.id),
        name: a.name,
        type: a.type,
        durationWorkdays: a.duration_workdays,
        plannedStart: a.planned_start_date ?? null,
        plannedFinish: a.planned_finish_date ?? null,
      })),
      dependencies: scheduleData.dependencies.map((d) => ({
        predecessorId: asId<ActivityId>(d.predecessor_id),
        successorId: asId<ActivityId>(d.successor_id),
        type: d.type,
        lagWorkdays: d.lag_workdays ?? 0,
      })),
    });

    // 2. Packages & Material Needs
    const needPackageMap = new Map<string, string>();
    for (const pkg of packagesData.packages) {
      await store.procurement.upsertEquipmentPackage({
        id: asId<PackageId>(pkg.id),
        projectId,
        type: pkg.type,
        description: pkg.description,
        requiredQuantity: pkg.required_quantity,
        activeRequirementSetId:
          pkg.id === pumpSpec.requirements.package_id
            ? asId<RequirementSetId>(pumpSpec.requirements.id)
            : null,
        status: pkg.status,
      });
    }

    for (const need of packagesData.material_needs) {
      needPackageMap.set(need.id, need.package_id);
      await store.procurement.upsertMaterialNeed({
        id: asId<MaterialNeedId>(need.id),
        projectId,
        packageId: asId<PackageId>(need.package_id),
        activityId: asId<ActivityId>(need.activity_id),
        requiredQuantity: need.required_quantity,
        requiredUsableDate: need.required_usable_date,
        readinessBufferDays: need.readiness_buffer_days,
      });
    }

    // Map PO line -> package_id via fulfillment_allocations -> material_needs
    const poLinePackageMap = new Map<string, string>();
    for (const alloc of packagesData.fulfillment_allocations) {
      const pkgId = needPackageMap.get(alloc.material_need_id);
      if (pkgId) poLinePackageMap.set(alloc.po_line_id, pkgId);
    }

    // 3. Vendors, POs, PO Lines, Milestones
    for (const line of packagesData.po_lines) {
      await store.procurement.upsertVendor({
        id: asId<VendorId>(line.supplier_id),
        name: line.supplier_name,
        isSandbox: true,
      });
      await store.procurement.upsertPurchaseOrder({
        id: asId<PurchaseOrderId>(line.po_id),
        projectId,
        vendorId: asId<VendorId>(line.supplier_id),
        status: "RELEASED",
        currency: "USD",
        releasedOn: line.released_on,
      });
      const pkgId = poLinePackageMap.get(line.id);
      if (!pkgId) {
        throw new Error(`Could not resolve package_id for PO line ${line.id}`);
      }
      await store.procurement.upsertPoLine({
        id: asId<POLineId>(line.id),
        poId: asId<PurchaseOrderId>(line.po_id),
        packageId: asId<PackageId>(pkgId),
        quantity: line.quantity,
        contractualArrivalDate: line.contractual_arrival_date,
        currentForecastArrivalDate: line.contractual_arrival_date,
        status: "OPEN",
      });

      for (const ms of line.milestones) {
        await store.procurement.upsertMilestone({
          id: asId<MilestoneId>(`ms-${line.id}-${ms.type.toLowerCase()}`),
          poLineId: asId<POLineId>(line.id),
          type: ms.type,
          plannedDate: ms.planned_date,
          status: "PLANNED",
        });
      }

      await store.incidents.upsertSubjectRevisions({
        subjectId: asId<POLineId>(line.id),
        subjectType: "POLine",
        pins: {
          schedule_rev: String(scheduleData.revision),
          ...(pkgId === pumpSpec.requirements.package_id
            ? { requirement_rev: String(pumpSpec.requirements.revision) }
            : {}),
        },
      });
    }

    // 4. Fulfillment Allocations (idempotent)
    for (const alloc of packagesData.fulfillment_allocations) {
      if (!(await store.procurement.hasFulfillmentAllocation(asId<AllocationId>(alloc.id)))) {
        await store.procurement.allocateFulfillment({
          id: asId<AllocationId>(alloc.id),
          poLineId: asId<POLineId>(alloc.po_line_id),
          materialNeedId: asId<MaterialNeedId>(alloc.material_need_id),
          quantity: alloc.quantity,
        });
      }
    }

    // 5. Vendor Commitments (append-only, idempotent by sourceEventId)
    for (const commit of packagesData.vendor_commitments) {
      if (
        !(await store.procurement.hasVendorCommitmentBySourceEvent(
          asId<POLineId>(commit.po_line_id),
          commit.id,
        ))
      ) {
        await store.procurement.recordVendorCommitment({
          poLineId: asId<POLineId>(commit.po_line_id),
          commitmentKind: "ACKNOWLEDGMENT",
          promisedArrivalDate: commit.promised_arrival_date,
          observedAt: new Date(commit.observed_at),
          source: commit.source,
          sourceEventId: commit.id,
          evidenceRef: commit.evidence_ref,
          taintStatus: "verified",
        });
      }
    }

    // 6. Evidence Sources, Requirement Set, Requirements, Product Configurations
    for (const src of pumpSpec.evidence_sources) {
      await store.engineering.upsertEvidenceSource({
        id: asId<EvidenceSourceId>(src.id),
        kind: src.id.includes("curve")
          ? "curve"
          : src.id.includes("submittal")
            ? "submittal"
            : "spec_section",
        publisher: src.publisher ?? null,
        title: src.document ?? src.id,
        documentName: src.document ?? null,
        revision: src.revision ?? null,
        locator: src.locator ? { section: src.locator } : null,
        uri: src.url ?? null,
        trustTier: "primary",
      });
    }

    await store.engineering.upsertRequirementSet({
      id: asId<RequirementSetId>(pumpSpec.requirements.id),
      packageId: asId<PackageId>(pumpSpec.requirements.package_id),
      revision: pumpSpec.requirements.revision,
      dutyPoint: pumpSpec.requirements.duty_point,
      scopeNote: pumpSpec.requirements.scope_note,
      status: "APPROVED",
      sourceRefs: pumpSpec.requirements.reference_project.source_refs,
    });

    for (const c of pumpSpec.requirements.criteria) {
      await store.engineering.upsertRequirement({
        id: asId<RequirementId>(c.id),
        requirementSetId: asId<RequirementSetId>(pumpSpec.requirements.id),
        code: c.id,
        kind: String(c.predicate.field ?? c.id),
        predicate: c.predicate,
        mandatory: c.mandatory,
        evidenceNeeded: c.evidence_needed ?? null,
        sourceRefs: c.source_refs,
      });
    }

    for (const cfg of pumpSpec.product_configurations) {
      await store.engineering.upsertProductConfiguration({
        id: asId<ProductConfigId>(cfg.id),
        manufacturer: cfg.manufacturer,
        family: cfg.family ?? null,
        model: cfg.model,
        revision: 1,
        equipmentType: "CENTRIFUGAL_PUMP",
        specs: cfg,
        sourceRefs: cfg.source_refs,
        trustTier: "primary",
      });
    }

    await store.incidents.upsertSubjectRevisions({
      subjectId: asId<PackageId>(pumpSpec.requirements.package_id),
      subjectType: "EquipmentPackage",
      pins: {
        requirement_rev: String(pumpSpec.requirements.revision),
        schedule_rev: String(scheduleData.revision),
      },
    });
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("seed-db.ts")) {
  seedDatabase()
    .then(() => {
      console.log("Seed complete.");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

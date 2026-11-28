import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import pg from "pg";
import { createIdempotentRunner, idempotencyKey } from "@pactline/domain/server";
import {
  asId,
  type AcceptanceId,
  type ActivityId,
  type AllocationId,
  type ApprovalId,
  type EvidenceSourceId,
  type IncidentId,
  type InspectionId,
  type MaterialNeedId,
  type OfferId,
  type PackageId,
  type POLineId,
  type ProductConfigId,
  type ProjectId,
  type PurchaseOrderId,
  type ReceiptId,
  type RequirementId,
  type RequirementSetId,
  type ScheduleRevisionId,
  type VendorId,
  type NormalizedEvent,
  type SpecialistResult,
} from "@pactline/domain";
import {
  applyMigrations,
  createDb,
  PostgresEventStore,
  PostgresGatewayStore,
  PostgresResultCache,
  WorldStore,
  type DB,
  type PgPool,
} from "../index.js";
import { AllocationExceededError } from "../stores/procurement-repo.js";
import { seedDatabase } from "../../../../scripts/seed-db.js";

const TEST_URL = process.env.TEST_DATABASE_URL;

const describeIfDb = TEST_URL ? describe : describe.skip;

function databaseTarget(connectionString: string) {
  const { host, database, port } = new pg.Client({ connectionString });
  const hostname = host.startsWith("/")
    ? host
    : host.toLowerCase().replace(/-pooler(?=\.)/, "").replace(/\.$/, "");
  return JSON.stringify([hostname, port, database]);
}

const ids = {
  project: asId<ProjectId>("proj-1"),
  vendor: asId<VendorId>("v-1"),
  pkg: asId<PackageId>("pkg-1"),
  need1: asId<MaterialNeedId>("need-1"),
  need2: asId<MaterialNeedId>("need-2"),
  act1: asId<ActivityId>("act-1"),
  act2: asId<ActivityId>("act-2"),
  po: asId<PurchaseOrderId>("po-1"),
  pol: asId<POLineId>("pol-1"),
  allocA: asId<AllocationId>("alloc-a"),
  allocB: asId<AllocationId>("alloc-b"),
  reqset: asId<RequirementSetId>("reqset-1"),
  req: asId<RequirementId>("req-1"),
  cfg: asId<ProductConfigId>("cfg-1"),
  offer1: asId<OfferId>("offer-bad-1"),
  offer2: asId<OfferId>("offer-bad-2"),
  inc1: asId<IncidentId>("inc-1"),
  inc2: asId<IncidentId>("inc-2"),
  appr: asId<ApprovalId>("appr-1"),
  rcpt: asId<ReceiptId>("rcpt-1"),
  insp: asId<InspectionId>("insp-1"),
  acc1: asId<AcceptanceId>("acc-1"),
  acc2: asId<AcceptanceId>("acc-2"),
  sched: asId<ScheduleRevisionId>("sched-base"),
  demoProject: asId<ProjectId>("proj-hvac-demo-001"),
  demoPkg: asId<PackageId>("pkg-pump-chw-001"),
};

describeIfDb("WorldStore & Postgres Store Adapters Integration", () => {
  let db: DB;
  let pool: PgPool;
  let world: WorldStore;

  beforeAll(async () => {
    const testTarget = databaseTarget(TEST_URL!);
    for (const appUrl of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED]) {
      if (appUrl && databaseTarget(appUrl) === testTarget) {
        throw new Error("TEST_DATABASE_URL must target a dedicated test database");
      }
    }
    await applyMigrations(TEST_URL!);
    const conn = createDb(TEST_URL!);
    db = conn.db;
    pool = conn.pool;
    world = new WorldStore(db);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  async function resetTables() {
    await db.execute(sql`
      TRUNCATE TABLE
        specialist_result_cache,
        specialist_tasks,
        action_receipts,
        event_series_versions,
        domain_events,
        incident_audit_events,
        approvals,
        recovery_actions,
        recovery_plans,
        incidents,
        subject_revisions,
        supplier_offers,
        compliance_findings,
        product_configurations,
        requirements,
        requirement_sets,
        evidence_sources,
        acceptances,
        inspections,
        receipts,
        milestones,
        vendor_commitments,
        fulfillment_allocations,
        po_lines,
        purchase_orders,
        material_needs,
        equipment_packages,
        vendors,
        dependencies,
        activities,
        schedule_revisions,
        projects
    `);
  }

  beforeEach(async () => {
    await resetTables();
  }, 30_000);

  async function seedMinimalProcurement() {
    await world.schedule.upsertProject({ id: ids.project, name: "Test Project" });
    await world.procurement.upsertVendor({ id: ids.vendor, name: "Vendor 1" });
    await world.procurement.upsertEquipmentPackage({
      id: ids.pkg,
      projectId: ids.project,
      type: "CENTRIFUGAL_PUMP",
      description: "Pump",
      requiredQuantity: 2,
      status: "ACTIVE",
    });
    await world.procurement.upsertMaterialNeed({
      id: ids.need1,
      projectId: ids.project,
      packageId: ids.pkg,
      activityId: ids.act1,
      requiredQuantity: 2,
      requiredUsableDate: "2026-12-30",
      readinessBufferDays: 2,
    });
    await world.procurement.upsertMaterialNeed({
      id: ids.need2,
      projectId: ids.project,
      packageId: ids.pkg,
      activityId: ids.act2,
      requiredQuantity: 2,
      requiredUsableDate: "2026-12-31",
      readinessBufferDays: 2,
    });
    await world.procurement.upsertPurchaseOrder({
      id: ids.po,
      projectId: ids.project,
      vendorId: ids.vendor,
      status: "RELEASED",
    });
    await world.procurement.upsertPoLine({
      id: ids.pol,
      poId: ids.po,
      packageId: ids.pkg,
      quantity: 2,
      contractualArrivalDate: "2026-12-28",
      status: "OPEN",
    });
  }

  it("Invariant 1 & Scenario 11: concurrent PO-line allocations cannot exceed po_line.quantity", async () => {
    await seedMinimalProcurement();

    const results = await Promise.allSettled([
      world.procurement.allocateFulfillment({
        id: ids.allocA,
        poLineId: ids.pol,
        materialNeedId: ids.need1,
        quantity: 2,
      }),
      world.procurement.allocateFulfillment({
        id: ids.allocB,
        poLineId: ids.pol,
        materialNeedId: ids.need2,
        quantity: 2,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      AllocationExceededError,
    );

    // Direct SQL insert bypassing repo also blocked by DB trigger
    await expect(
      db.execute(sql`
        INSERT INTO fulfillment_allocations (id, po_line_id, material_need_id, quantity, status)
        VALUES ('alloc-raw', 'pol-1', 'need-2', 1, 'ACTIVE')
      `),
    ).rejects.toThrow();
  });

  it("rejects PO line reductions below active allocations", async () => {
    await seedMinimalProcurement();
    await world.procurement.allocateFulfillment({
      id: ids.allocA,
      poLineId: ids.pol,
      materialNeedId: ids.need1,
      quantity: 2,
    });

    const line = {
      id: ids.pol,
      poId: ids.po,
      packageId: ids.pkg,
      contractualArrivalDate: "2026-12-28",
      status: "OPEN",
    };
    await expect(world.procurement.upsertPoLine({ ...line, quantity: 1 }))
      .rejects.toThrow(/exceed PO line/);
    expect((await world.procurement.getPoLineWithAllocations(ids.pol))?.line.quantity).toBe("2.000");
    await expect(world.procurement.upsertPoLine({ ...line, quantity: 3 }))
      .resolves.toMatchObject({ quantity: "3.000" });
  });

  it("refreshes the retrieval and expiry timestamps when evidence is upserted", async () => {
    const evidence = {
      id: asId<EvidenceSourceId>("curve-source"),
      kind: "MANUFACTURER_CURVE",
      trustTier: "primary",
    };
    await world.engineering.upsertEvidenceSource({
      ...evidence,
      retrievedAt: new Date("2026-12-01T00:00:00Z"),
      expiresAt: new Date("2026-12-02T00:00:00Z"),
    });
    const retrievedAt = new Date("2026-12-03T00:00:00Z");
    const expiresAt = new Date("2026-12-04T00:00:00Z");
    await expect(world.engineering.upsertEvidenceSource({ ...evidence, retrievedAt, expiresAt }))
      .resolves.toMatchObject({ retrievedAt, expiresAt });
  });

  it("Invariant 2: DB CHECK blocks BINDING action_receipts without approval_id", async () => {
    await expect(
      db.execute(sql`
        INSERT INTO action_receipts (action_id, idempotency_key, status, action_type, action_class, actor, reason, arguments)
        VALUES ('a1', 'key-1', 'PENDING', 'update_po', 'BINDING', 'op', 'test', '{}'::jsonb)
      `),
    ).rejects.toThrow();
  });

  it("Invariant 3: DB CHECK blocks PASS finding without evidence_refs and offers without evidence_ref/valid expiry", async () => {
    await seedMinimalProcurement();
    await world.engineering.upsertRequirementSet({
      id: ids.reqset,
      packageId: ids.pkg,
      revision: 1,
      status: "APPROVED",
      sourceRefs: ["src-1"],
    });
    await world.engineering.upsertRequirement({
      id: ids.req,
      requirementSetId: ids.reqset,
      code: "head-at-duty",
      kind: "head_at_duty",
      predicate: { operator: "GTE", value: 80 },
      mandatory: true,
      sourceRefs: ["src-1"],
    });
    await world.engineering.upsertProductConfiguration({
      id: ids.cfg,
      manufacturer: "Demo",
      model: "M1",
      equipmentType: "CENTRIFUGAL_PUMP",
      specs: {},
      sourceRefs: ["src-1"],
      trustTier: "primary",
    });

    await expect(
      world.engineering.recordComplianceFinding({
        requirementSetId: ids.reqset,
        requirementSetRevision: 1,
        requirementId: ids.req,
        productConfigId: ids.cfg,
        productConfigRevision: 1,
        evaluatorVersion: "1.0.0",
        result: "PASS",
        mandatory: true,
        explanation: "Unsupported pass",
        evidenceRefs: [],
      }),
    ).rejects.toThrow();

    await expect(
      world.engineering.createSupplierOffer({
        id: ids.offer1,
        projectId: ids.project,
        vendorId: ids.vendor,
        productConfigId: ids.cfg,
        quantity: 2,
        currency: "USD",
        quotedAt: new Date("2026-12-01T00:00:00Z"),
        expiresAt: new Date("2026-12-05T00:00:00Z"),
        evidenceRef: "   ",
      }),
    ).rejects.toThrow();

    await expect(
      world.engineering.createSupplierOffer({
        id: ids.offer2,
        projectId: ids.project,
        vendorId: ids.vendor,
        productConfigId: ids.cfg,
        quantity: 2,
        currency: "USD",
        quotedAt: new Date("2026-12-05T00:00:00Z"),
        expiresAt: new Date("2026-12-01T00:00:00Z"),
        evidenceRef: "quote://1",
      }),
    ).rejects.toThrow();
  });

  it("Invariant 4 & Scenario 6: revision bump atomically invalidates active approvals and FOR SHARE sees it", async () => {
    await seedMinimalProcurement();
    await world.incidents.createIncident({
      id: ids.inc1,
      projectId: ids.project,
      packageId: ids.pkg,
      materialNeedId: ids.need1,
      poLineId: ids.pol,
      severity: "CRITICAL",
      status: "AWAITING_APPROVAL",
      owner: "op-1",
      nextAction: "Await approval",
      nextReviewAt: new Date("2026-12-16T00:00:00Z"),
      requiredQty: 2,
    });
    await world.incidents.upsertSubjectRevisions({
      subjectId: ids.pol,
      subjectType: "POLine",
      pins: { offer_rev: "1", plan_rev: "1" },
    });
    await world.incidents.createApproval({
      id: ids.appr,
      incidentId: ids.inc1,
      scope: "update_po",
      subjectId: ids.pol,
      grantedBy: "pm-1",
      grantedRole: "PROCUREMENT_MANAGER",
      outcome: "GRANTED",
      pins: { offer_rev: "1", plan_rev: "1" },
      grantedAt: new Date("2026-12-15T09:00:00Z"),
      expiresAt: new Date("2026-12-15T18:00:00Z"),
    });

    const gatewayStore = new PostgresGatewayStore(db, () => new Date("2026-12-15T10:00:00Z"));
    const before = await gatewayStore.transaction((tx) =>
      tx.getValidApproval("appr-1", new Date("2026-12-15T10:00:00Z")),
    );
    expect(before?.approval_id).toBe("appr-1");

    const bumped = await world.incidents.bumpRevisionAndInvalidateApprovals({
      subjectId: ids.pol,
      subjectType: "POLine",
      pins: { offer_rev: "2", plan_rev: "1" },
      reason: "Offer revised",
    });
    expect(bumped.invalidatedApprovalIds).toEqual(["appr-1"]);

    const after = await gatewayStore.transaction((tx) =>
      tx.getValidApproval("appr-1", new Date("2026-12-15T10:00:00Z")),
    );
    expect(after).toBeNull();
  });

  it("updates config pins and invalidates affected grants when canonical specs change", async () => {
    await seedMinimalProcurement();
    const config = {
      id: ids.cfg,
      manufacturer: "Demo",
      model: "M1",
      equipmentType: "CENTRIFUGAL_PUMP",
      specs: { head: 80 },
      sourceRefs: ["curve-source"],
      trustTier: "primary",
    };
    await world.engineering.upsertProductConfiguration(config);
    await world.incidents.upsertSubjectRevisions({
      subjectId: ids.pol,
      subjectType: "POLine",
      pins: { config_rev: "cfg-1@1", plan_rev: "plan-1" },
    });
    await world.incidents.upsertSubjectRevisions({
      subjectId: ids.pkg,
      subjectType: "EquipmentPackage",
      pins: { config_rev: "cfg-other@1" },
    });
    const now = new Date("2026-12-15T10:00:00Z");
    for (const [id, subjectId, pins] of [
      [ids.appr, ids.pol, { config_rev: "cfg-1@1", plan_rev: "plan-1" }],
      [asId<ApprovalId>("unrelated-approval"), ids.pkg, { config_rev: "cfg-other@1" }],
    ] as const) {
      await world.incidents.createApproval({
        id, subjectId, pins,
        scope: "substitute_product",
        grantedBy: "engineer-1",
        grantedRole: "ENGINEER_OF_RECORD",
        outcome: "GRANTED",
        grantedAt: new Date("2026-12-15T09:00:00Z"),
        expiresAt: new Date("2026-12-16T09:00:00Z"),
      });
    }
    const store = new PostgresGatewayStore(db, () => now);
    const readApproval = (id: string) => store.transaction((tx) => tx.getValidApproval(id, now));

    await world.engineering.upsertProductConfiguration(config);
    await expect(readApproval(ids.appr)).resolves.toMatchObject({ approval_id: ids.appr });
    await expect(world.engineering.upsertProductConfiguration({ ...config, specs: { head: 70 } }))
      .rejects.toThrow(/requires a revision above/);
    await expect(readApproval(ids.appr)).resolves.toMatchObject({ approval_id: ids.appr });

    await world.engineering.upsertProductConfiguration({ ...config, revision: 2, specs: { head: 70 } });
    await store.transaction(async (tx) => {
      expect(await tx.currentRevisions(ids.cfg)).toEqual({ config_rev: "2" });
      expect(await tx.currentRevisions(ids.pol)).toEqual({ config_rev: "cfg-1@2", plan_rev: "plan-1" });
      expect(await tx.getValidApproval(ids.appr, now)).toBeNull();
    });
    await expect(readApproval("unrelated-approval")).resolves.toMatchObject({ approval_id: "unrelated-approval" });
  });

  it("Invariant 5, 8 & Scenario 9: partial acceptance blocks closure; full acceptance allows CLOSED", async () => {
    await seedMinimalProcurement();
    await world.incidents.createIncident({
      id: ids.inc2,
      projectId: ids.project,
      packageId: ids.pkg,
      materialNeedId: ids.need1,
      poLineId: ids.pol,
      severity: "WARNING",
      status: "VERIFYING",
      owner: "op-1",
      nextAction: "Verify receipt",
      nextReviewAt: new Date("2026-12-29T12:00:00Z"),
      requiredQty: 2,
    });

    // Invariant 8: DB CHECK blocks open incident without owner/next_review_at
    await expect(
      db.execute(sql`
        UPDATE incidents SET owner = NULL WHERE id = 'inc-2'
      `),
    ).rejects.toThrow();

    await world.procurement.recordReceipt({
      id: ids.rcpt,
      poLineId: ids.pol,
      shippedQty: 2,
      receivedQty: 2,
      receivedAt: new Date("2026-12-28T10:00:00Z"),
    });
    await world.procurement.recordInspection({
      id: ids.insp,
      receiptId: ids.rcpt,
      poLineId: ids.pol,
      result: "PASS",
    });
    const alternateLine = asId<POLineId>("alternate-line");
    await world.procurement.upsertPoLine({
      id: alternateLine,
      poId: ids.po,
      packageId: ids.pkg,
      quantity: 1,
      contractualArrivalDate: "2026-12-28",
      status: "OPEN",
    });

    const wrongNeed = {
      acceptanceId: ids.acc1,
      inspectionId: ids.insp,
      poLineId: ids.pol,
      materialNeedId: ids.need2,
      acceptedQty: 2,
      disposition: "ACCEPTED" as const,
      authorizedBy: "site-eng-1",
      acceptedAt: new Date("2026-12-28T12:00:00Z"),
      evidenceRef: "sig://acc-1",
    };
    await expect(world.incidents.recordAcceptanceForIncident(ids.inc2, wrongNeed))
      .rejects.toThrow(/material need does not match/);
    await expect(world.incidents.recordAcceptanceForIncident(ids.inc2, {
      ...wrongNeed,
      materialNeedId: ids.need1,
      poLineId: alternateLine,
    })).rejects.toThrow(/Inspection does not verify PO line/);
    expect((await world.incidents.getIncident(ids.inc2))?.acceptedQty).toBe("0.000");

    // Partial acceptance: 1 of 2
    await world.incidents.recordAcceptanceForIncident(ids.inc2, {
      acceptanceId: ids.acc1,
      inspectionId: ids.insp,
      poLineId: ids.pol,
      materialNeedId: ids.need1,
      acceptedQty: 1,
      disposition: "ACCEPTED",
      authorizedBy: "site-eng-1",
      acceptedAt: new Date("2026-12-28T12:00:00Z"),
      evidenceRef: "sig://acc-1",
    });

    const partialClose = await world.incidents.transitionIncident(ids.inc2, {
      to: "CLOSED",
      actor: "op-1",
      reason: "Attempt premature close",
    });
    expect(partialClose.success).toBe(false);
    expect(partialClose.error).toContain("accepted_qty >= required_qty");

    const alternateReceipt = asId<ReceiptId>("alternate-receipt");
    const alternateInspection = asId<InspectionId>("alternate-inspection");
    await world.procurement.recordReceipt({
      id: alternateReceipt,
      poLineId: alternateLine,
      shippedQty: 1,
      receivedQty: 1,
    });
    await world.procurement.recordInspection({
      id: alternateInspection,
      receiptId: alternateReceipt,
      poLineId: alternateLine,
      result: "PASS",
    });
    const secondAcceptance = {
      acceptanceId: ids.acc2,
      inspectionId: alternateInspection,
      poLineId: alternateLine,
      materialNeedId: ids.need1,
      acceptedQty: 1,
      disposition: "ACCEPTED" as const,
      authorizedBy: "site-eng-1",
      acceptedAt: new Date("2026-12-28T14:00:00Z"),
      evidenceRef: "sig://acc-2",
    };
    await expect(world.incidents.recordAcceptanceForIncident(ids.inc2, secondAcceptance))
      .rejects.toThrow(/not allocated to the need/);
    await world.procurement.allocateFulfillment({
      id: ids.allocA,
      poLineId: alternateLine,
      materialNeedId: ids.need1,
      quantity: 1,
    });
    await world.incidents.recordAcceptanceForIncident(ids.inc2, secondAcceptance);

    const fullClose = await world.incidents.transitionIncident(ids.inc2, {
      to: "CLOSED",
      actor: "op-1",
      reason: "All 2 units accepted",
    });
    expect(fullClose.success).toBe(true);
    expect(fullClose.to_status).toBe("CLOSED");
  });

  it("Invariant 7: BASELINE schedule_revisions and child activities/dependencies are immutable", async () => {
    await world.schedule.upsertProject({ id: ids.project, name: "Test Project" });
    await world.schedule.createScheduleRevision({
      id: ids.sched,
      projectId: ids.project,
      revision: 1,
      kind: "BASELINE",
      startDate: "2026-11-30",
      calendar: { working_weekdays: ["MONDAY"] },
      activities: [
        {
          activityId: ids.act1,
          name: "Design",
          type: "DESIGN",
          durationWorkdays: 2,
        },
        {
          activityId: ids.act2,
          name: "Build",
          type: "FABRICATION",
          durationWorkdays: 3,
        },
        {
          activityId: asId<ActivityId>("standalone"),
          name: "Inspect",
          type: "INSPECTION",
          durationWorkdays: 1,
        },
      ],
      dependencies: [
        { predecessorId: ids.act1, successorId: ids.act2, type: "FS" },
      ],
    });
    const current = asId<ScheduleRevisionId>("sched-current");
    await world.schedule.createScheduleRevision({
      id: current,
      projectId: ids.project,
      revision: 2,
      kind: "CURRENT",
      startDate: "2026-11-30",
      calendar: { working_weekdays: ["MONDAY"] },
      activities: [
        { activityId: ids.act1, name: "Design", type: "DESIGN", durationWorkdays: 2 },
        { activityId: ids.act2, name: "Build", type: "FABRICATION", durationWorkdays: 3 },
      ],
      dependencies: [],
    });

    await expect(
      db.execute(sql`UPDATE schedule_revisions SET revision = 3 WHERE id = 'sched-base'`),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.execute(sql`DELETE FROM schedule_revisions WHERE id = 'sched-base'`),
    ).rejects.toThrow();
    await expect(
      db.execute(sql`UPDATE activities SET duration_workdays = 99 WHERE schedule_revision_id = 'sched-base' AND activity_id = 'act-1'`),
    ).rejects.toThrow();
    await expect(
      db.execute(sql`DELETE FROM dependencies WHERE schedule_revision_id = 'sched-base'`),
    ).rejects.toThrow();
    await expect(
      db.execute(sql`
        INSERT INTO activities (schedule_revision_id, activity_id, name, type, duration_workdays)
        VALUES ('sched-base', 'act-late', 'Late add', 'DESIGN', 1)
      `),
    ).rejects.toThrow();
    await expect(db.execute(sql`
      UPDATE activities SET schedule_revision_id = ${current}
      WHERE schedule_revision_id = ${ids.sched} AND activity_id = 'standalone'
    `)).rejects.toThrow(/belonging to BASELINE/);
    await expect(db.execute(sql`
      UPDATE dependencies SET schedule_revision_id = ${current}
      WHERE schedule_revision_id = ${ids.sched}
    `)).rejects.toThrow(/belonging to BASELINE/);
  });

  it("selects the latest CURRENT schedule by revision", async () => {
    await world.schedule.upsertProject({ id: ids.project, name: "Test Project" });
    for (const revision of [1, 3, 2]) {
      await world.schedule.createScheduleRevision({
        id: asId<ScheduleRevisionId>(`schedule-${revision}`),
        projectId: ids.project,
        revision,
        kind: "CURRENT",
        startDate: "2026-11-30",
        calendar: { working_weekdays: ["MONDAY"] },
        activities: [],
        dependencies: [],
      });
    }
    await expect(world.schedule.getScheduleRevision(ids.project, "CURRENT"))
      .resolves.toMatchObject({ id: "schedule-3", revision: 3 });
  });

  it("waiver closure: attachWaiver stores the grant a CLOSED transition can use", async () => {
    await seedMinimalProcurement();
    await world.incidents.createIncident({
      id: asId<IncidentId>("inc-waiver"),
      projectId: asId<ProjectId>("proj-1"),
      packageId: asId<PackageId>("pkg-1"),
      materialNeedId: asId<MaterialNeedId>("need-1"),
      poLineId: asId<POLineId>("pol-1"),
      severity: "WARNING",
      status: "VERIFYING",
      owner: "op-1",
      nextAction: "Decide waiver",
      nextReviewAt: new Date("2026-12-29T12:00:00Z"),
      requiredQty: 2,
    });
    const grant = {
      incidentId: asId<IncidentId>("inc-waiver"),
      scope: "accept_waiver",
      subjectId: asId<POLineId>("pol-1"),
      grantedBy: "pm-1",
      grantedRole: "PROJECT_MANAGER" as const,
      outcome: "GRANTED" as const,
      grantedAt: new Date("2026-12-15T09:00:00Z"),
      expiresAt: new Date("2026-12-20T00:00:00Z"),
    };
    const waiver = {
      incidentId: grant.incidentId,
      scheduleDisposition: "Need date moved and accepted",
      expectedVersion: 1,
      now: new Date("2026-12-15T10:00:00Z"),
    };
    const close = () => world.incidents.transitionIncident(
      grant.incidentId,
      { to: "CLOSED", actor: "op-1", reason: "Waiver accepted" },
      waiver.now,
    );

    for (const invalidGrant of [
      { id: asId<ApprovalId>("appr-po"), scope: "update_po" },
      { id: asId<ApprovalId>("appr-wrong-role"), grantedRole: "PROCUREMENT_MANAGER" as const },
    ]) {
      await world.incidents.createApproval({ ...grant, ...invalidGrant });
      await expect(world.incidents.attachWaiver({ ...waiver, waiverApprovalId: invalidGrant.id }))
        .rejects.toThrow(/live grant/);
      await db.execute(sql`
        UPDATE incidents
        SET waiver_approval_id = ${invalidGrant.id}, schedule_disposition = ${waiver.scheduleDisposition}
        WHERE id = ${grant.incidentId}
      `);
      await expect(close()).resolves.toMatchObject({ success: false });
    }

    await world.incidents.createApproval({
      ...grant,
      id: asId<ApprovalId>("appr-waiver"),
    });

    const waived = await world.incidents.attachWaiver({
      ...waiver,
      waiverApprovalId: asId<ApprovalId>("appr-waiver"),
    });
    expect(waived.waiverApprovalId).toBe("appr-waiver");
    expect(waived.scheduleDisposition).toBe("Need date moved and accepted");

    const closed = await close();
    expect(closed.success).toBe(true);
    expect(closed.to_status).toBe("CLOSED");
  });

  it("Scenario 2 & concurrency: PostgresEventStore deduplicates and rejects out-of-order revisions", async () => {
    const eventStore = new PostgresEventStore(db);
    const makeEvent = (
      sourceEventId: string | null,
      sourceVersion: number | null,
    ): NormalizedEvent => ({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      type: "VendorCommitmentChanged",
      project_id: ids.project,
      subject_type: "POLine",
      subject_id: ids.pol,
      occurred_at: new Date("2026-12-14T09:00:00Z"),
      received_at: new Date("2026-12-14T09:05:00Z"),
      source: "vendor-email",
      source_event_id: sourceEventId,
      source_version: sourceVersion,
      evidence_ref: null,
      correlation_id: null,
      payload: { revised_arrival_date: "2027-01-07" },
      tainted_fields: ["payload.revised_arrival_date"],
    });

    const r2 = await eventStore.storeIfNew(makeEvent("evt-1-v2", 2), {
      dedupeKey: "vendor-email:evt-1-v2",
      seriesKey: "vendor-email:evt-1",
    });
    expect(r2).toBe("stored");

    const rDup = await eventStore.storeIfNew(makeEvent("evt-1-v2", 2), {
      dedupeKey: "vendor-email:evt-1-v2",
      seriesKey: "vendor-email:evt-1",
    });
    expect(rDup).toBe("duplicate");

    const rOld = await eventStore.storeIfNew(makeEvent("evt-1-v1", 1), {
      dedupeKey: "vendor-email:evt-1-v1",
      seriesKey: "vendor-email:evt-1",
    });
    expect(rOld).toBe("out_of_order");

    // Concurrent deliveries of same dedupeKey
    const concurrent = await Promise.all(
      Array.from({ length: 4 }, () =>
        eventStore.storeIfNew(makeEvent("evt-99", null), {
          dedupeKey: "vendor-email:evt-99",
          seriesKey: "vendor-email:evt-99",
        }),
      ),
    );
    expect(concurrent.filter((o) => o === "stored")).toHaveLength(1);
    expect(concurrent.filter((o) => o === "duplicate")).toHaveLength(3);
  });

  it("Invariant 6 & Scenario 7: PostgresGatewayStore claim lease recovery & atomic outbox", async () => {
    let now = new Date("2026-12-15T10:00:00Z");
    const store = new PostgresGatewayStore(db, () => now);

    const outcome = await store.transaction((tx) =>
      tx.insertReceipt({
        action_id: "act-1",
        idempotency_key: "action:test-1",
        status: "PENDING",
        action_type: "send_vendor_email",
        action_class: "EXTERNAL_WRITE",
        incident_id: null,
        subject_id: ids.pol,
        actor: "op-1",
        reason: "Follow up",
        arguments: { body: "Hi" },
        tainted_arguments: [],
        approval_id: null,
        recipient: "vendor@example.com",
        template_id: "vendor_update",
        dispatched_at: null,
        confirmed_at: null,
        external_id: null,
        error: null,
        lease_expires_at: null,
        retry_count: 0,
      }),
    );
    expect(outcome.inserted).toBe(true);
    if (!outcome.inserted) return;

    const claim1 = await store.transaction((tx) =>
      tx.claim(outcome.receipt_id, now, new Date(now.getTime() + 60_000)),
    );
    expect(claim1?.recovered).toBe(false);
    expect(claim1?.receipt.retry_count).toBe(1);

    // Live lease blocks second claim
    const claim2 = await store.transaction((tx) =>
      tx.claim(outcome.receipt_id, now, new Date(now.getTime() + 60_000)),
    );
    expect(claim2).toBeNull();

    // Expired lease allows recovery claim
    now = new Date(now.getTime() + 61_000);
    const claim3 = await store.transaction((tx) =>
      tx.claim(outcome.receipt_id, now, new Date(now.getTime() + 60_000)),
    );
    expect(claim3?.recovered).toBe(true);
    expect(claim3?.receipt.retry_count).toBe(2);
  });

  it("PostgresResultCache persists specialist results across client instances", async () => {
    const cache1 = new PostgresResultCache(db);
    const runner1 = createIdempotentRunner(cache1);
    const key = idempotencyKey({
      specialist: "investigation",
      version: "1.0.0",
      input: { incident_id: "inc-1" },
    });

    const sampleResult: SpecialistResult<{ root_cause: string }> = {
      specialist: "investigation",
      version: "1.0.0",
      run_id: "run_01J00000000000000000000001",
      case_id: "inc-1",
      idempotency_key: key,
      status: "OK",
      result: { root_cause: "delayed_fabrication" },
      findings: [],
      confidence: {
        score: 0.95,
        method: "deterministic",
        tier: "CERTAIN",
        evidence_coverage: 1,
        reason: "Direct fixture test",
      },
      evidence: [],
      handoff: null,
      next_suggested: [],
      assumptions: [],
      input_versions: {},
      generated_at: "2026-12-15T10:00:00Z",
      model_usage: [
        { model: "test", tokens_in: 10, tokens_out: 5, usd: 0.001, ms: 12 },
      ],
      assertions: [],
    };

    const first = await runner1(key, async () => sampleResult);
    expect(first.replayed).toBe(false);

    // New client instance reads from Postgres
    const conn2 = createDb(TEST_URL!);
    try {
      const cache2 = new PostgresResultCache(conn2.db);
      const runner2 = createIdempotentRunner(cache2);
      const second = await runner2(key, async () => {
        throw new Error("Should not recompute on cache hit");
      });
      expect(second.replayed).toBe(true);
      expect(second.envelope.result).toEqual({
        root_cause: "delayed_fabrication",
      });
      expect(second.envelope.model_usage).toEqual([]);
    } finally {
      await conn2.pool.end();
    }
  });

  it("seedDatabase is idempotent across repeated executions", async () => {
    await seedDatabase(TEST_URL!);
    await seedDatabase(TEST_URL!);

    const proj = await world.schedule.getProject(ids.demoProject);
    expect(proj?.name).toContain("Commercial HVAC");

    const baseline = await world.schedule.getScheduleRevision(
      ids.demoProject,
      "BASELINE",
    );
    expect(baseline).not.toBeNull();
    const acts = await world.schedule.listActivities(asId<ScheduleRevisionId>(baseline!.id));
    expect(acts).toHaveLength(12);

    const reqSet = await world.engineering.getActiveRequirementSet(ids.demoPkg);
    expect(reqSet?.id).toBe("req-pump-chw-001");
    const reqs = await world.engineering.listRequirements(asId<RequirementSetId>(reqSet!.id));
    expect(reqs).toHaveLength(9);
  }, 90_000);
});

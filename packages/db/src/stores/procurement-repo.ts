import { and, asc, desc, eq, sql } from "drizzle-orm";
import type {
  AcceptanceId,
  ActivityId,
  AllocationId,
  IncidentId,
  InspectionId,
  MaterialNeedId,
  MilestoneId,
  PackageId,
  POLineId,
  ProductConfigId,
  ProjectId,
  PurchaseOrderId,
  ReceiptId,
  RequirementSetId,
  VendorId,
} from "@pactline/domain";
import type { DB } from "../client.js";
import {
  acceptances,
  equipmentPackages,
  fulfillmentAllocations,
  inspections,
  materialNeeds,
  milestones,
  poLines,
  purchaseOrders,
  receipts,
  vendorCommitments,
  vendors,
} from "../schema/procurement.js";

export class AllocationExceededError extends Error {
  constructor(
    public readonly poLineId: POLineId,
    public readonly lineQuantity: number,
    public readonly activeAllocated: number,
    public readonly requested: number,
  ) {
    super(
      `PO line ${poLineId} allocation exceeded: line qty=${lineQuantity}, active=${activeAllocated}, requested=${requested}`,
    );
    this.name = "AllocationExceededError";
  }
}

export interface AllocateFulfillmentInput {
  id: AllocationId;
  poLineId: POLineId;
  materialNeedId: MaterialNeedId;
  quantity: number;
  incidentId?: IncidentId | null;
}

export interface RecordVendorCommitmentInput {
  poLineId: POLineId;
  commitmentKind: "CONTRACTUAL" | "ACKNOWLEDGMENT" | "FORECAST" | "ESTIMATE";
  promisedArrivalDate: string;
  observedAt: Date;
  source: string;
  sourceEventId?: string | null;
  sourceVersion?: number | null;
  evidenceRef?: string | null;
  taintStatus: "untrusted" | "verified" | "derived";
  updatePoLineForecast?: boolean;
}

export class ProcurementRepo {
  constructor(
    private readonly db: DB,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async getVendor(id: VendorId) {
    const [row] = await this.db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
    return row ?? null;
  }

  async listVendors(limit = 100) {
    return this.db.select().from(vendors).orderBy(asc(vendors.name)).limit(limit);
  }

  async getEquipmentPackage(id: PackageId) {
    const [row] = await this.db.select().from(equipmentPackages).where(eq(equipmentPackages.id, id)).limit(1);
    return row ?? null;
  }

  async listEquipmentPackages(projectId: ProjectId) {
    return this.db.select().from(equipmentPackages)
      .where(eq(equipmentPackages.projectId, projectId))
      .orderBy(asc(equipmentPackages.id));
  }

  async getMaterialNeed(id: MaterialNeedId) {
    const [row] = await this.db.select().from(materialNeeds).where(eq(materialNeeds.id, id)).limit(1);
    return row ?? null;
  }

  async listMaterialNeeds(projectId: ProjectId) {
    return this.db.select().from(materialNeeds)
      .where(eq(materialNeeds.projectId, projectId))
      .orderBy(asc(materialNeeds.requiredUsableDate), asc(materialNeeds.id));
  }

  async getPurchaseOrder(id: PurchaseOrderId) {
    const [row] = await this.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
    return row ?? null;
  }

  async listPurchaseOrders(projectId: ProjectId) {
    return this.db.select().from(purchaseOrders)
      .where(eq(purchaseOrders.projectId, projectId))
      .orderBy(desc(purchaseOrders.createdAt));
  }

  async getPoLine(id: POLineId) {
    const [row] = await this.db.select().from(poLines).where(eq(poLines.id, id)).limit(1);
    return row ?? null;
  }

  async listPoLines(purchaseOrderId: PurchaseOrderId) {
    return this.db.select().from(poLines)
      .where(eq(poLines.poId, purchaseOrderId))
      .orderBy(asc(poLines.id));
  }

  async listMilestones(poLineId: POLineId) {
    return this.db.select().from(milestones)
      .where(eq(milestones.poLineId, poLineId))
      .orderBy(asc(milestones.plannedDate), asc(milestones.id));
  }

  async getReceipt(id: ReceiptId) {
    const [row] = await this.db.select().from(receipts).where(eq(receipts.id, id)).limit(1);
    return row ?? null;
  }

  async listReceipts(poLineId: POLineId) {
    return this.db.select().from(receipts)
      .where(eq(receipts.poLineId, poLineId))
      .orderBy(desc(receipts.createdAt));
  }

  async getInspection(id: InspectionId) {
    const [row] = await this.db.select().from(inspections).where(eq(inspections.id, id)).limit(1);
    return row ?? null;
  }

  async listInspections(poLineId: POLineId) {
    return this.db.select().from(inspections)
      .where(eq(inspections.poLineId, poLineId))
      .orderBy(desc(inspections.inspectedAt));
  }

  async getAcceptance(id: AcceptanceId) {
    const [row] = await this.db.select().from(acceptances).where(eq(acceptances.id, id)).limit(1);
    return row ?? null;
  }

  async listAcceptances(materialNeedId: MaterialNeedId) {
    return this.db.select().from(acceptances)
      .where(eq(acceptances.materialNeedId, materialNeedId))
      .orderBy(desc(acceptances.acceptedAt));
  }

  async upsertVendor(input: {
    id: VendorId;
    name: string;
    contactEmail?: string | null;
    isSandbox?: boolean;
    metadata?: Record<string, unknown>;
  }) {
    const [row] = await this.db
      .insert(vendors)
      .values({
        id: input.id,
        name: input.name,
        contactEmail: input.contactEmail ?? null,
        isSandbox: input.isSandbox ?? true,
        metadata: input.metadata ?? {},
      })
      .onConflictDoUpdate({
        target: vendors.id,
        set: {
          name: input.name,
          contactEmail: input.contactEmail ?? null,
          isSandbox: input.isSandbox ?? true,
          metadata: input.metadata ?? {},
        },
      })
      .returning();
    return row!;
  }

  async upsertEquipmentPackage(input: {
    id: PackageId;
    projectId: ProjectId;
    type: string;
    description: string;
    requiredQuantity: number;
    activeRequirementSetId?: RequirementSetId | null;
    status: string;
  }) {
    const [row] = await this.db
      .insert(equipmentPackages)
      .values({
        id: input.id,
        projectId: input.projectId,
        type: input.type,
        description: input.description,
        requiredQuantity: String(input.requiredQuantity),
        activeRequirementSetId: input.activeRequirementSetId ?? null,
        status: input.status,
      })
      .onConflictDoUpdate({
        target: equipmentPackages.id,
        set: {
          type: input.type,
          description: input.description,
          requiredQuantity: String(input.requiredQuantity),
          activeRequirementSetId: input.activeRequirementSetId ?? null,
          status: input.status,
          updatedAt: this.clock(),
        },
      })
      .returning();
    return row!;
  }

  async upsertMaterialNeed(input: {
    id: MaterialNeedId;
    projectId: ProjectId;
    packageId: PackageId;
    activityId: ActivityId;
    requiredQuantity: number;
    requiredUsableDate: string;
    readinessBufferDays: number;
  }) {
    const [row] = await this.db
      .insert(materialNeeds)
      .values({
        id: input.id,
        projectId: input.projectId,
        packageId: input.packageId,
        activityId: input.activityId,
        requiredQuantity: String(input.requiredQuantity),
        requiredUsableDate: input.requiredUsableDate,
        readinessBufferDays: input.readinessBufferDays,
      })
      .onConflictDoUpdate({
        target: materialNeeds.id,
        set: {
          activityId: input.activityId,
          requiredQuantity: String(input.requiredQuantity),
          requiredUsableDate: input.requiredUsableDate,
          readinessBufferDays: input.readinessBufferDays,
        },
      })
      .returning();
    return row!;
  }

  async upsertPurchaseOrder(input: {
    id: PurchaseOrderId;
    projectId: ProjectId;
    vendorId: VendorId;
    status: string;
    currency?: string;
    commercialTerms?: Record<string, unknown>;
    releasedOn?: string | null;
  }) {
    const [row] = await this.db
      .insert(purchaseOrders)
      .values({
        id: input.id,
        projectId: input.projectId,
        vendorId: input.vendorId,
        status: input.status,
        currency: input.currency ?? "USD",
        commercialTerms: input.commercialTerms,
        releasedOn: input.releasedOn ?? null,
      })
      .onConflictDoUpdate({
        target: purchaseOrders.id,
        set: {
          status: input.status,
          currency: input.currency ?? "USD",
          commercialTerms: input.commercialTerms,
          releasedOn: input.releasedOn ?? null,
        },
      })
      .returning();
    return row!;
  }

  async upsertPoLine(input: {
    id: POLineId;
    poId: PurchaseOrderId;
    packageId: PackageId;
    productConfigId?: ProductConfigId | null;
    quantity: number;
    unitPrice?: number | null;
    contractualArrivalDate: string;
    currentForecastArrivalDate?: string | null;
    status: string;
  }) {
    const [row] = await this.db
      .insert(poLines)
      .values({
        id: input.id,
        poId: input.poId,
        packageId: input.packageId,
        productConfigId: input.productConfigId ?? null,
        quantity: String(input.quantity),
        unitPrice: input.unitPrice !== undefined && input.unitPrice !== null ? String(input.unitPrice) : null,
        contractualArrivalDate: input.contractualArrivalDate,
        currentForecastArrivalDate: input.currentForecastArrivalDate ?? null,
        status: input.status,
      })
      .onConflictDoUpdate({
        target: poLines.id,
        set: {
          productConfigId: input.productConfigId ?? null,
          quantity: String(input.quantity),
          unitPrice: input.unitPrice !== undefined && input.unitPrice !== null ? String(input.unitPrice) : null,
          contractualArrivalDate: input.contractualArrivalDate,
          currentForecastArrivalDate: input.currentForecastArrivalDate ?? null,
          status: input.status,
          updatedAt: this.clock(),
        },
      })
      .returning();
    return row!;
  }

  async upsertMilestone(input: {
    id: MilestoneId;
    poLineId: POLineId;
    type: string;
    plannedDate: string;
    forecastDate?: string | null;
    actualDate?: string | null;
    status: string;
    evidenceRef?: string | null;
  }) {
    const [row] = await this.db
      .insert(milestones)
      .values({
        id: input.id,
        poLineId: input.poLineId,
        type: input.type,
        plannedDate: input.plannedDate,
        forecastDate: input.forecastDate ?? null,
        actualDate: input.actualDate ?? null,
        status: input.status,
        evidenceRef: input.evidenceRef ?? null,
      })
      .onConflictDoUpdate({
        target: milestones.id,
        set: {
          plannedDate: input.plannedDate,
          forecastDate: input.forecastDate ?? null,
          actualDate: input.actualDate ?? null,
          status: input.status,
          evidenceRef: input.evidenceRef ?? null,
        },
      })
      .returning();
    return row!;
  }

  /**
   * Invariant 1: Locks the parent PO line row (FOR UPDATE) and enforces
   * SUM(active allocated qty) <= po_line.quantity.
   */
  async allocateFulfillment(input: AllocateFulfillmentInput) {
    return this.db.transaction(async (tx) => {
      const [line] = await tx
        .select({ id: poLines.id, quantity: poLines.quantity })
        .from(poLines)
        .where(eq(poLines.id, input.poLineId))
        .for("update");

      if (!line) {
        throw new Error(`PO line ${input.poLineId} not found`);
      }

      const [sumRow] = await tx
        .select({
          total: sql<string>`COALESCE(SUM(${fulfillmentAllocations.quantity}), 0)`,
        })
        .from(fulfillmentAllocations)
        .where(
          and(
            eq(fulfillmentAllocations.poLineId, input.poLineId),
            eq(fulfillmentAllocations.status, "ACTIVE"),
          ),
        );

      const lineQty = Number(line.quantity);
      const activeAllocated = Number(sumRow?.total ?? 0);

      if (activeAllocated + input.quantity > lineQty) {
        throw new AllocationExceededError(
          input.poLineId,
          lineQty,
          activeAllocated,
          input.quantity,
        );
      }

      const [created] = await tx
        .insert(fulfillmentAllocations)
        .values({
          id: input.id,
          poLineId: input.poLineId,
          materialNeedId: input.materialNeedId,
          quantity: String(input.quantity),
          status: "ACTIVE",
          incidentId: input.incidentId ?? null,
        })
        .returning();

      return created!;
    });
  }

  async releaseFulfillmentAllocation(allocationId: AllocationId, releasedAt?: Date) {
    const at = releasedAt ?? this.clock();
    const [updated] = await this.db
      .update(fulfillmentAllocations)
      .set({ status: "RELEASED", releasedAt: at })
      .where(
        and(
          eq(fulfillmentAllocations.id, allocationId),
          eq(fulfillmentAllocations.status, "ACTIVE"),
        ),
      )
      .returning();
    return updated ?? null;
  }

  /**
   * Append-only vendor commitment history. Never overwrites prior rows.
   */
  async recordVendorCommitment(input: RecordVendorCommitmentInput) {
    return this.db.transaction(async (tx) => {
      const [commitment] = await tx
        .insert(vendorCommitments)
        .values({
          poLineId: input.poLineId,
          commitmentKind: input.commitmentKind,
          promisedArrivalDate: input.promisedArrivalDate,
          observedAt: input.observedAt,
          source: input.source,
          sourceEventId: input.sourceEventId ?? null,
          sourceVersion: input.sourceVersion ?? null,
          evidenceRef: input.evidenceRef ?? null,
          taintStatus: input.taintStatus,
        })
        .returning();

      if (input.updatePoLineForecast) {
        await tx
          .update(poLines)
          .set({
            currentForecastArrivalDate: input.promisedArrivalDate,
            version: sql`${poLines.version} + 1`,
            updatedAt: this.clock(),
          })
          .where(eq(poLines.id, input.poLineId));
      }

      return commitment!;
    });
  }

  async listVendorCommitments(poLineId: POLineId) {
    return this.db
      .select()
      .from(vendorCommitments)
      .where(eq(vendorCommitments.poLineId, poLineId))
      .orderBy(desc(vendorCommitments.observedAt));
  }

  async recordReceipt(input: {
    id: ReceiptId;
    poLineId: POLineId;
    shippedQty: number;
    receivedQty: number;
    receivedAt?: Date | null;
    carrierRef?: string | null;
    evidenceRef?: string | null;
    conditionNotes?: string | null;
  }) {
    const [row] = await this.db
      .insert(receipts)
      .values({
        id: input.id,
        poLineId: input.poLineId,
        shippedQty: String(input.shippedQty),
        receivedQty: String(input.receivedQty),
        receivedAt: input.receivedAt ?? null,
        carrierRef: input.carrierRef ?? null,
        evidenceRef: input.evidenceRef ?? null,
        conditionNotes: input.conditionNotes ?? null,
      })
      .returning();
    return row!;
  }

  async recordInspection(input: {
    id: InspectionId;
    receiptId: ReceiptId;
    poLineId: POLineId;
    inspector?: string | null;
    inspectedAt?: Date | null;
    serialNumbers?: string[] | null;
    result: "PASS" | "HOLD" | "FAIL";
    notes?: string | null;
    evidenceRef?: string | null;
  }) {
    const [row] = await this.db
      .insert(inspections)
      .values({
        id: input.id,
        receiptId: input.receiptId,
        poLineId: input.poLineId,
        inspector: input.inspector ?? null,
        inspectedAt: input.inspectedAt ?? null,
        serialNumbers: input.serialNumbers ?? null,
        result: input.result,
        notes: input.notes ?? null,
        evidenceRef: input.evidenceRef ?? null,
      })
      .returning();
    return row!;
  }

  async recordAcceptance(input: {
    id: AcceptanceId;
    inspectionId: InspectionId;
    poLineId: POLineId;
    materialNeedId: MaterialNeedId;
    acceptedQty: number;
    disposition: "ACCEPTED" | "CONDITIONAL" | "REJECTED";
    authorizedBy: string;
    acceptedAt: Date;
    evidenceRef: string;
  }) {
    const [row] = await this.db
      .insert(acceptances)
      .values({
        id: input.id,
        inspectionId: input.inspectionId,
        poLineId: input.poLineId,
        materialNeedId: input.materialNeedId,
        acceptedQty: String(input.acceptedQty),
        disposition: input.disposition,
        authorizedBy: input.authorizedBy,
        acceptedAt: input.acceptedAt,
        evidenceRef: input.evidenceRef,
      })
      .returning();
    return row!;
  }

  async getPoLineWithAllocations(poLineId: POLineId) {
    const [line] = await this.db
      .select()
      .from(poLines)
      .where(eq(poLines.id, poLineId))
      .limit(1);
    if (!line) return null;

    const allocs = await this.db
      .select()
      .from(fulfillmentAllocations)
      .where(eq(fulfillmentAllocations.poLineId, poLineId));

    return { line, allocations: allocs };
  }

  async hasFulfillmentAllocation(id: AllocationId): Promise<boolean> {
    const [row] = await this.db
      .select({ id: fulfillmentAllocations.id })
      .from(fulfillmentAllocations)
      .where(eq(fulfillmentAllocations.id, id))
      .limit(1);
    return row !== undefined;
  }

  async hasVendorCommitmentBySourceEvent(
    poLineId: POLineId,
    sourceEventId: string,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ id: vendorCommitments.id })
      .from(vendorCommitments)
      .where(
        and(
          eq(vendorCommitments.poLineId, poLineId),
          eq(vendorCommitments.sourceEventId, sourceEventId),
        ),
      )
      .limit(1);
    return row !== undefined;
  }
}

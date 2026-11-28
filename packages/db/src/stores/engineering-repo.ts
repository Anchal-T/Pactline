import { and, desc, eq } from "drizzle-orm";
import type {
  EvidenceSourceId,
  OfferId,
  PackageId,
  ProductConfigId,
  ProjectId,
  RequirementId,
  RequirementSetId,
  VendorId,
} from "@pactline/domain";
import type { DB } from "../client.js";
import {
  complianceFindings,
  evidenceSources,
  productConfigurations,
  requirementSets,
  requirements,
  supplierOffers,
} from "../schema/engineering.js";

export class EngineeringRepo {
  constructor(private readonly db: DB) {}

  async upsertEvidenceSource(input: {
    id: EvidenceSourceId;
    kind: string;
    publisher?: string | null;
    title?: string | null;
    documentName?: string | null;
    revision?: string | null;
    locator?: Record<string, unknown> | null;
    uri?: string | null;
    contentHash?: string | null;
    trustTier: string;
    retrievedAt?: Date | null;
    expiresAt?: Date | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const [row] = await this.db
      .insert(evidenceSources)
      .values({
        id: input.id,
        kind: input.kind,
        publisher: input.publisher ?? null,
        title: input.title ?? null,
        documentName: input.documentName ?? null,
        revision: input.revision ?? null,
        locator: input.locator ?? null,
        uri: input.uri ?? null,
        contentHash: input.contentHash ?? null,
        trustTier: input.trustTier,
        retrievedAt: input.retrievedAt ?? null,
        expiresAt: input.expiresAt ?? null,
        metadata: input.metadata ?? null,
      })
      .onConflictDoUpdate({
        target: evidenceSources.id,
        set: {
          kind: input.kind,
          publisher: input.publisher ?? null,
          title: input.title ?? null,
          documentName: input.documentName ?? null,
          revision: input.revision ?? null,
          locator: input.locator ?? null,
          uri: input.uri ?? null,
          contentHash: input.contentHash ?? null,
          trustTier: input.trustTier,
          metadata: input.metadata ?? null,
        },
      })
      .returning();
    return row!;
  }

  async upsertRequirementSet(input: {
    id: RequirementSetId;
    packageId: PackageId;
    revision: number;
    dutyPoint?: Record<string, unknown> | null;
    scopeNote?: string | null;
    status: "DRAFT" | "APPROVED" | "SUPERSEDED";
    approvedBy?: string | null;
    approvedAt?: Date | null;
    sourceRefs: unknown[];
  }) {
    const [row] = await this.db
      .insert(requirementSets)
      .values({
        id: input.id,
        packageId: input.packageId,
        revision: input.revision,
        dutyPoint: input.dutyPoint ?? null,
        scopeNote: input.scopeNote ?? null,
        status: input.status,
        approvedBy: input.approvedBy ?? null,
        approvedAt: input.approvedAt ?? null,
        sourceRefs: input.sourceRefs,
      })
      .onConflictDoUpdate({
        target: requirementSets.id,
        set: {
          dutyPoint: input.dutyPoint ?? null,
          scopeNote: input.scopeNote ?? null,
          status: input.status,
          approvedBy: input.approvedBy ?? null,
          approvedAt: input.approvedAt ?? null,
          sourceRefs: input.sourceRefs,
        },
      })
      .returning();
    return row!;
  }

  async upsertRequirement(input: {
    id: RequirementId;
    requirementSetId: RequirementSetId;
    code: string;
    kind: string;
    predicate: Record<string, unknown>;
    mandatory: boolean;
    tolerance?: Record<string, unknown> | null;
    appliesWhen?: Record<string, unknown> | null;
    evidenceNeeded?: string | null;
    sourceRefs: unknown[];
  }) {
    const [row] = await this.db
      .insert(requirements)
      .values({
        id: input.id,
        requirementSetId: input.requirementSetId,
        code: input.code,
        kind: input.kind,
        predicate: input.predicate,
        mandatory: input.mandatory,
        tolerance: input.tolerance ?? null,
        appliesWhen: input.appliesWhen ?? null,
        evidenceNeeded: input.evidenceNeeded ?? null,
        sourceRefs: input.sourceRefs,
      })
      .onConflictDoUpdate({
        target: requirements.id,
        set: {
          code: input.code,
          kind: input.kind,
          predicate: input.predicate,
          mandatory: input.mandatory,
          tolerance: input.tolerance ?? null,
          appliesWhen: input.appliesWhen ?? null,
          evidenceNeeded: input.evidenceNeeded ?? null,
          sourceRefs: input.sourceRefs,
        },
      })
      .returning();
    return row!;
  }

  async upsertProductConfiguration(input: {
    id: ProductConfigId;
    manufacturer: string;
    family?: string | null;
    model: string;
    revision?: number;
    equipmentType: string;
    specs: Record<string, unknown>;
    sourceRefs: unknown[];
    trustTier: string;
  }) {
    const [row] = await this.db
      .insert(productConfigurations)
      .values({
        id: input.id,
        manufacturer: input.manufacturer,
        family: input.family ?? null,
        model: input.model,
        revision: input.revision ?? 1,
        equipmentType: input.equipmentType,
        specs: input.specs,
        sourceRefs: input.sourceRefs,
        trustTier: input.trustTier,
      })
      .onConflictDoUpdate({
        target: productConfigurations.id,
        set: {
          manufacturer: input.manufacturer,
          family: input.family ?? null,
          model: input.model,
          revision: input.revision ?? 1,
          equipmentType: input.equipmentType,
          specs: input.specs,
          sourceRefs: input.sourceRefs,
          trustTier: input.trustTier,
        },
      })
      .returning();
    return row!;
  }

  async recordComplianceFinding(input: {
    requirementSetId: RequirementSetId;
    requirementSetRevision: number;
    requirementId: RequirementId;
    productConfigId: ProductConfigId;
    productConfigRevision: number;
    evaluatorVersion: string;
    result: "PASS" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE";
    mandatory: boolean;
    observed?: Record<string, unknown> | null;
    explanation: string;
    evidenceRefs: unknown[];
    reviewStatus?: string;
  }) {
    const [row] = await this.db
      .insert(complianceFindings)
      .values({
        requirementSetId: input.requirementSetId,
        requirementSetRevision: input.requirementSetRevision,
        requirementId: input.requirementId,
        productConfigId: input.productConfigId,
        productConfigRevision: input.productConfigRevision,
        evaluatorVersion: input.evaluatorVersion,
        result: input.result,
        mandatory: input.mandatory,
        observed: input.observed ?? null,
        explanation: input.explanation,
        evidenceRefs: input.evidenceRefs,
        reviewStatus: input.reviewStatus ?? "UNREVIEWED",
      })
      .returning();
    return row!;
  }

  async createSupplierOffer(input: {
    id: OfferId;
    projectId: ProjectId;
    vendorId: VendorId;
    productConfigId: ProductConfigId;
    revision?: number;
    quantity: number;
    unitPrice?: number | null;
    currency: string;
    quotedArrivalDate?: string | null;
    leadTimeDays?: number | null;
    quotedAt: Date;
    expiresAt: Date;
    evidenceRef: string;
    availabilityStatus?: string | null;
    isSandbox?: boolean;
  }) {
    const [row] = await this.db
      .insert(supplierOffers)
      .values({
        id: input.id,
        projectId: input.projectId,
        vendorId: input.vendorId,
        productConfigId: input.productConfigId,
        revision: input.revision ?? 1,
        quantity: String(input.quantity),
        unitPrice:
          input.unitPrice !== undefined && input.unitPrice !== null
            ? String(input.unitPrice)
            : null,
        currency: input.currency,
        quotedArrivalDate: input.quotedArrivalDate ?? null,
        leadTimeDays: input.leadTimeDays ?? null,
        quotedAt: input.quotedAt,
        expiresAt: input.expiresAt,
        evidenceRef: input.evidenceRef,
        availabilityStatus: input.availabilityStatus ?? null,
        isSandbox: input.isSandbox ?? true,
      })
      .returning();
    return row!;
  }

  async getActiveRequirementSet(packageId: PackageId) {
    const [row] = await this.db
      .select()
      .from(requirementSets)
      .where(
        and(
          eq(requirementSets.packageId, packageId),
          eq(requirementSets.status, "APPROVED"),
        ),
      )
      .orderBy(desc(requirementSets.revision))
      .limit(1);
    return row ?? null;
  }

  async listRequirements(requirementSetId: RequirementSetId) {
    return this.db
      .select()
      .from(requirements)
      .where(eq(requirements.requirementSetId, requirementSetId));
  }

  async getProductConfiguration(id: ProductConfigId) {
    const [row] = await this.db
      .select()
      .from(productConfigurations)
      .where(eq(productConfigurations.id, id))
      .limit(1);
    return row ?? null;
  }
}

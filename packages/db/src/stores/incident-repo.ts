import { and, asc, desc, eq, gt, isNull, lte, ne, sql } from "drizzle-orm";
import {
  IncidentStateMachine,
  type AcceptanceId,
  type ApprovalId,
  type IncidentId,
  type IncidentSeverity,
  type IncidentState,
  type IncidentStatus,
  type InspectionId,
  type MaterialNeedId,
  type PackageId,
  type POLineId,
  type ProjectId,
  type RecoveryActionId,
  type RecoveryPlanId,
  type RevisionSubjectId,
  type TransitionRequest,
  type TransitionResult,
} from "@pactline/domain";
import type { DB } from "../client.js";
import {
  approvals,
  incidentAuditEvents,
  incidents,
  recoveryActions,
  recoveryPlans,
  subjectRevisions,
} from "../schema/incidents.js";
import {
  acceptances,
  fulfillmentAllocations,
  inspections,
  poLines,
  purchaseOrders,
  receipts,
} from "../schema/procurement.js";
import type { ApprovalRole, RevisionPins } from "./gateway-store.js";

export interface CreateIncidentInput {
  id: IncidentId;
  projectId: ProjectId;
  packageId: PackageId;
  materialNeedId: MaterialNeedId;
  poLineId?: POLineId | null;
  triggerEventId?: string | null;
  severity: IncidentSeverity;
  status?: IncidentStatus;
  owner: string;
  nextAction?: string | null;
  blocker?: string | null;
  nextReviewAt: Date;
  requiredQty: number;
  acceptedQty?: number;
  causeHypotheses?: unknown[];
  actor?: string;
}

export interface CreateApprovalInput {
  id: ApprovalId;
  incidentId?: IncidentId | null;
  recoveryPlanId?: RecoveryPlanId | null;
  scope: string;
  subjectId: RevisionSubjectId;
  grantedBy: string;
  grantedRole: ApprovalRole;
  outcome: "GRANTED" | "REJECTED";
  pins?: RevisionPins;
  grantedAt: Date;
  expiresAt: Date;
  evidenceRef?: string | null;
}

export interface BumpRevisionInput {
  subjectId: RevisionSubjectId;
  subjectType: string;
  pins: RevisionPins;
  reason: string;
  now?: Date;
}

export class OptimisticLockError extends Error {
  constructor(incidentId: IncidentId, expectedVersion: number) {
    super(
      `Optimistic lock conflict on incident ${incidentId} (expected version ${expectedVersion})`,
    );
    this.name = "OptimisticLockError";
  }
}

type DrizzleTx = Parameters<Parameters<DB["transaction"]>[0]>[0];

async function getValidWaiver(
  tx: DrizzleTx,
  incidentId: IncidentId,
  approvalId: string,
  now: Date,
) {
  const [waiver] = await tx
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.id, approvalId),
        eq(approvals.incidentId, incidentId),
        eq(approvals.scope, "accept_waiver"),
        eq(approvals.grantedRole, "PROJECT_MANAGER"),
        eq(approvals.outcome, "GRANTED"),
        isNull(approvals.invalidatedAt),
        gt(approvals.expiresAt, now),
      ),
    )
    .for("share");
  return waiver;
}

function subjectRevisionValues(
  input: { subjectId: RevisionSubjectId; subjectType: string; pins: RevisionPins },
  now: Date,
) {
  return {
    subjectId: input.subjectId,
    subjectType: input.subjectType,
    requirementRev: input.pins.requirement_rev ?? null,
    configRev: input.pins.config_rev ?? null,
    offerRev: input.pins.offer_rev ?? null,
    planRev: input.pins.plan_rev ?? null,
    scheduleRev: input.pins.schedule_rev ?? null,
    updatedAt: now,
  };
}

async function writeSubjectRevisions(
  executor: DB | DrizzleTx,
  input: { subjectId: RevisionSubjectId; subjectType: string; pins: RevisionPins },
  now: Date,
) {
  const values = subjectRevisionValues(input, now);
  const [row] = await executor
    .insert(subjectRevisions)
    .values(values)
    .onConflictDoUpdate({
      target: subjectRevisions.subjectId,
      set: {
        subjectType: values.subjectType,
        requirementRev: values.requirementRev,
        configRev: values.configRev,
        offerRev: values.offerRev,
        planRev: values.planRev,
        scheduleRev: values.scheduleRev,
        updatedAt: values.updatedAt,
      },
    })
    .returning();
  return row!;
}

export class IncidentRepo {
  constructor(
    private readonly db: DB,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async createIncident(input: CreateIncidentInput) {
    return this.db.transaction(async (tx) => {
      const status = input.status ?? "DETECTED";
      const [created] = await tx
        .insert(incidents)
        .values({
          id: input.id,
          projectId: input.projectId,
          packageId: input.packageId,
          materialNeedId: input.materialNeedId,
          poLineId: input.poLineId ?? null,
          triggerEventId: input.triggerEventId ?? null,
          severity: input.severity,
          status,
          owner: input.owner,
          nextAction: input.nextAction ?? null,
          blocker: input.blocker ?? null,
          nextReviewAt: input.nextReviewAt,
          requiredQty: String(input.requiredQty),
          acceptedQty: String(input.acceptedQty ?? 0),
          causeHypotheses: input.causeHypotheses ?? [],
        })
        .returning();

      await tx.insert(incidentAuditEvents).values({
        incidentId: created!.id,
        eventType: "INCIDENT_CREATED",
        fromStatus: null,
        toStatus: status,
        actor: input.actor ?? input.owner,
        reason: "Incident opened",
        occurredAt: this.clock(),
      });

      return created!;
    });
  }

  async getIncident(incidentId: IncidentId) {
    const [row] = await this.db
      .select()
      .from(incidents)
      .where(eq(incidents.id, incidentId))
      .limit(1);
    return row ?? null;
  }

  async listIncidentSummaries(projectId?: ProjectId) {
    const baseQuery = this.db
      .select({
        id: incidents.id,
        projectId: incidents.projectId,
        packageId: incidents.packageId,
        materialNeedId: incidents.materialNeedId,
        poLineId: incidents.poLineId,
        severity: incidents.severity,
        status: incidents.status,
        version: incidents.version,
        owner: incidents.owner,
        nextAction: incidents.nextAction,
        blocker: incidents.blocker,
        nextReviewAt: incidents.nextReviewAt,
        requiredQty: incidents.requiredQty,
        acceptedQty: incidents.acceptedQty,
        createdAt: incidents.createdAt,
        updatedAt: incidents.updatedAt,
        closedAt: incidents.closedAt,
      })
      .from(incidents);

    return projectId
      ? baseQuery
          .where(eq(incidents.projectId, projectId))
          .orderBy(desc(incidents.updatedAt))
      : baseQuery.orderBy(desc(incidents.updatedAt));
  }

  async listDueIncidents(now: Date, limit = 20) {
    return this.db
      .select({
        id: incidents.id,
        projectId: incidents.projectId,
        status: incidents.status,
        severity: incidents.severity,
        version: incidents.version,
        owner: incidents.owner,
        nextAction: incidents.nextAction,
        blocker: incidents.blocker,
        nextReviewAt: incidents.nextReviewAt,
      })
      .from(incidents)
      .where(
        and(ne(incidents.status, "CLOSED"), lte(incidents.nextReviewAt, now)),
      )
      .orderBy(asc(incidents.nextReviewAt))
      .limit(limit);
  }

  async getIncidentDetail(incidentId: IncidentId) {
    const incident = await this.getIncident(incidentId);
    if (!incident) return null;

    const [plans, incidentApprovals, audit] = await Promise.all([
      this.db
        .select()
        .from(recoveryPlans)
        .where(eq(recoveryPlans.incidentId, incidentId))
        .orderBy(desc(recoveryPlans.revision)),
      this.db
        .select()
        .from(approvals)
        .where(eq(approvals.incidentId, incidentId))
        .orderBy(desc(approvals.grantedAt)),
      this.db
        .select()
        .from(incidentAuditEvents)
        .where(eq(incidentAuditEvents.incidentId, incidentId))
        .orderBy(asc(incidentAuditEvents.occurredAt)),
    ]);

    return {
      incident,
      recoveryPlans: plans,
      approvals: incidentApprovals,
      auditEvents: audit,
    };
  }

  /**
   * Optimistically transitions an incident via IncidentStateMachine and records an audit event.
   */
  async transitionIncident(
    incidentId: IncidentId,
    request: TransitionRequest,
    now?: Date,
  ): Promise<TransitionResult> {
    const at = now ?? this.clock();
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(incidents)
        .where(eq(incidents.id, incidentId))
        .for("update");

      if (!row) {
        throw new Error(`Incident ${incidentId} not found`);
      }

      const activeApprovals = await tx
        .select()
        .from(approvals)
        .where(
          and(
            eq(approvals.incidentId, incidentId),
            eq(approvals.outcome, "GRANTED"),
            isNull(approvals.invalidatedAt),
          ),
        );

      const hasValidApproval = activeApprovals.some((a) => a.expiresAt > at);
      const approvalExpired =
        activeApprovals.length > 0 && !hasValidApproval;

      const hasValidWaiver =
        request.to === "CLOSED" &&
        row.waiverApprovalId !== null &&
        Boolean(await getValidWaiver(tx, incidentId, row.waiverApprovalId, at));

      const state: IncidentState = {
        id: row.id,
        status: row.status as IncidentStatus,
        version: row.version,
        owner: row.owner,
        next_action: row.nextAction,
        blocker: row.blocker,
        next_review_at: row.nextReviewAt,
        accepted_qty: Number(row.acceptedQty),
        required_qty: Number(row.requiredQty),
        has_valid_waiver: hasValidWaiver,
        has_schedule_disposition: row.scheduleDisposition !== null,
        has_valid_approval: hasValidApproval,
        approval_expired: approvalExpired,
      };

      const result = IncidentStateMachine.transition(state, request);
      if (!result.success || !result.to_status) {
        return result;
      }

      const isClosing = result.to_status === "CLOSED";
      const updated = await tx
        .update(incidents)
        .set({
          status: result.to_status,
          version: sql`${incidents.version} + 1`,
          owner: request.owner ?? row.owner,
          nextAction:
            request.next_action !== undefined
              ? request.next_action
              : isClosing
                ? null
                : row.nextAction,
          blocker:
            request.blocker !== undefined
              ? request.blocker
              : isClosing
                ? null
                : row.blocker,
          nextReviewAt: request.next_review_at ?? row.nextReviewAt,
          updatedAt: at,
          closedAt: isClosing ? at : null,
        })
        .where(
          and(eq(incidents.id, incidentId), eq(incidents.version, row.version)),
        )
        .returning({ id: incidents.id });

      if (updated.length === 0) {
        throw new OptimisticLockError(incidentId, row.version);
      }

      await tx.insert(incidentAuditEvents).values({
        incidentId,
        eventType: "STATUS_TRANSITION",
        fromStatus: result.from_status,
        toStatus: result.to_status,
        actor: request.actor,
        reason: request.reason,
        metadata: request.metadata ?? null,
        occurredAt: at,
      });

      return result;
    });
  }

  /**
   * Records a formal acceptance and atomically increments the incident's accepted_qty.
   */
  async recordAcceptanceForIncident(
    incidentId: IncidentId,
    input: {
      acceptanceId: AcceptanceId;
      inspectionId: InspectionId;
      poLineId: POLineId;
      materialNeedId: MaterialNeedId;
      acceptedQty: number;
      disposition: "ACCEPTED" | "CONDITIONAL" | "REJECTED";
      authorizedBy: string;
      acceptedAt: Date;
      evidenceRef: string;
    },
  ) {
    return this.db.transaction(async (tx) => {
      const [incident] = await tx
        .select()
        .from(incidents)
        .where(eq(incidents.id, incidentId))
        .for("update");

      if (!incident || incident.materialNeedId !== input.materialNeedId) {
        throw new Error(`Acceptance material need does not match incident ${incidentId}`);
      }

      const [inspection] = await tx
        .select({ id: inspections.id })
        .from(inspections)
        .innerJoin(receipts, eq(receipts.id, inspections.receiptId))
        .innerJoin(poLines, eq(poLines.id, inspections.poLineId))
        .innerJoin(purchaseOrders, eq(purchaseOrders.id, poLines.poId))
        .where(
          and(
            eq(inspections.id, input.inspectionId),
            eq(inspections.poLineId, input.poLineId),
            eq(receipts.poLineId, input.poLineId),
            eq(purchaseOrders.projectId, incident.projectId),
          ),
        );

      if (!inspection) {
        throw new Error(`Inspection does not verify PO line ${input.poLineId} for incident ${incidentId}`);
      }

      if (incident.poLineId !== input.poLineId) {
        const [allocation] = await tx
          .select({ id: fulfillmentAllocations.id })
          .from(fulfillmentAllocations)
          .where(
            and(
              eq(fulfillmentAllocations.poLineId, input.poLineId),
              eq(fulfillmentAllocations.materialNeedId, input.materialNeedId),
              eq(fulfillmentAllocations.status, "ACTIVE"),
            ),
          )
          .limit(1);
        if (!allocation) {
          throw new Error(`PO line ${input.poLineId} is not allocated to the need for incident ${incidentId}`);
        }
      }

      const [acc] = await tx
        .insert(acceptances)
        .values({
          id: input.acceptanceId,
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

      if (
        input.disposition === "ACCEPTED" ||
        input.disposition === "CONDITIONAL"
      ) {
        await tx
          .update(incidents)
          .set({
            acceptedQty: sql`${incidents.acceptedQty} + ${acc!.acceptedQty}`,
            updatedAt: input.acceptedAt,
          })
          .where(eq(incidents.id, incidentId));
      }

      await tx.insert(incidentAuditEvents).values({
        incidentId,
        eventType: "ACCEPTANCE_RECORDED",
        actor: input.authorizedBy,
        reason: `Acceptance ${input.acceptanceId} (${input.disposition}, qty=${input.acceptedQty})`,
        metadata: {
          acceptance_id: input.acceptanceId,
          accepted_qty: input.acceptedQty,
          disposition: input.disposition,
        },
        occurredAt: input.acceptedAt,
      });

      return acc!;
    });
  }

  async createRecoveryPlan(input: {
    id: RecoveryPlanId;
    incidentId: IncidentId;
    revision?: number;
    kind: string;
    status: string;
    expectedUsableDate?: string | null;
    costDelta?: number | null;
    currency?: string | null;
    riskSummary?: string | null;
    constraintsChecked?: unknown[];
    completionCriteria?: unknown[];
    evidenceRefs?: unknown[];
    actions?: Array<{
      id: RecoveryActionId;
      seq: number;
      actionType: string;
      description: string;
      subjectId?: string | null;
      dependsOnActionId?: string | null;
      status: string;
      requiredApprovalRole?: string | null;
    }>;
  }) {
    return this.db.transaction(async (tx) => {
      const [plan] = await tx
        .insert(recoveryPlans)
        .values({
          id: input.id,
          incidentId: input.incidentId,
          revision: input.revision ?? 1,
          kind: input.kind,
          status: input.status,
          expectedUsableDate: input.expectedUsableDate ?? null,
          costDelta:
            input.costDelta !== undefined && input.costDelta !== null
              ? String(input.costDelta)
              : null,
          currency: input.currency ?? null,
          riskSummary: input.riskSummary ?? null,
          constraintsChecked: input.constraintsChecked ?? null,
          completionCriteria: input.completionCriteria ?? null,
          evidenceRefs: input.evidenceRefs ?? null,
        })
        .returning();

      if (input.actions && input.actions.length > 0) {
        await tx.insert(recoveryActions).values(
          input.actions.map((a) => ({
            id: a.id,
            recoveryPlanId: plan!.id,
            seq: a.seq,
            actionType: a.actionType,
            description: a.description,
            subjectId: a.subjectId ?? null,
            dependsOnActionId: a.dependsOnActionId ?? null,
            status: a.status,
            requiredApprovalRole: a.requiredApprovalRole ?? null,
          })),
        );
      }

      return plan!;
    });
  }

  async createApproval(input: CreateApprovalInput) {
    const [row] = await this.db
      .insert(approvals)
      .values({
        id: input.id,
        incidentId: input.incidentId ?? null,
        recoveryPlanId: input.recoveryPlanId ?? null,
        scope: input.scope,
        subjectId: input.subjectId,
        grantedBy: input.grantedBy,
        grantedRole: input.grantedRole,
        outcome: input.outcome,
        requirementRev: input.pins?.requirement_rev ?? null,
        configRev: input.pins?.config_rev ?? null,
        offerRev: input.pins?.offer_rev ?? null,
        planRev: input.pins?.plan_rev ?? null,
        scheduleRev: input.pins?.schedule_rev ?? null,
        grantedAt: input.grantedAt,
        expiresAt: input.expiresAt,
        evidenceRef: input.evidenceRef ?? null,
      })
      .returning();
    return row!;
  }

  async upsertSubjectRevisions(input: {
    subjectId: RevisionSubjectId;
    subjectType: string;
    pins: RevisionPins;
    now?: Date;
  }) {
    return writeSubjectRevisions(this.db, input, input.now ?? this.clock());
  }

  /**
   * Invariant 4: Atomically updates subject_revisions and invalidates all active
   * approvals for that subject in one transaction.
   */
  async bumpRevisionAndInvalidateApprovals(input: BumpRevisionInput) {
    const now = input.now ?? this.clock();
    return this.db.transaction(async (tx) => {
      const revisionRow = await writeSubjectRevisions(tx, input, now);

      const invalidated = await tx
        .update(approvals)
        .set({
          invalidatedAt: now,
          invalidationReason: input.reason,
        })
        .where(
          and(
            eq(approvals.subjectId, input.subjectId),
            eq(approvals.outcome, "GRANTED"),
            isNull(approvals.invalidatedAt),
          ),
        )
        .returning({ id: approvals.id });

      return {
        subjectRevisions: revisionRow!,
        invalidatedApprovalIds: invalidated.map((r) => r.id),
      };
    });
  }

  /**
   * Records the waiver and schedule disposition a CLOSED transition is allowed to use.
   * The project manager's waiver must still be valid for this incident.
   */
  async attachWaiver(input: {
    incidentId: IncidentId;
    waiverApprovalId: ApprovalId;
    scheduleDisposition: string;
    expectedVersion: number;
    now?: Date;
  }) {
    const now = input.now ?? this.clock();
    return this.db.transaction(async (tx) => {
      const [incident] = await tx
        .select()
        .from(incidents)
        .where(eq(incidents.id, input.incidentId))
        .for("update");
      if (!incident || incident.version !== input.expectedVersion) {
        throw new OptimisticLockError(input.incidentId, input.expectedVersion);
      }

      const approval = await getValidWaiver(tx, input.incidentId, input.waiverApprovalId, now);
      if (!approval) {
        throw new Error(
          `Waiver approval ${input.waiverApprovalId} is not a live grant for incident ${input.incidentId}`,
        );
      }

      const [updated] = await tx
        .update(incidents)
        .set({
          waiverApprovalId: input.waiverApprovalId,
          scheduleDisposition: input.scheduleDisposition,
          version: sql`${incidents.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(incidents.id, input.incidentId),
            eq(incidents.version, input.expectedVersion),
          ),
        )
        .returning();

      if (!updated) {
        throw new OptimisticLockError(input.incidentId, input.expectedVersion);
      }

      await tx.insert(incidentAuditEvents).values({
        incidentId: input.incidentId,
        eventType: "WAIVER_ATTACHED",
        actor: approval.grantedBy,
        reason: input.scheduleDisposition,
        metadata: { waiver_approval_id: input.waiverApprovalId },
        occurredAt: now,
      });

      return updated;
    });
  }
}

import { and, asc, desc, eq } from "drizzle-orm";
import type { ActivityId, ProjectId, ScheduleRevisionId } from "@pactline/domain";
import type { DB } from "../client.js";
import {
  activities,
  dependencies,
  projects,
  scheduleRevisions,
} from "../schema/schedule.js";

export interface UpsertProjectInput {
  id: ProjectId;
  name: string;
  timezone?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateScheduleRevisionInput {
  id: ScheduleRevisionId;
  projectId: ProjectId;
  revision: number;
  kind: "BASELINE" | "CURRENT" | "SCENARIO";
  startDate: string;
  calendar: Record<string, unknown>;
  constraints?: unknown[];
  effectiveAt?: Date;
  activities: Array<{
    activityId: ActivityId;
    name: string;
    type: string;
    durationWorkdays: number;
    plannedStart?: string | null;
    plannedFinish?: string | null;
    forecastStart?: string | null;
    forecastFinish?: string | null;
    actualStart?: string | null;
    actualFinish?: string | null;
    metadata?: Record<string, unknown>;
  }>;
  dependencies: Array<{
    predecessorId: ActivityId;
    successorId: ActivityId;
    type: "FS" | "SS" | "FF" | "SF";
    lagWorkdays?: number;
  }>;
}

export class ScheduleRepo {
  constructor(
    private readonly db: DB,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async upsertProject(input: UpsertProjectInput) {
    const [row] = await this.db
      .insert(projects)
      .values({
        id: input.id,
        name: input.name,
        timezone: input.timezone ?? "UTC",
        metadata: input.metadata ?? {},
      })
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          name: input.name,
          timezone: input.timezone ?? "UTC",
          metadata: input.metadata ?? {},
          updatedAt: this.clock(),
        },
      })
      .returning();
    return row!;
  }

  async getProject(projectId: ProjectId) {
    const [row] = await this.db
      .select({
        id: projects.id,
        name: projects.name,
        timezone: projects.timezone,
        metadata: projects.metadata,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return row ?? null;
  }

  async createScheduleRevision(input: CreateScheduleRevisionInput) {
    return this.db.transaction(async (tx) => {
      const [rev] = await tx
        .insert(scheduleRevisions)
        .values({
          id: input.id,
          projectId: input.projectId,
          revision: input.revision,
          kind: input.kind,
          startDate: input.startDate,
          calendar: input.calendar,
          constraints: input.constraints ?? [],
          effectiveAt: input.effectiveAt ?? this.clock(),
        })
        .onConflictDoNothing({ target: scheduleRevisions.id })
        .returning();

      if (!rev) {
        const [existing] = await tx
          .select()
          .from(scheduleRevisions)
          .where(eq(scheduleRevisions.id, input.id))
          .limit(1);
        return existing!;
      }

      if (input.activities.length > 0) {
        await tx.insert(activities).values(
          input.activities.map((a) => ({
            scheduleRevisionId: rev.id,
            activityId: a.activityId,
            name: a.name,
            type: a.type,
            durationWorkdays: a.durationWorkdays,
            plannedStart: a.plannedStart ?? null,
            plannedFinish: a.plannedFinish ?? null,
            forecastStart: a.forecastStart ?? null,
            forecastFinish: a.forecastFinish ?? null,
            actualStart: a.actualStart ?? null,
            actualFinish: a.actualFinish ?? null,
            metadata: a.metadata ?? {},
          })),
        );
      }

      if (input.dependencies.length > 0) {
        await tx.insert(dependencies).values(
          input.dependencies.map((d) => ({
            scheduleRevisionId: rev.id,
            predecessorId: d.predecessorId,
            successorId: d.successorId,
            type: d.type,
            lagWorkdays: d.lagWorkdays ?? 0,
          })),
        );
      }

      return rev;
    });
  }

  async getScheduleRevision(
    projectId: ProjectId,
    kind: "BASELINE" | "CURRENT" | "SCENARIO",
  ) {
    const [rev] = await this.db
      .select()
      .from(scheduleRevisions)
      .where(
        and(
          eq(scheduleRevisions.projectId, projectId),
          eq(scheduleRevisions.kind, kind),
        ),
      )
      .orderBy(desc(scheduleRevisions.revision))
      .limit(1);
    return rev ?? null;
  }

  async listActivities(scheduleRevisionId: ScheduleRevisionId) {
    return this.db
      .select()
      .from(activities)
      .where(eq(activities.scheduleRevisionId, scheduleRevisionId))
      .orderBy(asc(activities.activityId));
  }

  async listDependencies(scheduleRevisionId: ScheduleRevisionId) {
    return this.db
      .select()
      .from(dependencies)
      .where(eq(dependencies.scheduleRevisionId, scheduleRevisionId));
  }
}

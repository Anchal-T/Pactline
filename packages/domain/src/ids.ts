// Branded ID types — prevents mixing ProjectId with IncidentId at compile time
export type ProjectId = string & { readonly _brand: "ProjectId" };
export type ScheduleRevisionId = string & { readonly _brand: "ScheduleRevisionId" };
export type ActivityId = string & { readonly _brand: "ActivityId" };
export type PackageId = string & { readonly _brand: "PackageId" };
export type MaterialNeedId = string & { readonly _brand: "MaterialNeedId" };
export type VendorId = string & { readonly _brand: "VendorId" };
export type PurchaseOrderId = string & { readonly _brand: "PurchaseOrderId" };
export type POLineId = string & { readonly _brand: "POLineId" };
export type AllocationId = string & { readonly _brand: "AllocationId" };
export type MilestoneId = string & { readonly _brand: "MilestoneId" };
export type ReceiptId = string & { readonly _brand: "ReceiptId" };
export type InspectionId = string & { readonly _brand: "InspectionId" };
export type AcceptanceId = string & { readonly _brand: "AcceptanceId" };
export type EvidenceSourceId = string & { readonly _brand: "EvidenceSourceId" };
export type IncidentId = string & { readonly _brand: "IncidentId" };
export type RequirementSetId = string & { readonly _brand: "RequirementSetId" };
export type RequirementId = string & { readonly _brand: "RequirementId" };
export type ProductConfigId = string & { readonly _brand: "ProductConfigId" };
export type ApprovalId = string & { readonly _brand: "ApprovalId" };
export type RecoveryPlanId = string & { readonly _brand: "RecoveryPlanId" };
export type RecoveryActionId = string & { readonly _brand: "RecoveryActionId" };
export type ActionReceiptId = string & { readonly _brand: "ActionReceiptId" };
export type TaskId = string & { readonly _brand: "TaskId" };
export type OfferId = string & { readonly _brand: "OfferId" };

/** A row whose current revisions an approval can pin. */
export type RevisionSubjectId = POLineId | PackageId | ProductConfigId | OfferId | RequirementSetId | RecoveryPlanId;

/** Brand a raw fixture or test string at the boundary. The callee's parameter type checks the brand. */
export function asId<T extends string>(value: string): T {
  return value as T;
}

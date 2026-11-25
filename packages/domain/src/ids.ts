// Branded ID types — prevents mixing ProjectId with IncidentId at compile time
export type ProjectId = string & { readonly _brand: "ProjectId" };
export type ActivityId = string & { readonly _brand: "ActivityId" };
export type PackageId = string & { readonly _brand: "PackageId" };
export type POLineId = string & { readonly _brand: "POLineId" };
export type IncidentId = string & { readonly _brand: "IncidentId" };
export type RequirementSetId = string & { readonly _brand: "RequirementSetId" };
export type ProductConfigId = string & { readonly _brand: "ProductConfigId" };
export type ApprovalId = string & { readonly _brand: "ApprovalId" };
export type ActionReceiptId = string & { readonly _brand: "ActionReceiptId" };
export type TaskId = string & { readonly _brand: "TaskId" };
export type OfferId = string & { readonly _brand: "OfferId" };

import type { Metadata } from "next";
import { Screen } from "@/components/app/screen";
import { APP_ROUTES } from "@/lib/nav";

export const metadata: Metadata = { title: "Incident" };

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const route = { ...APP_ROUTES[0]!, endpoint: "GET /api/incidents/{id}", summary: "The full lifecycle of one incident: events, delegations, findings, approvals and actions, each with its source." };
  return <Screen route={route} title={`Incident ${decodeURIComponent(id)}`} />;
}

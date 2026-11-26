import type { Metadata } from "next";
import { Screen } from "@/components/app/screen";
import { APP_ROUTES } from "@/lib/nav";

export const metadata: Metadata = { title: "Agent log" };

export default function AgentLogPage() {
  return <Screen route={APP_ROUTES[4]!} />;
}

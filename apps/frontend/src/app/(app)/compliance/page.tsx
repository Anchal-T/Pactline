import type { Metadata } from "next";
import { Screen } from "@/components/app/screen";
import { APP_ROUTES } from "@/lib/nav";

export const metadata: Metadata = { title: "Compliance" };

export default function CompliancePage() {
  return <Screen route={APP_ROUTES[2]!} />;
}

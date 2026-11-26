import type { Metadata } from "next";
import { Screen } from "@/components/app/screen";
import { APP_ROUTES } from "@/lib/nav";

export const metadata: Metadata = { title: "Schedule" };

export default function SchedulePage() {
  return <Screen route={APP_ROUTES[1]!} />;
}

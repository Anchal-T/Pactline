import { CalendarDots, ListChecks, Ruler, SealCheck, SquaresFour } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

export interface AppRoute {
  href: string;
  label: string;
  icon: Icon;
  /** The read endpoint the screen is built on, shown in its empty state until it is wired. */
  endpoint: string;
  summary: string;
}

export const APP_ROUTES: AppRoute[] = [
  { href: "/dashboard", label: "Dashboard", icon: SquaresFour, endpoint: "GET /api/incidents", summary: "Every open and closed incident, ranked by how close it is to the required-on-site date." },
  { href: "/schedule", label: "Schedule", icon: CalendarDots, endpoint: "GET /api/schedule/impact/{incident_id}", summary: "How a late delivery moves activities, float and the critical path." },
  { href: "/compliance", label: "Compliance", icon: Ruler, endpoint: "GET /api/compliance/{package_id}", summary: "Each requirement against each candidate product, with its evidence." },
  { href: "/approvals", label: "Approvals", icon: SealCheck, endpoint: "GET /api/approvals", summary: "Plans waiting for a named person to approve an exact revision." },
  { href: "/agent-log", label: "Agent log", icon: ListChecks, endpoint: "GET /api/agents/activity", summary: "Every action the operator took and every specialist it called." },
];

export function crumbsFor(pathname: string): Array<{ label: string; href?: string }> {
  const incident = pathname.match(/^\/incidents\/([^/]+)/);
  if (incident) return [{ label: "Dashboard", href: "/dashboard" }, { label: `Incident ${decodeURIComponent(incident[1]!)}` }];
  const route = APP_ROUTES.find((r) => pathname === r.href || pathname.startsWith(`${r.href}/`));
  return [{ label: route?.label ?? "App" }];
}

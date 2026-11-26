import Link from "next/link";
import { Logo } from "@/components/site/logo";

const COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string; external?: boolean }> }> = [
  {
    title: "Product",
    links: [
      { label: "How it decides", href: "/#decide" },
      { label: "How it works", href: "/#loop" },
      { label: "Specialists", href: "/#specialists" },
      { label: "Incident", href: "/#incident" },
      { label: "Safeguards", href: "/#safeguards" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Create account", href: "/signup" },
    ],
  },
  {
    title: "Project",
    links: [{ label: "Kaya AI Grand Challenge", href: "https://kaya-ai-grand-challenge.devpost.com/", external: true }],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1180px] grid-cols-2 gap-x-6 gap-y-10 px-5 py-14 sm:px-6 md:grid-cols-12 md:gap-8 md:py-16">
        <div className="col-span-2 md:col-span-5">
          <Logo />
          <p className="mt-5 max-w-[22rem] text-[0.9375rem] leading-relaxed text-ink-3">
            Procurement continuity for construction. Built for Track 03, Vertical Agents.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title} className="md:col-span-2">
            <h2 className="t-label">{c.title}</h2>
            <ul className="mt-4 grid gap-2.5">
              {c.links.map((l) => (
                <li key={l.label}>
                  {l.external ? (
                    <a href={l.href} target="_blank" rel="noreferrer" className="text-[0.9375rem] text-ink-2 transition-colors duration-200 hover:text-ink">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="text-[0.9375rem] text-ink-2 transition-colors duration-200 hover:text-ink">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto flex max-w-[1180px] flex-col gap-2 border-t border-line px-5 py-6 pb-24 sm:px-6 sm:pb-6 text-[0.8125rem] text-ink-3 sm:flex-row sm:justify-between">
        <p>Sandbox data on this site is synthetic and labeled where it appears.</p>
        <p>&copy; 2026 Pactline</p>
      </div>
    </footer>
  );
}

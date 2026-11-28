import { PumpSketch } from "@/components/art/pump-sketch";
import { Logo } from "@/components/site/logo";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { AuthCrumbs, AuthSwitch } from "@/components/auth/auth-nav";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] gap-3 p-3 sm:p-4 lg:grid-cols-12">
      <aside className="relative hidden overflow-hidden rounded-[var(--radius-xl)] bg-surface ring-1 ring-line ring-inset lg:col-span-6 lg:block xl:col-span-7">
        <PumpSketch plate="var(--surface)" className="absolute inset-0" />
        <div className="relative flex flex-col gap-10 p-10 xl:p-12">
          <Logo />
          <div className="grid gap-6">
          <span className="gold-rule" aria-hidden />
          <p className="font-display max-w-[19ch] text-[clamp(2rem,1.2rem+1.6vw,2.9rem)] leading-[1.08] tracking-[-0.02em] text-ink">
            Every open incident has an <em className="gold-word">owner</em>, a next step and a review date
          </p>
          </div>
        </div>
      </aside>

      <main className="flex flex-col px-3 py-4 sm:px-8 lg:col-span-6 lg:px-12 xl:col-span-5 xl:px-16">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Logo className="lg:hidden" />
            <AuthCrumbs />
          </div>
          <ThemeToggle />
        </header>

        <div className="mx-auto flex w-full max-w-[25rem] flex-1 flex-col justify-center py-14">
          <AuthSwitch />
          {children}
        </div>

        <p className="text-center text-[0.8125rem] text-ink-3">Hackathon preview. Authentication is not connected yet.</p>
      </main>
    </div>
  );
}

import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Button, ButtonIcon } from "@/components/ui/button";
import { ConstructionArt } from "@/components/art/construction-art";
import { RequestAccess } from "@/components/site/request-access";
import { HeroConsole } from "@/components/landing/hero-console";

const rise = "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:fill-mode-both motion-safe:duration-1000 motion-safe:ease-out-strong";

export function Hero() {
  return (
    <section className="relative isolate flex flex-col overflow-hidden">
      <div className="relative z-10 mx-auto grid w-full max-w-[1180px] gap-10 px-5 pt-28 sm:px-6 sm:pt-32 lg:grid-cols-[1fr_22rem] lg:pt-28">
        <div>
          <h1 className={`t-display max-w-[46rem] text-ink lg:text-[clamp(3.4rem,1.9rem+2.9vw,4.4rem)] ${rise}`}>
            Long-lead equipment, on site when the crew needs it
          </h1>
          <p className={`t-lead mt-5 max-w-[30rem] motion-safe:delay-150 ${rise}`}>
            Pactline watches schedules, purchase orders and vendor promises for procurement teams, then runs every slipping delivery through to verified receipt.
          </p>
          <div className={`mt-8 flex flex-wrap items-center gap-2.5 sm:gap-3 motion-safe:delay-300 ${rise}`}>
            <RequestAccess>
              <Button size="lg" className="max-sm:h-11 max-sm:px-5 max-sm:text-[0.9375rem]">
                Request access
                <ButtonIcon>
                  <ArrowRight size={15} weight="bold" />
                </ButtonIcon>
              </Button>
            </RequestAccess>
            <Button asChild variant="secondary" size="lg" className="max-sm:h-11 max-sm:px-5 max-sm:text-[0.9375rem]">
              <Link href="#decide">Watch it decide</Link>
            </Button>
          </div>
        </div>
        <div className={`hidden pt-2 lg:block motion-safe:delay-500 ${rise}`}>
          <HeroConsole />
        </div>
      </div>

      <ConstructionArt
        scene="hero"
        parallax
        hookTravel={30}
        className="relative z-0 -mt-6 aspect-[16/7] min-h-[300px] w-full sm:-mt-16 lg:-mt-[16.5rem]"
      />
    </section>
  );
}

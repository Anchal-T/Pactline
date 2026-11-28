"use client";

import { useRef } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { Button, ButtonIcon } from "@/components/ui/button";
import { ConstructionArt } from "@/components/art/construction-art";
import { RequestAccess } from "@/components/site/request-access";
import { useReveal } from "@/lib/use-reveal";

export function Closing() {
  const root = useRef<HTMLElement>(null);
  useReveal(root);

  return (
    <section ref={root} id="access" className="relative overflow-hidden pt-12 sm:pt-16 lg:pt-20">
      <div className="mx-auto flex max-w-[1180px] flex-col items-center px-5 text-center sm:px-6">
        <h2 className="t-h2 max-w-[18ch] text-ink" data-reveal>
          Bring <em className="gold-word">{"Pactline"}</em> your next late delivery
        </h2>
        <p className="t-lead mt-6 max-w-[32rem]" data-reveal>
          The first pilot covers chilled-water pump packages on commercial HVAC projects.
        </p>
        <div className="mt-10" data-reveal>
          <RequestAccess>
            <Button size="lg" variant="gold">
              Request access
              <ButtonIcon>
                <ArrowRight size={15} weight="bold" />
              </ButtonIcon>
            </Button>
          </RequestAccess>
        </div>
      </div>
      <ConstructionArt scene="strip" fit="slice-center" className="mt-12 aspect-[16/3] min-h-[180px] w-full sm:mt-16" />
    </section>
  );
}

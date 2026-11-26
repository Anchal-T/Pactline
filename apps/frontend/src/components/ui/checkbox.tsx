"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer grid size-5 shrink-0 place-items-center rounded-[0.4rem] bg-surface ring-1 ring-input ring-inset outline-none transition-[background-color,box-shadow] duration-200",
        "focus-visible:ring-2 focus-visible:ring-brand data-[state=checked]:bg-brand data-[state=checked]:ring-brand aria-invalid:ring-fail",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="text-brand-ink data-[state=checked]:animate-in data-[state=checked]:zoom-in-90 data-[state=checked]:duration-150">
        <Check size={13} weight="bold" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };

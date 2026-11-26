import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-[var(--radius-md)] bg-surface px-4 text-[0.9375rem] text-ink ring-1 ring-input ring-inset outline-none transition-[box-shadow,background-color] duration-200 placeholder:text-ink-3/80",
        "hover:ring-line-strong focus-visible:ring-2 focus-visible:ring-brand",
        "aria-invalid:ring-fail aria-invalid:focus-visible:ring-fail",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };

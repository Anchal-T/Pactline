import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium outline-none select-none transition-[background-color,color,box-shadow,scale] duration-200 ease-out-strong active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_10px_24px_-14px_var(--brand)] hover:bg-brand-hover",
        secondary: "bg-transparent text-ink ring-1 ring-line-strong ring-inset hover:bg-brand-soft",
        ghost: "bg-transparent text-ink-2 hover:bg-brand-soft hover:text-ink",
        link: "h-auto rounded-sm px-0 text-ink underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-[0.9375rem]",
        lg: "h-12 pl-6 pr-6 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

/** Trailing icon nested in its own circle, flush with the button's inner edge. */
function ButtonIcon({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "-mr-3 ml-1 grid size-8 place-items-center rounded-full bg-black/10 transition-transform duration-300 ease-out-strong group-hover/button:translate-x-0.5 dark:bg-black/15",
        className,
      )}
    >
      {children}
    </span>
  );
}

export { Button, ButtonIcon, buttonVariants };

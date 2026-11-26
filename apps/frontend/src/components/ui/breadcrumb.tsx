import * as React from "react";
import { Slot } from "radix-ui";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

function Breadcrumb(props: React.ComponentProps<"nav">) {
  return <nav aria-label="Breadcrumb" data-slot="breadcrumb" {...props} />;
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return <ol data-slot="breadcrumb-list" className={cn("flex flex-wrap items-center gap-1.5 text-sm text-ink-3", className)} {...props} />;
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="breadcrumb-item" className={cn("inline-flex items-center gap-1.5", className)} {...props} />;
}

function BreadcrumbLink({ asChild, className, ...props }: React.ComponentProps<"a"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "a";
  return <Comp data-slot="breadcrumb-link" className={cn("transition-colors duration-200 hover:text-ink", className)} {...props} />;
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="breadcrumb-page" role="link" aria-disabled="true" aria-current="page" className={cn("text-ink", className)} {...props} />;
}

function BreadcrumbSeparator({ children, className, ...props }: React.ComponentProps<"li">) {
  return (
    <li data-slot="breadcrumb-separator" role="presentation" aria-hidden="true" className={cn("opacity-60", className)} {...props}>
      {children ?? <CaretRight size={11} weight="bold" />}
    </li>
  );
}

export { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator };

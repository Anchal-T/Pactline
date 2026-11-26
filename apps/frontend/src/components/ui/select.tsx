"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { CaretDown, Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-12 w-full items-center justify-between gap-2 rounded-[var(--radius-md)] bg-surface px-4 text-left text-[0.9375rem] text-ink ring-1 ring-input ring-inset outline-none transition-[box-shadow,background-color] duration-200",
        "hover:ring-line-strong focus-visible:ring-2 focus-visible:ring-brand data-[placeholder]:text-ink-3/80 aria-invalid:ring-fail",
        "[&>span]:truncate",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <CaretDown size={14} weight="bold" className="shrink-0 text-ink-3 transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({ className, children, position = "popper", ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        sideOffset={6}
        data-lenis-prevent
        className={cn(
          "relative z-[60] max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] origin-[var(--radix-select-content-transform-origin)] overflow-hidden rounded-[var(--radius-md)] bg-surface p-1 text-ink shadow-[0_18px_50px_-24px_rgb(15_58_43/0.45)] ring-1 ring-line-strong ring-inset dark:shadow-[0_18px_50px_-20px_rgb(0_0_0/0.75)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-97 data-[state=open]:duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-100",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="w-full">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center rounded-[calc(var(--radius-md)-0.25rem)] py-2.5 pr-9 pl-3 text-[0.9375rem] outline-none select-none data-[highlighted]:bg-brand-soft data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-3 grid size-4 place-items-center text-brand">
        <SelectPrimitive.ItemIndicator>
          <Check size={14} weight="bold" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };

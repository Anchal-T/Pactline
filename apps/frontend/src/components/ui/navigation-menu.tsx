"use client";

import * as React from "react";
import { NavigationMenu as NavigationMenuPrimitive } from "radix-ui";
import { CaretDown } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

function NavigationMenu({ className, children, ...props }: React.ComponentProps<typeof NavigationMenuPrimitive.Root>) {
  return (
    <NavigationMenuPrimitive.Root data-slot="navigation-menu" className={cn("relative flex items-center", className)} {...props}>
      {children}
      <div className="absolute top-full left-1/2 flex -translate-x-1/2 justify-center pt-3">
        <NavigationMenuPrimitive.Viewport
          className={cn(
            "glass glass-dense relative h-[var(--radix-navigation-menu-viewport-height)] w-[var(--radix-navigation-menu-viewport-width)] origin-top overflow-hidden rounded-[var(--radius-lg)] transition-[width,height] duration-300 ease-out-strong",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-97 data-[state=open]:duration-200",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 data-[state=closed]:duration-150",
          )}
        />
      </div>
    </NavigationMenuPrimitive.Root>
  );
}

function NavigationMenuList({ className, ...props }: React.ComponentProps<typeof NavigationMenuPrimitive.List>) {
  return <NavigationMenuPrimitive.List data-slot="navigation-menu-list" className={cn("flex items-center gap-0.5", className)} {...props} />;
}

function NavigationMenuItem(props: React.ComponentProps<typeof NavigationMenuPrimitive.Item>) {
  return <NavigationMenuPrimitive.Item data-slot="navigation-menu-item" {...props} />;
}

const triggerClass =
  "inline-flex h-9 items-center gap-1 rounded-full px-3.5 text-sm font-medium text-ink-2 outline-none transition-colors duration-200 hover:bg-brand-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-brand-soft data-[state=open]:text-ink";

function NavigationMenuTrigger({ className, children, ...props }: React.ComponentProps<typeof NavigationMenuPrimitive.Trigger>) {
  return (
    <NavigationMenuPrimitive.Trigger data-slot="navigation-menu-trigger" className={cn(triggerClass, "group", className)} {...props}>
      {children}
      <CaretDown size={12} weight="bold" className="opacity-60 transition-transform duration-300 ease-out-strong group-data-[state=open]:rotate-180" aria-hidden />
    </NavigationMenuPrimitive.Trigger>
  );
}

function NavigationMenuContent({ className, ...props }: React.ComponentProps<typeof NavigationMenuPrimitive.Content>) {
  return (
    <NavigationMenuPrimitive.Content
      data-slot="navigation-menu-content"
      className={cn(
        "top-0 left-0 w-full",
        "data-[motion^=from-]:animate-in data-[motion^=from-]:fade-in data-[motion^=to-]:animate-out data-[motion^=to-]:fade-out",
        "data-[motion=from-end]:slide-in-from-right-8 data-[motion=from-start]:slide-in-from-left-8 data-[motion=to-end]:slide-out-to-right-8 data-[motion=to-start]:slide-out-to-left-8",
        "md:absolute md:w-auto",
        className,
      )}
      {...props}
    />
  );
}

function NavigationMenuLink({ className, ...props }: React.ComponentProps<typeof NavigationMenuPrimitive.Link>) {
  return <NavigationMenuPrimitive.Link data-slot="navigation-menu-link" className={cn("outline-none", className)} {...props} />;
}

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  triggerClass as navigationMenuTriggerClass,
};

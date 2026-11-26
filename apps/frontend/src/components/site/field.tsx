"use client";

import type { ComponentProps, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldProps extends Omit<ComponentProps<"input">, "onChange" | "value"> {
  id: string;
  label: string;
  value: string;
  error?: string;
  hint?: string;
  aside?: ReactNode;
  trailing?: ReactNode;
  onChange: (value: string) => void;
}

/** Label above, helper or error below, never placeholder-as-label. */
export function Field({ id, label, value, error, hint, aside, trailing, onChange, className, ...props }: FieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <Label htmlFor={id}>{label}</Label>
        {aside}
      </div>
      <div className="relative">
        <Input
          id={id}
          value={value}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={trailing ? "pr-12" : undefined}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-[0.8125rem] text-fail animate-in fade-in-0 slide-in-from-top-1 duration-200">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[0.8125rem] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

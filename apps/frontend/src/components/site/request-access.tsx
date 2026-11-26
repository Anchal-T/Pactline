"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";
import { ArrowRight } from "@phosphor-icons/react";
import { Button, ButtonIcon } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/site/field";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ROLES = ["Procurement", "Expediting", "Engineering", "Project controls"] as const;

const schema = z.object({
  name: z.string().trim().min(2, "Enter your full name"),
  email: z.string().trim().email("Use a valid work email"),
  company: z.string().trim().min(2, "Enter your company"),
  role: z.enum(ROLES, { message: "Choose the role closest to yours" }),
});

type Values = Partial<Record<keyof z.infer<typeof schema>, string>>;
type Errors = Partial<Record<keyof z.infer<typeof schema>, string>>;

export function RequestAccess({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Errors>({});
  const [sentTo, setSentTo] = useState<string | null>(null);

  const set = (key: keyof Values) => (value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const check = (key: keyof Values) => {
    const result = schema.shape[key].safeParse(values[key] ?? "");
    setErrors((e) => ({ ...e, [key]: result.success ? undefined : result.error.issues[0]?.message }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = schema.safeParse({ name: "", email: "", company: "", ...values });
    if (!result.success) {
      const next: Errors = {};
      for (const issue of result.error.issues) next[issue.path[0] as keyof Errors] ??= issue.message;
      setErrors(next);
      return;
    }
    setSentTo(result.data.name.split(" ")[0] ?? result.data.name);
  };

  const reset = (open: boolean) => {
    if (open) return;
    window.setTimeout(() => {
      setSentTo(null);
      setValues({});
      setErrors({});
    }, 200);
  };

  return (
    <Dialog onOpenChange={reset}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        {sentTo ? (
          <div className="grid gap-6 py-2">
            <DialogHeader>
              <DialogTitle>Thanks, {sentTo}</DialogTitle>
              <DialogDescription>
                Pactline is a hackathon preview, so this form does not send anything yet. Your details stayed in this browser tab.
              </DialogDescription>
            </DialogHeader>
          </div>
        ) : (
          <form noValidate onSubmit={submit} className="grid gap-6">
            <DialogHeader>
              <DialogTitle>Request access</DialogTitle>
              <DialogDescription>The first pilot covers chilled-water pump packages on commercial HVAC projects.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <Field id="ra-name" label="Full name" autoComplete="name" value={values.name ?? ""} error={errors.name} onChange={set("name")} onBlur={() => check("name")} />
              <Field id="ra-email" label="Work email" type="email" autoComplete="email" value={values.email ?? ""} error={errors.email} onChange={set("email")} onBlur={() => check("email")} />
              <Field id="ra-company" label="Company" autoComplete="organization" value={values.company ?? ""} error={errors.company} onChange={set("company")} onBlur={() => check("company")} />

              <div className="grid gap-2">
                <Label htmlFor="ra-role">Your role</Label>
                <Select value={values.role ?? ""} onValueChange={set("role")}>
                  <SelectTrigger id="ra-role" aria-invalid={!!errors.role} aria-describedby={errors.role ? "ra-role-error" : undefined}>
                    <SelectValue placeholder="Choose the closest match" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.role && (
                  <p id="ra-role-error" className="text-[0.8125rem] text-fail">
                    {errors.role}
                  </p>
                )}
              </div>
            </div>

            <Button type="submit" size="lg" className="justify-between">
              Send request
              <ButtonIcon>
                <ArrowRight size={15} weight="bold" />
              </ButtonIcon>
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

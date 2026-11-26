"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { z } from "zod";
import { ArrowRight, Check, Eye, EyeSlash, GoogleLogo, Info, WindowsLogo } from "@phosphor-icons/react";
import { Button, ButtonIcon } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/site/field";
import { cn } from "@/lib/utils";

type Errors<K extends string> = Partial<Record<K, string>>;

function collect<K extends string>(issues: z.ZodIssue[]): Errors<K> {
  const out: Errors<K> = {};
  for (const issue of issues) {
    const key = issue.path[0] as K;
    out[key] ??= issue.message;
  }
  return out;
}

function Heading({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-9 grid gap-3">
      <h1 className="font-display text-[2.6rem] leading-[1.04] font-normal tracking-[-0.022em] text-ink">{title}</h1>
      <p className="t-body text-[0.9688rem]">{body}</p>
    </div>
  );
}

function SsoButtons({ verb, onPick }: { verb: string; onPick: (provider: string) => void }) {
  return (
    <div className="grid gap-2.5">
      <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => onPick("Microsoft")}>
        <WindowsLogo size={17} weight="light" />
        {verb} with Microsoft
      </Button>
      <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => onPick("Google")}>
        <GoogleLogo size={17} weight="light" />
        {verb} with Google
      </Button>
      <div className="my-5 flex items-center gap-4 text-[0.8125rem] text-ink-3">
        <span className="h-px flex-1 bg-line-strong" />
        or use your work email
        <span className="h-px flex-1 bg-line-strong" />
      </div>
    </div>
  );
}

function RevealToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? "Hide password" : "Show password"}
      aria-pressed={shown}
      className="press grid size-9 place-items-center rounded-full text-ink-3 outline-none hover:bg-brand-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
    >
      {shown ? <EyeSlash size={17} weight="light" /> : <Eye size={17} weight="light" />}
    </button>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-3 rounded-[var(--radius-md)] bg-brand-soft px-4 py-3.5 text-[0.875rem] leading-snug text-ink-2 animate-in fade-in-0 slide-in-from-top-1 duration-300">
      <Info size={17} weight="light" className="mt-px shrink-0 text-brand" />
      <span>{children}</span>
    </p>
  );
}

function Submit({ label }: { label: string }) {
  return (
    <Button type="submit" size="lg" className="w-full justify-between">
      {label}
      <ButtonIcon>
        <ArrowRight size={15} weight="bold" />
      </ButtonIcon>
    </Button>
  );
}

/* ------------------------------------------------------------------ */

const loginSchema = z.object({
  email: z.string().trim().email("Use a valid work email"),
  password: z.string().min(1, "Enter your password"),
});
type LoginKey = keyof z.infer<typeof loginSchema>;

export function LoginForm() {
  const [values, setValues] = useState<Record<LoginKey, string>>({ email: "", password: "" });
  const [errors, setErrors] = useState<Errors<LoginKey>>({});
  const [shown, setShown] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const set = (k: LoginKey) => (v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const check = (k: LoginKey) => {
    const r = loginSchema.shape[k].safeParse(values[k]);
    setErrors((e) => ({ ...e, [k]: r.success ? undefined : r.error.issues[0]?.message }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = loginSchema.safeParse(values);
    if (!r.success) {
      setErrors(collect<LoginKey>(r.error.issues));
      setNotice(null);
      return;
    }
    setNotice("Sign-in is not connected in this preview. It ships with the operator dashboard.");
  };

  return (
    <>
      <Heading title="Sign in to Pactline" body="Pick up open incidents where the operator left them." />
      <SsoButtons verb="Continue" onPick={(p) => setNotice(`${p} single sign-on is not connected in this preview.`)} />
      <form noValidate onSubmit={submit} className="grid gap-5">
        <Field id="login-email" label="Work email" type="email" autoComplete="email" value={values.email} error={errors.email} onChange={set("email")} onBlur={() => check("email")} />
        <Field
          id="login-password"
          label="Password"
          type={shown ? "text" : "password"}
          autoComplete="current-password"
          value={values.password}
          error={errors.password}
          onChange={set("password")}
          onBlur={() => check("password")}
          aside={
            <button type="button" onClick={() => setNotice("Password reset arrives with the auth service.")} className="text-[0.8125rem] text-ink-3 underline-offset-4 transition-colors duration-200 hover:text-ink hover:underline">
              Forgot password?
            </button>
          }
          trailing={<RevealToggle shown={shown} onToggle={() => setShown((s) => !s)} />}
        />
        <div className="flex items-center gap-3">
          <Checkbox id="login-remember" defaultChecked />
          <Label htmlFor="login-remember" className="font-normal text-ink-2">
            Keep me signed in on this device
          </Label>
        </div>
        {notice && <Notice>{notice}</Notice>}
        <Submit label="Sign in" />
      </form>
      <p className="mt-8 text-center text-[0.875rem] text-ink-3">
        New to Pactline?{" "}
        <Link href="/signup" className="text-ink underline decoration-line-strong underline-offset-4 transition-colors duration-200 hover:decoration-ink">
          Create an account
        </Link>
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */

const ROLES = ["Procurement", "Expediting", "Engineering", "Project controls"] as const;

const RULES = [
  { label: "At least 12 characters", test: (p: string) => p.length >= 12 },
  { label: "A number", test: (p: string) => /\d/.test(p) },
  { label: "A symbol", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name"),
  email: z.string().trim().email("Use a valid work email"),
  company: z.string().trim().min(2, "Enter your company"),
  role: z.enum(ROLES, { message: "Choose the role closest to yours" }),
  password: z.string().refine((p) => RULES.every((r) => r.test(p)), "Meet all three password rules"),
  ack: z.literal(true, { message: "Confirm you understand this is a preview" }),
});
type SignupKey = keyof z.infer<typeof signupSchema>;
type TextKey = Exclude<SignupKey, "role" | "ack">;

export function SignupForm() {
  const [values, setValues] = useState<Record<TextKey, string>>({ name: "", email: "", company: "", password: "" });
  const [role, setRole] = useState<string>("");
  const [ack, setAck] = useState(false);
  const [errors, setErrors] = useState<Errors<SignupKey>>({});
  const [shown, setShown] = useState(false);
  const [pwFocus, setPwFocus] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const clear = (k: SignupKey) => errors[k] && setErrors((e) => ({ ...e, [k]: undefined }));
  const set = (k: TextKey) => (v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    clear(k);
  };
  const check = (k: TextKey) => {
    const r = signupSchema.shape[k].safeParse(values[k]);
    setErrors((e) => ({ ...e, [k]: r.success ? undefined : r.error.issues[0]?.message }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = signupSchema.safeParse({ ...values, role: role || undefined, ack });
    if (!r.success) {
      setErrors(collect<SignupKey>(r.error.issues));
      setNotice(null);
      return;
    }
    setNotice(`Thanks, ${r.data.name.split(" ")[0]}. Accounts are not created in this preview, so nothing was stored.`);
  };

  return (
    <>
      <Heading title="Create your account" body="Set up a workspace for your project's long-lead equipment packages." />
      <SsoButtons verb="Sign up" onPick={(p) => setNotice(`${p} single sign-on is not connected in this preview.`)} />
      <form noValidate onSubmit={submit} className="grid gap-5">
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
          <Field id="su-name" label="Full name" autoComplete="name" value={values.name} error={errors.name} onChange={set("name")} onBlur={() => check("name")} />
          <Field id="su-company" label="Company" autoComplete="organization" value={values.company} error={errors.company} onChange={set("company")} onBlur={() => check("company")} />
        </div>
        <Field id="su-email" label="Work email" type="email" autoComplete="email" value={values.email} error={errors.email} onChange={set("email")} onBlur={() => check("email")} />

        <div className="grid gap-2">
          <Label htmlFor="su-role">Your role</Label>
          <Select
            value={role}
            onValueChange={(v) => {
              setRole(v);
              clear("role");
            }}
          >
            <SelectTrigger id="su-role" aria-invalid={!!errors.role} aria-describedby={errors.role ? "su-role-error" : undefined}>
              <SelectValue placeholder="Choose the closest match" />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.role && (
            <p id="su-role-error" className="text-[0.8125rem] text-fail">
              {errors.role}
            </p>
          )}
        </div>

        <div className="relative" onFocus={() => setPwFocus(true)} onBlur={() => setPwFocus(false)}>
          {pwFocus && values.password.length > 0 && !RULES.every((r) => r.test(values.password)) && (
            <ul
              aria-label="Password rules"
              className="absolute right-0 bottom-[calc(100%-1.5rem)] z-20 grid gap-1.5 rounded-[var(--radius-md)] bg-surface px-4 py-3 shadow-[0_14px_40px_-20px_rgb(15_58_43/0.45)] ring-1 ring-line-strong ring-inset animate-in fade-in-0 slide-in-from-bottom-1 duration-200 dark:shadow-[0_14px_40px_-16px_rgb(0_0_0/0.75)]"
            >
              {RULES.map((rule) => {
                const ok = rule.test(values.password);
                return (
                  <li key={rule.label} className={cn("flex items-center gap-2.5 text-[0.8125rem] transition-colors duration-200", ok ? "text-ink" : "text-ink-3")}>
                    <span className={cn("grid size-4 place-items-center rounded-full ring-1 ring-inset transition-colors duration-200", ok ? "bg-brand text-brand-ink ring-brand" : "ring-line-strong")}>
                      {ok && <Check size={10} weight="bold" />}
                    </span>
                    {rule.label}
                    <span className="sr-only">{ok ? ", met" : ", not met"}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <Field
            id="su-password"
            label="Password"
            type={shown ? "text" : "password"}
            autoComplete="new-password"
            value={values.password}
            error={errors.password}
            onChange={set("password")}
            trailing={<RevealToggle shown={shown} onToggle={() => setShown((s) => !s)} />}
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-start gap-3">
            <Checkbox
              id="su-ack"
              checked={ack}
              aria-invalid={!!errors.ack}
              onCheckedChange={(c) => {
                setAck(c === true);
                clear("ack");
              }}
              className="mt-0.5"
            />
            <Label htmlFor="su-ack" className="leading-snug font-normal text-ink-2">
              I understand Pactline is a hackathon preview and uses synthetic sandbox data
            </Label>
          </div>
          {errors.ack && <p className="pl-8 text-[0.8125rem] text-fail">{errors.ack}</p>}
        </div>

        {notice && <Notice>{notice}</Notice>}
        <Submit label="Create account" />
      </form>
      <p className="mt-8 text-center text-[0.875rem] text-ink-3">
        Already have an account?{" "}
        <Link href="/login" className="text-ink underline decoration-line-strong underline-offset-4 transition-colors duration-200 hover:decoration-ink">
          Sign in
        </Link>
      </p>
    </>
  );
}

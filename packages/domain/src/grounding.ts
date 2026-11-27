/*
 * Grounding validator for model-written prose (checklist 0, Should).
 * Every identifier, date, amount, vendor and significant number in the prose must come from the structured
 * result. If anything does not, the prose is replaced by a template and marked as such.
 */

export interface GroundingIssue {
  kind: "identifier" | "date" | "amount" | "number" | "vendor";
  text: string;
}

export interface GroundingOptions {
  /** Known vendor names. A vendor mentioned in prose must also appear in the structured result. */
  vendors?: readonly string[];
  /** Tokens that look like identifiers but are standards or units, such as ISO-9906. */
  allow?: ReadonlyArray<string | RegExp>;
}

export interface GroundingResult {
  ok: boolean;
  ungrounded: GroundingIssue[];
}

const ID_RE = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/g;
const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;
const AMOUNT_RE = /(?:₹|\$|€|£|Rs\.?\s?|INR\s?|USD\s?)\s?\d[\d,]*(?:\.\d+)?/g;
const UNIT = "(?:days?|weeks?|hours?|h|m³\\/h|m3\\/h|kW|m|%)";
const NUMBER_RE = new RegExp(`(?<![\\w.-])\\d[\\d,]*(?:\\.\\d+)?(?:\\s?${UNIT}(?![\\w]))?(?![\\w-])`, "g");

const toNumber = (s: string) => Number(s.replace(/[^\d.]/g, ""));
const isAllowed = (t: string, allow: GroundingOptions["allow"]) => (allow ?? []).some((a) => (typeof a === "string" ? a === t : a.test(t)));

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (typeof v === "number") out.push(String(v));
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
}

function facts(structured: unknown) {
  const text = strings(structured);
  const ids = new Set<string>();
  const dates = new Set<string>();
  const nums: number[] = [];
  for (const s of text) {
    for (const m of s.matchAll(ID_RE)) ids.add(m[0]);
    for (const m of s.matchAll(DATE_RE)) dates.add(m[0]);
    for (const m of s.replace(DATE_RE, " ").matchAll(/\d[\d,]*(?:\.\d+)?/g)) nums.push(toNumber(m[0]));
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) dates.add(s.slice(0, 10));
  }
  return { ids, dates, nums, haystack: text.join("\n").toLowerCase() };
}

export function checkGrounding(prose: string, structured: unknown, opts: GroundingOptions = {}): GroundingResult {
  const f = facts(structured);
  const ungrounded: GroundingIssue[] = [];
  const hasNum = (n: number) => f.nums.some((x) => Math.abs(x - n) < 1e-9);

  for (const m of prose.matchAll(DATE_RE)) if (!f.dates.has(m[0])) ungrounded.push({ kind: "date", text: m[0] });
  let rest = prose.replace(DATE_RE, " ");

  for (const m of rest.matchAll(AMOUNT_RE)) if (!hasNum(toNumber(m[0]))) ungrounded.push({ kind: "amount", text: m[0].trim() });
  rest = rest.replace(AMOUNT_RE, " ");

  for (const m of rest.matchAll(ID_RE)) if (!isAllowed(m[0], opts.allow) && !f.ids.has(m[0])) ungrounded.push({ kind: "identifier", text: m[0] });
  rest = rest.replace(ID_RE, " ");

  for (const m of rest.matchAll(NUMBER_RE)) {
    const raw = m[0];
    const digits = raw.match(/\d[\d,]*(?:\.\d+)?/)![0];
    const significant = digits.includes(".") || new RegExp(UNIT).test(raw.slice(digits.length)) || digits.replace(/[^\d]/g, "").length >= 3;
    if (significant && !hasNum(toNumber(digits))) ungrounded.push({ kind: "number", text: raw.trim() });
  }

  const lower = prose.toLowerCase();
  for (const v of opts.vendors ?? []) if (lower.includes(v.toLowerCase()) && !f.haystack.includes(v.toLowerCase())) ungrounded.push({ kind: "vendor", text: v });

  return { ok: ungrounded.length === 0, ungrounded };
}

export interface GroundedText {
  text: string;
  provenance: "model" | "template";
  ungrounded: GroundingIssue[];
}

/** Use the model's prose only if every fact in it is grounded; otherwise fall back to the deterministic template. */
export function groundedOrTemplate(args: { prose: string; structured: unknown; template: string } & GroundingOptions): GroundedText {
  const { prose, structured, template, ...opts } = args;
  const r = checkGrounding(prose, structured, opts);
  return r.ok ? { text: prose, provenance: "model", ungrounded: [] } : { text: template, provenance: "template", ungrounded: r.ungrounded };
}

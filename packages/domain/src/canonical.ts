/**
 * Deterministic JSON: sorted keys, no whitespace, finite numbers only.
 * Throws on anything that has no stable JSON form, so an idempotency key can never depend on it silently.
 */
export function canonicalJson(value: unknown): string {
  return walk(value, "$");
}

function walk(v: unknown, path: string): string {
  if (v === null) return "null";
  switch (typeof v) {
    case "string":
      return JSON.stringify(v.normalize("NFC"));
    case "boolean":
      return v ? "true" : "false";
    case "number":
      if (!Number.isFinite(v)) throw new TypeError(`canonicalJson: non-finite number at ${path}`);
      return Object.is(v, -0) ? "0" : JSON.stringify(v);
    case "object": {
      if (Array.isArray(v)) return `[${v.map((x, i) => walk(x, `${path}[${i}]`)).join(",")}]`;
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) throw new TypeError(`canonicalJson: non-plain object at ${path}; convert it (for example a Date to an ISO string) first`);
      const entries = Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, x]) => `${JSON.stringify(k.normalize("NFC"))}:${walk(x, `${path}.${k}`)}`).join(",")}}`;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported ${typeof v} at ${path}`);
  }
}

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
      if (Array.isArray(v)) {
        const items: string[] = [];
        for (let i = 0; i < v.length; i++) {
          if (!(i in v)) throw new TypeError(`canonicalJson: empty array slot at ${path}[${i}]`);
          items.push(walk(v[i], `${path}[${i}]`));
        }
        return `[${items.join(",")}]`;
      }
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) throw new TypeError(`canonicalJson: non-plain object at ${path}; convert it (for example a Date to an ISO string) first`);
      /* Normalise keys first, then sort, so equivalent Unicode spellings hash identically. */
      const entries = Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .map(([k, x]) => [k.normalize("NFC"), x] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      for (let i = 1; i < entries.length; i++) if (entries[i]![0] === entries[i - 1]![0]) throw new TypeError(`canonicalJson: duplicate key "${entries[i]![0]}" after normalisation at ${path}`);
      return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${walk(x, `${path}.${k}`)}`).join(",")}}`;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported ${typeof v} at ${path}`);
  }
}

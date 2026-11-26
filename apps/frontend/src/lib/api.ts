import type { ZodType } from "zod";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface Options extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Validates the response so a changed backend contract fails loudly here, not in a component. */
  schema?: ZodType<unknown>;
  timeoutMs?: number;
}

export async function api<T>(path: string, { body, schema, timeoutMs = 8000, headers, ...init }: Options = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: init.signal ?? ctrl.signal,
      headers: { Accept: "application/json", ...(body !== undefined && { "Content-Type": "application/json" }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new ApiError(res.status, (await res.text().catch(() => "")) || res.statusText);
    const data: unknown = res.status === 204 ? null : await res.json();
    return (schema ? schema.parse(data) : data) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, e instanceof DOMException && e.name === "AbortError" ? "The API did not respond in time" : "The API is not reachable");
  } finally {
    clearTimeout(timer);
  }
}

export const apiGet = <T>(path: string, opts?: Omit<Options, "body" | "method">) => api<T>(path, { ...opts, method: "GET" });
export const apiPost = <T>(path: string, body?: unknown, opts?: Omit<Options, "body" | "method">) => api<T>(path, { ...opts, method: "POST", body });

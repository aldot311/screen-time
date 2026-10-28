// Shared transport for the Meta Model API: auth, error envelope, retry with backoff.

export const META_BASE_URL = "https://api.meta.ai/v1";
export const API_KEY_ENV = "META_MODEL_API_KEY";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  fetch?: FetchLike;
  /** Overrides the env lookup; mainly for tests. */
  apiKey?: string;
  baseUrl?: string;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export class MetaApiError extends Error {
  readonly status: number;
  readonly type: string | null;
  readonly code: string | null;
  readonly param: string | null;

  constructor(
    message: string,
    opts: { status: number; type?: string | null; code?: string | null; param?: string | null },
  ) {
    super(message);
    this.name = "MetaApiError";
    this.status = opts.status;
    this.type = opts.type ?? null;
    this.code = opts.code ?? null;
    this.param = opts.param ?? null;
  }
}

export function getApiKey(opts: ClientOptions = {}): string {
  const key = opts.apiKey ?? process.env[API_KEY_ENV];
  if (!key) {
    throw new Error(`${API_KEY_ENV} is not set; add it to the environment before calling the Meta Model API.`);
  }
  return key;
}

// 400/401/402/403/404/413 are permanent per the docs; only rate limits and server errors are worth repeating.
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Retry-After as delta-seconds or an HTTP date; null when absent or unreadable. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/** Longest a single retry may sleep; a Retry-After beyond this fails the request instead of hanging. */
export function retryCeilingMs(maxDelayMs: number): number {
  return Math.max(maxDelayMs, 60_000);
}

/** Full-jitter exponential backoff; a server-provided Retry-After is a floor, capped at retryCeilingMs. */
export function backoffDelayMs(
  attempt: number,
  retryAfterMs: number | null,
  opts: { baseDelayMs: number; maxDelayMs: number; random: () => number },
): number {
  const ceiling = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** attempt);
  const jittered = Math.round(ceiling * opts.random());
  if (retryAfterMs === null) return jittered;
  return Math.min(Math.max(retryAfterMs, jittered), retryCeilingMs(opts.maxDelayMs));
}

export async function errorFromResponse(res: Response): Promise<MetaApiError> {
  const text = await res.text().catch(() => "");
  let envelope: { message?: string; type?: string; code?: string; param?: string } | undefined;
  try {
    envelope = (JSON.parse(text) as { error?: typeof envelope }).error;
  } catch {
    envelope = undefined;
  }
  const message = envelope?.message ?? (text.trim() || res.statusText || "request failed");
  return new MetaApiError(`Meta API ${res.status}: ${message}`, {
    status: res.status,
    type: envelope?.type,
    code: envelope?.code,
    param: envelope?.param,
  });
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sends one API request, retrying 429/5xx and network failures. `makeBody` is called per attempt
 * because multipart and stream bodies cannot be reused once sent.
 */
export async function metaRequest(
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    makeBody?: () => BodyInit;
    // Off for billed calls: a connection can drop after the server accepted (and charged) the request.
    retryNetworkErrors?: boolean;
  },
  opts: ClientOptions = {},
): Promise<Response> {
  const doFetch = opts.fetch ?? (globalThis.fetch as FetchLike);
  const sleep = opts.sleep ?? defaultSleep;
  const maxRetries = opts.maxRetries ?? 4;
  const delayOpts = {
    baseDelayMs: opts.baseDelayMs ?? 500,
    maxDelayMs: opts.maxDelayMs ?? 30_000,
    random: opts.random ?? Math.random,
  };
  const url = `${opts.baseUrl ?? META_BASE_URL}${path}`;
  const headers = { Authorization: `Bearer ${getApiKey(opts)}`, ...init.headers };

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await doFetch(url, { method: init.method ?? "POST", headers, body: init.makeBody?.() });
    } catch (err) {
      if (init.retryNetworkErrors === false || attempt >= maxRetries) throw err;
      await sleep(backoffDelayMs(attempt, null, delayOpts));
      continue;
    }
    if (res.ok) return res;
    if (!isRetryableStatus(res.status) || attempt >= maxRetries) throw await errorFromResponse(res);
    const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
    if (retryAfter !== null && retryAfter > retryCeilingMs(delayOpts.maxDelayMs)) throw await errorFromResponse(res);
    await res.body?.cancel().catch(() => undefined);
    await sleep(backoffDelayMs(attempt, retryAfter, delayOpts));
  }
}

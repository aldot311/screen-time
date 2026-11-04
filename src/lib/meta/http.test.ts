import { describe, expect, it } from "vitest";
import { backoffDelayMs, type FetchLike, isRetryableStatus, metaRequest, parseRetryAfter, requestTimeoutMs } from "./http";
import { parseSseEvents } from "./sse";

describe("isRetryableStatus", () => {
  it("retries only rate limits and server errors", () => {
    for (const s of [429, 500, 502, 503, 504]) expect(isRetryableStatus(s)).toBe(true);
    for (const s of [400, 401, 402, 403, 404, 406, 413]) expect(isRetryableStatus(s)).toBe(false);
  });
});

describe("parseRetryAfter", () => {
  it("reads seconds and HTTP dates", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    const now = Date.parse("2026-10-28T12:00:00Z");
    expect(parseRetryAfter("Wed, 28 Oct 2026 12:00:05 GMT", now)).toBe(5000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });
});

describe("backoffDelayMs", () => {
  const base = { baseDelayMs: 500, maxDelayMs: 4000 };
  it("grows exponentially with full jitter and a cap", () => {
    expect(backoffDelayMs(0, null, { ...base, random: () => 1 })).toBe(500);
    expect(backoffDelayMs(2, null, { ...base, random: () => 1 })).toBe(2000);
    expect(backoffDelayMs(10, null, { ...base, random: () => 1 })).toBe(4000);
    expect(backoffDelayMs(2, null, { ...base, random: () => 0.25 })).toBe(500);
  });
  it("never waits less than Retry-After", () => {
    expect(backoffDelayMs(0, 9000, { ...base, random: () => 1 })).toBe(9000);
  });
  it("caps Retry-After at a hard ceiling of max(maxDelayMs, 60s)", () => {
    expect(backoffDelayMs(0, 3_600_000, { ...base, random: () => 1 })).toBe(60_000);
    expect(backoffDelayMs(0, 3_600_000, { baseDelayMs: 500, maxDelayMs: 120_000, random: () => 1 })).toBe(120_000);
  });
});

describe("requestTimeoutMs", () => {
  const now = 1_000_000;
  it("is the request's own limit, cut to what is left before the deadline, in whole ms", () => {
    expect(requestTimeoutMs(60_000, undefined, now)).toBe(60_000);
    expect(requestTimeoutMs(60_000, now + 5_000, now)).toBe(5_000);
    expect(requestTimeoutMs(undefined, now + 5_000, now)).toBe(5_000);
    expect(requestTimeoutMs(37_266.5, undefined, now)).toBe(37_267);
    // No limit at all, as before: unset or 0.
    expect(requestTimeoutMs(undefined, undefined, now)).toBeUndefined();
    expect(requestTimeoutMs(0, undefined, now)).toBeUndefined();
  });

  it("refuses to start a request once the deadline has passed", () => {
    expect(() => requestTimeoutMs(60_000, now, now)).toThrow(expect.objectContaining({ name: "TimeoutError" }));
    expect(() => requestTimeoutMs(60_000, now - 1, now)).toThrow(/time limit/);
  });
});

describe("metaRequest and the deadline", () => {
  const busy = () => Response.json({ error: { message: "busy", type: "server_error", code: "busy" } }, { status: 503 });
  // Each test sees its own requests and sleeps; `answer` is called once per request.
  const api = (answer: (init?: RequestInit) => Response | Promise<Response>) => {
    const calls: RequestInit[] = [];
    const sleeps: number[] = [];
    const fetch: FetchLike = async (_url, init) => {
      calls.push(init ?? {});
      return answer(init);
    };
    const opts = { fetch, apiKey: "k", random: () => 1, sleep: async (ms: number) => void sleeps.push(ms) };
    return { calls, sleeps, opts };
  };

  it("never sleeps a 503 backoff past the deadline: the 503 stands", async () => {
    const { calls, sleeps, opts } = api(busy);
    // The first backoff is 500 ms (random 1); only 200 ms are left.
    await expect(metaRequest("/files", {}, { ...opts, deadlineAt: Date.now() + 200 })).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it("still retries a 503 when the backoff ends well before the deadline (control)", async () => {
    let n = 0;
    const { calls, sleeps, opts } = api(() => (n++ ? Response.json({ id: "file-1" }) : busy()));
    const res = await metaRequest("/files", {}, { ...opts, deadlineAt: Date.now() + 60_000 });
    expect(await res.json()).toEqual({ id: "file-1" });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([500]);
  });

  it("never sleeps a network-error backoff past the deadline either", async () => {
    const { calls, sleeps, opts } = api(() => {
      throw new TypeError("fetch failed");
    });
    await expect(metaRequest("/files", {}, { ...opts, deadlineAt: Date.now() + 200 })).rejects.toThrow("fetch failed");
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it("cuts a request's own limit to the time left before the deadline", async () => {
    // A request that never answers until its signal aborts it, as fetch does.
    const { calls, opts } = api(
      (init) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))),
    );
    const t0 = performance.now();
    const err = await metaRequest("/responses", { retryNetworkErrors: false }, { ...opts, timeoutMs: 60_000, deadlineAt: Date.now() + 50 }).catch(
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ name: "TimeoutError" });
    expect(performance.now() - t0).toBeLessThan(5_000);
    expect(calls).toHaveLength(1);
  });

  it("makes no request at all once the deadline has passed", async () => {
    const { calls, opts } = api(() => Response.json({ id: "file-1" }));
    await expect(metaRequest("/files", {}, { ...opts, deadlineAt: Date.now() - 1 })).rejects.toMatchObject({ name: "TimeoutError" });
    expect(calls).toHaveLength(0);
  });
});

describe("parseSseEvents", () => {
  it("handles CRLF, multi-line data, comments and [DONE]", () => {
    const body = ': keepalive\r\n\r\nevent: a\r\ndata: {"type":"a",\r\ndata: "n":1}\r\n\r\ndata: [DONE]\r\n\r\n';
    expect(parseSseEvents(body)).toEqual([{ type: "a", n: 1 }]);
  });
  it("drops a truncated final event instead of throwing a SyntaxError", () => {
    expect(parseSseEvents('data: {"type":"a"}\n\ndata: {"type":"b",')).toEqual([{ type: "a" }]);
  });
  it("still rejects a malformed event in the middle of a complete stream", () => {
    expect(() => parseSseEvents('data: {"type":\n\ndata: {"type":"b"}\n\n')).toThrow(SyntaxError);
  });
});

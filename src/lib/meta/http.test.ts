import { describe, expect, it } from "vitest";
import { backoffDelayMs, isRetryableStatus, parseRetryAfter } from "./http";
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

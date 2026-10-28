import { describe, expect, it } from "vitest";
import { friendlyError, verdictOf } from "./format";

describe("friendlyError", () => {
  it("turns API failures into what happened and who acts", () => {
    expect(friendlyError("Meta API: the account has no credits yet (402). Nothing was charged.")).toMatch(/Aetrai needs to add credits/);
    expect(friendlyError("The Meta API key is not configured")).toMatch(/key is missing/);
    expect(friendlyError("Spend of $0.0300 would exceed the per-run cap of $0.01")).toMatch(/spending limit/);
    expect(friendlyError("HTTP 503 backend_unavailable")).toMatch(/temporary problem/);
  });

  it("passes unknown errors through unchanged and keeps undefined", () => {
    expect(friendlyError("ffmpeg could not read the file")).toBe("ffmpeg could not read the file");
    expect(friendlyError(undefined)).toBeUndefined();
  });
});

describe("verdictOf", () => {
  it("needs every term met for delivered, and any miss is short", () => {
    const term = (pass: boolean | null) => ({ term: { text: "t", rule: null }, pass, evidence: [], detail: "" });
    const r = (passes: (boolean | null)[]) => ({ terms: passes.map(term) }) as never;
    expect(verdictOf(undefined)).toBe("pending");
    expect(verdictOf(r([true, true]))).toBe("delivered");
    expect(verdictOf(r([true, false, null]))).toBe("short");
    expect(verdictOf(r([true, null]))).toBe("review");
    expect(verdictOf(r([]))).toBe("review");
  });
});

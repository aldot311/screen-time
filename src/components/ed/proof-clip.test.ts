import { describe, expect, it } from "vitest";
import { readProofAnswer } from "./proof-clip";

const answer = (status: number, body: unknown = null, headers: Record<string, string> = {}, type: ResponseType = "basic") =>
  readProofAnswer({ type, status, headers: new Headers(headers), json: async () => body });

describe("readProofAnswer", () => {
  it("is ready when the route redirects to the stored clip", async () => {
    // In a browser, redirect: "manual" gives an opaque redirect with status 0.
    expect(await answer(0, null, {}, "opaqueredirect")).toEqual({ kind: "ready" });
    expect(await answer(302)).toEqual({ kind: "ready" });
  });

  it("waits while another request renders the clip, for as long as the route asks", async () => {
    expect(await answer(202, { error: "The proof clip is rendering. Try again in a few seconds." }, { "Retry-After": "5" })).toEqual({ kind: "rendering", retryMs: 5000 });
    expect(await answer(202)).toEqual({ kind: "rendering", retryMs: 5000 });
  });

  it("shows the route's reason when it fails, and a plain one when there is none", async () => {
    expect(await answer(409, { error: "Preview reports have no real video to render" })).toEqual({ kind: "failed", message: "Preview reports have no real video to render" });
    expect(await answer(500, "<html>")).toEqual({ kind: "failed", message: "Could not make the proof clip (500)." });
    const broken = await readProofAnswer({ type: "basic", status: 502, headers: new Headers(), json: async () => { throw new SyntaxError("bad json"); } });
    expect(broken).toEqual({ kind: "failed", message: "Could not make the proof clip (502)." });
  });
});

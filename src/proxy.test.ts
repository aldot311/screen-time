// The proxy's gate: which writes pass without the demo password. Only the agent on a listed example report, by its
// exact path, joins the fixed open routes.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accessToken } from "@/lib/access";
import { proxy } from "./proxy";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SCREEN_TIME_PASSWORD", "demo-pass-long");
});
afterEach(() => vi.unstubAllEnvs());

const req = (path: string, method = "POST", cookie?: string) =>
  new NextRequest(`http://localhost${path}`, { method, headers: cookie ? { cookie: `st_access=${cookie}` } : {} });
const AGENT = "/api/campaigns/lacroix-strawberry-peach/videos";

describe("proxy", () => {
  it("lets a visitor start the agent on a listed example report", async () => {
    for (const id of ["ash", "ash-recut", "george", "peter", "aldo", "aldo-2", "michael", "jamal", "lana", "jon", "6-michael-captioned-gk3bzd", "12-aldo-captioned-ncx15w"]) {
      expect(await proxy(req(`${AGENT}/${id}/agent`)), id).toBeUndefined();
    }
  });

  it("keeps approval, other videos and every variant of the path behind the password", async () => {
    const gated = [
      `${AGENT}/ash/agent/approve`,
      `${AGENT}/ash/agent/`,
      `${AGENT}/ASH/agent`,
      `${AGENT}/ash/AGENT`,
      "/api/campaigns/LaCroix-strawberry-peach/videos/ash/agent",
      `${AGENT}/%61sh/agent`,
      `${AGENT}/ash/agent%2Fapprove`,
      `${AGENT}/ash%2Fagent`,
      `${AGENT}/ash/agent/..%2Fagent/approve`,
      "/api/campaigns//lacroix-strawberry-peach/videos/ash/agent",
      `${AGENT}/michael-k-1a2b3c/agent`, // a video uploaded later, live in the demo
      `${AGENT}/ash/run`,
      `${AGENT}/ash/override`,
      "/api/campaigns/try-a-sample/videos/sample-1a2b3c/agent",
      "/api/campaigns/preview/videos/clip01/agent",
      "/api/campaigns/my-campaign/videos/ash/agent",
      "/api/campaigns/lacroix-strawberry-peach",
    ];
    for (const path of gated) expect((await proxy(req(path)))?.status, path).toBe(401);
    // Only POST starts a run; nothing else on the agent path is opened.
    for (const method of ["PUT", "PATCH", "DELETE"]) expect((await proxy(req(`${AGENT}/ash/agent`, method)))?.status, method).toBe(401);
  });

  it("still lets reads, the fixed open routes and the owner's cookie through", async () => {
    expect(await proxy(req(`${AGENT}/ash/agent/approve`, "GET"))).toBeUndefined();
    expect(await proxy(req("/api/try"))).toBeUndefined();
    expect(await proxy(req(`${AGENT}/ash/agent/approve`, "POST", await accessToken("demo-pass-long")))).toBeUndefined();
    expect((await proxy(req(`${AGENT}/ash/agent/approve`, "POST", await accessToken("wrong-password"))))?.status).toBe(401);
  });
});

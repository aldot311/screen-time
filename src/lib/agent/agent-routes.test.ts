// The agent and approve routes against a temp local store. Muse Spark is a scripted fake fetch: the real API is never
// called, and a run only starts when a test calls the after() callback itself.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accessToken } from "@/lib/access";
import { getCampaign, getVideo, putCampaign, putVideo, readDoc, updateVideo } from "@/lib/campaign/store";
import type { VideoEntry } from "@/lib/campaign/types";
import type { TermResult, VideoReport } from "@/lib/types";
import type { AgentRun } from "./campaign-agent";

const afterSpy = vi.hoisted(() => vi.fn());
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: afterSpy }));

const agentRoute = await import("@/app/api/campaigns/[id]/videos/[videoId]/agent/route");
const approveRoute = await import("@/app/api/campaigns/[id]/videos/[videoId]/agent/approve/route");

const ID = "lacroix-strawberry-peach";
const PASSWORD = "demo-pass-long";

const term = (pass: boolean): TermResult => ({ term: { text: "Says LaCroix out loud", rule: { kind: "mentioned", minTimes: 1 } }, pass, evidence: [], detail: pass ? "Mentioned 1 time." : "Mentioned 0 times (needs 1 time)." });
const report = (pass: boolean) =>
  ({
    info: { durationSec: 15, frameCount: 450, width: 1, height: 1 },
    metrics: { secondsOnScreen: 9, segments: [], mentions: [], longestRunSec: 9, firstSeenSec: 0 },
    tracks: [{ objectId: 0, verdict: "match", visibility: "clear", reason: "pink can" }],
    terms: [term(pass)],
  }) as unknown as VideoReport;
const entry = (id: string, creator: string, pass: boolean, createdAt: string): VideoEntry => ({
  id,
  campaignId: ID,
  creator,
  title: `${id}.mp4`,
  videoUrl: "",
  status: "done",
  step: null,
  report: report(pass),
  createdAt,
  updatedAt: createdAt,
});

type Item = Record<string, unknown>;
const call = (name: string, args: object, id = name): Item => ({ type: "function_call", name, arguments: JSON.stringify(args), call_id: id });
const say = (text: string): Item => ({ type: "message", content: [{ type: "output_text", text }] });
let turns: Item[][] = [];
let bodies: { tools: { name: string }[]; instructions: string }[] = [];
const fakeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
  bodies.push(JSON.parse(String(init?.body)));
  return Response.json({ status: "completed", output: turns[bodies.length - 1] ?? [say("done")] });
});

let dir = "";
const roots: string[] = [];
const savedEnv = { ...process.env };
beforeEach(async () => {
  // A fresh store per test: the day's slots and every video start empty.
  dir = await mkdtemp(join(tmpdir(), "st-agent-routes-"));
  roots.push(dir);
  process.env.SCREEN_TIME_STORE_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SCREEN_TIME_PASSWORD", PASSWORD);
  vi.stubEnv("META_MODEL_API_KEY", "test-key");
  vi.stubEnv("SCREEN_TIME_LINK_SECRET", "test-link-secret-at-least-32-characters");
  vi.stubGlobal("fetch", fakeFetch);
  afterSpy.mockClear();
  fakeFetch.mockClear();
  turns = [];
  bodies = [];
  await putCampaign({
    id: ID,
    name: "LaCroix: Strawberry Peach creators",
    brand: "LaCroix",
    prompt: "drink can",
    productDescription: "a pink LaCroix can",
    brandTerms: ["LaCroix"],
    contractTerms: ["Says LaCroix out loud"],
    fee: 300,
    creators: ["Ash", "George", "Peter", "Jamal", "Michael K"].map((handle) => ({ handle, addedAt: "2026-11-01T00:00:00Z" })),
    createdAt: "2026-11-01T00:00:00Z",
  });
  await putVideo(entry("ash", "Ash", false, "2026-11-01T01:00:00Z"));
  await putVideo(entry("ash-recut", "Ash", true, "2026-11-01T02:00:00Z"));
  await putVideo(entry("george", "George", false, "2026-11-01T01:00:00Z"));
  await putVideo(entry("peter", "Peter", false, "2026-11-01T01:00:00Z"));
  await putVideo(entry("jamal", "Jamal", true, "2026-11-01T01:00:00Z"));
  // Uploaded into the same campaign later and never added to the open list by hand.
  await putVideo(entry("michael-k-1a2b3c", "Michael K", false, "2026-11-03T01:00:00Z"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(async () => {
  process.env = savedEnv;
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

const params = (videoId: string, id = ID) => ({ params: Promise.resolve({ id, videoId }) });
let ipCounter = 0;
/** A visitor's POST from the report page (a new address each time unless one is given). */
const visitor = (path: string, opts: { ip?: string; site?: string; cookie?: string } = {}) =>
  new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "sec-fetch-site": opts.site ?? "same-origin",
      "x-real-ip": opts.ip ?? `10.0.0.${++ipCounter}`,
      ...(opts.cookie ? { cookie: `st_access=${opts.cookie}` } : {}),
    },
  });
const startAgent = (videoId: string, opts: { ip?: string; site?: string; cookie?: string } = {}, id = ID) =>
  agentRoute.POST(visitor(`/api/campaigns/${id}/videos/${videoId}/agent`, opts), params(videoId, id));
const approve = (videoId: string, cookie?: string) => approveRoute.POST(visitor(`/api/campaigns/${ID}/videos/${videoId}/agent/approve`, { cookie }), params(videoId));
/** Runs the agent the last start handed to after(). */
const runQueued = async () => (afterSpy.mock.calls.at(-1)![0] as () => Promise<AgentRun>)();
const finish = (videoId: string) => updateVideo(ID, videoId, (v) => ({ ...v, visitorAgent: { ...v.visitorAgent!, status: "done" } }));
/** The brand's own finished run on a report: what every visitor sees by default. */
const brandRun: AgentRun = { status: "done", startedAt: "2026-11-02T09:00:00.000Z", steps: [], usd: 0.1, summary: "The brand's run." };

describe("POST agent without the demo password", () => {
  it("runs on a listed example report without the re-check tool, and pays from Ash's finished re-cut", async () => {
    turns = [
      [call("get_report", {}), call("get_creator_history", {})],
      [call("recommend_payout", { decision: "pay", reason: "Her re-cut met every term." })],
      [say("Ash's re-cut met every term: pay. Nothing is waiting for your approval.")],
    ];
    const res = await startAgent("ash");
    expect(res.status).toBe(202);
    const body = (await res.json()) as { mode: string; agent: AgentRun };
    expect(body).toMatchObject({ mode: "started", agent: { status: "running", origin: "public" } });
    expect(afterSpy).toHaveBeenCalledTimes(1);

    await runQueued();
    expect(bodies).toHaveLength(3);
    for (const b of bodies) expect(b.tools.map((t) => t.name)).not.toContain("analyze_video");
    expect(bodies[0].instructions).toContain("id ash-recut");
    expect((await getVideo(ID, "ash"))!.agent).toBeUndefined();
    const stored = (await getVideo(ID, "ash"))!.visitorAgent!;
    // The run kept the route's id (no remount mid-run), is labelled as a visitor's, and stayed within its own cap.
    expect(stored).toMatchObject({ status: "done", startedAt: body.agent.startedAt, origin: "public", recommendation: { decision: "pay" } });
    expect(stored.recut).toBeUndefined();
    expect(stored.usd).toBeCloseTo(0.06, 10);
    const ledger = JSON.parse(await readFile(join(dir, "ledger.json"), "utf8")) as { usd: number }[];
    expect(ledger.reduce((s, e) => s + e.usd, 0)).toBeCloseTo(0.06, 10);
  });

  it("stops at the visitor's own budget: the turn cap, never the per-video budget of a run", async () => {
    turns = Array.from({ length: 12 }, (_, i) => [call("get_report", {}, `t${i}`)]);
    vi.stubEnv("SCREEN_TIME_MAX_USD_PER_VIDEO", "5");
    expect((await startAgent("george")).status).toBe(202);
    const run = await runQueued();
    expect(bodies).toHaveLength(8);
    expect(run.usd).toBeCloseTo(0.16, 10);
    expect(run.summary).toMatch(/Stopped after 8 turns/);
  });

  it("refuses other videos, other campaigns, other sites and the approve route", async () => {
    for (const [videoId, id] of [["michael-k-1a2b3c", ID], ["ash", "my-campaign"], ["clip01", "preview"], ["sample-1a2b3c", "try-a-sample"]]) {
      const res = await startAgent(videoId, {}, id);
      expect(res.status, `${id}/${videoId}`).toBe(401);
      expect(await res.json()).toMatchObject({ unlock: true });
    }
    expect((await startAgent("ash", { site: "cross-site" })).status).toBe(403);
    expect((await startAgent("ash", { site: "same-site" })).status).toBe(403);
    expect((await startAgent("ash", { cookie: await accessToken("wrong-password") }, ID)).status).toBe(202); // a wrong cookie is a visitor
    expect((await approve("ash")).status).toBe(401);
    expect(afterSpy).toHaveBeenCalledTimes(1);
  });

  it("leaves the brand's run as what the report shows; the visitor's run goes beside it", async () => {
    await updateVideo(ID, "peter", (v) => ({ ...v, agent: brandRun }));
    turns = [[call("get_report", {})], [say("Peter missed the disclosure.")]];
    expect((await startAgent("peter")).status).toBe(202);
    await runQueued();
    const v = (await getVideo(ID, "peter"))!;
    expect(v.agent).toEqual(brandRun);
    expect(v.visitorAgent).toMatchObject({ status: "done", origin: "public", summary: "Peter missed the disclosure." });
  });

  it("gives back the brand's run that a visitor's run from before visitorAgent set aside, once that run died", async () => {
    const died: AgentRun = { status: "running", startedAt: new Date(Date.now() - 7 * 60_000).toISOString(), steps: [], usd: 0, origin: "public", prior: brandRun };
    await updateVideo(ID, "peter", (v) => ({ ...v, agent: died }));
    expect((await startAgent("peter")).status).toBe(202);
    const v = (await getVideo(ID, "peter"))!;
    expect(v.agent).toEqual(brandRun);
    expect(v.visitorAgent).toMatchObject({ status: "running", origin: "public" });
  });

  it("joins a run already in progress instead of starting a second one", async () => {
    await updateVideo(ID, "george", (v) => ({ ...v, agent: brandRun }));
    const [a, b] = await Promise.all([startAgent("george"), startAgent("george")]);
    expect([a.status, b.status].sort()).toEqual([200, 202]);
    const modes = [((await a.json()) as { mode: string }).mode, ((await b.json()) as { mode: string }).mode].sort();
    expect(modes).toEqual(["joined", "started"]);
    expect(afterSpy).toHaveBeenCalledTimes(1);
    // A later visitor joins too, while it runs: it gets the visitor's run to watch, not the brand's.
    const later = await startAgent("george");
    expect(later.status).toBe(200);
    expect(await later.json()).toMatchObject({ mode: "joined", agent: { status: "running", origin: "public" } });
  });

  it("opens Michael K's Reel from the demo video's live run, added to the list by hand", async () => {
    await putVideo(entry("6-michael-captioned-gk3bzd", "Michael K", true, "2026-11-03T02:00:00Z"));
    const res = await startAgent("6-michael-captioned-gk3bzd");
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ mode: "started", agent: { status: "running", origin: "public" } });
  });

  it("caps runs per visitor and per day, then shows the brand's run or says why not", async () => {
    vi.stubEnv("SCREEN_TIME_AGENT_PER_VISITOR", "2");
    vi.stubEnv("SCREEN_TIME_AGENT_PER_DAY", "3");
    for (const id of ["george", "peter"]) await updateVideo(ID, id, (v) => ({ ...v, agent: brandRun }));
    const me = "203.0.113.7";
    expect((await startAgent("george", { ip: me })).status).toBe(202);
    await finish("george");
    // Another address in the same IPv6 /64 would count as the same visitor; a plain IPv4 here.
    expect((await startAgent("george", { ip: me })).status).toBe(202);
    await finish("george");
    const capped = await startAgent("george", { ip: me });
    expect(capped.status).toBe(200);
    expect(await capped.json()).toMatchObject({ mode: "replay", limit: "visitor", reason: "You have run the agent 2 times today.", agent: { status: "done", summary: "The brand's run." } });

    expect((await startAgent("peter")).status).toBe(202); // run 3 of 3 today
    await finish("peter");
    expect(await (await startAgent("peter")).json()).toMatchObject({ mode: "replay", limit: "day", reason: "Today's 3 visitor runs of the agent are used up." });
    // A report with no finished run to show gets the fixed text, which points at the password.
    const none = await startAgent("jamal");
    expect(none.status).toBe(429);
    expect(((await none.json()) as { error: string }).error).toMatch(/^Today's 3 visitor runs of the agent are used up\. .*demo password/);
    expect(await readDoc(`agent-public/${new Date().toISOString().slice(0, 10)}/full.json`)).not.toBeNull();
    expect(afterSpy).toHaveBeenCalledTimes(3);
  });
});

describe("the owner's reserve", () => {
  it("past the total cap less the reserve, a visitor gets the brand's run and the owner still runs", async () => {
    vi.stubEnv("SCREEN_TIME_MAX_USD_TOTAL", "20");
    vi.stubEnv("SCREEN_TIME_OWNER_RESERVE_USD", "5");
    await writeFile(join(dir, "ledger.json"), JSON.stringify([{ at: "2026-11-03T00:00:00Z", usd: 14.9, note: "earlier runs" }]));
    await updateVideo(ID, "peter", (v) => ({ ...v, agent: brandRun }));
    const res = await startAgent("peter");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ mode: "replay", limit: "budget", reason: "The free agent runs for this demo are used up.", agent: { summary: "The brand's run." } });
    // A report with no brand's run to show says so, without "tomorrow": this limit does not start over.
    const none = await startAgent("jamal");
    expect(none.status).toBe(429);
    expect(await none.json()).toEqual({ error: "The free agent runs for this demo are used up. Enter the demo password to run it." });
    expect(await readDoc(`agent-public/${new Date().toISOString().slice(0, 10)}/run-1.json`)).toBeNull();
    expect((await startAgent("peter", { cookie: await accessToken(PASSWORD) })).status).toBe(202);
    expect(afterSpy).toHaveBeenCalledTimes(1);
  });
});

describe("POST agent with the demo password", () => {
  it("runs as before: re-check tool offered, a second click refused while it works, any video", async () => {
    const cookie = await accessToken(PASSWORD);
    const res = await startAgent("michael-k-1a2b3c", { cookie, site: "cross-site" });
    expect(res.status).toBe(202);
    const agent = (await res.json()) as AgentRun;
    expect(agent).toMatchObject({ status: "running" });
    expect(agent.origin).toBeUndefined();
    const again = await startAgent("michael-k-1a2b3c", { cookie });
    expect(again.status).toBe(409);
    await runQueued();
    expect(bodies[0].tools.map((t) => t.name)).toContain("analyze_video");
    expect((await getVideo(ID, "michael-k-1a2b3c"))!.agent).toMatchObject({ status: "done", startedAt: agent.startedAt });
  });
});

describe("POST agent/approve", () => {
  const queue = (status: AgentRun["status"] = "done") =>
    updateVideo(ID, "george", (v) => ({ ...v, agent: { status, startedAt: "2026-11-03T10:00:00.000Z", steps: [], usd: 0.06, recut: { reason: "Say LaCroix out loud." } } }));

  it("needs the demo password at the route itself", async () => {
    await queue();
    const res = await approve("george");
    expect(res.status).toBe(401);
    expect((await getVideo(ID, "george"))!.agent!.recut!.approvedAt).toBeUndefined();
  });

  it("makes one link from two clicks at once", async () => {
    await queue();
    const cookie = await accessToken(PASSWORD);
    const results = await Promise.all([approve("george", cookie), approve("george", cookie)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const made = results.find((r) => r.status === 201)!;
    expect(((await made.json()) as { path: string }).path).toMatch(/^\/submit\//);
    expect((await getVideo(ID, "george"))!.agent!.recut!.approvedAt).toBeTruthy();
    expect((await getCampaign(ID))!.creators!.filter((c) => c.request)).toHaveLength(1);
    expect((await approve("george", cookie)).status).toBe(409);
  });

  it("waits for the run to finish, and gives the approval back when the link cannot be recorded", async () => {
    await queue("running");
    const cookie = await accessToken(PASSWORD);
    expect((await approve("george", cookie)).status).toBe(409);
    await queue("done");
    await rm(join(dir, "campaigns", ID, "campaign.json"));
    expect((await approve("george", cookie)).status).toBe(404);
    expect((await getVideo(ID, "george"))!.agent!.recut!.approvedAt).toBeUndefined();
  });
});

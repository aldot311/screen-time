// executeAgent's writes around the loop, against a temp local store: a setup failure never leaves the video "running",
// a ledger failure after the run never clobbers it, and an approval or a newer run is never written over.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign } from "@/lib/campaign/types";
import type { VideoReport } from "@/lib/types";
import type { AgentRun } from "./campaign-agent";

// Each test sets how the ledger step behaves around the run.
const ledger = vi.hoisted(() => ({ mode: "ok" as "ok" | "setup-fails" | "append-fails", between: null as null | (() => Promise<unknown>) }));
vi.mock("@/lib/campaign/store", async (orig) => {
  const real = await orig<typeof import("@/lib/campaign/store")>();
  return {
    ...real,
    withLedgerFile: async <T,>(fn: (path: string) => Promise<T>): Promise<T> => {
      if (ledger.mode === "setup-fails") throw new Error("Could not read the ledger");
      const out = await fn(join(real.localStoreRoot(), "ledger.json"));
      await ledger.between?.();
      if (ledger.mode === "append-fails") throw new Error("Could not append to the ledger");
      return out;
    },
  };
});

const { executeAgent } = await import("./run-agent");
const { getVideo, putCampaign, putVideo, updateVideo } = await import("@/lib/campaign/store");

const campaign: Campaign = { id: "c1", name: "Fall", brand: "LaCroix", prompt: "can", productDescription: "a can", brandTerms: [], contractTerms: [], createdAt: "2026-11-01T00:00:00Z" };
const report = { info: { durationSec: 10, frameCount: 1, width: 1, height: 1 }, metrics: { secondsOnScreen: 1, segments: [], mentions: [], longestRunSec: 1, firstSeenSec: 0 }, tracks: [], terms: [{ term: { text: "Say it", rule: { kind: "mentioned", minTimes: 1 } }, pass: false, evidence: [], detail: "Mentioned 0 times." }] } as unknown as VideoReport;
const STARTED = "2026-11-03T10:00:00.000Z";
const running: AgentRun = { status: "running", startedAt: STARTED, steps: [], usd: 0, origin: "public" };

const turns = [
  [{ type: "function_call", name: "request_recut", arguments: JSON.stringify({ reason: "Say it." }), call_id: "a" }],
  [{ type: "message", content: [{ type: "output_text", text: "A re-cut request waits for you." }] }],
];
let calls = 0;

let dir = "";
const savedEnv = { ...process.env };
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "st-run-agent-"));
  process.env.SCREEN_TIME_STORE_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.META_MODEL_API_KEY = "test-key";
  calls = 0;
  vi.stubGlobal("fetch", async () => Response.json({ status: "completed", output: turns[calls++] ?? turns[1] }));
  ledger.mode = "ok";
  ledger.between = null;
  await putCampaign(campaign);
  await putVideo({ id: "v1", campaignId: "c1", creator: "@maya", title: "v1", videoUrl: "", status: "done", step: null, report, createdAt: STARTED, updatedAt: STARTED, agent: running, visitorAgent: running });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  process.env = savedEnv;
  await rm(dir, { recursive: true, force: true });
});

const stored = async () => (await getVideo("c1", "v1"))!;

describe("executeAgent", () => {
  it("marks the run failed when setup fails before the loop, instead of leaving it running", async () => {
    ledger.mode = "setup-fails";
    const run = await executeAgent(campaign, await stored(), { public: true });
    expect(run).toMatchObject({ status: "failed", startedAt: STARTED, error: "Could not read the ledger", origin: "public" });
    expect((await stored()).visitorAgent).toMatchObject({ status: "failed", startedAt: STARTED });
    expect(calls).toBe(0);
  });

  it("keeps a finished run when the ledger append fails after it", async () => {
    ledger.mode = "append-fails";
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = await executeAgent(campaign, await stored(), { public: true });
    expect(run.status).toBe("done");
    expect((await stored()).visitorAgent).toMatchObject({ status: "done", startedAt: STARTED, recut: { reason: "Say it." } });
    expect(quiet).toHaveBeenCalledTimes(1);
    quiet.mockRestore();
  });

  it("keeps an approval given between the run's last step and its final write", async () => {
    ledger.between = () => updateVideo("c1", "v1", (v) => ({ ...v, agent: { ...v.agent!, recut: { ...v.agent!.recut!, approvedAt: "2026-11-03T10:01:00.000Z" } } }));
    await executeAgent(campaign, await stored());
    expect((await stored()).agent!.recut).toEqual({ reason: "Say it.", approvedAt: "2026-11-03T10:01:00.000Z" });
  });

  it("never writes over a newer run", async () => {
    const video = await stored();
    const newer: AgentRun = { status: "running", startedAt: "2026-11-03T10:07:00.000Z", steps: [], usd: 0 };
    await updateVideo("c1", "v1", (v) => ({ ...v, agent: newer }));
    await executeAgent(campaign, video);
    expect((await stored()).agent).toEqual(newer);
  });
});

describe("a visitor's run never replaces the brand's run on an example report", () => {
  const curated: AgentRun = { status: "done", startedAt: "2026-11-02T09:00:00.000Z", steps: [], usd: 0.04, summary: "Owner's run.", recut: { reason: "Say it.", approvedAt: "2026-11-02T10:00:00.000Z" } };

  it("keeps the brand's run when the visitor's run fails, and keeps the failure for the visitor to see", async () => {
    await updateVideo("c1", "v1", (v) => ({ ...v, agent: curated, visitorAgent: running }));
    ledger.mode = "setup-fails";
    await executeAgent(campaign, (await getVideo("c1", "v1"))!, { public: true });
    const v = (await getVideo("c1", "v1"))!;
    expect(v.agent).toEqual(curated);
    expect(v.visitorAgent).toMatchObject({ status: "failed", startedAt: STARTED, error: "Could not read the ledger" });
  });

  it("keeps the brand's run when the visitor's run finishes; the visitor's run is kept beside it", async () => {
    await updateVideo("c1", "v1", (v) => ({ ...v, agent: curated, visitorAgent: running }));
    const run = await executeAgent(campaign, (await getVideo("c1", "v1"))!, { public: true });
    const v = (await getVideo("c1", "v1"))!;
    expect(v.agent).toEqual(curated);
    expect(v.visitorAgent).toMatchObject({ status: "done", origin: "public", startedAt: STARTED });
    expect(run.status).toBe("done");
  });

  it("the brand's own run, started with the password, leaves a visitor's run where it is", async () => {
    const theirs: AgentRun = { status: "done", startedAt: "2026-11-02T09:00:00.000Z", steps: [], usd: 0.04, summary: "A visitor's run.", origin: "public" };
    await updateVideo("c1", "v1", (v) => ({ ...v, visitorAgent: theirs }));
    await executeAgent(campaign, (await getVideo("c1", "v1"))!);
    const v = (await getVideo("c1", "v1"))!;
    expect(v.agent).toMatchObject({ status: "done", startedAt: STARTED, recut: { reason: "Say it." } });
    expect(v.visitorAgent).toEqual(theirs);
  });
});

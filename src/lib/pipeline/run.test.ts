import { execFileSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { describe, expect, it } from "vitest";
import { CostGuard, CostLimitError, type FetchLike } from "@/lib/meta";
import { pickFrames, runVideo } from "./run";
import { toContractTerms } from "./prompts";
import type { Detection } from "@/lib/types";

// Two frames of SAM output for one object, in the documented token format (fixture from @meta-sam/parser's README).
const MASK = "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>";
const BOX = "<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>";
const SAM_TEXT = `<0f>0${BOX}${MASK}\n<1f>0${BOX}${MASK}\n`;

function sse(events: { type: string }[]): string {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}
const lane = { item_id: "msg-1", output_index: 0, content_index: 0 };
const samStream = (framesProcessed: number) =>
  sse([
    { type: "response.created" },
    { type: "response.output_text.delta", ...lane, delta: SAM_TEXT },
    { type: "response.output_text.done", ...lane, text: SAM_TEXT },
    { type: "response.completed", response: { status: "completed", usage: { video_frames_processed: framesProcessed } } },
  ] as { type: string }[]);

const sparkReply = (payload: unknown) =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(payload) }] }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

function fakeApi(verdict: "match" | "lookalike", samFrames = 15): { fetch: FetchLike; paths: string[] } {
  const paths: string[] = [];
  const fetch: FetchLike = async (url, init) => {
    const path = new URL(url).pathname;
    paths.push(path);
    if (path === "/v1/files") return Response.json({ id: "file-1" });
    if (path === "/v1/asr/transcribe")
      return Response.json({ transcript: "love my Celsius", turns: [{ startMs: 0, endMs: 900, transcript: "love my Celsius" }] });
    if (path === "/v1/responses") {
      const body = JSON.parse(String(init?.body));
      if (body.model === "sam-3.1") return new Response(samStream(samFrames), { status: 200 });
      if (body.text?.format?.name === "product_check")
        return sparkReply({ verdict, visibility: "clear", reason: "Teal can with the brand logo." });
      return sparkReply({
        rules: [{ index: 0, checkable: true, kind: "mentioned", seconds: 0, withinFirstSec: 0, fraction: 0, forSeconds: 0, minTimes: 1 }],
      });
    }
    throw new Error(`unexpected ${path}`);
  };
  return { fetch, paths };
}

async function setup(durationSec = 1) {
  const dir = await mkdtemp(join(tmpdir(), "st-run-"));
  const src = join(dir, "src.mp4");
  execFileSync(ffmpegStatic as string, [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", `testsrc=size=320x334:rate=30:duration=${durationSec}`,
    "-f", "lavfi", "-i", `sine=frequency=440:sample_rate=44100:duration=${durationSec}`,
    "-shortest", src,
  ]);
  const guard = new CostGuard({ maxUsdPerRun: 1, maxUsdTotal: 1, ledgerPath: join(dir, "ledger.json") });
  return { dir, src, guard };
}

const base = (dir: string, src: string, guard: CostGuard, fetch: FetchLike) => ({
  videoId: "v1",
  sourcePath: src,
  workDir: dir,
  prompt: "drink can",
  productDescription: "a teal Celsius energy drink can",
  brandTerms: ["Celsius"],
  contractTerms: ["Say the brand name at least once"],
  guard,
  client: { fetch, apiKey: "test-key", sleep: async () => undefined },
});

describe("runVideo", () => {
  it("runs the whole pipeline against a fake API and produces a report", async () => {
    const { dir, src, guard } = await setup();
    const { fetch, paths } = fakeApi("match");
    const report = await runVideo(base(dir, src, guard, fetch));

    expect(paths.filter((p) => p === "/v1/responses")).toHaveLength(3); // sam, verify, terms
    expect(report.info.frameCount).toBe(15);
    expect(report.tracks).toEqual([{ objectId: 0, verdict: "match", visibility: "clear", reason: expect.any(String) }]);
    expect(report.metrics.secondsOnScreen).toBeCloseTo(2 / 15);
    expect(report.metrics.mentions).toHaveLength(1);
    expect(report.terms[0].pass).toBe(true);
    // SAM $0.01 (15 frames billed at the 50-frame minimum) + verify $0.02 + transcribe $0.01 + terms $0.02.
    expect(report.cost).toEqual({ samFrames: 15, usd: 0.06 });
    expect(await guard.totalSpentUsd()).toBeCloseTo(0.06, 10);
  }, 30_000);

  it("reports each step as it starts, in order", async () => {
    const { dir, src, guard } = await setup();
    const steps: string[] = [];
    await runVideo({ ...base(dir, src, guard, fakeApi("match").fetch), onStep: (s) => void steps.push(s) });
    expect(steps).toEqual(["normalize", "track", "verify", "listen", "measure", "contract"]);
  }, 30_000);

  it("tags every tracked box with its object's verdict, for the overlay", async () => {
    const { dir, src, guard } = await setup();
    const report = await runVideo(base(dir, src, guard, fakeApi("lookalike").fetch));
    expect(report.detections).toHaveLength(2);
    expect(report.detections?.map((d) => [d.frame, d.objectId, d.verdict])).toEqual([[0, 0, "lookalike"], [1, 0, "lookalike"]]);
    expect(Object.keys(report.detections![0]).sort()).toEqual(
      expect.arrayContaining(["areaFraction", "box", "centroid", "frame", "objectId", "verdict"]),
    );
  }, 30_000);

  it("refunds the SAM reserve when fewer frames are billed than estimated", async () => {
    const { dir, src, guard } = await setup(5); // 75 frames reserved = $0.015
    const report = await runVideo(base(dir, src, guard, fakeApi("match", 60).fetch));
    expect(report.info.frameCount).toBe(75);
    // SAM $0.012 (60 billed frames) + verify $0.02 + transcribe $0.01 + terms $0.02.
    expect(report.cost).toEqual({ samFrames: 60, usd: 0.062 });
    expect(await guard.totalSpentUsd()).toBeCloseTo(0.062, 10);
    expect((await guard.readLedger()).map((e) => e.usd)).toContain(-0.003);
  }, 30_000);

  it("drops look-alikes from the metrics", async () => {
    const { dir, src, guard } = await setup();
    const report = await runVideo(base(dir, src, guard, fakeApi("lookalike").fetch));
    expect(report.tracks[0].verdict).toBe("lookalike");
    expect(report.metrics.secondsOnScreen).toBe(0);
  }, 30_000);

  it("releases the SAM reserve when the upload fails before SAM is called", async () => {
    const { dir, src, guard } = await setup();
    const { fetch: ok } = fakeApi("match");
    const fetch: FetchLike = async (url, init) =>
      new URL(url).pathname === "/v1/files"
        ? Response.json({ error: { message: "too big", type: "invalid_request_error", code: "too_big" } }, { status: 413 })
        : ok(url, init);
    await expect(runVideo(base(dir, src, guard, fetch))).rejects.toMatchObject({ status: 413 });
    expect(await guard.totalSpentUsd()).toBe(0);
  }, 30_000);

  it("refunds the SAM reserve when SAM rejects the request, but keeps it when SAM fails server-side", async () => {
    const { dir, src, guard } = await setup();
    const { fetch: ok } = fakeApi("match");
    const failSam = (status: number): FetchLike => async (url, init) => {
      const isSam = new URL(url).pathname === "/v1/responses" && JSON.parse(String(init?.body)).model === "sam-3.1";
      return isSam
        ? Response.json({ error: { message: "nope", type: "invalid_request_error", code: "x" } }, { status })
        : ok(url, init);
    };
    await expect(runVideo(base(dir, src, guard, failSam(402)))).rejects.toMatchObject({ status: 402 });
    expect(await guard.totalSpentUsd()).toBe(0);

    const guard2 = new CostGuard({ maxUsdPerRun: 1, maxUsdTotal: 1, ledgerPath: join(dir, "l3.json") });
    const opts = { ...base(dir, src, guard2, failSam(500)), client: { fetch: failSam(500), apiKey: "k", sleep: async () => undefined, maxRetries: 0 } };
    await expect(runVideo(opts)).rejects.toMatchObject({ status: 500 });
    expect(await guard2.totalSpentUsd()).toBeCloseTo(0.01); // 15 frames at the 50-frame minimum, possibly billed
  }, 30_000);

  it("refuses to call SAM when the budget would be exceeded", async () => {
    const { dir, src } = await setup();
    const tiny = new CostGuard({ maxUsdPerRun: 0.001, maxUsdTotal: 1, ledgerPath: join(dir, "l2.json") });
    const { fetch, paths } = fakeApi("match");
    await expect(runVideo(base(dir, src, tiny, fetch))).rejects.toBeInstanceOf(CostLimitError);
    expect(paths).toEqual([]);
  }, 30_000);
});

describe("pickFrames", () => {
  const det = (frame: number, areaFraction: number): Detection => ({
    frame,
    objectId: 1,
    areaFraction,
    box: { x1: 0, y1: 0, x2: 1, y2: 1 },
    centroid: { x: 0.5, y: 0.5 },
  });

  it("picks first, middle and largest without duplicates", () => {
    const picks = pickFrames([det(5, 0.1), det(1, 0.1), det(9, 0.4), det(3, 0.2)], 100);
    expect(picks.map((d) => d.frame)).toEqual([1, 5, 9]);
    expect(pickFrames([det(2, 0.1)], 100).map((d) => d.frame)).toEqual([2]);
    expect(pickFrames([], 100)).toEqual([]);
  });
});

describe("toContractTerms", () => {
  const raw = (o: Record<string, unknown>) => ({
    index: 0, checkable: true, kind: "min_seconds_total", seconds: 0, withinFirstSec: 0, fraction: 0, forSeconds: 0, minTimes: 0, ...o,
  });

  it("maps each kind and drops unused fields", () => {
    const terms = toContractTerms(["a", "b", "c"], {
      rules: [
        raw({ index: 0, kind: "min_seconds_within", seconds: 3, withinFirstSec: 10 }),
        raw({ index: 1, kind: "mentioned", minTimes: 2 }),
        raw({ index: 2, kind: "min_area", fraction: 0.1, forSeconds: 2 }),
      ],
    });
    expect(terms.map((t) => t.rule)).toEqual([
      { kind: "min_seconds_within", seconds: 3, withinFirstSec: 10 },
      { kind: "mentioned", minTimes: 2 },
      { kind: "min_area", fraction: 0.1, forSeconds: 2 },
    ]);
  });

  it("leaves terms unchecked when the model says so, omits them, or returns nonsense", () => {
    const terms = toContractTerms(["a", "b", "c"], {
      rules: [raw({ index: 0, checkable: false }), raw({ index: 2, seconds: -1 })],
    });
    expect(terms.map((t) => t.rule)).toEqual([null, null, null]);
    expect(toContractTerms(["a"], null)).toEqual([{ text: "a", rule: null }]);
  });
});

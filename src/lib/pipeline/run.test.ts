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
const samStream = sse([
  { type: "response.created" },
  { type: "response.output_text.delta", ...lane, delta: SAM_TEXT },
  { type: "response.output_text.done", ...lane, text: SAM_TEXT },
  { type: "response.completed", response: { status: "completed", usage: { video_frames_processed: 15 } } },
] as { type: string }[]);

const sparkReply = (payload: unknown) =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(payload) }] }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

function fakeApi(verdict: "match" | "lookalike"): { fetch: FetchLike; paths: string[] } {
  const paths: string[] = [];
  const fetch: FetchLike = async (url, init) => {
    const path = new URL(url).pathname;
    paths.push(path);
    if (path === "/v1/files") return Response.json({ id: "file-1" });
    if (path === "/v1/asr/transcribe")
      return Response.json({ transcript: "love my Celsius", turns: [{ startMs: 0, endMs: 900, transcript: "love my Celsius" }] });
    if (path === "/v1/responses") {
      const body = JSON.parse(String(init?.body));
      if (body.model === "sam-3.1") return new Response(samStream, { status: 200 });
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

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "st-run-"));
  const src = join(dir, "src.mp4");
  execFileSync(ffmpegStatic as string, [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", "testsrc=size=320x334:rate=30:duration=1",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=1",
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
    expect(report.cost).toEqual({ samFrames: 15, usd: 0.01 }); // 15 frames, billed at the 50-frame minimum
  }, 30_000);

  it("drops look-alikes from the metrics", async () => {
    const { dir, src, guard } = await setup();
    const report = await runVideo(base(dir, src, guard, fakeApi("lookalike").fetch));
    expect(report.tracks[0].verdict).toBe("lookalike");
    expect(report.metrics.secondsOnScreen).toBe(0);
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

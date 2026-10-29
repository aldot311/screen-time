import { execFileSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { describe, expect, it } from "vitest";
import { CostGuard, CostLimitError, type FetchLike } from "@/lib/meta";
import { disclosureFrames, pickFrames, runVideo } from "./run";
import type { LiveProgress } from "@/lib/types";
import { toChecks, disclosurePrompt, parseTermsPrompt, TERMS_SCHEMA, toContractTerms, toOnScreen, toSuggestion, verifyPrompt } from "./prompts";
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
    // The receipt lists every model call in order, and its amounts add up to the report's cost.
    const r = report.receipt!;
    expect(r.models).toEqual({ sam: "sam-3.1", spark: "muse-spark-1.3", transcribe: "muse-voice-transcribe-1.0" });
    expect(r.fps).toBe(15);
    expect(r.calls.map((c) => c.model)).toEqual(["Files API", "sam-3.1", "muse-spark-1.3", "muse-voice-transcribe-1.0", "muse-spark-1.3"]);
    expect(r.calls[1].output).toBe("15 frames processed, 1 object tracked");
    expect(r.calls[2].output).toBe("match, clear");
    expect(r.calls.reduce((n, c) => n + c.usd, 0)).toBeCloseTo(report.cost.usd, 10);
    expect(r.calls.every((c) => c.ms >= 0)).toBe(true);
  }, 30_000);

  it("reports each step as it starts, in order", async () => {
    const { dir, src, guard } = await setup();
    const steps: string[] = [];
    await runVideo({ ...base(dir, src, guard, fakeApi("match").fetch), onStep: (s) => void steps.push(s) });
    expect(steps).toEqual(["normalize", "track", "verify", "listen", "measure", "contract"]);
  }, 30_000);

  it("reports what each stage found as it goes, and a failing progress callback never stops the run", async () => {
    const { dir, src, guard } = await setup();
    const seen: LiveProgress[] = [];
    const report = await runVideo({
      ...base(dir, src, guard, fakeApi("match").fetch),
      onProgress: (p) => {
        seen.push(p);
        if (seen.length === 2) throw new Error("store down");
      },
    });
    const last = seen.at(-1)!;
    // Each update only adds to the last: video, then SAM, then each Muse Spark call, then audio, measure and terms.
    expect(Object.keys(seen[0])).toEqual(["video"]);
    expect(seen.map((p) => Object.keys(p).length)).toEqual([...seen.map((p) => Object.keys(p).length)].sort((a, b) => a - b));
    expect(last.video?.frameCount).toBe(report.info.frameCount);
    expect(last.searches?.[0].objects).toBe(report.tracks.length);
    expect(last.searches?.[0].boxes.every((b) => b.frame < report.info.frameCount)).toBe(true);
    expect(last.checks?.map((c) => c.verdict).sort()).toEqual(report.tracks.map((t) => t.verdict).sort());
    expect(last.measured?.secondsOnScreen).toBe(report.metrics.secondsOnScreen);
    expect(last.terms?.map((t) => t.pass)).toEqual(report.terms.map((t) => t.pass));
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

// SAM finds nothing for the brand's prompt; Muse Spark suggests `suggestion`; SAM finds the product with "cup".
function agentApi(suggestion: { visible: boolean; prompt: string; reason: string }): { fetch: FetchLike; samPrompts: string[] } {
  const samPrompts: string[] = [];
  const { fetch: ok } = fakeApi("match");
  const empty = sse([
    { type: "response.created" },
    { type: "response.output_text.done", ...lane, text: "" },
    { type: "response.completed", response: { status: "completed", usage: { video_frames_processed: 15 } } },
  ] as { type: string }[]);
  const fetch: FetchLike = async (url, init) => {
    if (new URL(url).pathname === "/v1/responses") {
      const body = JSON.parse(String(init?.body));
      if (body.model === "sam-3.1") {
        const prompt = body.input[0].content[0].text;
        samPrompts.push(prompt);
        return new Response(prompt === "cup" ? samStream(15) : empty, { status: 200 });
      }
      if (body.text?.format?.name === "prompt_suggestion") return sparkReply(suggestion);
    }
    return ok(url, init);
  };
  return { fetch, samPrompts };
}

describe("runVideo prompt recovery", () => {
  it("retries SAM once with Muse Spark's suggestion when the first prompt finds nothing", async () => {
    const { dir, src, guard } = await setup();
    const { fetch, samPrompts } = agentApi({ visible: true, prompt: "Cup", reason: "The tumbler is held like a cup." });
    const report = await runVideo({ ...base(dir, src, guard, fetch), prompt: "tumbler" });

    expect(samPrompts).toEqual(["tumbler", "cup"]);
    expect(report.prompt).toBe("cup");
    expect(report.promptAttempts).toEqual([
      { prompt: "tumbler", objects: 0, matched: 0, samFrames: 15, next: "The tumbler is held like a cup." },
      { prompt: "cup", objects: 1, matched: 1, samFrames: 15 },
    ]);
    expect(report.metrics.secondsOnScreen).toBeCloseTo(2 / 15);
    // Two SAM passes $0.02 + suggestion $0.02 + verify $0.02 + transcribe $0.01 + terms $0.02.
    expect(report.cost).toEqual({ samFrames: 30, usd: 0.09 });
    expect(await guard.totalSpentUsd()).toBeCloseTo(0.09, 10);
  }, 30_000);

  it("does not pay for a second SAM pass when the product is not in the video", async () => {
    const { dir, src, guard } = await setup();
    const { fetch, samPrompts } = agentApi({ visible: false, prompt: "", reason: "No teal can appears." });
    const report = await runVideo({ ...base(dir, src, guard, fetch), prompt: "tumbler" });
    expect(samPrompts).toEqual(["tumbler"]);
    expect(report.prompt).toBe("tumbler");
    expect(report.promptAttempts).toBeUndefined();
    expect(report.metrics.secondsOnScreen).toBe(0);
  }, 30_000);

  it("skips the retry when the budget could not also cover the rest of the run, and still finishes", async () => {
    const { dir, src } = await setup();
    const guard = new CostGuard({ maxUsdPerRun: 0.08, maxUsdTotal: 1, ledgerPath: join(dir, "tight.json") });
    const { fetch, samPrompts } = agentApi({ visible: true, prompt: "cup", reason: "r" });
    const report = await runVideo({ ...base(dir, src, guard, fetch), prompt: "tumbler" });
    expect(samPrompts).toEqual(["tumbler"]);
    expect(report.terms).toHaveLength(1);
    expect(report.cost.usd).toBeCloseTo(0.04, 10); // SAM + transcribe + terms, no suggestion
  }, 30_000);

  it("keeps the first pass when the recovery call fails", async () => {
    const { dir, src, guard } = await setup();
    const { fetch: agent } = agentApi({ visible: true, prompt: "cup", reason: "r" });
    const fetch: FetchLike = async (url, init) => {
      const body = new URL(url).pathname === "/v1/responses" ? JSON.parse(String(init?.body)) : null;
      if (body?.text?.format?.name === "prompt_suggestion")
        return Response.json({ error: { message: "down", type: "server_error", code: "x" } }, { status: 400 });
      return agent(url, init);
    };
    const report = await runVideo({ ...base(dir, src, guard, fetch), prompt: "tumbler" });
    expect(report.prompt).toBe("tumbler");
    expect(report.promptAttempts).toBeUndefined();
    expect(report.terms).toHaveLength(1);
    // The failed call is on the receipt with its kept reservation, so the receipt still adds up to the cost.
    const failed = report.receipt!.calls.find((c) => c.purpose === "Suggest another search word");
    expect(failed?.output).toMatch(/^failed: /);
    expect(report.receipt!.calls.reduce((n, c) => n + c.usd, 0)).toBeCloseTo(report.cost.usd, 10);
  }, 30_000);

  it("ignores a suggestion that repeats the prompt already tried", async () => {
    const { dir, src, guard } = await setup();
    const { fetch, samPrompts } = agentApi({ visible: true, prompt: " Tumbler ", reason: "It is a tumbler." });
    await runVideo({ ...base(dir, src, guard, fetch), prompt: "tumbler" });
    expect(samPrompts).toEqual(["tumbler"]);
  }, 30_000);

  it("never asks for a suggestion when the first prompt finds the product", async () => {
    const { dir, src, guard } = await setup();
    const { fetch, paths } = fakeApi("match");
    const report = await runVideo(base(dir, src, guard, fetch));
    expect(paths.filter((p) => p === "/v1/responses")).toHaveLength(3);
    expect(report.promptAttempts).toBeUndefined();
  }, 30_000);
});

describe("toSuggestion", () => {
  it("accepts a short new prompt and rejects the rest", () => {
    expect(toSuggestion({ visible: true, prompt: "Water Bottle!", reason: "r" }, ["bottle"])).toEqual({ prompt: "water bottle", reason: "r" });
    expect(toSuggestion({ visible: false, prompt: "cup", reason: "" }, [])).toBeNull();
    expect(toSuggestion({ visible: true, prompt: "", reason: "" }, [])).toBeNull();
    expect(toSuggestion({ visible: true, prompt: "a very long noun phrase", reason: "" }, [])).toBeNull();
    expect(toSuggestion({ visible: true, prompt: "CUP", reason: "" }, ["cup"])).toBeNull();
    expect(toSuggestion(null, [])).toBeNull();
    expect(toSuggestion({ rules: [] }, [])).toBeNull();
  });
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

describe("disclosure prompts", () => {
  it("lets the terms parser produce a disclosed rule", () => {
    expect(TERMS_SCHEMA.properties.rules.items.properties.kind.enum).toContain("disclosed");
    expect(parseTermsPrompt(["Disclose the sponsorship"])).toContain("- disclosed: the creator discloses the sponsorship");
    const raw = { index: 0, checkable: true, kind: "disclosed", seconds: 0, withinFirstSec: 0, fraction: 0, forSeconds: 0, minTimes: 0 };
    expect(toContractTerms(["Disclose it"], { rules: [raw] })[0].rule).toEqual({ kind: "disclosed" });
  });

  it("maps on-screen answers to frame times and drops malformed ones", () => {
    const times = [0.5, 1.5, 2.5];
    expect(
      toOnScreen(
        { disclosed: true, frames: [{ index: 2, text: " #ad " }, { index: 0, text: "Sponsored  by Alani" }, { index: 5, text: "x" }, { index: 1, text: "" }, { index: 2, text: "dup" }] },
        times,
      ),
    ).toEqual([{ startSec: 0.5, text: "Sponsored by Alani" }, { startSec: 2.5, text: "#ad" }]);
    expect(toOnScreen({ disclosed: false, frames: [{ index: 0, text: "#ad" }] }, times)).toEqual([]);
    expect(toOnScreen(null, times)).toEqual([]);
  });

  it("asks only for text burned into the video, never a platform UI label", () => {
    const p = disclosurePrompt(6);
    expect(p).toContain("text overlaid on the video by the creator (caption stickers,");
    expect(p).toContain('"#partner"');
    expect(p).not.toMatch(/paid partnership/i);
  });

  it("tells Muse Spark which image is the reference photo", () => {
    expect(verifyPrompt("a teal can", "drink can", true)).toMatch(/^The first image is the brand's reference photo/);
    expect(verifyPrompt("a teal can", "drink can")).not.toContain("reference photo");
  });
});

describe("runVideo product photo and disclosure", () => {
  const PHOTO = "data:image/png;base64,iVBORw0KGgo=";

  // Records every Spark request body; the terms parser answers with a "disclosed" rule when asked to.
  function recordingApi(opts: { disclosedTerm: boolean; transcript?: string; onScreen?: unknown }) {
    const bodies: { name?: string; input: { type: string; text?: string; image_url?: string }[] }[] = [];
    const { fetch: ok } = fakeApi("match");
    const fetch: FetchLike = async (url, init) => {
      const path = new URL(url).pathname;
      if (path === "/v1/asr/transcribe" && opts.transcript) {
        return Response.json({ transcript: opts.transcript, turns: [{ startMs: 0, endMs: 1000, transcript: opts.transcript }] });
      }
      if (path === "/v1/responses") {
        const body = JSON.parse(String(init?.body));
        if (body.model !== "sam-3.1") bodies.push({ name: body.text?.format?.name, input: body.input[0].content });
        if (body.text?.format?.name === "contract_rules" && opts.disclosedTerm) {
          return sparkReply({
            rules: [{ index: 0, checkable: true, kind: "disclosed", seconds: 0, withinFirstSec: 0, fraction: 0, forSeconds: 0, minTimes: 0 }],
          });
        }
        if (body.text?.format?.name === "disclosure_check") return sparkReply(opts.onScreen ?? { disclosed: false, frames: [] });
      }
      return ok(url, init);
    };
    return { fetch, bodies };
  }

  it("sends the product photo first in each verification and reports it was used", async () => {
    const { dir, src, guard } = await setup();
    const { fetch, bodies } = recordingApi({ disclosedTerm: false });
    const report = await runVideo({ ...base(dir, src, guard, fetch), productImageUrl: PHOTO, productImageSource: "/api/store/file?path=x" });
    const verify = bodies.find((b) => b.name === "product_check")!;
    expect(verify.input[0].text).toMatch(/^The first image is the brand's reference photo/);
    expect(verify.input[1]).toEqual({ type: "input_image", image_url: PHOTO });
    expect(verify.input.slice(2).every((p) => p.image_url?.startsWith("data:image/jpeg;base64,"))).toBe(true);
    expect(report.usedProductPhoto).toBe(true);
    // The stored photo's URL, never the data URL sent to Muse Spark.
    expect(report.productImageUrl).toBe("/api/store/file?path=x");
  }, 30_000);

  it("reports the photo unused when there is none", async () => {
    const { dir, src, guard } = await setup();
    const { fetch, bodies } = recordingApi({ disclosedTerm: false });
    const report = await runVideo(base(dir, src, guard, fetch));
    expect(bodies.find((b) => b.name === "product_check")!.input.filter((p) => p.type === "input_image")).toHaveLength(2);
    expect(report.usedProductPhoto).toBe(false);
    expect(report.productImageUrl).toBeUndefined();
  }, 30_000);

  it("skips the on-screen check, and leaves disclosure unchecked, when no term asks for it", async () => {
    const { dir, src, guard } = await setup();
    const { fetch, bodies } = recordingApi({ disclosedTerm: false, transcript: "this is an ad" });
    const report = await runVideo(base(dir, src, guard, fetch));
    expect(bodies.map((b) => b.name)).not.toContain("disclosure_check");
    expect(report.disclosure).toBeUndefined();
    expect(report.cost.usd).toBeCloseTo(0.06, 10);
  }, 30_000);

  it("reads frames for #ad when a term asks, and fails the term when nothing is said or shown", async () => {
    const { dir, src, guard } = await setup();
    const { fetch, bodies } = recordingApi({ disclosedTerm: true });
    const report = await runVideo({ ...base(dir, src, guard, fetch), contractTerms: ["Disclose the sponsorship"] });
    const check = bodies.find((b) => b.name === "disclosure_check")!;
    // A 1 s clip has 15 frames: ten evenly spaced ones are all distinct.
    expect(check.input.filter((p) => p.type === "input_image")).toHaveLength(10);
    expect(report.disclosure).toEqual({ spoken: [], onScreen: [], onScreenChecked: true });
    expect(report.terms[0]).toMatchObject({ pass: false, detail: "Not disclosed: no “ad” or “sponsored” said or shown on screen" });
    // SAM $0.01 + verify $0.02 + transcribe $0.01 + terms $0.02 + disclosure $0.02.
    expect(report.cost.usd).toBeCloseTo(0.08, 10);
    expect(await guard.totalSpentUsd()).toBeCloseTo(0.08, 10);
  }, 30_000);

  it("passes on a spoken or an on-screen disclosure", async () => {
    const { dir, src, guard } = await setup();
    const spoken = await runVideo({
      ...base(dir, src, guard, recordingApi({ disclosedTerm: true, transcript: "hey this is an ad" }).fetch),
      contractTerms: ["Disclose the sponsorship"],
    });
    expect(spoken.disclosure?.spoken.map((m) => m.text)).toEqual(["this is an ad"]);
    expect(spoken.terms[0]).toMatchObject({ pass: true, detail: "Disclosed: said “this is an ad” at 0:00.2" });

    const shown = await runVideo({
      ...base(dir, src, guard, recordingApi({ disclosedTerm: true, onScreen: { disclosed: true, frames: [{ index: 0, text: "#ad" }] } }).fetch),
      videoId: "v2",
      contractTerms: ["Disclose the sponsorship"],
    });
    expect(shown.disclosure?.onScreen).toEqual([{ startSec: 0, text: "#ad" }]);
    expect(shown.terms[0].pass).toBe(true);
  }, 30_000);

  it("finishes the report when the frame check fails, marking it unchecked", async () => {
    const { dir, src, guard } = await setup();
    const { fetch: ok } = recordingApi({ disclosedTerm: true });
    const fetch: FetchLike = async (url, init) => {
      const body = new URL(url).pathname === "/v1/responses" ? JSON.parse(String(init?.body)) : null;
      if (body?.text?.format?.name === "disclosure_check")
        return Response.json({ error: { message: "bad", type: "invalid_request_error", code: "x" } }, { status: 400 });
      return ok(url, init);
    };
    const report = await runVideo({ ...base(dir, src, guard, fetch), contractTerms: ["Disclose the sponsorship"] });
    expect(report.disclosure).toEqual({ spoken: [], onScreen: [], onScreenChecked: false });
    expect(report.terms[0]).toMatchObject({ pass: null, detail: "Not checked on screen: the frame check failed" });

    // Spoken disclosure still passes when the frame check fails.
    const { fetch: talk } = recordingApi({ disclosedTerm: true, transcript: "this is an ad" });
    const failing: FetchLike = async (url, init) => {
      const body = new URL(url).pathname === "/v1/responses" ? JSON.parse(String(init?.body)) : null;
      if (body?.text?.format?.name === "disclosure_check") throw new TypeError("network down");
      return talk(url, init);
    };
    const spoken = await runVideo({ ...base(dir, src, guard, failing), videoId: "v2", contractTerms: ["Disclose it"] });
    expect(spoken.disclosure?.onScreenChecked).toBe(false);
    expect(spoken.terms[0].pass).toBe(true);
  }, 30_000);

  it("finishes the report when the budget cannot cover the frame check", async () => {
    const { dir, src } = await setup();
    // SAM $0.01 + verify $0.02 + transcribe $0.01 + terms $0.02 = $0.06 fits; the $0.02 frame check does not.
    const guard = new CostGuard({ maxUsdPerRun: 0.07, maxUsdTotal: 1, ledgerPath: join(dir, "tight-ad.json") });
    const { fetch, bodies } = recordingApi({ disclosedTerm: true });
    const report = await runVideo({ ...base(dir, src, guard, fetch), contractTerms: ["Disclose the sponsorship"] });
    expect(bodies.map((b) => b.name)).not.toContain("disclosure_check");
    expect(report.disclosure?.onScreenChecked).toBe(false);
    expect(report.cost.usd).toBeCloseTo(0.06, 10);
  }, 30_000);
});

describe("disclosureFrames", () => {
  const sec = (frames: number[]) => frames.map((f) => Math.round((f / 15) * 100) / 100);

  it("always reads 0.5 s, 1.5 s and 3 s, then spreads the rest evenly", () => {
    const frames = disclosureFrames(60 * 15); // a 60 s clip
    expect(frames).toHaveLength(10);
    // The frames that contain 0.5 s, 1.5 s and 3 s at 15 fps.
    expect(frames.slice(0, 3)).toEqual([7, 22, 45]);
    const rest = sec(frames.slice(3));
    expect(rest[0]).toBeGreaterThan(3);
    expect(rest.at(-1)!).toBeLessThan(60);
    expect(rest.at(-1)!).toBeGreaterThanOrEqual(59); // the closing seconds are read, not skipped
    const gaps = rest.slice(1).map((t, i) => t - rest[i]);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.2);
  });

  it("stays distinct, ordered and inside short clips", () => {
    const one = disclosureFrames(15); // 1 s
    expect(one).toEqual([...new Set(one)].sort((a, b) => a - b));
    expect(one.every((f) => f >= 0 && f < 15)).toBe(true);
    expect(disclosureFrames(4)).toHaveLength(4);
    const four = disclosureFrames(4 * 15); // 4 s: opening three, then seven between 3 s and 4 s
    expect(four.slice(0, 3)).toEqual([7, 22, 45]);
    expect(four.every((f) => f < 60)).toBe(true);
    expect(new Set(four).size).toBe(four.length);
    expect(disclosureFrames(0)).toEqual([]);
  });

  it("never asks for more than the 50 images the API accepts", () => {
    expect(disclosureFrames(10 * 60 * 15, 80)).toHaveLength(50);
  });
});

describe("toChecks", () => {
  it("keeps up to six well-formed feature checks and drops the rest", () => {
    expect(
      toChecks([
        { feature: "  teal   can ", seen: "yes" },
        { feature: "pink Alani script", seen: "no" },
        { feature: "", seen: "yes" },
        { feature: "peach graphic", seen: "maybe" },
        { feature: 3, seen: "yes" },
        null,
        ...Array.from({ length: 8 }, (_, i) => ({ feature: `f${i}`, seen: "unclear" })),
      ]),
    ).toEqual([
      { feature: "teal can", seen: "yes" },
      { feature: "pink Alani script", seen: "no" },
      { feature: "f0", seen: "unclear" },
      { feature: "f1", seen: "unclear" },
      { feature: "f2", seen: "unclear" },
      { feature: "f3", seen: "unclear" },
    ]);
    expect(toChecks(undefined)).toEqual([]);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tenths } from "@/components/format";
import { describe, expect, it } from "vitest";
import { SAM_USD_PER_FRAME } from "@/lib/meta/cost-guard";
import { campaignCsv, CSV_HEADER } from "@/lib/campaign/csv";
import type { VideoEntry } from "@/lib/campaign/types";
import type { TrackVerification, VideoReport } from "@/lib/types";
import { costGloss, modelLine, notCounted, notCountedLane, notCountedNote, notCountedPlay, phoneChip, prominenceGloss, RECEIPT_RATES, receiptUsd } from "./report-words";

const line = (o: Partial<Parameters<typeof modelLine>[0]>) =>
  modelLine({ frames: 227, prompt: "drink can", brand: "LaCroix", found: true, tracks: 1, notCounted: { lookalikes: 0, unclear: 0 }, photo: true, ...o });

describe("prominenceGloss", () => {
  it("states the weights from compute.ts and that it never moves pay or hold", () => {
    expect(prominenceGloss()).toBe(
      "40% share of the video, 30% size (full marks at 15% of the frame), 20% how centered, 10% how early; scaled down under 3% of the frame. For context only: it never changes pay or hold.",
    );
    expect(prominenceGloss()).not.toMatch(/50/);
  });
});

describe("receipt cost words", () => {
  it("uses the same rates the pipeline charges", () => {
    expect(RECEIPT_RATES.samPer1000Frames / 1000).toBeCloseTo(SAM_USD_PER_FRAME, 12);
    // run.ts keeps its per-call reserves private; read them from the source so a change there fails here.
    const run = readFileSync(join(process.cwd(), "src/lib/pipeline/run.ts"), "utf8");
    expect(Number(run.match(/const SPARK_RESERVE_USD = ([\d.]+);/)?.[1])).toBe(RECEIPT_RATES.sparkPerCall);
    expect(Number(run.match(/const TRANSCRIBE_RESERVE_USD = ([\d.]+);/)?.[1])).toBe(RECEIPT_RATES.transcribePerCall);
  });

  it("says it in one line", () => {
    expect(costGloss()).toBe(
      "SAM 3.1 is billed per frame ($0.20 per 1,000); Muse Spark and Voice Transcribe count the fixed amount the budget reserves per call ($0.02 / $0.01), not the billed amount.",
    );
  });

  it("writes every amount to the tenth of a cent, so the report and its receipt agree", () => {
    expect(receiptUsd(0.1048)).toBe("$0.105");
    expect(receiptUsd(0.115)).toBe("$0.115");
    expect(receiptUsd(0.0644)).toBe("$0.064");
    expect(receiptUsd(0.0034)).toBe("$0.0034");
    expect(receiptUsd(0)).toBe("$0.000");
  });
});

describe("not counted: look-alike vs unclear", () => {
  const tracks = (...v: TrackVerification["verdict"][]) => v.map((verdict) => ({ verdict }));

  it("splits a look-alike from an object Muse Spark could not make out", () => {
    expect(notCounted(tracks("match", "lookalike", "unclear", "unclear"))).toEqual({ lookalikes: 1, unclear: 2 });
    expect(notCounted(tracks("match"))).toEqual({ lookalikes: 0, unclear: 0 });
  });

  it("never calls an unclear object a look-alike", () => {
    const george = notCounted(tracks("unclear"));
    for (const words of [notCountedLane(george), notCountedNote(george), notCountedPlay(george), line({ found: false, notCounted: george })])
      expect(words).not.toMatch(/look-alike/i);
    expect(notCountedLane(george)).toBe("Unclear, not counted");
    expect(line({ found: false, notCounted: george })).toBe(
      "Meta’s SAM 3.1 boxed every “drink can” in all 227 frames; Meta’s Muse Spark could not tell if the drink can was the LaCroix product, so nothing counted.",
    );
  });

  it("names a look-alike as one, and both when there are both", () => {
    const aldo = { lookalikes: 1, unclear: 0 };
    expect(notCountedLane(aldo)).toBe("Look-alike, not counted");
    expect(notCountedNote(aldo)).toBe("Dashed red was rejected by Muse Spark as a look-alike.");
    expect(notCountedPlay(aldo)).toBe("Play the rejected look-alike");
    expect(notCountedLane({ lookalikes: 1, unclear: 1 })).toBe("Look-alike or unclear, not counted");
    expect(notCountedNote({ lookalikes: 0, unclear: 0 })).toBe("");
  });

  it("counts look-alikes the way the CSV does", () => {
    const report = (verdicts: TrackVerification["verdict"][]) =>
      ({
        info: { width: 1080, height: 1920, frameCount: 150, durationSec: 10 },
        prompt: "drink can",
        tracks: verdicts.map((verdict, objectId) => ({ objectId, verdict, visibility: "clear", reason: "" })),
        metrics: { secondsOnScreen: 0, shareOfVideo: 0, firstSeenSec: null, longestRunSec: 0, avgAreaFraction: 0, centerWeightedSec: 0, prominenceScore: 0, segments: [], mentions: [] },
        terms: [],
        cost: { samFrames: 150, usd: 0.1 },
      }) as unknown as VideoReport;
    const videos = [
      ["george", ["unclear"]],
      ["aldo", ["lookalike"]],
      ["aldo-2", ["lookalike", "match"]],
    ].map(([id, v], i) => ({ id, campaignId: "c", creator: id, title: `${id}.mp4`, status: "done", createdAt: `2026-11-0${i + 1}T00:00:00Z`, report: report(v as TrackVerification["verdict"][]) }) as unknown as VideoEntry);
    const col = CSV_HEADER.indexOf("lookalikes_rejected");
    const csv = campaignCsv(videos)
      .trim()
      .split("\r\n")
      .slice(1)
      .map((row) => Number(row.split(",")[col]));
    const fromWords = videos.map((v) => notCounted(v.report!.tracks).lookalikes);
    expect(fromWords).toEqual(csv);
    expect(fromWords).toEqual([0, 1, 1]);
  });
});

describe("modelLine", () => {
  it("says what each model did on a clean report", () => {
    expect(line({})).toBe(
      "Meta’s SAM 3.1 boxed every “drink can” in all 227 frames; Meta’s Muse Spark checked each against your photo and confirmed the LaCroix product.",
    );
    expect(line({ photo: false })).toContain("checked each against the brief");
  });

  it("names what it left out", () => {
    expect(line({ tracks: 2, notCounted: { lookalikes: 1, unclear: 0 } })).toBe(
      "Meta’s SAM 3.1 boxed every “drink can” in all 227 frames; Meta’s Muse Spark confirmed the LaCroix product and rejected 1 look-alike.",
    );
    expect(line({ tracks: 3, notCounted: { lookalikes: 1, unclear: 1 } })).toContain("rejected 1 look-alike and left out 1 unclear object.");
    expect(line({ found: false, notCounted: { lookalikes: 1, unclear: 0 } })).toMatch(/rejected 1 look-alike, so nothing counted\.$/);
    expect(line({ found: false, tracks: 2, notCounted: { lookalikes: 0, unclear: 2 } })).toMatch(/left out 2 unclear objects, so nothing counted\.$/);
  });

  it("says when SAM found nothing to check", () => {
    expect(line({ found: false, tracks: 0 })).toBe("Meta’s SAM 3.1 searched all 227 frames for “drink can” and found nothing for Muse Spark to check.");
  });
});

describe("phoneChip", () => {
  const base = { word: "Hold", fee: " $300", reason: "Never said “LaCroix”", creator: "Ash", replaced: false };

  it("shows the recommendation and its reason", () => {
    expect(phoneChip(base)).toEqual({ kind: "verdict", badge: "Hold $300", text: "Never said “LaCroix”" });
  });

  it("says a replaced take no longer decides, whatever it held or a call made on it", () => {
    const chip = phoneChip({ ...base, replaced: true, override: { decision: "pay" } });
    expect(chip).toEqual({ kind: "replaced", badge: "Replaced", text: "by Ash’s re-cut" });
    expect(`${chip.badge} ${chip.text}`).not.toMatch(/Hold|\$300|Never said/);
  });

  it("puts the manager's own call first, beside what Screen-Time said", () => {
    expect(phoneChip({ ...base, override: { decision: "pay" } })).toEqual({ kind: "override", badge: "Pay $300", text: "Your call · Screen-Time said hold" });
    expect(phoneChip({ ...base, fee: "", override: { decision: "hold" } }).badge).toBe("Hold");
  });
});

describe("accuracyGloss", () => {
  it("gives the measured figures, on the Reels as delivered, and whose labels they were scored against", async () => {
    const { accuracyGloss } = await import("./report-words");
    const text = accuracyGloss();
    expect(text).toMatch(/^Measured frame by frame on 11 test Reels as delivered, against labels a person checked: precision \d+\.\d%, recall \d+\.\d%\./);
    expect(text).toMatch(/Precision is the share of the seconds Screen-Time counted that really showed the product/);
    expect(text).not.toMatch(/This Reel is one of/);
    expect(text).not.toMatch(/checked labels/);
  });

  it("says what a scored report counted against its own labels when that differs (George), and nothing extra when it does not", async () => {
    const { accuracyGloss } = await import("./report-words");
    const data = (await import("@/lib/accuracy-data.json")).default as import("./accuracy-summary").AccuracyData;
    const george = data.reports!.find((r) => r.clip === "lacroix/lc-1-george")!;
    const row = data.scores.find((s) => s.mode === "verified")!.rows.find((r) => r.clip === george.clip)!;
    const text = accuracyGloss({ receipt: { runId: george.runId! } });
    expect(text).toContain(`This Reel is one of the 11: its labels mark ${tenths(row.truthSec)} s with the product, and this report counted ${tenths(row.predictedSec)} s.`);
    const lana = data.reports!.find((r) => r.clip === "lacroix/lc-4-lana")!;
    expect(accuracyGloss({ receipt: { runId: lana.runId! } })).not.toMatch(/This Reel is one of/);
    // Another run of the same Reel is not the scored run: it gets the headline only.
    expect(accuracyGloss({ receipt: { runId: "george-2026-11-05T00:00:00.000Z" } })).not.toMatch(/This Reel is one of/);
  });

  it("says the labels were checked by a person only when every clip was", async () => {
    const { accuracyGloss } = await import("./report-words");
    const data = (await import("@/lib/accuracy-data.json")).default as import("./accuracy-summary").AccuracyData;
    const all = { ...data, labels: { clips: 11, checkedByPerson: 11, checkedBy: {} } };
    expect(accuracyGloss(undefined, all)).toMatch(/as delivered, against labels a person checked: precision/);
    const some = { ...data, labels: { clips: 11, checkedByPerson: 4, checkedBy: {} } };
    expect(accuracyGloss(undefined, some)).toMatch(/a person has checked 4 of the 11/);
  });
});

import { describe, expect, it } from "vitest";
import type { ReceiptCall, RunReceipt } from "@/lib/types";
import { receiptSplit, reservedCall } from "./run-receipt";

const call = (model: string, usd: number, output = "ok"): ReceiptCall => ({ model, purpose: "", input: "", output, ms: 1000, usd });
const models = { sam: "sam-3.1", spark: "muse-spark-1.3", transcribe: "muse-voice-transcribe-1.0" };

describe("the run receipt's billed and reserved amounts", () => {
  // Michael K's stored receipt: the upload, one SAM pass, three Muse Spark calls and one Voice Transcribe call.
  const michaelK: RunReceipt = {
    runId: "6-michael-captioned-gk3bzd-2026-11-03T20:33:30.514Z",
    startedAt: "2026-11-03T20:33:30.514Z",
    fps: 15,
    models,
    calls: [
      call("Files API", 0, "file id received"),
      call("sam-3.1", 0.0436, "218 frames processed, 1 object tracked"),
      call("muse-spark-1.3", 0.02, "match, blurred"),
      call("muse-voice-transcribe-1.0", 0.01, "4 speech turns, 42 words"),
      call("muse-spark-1.3", 0.02, "3 of 3 checkable"),
      call("muse-spark-1.3", 0.02, "“AN AD”"),
    ],
  };

  it("bills SAM 3.1 and counts Muse Spark and Voice Transcribe at what each call reserves", () => {
    expect(michaelK.calls.map((c) => reservedCall(c, models))).toEqual([false, false, true, true, true, true]);
    const { billed, reserved } = receiptSplit(michaelK);
    expect(billed).toBeCloseTo(0.0436);
    expect(reserved).toBeCloseTo(0.07);
  });

  it("counts a failed call's kept reservation as reserved, and an open-weight check too", () => {
    expect(reservedCall(call("sam-3.1", 0.0436, "failed: 503 backend_unavailable"), models)).toBe(true);
    expect(reservedCall(call("sam-3.1", 0, "failed: 400 bad request"), models)).toBe(false);
    expect(reservedCall(call("muse-spark-open (open weights, Example)", 0.02), { ...models, check: "muse-spark-open (open weights, Example)" })).toBe(true);
  });
});

// One video through the whole pipeline: normalize → track (SAM 3.1) → verify (Muse Spark) → listen
// (Voice Transcribe) → measure → check contract terms. Every billed call reserves its cost in the CostGuard first.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CostGuard, CostLimitError, MetaApiError, MODELS, requestTimeoutMs, SAM_USD_PER_FRAME, samVideo, sparkJson, transcribe, uploadFile, type ClientOptions } from "@/lib/meta";
import { checkTerms, computeMetrics, findDisclosures, findMentions, frameSamples } from "@/lib/metrics";
import { distinctNames } from "@/lib/metrics/mentions";
import { extractFrameJpeg, extractWav, normalizeVideo } from "@/lib/media";
import { parseSamVideo } from "@/lib/sam";
import type { SparkContentPart } from "@/lib/meta/client";
import { openJson, openModelName, type OpenWeightConfig } from "@/lib/meta/open-weight";
import { evenFrames, filmstripBoxes } from "@/lib/frames";
export { evenFrames } from "@/lib/frames";
import type { StepId } from "@/lib/campaign/types";
import { FPS, type ContractTerm, type Detection, type Disclosure, type Mention, type PromptAttempt, type Track, type LiveProgress, type ReceiptCall, type TermResult, type TrackVerification, type VerifyVerdict, type VideoMetrics, type VideoReport } from "@/lib/types";
import {
  DISCLOSURE_FRAMES,
  DISCLOSURE_OPENING_SEC,
  DISCLOSURE_SCHEMA,
  MAX_SPARK_IMAGES,
  disclosurePrompt,
  parseTermsPrompt,
  SUGGEST_SCHEMA,
  suggestPromptText,
  TERMS_SCHEMA,
  toChecks,
  toContractTerms,
  toOnScreen,
  toSuggestion,
  VERIFY_SCHEMA,
  verifyPrompt,
  type VerifyOutput,
} from "./prompts";

// Spark and transcription are billed by tokens and audio seconds; these are generous per-call reserves
// so the guard still blocks a runaway loop of them.
const SPARK_RESERVE_USD = 0.02;
// One extra SAM pass at most: a retry costs as much as the first pass.
export const MAX_PROMPT_RETRIES = 1;
// Frames Spark sees when it looks for the product the first prompt missed.
const SUGGEST_FRAMES = 4;

// Verifications budgeted for when deciding whether a retry fits: most clips track one to three objects.
const RETRY_VERIFY_TRACKS = 3;

async function fitsBudget(guard: CostGuard, usd: number): Promise<boolean> {
  try {
    await guard.assertCanSpend(usd);
    return true;
  } catch (err) {
    if (err instanceof CostLimitError) return false;
    throw err;
  }
}
const TRANSCRIBE_RESERVE_USD = 0.01;

// Time limits per model call, 2-4x the slowest of each seen on stored run receipts (upload 6.0 s, SAM 1.8 s + 55 ms a
// frame, object check 25.2 s, #ad read 20.0 s, contract 11.4 s, transcription 5.0 s): a call that stalls fails instead of
// holding the run until the platform stops it. A billed call that times out is never sent again.
const UPLOAD_TIMEOUT_MS = 60_000; // per attempt: an upload is not billed, so it is tried again
const SPARK_IMAGES_TIMEOUT_MS = 60_000; // object check, #ad read and search-word suggestion
const TERMS_TIMEOUT_MS = 45_000;
const OPEN_TIMEOUT_MS = 60_000;
const samTimeoutMs = (frames: number) => 30_000 + 150 * frames;
const transcribeTimeoutMs = (audioSec: number) => 30_000 + 500 * audioSec;
/** How long a SAM pass takes, from the stored receipts: about 1.8 s plus 55 ms a frame. */
const samExpectedMs = (frames: number) => 1_800 + 55 * frames;

/** The client options for one model call: its own time limit, and the run's deadline when it has one. */
function callOpts(input: RunInput, timeoutMs: number): ClientOptions {
  return { ...input.client, timeoutMs, ...(input.deadlineAt === undefined ? {} : { deadlineAt: input.deadlineAt }) };
}

/** The reason on an object whose check failed (an error, a timeout or output that could not be read). */
export const CHECK_FAILED = "Muse Spark did not answer; not counted";

export interface RunInput {
  videoId: string;
  sourcePath: string;
  workDir: string;
  prompt: string; // SAM concept prompt: a short noun phrase, one concept
  productDescription: string; // what the brand's product looks like, for verification
  brandTerms: string[]; // spoken names to listen for
  contractTerms: string[]; // plain English
  /** The brand's product photo as a data: or https URL; Muse Spark sees it first when checking each tracked object. */
  productImageUrl?: string;
  /** Where that photo is stored (the campaign's productImageUrl), recorded in the report when it was used. Never a
   *  data URL: reports are stored. */
  productImageSource?: string;
  guard: CostGuard;
  client?: ClientOptions;
  log?: (msg: string) => void;
  /** Called as each of the six steps starts, so a caller can show progress. A throw aborts the run. */
  onStep?: (step: StepId) => void | Promise<void>;
  /** Identifies this run on its receipt; defaults to the video id and start time. */
  runId?: string;
  /** Called with everything found so far each time a stage adds to it. Best effort: a throw is ignored. */
  onProgress?: (live: LiveProgress) => void | Promise<void>;
  /** Check each tracked object with open-weight Muse Spark Open on this host instead of hosted Muse Spark. */
  openWeight?: OpenWeightConfig;
  /** Epoch ms after which the run makes no model call (set by the run route's caller, inside its time limit). Unset, as
   *  in a local script, there is no deadline; each call still has its own time limit. */
  deadlineAt?: number;
}


/** Seconds floored to tenths, as everywhere in the app. */
const tenthsOf = (s: number) => (Math.floor(s * 10 + 1e-6) / 10).toFixed(1);

// In micro-dollars, like the guard's ledger, so the report total does not pick up float noise.
const micros = (usd: number) => Math.round(usd * 1e6);

/**
 * The longest video (whole seconds) a run can finish in full under a per-video budget. Length is capped by cost, not
 * time: SAM's whole cost is reserved before tracking (every frame at FPS), and the rest of a full report must still
 * fit after it: a Muse Spark check for each of up to RETRY_VERIFY_TRACKS objects, the transcript, the contract terms
 * and the on-screen #ad read. A longer video stops at "Track product" with a budget error.
 */
export function maxVideoSeconds(maxUsdPerRun: number): number {
  const rest = (RETRY_VERIFY_TRACKS + 2) * SPARK_RESERVE_USD + TRANSCRIBE_RESERVE_USD;
  const frames = Math.floor(Math.max(0, micros(maxUsdPerRun) - micros(rest)) / micros(SAM_USD_PER_FRAME));
  return Math.floor(frames / FPS);
}

/** Reserves and settles spend through the guard, and keeps this video's own total for the report. */
class VideoSpend {
  private totalMicros = 0;
  constructor(private readonly guard: CostGuard) {}

  async reserve(usd: number, note: string): Promise<void> {
    await this.guard.reserve(usd, note);
    this.totalMicros += micros(usd);
  }

  async adjust(deltaUsd: number, note: string): Promise<void> {
    const delta = micros(deltaUsd);
    if (delta === 0) return;
    await this.guard.adjust(delta / 1e6, note);
    this.totalMicros += delta;
  }

  get usd(): number {
    return this.totalMicros / 1e6;
  }

  /** The run receipt: each model call, in the order they finished. */
  readonly calls: ReceiptCall[] = [];

  /** Runs one model call and records it on the receipt. `usd` and `output` read the result. */
  async timed<T>(
    call: { model: string; purpose: string; input: string },
    usd: number | ((r: T) => number),
    fn: () => Promise<T>,
    output: (r: T) => string,
    /** What a failed call still cost (its kept reservation); defaults to `usd` when that is a fixed amount. */
    failedUsd?: (err: unknown) => number,
  ): Promise<T> {
    const t0 = performance.now();
    let r: T;
    try {
      r = await fn();
    } catch (err) {
      // A failed call stays on the receipt with what it was charged (its reservation is kept), so the receipt still
      // adds up to the report's cost when an optional step fails and the run goes on.
      const msg = err instanceof Error ? err.message : String(err);
      const cost = failedUsd ? failedUsd(err) : typeof usd === "number" ? usd : 0;
      this.calls.push({ ...call, output: `failed: ${msg.slice(0, 160)}`, ms: Math.round(performance.now() - t0), usd: cost });
      throw err;
    }
    this.calls.push({ ...call, output: output(r), ms: Math.round(performance.now() - t0), usd: typeof usd === "number" ? usd : usd(r) });
    return r;
  }
}

export async function runVideo(input: RunInput): Promise<VideoReport> {
  const log = input.log ?? (() => undefined);
  const { guard } = input;
  const spend = new VideoSpend(guard);
  const videoPath = join(input.workDir, `${input.videoId}.mp4`);
  const step = async (id: StepId) => input.onStep?.(id);
  const startedAt = new Date().toISOString();
  const live: LiveProgress = {};
  const progress = async (patch: Partial<LiveProgress>) => {
    Object.assign(live, patch);
    try {
      await input.onProgress?.(structuredClone(live));
    } catch {
      // Progress is for show; the run goes on without it.
    }
  };

  await step("normalize");
  log("normalizing");
  const info = await normalizeVideo(input.sourcePath, videoPath);
  await progress({ video: { frameCount: info.frameCount, durationSec: info.durationSec, width: info.width, height: info.height } });

  const attempts: PromptAttempt[] = [];
  // Set when any verification actually sent the product photo.
  const photo = { used: false };
  // Set aside for the rest of a full report once the objects are checked: the transcript and, with contract terms, their
  // reading and the on-screen #ad read.
  const restUsd = TRANSCRIBE_RESERVE_USD + (input.contractTerms.length ? 2 * SPARK_RESERVE_USD : 0);
  // What object checks must leave: the transcript and the reading of the terms. The #ad read is optional (it ends as
  // "not checked on screen" when the budget is spent), so checking the objects comes first.
  const requiredUsd = TRANSCRIBE_RESERVE_USD + (input.contractTerms.length ? SPARK_RESERVE_USD : 0);
  // What one object check may reserve: one call, or with open weights two (a failed open call falls back to hosted).
  const checkUsd = SPARK_RESERVE_USD * (input.openWeight ? 2 : 1);

  /** One SAM pass over the uploaded video with `prompt`, then a Muse Spark check of the objects it tracked (at most
   *  `maxVerify` of them, and no more than the per-video budget still covers). The caller has already reserved
   *  `reserved` for it. `unchecked` holds the detections of the objects that were not checked. */
  const trackAndVerify = async (prompt: string, fileId: string, reserved: number, maxVerify = Infinity) => {
    log(`tracking "${prompt}" over ${info.frameCount} frames`);
    let sam: Awaited<ReturnType<typeof samVideo>>;
    try {
      sam = await spend.timed(
        { model: MODELS.sam, purpose: `Track “${prompt}”`, input: `the ${info.frameCount}-frame video, prompt “${prompt}”` },
        (r) => guard.estimateSamUsd(r.framesProcessed ?? info.frameCount),
        () => samVideo({ fileId, prompt, includeConfidence: true }, callOpts(input, samTimeoutMs(info.frameCount))),
        (r) => `${r.framesProcessed ?? info.frameCount} frames processed`,
        // As below: a 4xx is refunded, anything else keeps its reservation.
        (err) => (err instanceof MetaApiError && err.status >= 400 && err.status < 500 ? 0 : reserved),
      );
    } catch (err) {
      // A 4xx (bad request, auth, billing, rate limit) is rejected before any frame is processed, so it is
      // refunded. Anything else (5xx, a dropped connection, a stream that failed midway) may have been
      // billed, so the reservation stays.
      if (err instanceof MetaApiError && err.status >= 400 && err.status < 500) {
        await spend.adjust(-reserved, `sam ${input.videoId} rejected (${err.status})`);
      }
      throw err;
    }
    const samFrames = sam.framesProcessed ?? info.frameCount;
    await spend.adjust(guard.estimateSamUsd(samFrames) - reserved, `sam ${input.videoId} adjust`);
    const parsed = await parseSamVideo(sam.raw, info);
    for (const d of parsed.diagnostics) log(`sam: ${d}`);
    const samCall = spend.calls.at(-1);
    if (samCall) samCall.output += `, ${parsed.tracks.length} object${parsed.tracks.length === 1 ? "" : "s"} tracked`;
    await progress({
      searches: [...(live.searches ?? []), { prompt, objects: parsed.tracks.length, samFrames, boxes: filmstripBoxes(parsed.detections, info.frameCount) }],
    });

    await step("verify");
    log(`verifying ${parsed.tracks.length} tracked object(s)`);
    const tag = `${attempts.length}`;
    // The objects seen longest are checked first. A retry checks only the number its budget check allowed for, and no
    // pass checks more than the per-video budget covers once the transcript and the terms are set aside. The rest do not
    // count.
    const affordable = Math.max(0, Math.floor((micros(guard.maxUsdPerRun) - micros(guard.runSpentUsd) - micros(requiredUsd)) / micros(checkUsd)));
    const skipped = affordable < maxVerify ? "Not checked: over the per-video budget." : "Not checked: only the objects on screen longest are checked on a second search.";
    const checked = new Set(
      [...parsed.tracks].sort((a, b) => b.detections.length - a.detections.length).slice(0, Math.min(maxVerify, affordable)).map((t) => t.objectId),
    );
    const unchecked = new Set<number>();
    const notChecked = (objectId: number, reason: string): TrackVerification => {
      unchecked.add(objectId);
      return { objectId, verdict: "unclear", visibility: "partial", reason };
    };
    const verifications = await Promise.all(
      parsed.tracks.map((t) =>
        (checked.has(t.objectId)
          ? verifyTrack(t, videoPath, { ...input, prompt }, info.frameCount, spend, tag, photo).catch((err: unknown) => {
              // One failed check never costs the paid report: that object is left unchecked (its failed call stays on
              // the receipt). Running out of budget still stops the run.
              if (err instanceof CostLimitError) throw err;
              log(`checking object ${t.objectId + 1} failed: ${err instanceof Error ? err.message : err}`);
              return notChecked(t.objectId, CHECK_FAILED);
            })
          : Promise.resolve(notChecked(t.objectId, skipped))
        ).then(async (v) => {
          await progress({ checks: [...(live.checks ?? []), { prompt, objectId: v.objectId, verdict: v.verdict, reason: v.reason }] });
          return v;
        }),
      ),
    );
    const matchIds = new Set(verifications.filter((v) => v.verdict === "match").map((v) => v.objectId));
    const matched: Detection[] = parsed.detections.filter((d) => matchIds.has(d.objectId));
    const attempt: PromptAttempt = { prompt, objects: parsed.tracks.length, matched: matchIds.size, samFrames };
    return { parsed, verifications, matched, attempt, unchecked: parsed.detections.filter((d) => unchecked.has(d.objectId)), uncheckedObjects: unchecked.size };
  };

  // Reserve SAM's cost before the upload; the frames billed come back in usage and settle the reserve.
  await step("track");
  const samEstimate = guard.estimateSamUsd(info.frameCount);
  await spend.reserve(samEstimate, `sam ${input.videoId} reserve`);
  log(`SAM budget for ${info.frameCount} frames: ~$${samEstimate.toFixed(3)} per pass`);
  let fileId: string;
  try {
    const bytes = await readFile(videoPath);
    fileId = await spend.timed(
      { model: "Files API", purpose: "Upload the video for SAM 3.1", input: `${(bytes.length / 1e6).toFixed(1)} MB MP4, ${FPS} fps` },
      0,
      () => uploadFile(bytes, `${input.videoId}.mp4`, callOpts(input, UPLOAD_TIMEOUT_MS)),
      () => "file id received",
    );
  } catch (err) {
    // Nothing reached SAM, so nothing was billed for it.
    await spend.adjust(-samEstimate, `sam ${input.videoId} upload failed`);
    throw err;
  }

  // First pass with the brand's own prompt. When nothing in it turns out to be the product, Muse Spark looks at the
  // video and, if the product is there, names it the way SAM is likelier to find it; SAM then runs once more.
  let best = await trackAndVerify(input.prompt, fileId, samEstimate);
  attempts.push(best.attempt);
  for (let retry = 0; retry < MAX_PROMPT_RETRIES && !best.matched.length; retry++) {
    // Only try again when the budget still covers the retry and everything after it, so a recovery attempt can
    // never leave the run unable to finish its report.
    const estimate = guard.estimateSamUsd(info.frameCount);
    const retryCost = SPARK_RESERVE_USD + estimate + RETRY_VERIFY_TRACKS * checkUsd;
    if (!(await fitsBudget(guard, retryCost + restUsd))) {
      log("not enough budget left to try another prompt");
      break;
    }
    // The same for time: a second SAM pass takes about as long as the first, so it starts only with twice that left
    // before the deadline.
    if (input.deadlineAt !== undefined && input.deadlineAt - Date.now() < 2 * samExpectedMs(info.frameCount)) {
      log("not enough time left to try another prompt");
      break;
    }
    // Recovery is optional: if any part of it fails, the first pass still makes the report.
    try {
      const suggestion = await suggestPrompt(videoPath, info.frameCount, input, attempts, spend);
      if (!suggestion) break;
      await progress({ searches: (live.searches ?? []).map((x, i, all) => (i === all.length - 1 ? { ...x, next: suggestion.reason } : x)) });
      await spend.reserve(estimate, `sam ${input.videoId} retry reserve`);
      const next = await trackAndVerify(suggestion.prompt, fileId, estimate, RETRY_VERIFY_TRACKS);
      attempts.at(-1)!.next = suggestion.reason;
      attempts.push(next.attempt);
      if (next.matched.length) best = next;
    } catch (err) {
      log(`prompt recovery failed, keeping the first pass: ${err instanceof Error ? err.message : err}`);
      break;
    }
  }
  const { parsed, verifications, matched } = best;
  const samFrames = attempts.reduce((sum, a) => sum + a.samFrames, 0);

  await step("listen");
  log("listening for spoken mentions");
  const wavPath = await extractWav(videoPath, join(input.workDir, `${input.videoId}.wav`));
  let turns: { startMs: number; endMs: number; transcript: string }[] = [];
  // False once the audio could not be transcribed: what was said is then unknown, not "nothing".
  let heard = true;
  if (wavPath) {
    // One spelling per name: "LaCroix" and "La Croix" both as keywords came back as "La Croix LaCroix" for one name.
    const keywords = distinctNames(input.brandTerms);
    await spend.reserve(TRANSCRIBE_RESERVE_USD, `transcribe ${input.videoId}`);
    try {
      turns = (
        await spend.timed(
          { model: MODELS.transcribe, purpose: "Listen for the brand", input: `${tenthsOf(info.durationSec)} s of 16 kHz audio${keywords.length ? `, keywords: ${keywords.join(", ")}` : ""}` },
          TRANSCRIBE_RESERVE_USD,
          // The brand names as keywords: without them "LaCroix" came back as "my recorder" and was missed.
          async () => transcribe(await readFile(wavPath), callOpts(input, transcribeTimeoutMs(info.durationSec)), keywords),
          (r) => `${r.turns.length} speech turn${r.turns.length === 1 ? "" : "s"}, ${r.turns.reduce((n, t) => n + t.transcript.split(/\s+/).filter(Boolean).length, 0)} words`,
        )
      ).turns;
    } catch (err) {
      // The paid report still stands: the spoken checks are left for a person instead (its failed call stays on the
      // receipt).
      log(`transcription failed: ${err instanceof Error ? err.message : err}`);
      heard = false;
    }
  }
  const mentions = findMentions(turns, input.brandTerms);
  const spoken: Mention[] = findDisclosures(turns);
  await progress({ heard: { audio: Boolean(wavPath), mentions, disclosures: spoken } });
  const unheard = heard ? {} : { spokenChecked: false };

  await step("measure");
  const measure = (detections: Detection[]): VideoMetrics => ({ ...computeMetrics(detections, info, mentions), ...unheard });
  const metrics = measure(matched);
  await progress({ measured: { secondsOnScreen: metrics.secondsOnScreen, shareOfVideo: metrics.shareOfVideo, firstSeenSec: metrics.firstSeenSec } });
  await step("contract");
  // A failed reading of the contract leaves every term for a person (null rules) rather than failing the paid run.
  const read = await parseTerms(input, spend);
  const terms = read ?? input.contractTerms.map((text) => ({ text, rule: null }));
  // Reading the frames for #ad costs a Spark call, so it runs only when a term asks for disclosure.
  let disclosure: Disclosure | undefined;
  if (terms.some((t) => t.rule?.kind === "disclosed")) {
    log("looking for a sponsorship disclosure on screen");
    // Optional by design: a failed frame check (extraction, budget or Spark) never costs the finished report.
    try {
      disclosure = { spoken, onScreen: await findOnScreenDisclosure(videoPath, info.frameCount, input, spend), onScreenChecked: true, ...unheard };
    } catch (err) {
      log(`on-screen disclosure check failed: ${err instanceof Error ? err.message : err}`);
      disclosure = { spoken, onScreen: [], onScreenChecked: false, ...unheard };
    }
  }
  let termResults = checkTerms(terms, metrics, frameSamples(matched, info), disclosure);
  if (!read) termResults = termResults.map((t) => ({ ...t, detail: "Not checked: reading the contract terms failed on this run." }));
  if (best.uncheckedObjects) {
    // An object that was never checked does not count, but it may be the product: a term only it could meet is left
    // for a person rather than failed. (Counting more objects only adds screen time, so no passing term can change.)
    const all = [...matched, ...best.unchecked];
    termResults = openForUnchecked(termResults, checkTerms(terms, measure(all), frameSamples(all, info), disclosure), best.uncheckedObjects);
  }
  await progress({ terms: termResults.map((t) => ({ text: t.term.text, pass: t.pass, detail: t.detail })) });

  return {
    videoId: input.videoId,
    info,
    prompt: best.attempt.prompt,
    ...(attempts.length > 1 ? { promptAttempts: attempts } : {}),
    tracks: verifications,
    metrics,
    terms: termResults,
    ...(disclosure ? { disclosure } : {}),
    usedProductPhoto: photo.used,
    ...(photo.used && input.productImageSource ? { productImageUrl: input.productImageSource } : {}),
    detections: tagDetections(parsed.detections, verifications),
    // Everything reserved and settled for this video: SAM as billed, Spark and transcription as reserved.
    cost: { samFrames, usd: spend.usd },
    receipt: {
      runId: input.runId ?? `${input.videoId}-${startedAt}`,
      startedAt,
      fps: FPS,
      models: { ...MODELS, ...(input.openWeight ? { check: `${openModelName(input.openWeight)} (open weights, ${input.openWeight.provider})` } : {}) },
      calls: spend.calls,
    },
  };
}

async function verifyTrack(
  track: Track,
  videoPath: string,
  input: RunInput,
  frameCount: number,
  spend: VideoSpend,
  tag = "0",
  photo = { used: false },
): Promise<TrackVerification> {
  const picks = pickFrames(track.detections, frameCount);
  const images = await Promise.all(
    picks.map(async (d, i) => {
      const out = join(input.workDir, `${input.videoId}-p${tag}-obj${track.objectId}-${i}.jpg`);
      await extractFrameJpeg(videoPath, d.frame, out, d.box);
      return `data:image/jpeg;base64,${(await readFile(out)).toString("base64")}`;
    }),
  );
  const withPhoto = Boolean(input.productImageUrl);
  const parts: SparkContentPart[] = [
    { type: "input_text", text: verifyPrompt(input.productDescription, input.prompt, withPhoto) },
    // The reference photo goes first, as the prompt says.
    ...(withPhoto ? [input.productImageUrl!] : []).concat(images).map((image_url) => ({ type: "input_image" as const, image_url })),
  ];
  const call = (model: string) => ({
    model,
    purpose: `Check object ${track.objectId + 1} against the product`,
    input: `${images.length} crop${images.length === 1 ? "" : "s"} of the object${withPhoto ? " + the product photo" : ""} + the description`,
  });
  const verdictLine = (r: VerifyOutput) => `${r.verdict}, ${r.visibility}`;
  const hosted = async () => {
    await spend.reserve(SPARK_RESERVE_USD, `verify ${input.videoId} obj${track.objectId}`);
    return spend.timed(
      call(MODELS.spark),
      SPARK_RESERVE_USD,
      () => sparkJson<VerifyOutput>({ name: "product_check", schema: VERIFY_SCHEMA, strict: true, input: parts }, callOpts(input, SPARK_IMAGES_TIMEOUT_MS)),
      verdictLine,
    );
  };
  let out: VerifyOutput;
  // Which engine gave the verdict, recorded on campaigns that check with open weights.
  let checkedBy: TrackVerification["checkedBy"];
  const open = input.openWeight;
  if (open) {
    // Muse Spark Open is priced like hosted Spark, so the same reservation covers it. A failed open call stays on the
    // receipt and the object is checked by hosted Muse Spark instead, so one host outage never costs the report.
    await spend.reserve(SPARK_RESERVE_USD, `verify-open ${input.videoId} obj${track.objectId}`);
    try {
      out = await spend.timed(
        { ...call(openModelName(open)), purpose: `Check object ${track.objectId + 1} against the product (open weights, ${open.provider})` },
        SPARK_RESERVE_USD,
        () =>
          openJson<VerifyOutput>(open, { name: "product_check", schema: VERIFY_SCHEMA, input: parts }, {
            fetch: input.client?.fetch,
            timeoutMs: requestTimeoutMs(OPEN_TIMEOUT_MS, input.deadlineAt),
          }),
        verdictLine,
      );
      checkedBy = "open";
    } catch (err) {
      console.warn(`${input.videoId} object ${track.objectId + 1}: ${open.provider} failed, so hosted Muse Spark checks it (${err instanceof Error ? err.message : err})`);
      out = await hosted();
      checkedBy = "hosted";
    }
  } else {
    out = await hosted();
  }
  if (withPhoto) photo.used = true;
  const checks = toChecks(out.checks);
  return {
    objectId: track.objectId,
    verdict: out.verdict,
    visibility: out.visibility,
    reason: out.reason,
    ...(checks.length ? { checks } : {}),
    ...(checkedBy ? { checkedBy } : {}),
  };
}

/**
 * Leaves for a person each term that failed only because `objects` tracked objects went unchecked: they are not counted,
 * but any of them may be the product. `ifCounted` is the same terms checked with those objects counted.
 */
function openForUnchecked(results: TermResult[], ifCounted: TermResult[], objects: number): TermResult[] {
  const which = objects === 1 ? "1 tracked object was not checked; counting it" : `${objects} tracked objects were not checked; counting them`;
  return results.map((t, i) =>
    t.pass === false && ifCounted[i]?.pass === true ? { ...t, pass: null, detail: `${t.detail} ${which} would meet this term.` } : t,
  );
}

/** Every tracked box with its object's verdict, for the player overlay; only the fields the overlay draws. */
export function tagDetections(
  detections: Detection[],
  verifications: TrackVerification[],
): (Detection & { verdict: VerifyVerdict })[] {
  const verdicts = new Map(verifications.map((v) => [v.objectId, v.verdict]));
  return detections.map((d) => ({
    frame: d.frame,
    objectId: d.objectId,
    box: d.box,
    areaFraction: d.areaFraction,
    centroid: d.centroid,
    ...(d.confidence === undefined ? {} : { confidence: d.confidence }),
    verdict: verdicts.get(d.objectId) ?? "unclear",
  }));
}

/** First, middle and largest appearance: enough views to tell the product from a look-alike. */
export function pickFrames(detections: Detection[], frameCount: number): Detection[] {
  if (!detections.length) return [];
  const sorted = [...detections].sort((a, b) => a.frame - b.frame);
  const largest = sorted.reduce((best, d) => (d.areaFraction > best.areaFraction ? d : best));
  const picks = [sorted[0], sorted[Math.floor(sorted.length / 2)], largest].filter((d) => d.frame < frameCount);
  return [...new Map(picks.map((d) => [d.frame, d])).values()];
}


/**
 * About ten frames weighted to the opening, where disclosures usually sit: 0.5 s, 1.5 s and 3 s, then evenly across the
 * rest up to the final half second. A clip of 3 s or less is sampled evenly throughout. Distinct, in order, inside the video, at most 50.
 */
export function disclosureFrames(frameCount: number, n = DISCLOSURE_FRAMES): number[] {
  const total = Math.min(n, MAX_SPARK_IMAGES);
  if (frameCount <= 0 || total <= 0) return [];
  const durationSec = frameCount / FPS;
  const opening = DISCLOSURE_OPENING_SEC.filter((t) => t < durationSec);
  if (durationSec <= DISCLOSURE_OPENING_SEC.at(-1)!) return evenFrames(frameCount, Math.min(total, frameCount));
  const restCount = total - opening.length;
  const from = DISCLOSURE_OPENING_SEC.at(-1)!;
  // The last one lands in the final second, so a label held to the end of the video is read too.
  const end = Math.max(from, durationSec - 0.5);
  const rest = Array.from({ length: restCount }, (_, i) => from + ((i + 1) * (end - from)) / restCount);
  const frames = [...opening, ...rest].map((t) => Math.min(frameCount - 1, Math.floor(t * FPS)));
  return [...new Set(frames)].sort((a, b) => a - b).slice(0, total);
}

/** One Muse Spark call over frames weighted to the opening: where the creator burned "#ad", "Sponsored" or the like into the
 *  video. Platform UI labels ("Paid partnership") are never in the uploaded file, so they are not looked for. */
async function findOnScreenDisclosure(
  videoPath: string,
  frameCount: number,
  input: RunInput,
  spend: VideoSpend,
): Promise<Disclosure["onScreen"]> {
  const frames = disclosureFrames(frameCount);
  const images = await frameImages(videoPath, frames, input, "ad");
  await spend.reserve(SPARK_RESERVE_USD, `disclosure ${input.videoId}`);
  return spend.timed(
    { model: MODELS.spark, purpose: "Read on-screen #ad labels", input: `${images.length} frames, weighted to the opening` },
    SPARK_RESERVE_USD,
    async () =>
      toOnScreen(
        await sparkJson<unknown>(
          {
            name: "disclosure_check",
            schema: DISCLOSURE_SCHEMA,
            strict: true,
            input: [
              { type: "input_text", text: disclosurePrompt(images.length) },
              ...images.map((image_url) => ({ type: "input_image" as const, image_url })),
            ],
          },
          callOpts(input, SPARK_IMAGES_TIMEOUT_MS),
        ),
        frames.map((f) => f / FPS),
      ),
    (r) => (r.length ? r.map((d) => `“${d.text}”`).join(", ") : "no disclosure on screen"),
  );
}

/** Whole frames as JPEG data URLs, written to the work dir as <videoId>-<prefix>-<frame>.jpg. */
async function frameImages(videoPath: string, frames: number[], input: RunInput, prefix: string): Promise<string[]> {
  return Promise.all(
    frames.map(async (f) => {
      const out = await extractFrameJpeg(videoPath, f, join(input.workDir, `${input.videoId}-${prefix}-${f}.jpg`));
      return `data:image/jpeg;base64,${(await readFile(out)).toString("base64")}`;
    }),
  );
}

/**
 * The contract terms as checkable rules, or null when reading them failed (the failed call stays on the receipt): the
 * caller then leaves every term for a person rather than losing the paid report.
 */
async function parseTerms(input: RunInput, spend: VideoSpend): Promise<ContractTerm[] | null> {
  if (!input.contractTerms.length) return [];
  await spend.reserve(SPARK_RESERVE_USD, `terms ${input.videoId}`);
  try {
    return await spend.timed(
      {
        model: MODELS.spark,
        purpose: "Turn the contract into checkable rules",
        input: `${input.contractTerms.length} term${input.contractTerms.length === 1 ? "" : "s"} in plain English`,
      },
      SPARK_RESERVE_USD,
      async () =>
        toContractTerms(
          input.contractTerms,
          await sparkJson<unknown>(
            {
              name: "contract_rules",
              schema: TERMS_SCHEMA,
              strict: true,
              input: [{ type: "input_text", text: parseTermsPrompt(input.contractTerms) }],
            },
            callOpts(input, TERMS_TIMEOUT_MS),
          ),
        ),
      (r) => `${r.filter((t) => t.rule).length} of ${r.length} checkable`,
    );
  } catch (err) {
    input.log?.(`reading the contract terms failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/**
 * Asks Muse Spark, looking at frames spread across the video, whether the brand's product is there and, if so, for a
 * different short noun SAM is likelier to track. Null when the product is not visible or no new prompt is offered,
 * so a clip without the product never pays for a second SAM pass.
 */
async function suggestPrompt(
  videoPath: string,
  frameCount: number,
  input: RunInput,
  attempts: PromptAttempt[],
  spend: VideoSpend,
): Promise<{ prompt: string; reason: string } | null> {
  // Distinct frames only: a very short clip would otherwise extract the same frame into one file concurrently.
  const images = await frameImages(videoPath, evenFrames(frameCount, SUGGEST_FRAMES), input, "look");
  await spend.reserve(SPARK_RESERVE_USD, `suggest ${input.videoId}`);
  return spend.timed(
    { model: MODELS.spark, purpose: "Suggest another search word", input: `${images.length} frames + the description` },
    SPARK_RESERVE_USD,
    async () =>
      toSuggestion(
        await sparkJson<unknown>(
          {
            name: "prompt_suggestion",
            schema: SUGGEST_SCHEMA,
            strict: true,
            input: [
              { type: "input_text", text: suggestPromptText(input.productDescription, attempts) },
              ...images.map((image_url) => ({ type: "input_image" as const, image_url })),
            ],
          },
          callOpts(input, SPARK_IMAGES_TIMEOUT_MS),
        ),
        attempts.map((a) => a.prompt),
      ),
    (r) => (r ? `“${r.prompt}”` : "no new word"),
  );
}

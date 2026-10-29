// One video through the whole pipeline: normalize → track (SAM 3.1) → verify (Muse Spark) → listen
// (Voice Transcribe) → measure → check contract terms. Every billed call reserves its cost in the CostGuard first.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CostGuard, CostLimitError, MetaApiError, samVideo, sparkJson, transcribe, uploadFile, type ClientOptions } from "@/lib/meta";
import { checkTerms, computeMetrics, frameSamples, findMentions } from "@/lib/metrics";
import { extractFrameJpeg, extractWav, normalizeVideo } from "@/lib/media";
import { parseSamVideo } from "@/lib/sam";
import type { StepId } from "@/lib/campaign/types";
import type { ContractTerm, Detection, PromptAttempt, Track, TrackVerification, VerifyVerdict, VideoReport } from "@/lib/types";
import {
  parseTermsPrompt,
  SUGGEST_SCHEMA,
  suggestPromptText,
  TERMS_SCHEMA,
  toContractTerms,
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

export interface RunInput {
  videoId: string;
  sourcePath: string;
  workDir: string;
  prompt: string; // SAM concept prompt: a short noun phrase, one concept
  productDescription: string; // what the brand's product looks like, for verification
  brandTerms: string[]; // spoken names to listen for
  contractTerms: string[]; // plain English
  guard: CostGuard;
  client?: ClientOptions;
  log?: (msg: string) => void;
  /** Called as each of the six steps starts, so a caller can show progress. A throw aborts the run. */
  onStep?: (step: StepId) => void | Promise<void>;
}

// In micro-dollars, like the guard's ledger, so the report total does not pick up float noise.
const micros = (usd: number) => Math.round(usd * 1e6);

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
}

export async function runVideo(input: RunInput): Promise<VideoReport> {
  const log = input.log ?? (() => undefined);
  const { guard, client } = input;
  const spend = new VideoSpend(guard);
  const videoPath = join(input.workDir, `${input.videoId}.mp4`);
  const step = async (id: StepId) => input.onStep?.(id);

  await step("normalize");
  log("normalizing");
  const info = await normalizeVideo(input.sourcePath, videoPath);

  const attempts: PromptAttempt[] = [];

  /** One SAM pass over the uploaded video with `prompt`, then a Muse Spark check of the objects it tracked (at most
   *  `maxVerify` of them). The caller has already reserved `reserved` for it. */
  const trackAndVerify = async (prompt: string, fileId: string, reserved: number, maxVerify = Infinity) => {
    log(`tracking "${prompt}" over ${info.frameCount} frames`);
    let sam: Awaited<ReturnType<typeof samVideo>>;
    try {
      sam = await samVideo({ fileId, prompt, includeConfidence: true }, client);
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

    await step("verify");
    log(`verifying ${parsed.tracks.length} tracked object(s)`);
    const tag = `${attempts.length}`;
    // A retry checks only the objects seen longest, the number its budget check allowed for; the rest do not count.
    const checked = new Set(
      [...parsed.tracks].sort((a, b) => b.detections.length - a.detections.length).slice(0, maxVerify).map((t) => t.objectId),
    );
    const verifications = await Promise.all(
      parsed.tracks.map((t) =>
        checked.has(t.objectId)
          ? verifyTrack(t, videoPath, { ...input, prompt }, info.frameCount, spend, tag)
          : Promise.resolve<TrackVerification>({
              objectId: t.objectId,
              verdict: "unclear",
              visibility: "partial",
              reason: "Not checked: only the objects on screen longest are checked on a second search.",
            }),
      ),
    );
    const matchIds = new Set(verifications.filter((v) => v.verdict === "match").map((v) => v.objectId));
    const matched: Detection[] = parsed.detections.filter((d) => matchIds.has(d.objectId));
    const attempt: PromptAttempt = { prompt, objects: parsed.tracks.length, matched: matchIds.size, samFrames };
    return { parsed, verifications, matched, attempt };
  };

  // Reserve SAM's cost before the upload; the frames billed come back in usage and settle the reserve.
  await step("track");
  const samEstimate = guard.estimateSamUsd(info.frameCount);
  await spend.reserve(samEstimate, `sam ${input.videoId} reserve`);
  log(`SAM budget for ${info.frameCount} frames: ~$${samEstimate.toFixed(3)} per pass`);
  let fileId: string;
  try {
    fileId = await uploadFile(await readFile(videoPath), `${input.videoId}.mp4`, client);
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
    const rest = TRANSCRIBE_RESERVE_USD + (input.contractTerms.length ? SPARK_RESERVE_USD : 0);
    const retryCost = SPARK_RESERVE_USD + estimate + RETRY_VERIFY_TRACKS * SPARK_RESERVE_USD;
    if (!(await fitsBudget(guard, retryCost + rest))) {
      log("not enough budget left to try another prompt");
      break;
    }
    // Recovery is optional: if any part of it fails, the first pass still makes the report.
    try {
      const suggestion = await suggestPrompt(videoPath, info.frameCount, input, attempts, spend);
      if (!suggestion) break;
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
  if (wavPath) {
    await spend.reserve(TRANSCRIBE_RESERVE_USD, `transcribe ${input.videoId}`);
    turns = (await transcribe(await readFile(wavPath), client)).turns;
  }
  const mentions = findMentions(turns, input.brandTerms);

  await step("measure");
  const metrics = computeMetrics(matched, info, mentions);
  await step("contract");
  const terms = await parseTerms(input, spend);
  const termResults = checkTerms(terms, metrics, frameSamples(matched, info));

  return {
    videoId: input.videoId,
    info,
    prompt: best.attempt.prompt,
    ...(attempts.length > 1 ? { promptAttempts: attempts } : {}),
    tracks: verifications,
    metrics,
    terms: termResults,
    detections: tagDetections(parsed.detections, verifications),
    // Everything reserved and settled for this video: SAM as billed, Spark and transcription as reserved.
    cost: { samFrames, usd: spend.usd },
  };
}

async function verifyTrack(
  track: Track,
  videoPath: string,
  input: RunInput,
  frameCount: number,
  spend: VideoSpend,
  tag = "0",
): Promise<TrackVerification> {
  const picks = pickFrames(track.detections, frameCount);
  const images = await Promise.all(
    picks.map(async (d, i) => {
      const out = join(input.workDir, `${input.videoId}-p${tag}-obj${track.objectId}-${i}.jpg`);
      await extractFrameJpeg(videoPath, d.frame, out, d.box);
      return `data:image/jpeg;base64,${(await readFile(out)).toString("base64")}`;
    }),
  );
  await spend.reserve(SPARK_RESERVE_USD, `verify ${input.videoId} obj${track.objectId}`);
  const out = await sparkJson<VerifyOutput>(
    {
      name: "product_check",
      schema: VERIFY_SCHEMA,
      strict: true,
      input: [
        { type: "input_text", text: verifyPrompt(input.productDescription, input.prompt) },
        ...images.map((image_url) => ({ type: "input_image" as const, image_url })),
      ],
    },
    input.client,
  );
  return { objectId: track.objectId, ...out };
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

async function parseTerms(input: RunInput, spend: VideoSpend): Promise<ContractTerm[]> {
  if (!input.contractTerms.length) return [];
  await spend.reserve(SPARK_RESERVE_USD, `terms ${input.videoId}`);
  const out = await sparkJson<unknown>(
    {
      name: "contract_rules",
      schema: TERMS_SCHEMA,
      strict: true,
      input: [{ type: "input_text", text: parseTermsPrompt(input.contractTerms) }],
    },
    input.client,
  );
  return toContractTerms(input.contractTerms, out);
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
  const frames = [...new Set(Array.from({ length: SUGGEST_FRAMES }, (_, i) => Math.floor(((i + 0.5) * frameCount) / SUGGEST_FRAMES)))];
  const images = await Promise.all(
    frames.map(async (f) => {
      const out = await extractFrameJpeg(videoPath, f, join(input.workDir, `${input.videoId}-look-${f}.jpg`));
      return `data:image/jpeg;base64,${(await readFile(out)).toString("base64")}`;
    }),
  );
  await spend.reserve(SPARK_RESERVE_USD, `suggest ${input.videoId}`);
  const out = await sparkJson<unknown>(
    {
      name: "prompt_suggestion",
      schema: SUGGEST_SCHEMA,
      strict: true,
      input: [
        { type: "input_text", text: suggestPromptText(input.productDescription, attempts) },
        ...images.map((image_url) => ({ type: "input_image" as const, image_url })),
      ],
    },
    input.client,
  );
  return toSuggestion(out, attempts.map((a) => a.prompt));
}

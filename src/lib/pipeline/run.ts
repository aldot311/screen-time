// One video through the whole pipeline: normalize → track (SAM 3.1) → verify (Muse Spark) → listen
// (Voice Transcribe) → measure → check contract terms. Every billed call reserves its cost in the CostGuard first.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CostGuard, MetaApiError, samVideo, sparkJson, transcribe, uploadFile, type ClientOptions } from "@/lib/meta";
import { checkTerms, computeMetrics, frameSamples, findMentions } from "@/lib/metrics";
import { extractFrameJpeg, extractWav, normalizeVideo } from "@/lib/media";
import { parseSamVideo } from "@/lib/sam";
import type { ContractTerm, Detection, Track, TrackVerification, VideoReport } from "@/lib/types";
import { parseTermsPrompt, TERMS_SCHEMA, toContractTerms, VERIFY_SCHEMA, verifyPrompt, type VerifyOutput } from "./prompts";

// Spark and transcription are billed by tokens and audio seconds; these are generous per-call reserves
// so the guard still blocks a runaway loop of them.
const SPARK_RESERVE_USD = 0.02;
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

  log("normalizing");
  const info = await normalizeVideo(input.sourcePath, videoPath);

  // Reserve SAM's cost before the upload; the frames billed come back in usage and settle the reserve.
  const samEstimate = guard.estimateSamUsd(info.frameCount);
  await spend.reserve(samEstimate, `sam ${input.videoId} reserve`);
  log(`tracking "${input.prompt}" over ${info.frameCount} frames (~$${samEstimate.toFixed(3)})`);
  let fileId: string;
  try {
    fileId = await uploadFile(await readFile(videoPath), `${input.videoId}.mp4`, client);
  } catch (err) {
    // Nothing reached SAM, so nothing was billed for it.
    await spend.adjust(-samEstimate, `sam ${input.videoId} upload failed`);
    throw err;
  }
  let sam: Awaited<ReturnType<typeof samVideo>>;
  try {
    sam = await samVideo({ fileId, prompt: input.prompt, includeConfidence: true }, client);
  } catch (err) {
    // A 4xx (bad request, auth, billing, rate limit) is rejected before any frame is processed, so it is
    // refunded. Anything else (5xx, a dropped connection, a stream that failed midway) may have been
    // billed, so the reservation stays.
    if (err instanceof MetaApiError && err.status >= 400 && err.status < 500) {
      await spend.adjust(-samEstimate, `sam ${input.videoId} rejected (${err.status})`);
    }
    throw err;
  }
  const samFrames = sam.framesProcessed ?? info.frameCount;
  await spend.adjust(guard.estimateSamUsd(samFrames) - samEstimate, `sam ${input.videoId} adjust`);
  const parsed = await parseSamVideo(sam.raw, info);
  for (const d of parsed.diagnostics) log(`sam: ${d}`);

  log(`verifying ${parsed.tracks.length} tracked object(s)`);
  const verifications = await Promise.all(
    parsed.tracks.map((t) => verifyTrack(t, videoPath, input, info.frameCount, spend)),
  );
  const matchIds = new Set(verifications.filter((v) => v.verdict === "match").map((v) => v.objectId));
  const matched: Detection[] = parsed.detections.filter((d) => matchIds.has(d.objectId));

  log("listening for spoken mentions");
  const wavPath = await extractWav(videoPath, join(input.workDir, `${input.videoId}.wav`));
  let turns: { startMs: number; endMs: number; transcript: string }[] = [];
  if (wavPath) {
    await spend.reserve(TRANSCRIBE_RESERVE_USD, `transcribe ${input.videoId}`);
    turns = (await transcribe(await readFile(wavPath), client)).turns;
  }
  const mentions = findMentions(turns, input.brandTerms);

  const metrics = computeMetrics(matched, info, mentions);
  const terms = await parseTerms(input, spend);
  const termResults = checkTerms(terms, metrics, frameSamples(matched, info));

  return {
    videoId: input.videoId,
    info,
    prompt: input.prompt,
    tracks: verifications,
    metrics,
    terms: termResults,
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
): Promise<TrackVerification> {
  const picks = pickFrames(track.detections, frameCount);
  const images = await Promise.all(
    picks.map(async (d, i) => {
      const out = join(input.workDir, `${input.videoId}-obj${track.objectId}-${i}.jpg`);
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

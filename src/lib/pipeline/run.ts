// One video through the whole pipeline: normalize → track (SAM 3.1) → verify (Muse Spark) → listen
// (Voice Transcribe) → measure → check contract terms. Every billed call goes through the CostGuard first.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CostGuard, samVideo, sparkJson, transcribe, uploadFile, type ClientOptions } from "@/lib/meta";
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

export async function runVideo(input: RunInput): Promise<VideoReport> {
  const log = input.log ?? (() => undefined);
  const { guard, client } = input;
  const videoPath = join(input.workDir, `${input.videoId}.mp4`);

  log("normalizing");
  const info = await normalizeVideo(input.sourcePath, videoPath);

  // Reserve SAM's cost before the call; the frames billed come back in usage and correct the ledger.
  const samEstimate = guard.estimateSamUsd(info.frameCount);
  await guard.assertCanSpend(samEstimate);
  log(`tracking "${input.prompt}" over ${info.frameCount} frames (~$${samEstimate.toFixed(3)})`);
  const fileId = await uploadFile(await readFile(videoPath), `${input.videoId}.mp4`, client);
  await guard.record(samEstimate, `sam ${input.videoId} reserve`);
  const sam = await samVideo({ fileId, prompt: input.prompt, includeConfidence: true }, client);
  const samFrames = sam.framesProcessed ?? info.frameCount;
  const samUsd = guard.estimateSamUsd(samFrames);
  if (samUsd !== samEstimate) await guard.record(samUsd - samEstimate, `sam ${input.videoId} adjust`);
  const parsed = await parseSamVideo(sam.raw, info);
  for (const d of parsed.diagnostics) log(`sam: ${d}`);

  log(`verifying ${parsed.tracks.length} tracked object(s)`);
  const verifications = await Promise.all(
    parsed.tracks.map((t) => verifyTrack(t, videoPath, input, info.frameCount)),
  );
  const matchIds = new Set(verifications.filter((v) => v.verdict === "match").map((v) => v.objectId));
  const matched: Detection[] = parsed.detections.filter((d) => matchIds.has(d.objectId));

  log("listening for spoken mentions");
  const wavPath = await extractWav(videoPath, join(input.workDir, `${input.videoId}.wav`));
  let turns: { startMs: number; endMs: number; transcript: string }[] = [];
  if (wavPath) {
    await guard.assertCanSpend(TRANSCRIBE_RESERVE_USD);
    await guard.record(TRANSCRIBE_RESERVE_USD, `transcribe ${input.videoId}`);
    turns = (await transcribe(await readFile(wavPath), client)).turns;
  }
  const mentions = findMentions(turns, input.brandTerms);

  const metrics = computeMetrics(matched, info, mentions);
  const terms = await parseTerms(input);
  const termResults = checkTerms(terms, metrics, frameSamples(matched, info));

  return {
    videoId: input.videoId,
    info,
    prompt: input.prompt,
    tracks: verifications,
    metrics,
    terms: termResults,
    cost: { samFrames, usd: samUsd },
  };
}

async function verifyTrack(
  track: Track,
  videoPath: string,
  input: RunInput,
  frameCount: number,
): Promise<TrackVerification> {
  const picks = pickFrames(track.detections, frameCount);
  const images = await Promise.all(
    picks.map(async (d, i) => {
      const out = join(input.workDir, `${input.videoId}-obj${track.objectId}-${i}.jpg`);
      await extractFrameJpeg(videoPath, d.frame, out, d.box);
      return `data:image/jpeg;base64,${(await readFile(out)).toString("base64")}`;
    }),
  );
  await input.guard.assertCanSpend(SPARK_RESERVE_USD);
  await input.guard.record(SPARK_RESERVE_USD, `verify ${input.videoId} obj${track.objectId}`);
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

async function parseTerms(input: RunInput): Promise<ContractTerm[]> {
  if (!input.contractTerms.length) return [];
  await input.guard.assertCanSpend(SPARK_RESERVE_USD);
  await input.guard.record(SPARK_RESERVE_USD, `terms ${input.videoId}`);
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

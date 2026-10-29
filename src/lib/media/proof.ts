// The proof clip: the creator's video as a 9:16 MP4 with the evidence burned in, for sharing anywhere a link does not
// unfurl. SAM 3.1's box on every frame (lime on the brand's product, red on a look-alike), the verdict and seconds on
// screen in a band at the top, the screen-time strip with a moving playhead at the bottom, and a violet label while the
// brand is being said. The text is drawn as PNG overlays (proof-overlays.tsx); ffmpeg does the rest in one pass.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FPS, type VideoReport } from "@/lib/types";
import { verdictOf } from "@/components/format";
import { ffmpeg } from "./index";

export const PROOF_W = 720;
export const PROOF_H = 1280;
const PROOF_TIMEOUT_MS = 180_000;

const COLOR = { ink: "0x14130f", signal: "0xc5f03a", reject: "0xc2392b", voice: "0x5446d0", pass: "0x137a4c", short: "0xc2392b", review: "0x8c5e00" };

const tenths = (n: number) => (Math.floor(n * 10 + 1e-6) / 10).toFixed(1);

export interface ProofText {
  brand: string;
  creator: string;
}

/** What the proof clip says, in words and colors; the overlays are drawn from it. */
export function proofWords(r: VideoReport, text: ProofText) {
  const verdict = verdictOf(r);
  return {
    word: verdict === "delivered" ? "DELIVERED" : verdict === "short" ? "FELL SHORT" : verdict === "review" ? "NEEDS REVIEW" : "NOT RUN",
    pill: verdict === "delivered" ? "#137a4c" : verdict === "short" ? "#c2392b" : "#8c5e00",
    line: `${text.brand} · ${tenths(r.metrics.secondsOnScreen)} s on screen · ${text.creator}`,
    footer: "Checked frame by frame · Meta SAM 3.1 + Muse Spark · Screen-Time",
    mention: (said: string) => `“${said}” said`,
  };
}

const BAND_Y = PROOF_H - 150;
const BAR_X = 32;
const BAR_W = PROOF_W - 64;
const BAR_Y = BAND_Y + 40;

/**
 * The filtergraph (for -filter_complex_script). Inputs: 0 the video, 1 a small white source for the playhead, 2 the top
 * band PNG, 3 the footer PNG, and 4.. one label PNG per spoken mention.
 */
export function proofFilter(r: VideoReport): string {
  const { width: W, height: H, durationSec: D } = r.info;
  const s = Math.min(PROOF_W / W, PROOF_H / H);
  const ox = Math.round((PROOF_W - W * s) / 2);
  const oy = Math.round((PROOF_H - H * s) / 2);
  const steps: string[] = [
    `scale=${Math.round(W * s)}:${Math.round(H * s)}`,
    `pad=${PROOF_W}:${PROOF_H}:${ox}:${oy}:color=${COLOR.ink}`,
  ];
  // SAM's boxes, each on the one frame it belongs to.
  for (const d of r.detections ?? []) {
    const x = Math.round(ox + d.box.x1 * s);
    const y = Math.round(oy + d.box.y1 * s);
    const w = Math.max(2, Math.round((d.box.x2 - d.box.x1 + 1) * s));
    const h = Math.max(2, Math.round((d.box.y2 - d.box.y1 + 1) * s));
    const match = d.verdict === "match";
    steps.push(`drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${match ? COLOR.signal : COLOR.reject}:t=${match ? 5 : 3}:enable='eq(n\\,${d.frame})'`);
  }
  // Bottom band: the strip, lime while on screen, violet ticks where the brand is said.
  const m = r.metrics;
  const at = (sec: number) => Math.round(BAR_X + (BAR_W * Math.min(Math.max(sec, 0), D)) / D);
  steps.push(`drawbox=x=0:y=${BAND_Y}:w=iw:h=150:color=${COLOR.ink}@0.82:t=fill`);
  steps.push(`drawbox=x=${BAR_X}:y=${BAR_Y}:w=${BAR_W}:h=24:color=white@0.18:t=fill`);
  for (const seg of m.segments) steps.push(`drawbox=x=${at(seg.startSec)}:y=${BAR_Y}:w=${Math.max(2, at(seg.endSec) - at(seg.startSec))}:h=24:color=${COLOR.signal}:t=fill`);
  for (const men of m.mentions) steps.push(`drawbox=x=${at(men.startSec)}:y=${BAR_Y - 8}:w=6:h=40:color=${COLOR.voice}:t=fill`);
  const graph = [`[0:v]${steps.join(",")}[b0]`, `[b0][2:v]overlay=x=0:y=0[b1]`, `[b1][3:v]overlay=x=0:y=${BAR_Y + 42}[b2]`];
  let last = "b2";
  m.mentions.forEach((men, i) => {
    const next = `m${i}`;
    graph.push(`[${last}][${4 + i}:v]overlay=x=0:y=${BAND_Y - 70}:enable='between(t\\,${men.startSec.toFixed(2)}\\,${(men.endSec + 1).toFixed(2)})'[${next}]`);
    last = next;
  });
  // The playhead rides the strip: a 4 px white bar overlaid at the current time.
  graph.push(`[1:v]format=rgba[ph]`, `[${last}][ph]overlay=x='${BAR_X}+${BAR_W}*t/${D.toFixed(3)}':y=${BAR_Y - 10}:shortest=1,format=yuv420p[out]`);
  return graph.join(";");
}

/** Renders the proof clip of `videoPath` (the normalized run copy) to `outPath`. */
export async function renderProof(videoPath: string, outPath: string, r: VideoReport, text: ProofText, workDir: string): Promise<void> {
  const { topBand, footer, mentionLabel } = await import("./proof-overlays");
  const words = proofWords(r, text);
  const top = join(workDir, "top.png");
  const foot = join(workDir, "footer.png");
  await writeFile(top, await topBand(words.word, words.pill, words.line));
  await writeFile(foot, await footer(words.footer));
  const labels = await Promise.all(
    r.metrics.mentions.map(async (men, i) => {
      const path = join(workDir, `mention-${i}.png`);
      await writeFile(path, await mentionLabel(words.mention(men.text)));
      return path;
    }),
  );
  const script = join(workDir, "proof-filter.txt");
  await writeFile(script, proofFilter(r));
  await ffmpeg(
    [
      "-v", "error", "-y",
      "-i", videoPath,
      "-f", "lavfi", "-i", `color=c=white:s=4x44:r=${FPS}`,
      "-loop", "1", "-i", top,
      "-loop", "1", "-i", foot,
      ...labels.flatMap((p) => ["-loop", "1", "-i", p]),
      "-filter_complex_script", script,
      "-map", "[out]", "-map", "0:a?",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-r", String(FPS),
      "-c:a", "aac", "-b:a", "96k",
      "-movflags", "+faststart",
      "-t", r.info.durationSec.toFixed(3),
      outPath,
    ],
    PROOF_TIMEOUT_MS,
  );
}

// The proof clip: the creator's video as a 9:16 MP4 with the evidence burned in, for sharing anywhere a link does not
// unfurl. SAM 3.1's box on every frame (lime on the brand's product, red on a look-alike), the verdict and seconds on
// screen in a band at the top, the screen-time strip with a moving playhead at the bottom, and a violet label while the
// brand is being said. One ffmpeg pass; text is drawn with Geist (bundled with Next, SIL Open Font License).
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FPS, type VideoReport } from "@/lib/types";
import { verdictOf } from "@/components/format";
import { ffmpeg } from "./index";

export const PROOF_W = 720;
export const PROOF_H = 1280;
const PROOF_TIMEOUT_MS = 180_000;

const COLOR = { ink: "0x14130f", signal: "0xc5f03a", reject: "0xc2392b", voice: "0x5446d0", pass: "0x137a4c", short: "0xc2392b", review: "0x8c5e00" };

/** Text for drawtext inside a filter script: ' and : and % and \ are special there. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\\\\\").replace(/'/g, "\u2019").replace(/:/g, "\\:").replace(/%/g, "\\%").replace(/,/g, "\\,");
}

const tenths = (n: number) => (Math.floor(n * 10 + 1e-6) / 10).toFixed(1);

export interface ProofText {
  brand: string;
  creator: string;
  /** Path to a TrueType font. */
  font: string;
}

/** The filtergraph (for -filter_complex_script): input 0 is the video, input 1 a small white color source for the playhead. */
export function proofFilter(r: VideoReport, text: ProofText): string {
  const { width: W, height: H, durationSec: D } = r.info;
  const s = Math.min(PROOF_W / W, PROOF_H / H);
  const ox = Math.round((PROOF_W - W * s) / 2);
  const oy = Math.round((PROOF_H - H * s) / 2);
  const f = (k: string) => `fontfile='${text.font}':${k}`;
  const verdict = verdictOf(r);
  const word = verdict === "delivered" ? "DELIVERED" : verdict === "short" ? "FELL SHORT" : verdict === "review" ? "NEEDS REVIEW" : "NOT RUN";
  const pill = verdict === "delivered" ? COLOR.pass : verdict === "short" ? COLOR.short : COLOR.review;
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
  // Top band: the verdict and the number.
  const m = r.metrics;
  steps.push(`drawbox=x=0:y=0:w=iw:h=176:color=${COLOR.ink}@0.82:t=fill`);
  steps.push(`drawtext=${f(`text='${escapeText(word)}':fontsize=44:fontcolor=white:x=32:y=34:box=1:boxcolor=${pill}:boxborderw=12`)}`);
  steps.push(
    `drawtext=${f(`text='${escapeText(`${text.brand} · ${tenths(m.secondsOnScreen)} s on screen · ${text.creator}`)}':fontsize=27:fontcolor=white@0.9:x=32:y=118`)}`,
  );
  // Bottom band: the strip (lime while on screen, violet ticks where the brand is said) and the credit line.
  const bandY = PROOF_H - 150;
  const barX = 32;
  const barW = PROOF_W - 64;
  const barY = bandY + 40;
  const at = (sec: number) => Math.round(barX + (barW * Math.min(Math.max(sec, 0), D)) / D);
  steps.push(`drawbox=x=0:y=${bandY}:w=iw:h=150:color=${COLOR.ink}@0.82:t=fill`);
  steps.push(`drawbox=x=${barX}:y=${barY}:w=${barW}:h=24:color=white@0.18:t=fill`);
  for (const seg of m.segments) steps.push(`drawbox=x=${at(seg.startSec)}:y=${barY}:w=${Math.max(2, at(seg.endSec) - at(seg.startSec))}:h=24:color=${COLOR.signal}:t=fill`);
  for (const men of m.mentions) steps.push(`drawbox=x=${at(men.startSec)}:y=${barY - 8}:w=6:h=40:color=${COLOR.voice}:t=fill`);
  steps.push(`drawtext=${f(`text='${escapeText("Checked frame by frame · Meta SAM 3.1 + Muse Spark · Screen-Time")}':fontsize=20:fontcolor=white@0.7:x=32:y=${barY + 50}`)}`);
  // While the brand is said: a label above the strip.
  for (const men of m.mentions) {
    steps.push(
      `drawtext=${f(`text='${escapeText(`“${men.text}” said`)}':fontsize=30:fontcolor=white:x=32:y=${bandY - 64}:box=1:boxcolor=${COLOR.voice}:boxborderw=12:enable='between(t\\,${men.startSec.toFixed(2)}\\,${(men.endSec + 1).toFixed(2)})'`)}`,
    );
  }
  // The playhead rides the strip: a 4 px white bar overlaid at the current time.
  return `[0:v]${steps.join(",")}[v];[1:v]format=rgba[ph];[v][ph]overlay=x='${barX}+${barW}*t/${D.toFixed(3)}':y=${barY - 10}:shortest=1,format=yuv420p[out]`;
}

/** Renders the proof clip of `videoPath` (the normalized run copy) to `outPath`. */
export async function renderProof(videoPath: string, outPath: string, r: VideoReport, text: ProofText, workDir: string): Promise<void> {
  const script = join(workDir, "proof-filter.txt");
  await writeFile(script, proofFilter(r, text));
  await ffmpeg(
    [
      "-v", "error", "-y",
      "-i", videoPath,
      "-f", "lavfi", "-i", `color=c=white:s=4x44:r=${FPS}`,
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

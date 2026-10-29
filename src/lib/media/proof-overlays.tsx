// The proof clip's text, drawn as transparent PNGs with next/og (the same renderer as the share cards) and laid over
// the video by ffmpeg: Vercel's ffmpeg build has no drawtext. Geist from Next is the face (SIL Open Font License).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PROOF_W } from "./proof";

const FONT = join(process.cwd(), "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf");

async function png(node: React.ReactElement, height: number): Promise<Buffer> {
  const font = await readFile(FONT);
  const res = new ImageResponse(node, { width: PROOF_W, height, fonts: [{ name: "Geist", data: font, weight: 400, style: "normal" }] });
  return Buffer.from(await res.arrayBuffer());
}

/** The top band: the verdict pill, why ("Missed: Say the brand name at least once"), and "Brand · 10.2 s on screen · @creator". */
export function topBand(word: string, pill: string, line: string, reason: string): Promise<Buffer> {
  return png(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "28px 32px", background: "rgba(20,19,15,0.82)", fontFamily: "Geist", gap: 12 }}>
      <div style={{ display: "flex", alignSelf: "flex-start", padding: "6px 16px", borderRadius: 10, background: pill, color: "#fff", fontSize: 40 }}>{word}</div>
      <div style={{ display: "flex", color: "#fff", fontSize: 27 }}>{reason}</div>
      <div style={{ display: "flex", color: "rgba(255,255,255,0.75)", fontSize: 23 }}>{line}</div>
    </div>,
    210,
  );
}

/** The credit line under the strip. */
export function footer(text: string): Promise<Buffer> {
  return png(<div style={{ display: "flex", width: "100%", height: "100%", padding: "0 32px", alignItems: "center", color: "rgba(255,255,255,0.72)", fontSize: 20, fontFamily: "Geist" }}>{text}</div>, 34);
}

/** The violet label shown while the brand is said. */
export function mentionLabel(text: string): Promise<Buffer> {
  return png(
    <div style={{ display: "flex", width: "100%", height: "100%", padding: "0 32px", alignItems: "center", fontFamily: "Geist" }}>
      <div style={{ display: "flex", padding: "8px 16px", borderRadius: 10, background: "#5446d0", color: "#fff", fontSize: 30 }}>{text}</div>
    </div>,
    64,
  );
}

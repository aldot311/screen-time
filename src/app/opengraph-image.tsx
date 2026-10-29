import { ImageResponse } from "next/og";
import { googleFont } from "@/lib/og-font";

export const alt = "Screen-Time: proof your product was seen in creator video";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The share card in the Editorial palette: the mark, the headline with lime on "seen." (the one brand use of the
// signal color), and the product's own strip below, lime where it was on screen, a dashed red look-alike, a violet
// spoken mention and the playhead.
const PAPER = "#f7f6f2";
const INK = "#14130f";
const INK_2 = "#4f4b44";
const SIGNAL = "#c5f03a";
const VOICE = "#5446d0";
const REJECT = "#c2392b";
const WASH = "#efede7";
const HAIR = "#d6d2c9";

const HEAD = "Proof your product was seen.";
const SUB = "Every frame of a sponsored video, checked against the contract. Built on Meta SAM 3.1 and Muse.";
const SEGMENTS: [number, number][] = [[0.04, 0.22], [0.3, 0.52], [0.58, 0.6], [0.7, 0.93]];

export default async function OpengraphImage() {
  const [display, body] = await Promise.all([
    googleFont("Bricolage Grotesque", "opsz,wght@96,650", `${HEAD}Screen-Time`),
    googleFont("Hanken Grotesk", "wght@500", SUB),
  ]);
  const fonts = [
    ...(display ? [{ name: "Display", data: display, weight: 600 as const, style: "normal" as const }] : []),
    ...(body ? [{ name: "Body", data: body, weight: 500 as const, style: "normal" as const }] : []),
  ];
  const displayFamily = display ? "Display" : undefined;
  const bodyFamily = body ? "Body" : undefined;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          padding: "64px 72px 68px",
          color: INK,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 36, fontWeight: 600, fontFamily: displayFamily, letterSpacing: -1 }}>
          {/* The mark: the strip in miniature on an ink tile. */}
          <div style={{ display: "flex", position: "relative", width: 56, height: 56, borderRadius: 16, background: INK }}>
            <div style={{ position: "absolute", left: 8, top: 23, width: 40, height: 10, borderRadius: 5, background: "rgba(255,255,255,0.2)" }} />
            <div style={{ position: "absolute", left: 8, top: 23, width: 25, height: 10, borderRadius: 5, background: SIGNAL }} />
            <div style={{ position: "absolute", left: 36, top: 14, width: 4.5, height: 28, borderRadius: 2.25, background: "#fff" }} />
          </div>
          Screen-Time
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              fontSize: 100,
              fontWeight: 600,
              fontFamily: displayFamily,
              letterSpacing: -3.5,
              lineHeight: 0.98,
            }}
          >
            Proof your product was&nbsp;
            <div style={{ display: "flex", position: "relative" }}>
              <div style={{ position: "absolute", left: -6, right: -6, top: 20, bottom: 0, borderRadius: 12, background: SIGNAL }} />
              <span style={{ position: "relative" }}>seen.</span>
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 30, color: INK_2, fontFamily: bodyFamily, lineHeight: 1.35, maxWidth: 940 }}>{SUB}</div>
        </div>

        <div style={{ display: "flex", position: "relative", height: 52, borderRadius: 12, background: WASH, border: `2px solid ${HAIR}`, overflow: "hidden" }}>
          {SEGMENTS.map(([a, b]) => (
            <div key={a} style={{ position: "absolute", top: 0, bottom: 0, left: `${a * 100}%`, width: `${(b - a) * 100}%`, background: SIGNAL }} />
          ))}
          <div
            style={{
              position: "absolute",
              top: 8,
              bottom: 8,
              left: "53.5%",
              width: "4%",
              borderRadius: 6,
              border: `2.5px dashed ${REJECT}`,
              background: "#fbe9e5",
            }}
          />
          <div style={{ position: "absolute", top: 24, bottom: 0, left: "36%", width: 6, borderRadius: 3, background: VOICE }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, left: "64%", width: 5, borderRadius: 2.5, background: INK }} />
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}

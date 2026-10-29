import { ImageResponse } from "next/og";

export const alt = "Screen-Time: proof your product was seen in creator video";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The share card: the headline over the product's own strip, lime where the product was on screen.
const SEGMENTS: [number, number][] = [[0.04, 0.22], [0.3, 0.52], [0.58, 0.6], [0.7, 0.93]];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f7f8fa", padding: 72, color: "#0e1116" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 600 }}>
          <div style={{ display: "flex", position: "relative", width: 54, height: 36, borderRadius: 9, background: "#0e1116" }}>
            <div style={{ position: "absolute", left: 13, top: 7, width: 23, height: 22, borderRadius: 3, background: "#c8f031" }} />
            <div style={{ position: "absolute", left: 27, top: 3, width: 4, height: 30, borderRadius: 2, background: "#fff" }} />
          </div>
          Screen-Time
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 700, letterSpacing: -3, lineHeight: 1 }}>
            Proof your product was&nbsp;
            <span style={{ display: "flex", background: "#c8f031", padding: "0 10px", borderRadius: 8 }}>seen.</span>
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#444b57" }}>
            Every frame of a sponsored video, checked against the contract. Built on Meta SAM 3.1 and Muse.
          </div>
        </div>
        <div style={{ display: "flex", position: "relative", height: 56, borderRadius: 10, background: "#eef0f3", border: "2px solid #cfd4db" }}>
          {SEGMENTS.map(([a, b]) => (
            <div key={a} style={{ position: "absolute", top: 0, bottom: 0, left: `${a * 100}%`, width: `${(b - a) * 100}%`, background: "#c8f031" }} />
          ))}
          <div style={{ position: "absolute", top: 26, bottom: 0, left: "36%", width: 6, borderRadius: 3, background: "#6e56cf" }} />
          <div style={{ position: "absolute", top: -6, bottom: -6, left: "64%", width: 4, background: "#0e1116" }} />
        </div>
      </div>
    ),
    size,
  );
}

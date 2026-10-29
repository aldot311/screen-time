import { ImageResponse } from "next/og";
import { getCampaign, getVideo } from "@/lib/campaign/store";
import { verdictOf } from "@/components/format";
import { googleFont } from "@/lib/og-font";

export const alt = "A Screen-Time report: whether the brand's product was seen, to the second";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#f7f6f2";
const INK = "#14130f";
const INK_2 = "#4f4b44";
const SIGNAL = "#c5f03a";
const VOICE = "#5446d0";
const WASH = "#efede7";
const VERDICT = {
  delivered: { word: "Delivered", bg: "#137a4c" },
  short: { word: "Fell short", bg: "#c2392b" },
  review: { word: "Needs review", bg: "#8c5e00" },
  pending: { word: "Not run", bg: INK_2 },
} as const;
const tenths = (n: number) => (Math.floor(n * 10 + 1e-6) / 10).toFixed(1);

/** Each report's share card: the verdict, the seconds on screen, the strip, and the frame where the product was largest. */
export default async function ReportCard({ params }: { params: Promise<{ id: string; videoId: string }> }) {
  const { id, videoId } = await params;
  const [campaign, video] = await Promise.all([getCampaign(id), getVideo(id, videoId)]);
  const r = video?.report;
  const v = VERDICT[verdictOf(r)];
  const brand = campaign?.brand ?? "Screen-Time";
  const head = r ? `${brand} was on screen ${tenths(r.metrics.secondsOnScreen)} s` : `${brand}: not analyzed yet`;
  const met = r ? r.terms.filter((t) => t.pass === true).length : 0;
  const sub = r ? `${video?.creator} · ${met} of ${r.terms.length} contract terms met · ${tenths(r.info.durationSec)} s video` : (video?.creator ?? "");
  const [display, body] = await Promise.all([googleFont("Bricolage Grotesque", "opsz,wght@96,650", `${head}${v.word}Screen-Time`), googleFont("Hanken Grotesk", "wght@500", sub)]);
  const fonts = [
    ...(display ? [{ name: "Display", data: display, weight: 600 as const, style: "normal" as const }] : []),
    ...(body ? [{ name: "Body", data: body, weight: 500 as const, style: "normal" as const }] : []),
  ];
  // Only a stored https still can be fetched by the renderer.
  const still = video?.thumbUrl?.startsWith("https://") ? video.thumbUrl : null;
  const D = r?.info.durationSec ?? 1;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, color: INK, padding: 56, gap: 48 }}>
        {still ? (
          <img src={still} alt="" width={290} height={518} style={{ borderRadius: 28, objectFit: "cover", border: `6px solid ${SIGNAL}` }} />
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 600, fontFamily: display ? "Display" : undefined }}>
            <div style={{ display: "flex", position: "relative", width: 46, height: 46, borderRadius: 13, background: INK }}>
              <div style={{ position: "absolute", left: 7, top: 19, width: 32, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.2)" }} />
              <div style={{ position: "absolute", left: 7, top: 19, width: 20, height: 8, borderRadius: 4, background: SIGNAL }} />
            </div>
            Screen-Time
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ display: "flex", alignSelf: "flex-start", padding: "10px 22px", borderRadius: 999, background: v.bg, color: "#fff", fontSize: 34, fontWeight: 600, fontFamily: display ? "Display" : undefined }}>
              {v.word}
            </div>
            <div style={{ display: "flex", fontSize: 64, lineHeight: 1.02, fontWeight: 600, letterSpacing: -2, fontFamily: display ? "Display" : undefined }}>{head}</div>
            <div style={{ display: "flex", fontSize: 28, color: INK_2, fontFamily: body ? "Body" : undefined }}>{sub}</div>
          </div>
          <div style={{ display: "flex", position: "relative", height: 44, borderRadius: 10, background: WASH, overflow: "hidden" }}>
            {(r?.metrics.segments ?? []).map((s) => (
              <div key={s.startSec} style={{ position: "absolute", top: 0, bottom: 0, left: `${(s.startSec / D) * 100}%`, width: `${((s.endSec - s.startSec) / D) * 100}%`, background: SIGNAL }} />
            ))}
            {(r?.metrics.mentions ?? []).map((m) => (
              <div key={m.startSec} style={{ position: "absolute", top: 18, bottom: 0, left: `${(m.startSec / D) * 100}%`, width: 6, borderRadius: 3, background: VOICE }} />
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}

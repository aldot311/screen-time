"use client";

// The landing page's proof: a real report replayed live. The video loops muted with SAM's boxes on it, the
// screen-time strip fills in as it plays, and the counter adds up only the seconds the brand's product was seen.
import { useMemo, useState } from "react";
import { Check, CircleDashed, CircleHelp, X } from "lucide-react";
import { FPS, type TermResult, type VideoMetrics, type VideoReport } from "@/lib/types";
import { ScreenTimeStrip } from "./screen-time-strip";
import { VideoOverlayPlayer } from "./video-overlay-player";
import { countedBefore, framesToSegments, timecode } from "./format";

interface Props {
  report: VideoReport;
  videoUrl: string;
  poster?: string;
  cropUrls?: Record<string, string>;
  /** What each tracked object is, for people who have not read the report: "Alani Nu can". */
  names?: Record<string, string>;
}

export function LiveDemo({ report, videoUrl, poster, cropUrls = {}, names = {} }: Props) {
  const [time, setTime] = useState(0);
  const m = report.metrics;
  const counted = countedBefore(m, time);
  const heard = m.mentions.filter((x) => x.startSec <= time);
  const rejected = useMemo(
    () => framesToSegments((report.detections ?? []).filter((d) => d.verdict !== "match").map((d) => d.frame)),
    [report.detections],
  );
  // An object shows in the list once the video has reached its first appearance.
  const firstSeen = useMemo(() => {
    const out = new Map<number, number>();
    for (const d of report.detections ?? []) out.set(d.objectId, Math.min(out.get(d.objectId) ?? Infinity, d.frame / FPS));
    return out;
  }, [report.detections]);

  return (
    <div className="rounded-[14px] border border-line bg-surface p-3 shadow-1 sm:p-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,240px)_1fr]">
        <div className="mx-auto w-full max-w-[240px]">
          <VideoOverlayPlayer
            src={videoUrl}
            poster={poster}
            width={report.info.width}
            height={report.info.height}
            boxes={report.detections ?? []}
            onTime={setTime}
            ambient
          />
        </div>

        <div className="flex min-w-0 flex-col">
          <p className="text-[12px] font-medium text-ink-3">Brand product on screen</p>
          <p className="mt-0.5 flex items-baseline gap-2">
            <span className="text-[48px] font-semibold leading-none tracking-[-0.04em]" aria-live="off">
              <Figure value={counted} />
            </span>
            <span className="text-[15px] text-ink-2">
              s of <span className="tabular">{report.info.durationSec.toFixed(1)}</span>
            </span>
          </p>
          <p className="mt-2 h-5 text-[13px] text-ink-2">
            {heard.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-[3px] rounded-sm bg-violet" aria-hidden />
                Heard &ldquo;{heard.at(-1)!.text}&rdquo; at <span className="font-mono tabular">{timecode(heard.at(-1)!.startSec)}</span>
              </span>
            )}
          </p>

          <ul className="mt-4 space-y-2.5">
            {report.tracks.map((t) => {
              const match = t.verdict === "match";
              const seen = (firstSeen.get(t.objectId) ?? Infinity) <= time + 0.05;
              const crop = cropUrls[t.objectId];
              return (
                <li
                  key={t.objectId}
                  className={[
                    "flex items-center gap-3 rounded-[10px] border p-2 transition-[opacity,transform] duration-300",
                    match ? "border-line bg-surface" : "border-fail/20 bg-fail-soft",
                    seen ? "opacity-100" : "translate-y-1 opacity-0",
                  ].join(" ")}
                >
                  {crop ? (
                    // eslint-disable-next-line @next/next/no-img-element -- stored stills, already small JPEGs
                    <img src={crop} alt="" className="h-14 w-10 shrink-0 rounded-[6px] object-cover" />
                  ) : (
                    <span className="h-14 w-10 shrink-0 rounded-[6px] bg-sunken" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{names[t.objectId] ?? (match ? "Brand product" : "Another product")}</span>
                    <span className={`block text-[12px] font-medium ${match ? "text-pass" : "text-fail"}`}>
                      {match ? "Counted" : "Rejected by Muse Spark, not counted"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          {report.terms.length > 0 && (
            <div className="mt-auto pt-5">
              <p className="text-[12px] font-medium text-ink-3">Contract</p>
              <ul className="mt-1.5 space-y-1">
                {report.terms.map((t) => {
                  const decidedAt = settlesAt(t, m, report.info.durationSec);
                  const state = time < decidedAt ? "open" : t.pass === true ? "pass" : t.pass === false ? "fail" : "unsure";
                  const Icon = state === "pass" ? Check : state === "fail" ? X : state === "unsure" ? CircleHelp : CircleDashed;
                  return (
                    <li key={t.term.text} className={`flex items-start gap-2 text-[13px] ${state === "open" ? "text-ink-3" : "text-ink"}`}>
                      <Icon
                        className={`mt-0.5 size-3.5 shrink-0 ${{ open: "text-ink-3", pass: "text-pass", fail: "text-fail", unsure: "text-unsure" }[state]}`}
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      {t.term.text}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <ScreenTimeStrip
          durationSec={report.info.durationSec}
          segments={m.segments}
          mentions={m.mentions}
          rejected={rejected}
          playheadSec={time}
          fillTo={time}
        />
      </div>
    </div>
  );
}

/** When a replay has shown enough to settle a term: a met total settles the moment the count reaches it, other
 *  met terms at the end of their last proof, and anything not met only at the end of the video. */
function settlesAt(t: TermResult, metrics: VideoMetrics, durationSec: number): number {
  const end = durationSec - 0.2;
  if (t.pass !== true) return end;
  const frames = metrics.visibleFrames;
  if (t.term.rule?.kind === "min_seconds_total" && frames) {
    const nth = frames[Math.ceil(t.term.rule.seconds * FPS) - 1];
    return nth === undefined ? end : (nth + 1) / FPS;
  }
  return t.evidence.at(-1)?.endSec ?? end;
}

/** "6.9" with tabular digits (so the counter does not jitter) but a proportional point, which Geist would otherwise
 *  set as wide as a digit ("6 . 9"). */
function Figure({ value }: { value: number }) {
  const [whole, tenth] = value.toFixed(1).split(".");
  return (
    <>
      <span className="tabular">{whole}</span>.<span className="tabular">{tenth}</span>
    </>
  );
}

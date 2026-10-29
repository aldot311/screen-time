"use client";

// The landing page's proof: a real run replayed. The clip loops muted with SAM's boxes on it, the strip fills only
// while the brand's product is on screen, the counter adds up those seconds, and each contract term ticks off at the
// moment the replay has shown enough to settle it.
//
// Layout: on a phone the video is the hero at full card width, with the strip as its scrubber right under it, then
// the counter beside the object crops, then the contract. From sm up the video sits left and the counter, crops and
// contract fill the column beside it (no empty band), with the strip across the bottom.
import { useMemo, useState } from "react";
import { Check, CircleHelp, X } from "lucide-react";
import { FPS, type TermResult, type VideoMetrics, type VideoReport } from "@/lib/types";
import { countedBefore, framesToSegments, timecode, verdictOf } from "@/components/format";
import { Player } from "./player";
import { Strip } from "./strip";
import { Figure, VerdictPill } from "./bits";

interface Props {
  report: VideoReport;
  videoUrl: string;
  cropUrls?: Record<string, string>;
  names?: Record<string, string>;
}

type TermState = "open" | "pass" | "fail" | "unsure";

export function LiveReplay({ report, videoUrl, cropUrls = {}, names = {} }: Props) {
  const [time, setTime] = useState(0);
  const m = report.metrics;
  const duration = report.info.durationSec;
  const counted = countedBefore(m, time);
  const heard = m.mentions.filter((x) => x.startSec <= time);
  const rejected = useMemo(
    () => framesToSegments((report.detections ?? []).filter((d) => d.verdict !== "match").map((d) => d.frame)),
    [report.detections],
  );
  const firstSeen = useMemo(() => {
    const out = new Map<number, number>();
    for (const d of report.detections ?? []) out.set(d.objectId, Math.min(out.get(d.objectId) ?? Infinity, d.frame / FPS));
    return out;
  }, [report.detections]);

  const states: TermState[] = report.terms.map((t) =>
    time < settlesAt(t, m, duration) ? "open" : t.pass === true ? "pass" : t.pass === false ? "fail" : "unsure",
  );
  const settled = states.filter((s) => s !== "open").length;
  const allSettled = report.terms.length > 0 && settled === report.terms.length;

  return (
    <div className="rounded-[28px] bg-(--card) p-2.5 shadow-(--sh-3) ring-1 ring-black/[0.04] sm:p-5">
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-[minmax(0,262px)_minmax(0,1fr)] sm:grid-rows-[auto_1fr_auto]">
        {/* The video: full card width on a phone. */}
        <div className="sm:row-span-2">
          <Player
            src={videoUrl}
            width={report.info.width}
            height={report.info.height}
            boxes={report.detections ?? []}
            durationSec={duration}
            onTime={setTime}
            ambient
            rounded="rounded-[20px] sm:rounded-[18px]"
          />
        </div>

        {/* The strip: the scrubber under the video on a phone, across the whole card from sm up. */}
        <div className="mt-4 px-1.5 sm:col-span-2 sm:row-start-3 sm:mt-5 sm:px-1">
          <Strip
            durationSec={duration}
            segments={m.segments}
            mentions={m.mentions}
            rejected={rejected}
            playheadSec={time}
            fillTo={time}
            size="compact"
          />
        </div>

        {/* Counter and crops: side by side on a phone, stacked in the right column from sm up. */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-5 gap-y-4 px-2 pt-5 pb-1 sm:col-start-2 sm:row-start-1 sm:grid-cols-1 sm:px-0 sm:pt-1 sm:pb-0">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-(--ink-2)">Product on screen</p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="ed-num text-[56px] leading-[0.9] sm:text-[64px]" aria-live="off">
                <Figure value={counted} />
              </span>
              <span className="ed-display text-[20px] text-(--ink-2) sm:text-[22px]">s</span>
            </p>
            <p className="mt-1.5 text-[13px] leading-snug text-(--ink-3)">
              of <span className="tabular">{duration.toFixed(1)}</span> s, counted so far
            </p>
          </div>

          <ul className="space-y-2.5 sm:space-y-2" aria-label="Objects SAM found">
            {report.tracks.map((t) => {
              const match = t.verdict === "match";
              const seen = (firstSeen.get(t.objectId) ?? Infinity) <= time + 0.05;
              const crop = cropUrls[t.objectId];
              return (
                <li
                  key={t.objectId}
                  className={[
                    "flex items-center gap-3 transition-[opacity,transform,filter] duration-500 ease-(--ease-out)",
                    seen ? "opacity-100" : "translate-y-1.5 opacity-0 blur-[2px]",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "relative block h-14 w-11 shrink-0 overflow-hidden rounded-[10px] bg-(--wash) sm:h-12 sm:w-9 sm:rounded-[8px]",
                      match ? "ring-2 ring-(--signal)" : "outline-[1.5px] outline-offset-1 outline-(--reject) outline-dashed",
                    ].join(" ")}
                  >
                    {crop && (
                      // eslint-disable-next-line @next/next/no-img-element -- stored stills, already small JPEGs
                      <img src={crop} alt="" className="size-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 text-[14px] leading-tight sm:text-[13px]">
                    <span className="block font-semibold [overflow-wrap:anywhere]">
                      {names[t.objectId] ?? (match ? "Brand product" : "Another product")}
                    </span>
                    <span className={`mt-0.5 block font-medium ${match ? "text-(--pass)" : "text-(--reject)"}`}>
                      {match ? "Counted" : "Rejected"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="col-span-2 min-h-5 text-[13px] text-(--ink-2) sm:col-span-1" aria-live="polite">
            {heard.length > 0 && (
              <span className="inline-flex items-start gap-1.5">
                <span className="mt-[3px] inline-block h-3.5 w-[3px] shrink-0 rounded-sm bg-(--voice)" aria-hidden />
                <span>
                  Heard &ldquo;{heard.at(-1)!.text}&rdquo; at <span className="ed-tc">{timecode(heard.at(-1)!.startSec)}</span>
                </span>
              </span>
            )}
          </p>
        </div>

        {/* The contract: ticks off as the replay settles each term. */}
        {report.terms.length > 0 && (
          <div className="mt-3 sm:col-start-2 sm:row-start-2 sm:mt-4 sm:self-end">
            <div className="flex min-h-8 items-center justify-between gap-3 px-2 sm:px-0">
              <p className="text-[13px] font-semibold text-(--ink)">The contract</p>
              <span className="relative grid min-h-8 place-items-end">
                <span
                  className={`col-start-1 row-start-1 text-[13px] text-(--ink-3) transition-opacity duration-300 ${allSettled ? "opacity-0" : "opacity-100"}`}
                  aria-hidden={allSettled}
                >
                  <span className="tabular">{settled}</span> of <span className="tabular">{report.terms.length}</span> checked
                </span>
                <span
                  className={`col-start-1 row-start-1 transition-[opacity,transform] duration-300 ease-(--ease-out) ${allSettled ? "scale-100 opacity-100" : "scale-90 opacity-0"}`}
                  aria-hidden={!allSettled}
                >
                  <VerdictPill verdict={verdictOf(report)} />
                </span>
              </span>
            </div>
            <ul className="mt-1.5 divide-y divide-(--hair) rounded-[18px] bg-(--paper) px-4 sm:px-3.5">
              {report.terms.map((t, i) => {
                const state = states[i];
                const Icon = state === "fail" ? X : state === "unsure" ? CircleHelp : Check;
                return (
                  <li key={t.term.text} className="flex min-h-12 items-center gap-3 py-2.5 text-[15px] leading-snug sm:min-h-11 sm:py-2 sm:text-[13.5px]">
                    <span
                      className={[
                        "grid size-6 shrink-0 place-items-center rounded-full transition-[background-color,color,transform] duration-300 ease-(--ease-out) sm:size-5",
                        {
                          open: "scale-90 bg-(--wash) text-transparent shadow-[inset_0_0_0_1.5px_var(--hair-2)]",
                          pass: "bg-(--pass) text-white",
                          fail: "bg-(--short) text-white",
                          unsure: "bg-(--review) text-white",
                        }[state],
                      ].join(" ")}
                    >
                      <Icon className="size-3.5 sm:size-3" strokeWidth={3} aria-hidden />
                    </span>
                    <span className={`transition-colors duration-300 ${state === "open" ? "text-(--ink-3)" : "font-medium text-(--ink)"}`}>
                      {t.term.text}
                    </span>
                    <span className="sr-only">
                      {state === "open" ? "checking" : state === "pass" ? "met" : state === "fail" ? "not met" : "needs a person"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** When the replay has shown enough to settle a term (same rule as the app's landing demo). */
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

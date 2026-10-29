"use client";

// The landing page's proof: a real run replayed. The clip loops muted with SAM's boxes on it, the lanes fill only with
// what has played (lime while the brand's product is on screen, hatched red for the look-alike, violet when the brand
// is said), the counter adds up those seconds, and each contract term ticks off at the exact moment its threshold is
// crossed. With reduced motion the replay waits on a clear Play control instead of starting by itself.
//
// Layout: on a phone the video is the hero at full card width, with the lanes right under it, then the counter beside
// the object crops, then the contract. From sm up the video sits left and the counter, crops and contract fill the
// column beside it, with the lanes across the bottom.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Check, CircleHelp, Play, X } from "lucide-react";
import { FPS, type Mention, type TermResult, type VideoMetrics, type VideoReport } from "@/lib/types";
import { countedBefore, framesToSegments, tenths, timecode, verdictOf } from "@/components/format";
import { Player, type PlayerHandle } from "./player";
import { LandingLanes } from "./landing-lanes";
import { Figure, VerdictPill } from "./bits";

interface Props {
  report: VideoReport;
  videoUrl: string;
  poster?: string;
  cropUrls?: Record<string, string>;
  names?: Record<string, string>;
}

type TermState = "open" | "pass" | "fail" | "unsure";

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function LiveReplay({ report, videoUrl, poster, cropUrls = {}, names = {} }: Props) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const player = useRef<PlayerHandle>(null);
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);

  // Reduced motion: hold the replay on its first frame until the viewer asks for it.
  useEffect(() => {
    if (reduced) player.current?.seek(0);
  }, [reduced]);

  const m = report.metrics;
  const duration = report.info.durationSec;
  const counted = countedBefore(m, time);
  const heard = m.mentions.filter((x) => x.startSec <= time);
  // The same look-alike boxes the player draws (it skips unsure ones and specks), so the lane and the video agree.
  const rejected = useMemo(() => {
    const area = report.info.width * report.info.height;
    return framesToSegments(
      (report.detections ?? [])
        .filter(
          (d) =>
            d.verdict !== "match" &&
            (d.confidence === undefined || d.confidence >= 0.5) &&
            ((d.box.x2 - d.box.x1 + 1) * (d.box.y2 - d.box.y1 + 1)) / area >= 0.001,
        )
        .map((d) => d.frame),
    );
  }, [report.detections, report.info.width, report.info.height]);
  const firstSeen = useMemo(() => {
    const out = new Map<number, number>();
    for (const d of report.detections ?? []) out.set(d.objectId, Math.min(out.get(d.objectId) ?? Infinity, d.frame / FPS));
    return out;
  }, [report.detections]);
  const settle = useMemo(() => report.terms.map((t) => settlesAt(t, m, duration)), [report.terms, m, duration]);

  const states: TermState[] = report.terms.map((t, i) =>
    time < settle[i] ? "open" : t.pass === true ? "pass" : t.pass === false ? "fail" : "unsure",
  );
  const settled = states.filter((s) => s !== "open").length;
  const allSettled = report.terms.length > 0 && settled === report.terms.length;

  return (
    <div className="rounded-[28px] bg-(--card) p-2.5 shadow-(--sh-3) ring-1 ring-black/[0.04] sm:p-5">
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-[minmax(0,262px)_minmax(0,1fr)] sm:grid-rows-[auto_1fr_auto]">
        {/* The video: full card width on a phone. */}
        <div className="relative sm:row-span-2">
          <Player
            ref={player}
            src={videoUrl}
            poster={poster}
            width={report.info.width}
            height={report.info.height}
            boxes={report.detections ?? []}
            durationSec={duration}
            onTime={setTime}
            onPlayingChange={setPlaying}
            ambient
            rounded="rounded-[20px] sm:rounded-[18px]"
          />
          {reduced && !playing && (
            <button
              type="button"
              onClick={() => player.current?.toggle()}
              className="ed-press ed-glass-dark absolute top-1/2 left-1/2 inline-flex h-14 -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full pr-6 pl-5 whitespace-nowrap text-[16px] font-semibold text-white shadow-(--sh-2) active:bg-black/60"
            >
              <Play className="size-5" fill="currentColor" strokeWidth={0} aria-hidden />
              Play the replay
            </button>
          )}
        </div>

        {/* The lanes: right under the video on a phone, across the whole card from sm up. */}
        <div className="mt-4 px-1.5 sm:col-span-2 sm:row-start-3 sm:mt-5 sm:px-1">
          <LandingLanes durationSec={duration} segments={m.segments} rejected={rejected} mentions={m.mentions} timeSec={time} />
        </div>

        {/* Counter and crops: side by side on a phone, stacked in the right column from sm up. */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-5 gap-y-3 px-2 pt-5 pb-1 sm:col-start-2 sm:row-start-1 sm:grid-cols-1 sm:gap-y-4 sm:px-0 sm:pt-1 sm:pb-0">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-(--ink-2)">Product on screen</p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="ed-num text-[56px] leading-[0.9] sm:text-[64px]" aria-live="off">
                <Figure value={counted} />
              </span>
              <span className="ed-display text-[20px] text-(--ink-2) sm:text-[22px]">s</span>
            </p>
            <p className="mt-1.5 text-[13px] leading-snug text-(--ink-3)">
              of <span className="tabular">{tenths(duration)}</span> s, counted so far
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

        {/* The contract: each term ticks at the moment the replay crosses its threshold. */}
        {report.terms.length > 0 && (
          <div className="mt-2 sm:col-start-2 sm:row-start-2 sm:mt-4 sm:self-end">
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

/**
 * The moment the replay has shown enough to settle a term: the frame on which its threshold is crossed. Terms that
 * fail or cannot be checked only settle at the end, since the whole video has to play before a miss is certain.
 */
function settlesAt(t: TermResult, metrics: VideoMetrics, durationSec: number): number {
  const end = durationSec - 0.2;
  const rule = t.term.rule;
  if (t.pass !== true || !rule) return end;
  const frames = visibleFrames(metrics);
  // The time the nth counted frame has finished showing.
  const nth = (fs: number[], n: number) => {
    const f = fs[Math.max(1, n) - 1];
    return f === undefined ? end : (f + 1) / FPS;
  };
  const need = (sec: number) => Math.ceil(sec * FPS - 1e-6);
  switch (rule.kind) {
    case "min_seconds_total":
      return nth(frames, need(rule.seconds));
    case "min_seconds_within":
      return nth(frames.filter((f) => f < rule.withinFirstSec * FPS - 1e-6), need(rule.seconds));
    case "mentioned":
      return nthMention(metrics.mentions, rule.minTimes, rule.withinFirstSec) ?? end;
    case "first_seen_before":
      return frames.length ? (frames[0] + 1) / FPS : end;
    case "min_continuous": {
      let run = 0;
      for (let i = 0; i < frames.length; i++) {
        run = i > 0 && frames[i] === frames[i - 1] + 1 ? run + 1 : 1;
        if (run >= need(rule.seconds)) return (frames[i] + 1) / FPS;
      }
      return end;
    }
    default:
      return t.evidence.at(-1)?.endSec ?? end;
  }
}

function nthMention(mentions: Mention[], n: number, withinFirstSec?: number): number | undefined {
  const ms = mentions
    .filter((x) => withinFirstSec === undefined || x.startSec < withinFirstSec)
    .sort((a, b) => a.startSec - b.startSec);
  return ms[Math.max(1, n) - 1]?.endSec;
}

function visibleFrames(metrics: VideoMetrics): number[] {
  if (metrics.visibleFrames) return [...metrics.visibleFrames].sort((a, b) => a - b);
  const out: number[] = [];
  for (const s of metrics.segments) for (let f = Math.round(s.startSec * FPS); f < Math.round(s.endSec * FPS); f++) out.push(f);
  return out;
}

"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Check, CircleHelp, Mic, ScanSearch, X } from "lucide-react";
import type { TermResult, VideoReport } from "@/lib/types";
import { ScreenTimeStrip } from "./screen-time-strip";
import { VideoOverlayPlayer, type PlayerHandle } from "./video-overlay-player";
import { percent, seconds, termCounts, termWindow, timecode, verdictOf } from "./format";
import { VerdictBadge } from "./verdict-badge";

interface Props {
  report: VideoReport;
  videoUrl: string;
  creator: string;
  synthetic?: boolean;
}

export function ReportView({ report, videoUrl, creator, synthetic }: Props) {
  const player = useRef<PlayerHandle>(null);
  const [time, setTime] = useState(0);
  const [focus, setFocus] = useState<TermResult | null>(null);
  const m = report.metrics;
  const verdict = verdictOf(report);
  const counts = termCounts(report.terms);

  const seek = useCallback((sec: number) => {
    player.current?.seek(sec);
    setTime(sec);
  }, []);

  const boxes = useMemo(() => report.detections ?? [], [report.detections]);
  const rejected = report.tracks.filter((t) => t.verdict !== "match");

  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <div className="lg:row-span-2">
        <VideoOverlayPlayer
          ref={player}
          src={videoUrl}
          width={report.info.width}
          height={report.info.height}
          boxes={boxes}
          onTime={setTime}
          // Preview reports have no real boxes (labels say when, not where), so none are drawn.
          showBoxes={!synthetic}
        />
        <p className="mt-3 text-[12px] text-ink-3">
          {synthetic
            ? "Preview reports mark when the product is on screen, not where, so no boxes are drawn."
            : <>Boxes come from SAM 3.1 tracking &ldquo;{report.prompt}&rdquo;. Lime is counted; dashed red was rejected as a look-alike.</>}
        </p>
      </div>

      <section aria-labelledby="verdict" className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <VerdictBadge verdict={verdict} size="lg" />
          <h2 id="verdict" className="text-[15px] font-medium text-ink-2">
            {counts.passed} of {report.terms.length} contract terms met
            {counts.unchecked ? `, ${counts.unchecked} need a person` : ""}
          </h2>
        </div>

        <ol className="mt-5 divide-y divide-line rounded-[10px] border border-line bg-surface shadow-1">
          {report.terms.map((t) => (
            <TermRow
              key={t.term.text}
              result={t}
              active={focus === t}
              onFocus={() => setFocus(t)}
              onBlur={() => setFocus((f) => (f === t ? null : f))}
              onJump={() => {
                const target = t.evidence[0]?.startSec ?? termWindow(t.term.rule)?.endSec;
                if (target !== undefined) seek(target);
              }}
            />
          ))}
          {!report.terms.length && (
            <li className="px-4 py-3 text-ink-3">No contract terms were set for this campaign.</li>
          )}
        </ol>

        <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3 xl:grid-cols-6">
          <Figure label="On screen" value={seconds(m.secondsOnScreen)} note={`of ${seconds(report.info.durationSec)}`} lead />
          <Figure label="Share of video" value={percent(m.shareOfVideo)} />
          <Figure label="First seen" value={m.firstSeenSec === null ? "Never" : timecode(m.firstSeenSec)} onClick={m.firstSeenSec === null ? undefined : () => seek(m.firstSeenSec!)} />
          <Figure label="Longest run" value={seconds(m.longestRunSec)} />
          <Figure label="Size in frame" value={percent(m.avgAreaFraction, 1)} note="average" />
          <Figure label="Prominence" value={`${Math.round(m.prominenceScore)}`} note="of 100" />
        </dl>
      </section>

      <section aria-label="Timeline" className="min-w-0 lg:col-start-2">
        <div className="mb-2 flex items-center justify-between gap-4 text-[12px] text-ink-3">
          <span className="flex items-center gap-4">
            <Legend swatch="bg-lime" label="Product on screen" />
            <Legend swatch="bg-violet" label="Brand said aloud" />
            {focus && termWindow(focus.term.rule) && <Legend swatch="border border-dashed border-ink-3" label="Term window" />}
          </span>
          <span className="font-mono tabular text-ink-2">{timecode(time)}</span>
        </div>
        <ScreenTimeStrip
          durationSec={report.info.durationSec}
          segments={m.segments}
          mentions={m.mentions}
          playheadSec={time}
          window={focus ? termWindow(focus.term.rule) : null}
          evidence={focus?.evidence ?? []}
          onSeek={seek}
        />

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-2 text-[13px] font-semibold">
              <ScanSearch className="size-4 text-ink-3" aria-hidden /> What the tracker found
            </h3>
            <ul className="mt-3 space-y-3">
              {report.tracks.map((t) => (
                <li key={t.objectId} className="flex gap-3">
                  <span
                    className={[
                      "mt-1 size-3 shrink-0 rounded-[3px]",
                      t.verdict === "match" ? "bg-lime ring-1 ring-lime-ink/20" : "border-2 border-dashed border-fail",
                    ].join(" ")}
                    aria-hidden
                  />
                  <span>
                    <span className="font-medium">
                      {t.verdict === "match" ? "Brand product" : t.verdict === "lookalike" ? "Look-alike, not counted" : "Unclear, not counted"}
                    </span>
                    <span className="text-ink-3"> · {t.visibility}</span>
                    <span className="block text-ink-2">{t.reason}</span>
                  </span>
                </li>
              ))}
              {!report.tracks.length && <li className="text-ink-3">Nothing matching &ldquo;{report.prompt}&rdquo; appeared.</li>}
            </ul>
            {rejected.length > 0 && (
              <p className="mt-3 text-[12px] text-ink-3">
                Rejected objects are shown for transparency and never count toward screen time.
              </p>
            )}
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-[13px] font-semibold">
              <Mic className="size-4 text-ink-3" aria-hidden /> Brand said aloud
            </h3>
            <ul className="mt-3 space-y-2">
              {m.mentions.map((mn) => (
                <li key={mn.startSec}>
                  <button
                    onClick={() => seek(mn.startSec)}
                    className="group flex w-full items-baseline gap-3 rounded-[6px] px-2 py-1 text-left hover:bg-violet-soft"
                  >
                    <span className="font-mono text-[12px] text-violet tabular">{timecode(mn.startSec)}</span>
                    <span>&ldquo;{mn.text}&rdquo;</span>
                  </button>
                </li>
              ))}
              {!m.mentions.length && (
                <li className="text-ink-3">
                  {synthetic ? "Audio is not analysed in the preview." : "The brand name was not heard."}
                </li>
              )}
            </ul>
          </div>
        </div>

        <p className="mt-10 border-t border-line pt-4 text-[12px] text-ink-3">
          {synthetic
            ? "Preview: these numbers come from hand-checked labels run through Screen-Time's real metrics and contract code, not from a live model run."
            : `Analysed ${report.info.frameCount} frames at 15 fps · Meta API cost $${report.cost.usd.toFixed(3)}`}
        </p>
      </section>
    </div>
  );
}

function TermRow(props: { result: TermResult; active: boolean; onFocus: () => void; onBlur: () => void; onJump: () => void }) {
  const { result, active, onFocus, onBlur, onJump } = props;
  const state = result.pass === true ? "pass" : result.pass === false ? "fail" : "unsure";
  const Icon = state === "pass" ? Check : state === "fail" ? X : CircleHelp;
  const tone = {
    pass: "bg-pass-soft text-pass",
    fail: "bg-fail-soft text-fail",
    unsure: "bg-unsure-soft text-unsure",
  }[state];
  return (
    <li>
      <button
        onMouseEnter={onFocus}
        onMouseLeave={onBlur}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={onJump}
        className={[
          "grid w-full grid-cols-[24px_1fr_auto] items-start gap-3 px-4 py-3 text-left transition-colors duration-150",
          active ? "bg-sunken" : "hover:bg-sunken/60",
        ].join(" ")}
      >
        <span className={`mt-px grid size-6 place-items-center rounded-full ${tone}`}>
          <Icon className="size-3.5" strokeWidth={2.5} aria-hidden />
          <span className="sr-only">{state === "pass" ? "Met" : state === "fail" ? "Not met" : "Not checkable"}</span>
        </span>
        <span className="min-w-0">
          <span className="block font-medium">{result.term.text}</span>
          <span className="block text-ink-2">{result.detail}</span>
        </span>
        <span className="mt-0.5 text-[12px] text-ink-3">{result.evidence.length ? "Show" : ""}</span>
      </button>
    </li>
  );
}

function Figure(props: { label: string; value: string; note?: string; lead?: boolean; onClick?: () => void }) {
  const value = (
    <span className={["whitespace-nowrap font-medium tabular tracking-[-0.01em]", props.lead ? "text-[28px] leading-8" : "text-[20px] leading-7"].join(" ")}>
      {props.lead && <span className="mr-1.5 inline-block size-2.5 rounded-[2px] bg-lime align-middle" aria-hidden />}
      {props.value}
    </span>
  );
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-ink-3">{props.label}</dt>
      <dd className="mt-1">
        {props.onClick ? (
          <button onClick={props.onClick} className="underline decoration-line-strong decoration-1 hover:decoration-ink">
            {value}
          </button>
        ) : (
          value
        )}
        {props.note && <span className={props.lead ? "block text-[12px] text-ink-3" : "ml-1.5 text-[12px] text-ink-3"}>{props.note}</span>}
      </dd>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-3 rounded-[2px] ${swatch}`} aria-hidden />
      {label}
    </span>
  );
}

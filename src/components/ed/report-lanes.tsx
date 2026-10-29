"use client";

// The report's timeline: one full-width lane per signal, each named above its track with the model that produced it.
// On screen (SAM 3.1: lime, counted seconds only, first-seen notch, longest run underlined), Look-alike (Muse Spark:
// hatched red, never counted; only when there was one) and Said aloud (Voice Transcribe: violet mentions, or "Not
// heard"). While playing, lime before the playhead is full and after it faded, so the count visibly fills. Tap or drag
// to scrub; Arrow keys move half a second, Shift+Arrow one frame, PageUp/PageDown a second, Space plays or pauses,
// Home/End jump to the ends. The stretch a proof plays is outlined while it plays (violet for a spoken mention).
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, ScanEye, ScanLine } from "lucide-react";
import { FPS, type Mention, type Segment } from "@/lib/types";
import { tenths, timecode } from "@/components/format";

export interface Lit {
  segs: Segment[];
  window: Segment | null;
  key: number;
  tone: "ink" | "voice";
}

interface Props {
  durationSec: number;
  segments: Segment[];
  mentions: Mention[];
  rejected: Segment[];
  playheadSec: number;
  /** Playing: fade the lime after the playhead. */
  playing: boolean;
  lit: Lit | null;
  preview: Segment | null;
  firstSeenSec: number | null;
  longest: Segment | null;
  onSeek: (sec: number) => void;
  onToggle: () => void;
  /** Preview reports have no audio: the voice lane says so instead of "Not heard". */
  noAudio?: boolean;
}

// Labels on the first 14 px, the playhead knob on its own row below them, so they never overlap.
const RULER = 32;

export function ReportLanes({
  durationSec,
  segments,
  mentions,
  rejected,
  playheadSec,
  playing,
  lit,
  preview,
  firstSeenSec,
  longest,
  onSeek,
  onToggle,
  noAudio = false,
}: Props) {
  const d = Math.max(durationSec, 0.001);
  const pct = (s: number) => (Math.min(Math.max(s, 0), d) / d) * 100;
  const span = (s: Segment, min = 0) => ({ left: `${pct(s.startSec)}%`, width: `max(${min}px, ${pct(s.endSec) - pct(s.startSec)}%)` });

  const track = useRef<HTMLDivElement>(null);
  const [widthPx, setWidthPx] = useState(300);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidthPx(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const seekFrom = useCallback(
    (clientX: number) => {
      const el = track.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      onSeek(Math.min(Math.max((clientX - box.left) / box.width, 0), 1) * d);
    },
    [d, onSeek],
  );

  const lanes = [
    {
      key: "product",
      label: "On screen",
      by: "SAM 3.1",
      Icon: ScanEye,
      h: 32,
      tone: "text-(--signal-ink)",
      empty: segments.length ? null : "Never counted",
    },
    ...(rejected.length
      ? [{ key: "reject", label: "Look-alike, not counted", by: "Muse Spark", Icon: ScanLine, h: 22, tone: "text-(--reject)", empty: null }]
      : []),
    {
      key: "voice",
      label: "Said aloud",
      by: "Voice Transcribe",
      Icon: Mic,
      h: 22,
      tone: "text-(--voice)",
      empty: mentions.length ? null : noAudio ? "Audio not analyzed in the preview" : "Not heard",
    },
  ];
  // Ticks plus the end of the video, dropping a tick that would crowd the end label.
  const endLabel = timecode(d);
  const ticks = rulerTicks(d, Math.max(3, Math.floor(widthPx / 60))).filter((t) => ((d - t) / d) * widthPx > 64);
  const fade = playing ? playheadSec : null;

  const lime = (s: Segment) =>
    fade === null || fade >= s.endSec ? (
      <div key={s.startSec} className="absolute inset-y-0 bg-(--signal)" style={span(s, 3)} />
    ) : fade <= s.startSec ? (
      <div key={s.startSec} className="absolute inset-y-0 bg-(--signal)/35" style={span(s, 3)} />
    ) : (
      <span key={s.startSec}>
        <div className="absolute inset-y-0 bg-(--signal)" style={span({ startSec: s.startSec, endSec: fade })} />
        <div className="absolute inset-y-0 bg-(--signal)/35" style={span({ startSec: fade, endSec: s.endSec })} />
      </span>
    );

  return (
    <div>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Video position"
        aria-valuemin={0}
        aria-valuemax={Math.round(d * 10) / 10}
        aria-valuenow={Math.round(playheadSec * 10) / 10}
        aria-valuetext={timecode(playheadSec)}
        aria-keyshortcuts="Space ArrowLeft ArrowRight Home End"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          seekFrom(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFrom(e.clientX);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={(e) => {
          const step = e.key === "PageUp" || e.key === "PageDown" ? 1 : e.shiftKey ? 1 / FPS : 0.5;
          if (e.key === "ArrowRight" || e.key === "PageUp") onSeek(Math.min(d, playheadSec + step));
          else if (e.key === "ArrowLeft" || e.key === "PageDown") onSeek(Math.max(0, playheadSec - step));
          else if (e.key === "Home") onSeek(0);
          else if (e.key === "End") onSeek(d);
          else if (e.key === " ") onToggle();
          else return;
          e.preventDefault();
        }}
        className="relative cursor-ew-resize touch-none rounded-[8px] pb-1 select-none"
      >
        {/* Ruler, ending on the video's length. The playhead's knob rides here, above the lanes. */}
        <div className="ed-tc relative text-[11px] text-(--ink-3)" style={{ height: RULER }} aria-hidden>
          {ticks.map((t, i) => (
            <span key={t} className={`absolute top-0 ${i === 0 ? "" : "-translate-x-1/2"}`} style={{ left: `${pct(t)}%` }}>
              {timecode(t).replace(/\.0$/, "")}
            </span>
          ))}
          <span className="absolute top-0 right-0 text-(--ink-2)">{endLabel}</span>
          <span
            className={`absolute bottom-0 size-3.5 -translate-x-1/2 rounded-full bg-(--ink) ring-2 ring-white ${dragging ? "" : "transition-[left] duration-75 ease-linear"}`}
            style={{ left: `${pct(playheadSec)}%` }}
          />
        </div>

        <div className="mt-1 flex flex-col gap-2">
          {lanes.map((l) => (
            <div key={l.key}>
              <span className="mb-1 flex h-[18px] items-center gap-1.5 text-[12.5px] font-semibold text-(--ink-2)">
                <l.Icon className={`size-3.5 shrink-0 ${l.tone}`} strokeWidth={2.25} aria-hidden />
                {l.label}
                <span className="font-medium text-(--ink-3)">· {l.by}</span>
              </span>
              <div className="relative overflow-hidden rounded-[7px] bg-(--wash) shadow-[inset_0_0_0_1px_var(--hair)]" style={{ height: l.h }}>
                {l.empty && (
                  <span className="absolute inset-y-0 right-2.5 z-10 flex items-center text-[12px] font-medium text-(--ink-3)" aria-hidden>
                    {l.empty}
                  </span>
                )}
                {l.key === "product" && (
                  <>
                    {segments.map(lime)}
                    {longest && <div className="absolute bottom-0 h-[4px] bg-(--signal-ink)" style={span(longest)} />}
                    {firstSeenSec !== null && (
                      <svg
                        className="absolute top-0 -translate-x-1/2"
                        style={{ left: `${pct(firstSeenSec)}%` }}
                        width="10"
                        height="7"
                        viewBox="0 0 10 7"
                        aria-hidden
                      >
                        <path d="M0 0h10L5 7z" fill="var(--ink)" />
                      </svg>
                    )}
                    {preview && <Window style={span(preview)} />}
                    {lit?.window && <Window style={span(lit.window)} />}
                  </>
                )}
                {l.key === "reject" &&
                  rejected.map((s) => (
                    <div
                      key={s.startSec}
                      title={`Muse Spark: look-alike ${timecode(s.startSec)}–${timecode(s.endSec)}, not counted`}
                      className="absolute inset-y-1 rounded-[4px] border-[1.5px] border-dashed border-(--reject) bg-[repeating-linear-gradient(135deg,rgb(194_57_43/0.2)_0_3px,transparent_3px_7px)]"
                      style={span(s, 4)}
                    />
                  ))}
                {l.key === "voice" &&
                  mentions.map((m) => (
                    <div
                      key={m.startSec}
                      title={`Voice Transcribe: “${m.text}” at ${timecode(m.startSec)}`}
                      aria-label={`Voice Transcribe heard “${m.text}” at ${timecode(m.startSec)}`}
                      className="absolute inset-y-1 rounded-[4px] bg-(--voice)"
                      style={span({ startSec: m.startSec, endSec: m.endSec }, 4)}
                    />
                  ))}
                {(lit?.tone === "voice" ? l.key === "voice" : l.key === "product") &&
                  lit?.segs.map((s) => (
                    <div
                      key={`${lit.key}-${s.startSec}`}
                      className={[
                        "ed-flash pointer-events-none absolute inset-y-0 rounded-[6px]",
                        lit.tone === "voice" ? "bg-(--voice)/25 shadow-[inset_0_0_0_2px_var(--voice)]" : "shadow-[inset_0_0_0_2px_var(--ink)]",
                      ].join(" ")}
                      style={span(s, 6)}
                    />
                  ))}
                {/* The playhead, clipped to each track. */}
                <div
                  className={`pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-(--ink) ${dragging ? "" : "transition-[left] duration-75 ease-linear"}`}
                  style={{ left: `${pct(playheadSec)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* What the marks mean, for this video only. Drawn swatches, readable on touch. */}
      {(firstSeenSec !== null || longest || lit?.window || preview) && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-(--ink-2)">
          {firstSeenSec !== null && (
            <li className="flex items-center gap-1.5">
              <svg width="10" height="7" viewBox="0 0 10 7" aria-hidden>
                <path d="M0 0h10L5 7z" fill="var(--ink)" />
              </svg>
              First seen <span className="ed-tc">{timecode(firstSeenSec)}</span>
            </li>
          )}
          {longest && (
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-1 w-4 rounded-full bg-(--signal-ink)" aria-hidden />
              Longest run {tenths(longest.endSec - longest.startSec)} s
            </li>
          )}
          {(lit?.window || preview) && (
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3.5 rounded-[3px] border-[1.5px] border-dashed border-(--ink-3)" aria-hidden />
              Term window
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function Window({ style }: { style: React.CSSProperties }) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 rounded-[6px] bg-[repeating-linear-gradient(135deg,rgb(20_19_15/0.08)_0_4px,transparent_4px_8px)] outline-[1.5px] -outline-offset-[1.5px] outline-(--ink-3) outline-dashed"
      style={style}
    />
  );
}

function rulerTicks(d: number, maxTicks: number): number[] {
  const step = [1, 2, 5, 10, 15, 30, 60].find((s) => d / s <= maxTicks) ?? 120;
  const out: number[] = [];
  for (let t = 0; t < d - step * 0.4; t += step) out.push(t);
  return out;
}

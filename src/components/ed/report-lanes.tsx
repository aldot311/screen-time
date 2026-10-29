"use client";

// The report's timeline: one full-width lane per signal, each named above its track. On screen (lime, counted seconds
// only, first-seen notch, longest run underlined), Look-alike (hatched red: seen, rejected, never counted; only when
// there was one) and Said aloud (violet mentions, or "Not heard" inside the lane). Tap or drag anywhere to scrub; arrow
// keys step a frame, Shift+arrow or PageUp/PageDown a second, Home/End the ends. The stretch a tapped proof plays is
// outlined while it plays (violet for a spoken mention) and cleared when playback stops.
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, ScanEye, ScanLine } from "lucide-react";
import type { Mention, Segment } from "@/lib/types";
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
  /** Hide the playhead until the viewer has played or scrubbed, so nothing reads as "0". */
  showPlayhead: boolean;
  lit: Lit | null;
  preview: Segment | null;
  firstSeenSec: number | null;
  longest: Segment | null;
  onSeek: (sec: number) => void;
  /** Preview reports have no audio: the voice lane says so instead of "Not heard". */
  noAudio?: boolean;
}

const RULER = 18;

export function ReportLanes({
  durationSec,
  segments,
  mentions,
  rejected,
  playheadSec,
  showPlayhead,
  lit,
  preview,
  firstSeenSec,
  longest,
  onSeek,
  noAudio = false,
}: Props) {
  const d = Math.max(durationSec, 0.001);
  const pct = (s: number) => (Math.min(Math.max(s, 0), d) / d) * 100;
  const span = (s: Segment, min = 0) => ({
    left: `${pct(s.startSec)}%`,
    width: `max(${min}px, ${pct(s.endSec) - pct(s.startSec)}%)`,
  });

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
      Icon: ScanEye,
      h: 32,
      tone: "text-(--signal-ink)",
      empty: segments.length ? null : "Never counted",
    },
    ...(rejected.length
      ? [
          {
            key: "reject",
            label: "Look-alike, not counted",
            Icon: ScanLine,
            h: 22,
            tone: "text-(--reject)",
            empty: null,
          },
        ]
      : []),
    {
      key: "voice",
      label: "Said aloud",
      Icon: Mic,
      h: 22,
      tone: "text-(--voice)",
      empty: mentions.length ? null : noAudio ? "Audio not analysed in the preview" : "Not heard",
    },
  ];
  const ticks = rulerTicks(d, Math.max(3, Math.floor(widthPx / 56)));
  const overlays = (laneKey: string) => (
    <>
      {laneKey === "product" && preview && <Window style={span(preview)} />}
      {laneKey === "product" && lit?.window && <Window style={span(lit.window)} />}
      {(lit?.tone === "voice" ? laneKey === "voice" : laneKey === "product") &&
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
    </>
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
          const step = e.shiftKey || e.key === "PageUp" || e.key === "PageDown" ? 1 : 1 / 15;
          if (e.key === "ArrowRight" || e.key === "PageUp") onSeek(Math.min(d, playheadSec + step));
          else if (e.key === "ArrowLeft" || e.key === "PageDown") onSeek(Math.max(0, playheadSec - step));
          else if (e.key === "Home") onSeek(0);
          else if (e.key === "End") onSeek(d);
          else return;
          e.preventDefault();
        }}
        className="relative cursor-ew-resize touch-none rounded-[8px] pb-1 select-none"
      >
        {/* Ruler */}
        <div className="ed-tc relative text-[11px] text-(--ink-3)" style={{ height: RULER }} aria-hidden>
          {ticks.map((t, i) => (
            <span key={t} className={`absolute top-0 ${i === 0 ? "" : "-translate-x-1/2"}`} style={{ left: `${pct(t)}%` }}>
              {timecode(t).replace(/\.0$/, "")}
            </span>
          ))}
        </div>

        <div className="mt-1 flex flex-col gap-2">
          {lanes.map((l) => (
            <div key={l.key}>
              <span className="mb-1 flex h-[18px] items-center gap-1.5 text-[12.5px] font-semibold text-(--ink-2)" aria-hidden>
                <l.Icon className={`size-3.5 shrink-0 ${l.tone}`} strokeWidth={2.25} />
                {l.label}
              </span>
              <div className="relative overflow-hidden rounded-[7px] bg-(--wash) shadow-[inset_0_0_0_1px_var(--hair)]" style={{ height: l.h }}>
                {l.empty && (
                  <span className="absolute inset-y-0 left-2.5 flex items-center text-[12px] font-medium text-(--ink-3)" aria-hidden>
                    {l.empty}
                  </span>
                )}
                {l.key === "product" && (
                  <>
                    {segments.map((s) => (
                      <div key={s.startSec} className="absolute inset-y-0 bg-(--signal)" style={span(s, 3)} />
                    ))}
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
                  </>
                )}
                {l.key === "reject" &&
                  rejected.map((s) => (
                    <div
                      key={s.startSec}
                      className="absolute inset-y-1 rounded-[4px] border-[1.5px] border-dashed border-(--reject) bg-[repeating-linear-gradient(135deg,rgb(194_57_43/0.2)_0_3px,transparent_3px_7px)]"
                      style={span(s, 4)}
                    />
                  ))}
                {l.key === "voice" &&
                  mentions.map((m) => (
                    <div
                      key={m.startSec}
                      className="absolute inset-y-1 rounded-[4px] bg-(--voice)"
                      style={span({ startSec: m.startSec, endSec: m.endSec }, 4)}
                    />
                  ))}
                {overlays(l.key)}
              </div>
            </div>
          ))}
        </div>

        {/* Playhead across every lane, with a large knob. */}
        {showPlayhead && (
          <div
            className={`pointer-events-none absolute bottom-0 w-0.5 -translate-x-1/2 bg-(--ink) ${dragging ? "" : "transition-[left] duration-75 ease-linear"}`}
            style={{ left: `${pct(playheadSec)}%`, top: RULER - 2 }}
          >
            <span className="absolute -top-1.5 left-1/2 size-3.5 -translate-x-1/2 rounded-full bg-(--ink) ring-2 ring-white" />
          </div>
        )}
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

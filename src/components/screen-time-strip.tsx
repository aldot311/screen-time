"use client";

// The highlighter strip: a time ruler where lime marks every second the product was on screen and violet
// ticks mark spoken mentions. Click or drag to seek; a contract term can draw its window on it.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Mention, Segment } from "@/lib/types";
import { timecode } from "./format";

interface Props {
  durationSec: number;
  segments: Segment[];
  mentions: Mention[];
  playheadSec?: number;
  /** A contract term's window (e.g. "first 5 s") or evidence to emphasise. */
  window?: Segment | null;
  evidence?: Segment[];
  onSeek?: (sec: number) => void;
  size?: "full" | "mini";
}

export function ScreenTimeStrip({
  durationSec,
  segments,
  mentions,
  playheadSec,
  window,
  evidence = [],
  onSeek,
  size = "full",
}: Props) {
  const track = useRef<HTMLDivElement>(null);
  const [widthPx, setWidthPx] = useState(800);

  // Fewer ruler labels on a narrow strip so they never collide.
  useEffect(() => {
    const el = track.current;
    if (!el || size === "mini") return;
    const ro = new ResizeObserver(([e]) => setWidthPx(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);
  const d = Math.max(durationSec, 0.001);
  const pct = (s: number) => `${(Math.min(Math.max(s, 0), d) / d) * 100}%`;
  const mini = size === "mini";

  const seekFrom = useCallback(
    (clientX: number) => {
      const el = track.current;
      if (!el || !onSeek) return;
      const box = el.getBoundingClientRect();
      onSeek(Math.min(Math.max((clientX - box.left) / box.width, 0), 1) * d);
    },
    [d, onSeek],
  );

  const ticks = mini ? [] : rulerTicks(d, Math.max(3, Math.floor(widthPx / 70)));

  return (
    <div className={mini ? "w-full" : "w-full select-none"}>
      <div
        ref={track}
        role={onSeek ? "slider" : "img"}
        aria-label={onSeek ? "Video position" : `On screen in ${segments.length} stretch${segments.length === 1 ? "" : "es"}`}
        aria-valuemin={onSeek ? 0 : undefined}
        aria-valuemax={onSeek ? Math.round(d * 10) / 10 : undefined}
        aria-valuenow={onSeek ? Math.round((playheadSec ?? 0) * 10) / 10 : undefined}
        aria-valuetext={onSeek ? timecode(playheadSec ?? 0) : undefined}
        tabIndex={onSeek ? 0 : undefined}
        onPointerDown={(e) => {
          if (!onSeek) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFrom(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) seekFrom(e.clientX);
        }}
        onKeyDown={(e) => {
          if (!onSeek) return;
          const step = e.shiftKey ? 1 : 1 / 15;
          if (e.key === "ArrowRight") onSeek(Math.min(d, (playheadSec ?? 0) + step));
          if (e.key === "ArrowLeft") onSeek(Math.max(0, (playheadSec ?? 0) - step));
        }}
        className={[
          "relative overflow-hidden rounded-[6px] bg-sunken",
          mini ? "h-2.5" : "h-11 cursor-ew-resize border border-line",
        ].join(" ")}
      >
        {window && (
          <div
            className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,rgb(14_17_22/0.07)_0_4px,transparent_4px_8px)] outline-1 outline-ink-3/40 outline-dashed"
            style={{ left: pct(window.startSec), width: `calc(${pct(window.endSec)} - ${pct(window.startSec)})` }}
          />
        )}
        {segments.map((s) => (
          <div
            key={`${s.startSec}-${s.endSec}`}
            className="absolute inset-y-0 bg-lime"
            style={{ left: pct(s.startSec), width: `max(2px, calc(${pct(s.endSec)} - ${pct(s.startSec)}))` }}
          />
        ))}
        {evidence.map((s) => (
          <div
            key={`ev-${s.startSec}-${s.endSec}`}
            className="absolute inset-y-0 shadow-[inset_0_0_0_2px_var(--ink)]"
            style={{ left: pct(s.startSec), width: `max(4px, calc(${pct(s.endSec)} - ${pct(s.startSec)}))` }}
          />
        ))}
        {mentions.map((m) => (
          <div
            key={`m-${m.startSec}`}
            title={`"${m.text}" at ${timecode(m.startSec)}`}
            className={mini ? "absolute inset-y-0 w-[3px] bg-violet" : "absolute bottom-0 h-1/2 w-[3px] rounded-t-sm bg-violet"}
            style={{ left: pct(m.startSec) }}
          />
        ))}
        {playheadSec !== undefined && !mini && (
          <div className="pointer-events-none absolute -top-px -bottom-px w-0.5 bg-ink" style={{ left: pct(playheadSec) }}>
            <div className="absolute -top-0.5 -left-[3px] size-2 rounded-full bg-ink" />
          </div>
        )}
      </div>
      {!mini && (
        <div className="relative mt-1.5 h-4 font-mono text-[11px] text-ink-3 tabular">
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 first:translate-x-0" style={{ left: pct(t) }}>
              {timecode(t).replace(/\.0$/, "")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Labels every 1, 2, 5, 10 or 30 s, at most maxTicks of them, so a short Reel and a long video both read well.
function rulerTicks(d: number, maxTicks: number): number[] {
  const step = [1, 2, 5, 10, 15, 30, 60].find((s) => d / s <= maxTicks) ?? 120;
  const out: number[] = [];
  for (let t = 0; t < d - step * 0.4; t += step) out.push(t);
  return out;
}

"use client";

// The screen-time strip: lime for every second the product was on screen, violet ticks for spoken mentions, dashed red
// for look-alikes that were seen but not counted. Tap or drag to seek. A focused contract term draws its window and
// flashes its evidence so a "Jump to" visibly lands.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Mention, Segment } from "@/lib/types";
import { timecode } from "@/components/format";

interface Props {
  durationSec: number;
  segments: Segment[];
  mentions: Mention[];
  rejected?: Segment[];
  playheadSec?: number;
  window?: Segment | null;
  evidence?: Segment[];
  /** Changes on every jump so the evidence flash replays even for the same term. */
  flashKey?: number;
  longest?: Segment | null;
  onSeek?: (sec: number) => void;
  size?: "full" | "compact" | "mini";
  /** Draw only what has played so far (the landing replay). */
  fillTo?: number;
  ruler?: boolean;
  /** Spoken-mention evidence lights violet, everything else ink. */
  evidenceTone?: "ink" | "voice";
  /** While playing: seconds before this are full lime, after it faded, so the fill grows with playback. */
  progress?: number | null;
}

export function Strip({
  durationSec,
  segments,
  mentions,
  rejected = [],
  playheadSec,
  window: win = null,
  evidence = [],
  flashKey = 0,
  longest = null,
  onSeek,
  size = "full",
  fillTo,
  ruler = size === "full",
  evidenceTone = "ink",
  progress = null,
}: Props) {
  const track = useRef<HTMLDivElement>(null);
  const [widthPx, setWidthPx] = useState(360);
  const d = Math.max(durationSec, 0.001);
  const pct = (s: number) => `${(Math.min(Math.max(s, 0), d) / d) * 100}%`;
  const span = (a: number, b: number, min = 2) => ({
    left: pct(a),
    width: `max(${min}px, calc(${pct(b)} - ${pct(a)}))`,
  });

  useEffect(() => {
    const el = track.current;
    if (!el || !ruler) return;
    const ro = new ResizeObserver(([e]) => setWidthPx(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ruler]);

  const seekFrom = useCallback(
    (clientX: number) => {
      const el = track.current;
      if (!el || !onSeek) return;
      const box = el.getBoundingClientRect();
      onSeek(Math.min(Math.max((clientX - box.left) / box.width, 0), 1) * d);
    },
    [d, onSeek],
  );

  let segs = segments;
  let ments = mentions;
  let rej = rejected;
  if (fillTo !== undefined) {
    segs = segs.filter((s) => s.startSec < fillTo).map((s) => ({ ...s, endSec: Math.min(s.endSec, fillTo) }));
    ments = ments.filter((m) => m.startSec <= fillTo);
    rej = rej.filter((s) => s.startSec < fillTo).map((s) => ({ ...s, endSec: Math.min(s.endSec, fillTo) }));
  }

  const height = { full: "h-12", compact: "h-9", mini: "h-2" }[size];
  const ticks = ruler ? rulerTicks(d, Math.max(3, Math.floor(widthPx / 64))) : [];
  const interactive = Boolean(onSeek);

  return (
    <div className="w-full select-none">
      {/* The tap target is at least 44 px tall even when the drawn strip is thinner. */}
      <div
        role={interactive ? "slider" : "img"}
        aria-label={interactive ? "Video position" : `Product on screen in ${segs.length} stretch${segs.length === 1 ? "" : "es"}`}
        aria-valuemin={interactive ? 0 : undefined}
        aria-valuemax={interactive ? Math.round(d * 10) / 10 : undefined}
        aria-valuenow={interactive ? Math.round((playheadSec ?? 0) * 10) / 10 : undefined}
        aria-valuetext={interactive ? timecode(playheadSec ?? 0) : undefined}
        tabIndex={interactive ? 0 : undefined}
        onPointerDown={(e) => {
          if (!interactive) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFrom(e.clientX);
        }}
        onPointerMove={(e) => {
          if (interactive && e.buttons === 1) seekFrom(e.clientX);
        }}
        onKeyDown={(e) => {
          if (!onSeek) return;
          const step = e.shiftKey || e.key === "PageUp" || e.key === "PageDown" ? 1 : 1 / 15;
          const at = playheadSec ?? 0;
          if (e.key === "ArrowRight" || e.key === "PageUp") onSeek(Math.min(d, at + step));
          else if (e.key === "ArrowLeft" || e.key === "PageDown") onSeek(Math.max(0, at - step));
          else if (e.key === "Home") onSeek(0);
          else if (e.key === "End") onSeek(d);
          else return;
          e.preventDefault();
        }}
        className={interactive ? `cursor-ew-resize touch-none rounded-[10px] ${size === "full" ? "" : "py-1"}` : undefined}
      >
        <div
          ref={track}
          className={[
            "relative w-full overflow-hidden bg-(--wash)",
            size === "mini" ? "rounded-full" : "rounded-[10px] shadow-[inset_0_0_0_1px_var(--hair)]",
            height,
          ].join(" ")}
        >
          {win && (
            <div
              className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,rgb(20_19_15/0.08)_0_4px,transparent_4px_8px)] outline-[1.5px] -outline-offset-[1.5px] outline-(--ink-3) outline-dashed"
              style={span(win.startSec, win.endSec)}
            />
          )}
          {rej.map((s) => (
            <div
              key={`r-${s.startSec}`}
              title={`Look-alike on screen ${timecode(s.startSec)}–${timecode(s.endSec)}, not counted`}
              className={[
                "absolute",
                // At row and dock scale a dashed outline reads as garbled text: draw a solid hatched red band instead.
                size === "full"
                  ? "inset-y-1.5 rounded-[3px] border-[1.5px] border-dashed border-(--reject) bg-[repeating-linear-gradient(135deg,rgb(194_57_43/0.14)_0_3px,transparent_3px_7px)]"
                  : size === "compact"
                    ? "inset-y-2 rounded-[3px] bg-[repeating-linear-gradient(135deg,rgb(194_57_43/0.55)_0_2px,rgb(194_57_43/0.18)_2px_5px)]"
                    : "inset-y-0 bg-[repeating-linear-gradient(135deg,rgb(194_57_43/0.7)_0_2px,rgb(194_57_43/0.3)_2px_4px)]",
              ].join(" ")}
              style={span(s.startSec, s.endSec, 3)}
            />
          ))}
          {segs.map((s) =>
            progress === null || progress >= s.endSec ? (
              <div key={s.startSec} className="absolute inset-y-0 bg-(--signal)" style={span(s.startSec, s.endSec)} />
            ) : progress <= s.startSec ? (
              <div key={s.startSec} className="absolute inset-y-0 bg-(--signal)/35" style={span(s.startSec, s.endSec)} />
            ) : (
              <span key={s.startSec}>
                <div className="absolute inset-y-0 bg-(--signal)" style={span(s.startSec, progress, 0)} />
                <div className="absolute inset-y-0 bg-(--signal)/35" style={span(progress, s.endSec, 0)} />
              </span>
            ),
          )}
          {evidence.map((s) => (
            <div
              key={`ev-${flashKey}-${s.startSec}-${s.endSec}`}
              className={
                size === "full"
                  ? evidenceTone === "voice"
                    ? "ed-flash absolute inset-y-0 rounded-[3px] bg-(--voice)/35 shadow-[inset_0_0_0_2px_var(--voice)]"
                    : "ed-flash absolute inset-y-0 rounded-[3px] shadow-[inset_0_0_0_2px_var(--ink)]"
                  : // In the dock: a bar along the bottom edge, not an outline.
                    `absolute bottom-0 h-[5px] rounded-full ${evidenceTone === "voice" ? "bg-(--voice)" : "bg-(--signal-ink)"}`
              }
              style={span(s.startSec, s.endSec, 6)}
            />
          ))}
          {longest && size === "full" && (
            <div
              title="Longest continuous run"
              className="absolute bottom-0 h-[3px] bg-(--signal-ink)"
              style={span(longest.startSec, longest.endSec)}
            />
          )}
          {ments.map((m) => (
            <div
              key={`m-${m.startSec}`}
              title={`Voice Transcribe: "${m.text}" at ${timecode(m.startSec)}`}
              className={size === "mini" ? "absolute inset-y-0 w-[3px] bg-(--voice)" : "absolute bottom-0 h-3/5 w-[3px] rounded-t-[2px] bg-(--voice)"}
              style={{ left: pct(m.startSec) }}
            />
          ))}
          {playheadSec !== undefined && size !== "mini" && (
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-(--ink) transition-[left] duration-75 ease-linear"
              style={{ left: pct(playheadSec) }}
            >
              <span className="absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-(--ink) ring-2 ring-white" />
            </div>
          )}
        </div>
      </div>
      {ruler && (
        <div className="ed-tc relative mt-1.5 h-4 text-[11px] text-(--ink-3)" aria-hidden>
          {ticks.map((t, i) => (
            <span key={t} className={`absolute ${i === 0 ? "" : "-translate-x-1/2"}`} style={{ left: pct(t) }}>
              {timecode(t).replace(/\.0$/, "")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function rulerTicks(d: number, maxTicks: number): number[] {
  const step = [1, 2, 5, 10, 15, 30, 60].find((s) => d / s <= maxTicks) ?? 120;
  const out: number[] = [];
  for (let t = 0; t < d - step * 0.4; t += step) out.push(t);
  return out;
}

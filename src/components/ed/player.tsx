"use client";

// 9:16 player that draws SAM's boxes on the frame being shown: solid lime for the counted product, dashed red for a
// rejected look-alike. Own controls (44 px targets), tap-to-play, and a docked mode: the same <video> element moves
// into a floating frosted dock so playback never restarts when the page scrolls it away.
//
// First paint is never black: the stored still is the poster (and a blurred copy fills any letterbox) until the video
// has decoded a frame. The still is a different moment than frame 0, so boxes are drawn only over real video frames.
// Rejected boxes SAM was unsure of (confidence under 0.5) and specks under 0.1% of the frame are not drawn: they drift.
// Labels are laid out so the counted and rejected tags never overlap each other, never leave the frame, and the paused
// play glyph moves off any label.
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { FPS, type Box, type VerifyVerdict } from "@/lib/types";
import { timecode } from "@/components/format";

export interface OverlayBox {
  frame: number;
  objectId: number;
  box: Box;
  verdict: VerifyVerdict;
  /** SAM's confidence for this box, when the run recorded it. */
  confidence?: number;
}

export interface PlayerHandle {
  seek: (sec: number) => void;
  /** Seek and play; optionally pause again at `stopAt` (the end of a stretch of evidence). */
  playFrom: (sec: number, stopAt?: number) => void;
  toggle: () => void;
}

interface Props {
  src: string;
  width: number;
  height: number;
  boxes: OverlayBox[];
  onTime?: (sec: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  /** Muted, looping, autoplaying: the landing replay. */
  ambient?: boolean;
  docked?: boolean;
  onDockedTap?: () => void;
  durationSec: number;
  rounded?: string;
  /** A still shown until the first frame plays. Boxes are never drawn over it. */
  poster?: string;
  /** Preview reports know when, not where: they pass false and no boxes are drawn. */
  showBoxes?: boolean;
  /** Where the video sits while docked (fixed position, size, radius). */
  dockClassName?: string;
}

const DEFAULT_DOCK =
  "fixed bottom-[calc(env(safe-area-inset-bottom)+22px)] left-[22px] z-50 aspect-[9/16] w-[58px] overflow-hidden rounded-[10px] shadow-(--sh-2)";

const LABEL_H = 20;
const GLYPH = 64;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const hit = (a: Rect, b: Rect, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

export const Player = forwardRef<PlayerHandle, Props>(function Player(
  {
    src,
    width,
    height,
    boxes,
    onTime,
    onPlayingChange,
    ambient = false,
    docked = false,
    onDockedTap,
    durationSec,
    rounded = "rounded-[22px]",
    poster,
    showBoxes = true,
    dockClassName = DEFAULT_DOCK,
  },
  ref,
) {
  const video = useRef<HTMLVideoElement>(null);
  const frameBox = useRef<HTMLDivElement>(null);
  const stopAt = useRef<number | null>(null);
  // A stop point only counts once the jump to the new start has landed; otherwise a stale frame from before the jump
  // (past the new end) would stop playback at once.
  const stopArmed = useRef(false);
  const [frame, setFrame] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(ambient);
  const [muted, setMuted] = useState(ambient);
  // The video shows its own pixels (not the poster) once it has played or been seeked.
  const [framed, setFramed] = useState(ambient);
  const [loaded, setLoaded] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useImperativeHandle(ref, () => ({
    seek(sec) {
      const v = video.current;
      if (!v) return;
      stopAt.current = null;
      v.pause();
      v.currentTime = Math.max(0, Math.floor(sec * FPS) + 0.5) / FPS;
    },
    playFrom(sec, end) {
      const v = video.current;
      if (!v) return;
      v.currentTime = Math.max(0, Math.floor(sec * FPS) + 0.5) / FPS;
      stopAt.current = end !== undefined && end < durationSec - 0.05 ? end : null;
      stopArmed.current = false;
      void v.play().catch(() => {
        // Autoplay with sound refused: play muted rather than show nothing.
        v.muted = true;
        setMuted(true);
        void v.play().catch(() => undefined);
      });
    },
    toggle() {
      const v = video.current;
      if (!v) return;
      stopAt.current = null;
      if (v.paused) void v.play().catch(() => undefined);
      else v.pause();
    },
  }));

  const byFrame = useMemo(() => {
    const m = new Map<number, OverlayBox[]>();
    for (const b of boxes) m.set(b.frame, [...(m.get(b.frame) ?? []), b]);
    return m;
  }, [boxes]);

  // The frame's on-screen size, so labels can be laid out in pixels.
  useEffect(() => {
    const el = frameBox.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Follow decoded frames (not the 4 Hz timeupdate) so boxes stay glued to the product.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let handle = 0;
    let raf = 0;
    const report = (sec: number) => {
      let t = sec;
      if (stopAt.current !== null && stopArmed.current && t >= stopAt.current) {
        // Stop exactly at the end of the stretch, not a frame or two past it.
        const end = stopAt.current;
        stopAt.current = null;
        v.pause();
        v.currentTime = end;
        t = end;
      }
      setFrame(Math.floor(t * FPS + 1e-6));
      setTime(t);
      onTime?.(t);
    };
    const hasRvfc = typeof (v as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback === "function";
    const tick = (_now: number, meta?: { mediaTime: number }) => {
      report(meta?.mediaTime ?? v.currentTime);
      handle = v.requestVideoFrameCallback(tick);
    };
    if (hasRvfc) handle = v.requestVideoFrameCallback(tick);
    else {
      const loop = () => {
        report(v.currentTime);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    const onSeeked = () => {
      stopArmed.current = true;
      setFramed(true);
      report(v.currentTime);
    };
    const onPlay = () => {
      setFramed(true);
      setPlaying(true);
      onPlayingChange?.(true);
    };
    const onPause = () => {
      setPlaying(false);
      onPlayingChange?.(false);
    };
    // A decoded frame is on screen: drop the poster and draw that frame's boxes.
    const onLoaded = () => {
      setLoaded(true);
      setFramed(true);
    };
    if (v.readyState >= 2) onLoaded();
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("loadeddata", onLoaded);
    v.addEventListener("ended", onPause);
    return () => {
      if (hasRvfc) v.cancelVideoFrameCallback(handle);
      cancelAnimationFrame(raf);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("loadeddata", onLoaded);
      v.removeEventListener("ended", onPause);
    };
  }, [onTime, onPlayingChange]);

  const current = useMemo(
    () =>
      framed && showBoxes
        ? (byFrame.get(frame) ?? []).filter(
            (b) =>
              ((b.box.x2 - b.box.x1 + 1) * (b.box.y2 - b.box.y1 + 1)) / (width * height) >= 0.001 &&
              (b.verdict === "match" || b.confidence === undefined || b.confidence >= 0.5),
          )
        : [],
    [framed, showBoxes, byFrame, frame, width, height],
  );
  const wide = width / height >= 9 / 16;
  const showGlyph = !ambient && !playing && !docked;
  const layout = useMemo(() => layoutLabels(current, width, height, size, ambient, showGlyph), [current, width, height, size, ambient, showGlyph]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    stopAt.current = null;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  };

  return (
    <div className="relative aspect-[9/16] w-full">
      <div
        className={[
          docked ? `ed-dock-in ${dockClassName}` : `absolute inset-0 overflow-hidden shadow-(--sh-3) ${rounded}`,
          poster || loaded ? "bg-(--ink)" : "ed-skel",
        ].join(" ")}
      >
        {poster && (
          // A blurred copy of the still fills any letterbox, so the frame never reads as an empty black box.
          // eslint-disable-next-line @next/next/no-img-element -- a stored still, already a small JPEG
          <img src={poster} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-70 blur-xl" />
        )}
        <video
          ref={video}
          src={src}
          poster={loaded ? undefined : poster}
          className="absolute inset-0 size-full object-contain"
          autoPlay={ambient}
          muted={muted}
          loop={ambient}
          playsInline
          preload="auto"
          aria-label={ambient ? "Creator video replay with tracking boxes" : "Creator video with tracking boxes"}
        />
        <div
          ref={frameBox}
          className="pointer-events-none absolute top-1/2 left-1/2 max-h-full max-w-full -translate-x-1/2 -translate-y-1/2"
          style={{
            aspectRatio: `${width} / ${height}`,
            width: wide ? "100%" : "auto",
            height: wide ? "auto" : "100%",
          }}
        >
          {current.map((b) => {
            const match = b.verdict === "match";
            return (
              <div
                key={b.objectId}
                className={[
                  "absolute",
                  docked ? "rounded-[3px]" : "rounded-[6px]",
                  match
                    ? `${docked ? "border-[1.5px]" : "border-[2.5px]"} border-(--signal) shadow-[0_0_0_1px_rgb(20_19_15/0.35),0_6px_18px_-6px_rgb(197_240_58/0.55)]`
                    : `${docked ? "border" : "border-2"} border-dashed border-(--reject)`,
                ].join(" ")}
                style={{
                  left: `${(b.box.x1 / width) * 100}%`,
                  top: `${(b.box.y1 / height) * 100}%`,
                  width: `${((b.box.x2 - b.box.x1 + 1) / width) * 100}%`,
                  height: `${((b.box.y2 - b.box.y1 + 1) / height) * 100}%`,
                }}
              />
            );
          })}
          {!docked &&
            layout.labels.map((l) => (
              <span
                key={`label-${l.objectId}`}
                className={[
                  "absolute rounded-full px-2 text-[11px] leading-5 font-semibold whitespace-nowrap shadow-(--sh-1)",
                  l.match ? "bg-(--signal) text-(--signal-ink)" : "bg-(--reject) text-white",
                ].join(" ")}
                style={{ left: l.x, top: l.y, height: LABEL_H }}
              >
                {l.text}
              </span>
            ))}
        </div>

        {docked ? (
          <button type="button" onClick={onDockedTap} className="ed-press absolute inset-0 size-full" aria-label="Show the full player" />
        ) : (
          <>
            {!ambient && (
              <button type="button" onClick={toggle} className="absolute inset-0 size-full cursor-pointer" aria-label={playing ? "Pause" : "Play"} />
            )}
            {showGlyph && layout.glyph && (
              <span
                className="ed-glass-dark pointer-events-none absolute grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white shadow-(--sh-2) transition-[top] duration-200"
                style={{ left: "50%", top: layout.glyph.top }}
              >
                <Play className="ml-1 size-7" fill="currentColor" strokeWidth={0} aria-hidden />
              </span>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
              <span className="ed-glass-dark ed-tc rounded-full px-2.5 py-1 text-[12px] whitespace-nowrap text-white">
                {timecode(time)}
                {!ambient && size.w >= 200 && <span className="text-white/60"> / {timecode(durationSec)}</span>}
              </span>
              <span className="pointer-events-auto flex gap-2">
                {ambient ? (
                  <button
                    type="button"
                    onClick={toggle}
                    className="ed-press ed-glass-dark grid size-11 place-items-center rounded-full text-white active:bg-black/60"
                    aria-label={playing ? "Pause replay" : "Play replay"}
                  >
                    {playing ? (
                      <Pause className="size-4" fill="currentColor" strokeWidth={0} />
                    ) : (
                      <Play className="ml-0.5 size-4" fill="currentColor" strokeWidth={0} />
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const v = video.current;
                      if (!v) return;
                      v.muted = !muted;
                      setMuted(!muted);
                    }}
                    className="ed-press ed-glass-dark grid size-11 place-items-center rounded-full text-white active:bg-black/60"
                    aria-label={muted ? "Turn sound on" : "Mute"}
                    aria-pressed={!muted}
                  >
                    {muted ? <VolumeX className="size-[18px]" strokeWidth={2.25} /> : <Volume2 className="size-[18px]" strokeWidth={2.25} />}
                  </button>
                )}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

interface PlacedLabel {
  objectId: number;
  match: boolean;
  text: string;
  x: number;
  y: number;
}

/**
 * Places one tag per box, counted first: above the box, then below, then inside its top edge, left- or right-aligned,
 * always clamped inside the frame and never on top of another tag. Then finds a spot for the paused play glyph on the
 * vertical centre line that covers no tag (centre, lower, upper), or hides it: the whole frame is still the play button.
 */
function layoutLabels(
  current: OverlayBox[],
  width: number,
  height: number,
  size: { w: number; h: number },
  ambient: boolean,
  withGlyph: boolean,
): { labels: PlacedLabel[]; glyph: { top: string } | null } {
  const { w: W, h: H } = size;
  if (!W || !H) return { labels: [], glyph: withGlyph ? { top: "50%" } : null };
  const sx = W / width;
  const sy = H / height;
  const pad = 4;
  const order = [...current].sort((a, b) => Number(b.verdict === "match") - Number(a.verdict === "match"));
  const boxRects = order.map((b) => ({
    x: b.box.x1 * sx,
    y: b.box.y1 * sy,
    w: (b.box.x2 - b.box.x1 + 1) * sx,
    h: (b.box.y2 - b.box.y1 + 1) * sy,
  }));
  const placed: (Rect & PlacedLabel)[] = [];

  order.forEach((b, i) => {
    const match = b.verdict === "match";
    let text = match ? "Counted" : ambient ? "Not counted" : b.verdict === "lookalike" ? "Look-alike · not counted" : "Unclear · not counted";
    if (!match && W < 220) text = "Not counted";
    const w = Math.min(W - pad * 2, text.length * 6.3 + 18);
    const r = boxRects[i];
    const clampX = (x: number) => Math.min(Math.max(x, pad), W - w - pad);
    const ys = [r.y - LABEL_H - 4, r.y + r.h + 4, r.y + 4];
    const xs = [clampX(r.x - 2), clampX(r.x + r.w - w + 2)];
    let best: Rect | null = null;
    let bestScore = Infinity;
    for (const y of ys) {
      for (const x of xs) {
        const c = { x, y, w, h: LABEL_H };
        if (y < pad || y + LABEL_H > H - pad) continue;
        let score = 0;
        if (placed.some((p) => hit(p, c, 4))) score += 1000;
        boxRects.forEach((o, j) => {
          if (j !== i && hit(o, c)) score += 10;
        });
        if (score < bestScore) {
          best = c;
          bestScore = score;
        }
      }
    }
    if (!best)
      best = {
        x: xs[0],
        y: Math.min(Math.max(r.y + 4, pad), H - LABEL_H - pad),
        w,
        h: LABEL_H,
      };
    // Still colliding: stack it under the tag it hits.
    while (placed.some((p) => hit(p, best!, 2)) && best.y + LABEL_H * 2 + 6 < H - pad) best = { ...best, y: best.y + LABEL_H + 4 };
    placed.push({ ...best, objectId: b.objectId, match, text });
  });

  let glyph: { top: string } | null = null;
  if (withGlyph) {
    for (const fy of [0.5, 0.68, 0.32, 0.8, 0.2]) {
      const c = {
        x: W / 2 - GLYPH / 2,
        y: fy * H - GLYPH / 2,
        w: GLYPH,
        h: GLYPH,
      };
      if (!placed.some((p) => hit(p, c, 6))) {
        glyph = { top: `${fy * 100}%` };
        break;
      }
    }
  }
  return {
    labels: placed.map(({ objectId, match, text, x, y }) => ({
      objectId,
      match,
      text,
      x,
      y,
    })),
    glyph,
  };
}

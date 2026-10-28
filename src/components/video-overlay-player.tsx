"use client";

// A 9:16 player that draws SAM's boxes over the frame being shown: lime for the brand's product,
// dashed red for a look-alike the verifier rejected.
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { FPS, type Box, type VerifyVerdict } from "@/lib/types";

export interface OverlayBox {
  frame: number;
  objectId: number;
  box: Box;
  verdict: VerifyVerdict;
}

export interface PlayerHandle {
  seek: (sec: number) => void;
  play: () => void;
}

interface Props {
  src: string;
  width: number; // source pixels the boxes are in
  height: number;
  boxes: OverlayBox[];
  onTime?: (sec: number) => void;
  showBoxes?: boolean;
}

export const VideoOverlayPlayer = forwardRef<PlayerHandle, Props>(function VideoOverlayPlayer(
  { src, width, height, boxes, onTime, showBoxes = true },
  ref,
) {
  const video = useRef<HTMLVideoElement>(null);
  const [frame, setFrame] = useState(0);

  useImperativeHandle(ref, () => ({
    seek(sec) {
      const v = video.current;
      if (!v) return;
      v.pause();
      // Aim for the middle of the frame so the browser shows exactly that frame.
      v.currentTime = Math.max(0, Math.floor(sec * FPS) + 0.5) / FPS;
    },
    play() {
      void video.current?.play();
    },
  }));

  const byFrame = useMemo(() => {
    const m = new Map<number, OverlayBox[]>();
    for (const b of boxes) m.set(b.frame, [...(m.get(b.frame) ?? []), b]);
    return m;
  }, [boxes]);

  // Follow the decoded frame, not the 4 Hz timeupdate event, so boxes stay glued to the product.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let handle = 0;
    let raf = 0;
    const report = (t: number) => {
      setFrame(Math.floor(t * FPS + 1e-6));
      onTime?.(t);
    };
    // Older Safari lacks requestVideoFrameCallback; fall back to animation frames there.
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
    const onSeeked = () => report(v.currentTime);
    v.addEventListener("seeked", onSeeked);
    return () => {
      if (hasRvfc) v.cancelVideoFrameCallback(handle);
      cancelAnimationFrame(raf);
      v.removeEventListener("seeked", onSeeked);
    };
  }, [onTime]);

  const current = showBoxes ? (byFrame.get(frame) ?? []) : [];

  return (
    <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[10px] bg-ink shadow-2">
      <video
        ref={video}
        src={src}
        className="absolute inset-0 size-full object-contain"
        controls
        playsInline
        preload="metadata"
      />
      {/* The video is letterboxed inside the 9:16 box; the overlay uses the same aspect so boxes line up. */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 max-h-full max-w-full -translate-x-1/2 -translate-y-1/2"
        style={{ aspectRatio: `${width} / ${height}`, width: width / height >= 9 / 16 ? "100%" : "auto", height: width / height >= 9 / 16 ? "auto" : "100%" }}
      >
        {current.map((b) => {
          const match = b.verdict === "match";
          return (
            <div
              key={b.objectId}
              className={[
                "absolute rounded-[3px]",
                match ? "border-2 border-lime shadow-[0_0_0_1px_rgb(14_17_22/0.35)]" : "border-2 border-dashed border-fail",
              ].join(" ")}
              style={{
                left: `${(b.box.x1 / width) * 100}%`,
                top: `${(b.box.y1 / height) * 100}%`,
                width: `${((b.box.x2 - b.box.x1 + 1) / width) * 100}%`,
                height: `${((b.box.y2 - b.box.y1 + 1) / height) * 100}%`,
              }}
            >
              <span
                className={[
                  "absolute -top-5 left-[-2px] whitespace-nowrap rounded-[3px] px-1.5 py-px text-[11px] font-medium leading-4",
                  match ? "bg-lime text-lime-ink" : "bg-fail text-white",
                ].join(" ")}
              >
                {match ? "Brand product" : b.verdict === "lookalike" ? "Look-alike, not counted" : "Unclear, not counted"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
